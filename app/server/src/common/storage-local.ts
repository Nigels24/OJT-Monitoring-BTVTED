import { createReadStream, existsSync, mkdirSync, ReadStream } from 'fs';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import * as path from 'path';
import { signFileToken } from './file-token';

/**
 * The local storage driver: uploaded files live in a folder on the host
 * computer (`STORAGE_DIR`) instead of a Supabase bucket. See CLAUDE.md §20.
 *
 * Object paths are the same ones the Supabase driver uses
 * (`<prefix>/<studentId>/<uuid>.<ext>`), so a bucket copied down with
 * `npm run storage:pull` is immediately usable and no database row changes.
 */

/**
 * `app/server`, wherever this file is running from — `src/common` under
 * tsx/jest, `dist/src/common` once built. Found by walking up to the first
 * `package.json` rather than trusting the working directory, which depends on
 * how the server was started (PM2, Task Scheduler, a shortcut).
 */
export function serverRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Where files are kept. Defaults to `app/server/storage`, which is not inside
 * any folder either app serves statically — the only way to a file is a
 * signed URL. A relative `STORAGE_DIR` is taken from `app/server`.
 */
export function storageDir(): string {
  const configured = process.env.STORAGE_DIR?.trim();
  return configured
    ? path.resolve(serverRoot(), configured)
    : path.join(serverRoot(), 'storage');
}

/** Creates the storage folder. Called once at startup, and before a write. */
export function ensureStorageDir(): string {
  const dir = storageDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export class UnsafeStoragePathError extends Error {
  constructor(objectPath: string) {
    super(
      `Refusing a storage path outside the storage folder: "${objectPath}"`,
    );
  }
}

/**
 * Turns an object path into a file path that is **guaranteed to be inside
 * `root`**, or throws. This is the one path-traversal guard: every read,
 * write and delete of the local driver goes through it.
 *
 * It resolves the path and then checks where it landed, rather than trying
 * to spot bad input — `..`, an absolute path, a drive letter or a backslash
 * all fail the same final check. A few shapes are refused outright first
 * because no real object path ever has them.
 */
export function resolveInside(root: string, objectPath: string): string {
  if (
    !objectPath ||
    objectPath.includes('\0') ||
    objectPath.includes('\\') ||
    path.isAbsolute(objectPath) ||
    path.win32.isAbsolute(objectPath) ||
    objectPath.split('/').some((part) => part === '..' || part === '.')
  ) {
    throw new UnsafeStoragePathError(objectPath);
  }
  const base = path.resolve(root);
  const resolved = path.resolve(base, objectPath);
  if (!resolved.startsWith(base + path.sep)) {
    throw new UnsafeStoragePathError(objectPath);
  }
  return resolved;
}

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

/**
 * The type a stored file is served as, from its extension. That extension
 * was chosen by the server from the file's magic bytes at upload
 * (`file-upload.ts`), never taken from the client — so it can be trusted
 * here. Anything else is served as an opaque download.
 */
export function contentTypeFor(objectPath: string): string {
  return (
    CONTENT_TYPES[path.extname(objectPath).toLowerCase()] ??
    'application/octet-stream'
  );
}

let warnedAboutSecret = false;

/**
 * The key file URLs are signed with: `FILE_URL_SECRET`, else `JWT_SECRET`.
 * Sharing the JWT secret works but means rotating one rotates the other, so
 * the fallback is announced once.
 */
export function fileUrlSecret(): string {
  const own = process.env.FILE_URL_SECRET?.trim();
  if (own) return own;
  const fallback = process.env.JWT_SECRET?.trim();
  if (!fallback) {
    throw new Error(
      'FILE_URL_SECRET (or JWT_SECRET) is not set. Add it to app/server/.env.',
    );
  }
  if (!warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn(
      '[storage] FILE_URL_SECRET is not set — file links are being signed with JWT_SECRET. Set FILE_URL_SECRET in app/server/.env to give them their own key.',
    );
  }
  return fallback;
}

/**
 * What a signed file URL starts with. Relative by default: browsers reach the
 * API through the website's own address (`/api/...`, CLAUDE.md §20), so no
 * host or IP is ever written into a link.
 */
function fileUrlBase(): string {
  return (process.env.FILE_URL_BASE?.trim() || '/api').replace(/\/+$/, '');
}

export async function localUpload(path_: string, buffer: Buffer) {
  const target = resolveInside(ensureStorageDir(), path_);
  await mkdir(path.dirname(target), { recursive: true });
  // `wx`: fail rather than overwrite, like the bucket's `upsert: false`.
  await writeFile(target, buffer, { flag: 'wx' });
}

export async function localSignedUrl(
  objectPath: string,
  expiresInSeconds: number,
  downloadName?: string,
): Promise<string> {
  const target = resolveInside(storageDir(), objectPath);
  // A link to a file that is not there is refused here, as the bucket
  // refuses one — the caller shows "unavailable" instead of a dead link.
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) {
    throw new Error(`Stored file not found: ${objectPath}`);
  }
  const token = signFileToken(
    {
      path: objectPath,
      expiresAt: Math.floor(Date.now() / 1000) + expiresInSeconds,
      downloadName,
    },
    fileUrlSecret(),
  );
  return `${fileUrlBase()}/files/${token}`;
}

export async function localDelete(objectPath: string): Promise<void> {
  const target = resolveInside(storageDir(), objectPath);
  try {
    await unlink(target);
  } catch (err) {
    // Already gone is the outcome that was asked for.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/** Opens a stored file for the `/files/:token` route; `null` if it is not there. */
export async function openLocalFile(
  objectPath: string,
): Promise<{ stream: ReadStream; size: number } | null> {
  let target: string;
  try {
    target = resolveInside(storageDir(), objectPath);
  } catch {
    return null;
  }
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) return null;
  return { stream: createReadStream(target), size: info.size };
}

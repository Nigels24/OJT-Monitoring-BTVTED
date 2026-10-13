import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import * as path from 'path';
import { serverRoot } from '../src/common/storage-local';

/** What `backup.ts` and `restore.ts` share. */

/** The folder inside one backup that holds the database dump. */
export const DUMP_FILE = 'database.dump';
/** The folder inside one backup that holds the copy of STORAGE_DIR. */
export const STORAGE_FOLDER = 'storage';

/** `BACKUP_DIR`, required — there is no safe default for "the external drive". */
export function backupDir(): string {
  const configured = process.env.BACKUP_DIR?.trim();
  if (!configured) {
    throw new Error(
      'BACKUP_DIR is not set. Put the folder to back up into (for example the external drive, E:\\ojt-backups) in app/server/.env.',
    );
  }
  return path.resolve(serverRoot(), configured);
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is not set in app/server/.env.');
  return url;
}

/**
 * `pg_dump` / `pg_restore` — from `PG_BIN_DIR` when set, else from PATH.
 * On Windows the installer does not add PostgreSQL's `bin` folder to PATH, so
 * `PG_BIN_DIR` is usually needed there.
 */
export function pgTool(name: 'pg_dump' | 'pg_restore'): string {
  const dir = process.env.PG_BIN_DIR?.trim();
  if (!dir) return name;
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const full = path.join(dir, exe);
  if (!existsSync(full)) {
    throw new Error(`${exe} was not found in PG_BIN_DIR (${dir}).`);
  }
  return full;
}

/** Runs a PostgreSQL tool to completion; rejects on a non-zero exit. */
export function run(
  command: string,
  args: string[],
  env: Record<string, string>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      // Its own messages go straight to the console; nothing of ours is piped
      // through a shell.
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'ENOENT'
          ? new Error(
              `${path.basename(command)} could not be started. Install the PostgreSQL client tools, or set PG_BIN_DIR in app/server/.env to PostgreSQL's "bin" folder.`,
            )
          : err,
      );
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${path.basename(command)} exited with code ${code}.`),
        );
    });
  });
}

/** Files and total bytes under a folder (0/0 if it does not exist). */
export async function measure(
  dir: string,
): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = await measure(full);
      files += inner.files;
      bytes += inner.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += (await stat(full)).size;
    }
  }
  return { files, bytes };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

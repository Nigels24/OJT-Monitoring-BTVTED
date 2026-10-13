import { randomUUID } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { localDelete, localSignedUrl, localUpload } from './storage-local';

export type StorageDriver = 'local' | 'supabase';

/**
 * Where uploaded files are kept: a folder on the host computer (`local`, the
 * default — see `storage-local.ts` and CLAUDE.md §20) or the Supabase bucket
 * this system started on (`supabase`). The four functions below are the whole
 * storage API and behave the same under either; no caller knows which is on.
 */
export function storageDriver(): StorageDriver {
  const value = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (!value || value === 'local') return 'local';
  if (value === 'supabase') return 'supabase';
  throw new Error(
    `STORAGE_DRIVER must be "local" or "supabase", not "${process.env.STORAGE_DRIVER}".`,
  );
}

/**
 * The single private bucket for student-owned files. Documents and
 * Credentials share it under different prefixes (`documents/<studentId>/`,
 * `credentials/<studentId>/`) — see CLAUDE.md §7 "File storage".
 */
export const BUCKET = 'student-files';

const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60;

let client: SupabaseClient | null = null;

/** Lazily built so a missing env var fails loudly at first use, not at import time. */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Add them to app/server/.env before starting the server.',
    );
  }

  client = createClient(url, key);
  return client;
}

/**
 * Builds a collision-free object path under a prefix, e.g.
 * `buildObjectPath('documents', studentId, 'resume.pdf')` ->
 * `documents/<studentId>/<uuid>.pdf`.
 *
 * The original filename is discarded rather than sanitized and kept — the
 * human-readable name is stored separately (`Document.name`), so the object
 * path only needs to be unique and carry the right extension.
 */
export function buildObjectPath(
  prefix: string,
  studentId: string,
  originalName: string,
): string {
  const dot = originalName.lastIndexOf('.');
  const ext = dot === -1 ? '' : originalName.slice(dot);
  return `${prefix}/${studentId}/${randomUUID()}${ext}`;
}

/** Uploads a buffer to `path`. Never overwrites — every path is freshly generated. */
export async function uploadFile(
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  if (storageDriver() === 'local') {
    // The type is not stored beside a local file: it is re-derived from the
    // extension when the file is served (`contentTypeFor`).
    return localUpload(path, buffer);
  }
  const { error } = await getSupabaseClient()
    .storage.from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) {
    throw new Error(`Failed to upload file to storage: ${error.message}`);
  }
}

/**
 * Mints a time-limited URL for a stored object path. Never store the result.
 *
 * `downloadName` sets Supabase's `download` option, which makes the response
 * carry `Content-Disposition: attachment; filename=...`. Callers pass the
 * school's conventional name (`StudentNo_CODE_SURNAME.ext`) so a saved file is
 * identifiable without opening it — the bucket key itself is a uuid and would
 * otherwise be what the browser saved. Omit it to serve the object inline, which
 * is what an image being rendered in a page wants.
 */
export async function getSignedUrl(
  path: string,
  expiresInSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS,
  downloadName?: string,
): Promise<string> {
  if (storageDriver() === 'local') {
    return localSignedUrl(path, expiresInSeconds, downloadName);
  }
  const { data, error } = await getSupabaseClient()
    .storage.from(BUCKET)
    .createSignedUrl(
      path,
      expiresInSeconds,
      downloadName ? { download: downloadName } : undefined,
    );
  if (error || !data) {
    throw new Error(
      `Failed to create signed URL: ${error?.message ?? 'unknown error'}`,
    );
  }
  return data.signedUrl;
}

export async function deleteFile(path: string): Promise<void> {
  if (storageDriver() === 'local') return localDelete(path);
  const { error } = await getSupabaseClient()
    .storage.from(BUCKET)
    .remove([path]);
  if (error) {
    throw new Error(`Failed to delete file from storage: ${error.message}`);
  }
}

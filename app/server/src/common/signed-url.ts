import { Logger } from '@nestjs/common';
import { getSignedUrl } from './storage';

/**
 * Minting read URLs for stored objects, in one place.
 *
 * Every caller is already past its own authorization check (the service has
 * re-derived ownership from the JWT) — this only turns a bucket key into a
 * short-lived URL, and is never given a path that came from a request.
 *
 * Nothing here throws. A missing object yields `null` so one bad row renders as
 * "unavailable" instead of taking down the list it is in: these run under
 * `Promise.all` across whole lists (the student's checklist, the coordinator's
 * review queue, a journal entry's photos), and a throw there used to fail the
 * entire page for every student rather than the one broken row (CLAUDE.md §8).
 * The likeliest cause is an object deleted out from under its row, so it is
 * logged loudly and left for someone to clean up.
 */
const logger = new Logger('SignedUrl');

export async function signedUrlOrNull(
  path: string,
  downloadName?: string,
): Promise<string | null> {
  try {
    return await getSignedUrl(path, undefined, downloadName);
  } catch (err) {
    logger.error(
      `No signed URL for stored object "${path}" — the row survives with a null URL: ` +
        (err instanceof Error ? err.message : String(err)),
    );
    return null;
  }
}

/**
 * Replaces a record's stored `fileUrl` path with a signed URL, or `null`.
 *
 * `downloadName`, when given, is what a download saves the file as — see
 * `getSignedUrl`.
 */
export async function withSignedUrl<T extends { fileUrl: string }>(
  record: T,
  downloadName?: string,
): Promise<T & { fileUrl: string | null }> {
  return {
    ...record,
    fileUrl: await signedUrlOrNull(record.fileUrl, downloadName),
  };
}

/**
 * The extension of a stored object path, including the dot (`".pdf"`), or `""`.
 *
 * For building a download name for a row written before the file's real type was
 * recorded — `Credential` has no `mimeType` column, so its path is the only
 * remaining evidence of the extension.
 */
export function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  return dot > slash ? path.slice(dot) : '';
}

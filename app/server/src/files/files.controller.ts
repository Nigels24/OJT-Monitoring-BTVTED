import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { verifyFileToken } from '../common/file-token';
import { storageDriver } from '../common/storage';
import {
  contentTypeFor,
  fileUrlSecret,
  openLocalFile,
} from '../common/storage-local';

/** A name safe to put in a header: no quotes, slashes, or control characters. */
export function safeFilename(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 150);
  return cleaned || 'file';
}

/**
 * Serves locally stored files to whoever holds a valid signed link.
 *
 * **Deliberately no `AuthGuard`** (CLAUDE.md §2 — a controller without one is
 * public): the signed token *is* the authorization, exactly as with a
 * Supabase signed URL, which is what lets an `<img>` or a new browser tab
 * load a file without a bearer token. A link is only ever handed out by an
 * endpoint that already checked who was asking, and it stops working after
 * an hour.
 *
 * The object path comes out of the verified token and nowhere else — there
 * is no path in the URL to tamper with — and it is still resolved through
 * `resolveInside` before the disk is touched.
 */
@Controller('files')
export class FilesController {
  @Get(':token')
  async serve(@Param('token') token: string, @Res() res: Response) {
    // With the bucket in use, files are served by Supabase, not from here.
    if (storageDriver() !== 'local') throw new NotFoundException();

    const verified = verifyFileToken(token, fileUrlSecret());
    if (!verified.ok) {
      throw new ForbiddenException(
        verified.reason === 'EXPIRED'
          ? 'This file link has expired. Reload the page to get a new one.'
          : 'This file link is not valid.',
      );
    }

    const { path, downloadName } = verified.payload;
    const file = await openLocalFile(path);
    if (!file) throw new NotFoundException('File not found');

    const filename = safeFilename(downloadName ?? path.split('/').pop() ?? '');
    res.set({
      'Content-Type': contentTypeFor(path),
      'Content-Length': String(file.size),
      // Never let a browser guess a different type from the bytes.
      'X-Content-Type-Options': 'nosniff',
      // A link with a download name saves the file under it; one without is
      // shown in place (an image in a page) — the same split the bucket's
      // signed URLs make.
      'Content-Disposition': `${downloadName ? 'attachment' : 'inline'}; filename="${filename}"`,
      // The link is private to whoever was given it, and short-lived.
      'Cache-Control': 'private, max-age=300',
    });
    file.stream.on('error', () => res.destroy());
    file.stream.pipe(res);
  }
}

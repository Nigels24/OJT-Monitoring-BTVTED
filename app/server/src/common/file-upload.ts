import { BadRequestException } from '@nestjs/common';

/**
 * Upload rules shared by every student-owned file (journal photos now,
 * documents and credentials as they move over).
 *
 * Two layers live here, and they are deliberately not the same check:
 *
 * - `assertValidDocumentUpload` is the **pre-existing** documents/credentials
 *   rule, moved here verbatim from `student.service.ts` so it is stated once:
 *   it trusts the multipart part's own `mimetype` header.
 * - `validateUpload` is the **content-based** rule: it reads the buffer's magic
 *   bytes and ignores whatever extension or Content-Type the client claimed.
 *   A `.jpg` that is really a PDF (or a renamed executable) fails here and
 *   passes the header-based check above.
 *
 * New features use `validateUpload`. Documents and credentials keep the header
 * check until Step 7 moves them over, so this step changes nothing about what
 * those two endpoints accept.
 */

/** 10MB, the ceiling for every student-uploaded file. */
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

/** What the documents/credentials endpoints accept, by claimed mimetype. */
export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);

/**
 * The documents/credentials file check, unchanged from where it used to live
 * inline in `StudentService`. Asserts the part exists, its claimed mimetype is
 * one of the three accepted, and it is within the size ceiling.
 */
export function assertValidDocumentUpload(
  file: Express.Multer.File | undefined,
): asserts file is Express.Multer.File {
  if (!file) {
    throw new BadRequestException('A file is required');
  }
  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype)) {
    throw new BadRequestException('Only PDF, PNG or JPEG files are accepted');
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new BadRequestException('File must be 10MB or smaller');
  }
}

export type UploadKind = 'pdf' | 'jpg' | 'png';

/**
 * The leading bytes each accepted format starts with, plus the extension and
 * mimetype **derived from the content** — never from the request.
 *
 * JPEG is checked on three bytes (FF D8 FF) rather than the full four-byte
 * SOI+marker pair, because the fourth byte varies by encoder (E0 for JFIF, E1
 * for Exif, DB for some cameras) and rejecting on it would fail real photos.
 */
const FILE_SIGNATURES: Record<
  UploadKind,
  { magic: readonly number[]; mimeType: string; ext: string; label: string }
> = {
  pdf: {
    magic: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
    mimeType: 'application/pdf',
    ext: '.pdf',
    label: 'PDF',
  },
  jpg: {
    magic: [0xff, 0xd8, 0xff],
    mimeType: 'image/jpeg',
    ext: '.jpg',
    label: 'JPG',
  },
  png: {
    magic: [0x89, 0x50, 0x4e, 0x47], // .PNG
    mimeType: 'image/png',
    ext: '.png',
    label: 'PNG',
  },
};

export interface ValidatedUpload {
  kind: UploadKind;
  /** Derived from the content, safe to hand to storage as the object's Content-Type. */
  mimeType: string;
  /** Derived from the content, including the leading dot. */
  ext: string;
  sizeBytes: number;
}

/**
 * Checks a buffer's real type and size, and reports what it actually is.
 *
 * The client-sent filename and Content-Type are never consulted: a browser (or
 * a script) can claim anything, and a private bucket that serves files back to
 * other users must not take its word for it.
 */
export function validateUpload(
  buffer: Buffer | undefined,
  options: { allowed: UploadKind[]; maxBytes: number },
): ValidatedUpload {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestException('The uploaded file is empty');
  }
  if (buffer.length > options.maxBytes) {
    const limitMb = Math.floor(options.maxBytes / (1024 * 1024));
    throw new BadRequestException(`Each file must be ${limitMb}MB or smaller`);
  }

  for (const kind of options.allowed) {
    const signature = FILE_SIGNATURES[kind];
    if (startsWithBytes(buffer, signature.magic)) {
      return {
        kind,
        mimeType: signature.mimeType,
        ext: signature.ext,
        sizeBytes: buffer.length,
      };
    }
  }

  const accepted = options.allowed
    .map((kind) => FILE_SIGNATURES[kind].label)
    .join(' or ');
  throw new BadRequestException(
    `That file is not a valid ${accepted}. Its contents are checked, not its name — re-save or re-export it and try again.`,
  );
}

function startsWithBytes(buffer: Buffer, magic: readonly number[]): boolean {
  if (buffer.length < magic.length) return false;
  return magic.every((byte, index) => buffer[index] === byte);
}

export interface StorageNameParts {
  /** `Student.studentIdNumber`, e.g. "2022-00145". */
  studentNumber: string;
  /** What kind of file this is, e.g. "JOURNAL". */
  code: string;
  surname: string;
  /**
   * Anything that distinguishes this file from its siblings — for a journal
   * photo, the entry's date and its position in the entry (`20260915_1`).
   * Underscores inside it survive, so a caller may pass several tokens.
   */
  suffix?: string | number;
  /** Take this from `validateUpload`'s result, not from the client's filename. */
  ext: string;
}

/**
 * The school's naming convention for a stored file:
 * `StudentNo_CODE_SUFFIX_SURNAME.ext`, e.g.
 * `2022-00145_JOURNAL_20260915_1_MUNDO.jpg`.
 *
 * Upper-cased, with spaces and accents stripped and anything outside
 * `A-Z 0-9 _ -` removed, so the result is safe as a filename on any platform
 * and identical however the student's name happens to be typed. This is the
 * *auditable* name a compiled export prints; the bucket key is a separate,
 * collision-free path (`buildObjectPath` in `storage.ts`).
 */
export function buildStorageName({
  studentNumber,
  code,
  surname,
  suffix,
  ext,
}: StorageNameParts): string {
  const raw = [studentNumber, code, suffix, surname]
    .filter((part) => part !== undefined && String(part).trim() !== '')
    .join('_');
  const normalizedExt = ext.startsWith('.')
    ? ext.toLowerCase()
    : `.${ext.toLowerCase()}`;
  return `${sanitizeNamePart(raw)}${normalizedExt}`;
}

/**
 * Strips accents (via NFKD, which splits "ñ" into "n" + a combining mark this
 * then drops), upper-cases, and removes everything that is not a letter,
 * digit, underscore or hyphen — spaces included.
 */
function sanitizeNamePart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

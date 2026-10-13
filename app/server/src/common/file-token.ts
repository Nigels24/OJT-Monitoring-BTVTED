import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed file tokens — what makes a locally stored file reachable for a
 * limited time without a login, exactly as a Supabase signed URL does.
 *
 * A token is `<payload>.<signature>`, both base64url: the payload is the
 * object path, its expiry and (optionally) the name to download it as; the
 * signature is an HMAC-SHA256 of the payload. Nothing is stored — a token is
 * valid because it verifies, and stops being valid when its expiry passes.
 *
 * Pure: the secret and the clock are passed in, so every rule is unit-tested
 * (`file-token.spec.ts`).
 */
export interface FileTokenPayload {
  /** The object path, e.g. `documents/<studentId>/<uuid>.pdf`. */
  path: string;
  /** Expiry, in seconds since the epoch. */
  expiresAt: number;
  /** Set when the file should be saved under this name instead of shown. */
  downloadName?: string;
}

export type FileTokenFailure = 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED';

export type FileTokenResult =
  | { ok: true; payload: FileTokenPayload }
  | { ok: false; reason: FileTokenFailure };

function sign(encodedPayload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(encodedPayload).digest();
}

export function signFileToken(
  payload: FileTokenPayload,
  secret: string,
): string {
  const encoded = Buffer.from(
    JSON.stringify({
      p: payload.path,
      e: payload.expiresAt,
      ...(payload.downloadName ? { n: payload.downloadName } : {}),
    }),
  ).toString('base64url');
  return `${encoded}.${sign(encoded, secret).toString('base64url')}`;
}

/**
 * Checks the signature first, in constant time, and only then reads the
 * payload — nothing inside an unsigned token is ever trusted or parsed.
 */
export function verifyFileToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): FileTokenResult {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'MALFORMED' };
  }
  const [encoded, signature] = parts;

  const expected = sign(encoded, secret);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }
  const { p, e, n } = (raw ?? {}) as { p?: unknown; e?: unknown; n?: unknown };
  if (typeof p !== 'string' || typeof e !== 'number' || !Number.isFinite(e)) {
    return { ok: false, reason: 'MALFORMED' };
  }
  if (n !== undefined && typeof n !== 'string') {
    return { ok: false, reason: 'MALFORMED' };
  }
  if (e <= nowSeconds) return { ok: false, reason: 'EXPIRED' };

  return {
    ok: true,
    payload: { path: p, expiresAt: e, ...(n ? { downloadName: n } : {}) },
  };
}

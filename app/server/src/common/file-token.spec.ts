import { createHmac } from 'crypto';
import { signFileToken, verifyFileToken } from './file-token';

const SECRET = 'test-secret';
const NOW = 1_800_000_000;
const payload = { path: 'documents/s1/abc.pdf', expiresAt: NOW + 3600 };

describe('file tokens', () => {
  it('verifies a token it signed and returns the payload', () => {
    const token = signFileToken(payload, SECRET);
    expect(verifyFileToken(token, SECRET, NOW)).toEqual({ ok: true, payload });
  });

  it('carries the download name when there is one', () => {
    const token = signFileToken(
      { ...payload, downloadName: '2022-00145_MOA_MUNDO.pdf' },
      SECRET,
    );
    const result = verifyFileToken(token, SECRET, NOW);
    expect(result.ok && result.payload.downloadName).toBe(
      '2022-00145_MOA_MUNDO.pdf',
    );
  });

  it('is URL-safe', () => {
    expect(signFileToken(payload, SECRET)).toMatch(
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
  });

  it('rejects a token once it has expired, to the second', () => {
    const token = signFileToken(payload, SECRET);
    expect(verifyFileToken(token, SECRET, payload.expiresAt - 1).ok).toBe(true);
    expect(verifyFileToken(token, SECRET, payload.expiresAt)).toEqual({
      ok: false,
      reason: 'EXPIRED',
    });
  });

  it('rejects a payload swapped for another path', () => {
    const [, signature] = signFileToken(payload, SECRET).split('.');
    const forged = Buffer.from(
      JSON.stringify({ p: 'documents/s2/other.pdf', e: payload.expiresAt }),
    ).toString('base64url');
    expect(verifyFileToken(`${forged}.${signature}`, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'BAD_SIGNATURE',
    });
  });

  it('rejects an expiry pushed later without re-signing', () => {
    const [, signature] = signFileToken(payload, SECRET).split('.');
    const extended = Buffer.from(
      JSON.stringify({ p: payload.path, e: payload.expiresAt + 99999 }),
    ).toString('base64url');
    expect(verifyFileToken(`${extended}.${signature}`, SECRET, NOW).ok).toBe(
      false,
    );
  });

  it('rejects a tampered signature and a token signed with another secret', () => {
    const token = signFileToken(payload, SECRET);
    const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(verifyFileToken(flipped, SECRET, NOW).ok).toBe(false);
    expect(
      verifyFileToken(signFileToken(payload, 'other'), SECRET, NOW),
    ).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it.each(['', 'abc', 'a.b.c', '.sig', 'payload.'])(
    'rejects the malformed token %p',
    (token) => {
      expect(verifyFileToken(token, SECRET, NOW).ok).toBe(false);
    },
  );

  it('rejects a correctly signed payload of the wrong shape', () => {
    const encoded = Buffer.from(JSON.stringify({ p: 5, e: 'soon' })).toString(
      'base64url',
    );
    // Signed properly, so only the shape check can refuse it.
    const signature = createHmac('sha256', SECRET)
      .update(encoded)
      .digest('base64url');
    expect(verifyFileToken(`${encoded}.${signature}`, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'MALFORMED',
    });
  });
});

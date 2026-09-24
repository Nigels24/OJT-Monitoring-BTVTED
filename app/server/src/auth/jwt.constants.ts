/**
 * Reads JWT_SECRET and refuses to start without it.
 *
 * This used to fall back to the literal 'dev-secret-change-this' in both
 * AuthModule and JwtStrategy. A deploy that forgot the env var would boot
 * happily and sign every token with a value that is public in this repo, so
 * anyone could mint a COORDINATOR token. Crashing at startup is the safer
 * failure.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set. Add it to app/server/.env before starting the server.',
    );
  }
  return secret;
}

/**
 * The access token's lifetime and the session's inactivity budget, in
 * minutes — the same number, since there is no separate refresh token (see
 * `POST /auth/refresh`). A token this old is expired outright; the client is
 * expected to call `/auth/refresh` on real user activity well before that to
 * slide the window forward. Keep `SESSION_MAX_AGE_SECONDS`
 * (`app/client/lib/auth.ts`) equal to this in seconds, for the same reason
 * documented there.
 */
export const SESSION_IDLE_MINUTES = 30;

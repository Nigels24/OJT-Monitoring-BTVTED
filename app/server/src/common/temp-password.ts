import { randomInt } from 'crypto';

const TEMP_PASSWORD_LENGTH = 10;

// No 0/O/1/l (and no uppercase I, which is just as easy to misread against a
// lowercase l) — this is read aloud or copied off a screen by hand, so
// ambiguous characters turn into a failed first login.
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const ALL = LETTERS + DIGITS;

/**
 * A readable temporary password for a coordinator-issued account: 10
 * characters, `crypto.randomInt`-based (not `Math.random`), guaranteed to
 * contain at least one letter and one digit so it always clears the "must
 * contain a letter and a number" rule enforced at `/auth/password`.
 *
 * Never stored or logged in plaintext — callers hash it immediately and
 * return it to the coordinator exactly once, in the create/reset response.
 */
export function generateTemporaryPassword(): string {
  const chars = [
    LETTERS[randomInt(LETTERS.length)],
    DIGITS[randomInt(DIGITS.length)],
  ];
  for (let i = chars.length; i < TEMP_PASSWORD_LENGTH; i++) {
    chars.push(ALL[randomInt(ALL.length)]);
  }
  // Fisher-Yates so the guaranteed letter/digit aren't always in the same
  // two positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

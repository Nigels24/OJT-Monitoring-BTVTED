/**
 * The origins allowed to call the API directly, from `CORS_ORIGINS`
 * (comma-separated). Browsers normally reach the API through the website's
 * own address (`/api`, CLAUDE.md §20), which is same-origin and needs no
 * CORS at all — this list only matters for a client that calls the API's own
 * port, as `npm run dev` may be set up to.
 */
export const DEFAULT_CORS_ORIGIN = 'http://localhost:3001';

export function parseCorsOrigins(value: string | undefined): string[] {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return origins.length > 0 ? origins : [DEFAULT_CORS_ORIGIN];
}

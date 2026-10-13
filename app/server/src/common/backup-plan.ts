/**
 * The rules of `npm run backup` / `npm run restore` that need no disk or
 * database: what a backup is called, which old ones go, and how a Prisma
 * connection string becomes what the PostgreSQL tools read. Pure, and
 * unit-tested (`backup-plan.spec.ts`); the scripts in `scripts/` do the I/O.
 */

export const BACKUP_PREFIX = 'ojt-track_';

/** How many backups are kept; the oldest beyond this are deleted. */
export const BACKUPS_TO_KEEP = 30;

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * `ojt-track_2026-10-13_1830` — the host computer's own local date and time,
 * since that is the clock the person looking for "yesterday's backup" reads.
 * Names sort oldest-first as plain text.
 */
export function backupName(now: Date = new Date()): string {
  return (
    `${BACKUP_PREFIX}${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

const BACKUP_NAME = /^ojt-track_\d{4}-\d{2}-\d{2}_\d{4}$/;

/**
 * True only for a finished backup's exact name. Anything else in the backup
 * folder — a half-written `.partial`, someone's own files, a path with a
 * slash in it — is never listed, restored from, or deleted.
 */
export function isBackupName(name: string): boolean {
  return BACKUP_NAME.test(name);
}

/** The backups to delete so that only the newest `keep` remain. */
export function backupsToPrune(
  entries: readonly string[],
  keep: number = BACKUPS_TO_KEEP,
): string[] {
  const backups = entries.filter(isBackupName).sort();
  return backups.slice(0, Math.max(0, backups.length - keep));
}

/**
 * The connection settings for `pg_dump` / `pg_restore`, as the `PG*`
 * environment variables those tools read.
 *
 * Passed through the environment rather than as a URL argument for two
 * reasons: the password never appears in the process list, and a Prisma
 * connection string may carry parameters (`?schema=public`,
 * `?pgbouncer=true`) that the PostgreSQL tools reject outright.
 */
export function pgEnvFromUrl(databaseUrl: string): Record<string, string> {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid connection string.');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must start with postgresql://');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) throw new Error('DATABASE_URL does not name a database.');

  const env: Record<string, string> = {
    PGHOST: url.hostname || 'localhost',
    PGPORT: url.port || '5432',
    PGDATABASE: database,
  };
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

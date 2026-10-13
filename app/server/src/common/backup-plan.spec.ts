import {
  backupName,
  backupsToPrune,
  isBackupName,
  pgEnvFromUrl,
} from './backup-plan';

describe('backupName', () => {
  it('uses the local date and time, zero-padded', () => {
    expect(backupName(new Date(2026, 0, 5, 7, 3))).toBe(
      'ojt-track_2026-01-05_0703',
    );
    expect(backupName(new Date(2026, 9, 13, 18, 30))).toBe(
      'ojt-track_2026-10-13_1830',
    );
  });

  it('produces a name isBackupName accepts', () => {
    expect(isBackupName(backupName())).toBe(true);
  });
});

describe('isBackupName', () => {
  it.each([
    'ojt-track_2026-10-13_1830.partial',
    'ojt-track_2026-10-13',
    'notes.txt',
    '../ojt-track_2026-10-13_1830',
    'ojt-track_2026-10-13_1830/..',
    '',
  ])('rejects %p', (name) => {
    expect(isBackupName(name)).toBe(false);
  });
});

describe('backupsToPrune', () => {
  const names = Array.from(
    { length: 33 },
    (_, i) => `ojt-track_2026-09-${String(i + 1).padStart(2, '0')}_1800`,
  );

  it('keeps the newest 30 and returns the oldest beyond that', () => {
    // Shuffled input: the order on disk is not the order of age.
    expect(backupsToPrune([...names].reverse())).toEqual(names.slice(0, 3));
  });

  it('deletes nothing at or under the limit', () => {
    expect(backupsToPrune(names.slice(0, 30))).toEqual([]);
    expect(backupsToPrune([])).toEqual([]);
  });

  it('never selects anything that is not a finished backup', () => {
    const pruned = backupsToPrune(
      [...names, 'family-photos', 'ojt-track_2020-01-01_0000.partial'],
      1,
    );
    expect(pruned).toHaveLength(32);
    expect(pruned.every(isBackupName)).toBe(true);
  });
});

describe('pgEnvFromUrl', () => {
  it('splits a local connection string into PG* variables', () => {
    expect(
      pgEnvFromUrl('postgresql://ojt:s3cret@localhost:5432/ojt_track'),
    ).toEqual({
      PGHOST: 'localhost',
      PGPORT: '5432',
      PGDATABASE: 'ojt_track',
      PGUSER: 'ojt',
      PGPASSWORD: 's3cret',
    });
  });

  it('decodes an escaped password and defaults the port', () => {
    const env = pgEnvFromUrl(
      'postgres://ojt:p%40ss%2Fword@127.0.0.1/ojt_track',
    );
    expect(env.PGPASSWORD).toBe('p@ss/word');
    expect(env.PGPORT).toBe('5432');
  });

  it('drops Prisma-only parameters and keeps sslmode', () => {
    const env = pgEnvFromUrl(
      'postgresql://u:p@db.example.com:6543/postgres?schema=public&pgbouncer=true&sslmode=require',
    );
    expect(env.PGSSLMODE).toBe('require');
    expect(Object.keys(env).sort()).toEqual([
      'PGDATABASE',
      'PGHOST',
      'PGPASSWORD',
      'PGPORT',
      'PGSSLMODE',
      'PGUSER',
    ]);
  });

  it.each(['', 'not a url', 'mysql://u:p@h/db', 'postgresql://u:p@h/'])(
    'refuses %p',
    (value) => {
      expect(() => pgEnvFromUrl(value)).toThrow();
    },
  );
});

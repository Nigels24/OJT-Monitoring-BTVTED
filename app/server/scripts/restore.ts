import 'dotenv/config';
import { existsSync } from 'fs';
import { cp, readdir, rename } from 'fs/promises';
import * as path from 'path';
import { createInterface } from 'readline/promises';
import { isBackupName, pgEnvFromUrl } from '../src/common/backup-plan';
import { storageDriver } from '../src/common/storage';
import { storageDir } from '../src/common/storage-local';
import {
  DUMP_FILE,
  STORAGE_FOLDER,
  backupDir,
  databaseUrl,
  pgTool,
  run,
} from './backup-lib';

/**
 * Restores the database and the uploaded files from one backup.
 *
 *   npm run restore                         # lists the backups
 *   npm run restore -- ojt-track_2026-10-13_1830
 *
 * **This replaces everything currently in the system** with the backup's
 * contents, so it asks for the backup's name to be typed again first. There
 * is no flag to skip that question, on purpose.
 *
 * Stop the API before running it (see docs/DEPLOYMENT.md).
 *
 * - The database is restored in a single transaction: if anything fails, the
 *   database is left exactly as it was.
 * - The current uploaded-files folder is not deleted — it is renamed to
 *   `<STORAGE_DIR>.before-restore-<time>` and can be removed by hand once
 *   the restore has been checked.
 */
async function main() {
  const root = backupDir();
  const name = process.argv[2];
  const available = existsSync(root)
    ? (await readdir(root)).filter(isBackupName).sort()
    : [];

  if (!name) {
    console.log(`Backups in ${root}:`);
    if (available.length === 0) console.log('  (none)');
    for (const backup of available) console.log(`  ${backup}`);
    console.log('\nTo restore one:  npm run restore -- <backup name>');
    return;
  }
  // The name must be exactly a backup's name — never a path.
  if (!isBackupName(name) || !available.includes(name)) {
    throw new Error(
      `"${name}" is not a backup in ${root}. Run "npm run restore" to list them.`,
    );
  }
  const source = path.join(root, name);
  const dump = path.join(source, DUMP_FILE);
  if (!existsSync(dump)) {
    throw new Error(`${name} has no ${DUMP_FILE} — it is not a usable backup.`);
  }

  const pgEnv = pgEnvFromUrl(databaseUrl());
  const restoreFiles =
    storageDriver() === 'local' &&
    existsSync(path.join(source, STORAGE_FOLDER));

  console.log('This will REPLACE the current data with the backup:');
  console.log(`  backup          ${name}`);
  console.log(
    `  database        ${pgEnv.PGDATABASE} on ${pgEnv.PGHOST}:${pgEnv.PGPORT}`,
  );
  console.log(
    `  uploaded files  ${restoreFiles ? storageDir() : 'not touched'}`,
  );
  console.log(
    'Everything entered into the system after that backup was made will be lost.',
  );
  console.log('Make sure the API is stopped.\n');

  if (!process.stdin.isTTY) {
    throw new Error(
      'Restore must be run from a terminal so it can ask for confirmation.',
    );
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await prompt.question(
    `Type the backup name (${name}) to continue, or press Enter to cancel: `,
  );
  prompt.close();
  if (answer.trim() !== name) {
    console.log('Cancelled. Nothing was changed.');
    return;
  }

  console.log('Restoring the database ...');
  await run(
    pgTool('pg_restore'),
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      '--exit-on-error',
      `--dbname=${pgEnv.PGDATABASE}`,
      dump,
    ],
    pgEnv,
  );

  if (restoreFiles) {
    console.log('Restoring the uploaded files ...');
    const current = storageDir();
    if (existsSync(current)) {
      const aside = `${current}.before-restore-${Date.now()}`;
      await rename(current, aside);
      console.log(`  the previous files were kept at ${aside}`);
    }
    await cp(path.join(source, STORAGE_FOLDER), current, { recursive: true });
  }

  console.log(`Restore complete from ${name}. Start the API again.`);
}

main().catch((err: unknown) => {
  console.error(
    `RESTORE FAILED: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});

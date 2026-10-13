import 'dotenv/config';
import { cp, mkdir, readdir, rename, rm, stat } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import {
  BACKUPS_TO_KEEP,
  backupName,
  backupsToPrune,
  pgEnvFromUrl,
} from '../src/common/backup-plan';
import { storageDriver } from '../src/common/storage';
import { storageDir } from '../src/common/storage-local';
import {
  DUMP_FILE,
  STORAGE_FOLDER,
  backupDir,
  databaseUrl,
  formatBytes,
  measure,
  pgTool,
  run,
} from './backup-lib';

/**
 * Backs up the database and the uploaded files.
 *
 *   npm run backup
 *
 * Writes one folder per backup into BACKUP_DIR:
 *
 *   ojt-track_2026-10-13_1830/
 *     database.dump     pg_dump, custom format (restore with `npm run restore`)
 *     storage/          a copy of STORAGE_DIR
 *
 * then deletes the oldest backups beyond the newest 30. The backup is built
 * as `<name>.partial` and renamed only when everything succeeded, so a
 * backup that failed half-way is never mistaken for a good one, never
 * restored from, and never causes an older good one to be pruned.
 *
 * Exits non-zero on any failure, so Task Scheduler / cron records it.
 */
async function main() {
  const root = backupDir();
  const name = backupName();
  const finalDir = path.join(root, name);
  const workDir = `${finalDir}.partial`;

  await mkdir(root, { recursive: true });
  if (existsSync(finalDir)) {
    throw new Error(
      `A backup named ${name} already exists. Wait a minute and run it again.`,
    );
  }
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir);

  try {
    console.log(`Backing up to ${finalDir}`);

    console.log('  database ...');
    await run(
      pgTool('pg_dump'),
      [
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        `--file=${path.join(workDir, DUMP_FILE)}`,
      ],
      pgEnvFromUrl(databaseUrl()),
    );
    const dump = await stat(path.join(workDir, DUMP_FILE));
    if (dump.size === 0) throw new Error('pg_dump wrote an empty file.');

    let storageSummary =
      'not copied (files are in Supabase, not on this computer)';
    if (storageDriver() === 'local') {
      console.log('  uploaded files ...');
      const source = storageDir();
      const target = path.join(workDir, STORAGE_FOLDER);
      await mkdir(target);
      if (existsSync(source)) await cp(source, target, { recursive: true });
      const copied = await measure(target);
      const original = await measure(source);
      if (copied.files !== original.files) {
        throw new Error(
          `Copied ${copied.files} of ${original.files} uploaded files — the backup is incomplete.`,
        );
      }
      storageSummary = `${copied.files} file(s), ${formatBytes(copied.bytes)}`;
    }

    await rename(workDir, finalDir);

    const pruned = backupsToPrune(await readdir(root));
    for (const old of pruned) {
      await rm(path.join(root, old), { recursive: true, force: true });
    }
    const kept = (await readdir(root)).length;

    console.log('Backup complete.');
    console.log(`  name            ${name}`);
    console.log(`  database        ${formatBytes(dump.size)}`);
    console.log(`  uploaded files  ${storageSummary}`);
    console.log(
      `  old backups     ${pruned.length} deleted (the newest ${BACKUPS_TO_KEEP} are kept; ${kept} item(s) now in ${root})`,
    );
  } catch (err) {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

main().catch((err: unknown) => {
  console.error(
    `BACKUP FAILED: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});

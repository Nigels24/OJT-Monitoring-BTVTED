import 'dotenv/config';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import { BUCKET, getSupabaseClient } from '../src/common/storage';
import { ensureStorageDir, resolveInside } from '../src/common/storage-local';

/**
 * One-off: copies every object in the Supabase bucket into STORAGE_DIR, at
 * the same object path, so the local driver finds each file where its
 * database row says it is.
 *
 *   npm run storage:pull
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Safe to run again: a
 * file already present locally is skipped, never overwritten. Nothing is
 * deleted from the bucket.
 */
const PAGE = 100;

async function listAll(prefix: string): Promise<string[]> {
  const bucket = getSupabaseClient().storage.from(BUCKET);
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`Could not list "${prefix}": ${error.message}`);
    for (const entry of data ?? []) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A folder comes back with no id; a file has one.
      if (entry.id === null) paths.push(...(await listAll(full)));
      else paths.push(full);
    }
    if (!data || data.length < PAGE) break;
  }
  return paths;
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — there is no bucket to copy from. Nothing to do.',
    );
    return;
  }
  const root = ensureStorageDir();
  const bucket = getSupabaseClient().storage.from(BUCKET);
  const objects = await listAll('');

  let copied = 0;
  let skipped = 0;
  const failed: string[] = [];
  for (const objectPath of objects) {
    let target: string;
    try {
      target = resolveInside(root, objectPath);
    } catch {
      failed.push(objectPath);
      continue;
    }
    if (existsSync(target)) {
      skipped += 1;
      continue;
    }
    const { data, error } = await bucket.download(objectPath);
    if (error || !data) {
      failed.push(objectPath);
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await data.arrayBuffer()), {
      flag: 'wx',
    });
    copied += 1;
  }

  console.log(`Storage pull into ${root}`);
  console.log(`  in the bucket    ${objects.length}`);
  console.log(`  copied           ${copied}`);
  console.log(`  already present  ${skipped}`);
  console.log(`  failed           ${failed.length}`);
  for (const objectPath of failed) console.log(`    ${objectPath}`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(
    `STORAGE PULL FAILED: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});

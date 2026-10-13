// Starts the API and the website together, for the school network.
//
//   npm run start:lan        (from the repository's top folder)
//
// Both must already be built (npm run build:all). Closing this window, or
// pressing Ctrl+C, stops both. To have them start by themselves when the
// computer boots, use PM2 or Task Scheduler instead — see docs/DEPLOYMENT.md.
//
// Each program is started with Node directly (no shell, no npm in between),
// so this behaves the same on Windows, macOS and Linux.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = join(root, 'app', 'server');
const client = join(root, 'app', 'client');

const apiEntry = join(server, 'dist', 'src', 'main.js');
const nextBin = join(client, 'node_modules', 'next', 'dist', 'bin', 'next');
if (!existsSync(apiEntry) || !existsSync(join(client, '.next'))) {
  console.error('The apps are not built yet. Run "npm run build:all" first.');
  process.exit(1);
}

const children = [
  spawn(process.execPath, [apiEntry], { cwd: server, stdio: 'inherit' }),
  spawn(process.execPath, [nextBin, 'start', '-H', '0.0.0.0', '-p', '3001'], {
    cwd: client,
    stdio: 'inherit',
  }),
];

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net && net.family === 'IPv4' && !net.internal)
  .map((net) => `http://${net.address}:3001`);
console.log('\nOJT-Track is starting.');
console.log('  On this computer:      http://localhost:3001');
for (const address of addresses) {
  console.log(`  From other devices:    ${address}`);
}
console.log('  Press Ctrl+C to stop.\n');

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
// If either one stops, stop the other: half a system is not a running system.
for (const child of children) {
  child.on('exit', (code) => stop(code ?? 1));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

// Asks the running system whether it is healthy.
//
//   npm run health
//
// Goes through the website (port 3001), the same way a browser does, so a
// good answer means the website, the API and the link between them all work.
const url = process.argv[2] ?? 'http://127.0.0.1:3001/api/health';

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const body = await response.json().catch(() => ({}));
  if (response.status === 502) {
    console.log('Website:   running');
    console.log('API:       NOT RUNNING (the website could not reach it)');
    process.exit(1);
  }
  if (body.status !== 'ok' || typeof body.storage !== 'string') {
    // Something answered, but not OJT-Track's health check.
    console.log(`Not OJT-Track: ${url} is answered by a different program.`);
    process.exit(1);
  }
  console.log('Website:   running');
  console.log('API:       running');
  console.log(`Database:  ${body.database ? 'connected' : 'NOT REACHABLE — is PostgreSQL running?'}`);
  console.log(`Files:     stored with the "${body.storage}" driver`);
  process.exit(body.status === 'ok' && body.database ? 0 : 1);
} catch {
  console.log(`Website:   NOT RUNNING (no answer from ${url})`);
  process.exit(1);
}

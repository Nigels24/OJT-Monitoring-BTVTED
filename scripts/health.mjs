// Asks the running system whether it is healthy.
//
//   npm run health
//   WEB_PORT=3003 API_PORT=3004 npm run health      (same ports as start:lan)
//
// Goes through the website (port WEB_PORT, default 3001), the same way a
// browser does, so a good answer means the website, the API and the link
// between them all work. When that fails, it asks the API directly (API_PORT,
// default 3000, or API_INTERNAL_URL if set) to tell "the API is down" apart
// from "the website is pointed at the wrong API address".
import portsModule from './ports.cjs';

const ports = portsModule.resolvePorts();
const url = process.argv[2] ?? `http://127.0.0.1:${ports.webPort}/api/health`;
const apiUrl = `${ports.apiInternalUrl.replace(/\/+$/, '')}/health`;

/** The parsed health answer, or null when nothing (or not OJT-Track) answers. */
async function ask(target) {
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(8000) });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  } catch {
    return null;
  }
}

function isOjtTrack(body) {
  return body?.status === 'ok' && typeof body.storage === 'string';
}

/** The API's own answer, for when the website could not give one. */
async function reportApiDirectly(websiteRunning) {
  const direct = await ask(apiUrl);
  if (direct && isOjtTrack(direct.body)) {
    console.log(`API:       running at ${ports.apiInternalUrl}`);
    if (websiteRunning) {
      console.log(
        '           but the website cannot reach it — the website and the API ' +
          'disagree on the API address (API_PORT / API_INTERNAL_URL).',
      );
    }
  } else {
    console.log(`API:       NOT RUNNING (no answer from ${apiUrl})`);
  }
}

const website = await ask(url);
if (!website) {
  console.log(`Website:   NOT RUNNING (no answer from ${url})`);
  await reportApiDirectly(false);
  process.exit(1);
}
if (website.status === 502) {
  console.log('Website:   running');
  await reportApiDirectly(true);
  process.exit(1);
}
if (!isOjtTrack(website.body)) {
  // Something answered, but not OJT-Track's health check.
  console.log(`Not OJT-Track: ${url} is answered by a different program.`);
  process.exit(1);
}
const body = website.body;
console.log('Website:   running');
console.log('API:       running');
console.log(`Database:  ${body.database ? 'connected' : 'NOT REACHABLE — is PostgreSQL running?'}`);
console.log(`Files:     stored with the "${body.storage}" driver`);
process.exit(body.database ? 0 : 1);

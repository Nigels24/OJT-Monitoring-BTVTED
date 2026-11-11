// The two ports OJT-Track runs on, decided once and shared by start-lan.mjs,
// health.mjs and ecosystem.config.cjs so all three agree.
//
//   WEB_PORT=3003 API_PORT=3004 npm run start:lan
//
// Both come from the environment (never from a .env file). Unset, blank or not
// a whole number from 1 to 65535 → the default: 3001 for the website, 3000 for
// the API. CommonJS so the PM2 config can require() it; the .mjs scripts
// import it.
//
// How API_PORT reaches the two programs without touching their .env files:
// both only fill in a key from .env when it is not already in the environment
// (dotenv without `override` in app/server; @next/env in app/client). So the
// child processes are given
//   API      PORT=<API_PORT>
//   website  API_INTERNAL_URL=http://127.0.0.1:<API_PORT>
// and those win over the .env files. Only when API_PORT is actually set:
// without it nothing is injected, so a PORT or API_INTERNAL_URL written in
// the .env files keeps working exactly as before. An API_INTERNAL_URL already
// in the environment always wins over the one derived here.
const DEFAULT_WEB_PORT = 3001;
const DEFAULT_API_PORT = 3000;

/** A valid port, or null when blank/unset; warns and returns null if invalid. */
function readPort(env, name) {
  const raw = (env[name] ?? '').trim();
  if (raw === '') return null;
  const port = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (Number.isInteger(port) && port >= 1 && port <= 65535) return port;
  console.warn(`${name}="${raw}" is not a port number (1–65535); ignoring it.`);
  return null;
}

/**
 * Call once per process (it warns about invalid values).
 * - webPort / apiPort: the ports to use.
 * - apiEnv / webEnv: what to add to each child process's environment.
 * - apiInternalUrl: where this computer reaches the API.
 */
function resolvePorts(env = process.env) {
  const webPort = readPort(env, 'WEB_PORT') ?? DEFAULT_WEB_PORT;
  const explicitApiPort = readPort(env, 'API_PORT');
  const apiPort = explicitApiPort ?? DEFAULT_API_PORT;

  const presetInternalUrl = (env.API_INTERNAL_URL ?? '').trim();
  const apiInternalUrl = presetInternalUrl || `http://127.0.0.1:${apiPort}`;

  const apiEnv = {};
  const webEnv = {};
  if (explicitApiPort !== null) {
    apiEnv.PORT = String(explicitApiPort);
    if (!presetInternalUrl) webEnv.API_INTERNAL_URL = apiInternalUrl;
  }
  return { webPort, apiPort, apiInternalUrl, apiEnv, webEnv };
}

module.exports = { DEFAULT_WEB_PORT, DEFAULT_API_PORT, resolvePorts };

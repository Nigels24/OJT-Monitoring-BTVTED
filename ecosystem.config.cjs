// PM2 process list — keeps the API and the website running, restarts them if
// they crash, and (with "pm2 startup" / pm2-windows-startup) starts them when
// the computer boots. PM2 is installed globally on the host computer; it is
// not a dependency of this project. See docs/DEPLOYMENT.md, "Start automatically".
//
//   pm2 start ecosystem.config.cjs
//   WEB_PORT=3003 API_PORT=3004 pm2 start ecosystem.config.cjs   (other ports)
//   pm2 save
const path = require('path');
const { resolvePorts } = require('./scripts/ports.cjs');

// Read when PM2 loads this file; see scripts/ports.cjs for how API_PORT
// reaches both programs. Change ports with pm2 delete + pm2 start, not restart.
const ports = resolvePorts();

const server = path.join(__dirname, 'app', 'server');
const client = path.join(__dirname, 'app', 'client');

module.exports = {
  apps: [
    {
      name: 'ojt-api',
      cwd: server, // app/server/.env is read from here
      script: path.join(server, 'dist', 'src', 'main.js'),
      env: ports.apiEnv, // PORT, only when API_PORT is set
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
    },
    {
      name: 'ojt-web',
      cwd: client, // app/client/.env is read from here
      script: path.join(client, 'node_modules', 'next', 'dist', 'bin', 'next'),
      args: `start -H 0.0.0.0 -p ${ports.webPort}`, // WEB_PORT, default 3001
      env: ports.webEnv, // API_INTERNAL_URL, only when API_PORT is set
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
    },
  ],
};

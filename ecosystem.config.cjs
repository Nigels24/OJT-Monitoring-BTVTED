// PM2 process list — keeps the API and the website running, restarts them if
// they crash, and (with "pm2 startup" / pm2-windows-startup) starts them when
// the computer boots. PM2 is installed globally on the host computer; it is
// not a dependency of this project. See docs/DEPLOYMENT.md, "Start automatically".
//
//   pm2 start ecosystem.config.cjs
//   pm2 save
const path = require('path');

const server = path.join(__dirname, 'app', 'server');
const client = path.join(__dirname, 'app', 'client');

module.exports = {
  apps: [
    {
      name: 'ojt-api',
      cwd: server, // app/server/.env is read from here
      script: path.join(server, 'dist', 'src', 'main.js'),
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
    },
    {
      name: 'ojt-web',
      cwd: client, // app/client/.env is read from here
      script: path.join(client, 'node_modules', 'next', 'dist', 'bin', 'next'),
      args: 'start -H 0.0.0.0 -p 3001',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
    },
  ],
};

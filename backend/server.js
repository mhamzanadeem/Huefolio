import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
try {
  const config = loadConfig();
  const app = createApp(config);
  const server = createServer(app.handler);
  server.requestTimeout = 35000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000; server.maxHeadersCount = 30;
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`Huefolio backend listening on port ${config.port}.`);
    console.log(!config.enabled ? 'Live analysis is disabled in the environment; sample colors remain available.'
      : config.reconcile ? 'Manual budget mode: initialize the process budget before analysis.'
      : `Analysis ready. Configured per-process budget: ${config.budget} units. No photo or analysis task is sent at startup.`);
  });
  server.on('error', () => { console.error('Backend listener failed.'); app.close(); process.exitCode = 1; });
  const stop = () => { app.close(); server.close(); setTimeout(() => process.exit(0), 25000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
} catch { console.error('Backend configuration is invalid. Check server environment settings.'); process.exitCode = 1; }

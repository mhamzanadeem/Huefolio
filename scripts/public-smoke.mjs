import assert from 'node:assert/strict';
// Anonymous, read-only checks. This command never uploads a photo or starts a paid task.
const [frontendInput, backendInput, mode] = process.argv.slice(2);
function exactOrigin(input) {
  const u = new URL(input);
  assert.ok(u.protocol === 'https:' && u.origin === input && !u.username && !u.password, 'Supply exact HTTPS origins without trailing slashes.');
  return u.origin;
}
try {
  const frontend = exactOrigin(frontendInput), backend = exactOrigin(backendInput);
  const get = (url, headers) => fetch(url, { headers, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(30000) });
  const home = await get(frontend); assert.equal(home.status, 200);
  assert.ok((await home.text()).includes('Built for the YouCam API Hackathon using API credits provided for hackathon development.'));
  const app = await get(frontend + '/src/app.js'); assert.equal(app.status, 200);
  assert.ok((await app.text()).includes('createSession'));
  const config = await get(frontend + '/src/config.js'); assert.equal(config.status, 200);
  assert.ok((await config.text()).includes(JSON.stringify(backend)), 'Frontend build does not point to the selected Render origin.');
  const health = await get(backend + '/healthz'); assert.equal(health.status, 200);
  const status = await get(backend + '/v1/capabilities', { Origin: frontend }); assert.equal(status.status, 200);
  assert.equal(status.headers.get('access-control-allow-origin'), frontend);
  assert.equal(status.headers.get('cache-control'), 'no-store');
  const capabilities = await status.json(), ready = Boolean(capabilities.enabled && capabilities.ready);
  assert.ok(ready || mode === '--allow-sample', 'Connected analysis is not ready. Reconcile the process budget, or explicitly allow the labeled sample demo.');
  console.log(`PASS: anonymous landing/assets, frontend backend URL, backend health and exact-origin CORS. Connected analysis ready: ${ready}. No photo sent. Browser journeys and a consented live YouCam analysis still require separate verification.`);
} catch {
  // Do not print response bodies, signed destinations, credentials or arbitrary exception text.
  console.error('Public smoke check failed. Check exact URLs, anonymous access, build configuration, health, CORS, and budget readiness.'); process.exitCode = 1;
}

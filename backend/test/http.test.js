import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';

// Real HTTP boundary, deliberately disabled analysis: never contacts YouCam or spends units.
test('HTTP health, exact-origin preflight, disabled analysis and sensitive-path rejection', async t => {
  const origin = 'https://huefolio.test';
  const app = createApp(loadConfig({ NODE_ENV: 'production', FRONTEND_ORIGINS: origin }));
  const server = createServer(app.handler);
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(base + '/healthz', { signal: AbortSignal.timeout(5000) });
    assert.equal(health.status, 200); assert.equal(health.headers.get('cache-control'), 'no-store');
    const denied = await fetch(base + '/v1/capabilities', { headers: { Origin: 'https://untrusted.example' }, signal: AbortSignal.timeout(5000) });
    assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);
    const preflight = await fetch(base + '/v1/analyses', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization,x-request-id,x-huefolio-consent' }, signal: AbortSignal.timeout(5000) });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
    const capability = await fetch(base + '/v1/capabilities', { headers: { Origin: origin }, signal: AbortSignal.timeout(5000) });
    assert.equal((await capability.json()).enabled, false);
    const disabled = await fetch(base + '/v1/analyses', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'image/png', Authorization: 'Bearer ' + 'f'.repeat(64), 'X-Request-Id': 'b6f28bc5-7576-4ad6-8e01-0d17ca49fe60', 'X-Huefolio-Consent': 'youcam-color-v1' }, body: new Uint8Array([1]), signal: AbortSignal.timeout(5000) });
    assert.equal(disabled.status, 503); assert.equal((await disabled.json()).error.code, 'ANALYSIS_DISABLED');
    for (const path of ['/.env', '/.git/config', '/v1/capabilities?photo=not-accepted']) {
      const response = await fetch(base + path, { headers: { Origin: origin }, signal: AbortSignal.timeout(5000) });
      assert.ok([400, 401, 404].includes(response.status));
      assert.equal(JSON.stringify(await response.json()).includes('apiKey'), false);
    }
  } catch (error) {
    const code = error.cause?.code || error.code;
    if (!process.env.CI && ['EACCES', 'EPERM'].includes(code)) t.skip('Sandbox denied loopback HTTP; handler-level security/workflow tests run separately.');
    else throw error;
  } finally {
    app.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});

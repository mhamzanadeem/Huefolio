import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { loadConfig } from '../config.js';
import { prepareImage } from '../image.js';
import { normalizeResults } from '../normalize.js';
import { YouCamProvider, WindowLimiter, validateUploadURL, isPublicAddress } from '../provider.js';
import { JobManager } from '../jobs.js';
import { createApp } from '../app.js';
import { AppError } from '../errors.js';
const sharp = createRequire(import.meta.url)('sharp');
const base = { ...loadConfig(), enabled: true, reconcile: false, apiKey: 'test-only-not-a-real-key', origins: ['https://huefolio.test'], uploadHosts: ['storage.example.invalid'], adminToken: 'a'.repeat(40), pollMs: 0 };
const id = 'b6f28bc5-7576-4ad6-8e01-0d17ca49fe60', token = 'f'.repeat(64);
const png = () => sharp({ create: { width: 320, height: 320, channels: 3, background: '#B89279' } }).png().toBuffer();
const result = { face_quality: { has_face: true, lighting: 'good', raw: 'must not escape' }, color: { skin_color: '#BA9279', eye_color: '#513C2D', eye_color_name: 'Brown', season: 'invented' }, secret: base.apiKey };
function fakeProvider(overrides = {}) {
  const calls = [];
  return { calls, register: async () => { calls.push('register'); return { file_id: 'private-file-id' }; }, upload: async () => { calls.push('upload'); }, submit: async () => { calls.push('submit'); return 'private-task-id'; }, poll: async () => { calls.push('poll'); return { task_status: 'success', results: result }; }, delete: async () => { calls.push('delete'); }, ...overrides };
}
async function invoke(handler, { method = 'GET', path = '/v1/capabilities', headers = {}, body = Buffer.alloc(0) } = {}) {
  const req = Readable.from(body.length ? [Buffer.from(body)] : []); Object.assign(req, { method, url: path, headers: { origin: 'https://huefolio.test', ...headers }, socket: { remoteAddress: '198.51.100.25' }, aborted: false });
  const res = { headers: {}, status: 0, destroyed: false, writableEnded: false, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, writeHead(s, h = {}) { this.status = s; for (const [k, v] of Object.entries(h)) this.setHeader(k, v); }, end(data) { this.writableEnded = true; this.body = data ? JSON.parse(data) : null; } };
  await handler(req, res); return res;
}
const auth = { authorization: `Bearer ${token}` };
const createHeaders = { ...auth, 'x-request-id': id, 'x-huefolio-consent': 'youcam-color-v1', 'content-type': 'image/png' };

test('configuration fails closed and never accepts alternate API hosts or wildcard upload hosts', () => {
  assert.throws(() => loadConfig({ YOUCAM_INTEGRATION_ENABLED: 'true' }));
  assert.throws(() => loadConfig({ YOUCAM_API_BASE_URL: 'https://evil.example' }));
  assert.throws(() => loadConfig({ YOUCAM_UPLOAD_HOSTS: '*.amazonaws.com' }));
  assert.throws(() => loadConfig({ FRONTEND_ORIGINS: 'https://example.com/path' }));
  assert.equal(loadConfig().reconcile, true);
});
test('validates magic/type, size and pixels; re-encodes without metadata entirely in memory', async () => {
  const bytes = await sharp(await png()).withMetadata({ exif: { IFD0: { Artist: 'Sensitive EXIF' } } }).png().toBuffer();
  const clean = await prepareImage(bytes, 'image/png');
  const meta = await sharp(clean).metadata();
  assert.equal(meta.format, 'jpeg'); assert.equal(meta.width, 320); assert.equal(meta.exif, undefined); assert.equal(meta.xmp, undefined);
  await assert.rejects(prepareImage(bytes, 'image/jpeg'), { code: 'IMAGE_TYPE' });
  await assert.rejects(prepareImage(Buffer.alloc(9500000), 'image/png'), { code: 'IMAGE_SIZE' });
  const tiny = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } }).png().toBuffer();
  await assert.rejects(prepareImage(tiny, 'image/png'), { code: 'IMAGE_DIMENSIONS' });
  await assert.rejects(prepareImage(Buffer.from([137,80,78,71,13,10,26,10,0,0]), 'image/png'), { code: 'IMAGE_DECODE' });
});
test('normalization drops undocumented fields, raw text, invalid colors and unsupported names', () => {
  const normalized = normalizeResults(result);
  assert.equal(normalized.partial, true); assert.equal(normalized.colors[0].hex, '#BA9279');
  assert.ok(!JSON.stringify(normalized).includes(base.apiKey)); assert.ok(!JSON.stringify(normalized).includes('invented'));
  assert.deepEqual(normalized.quality, { has_face: true, lighting: 'good' });
  assert.throws(() => normalizeResults({ color: { skin_color: '<script>' } }), { code: 'NO_COLOR_DATA' });
});

test('decoded image boundaries accept a 4096-pixel edge and reject oversized images before upload', async () => {
  const make = width => sharp({ create: { width, height: 320, channels: 3, background: '#B89279' } }).png().toBuffer();
  const accepted = await prepareImage(await make(4096), 'image/png');
  try { assert.equal((await sharp(accepted).metadata()).width, 4096); }
  finally { accepted.fill(0); }
  await assert.rejects(prepareImage(await make(4097), 'image/png'), { code: 'IMAGE_DIMENSIONS' });
});
test('signed destinations reject credentials, redirects/private addresses and unlisted hosts', async () => {
  const resolver = async () => [{ address: '93.184.216.34', family: 4 }];
  assert.equal((await validateUploadURL('https://storage.example.invalid/upload?signature=x', base.uploadHosts, resolver)).address.family, 4);
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '100.64.1.1', '::1', '::ffff:127.0.0.1', '2001:db8::1']) assert.equal(isPublicAddress(address), false);
  for (const url of ['http://storage.example.invalid/x', 'https://other.example/x', 'https://u:p@storage.example.invalid/x', 'https://storage.example.invalid:444/x']) await assert.rejects(validateUploadURL(url, base.uploadHosts, resolver));
  await assert.rejects(validateUploadURL('https://storage.example.invalid/x', base.uploadHosts, async () => [{ address: '127.0.0.1', family: 4 }]));
});
test('rolling limit is enforced before outbound requests and reopens after expiry', () => {
  let now = 0; const limit = new WindowLimiter(2, 300000, () => now);
  limit.take(); limit.take(); assert.throws(() => limit.take(), { code: 'UPSTREAM_RATE_LIMIT' });
  now = 300001; limit.take();
});
test('official workflow keeps provider key on authenticated API calls, and task IDs private', async () => {
  const calls = [];
  const provider = new YouCamProvider(base, {
    fetchImpl: async (url, opts) => {
      assert.ok(url.startsWith('https://yce-api-01.makeupar.com/'));
      assert.equal(opts.headers.Authorization, 'Bearer ' + base.apiKey); assert.equal(opts.redirect, 'error');
      calls.push(new URL(url).pathname);
      const body = url.endsWith('/file') ? { files: [{ file_id: 'file-private', requests: [{ method: 'PUT', url: 'https://storage.example.invalid/x', headers: {} }] }] }
        : url.endsWith('/skin-tone-analysis') ? { status: 200, data: { task_id: 'task/private+id' } }
        : url.endsWith('/delete') ? { status: 200 } : { status: 200, data: { task_status: 'success', results: result } };
      return Response.json(body);
    },
    uploadImpl: async (instruction, bytes) => { calls.push('signed-upload'); assert.equal(instruction.headers.Authorization, undefined); assert.ok(bytes.length); }
  });
  const manager = new JobManager(base, provider); const input = await png();
  try {
    const { job } = manager.admit(id, token); await manager.process(job, input, 'image/png');
    assert.deepEqual(calls, ['/s2s/v2.0/file', 'signed-upload', '/s2s/v2.0/task/skin-tone-analysis', '/s2s/v2.0/task/skin-tone-analysis/task%2Fprivate%2Bid', '/s2s/v2.0/task/delete']);
    const view = manager.view(job); assert.equal(view.stage, 'success'); assert.equal(view.cleanup, 'confirmed'); assert.equal(job.taskId, null); assert.equal(manager.reserved, 20); assert.ok(input.every(x => x === 0));
    assert.ok(!JSON.stringify(view).includes('private')); assert.ok(!JSON.stringify(view).includes(base.apiKey));
  } finally { manager.close(); }
});
test('duplicate requests do not submit another task; other tokens cannot read/cancel a job', async () => {
  const manager = new JobManager(base, fakeProvider());
  try {
    const first = manager.admit(id, token); const second = manager.admit(id, token);
    assert.equal(second.duplicate, true); assert.equal(first.job, second.job); assert.equal(manager.reserved, 20);
    assert.throws(() => manager.authorize(id, 'a'.repeat(64)), { code: 'SESSION_EXPIRED' });
    manager.rejectBody(first.job, new AppError('INVALID_BODY')); assert.equal(manager.reserved, 0);
  } finally { manager.close(); }
});
test('uncertain paid submission reserves budget and never retries; engine failure releases charge', async () => {
  const uncertain = fakeProvider({ submit: async () => { throw new AppError('PROVIDER_CONNECTION', 502); } });
  const manager = new JobManager(base, uncertain);
  try {
    const { job } = manager.admit(id, token); await manager.process(job, await png(), 'image/png');
    assert.equal(manager.reserved, 20); assert.equal(job.cleanup, 'unconfirmed'); assert.equal(job.stage, 'error');
  } finally { manager.close(); }
  const failure = fakeProvider({ poll: async () => ({ task_status: 'error', error: 'error_no_face' }) });
  const other = new JobManager(base, failure);
  try {
    const { job } = other.admit(id, token); await other.process(job, await png(), 'image/png');
    assert.equal(other.reserved, 0); assert.equal(job.stage, 'error'); assert.equal(job.cleanup, 'confirmed');
  } finally { other.close(); }
});
test('cancelled jobs continue to terminal cleanup but never return facial data', async () => {
  let manager;
  const provider = fakeProvider({ poll: async () => { manager.cancel(manager.jobs.get(id)); return { task_status: 'success', results: result }; } });
  manager = new JobManager(base, provider);
  try {
    const { job } = manager.admit(id, token); await manager.process(job, await png(), 'image/png');
    assert.equal(manager.view(job).stage, 'cancelled'); assert.equal(manager.view(job).result, undefined); assert.ok(provider.calls.includes('delete'));
  } finally { manager.close(); }
});
test('HTTP boundary enforces origin, consent, token, type, byte limit, and disabled mode', async () => {
  const app = createApp({ ...base, enabled: false });
  try {
    assert.equal((await invoke(app.handler, { headers: { origin: 'https://evil.test' } })).status, 403);
    assert.equal((await invoke(app.handler, { method: 'OPTIONS' })).status, 204);
    assert.equal((await invoke(app.handler, { method: 'POST', path: '/v1/analyses', headers: auth })).status, 400);
    assert.equal((await invoke(app.handler, { method: 'POST', path: '/v1/analyses', headers: { ...createHeaders, 'content-type': 'image/svg+xml' } })).status, 415);
    assert.equal((await invoke(app.handler, { method: 'POST', path: '/v1/analyses', headers: { ...createHeaders, 'content-length': '9500000' } })).status, 413);
    const response = await invoke(app.handler, { method: 'POST', path: '/v1/analyses', headers: createHeaders });
    assert.equal(response.status, 503); assert.equal(response.headers['cache-control'], 'no-store');
  } finally { app.close(); }
});
test('budget must be armed per process and cannot be reset to bypass spending', () => {
  const manager = new JobManager({ ...base, reconcile: true }, fakeProvider());
  try {
    assert.throws(() => manager.admit(id, token), { code: 'ANALYSIS_UNAVAILABLE' });
    manager.arm(20); manager.admit(id, token);
    assert.throws(() => manager.arm(800), { code: 'BUDGET_ALREADY_ARMED' });
    assert.throws(() => manager.admit('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', token), { code: 'BUDGET_EXHAUSTED' });
  } finally { manager.close(); }
});
test('accepted HTTP request reaches normalized status, blocks another owner, and cancels safely', async () => {
  const provider = fakeProvider(), app = createApp(base, { provider });
  try {
    const accepted = await invoke(app.handler, { method: 'POST', path: '/v1/analyses', headers: createHeaders, body: await png() });
    assert.equal(accepted.status, 202);
    for (let i = 0; i < 100 && app.manager.jobs.get(id).active; i++) await new Promise(resolve => setTimeout(resolve, 10));
    const completed = await invoke(app.handler, { path: '/v1/analyses/' + id, headers: auth });
    assert.equal(completed.body.stage, 'success'); assert.equal(completed.body.result.source, 'youcam');
    const other = await invoke(app.handler, { path: '/v1/analyses/' + id, headers: { authorization: 'Bearer ' + 'a'.repeat(64) } });
    assert.equal(other.status, 404);
    const duplicate = await invoke(app.handler, { method: 'POST', path: '/v1/analyses', headers: createHeaders, body: await png() });
    assert.equal(duplicate.status, 200); assert.equal(provider.calls.filter(c => c === 'submit').length, 1);
    const cancelled = await invoke(app.handler, { method: 'DELETE', path: '/v1/analyses/' + id, headers: auth });
    assert.equal(cancelled.body.stage, 'cancelled'); assert.equal(cancelled.body.result, undefined);
    assert.equal(app.manager.jobs.get(id).result, null);
    const afterRelease = await invoke(app.handler, { method: 'POST', path: '/v1/analyses', headers: createHeaders, body: await png() });
    assert.equal(afterRelease.body.stage, 'cancelled'); assert.equal(provider.calls.filter(c => c === 'submit').length, 1, 'released results must not allow duplicate paid submissions');
  } finally { app.close(); }
});
test('bounded timeout retains uncertain spending and reports failed running-task cleanup honestly', async () => {
  let clock = 0;
  const provider = fakeProvider({ poll: async () => ({ task_status: 'running' }), delete: async () => { throw new AppError('CLEANUP_RUNNING', 409); } });
  const manager = new JobManager({ ...base, pollMs: 10, interactiveMs: 5, cleanupMs: 30 }, provider, { now: () => clock, wait: async ms => { clock += ms; } });
  try {
    const { job } = manager.admit(id, token); await manager.process(job, await png(), 'image/png');
    assert.equal(job.error.code, 'ANALYSIS_TIMEOUT'); assert.equal(job.cleanup, 'unconfirmed'); assert.equal(manager.reserved, 20); assert.equal(manager.active, 0);
  } finally { manager.close(); }
});
test('expired jobs discard facial results even while cleanup is active', () => {
  let clock = 0; const manager = new JobManager(base, fakeProvider(), { now: () => clock });
  try {
    const { job } = manager.admit(id, token); job.result = normalizeResults(result);
    clock = base.resultTtlMs + 1; manager.sweep();
    assert.equal(job.result, null); assert.equal(job.cancelled, true);
    assert.throws(() => manager.authorize(id, token), { code: 'SESSION_EXPIRED' });
    manager.finish(job); manager.sweep(); assert.equal(manager.jobs.size, 0);
  } finally { manager.close(); }
});
test('provider distinguishes rate-limit/credit rejection from uncertain transport failure', async () => {
  const limited = new YouCamProvider(base, { fetchImpl: async () => Response.json({ status: 429, error: 'raw vendor detail' }, { status: 429, headers: { 'Retry-After': '60' } }) });
  await assert.rejects(limited.submit('private'), error => error.code === 'UPSTREAM_RATE_LIMIT' && error.retryAfter === 60 && error.definitiveRejection && !error.message.includes('raw vendor'));
  const failed = new YouCamProvider(base, { fetchImpl: async () => { throw new Error(base.apiKey); } });
  await assert.rejects(failed.submit('private'), error => error.code === 'PROVIDER_CONNECTION' && !error.definitiveRejection && !error.message.includes(base.apiKey));
  const exhausted = new YouCamProvider(base, { fetchImpl: async () => Response.json({ status: 400, error_code: 'CreditInsufficiency' }, { status: 400 }) });
  await assert.rejects(exhausted.submit('private'), { code: 'CREDITS_EXHAUSTED' });
});

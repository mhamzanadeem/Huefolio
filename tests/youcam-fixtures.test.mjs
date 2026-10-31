import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const fixture = async name => JSON.parse(await readFile(new URL(`../integration/fixtures/${name}.synthetic.json`, import.meta.url), 'utf8'));

test('synthetic selected-endpoint examples use documented output names and separate task states', async () => {
  const success = await fixture('color-success');
  assert.equal(success.status, 200);
  assert.equal(success.data.task_status, 'success');
  assert.deepEqual(Object.keys(success.data.results).sort(), ['color', 'face_quality']);
  const color = success.data.results.color;
  assert.deepEqual(Object.keys(color).sort(), ['eye_color', 'eye_color_name', 'eyebrow_color', 'hair_color', 'hair_color_name', 'lip_color', 'skin_color']);
  for (const key of ['eye_color', 'eyebrow_color', 'hair_color', 'lip_color', 'skin_color']) assert.match(color[key], /^#[A-Fa-f0-9]{6}$/);
  assert.ok(['#a0a0a0', '#722626', '#000000', '#FAF0BE', '#42280E', '#808080', '#B56637'].includes(color.hair_color));
  const running = await fixture('task-running');
  assert.equal(running.data.task_status, 'running');
  assert.equal(running.data.results, undefined);
  const engineFailure = await fixture('task-error');
  assert.equal(engineFailure.status, 200);
  assert.equal(engineFailure.data.task_status, 'error');
  assert.equal(engineFailure.data.error, 'error_no_face');
  const requestFailure = await fixture('http-credit-error');
  assert.equal(requestFailure.status, 400);
  assert.equal(requestFailure.error_code, 'CreditInsufficiency');
  assert.equal(requestFailure.data, undefined);
});

test('upload fixtures cannot point to a live signed destination and stay outside app assets', async () => {
  const upload = await fixture('file-created');
  assert.equal(upload.data, undefined);
  assert.equal(upload.files.length, 1);
  assert.match(upload.files[0].file_id, /^synthetic-/);
  assert.equal(new URL(upload.files[0].requests[0].url).hostname, 'example.invalid');
  assert.equal(upload.files[0].requests[0].headers.Authorization, undefined);
  for (const file of (await readdir(new URL('../src/', import.meta.url))).filter(f => f.endsWith('.js'))) {
    const text = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.ok(!text.includes('synthetic.json'), 'Live frontend must not import synthetic provider fixtures');
    assert.ok(!text.includes('YOUCAM_API_KEY'), 'API key configuration must not enter the frontend');
  }
});

test('partial and optional examples do not manufacture missing colors or cancellation', async () => {
  const partial = await fixture('color-partial');
  assert.deepEqual(Object.keys(partial.data.results.color), ['skin_color']);
  const optional = await fixture('face-shape');
  assert.deepEqual(optional.data.results, { faceshape: 'Oval' });
  assert.equal((await fixture('delete-running-error')).error_code, 'OperationInvalid');
  assert.equal((await fixture('delete-finished')).status, 200);
  assert.match((await fixture('task-created')).data.task_id, /^synthetic-/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { complement, normalizeHex, validatePhoto, MAX_PHOTO_BYTES, createSession, routes, routeFromHash, occasions, sampleColors } from '../src/model.js';
import { colorDistance } from '../src/color-intelligence.js';
import { escapeHTML } from '../src/components.js';
import { textSummary } from '../src/export.js';

test('hue complement rotates hue without inverting grayscale lightness', () => {
  assert.equal(complement('#FF0000'), '#00FFFF');
  assert.equal(complement('#000000'), '#000000');
  assert.equal(complement('#FFFFFF'), '#FFFFFF');
  assert.equal(complement('#808080'), '#808080');
  assert.equal(complement(complement('#A7B59E')), '#A7B59E');
});
test('color comparison is symmetric and never a compatibility percentage', () => {
  assert.ok(Math.abs(colorDistance('#FFFFFF', '#000000') - 100) < .00001);
  assert.equal(colorDistance('#A7B59E', '#A7B59E'), 0);
  assert.equal(colorDistance('#A7B59E', '#8C493B'), colorDistance('#8C493B', '#A7B59E'));
});
test('color input accepts only complete HEX values', () => {
  assert.equal(normalizeHex(' #abcdef '), '#ABCDEF');
  for (const bad of ['#abc', 'red', '#12345G', '<img>', '#12345678']) assert.equal(normalizeHex(bad), null);
});
test('local photo validation rejects unsupported, empty, and oversized files', () => {
  assert.match(validatePhoto({ type: 'image/svg+xml', size: 10 }), /JPG or PNG/);
  assert.match(validatePhoto({ type: 'image/png', size: 0 }), /empty/);
  assert.match(validatePhoto({ type: 'image/png', size: MAX_PHOTO_BYTES }), /9.5 MB/);
  assert.equal(validatePhoto({ type: 'image/jpeg', size: 100 }), '');
});
test('sessions and routes have explicit empty defaults', () => {
  const a = createSession(), b = createSession(); a.included[0] = false;
  assert.equal(b.included[0], true);
  assert.equal(b.photo, null); assert.equal(b.demo, false); assert.equal(b.consent, false);
  for (const route of routes) assert.equal(routeFromHash('#' + route), route);
  assert.equal(routeFromHash('#/missing'), '/not-found');
});
test('occasion arrangements reference only existing palette colors', () => {
  assert.equal(Object.keys(occasions).length, 6);
  for (const o of Object.values(occasions)) {
    assert.equal(o.order.length, 3);
    assert.equal(new Set(o.order).size, 3);
    for (const index of o.order) assert.ok(sampleColors[index]);
  }
});
test('export has accurate sample provenance and selected colors only', () => {
  const result = textSummary([sampleColors[0]]);
  assert.match(result, /Not personal analysis or API results/);
  assert.match(result, /#A7B59E/); assert.ok(!result.includes('#C58F85'));
});
test('photo filenames cannot inject markup', () => {
  assert.equal(escapeHTML('<img src=x onerror="bad">'), '&lt;img src=x onerror=&quot;bad&quot;&gt;');
});

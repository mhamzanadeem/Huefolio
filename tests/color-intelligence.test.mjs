import test from 'node:test';
import assert from 'node:assert/strict';
import { toHSL, fromHSL, toOKLab, colorDistance, contrastRatio, hueGap, compareColors, generatePalette, nearestColor, occasionCombination } from '../src/color-intelligence.js';
import { createSession, measuredColors, personalPalette, workspaceColors, hasWorkspace, selectedCardColors, occasions } from '../src/model.js';
import { cardContext } from '../src/product-components.js';
import { textSummary } from '../src/export.js';
const input = [{ field: 'skin_color', name: 'Skin', hex: '#BA9279' }, { field: 'eye_color', name: 'Eyes', apiName: 'Brown', hex: '#513C2D' }];
const session = () => ({ ...createSession(), profile: { colors: structuredClone(input), partial: true } });
const near = (a, b, tolerance = .00001) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);

test('HSL conversion roundtrips extremes and arbitrary colors without hue wrap errors', () => {
  for (const hex of ['#FF0000', '#808080', '#000000', '#FFFFFF', '#BA9279', '#513C2D']) { const c = toHSL(hex); assert.equal(fromHSL(c.h, c.s, c.l), hex); }
  assert.equal(fromHSL(-180, 1, .5), '#00FFFF');
});
test('OKLab matches reference primary coordinates and distance is symmetric', () => {
  const red = toOKLab('#FF0000'); near(red[0], .62795536); near(red[1], .22486306); near(red[2], .12584630);
  near(colorDistance('#FFFFFF', '#000000'), 100);
  assert.equal(colorDistance('#BA9279', '#BA9279'), 0);
  near(colorDistance('#BA9279', '#513C2D'), colorDistance('#513C2D', '#BA9279'));
});
test('text contrast is distinct from hue and suppresses meaningless neutral hue labels', () => {
  near(contrastRatio('#FFFFFF', '#000000'), 21);
  near(contrastRatio('#BA9279', '#BA9279'), 1);
  assert.equal(hueGap('#808080', '#FF0000'), null);
  assert.equal(hueGap('#000000', '#FFFFFF'), null);
  near(hueGap('#FF0000', '#00FFFF'), 180);
  assert.equal(compareColors('#FF0000', '#00FFFF').title, 'A complementary hue pairing.');
});
test('generated colors are deterministic, traceable and do not mutate API measurements', () => {
  const s = session(), original = JSON.stringify(s.profile);
  const measured = measuredColors(s), generated = generatePalette(measured);
  assert.ok(generated.length > 0); assert.deepEqual(generated, generatePalette(measured));
  for (const c of generated) {
    assert.equal(c.source, 'app'); assert.match(c.hex, /^#[\dA-F]{6}$/); assert.equal(c.anchor.hex, '#BA9279'); assert.equal(c.algorithm, 'huefolio-hsl-v1'); assert.ok(c.recipe.includes('HSL'));
    assert.ok(!measured.some(x => x.hex === c.hex)); assert.equal(c.field, undefined); assert.equal(c.apiName, undefined);
  }
  assert.equal(JSON.stringify(s.profile), original); assert.equal(new Set(generated.map(c => c.hex)).size, generated.length);
});
test('direction changes only suggestions; their IDs change when their values change', () => {
  const s = session(), before = measuredColors(s), old = personalPalette(s).filter(c => c.source === 'app');
  s.direction = 'soft'; assert.deepEqual(measuredColors(s), before);
  const next = personalPalette(s).filter(c => c.source === 'app');
  assert.notDeepEqual(old.map(c => c.hex), next.map(c => c.hex));
  next.forEach((c, i) => { if (old[i].hex !== c.hex) assert.notEqual(old[i].id, c.id); });
});
test('empty, malformed, single-color and grayscale profiles never gain fabricated measurements', () => {
  assert.equal(hasWorkspace(createSession()), false); assert.deepEqual(generatePalette([]), []);
  const s = session(); s.profile.colors = [{ name: 'Skin', hex: 'bad' }]; assert.deepEqual(workspaceColors(s), []); assert.equal(hasWorkspace(s), false);
  s.profile.colors = [{ field: 'skin_color', name: 'Skin', hex: '#808080' }];
  assert.equal(measuredColors(s).length, 1);
  for (const c of personalPalette(s)) { const hsl = toHSL(c.hex); near(hsl.s, 0); }
  assert.deepEqual(occasionCombination([], 'Wedding'), []);
  assert.equal(occasionCombination(measuredColors(s), 'Wedding').length, 1);
  s.profile.colors = [{ field: 'undertone', name: 'Invented warm label', hex: '#BA9279' }, null, { field: 'eye_color', name: 'Unsafe custom name', apiName: 'Spring', hex: '#513C2D' }, { field: 'eye_color', hex: '#000000' }];
  assert.deepEqual(measuredColors(s), [{ id: 'api-eye_color', field: 'eye_color', name: 'Eyes', hex: '#513C2D', source: 'youcam' }]);
});
test('all six occasions use available colors with distinct roles instead of repeated placeholders', () => {
  const palette = workspaceColors(session());
  for (const occasion of Object.keys(occasions)) {
    const combo = occasionCombination(palette, occasion);
    assert.equal(combo.length, 3); assert.equal(new Set(combo.map(x => x.color.hex)).size, 3);
    assert.deepEqual(combo.map(x => x.role), ['Base', 'Supporting', 'Accent']);
    combo.forEach(x => assert.ok(palette.some(c => c.id === x.color.id)));
  }
  const wedding = occasionCombination(palette, 'Wedding')[0], professional = occasionCombination(palette, 'Professional')[0];
  assert.ok(toHSL(wedding.color.hex).l > toHSL(professional.color.hex).l);
});
test('user picks do not redefine nearest personal palette reference or measured profile', () => {
  const s = session(), original = measuredColors(s);
  s.userColors.push({ id: 'user-123456', name: 'Your choice #123456', hex: '#123456', source: 'user' });
  assert.deepEqual(measuredColors(s), original);
  assert.ok(workspaceColors(s).some(c => c.source === 'user'));
  assert.ok(!personalPalette(s).some(c => c.source === 'user'));
  assert.ok(nearestColor('#123456', personalPalette(s)).color.source !== 'user');
});
test('card snapshots include only selected colors, provenance and explicit available characteristics/preferences', () => {
  const s = session(), colors = workspaceColors(s); s.included = colors.map((c, i) => i === 0 || c.source === 'app' && i === 2); s.occasion = 'Traditional event';
  const selected = selectedCardColors(s), context = cardContext(s), text = textSummary(selected, false, context);
  assert.equal(selected.length, 2); assert.match(text, /YouCam value/); assert.match(text, /Huefolio calculation/); assert.match(text, /input Skin #BA9279/); assert.match(text, /Eyes \(Brown\)/); assert.match(text, /Traditional event/);
  s.includeCharacteristics = false;
  const omitted = textSummary(selected, false, cardContext(s)); assert.ok(!omitted.includes('Eyes (Brown)')); assert.match(omitted, /Profile details omitted/);
  const fresh = createSession(); assert.deepEqual(fresh.userColors, []); assert.equal(fresh.profile, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, measuredColors, workspaceColors } from '../src/model.js';
import { createLeaveGuard, hasSessionData, isSessionExpired } from '../src/session-privacy.js';
import { collectionDocument } from '../src/export.js';
import { occasionCombination } from '../src/color-intelligence.js';

test('leave guard is conditional, never discards work when leaving is cancelled, and detaches after reset', () => {
  let session = createSession(); const target = new EventTarget(), guard = createLeaveGuard(() => session, target);
  guard.sync(); let event = new Event('beforeunload', { cancelable: true });
  target.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
  session.photo = { file: 'synthetic photo reference' }; guard.sync(); guard.sync();
  event = new Event('beforeunload', { cancelable: true }); target.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true); assert.ok(session.photo, 'choosing Stay must preserve the session');
  session = createSession(); guard.sync(); event = new Event('beforeunload', { cancelable: true }); target.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false); guard.dispose();
});

test('absolute expiry survives delayed timers and all sensitive session stages require a leave guard', () => {
  assert.equal(isSessionExpired(createSession(), 1), false);
  assert.equal(isSessionExpired({ expiresAt: 100 }, 99), false);
  assert.equal(isSessionExpired({ expiresAt: 100 }, 100), true);
  for (const field of ['photo', 'photoLoading', 'profile', 'job', 'demo']) assert.equal(hasSessionData({ ...createSession(), [field]: true }), true);
  assert.equal(hasSessionData(createSession()), false);
});

test('palette and combination downloads preserve provenance and roles without leaking photos, tokens or extra response fields', () => {
  const session = createSession(); session.profile = { colors: [{ field: 'skin_color', hex: '#BA9279', secret: 'private' }, { field: 'eye_color', hex: '#513C2D', apiName: 'Brown' }] };
  session.userColors.push({ name: 'Your choice', hex: '#112233', source: 'user', file: 'private', token: 'private' });
  const colors = workspaceColors(session), palette = collectionDocument(colors);
  assert.equal(palette.colors.length, colors.length); assert.equal(palette.illustrativeSample, false);
  assert.deepEqual(palette.colors.slice(0, 2).map(c => c.source), ['YouCam value', 'YouCam value']);
  assert.ok(palette.colors.find(c => c.source === 'Huefolio calculation').input);
  assert.equal(palette.colors.at(-1).source, 'Chosen by you');
  assert.equal(JSON.stringify(palette).includes('private'), false);
  const combination = occasionCombination(colors, 'Traditional event');
  const output = collectionDocument(combination.map(c => c.color), { occasion: 'Traditional event', roles: combination.map(c => c.role) });
  assert.deepEqual(output.colors.map(c => c.role), combination.map(c => c.role));
  assert.equal(output.preferences.occasion, 'Traditional event');
  assert.deepEqual(measuredColors(session).map(c => c.hex), ['#BA9279', '#513C2D']);
  assert.equal(collectionDocument([], { demo: true }).illustrativeSample, true);
});

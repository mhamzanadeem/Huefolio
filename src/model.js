import { generatePalette, normalizeHex } from './color-intelligence.js';
export { normalizeHex, rgb, complement } from './color-intelligence.js';
export const routes = ['/', '/upload', '/processing', '/results', '/palette', '/lab', '/occasions', '/style', '/export'];
export const sampleColors = [
  { name: 'Soft sage', hex: '#A7B59E' }, { name: 'Dusty lilac', hex: '#B4A3C5' },
  { name: 'Muted rose', hex: '#C58F85' }, { name: 'Oat cream', hex: '#E6D8BC' },
  { name: 'Deep olive', hex: '#535D49' }
];
export const occasions = {
  Wedding: { title: 'Softly celebratory.', order: [3, 0, 2], note: 'A gentle base, a leafy supporting shade, and a rose accent.' },
  Interview: { title: 'Quiet confidence.', order: [4, 3, 0], note: 'A grounded base with a light supporting shade and a quiet accent.' },
  Party: { title: 'A little unexpected.', order: [1, 4, 2], note: 'Lilac takes the lead, with depth and a warm accent.' },
  Professional: { title: 'Considered and composed.', order: [4, 0, 3], note: 'Olive and sage, lifted with a light accent.' },
  Casual: { title: 'Easy, everyday color.', order: [0, 3, 1], note: 'An easy base with a neighboring accent.' },
  'Traditional event': { title: 'Color with personal meaning.', order: [4, 3, 2], note: 'Follow the cultural context and dress code of your event. These are creative color roles, not cultural rules.' }
};
export function createSession() {
  return { demo: false, profile: null, job: null, expiresAt: null, analysisStage: 'idle', analysisError: '', backendReady: false, backendStatus: 'checking', photo: null, judgePortrait: '', consent: false, selected: 0, included: sampleColors.map(() => true), occasion: 'Wedding', wardrobeStyle: 'auto', stylingGender: '', styleCountry: '', makeupPreference: 'auto', customGarments: ['', '', '', '', ''], candidate: '#8C493B', userColors: [], direction: 'balanced', includeCharacteristics: true, exportStatus: 'idle', download: null, uploadError: '', labError: '' };
}
export function measuredColors(session) {
  const colors = session.demo ? sampleColors : Array.isArray(session.profile?.colors) ? session.profile.colors : [];
  if (session.demo) return colors.map((c, i) => ({ ...c, id: `sample-${i}`, source: 'sample' }));
  const names = { skin_color: 'Skin', eye_color: 'Eyes', lip_color: 'Lips', eyebrow_color: 'Eyebrows', hair_color: 'Hair' }, seen = new Set();
  return colors.filter(c => c && Object.hasOwn(names, c.field) && normalizeHex(c.hex) && !seen.has(c.field) && seen.add(c.field)).map(c => {
    const apiNames = c.field === 'eye_color' ? ['Amber', 'Brown', 'Green', 'Blue', 'Gray', 'Other'] : c.field === 'hair_color' ? ['Auburn', 'Black', 'Blonde', 'Brown', 'Grey/White', 'Red'] : [];
    return { id: `api-${c.field}`, field: c.field, name: names[c.field], hex: normalizeHex(c.hex), source: 'youcam', ...(apiNames.includes(c.apiName) ? { apiName: c.apiName } : {}) };
  });
}
export const personalPalette = session => { const measured = measuredColors(session); return [...measured, ...generatePalette(measured, session.direction)]; };
export const workspaceColors = session => [...personalPalette(session), ...session.userColors];
export const hasWorkspace = session => measuredColors(session).length > 0;
export const selectedCardColors = session => workspaceColors(session).filter((_, i) => session.included[i]);
export const MAX_PHOTO_BYTES = 9500000;
export function validatePhoto(file) {
  if (!['image/jpeg', 'image/png'].includes(file.type)) return 'Choose a JPG or PNG photo.';
  if (!file.size) return 'This photo is empty. Choose another file.';
  if (file.size >= MAX_PHOTO_BYTES) return 'Choose a photo smaller than 9.5 MB.';
  return '';
}
export function routeFromHash(hash) { const route = hash.replace(/^#/, '') || '/'; return routes.includes(route) ? route : '/not-found'; }

export function analysisHelp(s) {
  if (s.job) return 'Your analysis is already running. View it to check or cancel.';
  if (s.backendReady) return s.photo && s.consent ? 'Sends this photo to YouCam for analysis.' : 'Choose a photo and agree to the notice to continue.';
  return ({
    checking: 'Checking the analysis backend…',
    disabled: 'Live analysis is switched off on the backend. Sample colors are still available.',
    budget_required: 'The backend is waiting for its operator to initialize the analysis budget.',
    unconfigured: 'This frontend has no analysis backend configured. Sample colors are still available.',
    unreachable: 'Cannot reach the analysis backend. Start it, then check the connection again.',
    unavailable: 'The analysis backend is temporarily unavailable. Check the connection again.'
  })[s.backendStatus] || 'Connected analysis is currently unavailable.';
}

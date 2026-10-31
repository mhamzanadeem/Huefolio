import { AppError } from './errors.js';
const fields = [['skin_color', 'Skin'], ['eye_color', 'Eyes'], ['lip_color', 'Lips'], ['eyebrow_color', 'Eyebrows'], ['hair_color', 'Hair']];
const eyes = new Set(['Amber', 'Brown', 'Green', 'Blue', 'Gray', 'Other']);
const hair = new Set(['Auburn', 'Black', 'Blonde', 'Brown', 'Grey/White', 'Red']);
const hairHexes = new Set(['#A0A0A0', '#722626', '#000000', '#FAF0BE', '#42280E', '#808080', '#B56637']);
export function normalizeResults(results) {
  if (results?.face_quality?.has_face === false) throw new AppError('IMAGE_ANALYSIS_FAILED', 422, 'Use a clear photo of one person facing the camera.');
  const colors = [];
  for (const [field, label] of fields) {
    const value = results?.color?.[field];
    if (typeof value !== 'string' || !/^#[a-f0-9]{6}$/i.test(value)) continue;
    if (field === 'hair_color' && !hairHexes.has(value.toUpperCase())) continue;
    const color = { field, name: label, hex: value.toUpperCase(), source: 'youcam' };
    const name = results.color[field + '_name'];
    if ((field === 'eye_color' && eyes.has(name)) || (field === 'hair_color' && hair.has(name))) color.apiName = name;
    colors.push(color);
  }
  if (!colors.length) throw new AppError('NO_COLOR_DATA', 422, 'No usable color values were returned. Choose another photo.');
  const quality = {};
  if (typeof results?.face_quality?.has_face === 'boolean') quality.has_face = results.face_quality.has_face;
  // Only known-safe explanatory strings are forwarded, never raw upstream text.
  for (const k of ['area', 'frontal', 'lighting', 'faceangle']) {
    if (['good', 'notgood', 'ok', 'toosmall', 'outofboundary'].includes(results?.face_quality?.[k])) quality[k] = results.face_quality[k];
  }
  return { source: 'youcam', colors, quality, partial: colors.length < fields.length };
}

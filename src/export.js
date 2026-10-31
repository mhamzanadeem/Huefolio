import { sourceLabel } from './color-intelligence.js';
// Export an explicit snapshot of this session only. No photo enters this module.
export async function createCardPNG(colors, demo = true, context = null) {
  if (!colors.length || colors.length > 8) throw new Error('Choose between one and eight card colors.');
  const canvas = document.createElement('canvas');
  const offset = colors.length > 4 ? 0 : -280;
  canvas.width = 1400; canvas.height = 1500 + offset;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');
  const text = (value, x, y, size = 24, maxWidth = 1240, family = 'Arial') => {
    ctx.fillStyle = '#292B2A'; let font = size;
    do { ctx.font = `${font}px ${family}`; if (ctx.measureText(String(value)).width <= maxWidth || font <= 15) break; font--; } while (font > 15);
    ctx.fillText(String(value), x, y, maxWidth);
  };
  ctx.fillStyle = '#F8F5EF'; ctx.fillRect(0, 0, 1400, canvas.height);
  text('huefolio', 80, 100, 52, 500, 'Georgia'); text('YOUR PERSONAL CANVAS', 80, 168, 18);
  text('A little more you, in color.', 80, 245, 70, 1240, 'Georgia');
  const columns = Math.min(4, colors.length), gap = 28, width = (1240 - gap * (columns - 1)) / columns;
  colors.forEach((c, i) => {
    const x = 80 + (i % columns) * (width + gap), y = 290 + Math.floor(i / columns) * 280;
    ctx.fillStyle = c.hex; ctx.beginPath(); ctx.roundRect(x, y, width, 165, [Math.min(width / 2, 70), Math.min(width / 2, 70), 6, 6]); ctx.fill();
    text(c.name, x, y + 199, 23, width); text(c.hex, x, y + 231, 22, width, 'monospace'); text(sourceLabel(c), x, y + 257, 17, width);
  });
  text(demo ? 'SAMPLE REFERENCE COLORS' : 'YOUCAM COLOR PROFILE', 80, 925 + offset, 19);
  const measured = context?.measured || [];
  if (measured.length) measured.slice(0, 5).forEach((c, i) => text(`${c.name}${c.apiName ? ` (${c.apiName})` : ''} · ${c.hex}`, 80 + (i % 2) * 630, 978 + offset + Math.floor(i / 2) * 42, 24, 600));
  else text(context?.includeCharacteristics === false ? 'Profile details omitted by your choice.' : 'No measured profile included.', 80, 978 + offset, 24);
  text('YOUR PREFERENCES', 80, 1180 + offset, 19);
  text(`Color direction: ${context?.direction || 'Balanced'}`, 80, 1230 + offset, 26); text(`Occasion: ${context?.occasion || 'Not selected'}`, 80, 1275 + offset, 26);
  text('Huefolio suggestions use HSL color calculations, not seasonal or undertone classifications.', 80, 1345 + offset, 20);
  text(demo ? 'Illustrative sample · Not personal analysis or API results' : 'Measured values: YouCam · Calculated colors: Huefolio · Personal picks: You', 80, 1390 + offset, 22);
  text('Your colors. Your identity. Your style.', 80, 1445 + offset, 22);
  return new Promise((resolve, reject) => canvas.toBlob(blob => { canvas.width = canvas.height = 1; blob ? resolve(blob) : reject(new Error('PNG export failed')); }, 'image/png'));
}
export function textSummary(colors, demo = true, context = null) {
  return ['HUEFOLIO — COLOR NOTES', demo ? 'Illustrative sample. Not personal analysis or API results.' : 'Active-session color identity. Measured values are from YouCam.', '', 'SELECTED PALETTE', ...colors.map(c => `${c.name}: ${c.hex} — ${sourceLabel(c)}${c.recipe ? `; ${c.recipe}; input ${c.anchor.name} ${c.anchor.hex}; ${c.algorithm}` : ''}`), '', demo ? 'SAMPLE REFERENCE COLORS' : 'YOUCAM COLOR PROFILE', ...(context?.measured || []).map(c => `${c.name}${c.apiName ? ` (${c.apiName})` : ''}: ${c.hex}`), ...(!context?.measured?.length ? [context?.includeCharacteristics === false ? 'Profile details omitted by your choice.' : 'No measured profile included.'] : []), '', 'USER PREFERENCES', `Color direction: ${context?.direction || 'Balanced'}`, `Occasion: ${context?.occasion || 'Not selected'}`, '', 'Huefolio calculations are creative suggestions, not YouCam classifications or guaranteed fashion rules.', 'No photo included.', 'Your colors. Your identity. Your style.'].join('\n');
}
export function collectionDocument(colors, { demo = false, title = 'My color palette', direction = 'Balanced', occasion, roles = [] } = {}) {
  return {
    format: 'huefolio-colors-v1', title, illustrativeSample: demo,
    preferences: { direction, ...(occasion ? { occasion } : {}) },
    colors: colors.map((c, i) => ({ name: c.name, hex: c.hex, source: sourceLabel(c), ...(roles[i] ? { role: roles[i] } : {}), ...(c.apiName ? { apiName: c.apiName } : {}), ...(c.recipe ? { calculation: c.recipe, input: { name: c.anchor.name, hex: c.anchor.hex }, algorithm: c.algorithm } : {}) })),
    note: 'Huefolio calculations are creative suggestions, not YouCam classifications. No photo included.'
  };
}
export async function createCollectionPNG(colors, options = {}) {
  if (!colors.length || colors.length > 20) throw new Error('Choose a valid palette to download.');
  const data = collectionDocument(colors, options), canvas = document.createElement('canvas');
  const columns = Math.min(4, colors.length), rows = Math.ceil(colors.length / columns);
  canvas.width = 1400; canvas.height = 280 + rows * 270;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is unavailable');
  ctx.fillStyle = '#F8F5EF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const text = (value, x, y, size = 24, width = 1240) => { ctx.fillStyle = '#292B2A'; ctx.font = `${size}px Arial`; ctx.fillText(String(value), x, y, width); };
  ctx.fillStyle = '#292B2A'; ctx.font = '46px Georgia'; ctx.fillText('huefolio', 80, 85);
  text(data.title, 80, 137, 28); text(`Direction: ${data.preferences.direction}${data.preferences.occasion ? ' · ' + data.preferences.occasion : ''}`, 80, 178, 20);
  const gap = 28, width = (1240 - gap * (columns - 1)) / columns;
  data.colors.forEach((c, i) => {
    const x = 80 + i % columns * (width + gap), y = 220 + Math.floor(i / columns) * 270;
    ctx.fillStyle = c.hex; ctx.beginPath(); ctx.roundRect(x, y, width, 140, [40, 40, 6, 6]); ctx.fill();
    text(c.role ? `${c.role} / ${c.name}` : c.name, x, y + 173, 22, width); text(c.hex, x, y + 205, 23, width); text(c.source, x, y + 234, 17, width);
  });
  text(options.demo ? 'Illustrative sample · Not personal analysis or API results' : 'YouCam values, Huefolio calculations and personal choices are labeled separately.', 80, canvas.height - 25, 19);
  return new Promise((resolve, reject) => canvas.toBlob(blob => { canvas.width = canvas.height = 1; blob ? resolve(blob) : reject(new Error('PNG export failed')); }, 'image/png'));
}
const downloadURLs = new Map();
export function clearDownloadURLs() {
  for (const [url, timer] of downloadURLs) { clearTimeout(timer); URL.revokeObjectURL(url); }
  downloadURLs.clear();
}
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  const timer = setTimeout(() => { URL.revokeObjectURL(url); downloadURLs.delete(url); }, 1000);
  downloadURLs.set(url, timer);
}

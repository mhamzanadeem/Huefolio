// Huefolio calculations v1. Sources, constants, and limitations: docs/COLOR-INTELLIGENCE.md.
export function normalizeHex(value) { return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value.trim()) ? value.trim().toUpperCase() : null; }
export const rgb = hex => hex.slice(1).match(/../g).map(x => parseInt(x, 16));
const clamp = n => Math.max(0, Math.min(1, n));
export function toHSL(hex) {
  const [r, g, b] = rgb(hex).map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  let h = d ? max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4 : 0;
  return { h: (h * 60 + 360) % 360, s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l };
}
export function fromHSL(h, s, l) {
  h = (h % 360 + 360) % 360; s = clamp(s); l = clamp(l);
  const a = s * Math.min(l, 1 - l);
  return '#' + [0, 8, 4].map(n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); }).join('').toUpperCase();
}
export const complement = hex => { const { h, s, l } = toHSL(hex); return fromHSL(h + 180, s, l); };
const linear = hex => rgb(hex).map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
export function toOKLab(hex) {
  const [r, g, b] = linear(hex);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}
export function colorDistance(a, b) { const x = toOKLab(a), y = toOKLab(b); return 100 * Math.hypot(...x.map((v, i) => v - y[i])); }
export function contrastRatio(a, b) {
  const luminance = hex => { const [r, g, b] = linear(hex); return .2126 * r + .7152 * g + .0722 * b; };
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export function hueGap(a, b) {
  const x = toHSL(a), y = toHSL(b);
  // Hue is not useful near grayscale or at near-black/white lightness.
  if ([x, y].some(c => c.s < .1 || c.l < .03 || c.l > .97)) return null;
  const gap = Math.abs(x.h - y.h); return Math.min(gap, 360 - gap);
}
export function compareColors(hex, reference) {
  const distance = colorDistance(hex, reference), hue = hueGap(hex, reference), contrast = contrastRatio(hex, reference);
  const title = normalizeHex(hex) === normalizeHex(reference) ? 'The same color.' : hue !== null && hue >= 165 ? 'A complementary hue pairing.' : distance < 8 ? 'A nearby color.' : hue !== null && hue <= 30 ? 'Neighboring hues, different expression.' : 'A distinct pairing.';
  return { title, distance, hue, contrast, lightnessGap: Math.abs(toHSL(hex).l - toHSL(reference).l) * 100 };
}
export function nearestColor(hex, colors) {
  return colors.reduce((best, color) => {
    const distance = colorDistance(hex, color.hex);
    return !best || distance < best.distance ? { color, distance } : best;
  }, null);
}
export const sourceLabel = color => ({ youcam: 'YouCam value', app: 'Huefolio calculation', user: 'Chosen by you', sample: 'Illustrative sample' }[color.source] || 'Illustrative sample');
export const directionNames = { soft: 'Soft', balanced: 'Balanced', bold: 'Bold' };
export function generatePalette(measured, direction = 'balanced') {
  const valid = measured.filter(c => normalizeHex(c.hex));
  if (!valid.length) return [];
  const anchor = valid.find(c => c.field === 'skin_color') || valid[0], hsl = toHSL(anchor.hex);
  const scale = { soft: .65, balanced: 1, bold: 1.15 }[direction] || 1;
  const recipes = [
    ['light', 'Soft light', 0, .45, .82], ['deep', 'Grounded shade', 0, .65, .28],
    ['neighbor-plus', 'Neighboring accent', 30, .8, .55], ['neighbor-minus', 'Neighboring shade', -30, .8, .55],
    ['complement', 'Complement accent', 180, .8, .55], ['neutral', 'Quiet neutral', 0, .2, .92]
  ];
  const seen = new Set(valid.map(c => normalizeHex(c.hex))), output = [];
  for (const [rule, name, shift, saturation, lightness] of recipes) {
    const s = clamp(hsl.s * saturation * scale), hex = fromHSL(hsl.h + shift, s, lightness);
    if (seen.has(hex)) continue; seen.add(hex);
    output.push({ id: `app-${rule}-${hex.slice(1)}`, name, hex, source: 'app', anchor: { id: anchor.id, name: anchor.name, hex: normalizeHex(anchor.hex) }, recipe: `HSL hue ${shift >= 0 ? '+' : ''}${shift}°, saturation ×${saturation} ×${scale}, lightness ${Math.round(lightness * 100)}%`, algorithm: 'huefolio-hsl-v1' });
  }
  return output;
}
export function occasionCombination(colors, occasion) {
  if (!colors.length) return [];
  const sorted = [...colors].sort((a, b) => toHSL(b.hex).l - toHSL(a.hex).l);
  const preferDeep = ['Interview', 'Professional', 'Party', 'Traditional event'].includes(occasion);
  const base = preferDeep ? sorted.at(-1) : sorted[0];
  const supporting = [...colors].filter(c => c.hex !== base.hex).sort((a, b) => Math.abs(toHSL(a.hex).l - (preferDeep ? .8 : .35)) - Math.abs(toHSL(b.hex).l - (preferDeep ? .8 : .35)))[0];
  const accent = [...colors].filter(c => c.hex !== base.hex && c.hex !== supporting?.hex).sort((a, b) => {
    const target = ['Party', 'Traditional event'].includes(occasion) ? 180 : 30;
    return Math.abs((hueGap(a.hex, base.hex) ?? 0) - target) - Math.abs((hueGap(b.hex, base.hex) ?? 0) - target);
  })[0];
  return [{ role: 'Base', color: base }, ...(supporting ? [{ role: 'Supporting', color: supporting }] : []), ...(accent ? [{ role: 'Accent', color: accent }] : [])];
}

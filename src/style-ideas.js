import { workspaceColors, measuredColors, hasWorkspace, occasions } from './model.js';
import { toHSL, fromHSL, nearestColor } from './color-intelligence.js';
import { heading, button, emptyState, escapeHTML } from './components.js';
import { sourceBadge } from './product-components.js';
import { countries, styleProfiles, makeupPreferences, availableWardrobes, outfitTemplates, effectiveMakeup } from './wardrobe-catalog.js';
export { wardrobeStyles, countries, styleProfiles, makeupPreferences, availableWardrobes } from './wardrobe-catalog.js';

function selectControl(id, label, options, selected) {
  return `<div><label for="${id}">${label}</label><select id="${id}">${options.map(([value, text]) => `<option value="${escapeHTML(value)}" ${value === selected ? 'selected' : ''}>${escapeHTML(text)}</option>`).join('')}</select></div>`;
}
export function stylePage(session) {
  const title = heading('YOUR COLORS / YOUR WARDROBE', 'Looks for your<br>kind of occasion.', 'Choose your profile, occasion and outfit. See three complete color combinations.');
  if (!hasWorkspace(session)) return title + emptyState('Your colors come first.', 'Analyze a photo or explore the clearly labeled sample to see styling ideas.');
  const gender = Object.hasOwn(styleProfiles, session.stylingGender) ? session.stylingGender : '';
  const wardrobes = availableWardrobes(session);
  const country = countries.find(c => c.code === session.styleCountry);
  const local = wardrobes.filter(([, value]) => value.countries?.includes(session.styleCountry));
  const badge = `<span class="badge">${session.demo ? 'Illustrative sample · No photo analyzed' : session.profile?.exampleImage ? 'AI-generated test portrait · YouCam color values' : 'Inspired by your YouCam color values'} · Styling by Huefolio</span>`;
  const controls = `<section class="style-controls panel" aria-label="Personalize your looks">${selectControl('style-gender', 'Style profile', [['', 'Choose Male or Female'], ...Object.entries(styleProfiles)], gender)}${selectControl('style-occasion', 'Where are you going?', Object.keys(occasions).map(o => [o, o]), session.occasion)}${selectControl('style-country', 'Country / cultural context', [['', 'International / no country preference'], ...countries.map(c => [c.code, c.name])], session.styleCountry || '')}${selectControl('wardrobe-style', 'What do you like wearing?', [['auto', 'Recommend three outfits for this occasion'], ...local.map(([key, value]) => [key, `${value.label} · Local example`]), ...wardrobes.filter(([key]) => !local.some(([localKey]) => key === localKey)).map(([key, value]) => [key, value.label])], session.wardrobeStyle || 'auto')}${selectControl('makeup-preference', 'Makeup preference', Object.entries(makeupPreferences).map(([key, label]) => [key, key === 'auto' ? `Suggested: ${gender === 'male' ? 'no makeup' : 'soft & polished'}` : label]), session.makeupPreference || 'auto')}<p class="note">${country ? local.length ? `Local examples available for ${escapeHTML(country.name)}. Select any outfit you prefer; these examples do not represent every community.` : `No curated local garment example for ${escapeHTML(country.name)} yet. Choose an international outfit or “My own local outfit” to name your garments.` : 'Choose a country to surface available local examples, or explore international outfits.'} Changing country refreshes outfit recommendations.</p>${session.wardrobeStyle === 'custom' ? `<fieldset class="custom-garments"><legend>Name your outfit pieces</legend><p class="note">Add two to five garments or accessories from your wardrobe. Illustrations are symbolic.</p>${Array.from({ length: 5 }, (_, index) => `<div><label for="custom-garment-${index}">Piece ${index + 1}${index > 1 ? ' (optional)' : ''}</label><input class="text-input" id="custom-garment-${index}" data-custom-garment="${index}" maxlength="40" value="${escapeHTML(session.customGarments?.[index] || '')}"></div>`).join('')}${button('Update my outfit', { action: 'apply-custom-style' })}</fieldset>` : ''}</section>`;
  if (!gender) return title + badge + controls + `<section class="panel soft spaced"><h2 class="small-heading">Start with your style profile.</h2><p>Choose Male or Female above to see clothing options and complete looks for your occasion.</p></section>`;
  const ideas = styleIdeas(session);
  const customIncomplete = session.wardrobeStyle === 'custom' && ideas.outfits[0].pieces.length < 2;
  return title + badge + controls + `<section class="style-section" aria-labelledby="outfit-heading"><p class="eyebrow">${styleProfiles[gender].toUpperCase()} / ${session.occasion.toUpperCase()}${country ? ' / ' + escapeHTML(country.name).toUpperCase() : ''}</p><h2 id="outfit-heading">Three complete ways to wear it.</h2><p class="note">${session.wardrobeStyle === 'auto' ? 'Three outfit types chosen for your occasion.' : 'Your chosen outfit, in three occasion-specific color arrangements.'} Each piece below has its own color. Illustrations show shapes, not garment construction.</p><div id="style-results-status" role="status" class="sr-only">Updated looks for ${styleProfiles[gender]}, ${session.occasion}, ${escapeHTML(country?.name || 'international outfits')}.</div>${customIncomplete ? '<p role="status">Name at least two outfit pieces, then choose Update my outfit.</p>' : `<div class="looks-grid">${ideas.outfits.map((look, i) => lookCard(look, 'outfit', i, session)).join('')}</div>`}</section><section class="style-section" aria-labelledby="makeup-heading"><p class="eyebrow">${session.occasion.toUpperCase()} / YOUR MAKEUP KIT</p><h2 id="makeup-heading">${ideas.makeup.length ? 'Three coordinated color kits.' : 'Keep the focus on your outfit.'}</h2>${ideas.makeup.length ? `<p>Lips, cheeks, eyes, liner and nails. Intensity changes with your occasion and makeup preference.</p><p class="note">Digital colors are inspiration, not product or foundation shade matches. Finish, lighting and products affect the result.</p><div class="looks-grid">${ideas.makeup.map((look, i) => lookCard(look, 'makeup', i, session)).join('')}</div>` : '<p>No makeup selected. You can enable minimal, soft or statement color in Makeup preference above.</p>'}</section><section class="panel soft spaced"><h2 class="small-heading">Your choices, made practical.</h2><p class="note">YouCam supplies facial color values. Huefolio creates outfit color roles and makeup calculations; these are creative ideas, not verified flattering shades. The country selector covers 193 UN members plus the Holy See and Palestine. Curated local garment examples currently cover Pakistan, Japan, South Korea and Morocco. International and custom outfits work for every country.</p><div class="actions">${button('Explore my palette', { href: '/palette' })}${button('Compare your own color', { href: '/lab' })}</div></section>`;
}

export function styleIdeas(session) {
  if (!hasWorkspace(session)) return { outfits: [], makeup: [] };
  const colors = workspaceColors(session), sorted = [...colors].sort((a, b) => toHSL(a.hex).l - toHSL(b.hex).l);
  const deep = sorted[0], light = sorted.at(-1), mid = sorted[Math.floor(sorted.length / 2)];
  const accent = colors.find(c => c.id?.startsWith('app-complement')) || mid;
  const neighbor = colors.find(c => c.id?.startsWith('app-neighbor-plus')) || mid;
  const formal = ['Interview', 'Professional'].includes(session.occasion);
  const occasionNotes = {
    Wedding: 'Check the invitation’s dress code and any colors reserved for the couple.',
    Interview: 'Keep the accent small and choose a level of formality that fits the workplace.',
    Professional: 'Use the accent on a layer or accessory and follow your workplace dress code.',
    Party: 'Try a stronger accent for the main piece if that feels right for the venue.',
    Casual: 'Use pieces you already own; these color roles also work with relaxed layers.',
    'Traditional event': 'Adapt these roles to your own cultural garments and the event’s customs.'
  };
  const recipes = {
    Wedding: [[light, mid, neighbor, accent, deep, deep], [neighbor, deep, light, mid, deep, accent], [mid, light, accent, deep, neighbor, deep]],
    Interview: [[deep, deep, light, mid, deep, deep], [light, deep, mid, neighbor, deep, deep], [mid, deep, light, light, deep, deep]],
    Professional: [[mid, deep, light, neighbor, deep, deep], [deep, mid, light, light, deep, neighbor], [light, mid, deep, neighbor, deep, deep]],
    Party: [[accent, deep, neighbor, light, deep, mid], [deep, accent, light, neighbor, mid, deep], [neighbor, mid, accent, deep, light, deep]],
    Casual: [[neighbor, light, mid, deep, accent, deep], [light, mid, neighbor, accent, deep, light], [mid, neighbor, light, deep, accent, deep]],
    'Traditional event': [[mid, light, accent, deep, neighbor, deep], [accent, mid, deep, neighbor, light, deep], [neighbor, deep, mid, light, accent, deep]]
  };
  const templates = outfitTemplates(session);
  const outfits = templates.map((template, i) => ({
    id: `outfit-${i}`, title: `${template.label} · ${i + 1}`, source: template.source,
    subtitle: ['Coordinated layers', 'A different balance', 'Accent in focus'][i],
    why: `${session.occasion} recipe ${i + 1}: ${formal ? 'light and grounded shades lead; accents stay small' : 'base, layers and accents use different palette roles'}. ${occasionNotes[session.occasion] || occasionNotes.Casual}`,
    pieces: template.parts.map((part, index) => ({ ...part, color: (recipes[session.occasion] || recipes.Casual)[i][index % 6] }))
  }));
  const preference = effectiveMakeup(session);
  if (preference === 'none') return { outfits, makeup: [] };
  const anchor = measuredColors(session).find(c => c.field === 'lip_color') || measuredColors(session)[0];
  // Curated cosmetic references avoid suggesting arbitrary green/blue lipstick
  // as an everyday look when the available reference happens to be an eye color.
  const cosmeticReferences = [{ name: 'Rose', hex: '#AD5964' }, { name: 'Terracotta', hex: '#A65D49' }, { name: 'Berry', hex: '#85405B' }];
  const seed = nearestColor(anchor.hex, cosmeticReferences).color;
  const hsl = toHSL(seed.hex), neutral = toHSL(anchor.hex).s < .1;
  const occasionIntensity = { Interview: .55, Professional: .65, Casual: .75, Wedding: .9, Party: 1.1, 'Traditional event': 1 }[session.occasion] || .75;
  const intensity = occasionIntensity * ({ natural: .6, soft: .85, statement: 1.15 }[preference] || .85);
  const makeup = [['Coordinated tint', 0, .34, .46], ['Defined color', -15, .48, .36], ['Accent color', -25, .62, .42]].map(([title, shift, saturation, lightness], i) => ({
    id: `makeup-${i}`, title,
    why: `Closest curated cosmetic reference in OKLab to ${anchor.name.toLowerCase()} ${anchor.hex}: ${seed.name} ${seed.hex}. References: rose #AD5964, terracotta #A65D49, berry #85405B. Saturation is multiplied by ${intensity.toFixed(3)} for ${session.occasion} and your makeup preference. Neutral inputs stay neutral. This is a creative recipe, not a shade match.`,
    pieces: [[preference === 'natural' ? 'Lip tint' : 'Lipstick', shift, saturation, lightness], ['Blush', shift, saturation * .65, .72], ['Eyeshadow', shift + 30, saturation * .4, .4], ['Eyeliner', shift + 20, .18, .18], ['Nail accent', shift - 10, saturation * .8, .48]].map(([role, hue, s, l]) => {
      const effectiveS = neutral ? 0 : Math.min(1, s * intensity);
      return { role, shape: role === 'Eyeliner' ? 'liner' : role === 'Nail accent' ? 'nail' : role === 'Blush' ? 'blush' : role === 'Eyeshadow' ? 'eye' : 'lip', color: { name: role + ' exploration', hex: fromHSL(hsl.h + hue, effectiveS, l), source: 'app', anchor: { name: anchor.name, hex: anchor.hex }, recipe: `Closest curated cosmetic reference in OKLab: ${seed.name} ${seed.hex}; HSL hue ${hue >= 0 ? '+' : ''}${hue}°, saturation ${(effectiveS * 100).toFixed(1)}%, lightness ${Math.round(l * 100)}%; neutral inputs stay neutral`, algorithm: 'huefolio-styling-hsl-v2' } };
    })
  }));
  return { outfits, makeup };
}

const shapes = {
  shirt: 'M38 15 L60 24 L82 15 L108 38 L94 57 L82 46 V106 H38 V46 L26 57 L12 38 Z',
  tee: 'M38 18 Q60 33 82 18 L108 38 L94 57 L82 46 V106 H38 V46 L26 57 L12 38 Z',
  polo: 'M38 15 L60 24 L82 15 L105 37 L92 55 L82 46 V106 H38 V46 L28 55 L15 37 Z M52 22 L60 38 L68 22',
  trousers: 'M30 14 H90 L99 108 H70 L60 48 L50 108 H21 Z',
  widepants: 'M32 14 H88 L108 108 H69 L60 49 L51 108 H12 Z',
  jacket: 'M39 13 L60 28 L81 13 L105 31 L113 96 L93 99 L83 49 V109 H37 V49 L27 99 L7 96 L15 31 Z M41 14 L60 53 L79 14 M60 53 V108',
  vest: 'M38 14 L60 35 L82 14 L94 34 L86 49 V103 L60 111 L34 103 V49 L26 34 Z M60 35 V111',
  blouse: 'M38 18 Q60 37 82 18 L108 41 L93 61 L82 49 L87 106 H33 L38 49 L27 61 L12 41 Z',
  skirt: 'M37 15 H83 L108 108 H12 Z',
  dress: 'M40 12 Q60 32 80 12 L90 38 L77 52 L103 109 H17 L43 52 L30 38 Z',
  gown: 'M41 10 Q60 30 79 10 L85 39 L74 55 L111 112 H9 L46 55 L35 39 Z',
  wrap: 'M40 12 L60 33 L80 12 L99 37 L84 51 L75 45 L105 109 H15 L44 45 L36 51 L21 37 Z M40 12 L75 67 L43 109',
  jumpsuit: 'M40 12 L60 30 L80 12 L88 40 L76 50 L92 109 H65 L60 70 L55 109 H28 L44 50 L32 40 Z',
  tunic: 'M38 12 L60 24 L82 12 L108 39 L92 59 L82 46 L90 110 H30 L38 46 L28 59 L12 39 Z',
  kimono: 'M35 12 L60 30 L85 12 L115 37 V74 H86 V111 H34 V74 H5 V37 Z M35 12 L75 57 L50 111 M34 60 H86',
  coat: 'M38 12 L60 30 L82 12 L104 34 L113 98 L94 101 L82 50 L90 111 H30 L38 50 L26 101 L7 98 L16 34 Z',
  sweater: 'M37 15 Q60 29 83 15 L105 33 L115 100 L96 103 L83 51 V108 H37 V51 L24 103 L5 100 L15 33 Z',
  shoes: 'M14 55 L43 61 L61 79 L107 88 V106 H12 Z M45 59 L55 78 M29 65 L43 70',
  bag: 'M24 42 H96 L102 106 H18 Z M39 42 V28 Q60 3 81 28 V42',
  scarf: 'M32 12 H77 L66 47 L88 106 H64 L47 60 L39 107 H17 Z',
  tie: 'M47 12 H73 L67 31 L81 97 L60 111 L39 97 L53 31 Z',
  bow: 'M60 50 L15 28 V89 L60 70 L105 89 V28 Z M50 48 H70 V73 H50 Z',
  belt: 'M10 48 H110 V75 H10 Z M46 43 H76 V80 H46 Z',
  watch: 'M47 7 H73 V43 H47 Z M47 77 H73 V113 H47 Z M35 35 H85 V85 H35 Z',
  lip: 'M43 108 V46 Q43 25 76 15 V108 Z M35 63 H84 V111 H35 Z',
  blush: 'M60 15 A46 46 0 1 0 60 107 A46 46 0 1 0 60 15 M60 28 A33 33 0 1 1 60 94 A33 33 0 1 1 60 28',
  eye: 'M14 30 H106 V91 H14 Z M24 42 H96 V79 H24 Z',
  liner: 'M49 24 H69 V109 H49 Z M49 24 L59 7 L69 24',
  nail: 'M46 12 H74 V45 H46 Z M33 45 H87 V109 H33 Z'
};
function boardArt(pieces) {
  return pieces.map(({ role, shape, color }) => `<div class="board-piece"><svg viewBox="0 0 120 120" aria-hidden="true" data-shape="${Object.hasOwn(shapes, shape) ? shape : 'shirt'}"><path d="${shapes[shape] || shapes.shirt}" fill="${color.hex}" stroke="#494B45" stroke-width="1.8" stroke-linejoin="round"/></svg><span>${escapeHTML(role)}</span></div>`).join('');
}
function lookCard(look, kind, index, session) {
  return `<article class="look-card"><div class="look-art look-board">${boardArt(look.pieces)}<span class="look-number">0${index + 1}</span></div><div class="look-body"><h3>${escapeHTML(look.title)}</h3>${look.subtitle ? `<p class="note">${look.subtitle}</p>` : ''}<dl class="look-pieces">${look.pieces.map(({ role, color }) => `<div><span class="look-chip" style="background:${color.hex}" aria-hidden="true"></span><div><dt>${escapeHTML(role)}</dt><dd><code>${color.hex}</code>${sourceBadge(color)}</dd></div>${button('Copy', { action: 'copy-color', extra: `data-hex="${color.hex}" aria-label="Copy ${escapeHTML(role)} color ${color.hex}"` })}</div>`).join('')}</dl><details><summary>Why this combination?</summary><p class="note">${escapeHTML(look.why)}</p>${look.source ? `<a href="${look.source}" target="_blank" rel="noopener noreferrer">Garment reference</a>` : ''}</details>${button('Download this look · PNG', { action: 'download-style', extra: `data-kind="${kind}" data-index="${index}"` })}</div></article>`;
}

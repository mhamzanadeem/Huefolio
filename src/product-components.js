import { button, escapeHTML, notice } from './components.js';
import { measuredColors, workspaceColors, personalPalette, selectedCardColors } from './model.js';
import { sourceLabel, compareColors, nearestColor, directionNames } from './color-intelligence.js';
export const sourceBadge = color => `<span class="provenance source-${color.source}">${sourceLabel(color)}</span>`;
export function colorChoice(c, i, session) {
  return `<div><button class="color-tile" data-action="select-color" data-index="${i}" aria-pressed="${session.selected === i}"><span class="color-block" style="--color:${c.hex}"></span><span class="color-info">${escapeHTML(c.name)}<code>${c.hex}</code></span></button>${sourceBadge(c)}<label class="include-color"><input type="checkbox" data-include="${i}" ${session.included[i] ? 'checked' : ''}> Add to my card<span class="sr-only">: ${escapeHTML(c.name)}</span></label></div>`;
}
export function metricExplanation(hex, reference) {
  const relation = compareColors(hex, reference.hex);
  return `<h3>${relation.title}</h3><p>Compared with <strong>${escapeHTML(reference.name)} ${reference.hex}</strong>.</p><dl class="color-metrics"><div><dt>OKLab distance</dt><dd>${relation.distance.toFixed(1)}</dd></div><div><dt>Hue separation</dt><dd>${relation.hue === null ? 'Not meaningful' : Math.round(relation.hue) + '°'}</dd></div><div><dt>Text contrast</dt><dd>${relation.contrast.toFixed(2)}:1</dd></div></dl><p class="note">Lower OKLab distance means closer colors (distance ×100). Text contrast describes legibility between two flat colors, not clothing compatibility.</p>`;
}
export function whyColor(color, session) {
  const nearest = nearestColor(color.hex, measuredColors(session));
  if (!nearest) return notice('Your profile is unavailable.', 'Start a new analysis or explore a sample.');
  return `<p class="eyebrow">WHY THIS COLOR? / HUEFOLIO CALCULATION</p><h2 class="selected-title">${escapeHTML(color.name)}</h2>${sourceBadge(color)}<p>${color.source === 'app' ? `Created from ${escapeHTML(color.anchor.name)} ${color.anchor.hex}. ${escapeHTML(color.recipe)}.` : color.source === 'user' ? 'Chosen by you. It does not change your measured profile.' : session.demo ? 'An illustrative reference color for this sample workspace.' : 'A measured value returned by YouCam, not an application classification.'}</p><p class="label">Closest ${session.demo ? 'sample' : 'measured'} color</p>${metricExplanation(color.hex, nearest.color)}<details><summary>How this is calculated</summary><p>Hue separation is the shorter arc of the HSL color wheel: neighboring hues ≤30°, complementary hues ≥165°. Hue labels are suppressed near grayscale, black, and white. OKLab distance is Euclidean distance ×100; “nearby” uses Huefolio’s threshold of 8. These are color relationships, not seasonal, undertone, or flattering classifications.</p></details>`;
}
export function comparisonCards(session) {
  if (!session.userColors.length) return '<p class="note">Keep up to four colors to compare them side by side.</p>';
  const catalog = workspaceColors(session);
  return `<div class="comparison-grid">${session.userColors.map(c => {
    const nearest = nearestColor(c.hex, personalPalette(session));
    const index = catalog.findIndex(x => x.id === c.id);
    return `<section class="panel comparison-choice"><div class="comparison-chip" style="background:${c.hex}" aria-hidden="true"></div><h3>${c.hex}</h3>${sourceBadge(c)}<p>Closest palette shade: <strong>${escapeHTML(nearest.color.name)}</strong> ${nearest.color.hex}<br><span class="note">${sourceLabel(nearest.color)} · OKLab distance ${nearest.distance.toFixed(1)}</span></p><div class="actions">${button('Copy HEX', { action: 'copy-color', extra: `data-hex="${c.hex}"` })}${button('Remove', { action: 'remove-user', extra: `data-id="${c.id}" aria-label="Remove ${c.hex}"` })}</div><label class="include-color"><input type="checkbox" data-include="${index}" ${session.included[index] ? 'checked' : ''}> Add to my card<span class="sr-only">: ${c.hex}</span></label></section>`;
  }).join('')}</div>`;
}
export function cardContext(session) {
  return { exampleImage: session.profile?.exampleImage || null, measured: session.includeCharacteristics ? measuredColors(session) : [], includeCharacteristics: session.includeCharacteristics, direction: directionNames[session.direction], occasion: session.occasion, selected: selectedCardColors(session) };
}

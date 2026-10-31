import { sampleColors } from './model.js';
import { sourceLabel } from './color-intelligence.js';
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function button(label, { href, action, primary = false, disabled = false, extra = '' } = {}) {
  const classes = `button${primary ? ' primary' : ''}`;
  return href ? `<a class="${classes}" href="#${href}" ${extra}>${label}</a>` : `<button type="button" class="${classes}" ${action ? `data-action="${action}"` : ''} ${disabled ? 'disabled' : ''} ${extra}>${label}</button>`;
}
export const heading = (eyebrow, title, description) => `<div class="section-title"><p class="eyebrow">${eyebrow}</p><h1 tabindex="-1">${title}</h1>${description ? `<p class="lead">${description}</p>` : ''}</div>`;
export const panel = (content, cls = '') => `<section class="panel ${cls}">${content}</section>`;
export const sampleBadge = '<span class="badge">Illustrative sample · Not API results</span>';
export function swatches(colors = sampleColors) {
  return `<div class="swatches">${colors.map(c => `<div><div class="swatch" style="background:${c.hex}" aria-hidden="true"></div><span>${escapeHTML(c.name)}</span><code>${c.hex}</code></div>`).join('')}</div>`;
}
export function identityCard(colors = sampleColors, demo = true, context = null) {
  return `<div class="identity"><div class="row"><span class="brand">huefolio<span aria-hidden="true">✳</span></span><span class="label">COLOR NOTES / 01</span></div><p class="eyebrow">YOUR PERSONAL CANVAS</p><h2>A little more<br>you, in color.</h2>${swatches(colors)}${context ? `<div class="card-details"><p class="label">SELECTED PALETTE SOURCES</p>${colors.map(c => `<p>${c.hex} · ${sourceLabel(c)}</p>`).join('')}${context.measured.length ? `<p class="label spaced">${demo ? 'SAMPLE REFERENCE' : 'YOUCAM COLOR PROFILE'}</p>${context.measured.map(c => `<p>${escapeHTML(c.name)}${c.apiName ? ` (${escapeHTML(c.apiName)})` : ''} · ${c.hex}</p>`).join('')}` : ''}<p class="label spaced">YOUR PREFERENCES</p><p>${context.direction} direction · ${context.occasion}</p></div>` : ''}<p class="note card-note">${demo ? 'Illustrative palette · Not personal analysis' : context?.exampleImage ? 'AI-generated test portrait · Measured colors from YouCam' : context ? 'YouCam values, Huefolio calculations & your choices are labeled separately.' : 'Measured colors · Source: YouCam'}<br>Your colors. Your identity. Your style.</p></div>`;
}
export function navigation(route, workspace, analyzing = false) {
  const links = workspace ? [['/results', 'Results'], ['/palette', 'Palette'], ['/lab', 'Match lab'], ['/occasions', 'Occasions'], ['/style', 'Style ideas'], ['/export', 'Identity card']] : [['/', 'Welcome'], ['/upload', 'Your photo'], ...(analyzing ? [['/processing', 'Analysis']] : [])];
  return links.map(([href, name]) => `<a href="#${href}" ${route === href ? 'aria-current="page"' : ''}>${name}</a>`).join('');
}
export function emptyState(title, text, { sample = true, route = '/upload', label = 'Choose a photo' } = {}) {
  return panel(`<p class="eyebrow">A FRESH CANVAS</p><h2>${title}</h2><p>${text}</p><div class="actions">${sample ? button('Explore sample colors', { action: 'demo', primary: true }) : ''}${button(label, { href: route, primary: !sample })}</div>`);
}
export function notice(title, text, kind = 'info') {
  return `<div class="notice ${kind}" role="${kind === 'error' ? 'alert' : 'status'}"><strong>${title}</strong><p>${text}</p></div>`;
}
export function modal() {
  return `<dialog id="exit-dialog" aria-labelledby="exit-title" aria-describedby="exit-description"><p class="eyebrow">YOUR TEMPORARY SESSION</p><h2 id="exit-title">Leave your colors behind?</h2><p id="exit-description">Leaving Huefolio will clear your current session and analysis results. Download your Huefolio Card before leaving if you want to keep a copy.</p><div class="actions">${button('Keep exploring', { action: 'close-dialog', primary: true, extra: 'autofocus' })}${button('View download options', { action: 'download-before-exit' })}${button('Exit & clear session', { action: 'reset' })}</div></dialog><dialog id="privacy-dialog" aria-labelledby="privacy-title"><div class="dialog-body"><p class="eyebrow">YOUR CHOICE, ALWAYS</p><h2 id="privacy-title">A little clarity on privacy.</h2><p>Your selfie is sent to YouCam for facial color analysis only after you choose a photo and agree to send it.</p><p>Huefolio has no accounts and does not permanently save your photo or results. Your current workspace stays in temporary memory. Refreshing, leaving, Exit, or Start over clears it. Downloads stay on your device.</p><p>YouCam processing is governed by its <a href="https://www.makeupar.com/perfectbeauty/youcam/terms-of-service-api" target="_blank" rel="noopener noreferrer">applicable terms</a>. Its <a href="https://docs.perfectcorp.com/develop/file_retention_period" target="_blank" rel="noopener noreferrer">documented retention period is 30 days</a>. We request earlier deletion after processing where supported; failed or unfinished uploads may remain until provider expiry.</p><p class="note">Browsers may show a generic leave warning after you interact with the page. This depends on your browser and device; it cannot reliably warn on every close. Use Exit to deliberately clear the session.</p></div><div class="actions dialog-actions">${button('Done', { action: 'close-privacy', primary: true, extra: 'autofocus' })}</div></dialog>`;
}
let notificationTimer;
export function clearNotifications() {
  clearTimeout(notificationTimer);
  const node = document.querySelector('#notifications'); node.textContent = ''; node.classList.remove('visible');
}
export function notify(message) {
  const node = document.querySelector('#notifications');
  clearTimeout(notificationTimer);
  node.textContent = message;
  node.classList.add('visible');
  notificationTimer = setTimeout(() => { node.classList.remove('visible'); node.textContent = ''; }, 6000);
}

import { createSession, sampleColors, normalizeHex, validatePhoto, routeFromHash, occasions, workspaceColors, hasWorkspace, measuredColors, personalPalette, selectedCardColors } from './model.js';
import { directionNames, occasionCombination } from './color-intelligence.js';
import { metricExplanation, cardContext } from './product-components.js';
import { newJob, capabilities, submitAnalysis, analysisStatus, cancelAnalysis } from './api.js';
import { navigation, modal, notify, clearNotifications } from './components.js';
import { landing, upload, processing, results, palette, lab, occasionPage, exportPage, notFound, stateGallery } from './pages.js';
import { createCardPNG, createCollectionPNG, collectionDocument, clearDownloadURLs, downloadBlob, textSummary } from './export.js';
import { hasSessionData, isSessionExpired, createLeaveGuard } from './session-privacy.js';

let session = createSession(), photoRevision = 0, sessionRevision = 0, dialogTrigger;
let analysisController = null, resultExpiryTimer, pendingPhoto;
const main = document.querySelector('main');
const qaMode = new URLSearchParams(location.search).get('review') === '1';
const pageViews = { '/': landing, '/upload': upload, '/processing': processing, '/results': results, '/palette': palette, '/lab': lab, '/occasions': occasionPage, '/export': exportPage };
const titles = { '/': 'Your colors. Your identity. Your style.', '/upload': 'Your photo', '/processing': 'Analysis', '/results': 'Color results', '/palette': 'My palette', '/lab': 'Color Match Lab', '/occasions': 'Occasion palettes', '/export': 'Identity card' };
document.querySelector('#modal-root').innerHTML = modal();
const dialog = document.querySelector('#exit-dialog');
const privacyDialog = document.querySelector('#privacy-dialog');
const leaveGuard = createLeaveGuard(() => session);
let privacyTrigger;
document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  main.focus(); main.scrollIntoView();
});

function route() { return qaMode && location.hash === '#/states' ? '/states' : routeFromHash(location.hash); }
function render({ focus = false, restore } = {}) {
  if (isSessionExpired(session)) { clearSession(); notify('This temporary session has cleared.'); }
  leaveGuard.sync();
  const current = route();
  main.innerHTML = current === '/states' ? stateGallery(session.reviewState) : (pageViews[current] || notFound)(session);
  document.querySelector('#navigation').innerHTML = navigation(current, hasWorkspace(session), Boolean(session.job));
  document.querySelector('#demo-banner').hidden = !session.demo;
  document.querySelector('#end-session').disabled = !hasSessionData(session);
  document.title = `Huefolio · ${titles[current] || (current === '/states' ? 'Interface states' : 'Page not found')}`;
  if (qaMode) {
    const link = document.createElement('a'); link.href = '#/states'; link.textContent = 'Interface states';
    link.className = 'qa-link'; document.querySelector('#navigation').append(link);
  }
  if (restore) main.querySelector(restore)?.focus();
  else if (focus) { main.querySelector('h1')?.focus({ preventScroll: true }); window.scrollTo(0, 0); }
}
function go(path) {
  if (location.hash === '#' + path) render({ focus: true });
  else location.hash = path;
}
function releasePhoto() {
  photoRevision++;
  if (pendingPhoto) { pendingPhoto.image.src = ''; URL.revokeObjectURL(pendingPhoto.url); pendingPhoto = null; }
  if (session.photo) URL.revokeObjectURL(session.photo.url);
  session.photo = null; session.consent = false; session.photoLoading = false;
}
function stopAnalysis() {
  analysisController?.abort(); analysisController = null;
  if (session.job) void cancelAnalysis(session.job);
  session.job = null;
  clearTimeout(resultExpiryTimer);
}
function clearSession() {
  const ready = session.backendReady;
  stopAnalysis(); releasePhoto(); sessionRevision++; session = createSession(); session.backendReady = ready;
  clearDownloadURLs(); clearNotifications(); leaveGuard.sync();
  dialogTrigger = privacyTrigger = null; dialog.close(); privacyDialog.close();
  // Scrub private text and photo markup too, including documents retained in back/forward cache.
  main.replaceChildren(); document.querySelector('#navigation').innerHTML = navigation(route(), false);
  document.querySelector('#demo-banner').hidden = true; document.querySelector('#end-session').disabled = true;
}
function openExit(trigger, mode = 'exit') {
  dialogTrigger = trigger; dialog.dataset.mode = mode;
  dialog.querySelector('#exit-title').textContent = mode === 'start-over' ? 'Start a fresh canvas?' : mode === 'sample' ? 'Switch to sample colors?' : 'Leave your colors behind?';
  dialog.querySelector('[data-action="reset"]').textContent = mode === 'start-over' ? 'Clear & start over' : mode === 'sample' ? 'Clear & explore sample' : 'Exit & clear session';
  dialog.querySelector('[data-action="download-before-exit"]').hidden = !hasWorkspace(session);
  dialog.showModal();
}
dialog.addEventListener('close', () => { if (dialogTrigger?.isConnected) dialogTrigger.focus(); });
privacyDialog.addEventListener('close', () => { if (privacyTrigger?.isConnected) privacyTrigger.focus(); });
document.querySelector('#end-session').addEventListener('click', e => { if (!expireIfNeeded()) openExit(e.currentTarget); });

async function selectPhoto(file) {
  stopAnalysis(); sessionRevision++; session.profile = null; session.expiresAt = null; session.demo = false; session.selected = 0;
  session.analysisStage = 'idle'; session.analysisError = '';
  releasePhoto(); session.uploadError = '';
  if (!file) { render(); return; }
  const error = validatePhoto(file);
  if (error) { session.uploadError = error; render({ restore: '#photo' }); return; }
  const revision = photoRevision;
  const url = URL.createObjectURL(file);
  const img = new Image(); pendingPhoto = { url, image: img };
  session.photoLoading = true;
  render();
  try {
    img.src = url; await img.decode();
    if (photoRevision !== revision) { URL.revokeObjectURL(url); return; }
    // Keep the File only until the consented request has been sent or the session clears.
    if (Math.min(img.naturalWidth, img.naturalHeight) < 320 || Math.max(img.naturalWidth, img.naturalHeight) > 4096) throw new Error('dimensions');
    session.photo = { url, name: file.name, file };
  } catch {
    URL.revokeObjectURL(url);
    if (photoRevision !== revision) return;
    session.uploadError = 'Use a valid JPG or PNG with both sides between 320 and 4096 pixels.';
  }
  if (photoRevision === revision) {
    pendingPhoto = null;
    session.photoLoading = false;
    if (route() === '/upload') render({ restore: '#photo' });
  }
}

async function exportCard() {
  if (!hasWorkspace(session) || session.exportStatus === 'loading') return;
  if (!selectedCardColors(session).length) return;
  const revision = sessionRevision;
  session.exportStatus = 'loading'; render();
  // Yield to paint the genuine export loading state, not simulated analysis progress.
  await new Promise(resolve => requestAnimationFrame(() => resolve()));
  try {
    if (sessionRevision !== revision) return;
    const colors = selectedCardColors(session), context = cardContext(session);
    const blob = await createCardPNG(colors, session.demo, context);
    if (sessionRevision !== revision) return;
    downloadBlob(blob, session.demo ? 'huefolio-sample-card.png' : 'huefolio-card.png'); session.exportStatus = 'success';
    notify('Card prepared. Download requested.');
  } catch {
    if (sessionRevision !== revision) return;
    session.exportStatus = 'error';
  }
  if (route() === '/export') render({ restore: '[data-action="download"]' });
}

async function exportCollection(kind, format) {
  if (!hasWorkspace(session)) return;
  if (session.download?.status === 'loading') { notify('A download is being prepared. Try again in a moment.'); return; }
  const combination = kind === 'combination' ? occasionCombination(workspaceColors(session), session.occasion) : null;
  const colors = kind === 'palette' ? workspaceColors(session) : kind === 'board' ? session.userColors : combination.map(c => c.color);
  if (!colors.length) { notify('Choose colors before downloading.'); return; }
  const options = { demo: session.demo, title: kind === 'combination' ? `${session.occasion} combination` : kind === 'board' ? 'My selected colors' : 'My color palette', direction: directionNames[session.direction], ...(combination ? { occasion: session.occasion, roles: combination.map(c => c.role) } : {}) };
  const filename = `huefolio-${session.demo ? 'sample-' : ''}${kind}.${format}`, revision = sessionRevision;
  session.download = { kind, status: 'loading' }; render();
  try {
    const blob = format === 'png' ? await createCollectionPNG(colors, options) : new Blob([JSON.stringify(collectionDocument(colors, options), null, 2)], { type: 'application/json' });
    if (revision !== sessionRevision) return;
    downloadBlob(blob, filename); session.download = { kind, status: 'success' }; notify('Download requested. Check your device’s downloads.');
  } catch {
    if (revision !== sessionRevision) return;
    session.download = { kind, status: 'error' }; notify('Could not prepare the download. Try JSON, or copy the visible HEX codes.');
  }
  if (route() === ({ palette: '/palette', combination: '/occasions', board: '/lab' })[kind]) render({ restore: `[data-action="download-${kind}"][data-format="${format}"]` });
}

function updateComparison(hex) {
  session.candidate = hex; session.labError = '';
  const palette = personalPalette(session), color = palette[session.reference ?? session.selected] || palette[0];
  document.querySelector('#picker').value = hex;
  document.querySelector('#hex-input').value = hex;
  document.querySelector('#hex-input').removeAttribute('aria-invalid');
  document.querySelector('#hex-error').textContent = '';
  document.querySelector('#chosen').style.setProperty('--color', hex);
  document.querySelector('#relationship').innerHTML = metricExplanation(hex, color);
}
function remapChoices(mutate) {
  const chosen = new Set(selectedCardColors(session).map(c => c.id));
  mutate(); session.included = workspaceColors(session).map(c => chosen.has(c.id));
  session.exportStatus = 'idle'; session.selected = 0; session.reference = 0;
}
async function copyHex(hex) {
  if (!normalizeHex(hex)) return;
  try { await navigator.clipboard.writeText(hex); notify('HEX copied to clipboard.'); }
  catch { notify('Copy unavailable. Select the visible HEX code and copy it manually.'); }
}

document.addEventListener('click', async event => {
  if (expireIfNeeded()) return;
  const trigger = event.target.closest('[data-action]');
  if (!trigger || trigger.disabled) return;
  const action = trigger.dataset.action;
  if (action === 'how') {
    event.preventDefault(); const section = document.querySelector('#how');
    section?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); section?.focus({ preventScroll: true });
  }
  if (action === 'demo') {
    if (session.demo) go('/results');
    else if (hasSessionData(session)) openExit(trigger, 'sample');
    else startSample();
  }
  if (action === 'remove-photo') { stopAnalysis(); releasePhoto(); session.uploadError = ''; render({ restore: '#photo' }); }
  if (action === 'analyze' && session.photo && session.consent && session.backendReady && !session.photoLoading && !session.job) void runAnalysis();
  if (action === 'cancel-analysis') { stopAnalysis(); sessionRevision++; session.analysisStage = 'cancelled'; session.analysisError = 'Your local analysis was cancelled. YouCam may still process the photo; its retention policy applies.'; releasePhoto(); render(); }
  if (action === 'select-color') {
    const index = Number(trigger.dataset.index);
    if (workspaceColors(session)[index]) { session.selected = index; render({ restore: `[data-action="select-color"][data-index="${index}"]` }); }
  }
  if (action === 'copy') await copyHex((workspaceColors(session)[session.selected] || workspaceColors(session)[0])?.hex);
  if (action === 'copy-color') await copyHex(trigger.dataset.hex);
  if (action === 'pick') updateComparison(trigger.dataset.hex);
  if (action === 'compare') {
    const input = document.querySelector('#hex-input'), hex = normalizeHex(input.value);
    if (hex) updateComparison(hex);
    else { session.labError = 'Use a six-digit HEX code, such as #A7B59E.'; document.querySelector('#hex-error').textContent = session.labError; input.setAttribute('aria-invalid', 'true'); input.focus(); }
  }
  if (action === 'keep-color') {
    const input = document.querySelector('#hex-input'), hex = normalizeHex(input.value);
    if (!hex) { session.labError = 'Use a six-digit HEX code, such as #A7B59E.'; document.querySelector('#hex-error').textContent = session.labError; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    if (session.userColors.some(c => c.hex === hex)) { notify('This color is already on your comparison board.'); return; }
    if (session.userColors.length >= 4) { notify('Keep up to four colors. Remove one to try another.'); return; }
    updateComparison(hex);
    remapChoices(() => session.userColors.push({ id: `user-${hex.slice(1)}`, name: 'Your choice ' + hex, hex, source: 'user' }));
    render({ restore: '[data-action="keep-color"]' }); notify('Color kept for this session.');
  }
  if (action === 'remove-user') { remapChoices(() => { session.userColors = session.userColors.filter(c => c.id !== trigger.dataset.id); }); render({ restore: '[data-action="keep-color"]' }); }
  if (action === 'use-occasion') {
    const chosen = new Set(occasionCombination(workspaceColors(session), session.occasion).map(item => item.color.id));
    session.included = workspaceColors(session).map(c => chosen.has(c.id)); session.exportStatus = 'idle'; go('/export');
  }
  if (action === 'occasion' && Object.hasOwn(occasions, trigger.dataset.occasion)) {
    session.occasion = trigger.dataset.occasion;
    render({ restore: `[data-occasion="${session.occasion}"]` });
  }
  if (action === 'download') await exportCard();
  if (['download-palette', 'download-combination', 'download-board'].includes(action) && ['png', 'json'].includes(trigger.dataset.format)) await exportCollection(action.slice(9), trigger.dataset.format);
  if (action === 'download-text') {
    try { downloadBlob(new Blob([textSummary(selectedCardColors(session), session.demo, cardContext(session))], { type: 'text/plain;charset=utf-8' }), session.demo ? 'huefolio-sample-colors.txt' : 'huefolio-colors.txt'); notify('Text summary download requested.'); }
    catch { notify('Download unavailable. Color names and HEX codes are available on your palette.'); }
  }
  if (action === 'exit') openExit(trigger);
  if (action === 'start-over') openExit(trigger, 'start-over');
  if (action === 'download-before-exit') { dialog.close(); go('/export'); }
  if (action === 'privacy') { privacyTrigger = trigger; privacyDialog.showModal(); }
  if (action === 'close-privacy') privacyDialog.close();
  if (action === 'close-dialog') dialog.close();
  if (action === 'reset') {
    const mode = dialog.dataset.mode;
    if (mode === 'sample') startSample();
    else { clearSession(); go(mode === 'start-over' ? '/upload' : '/'); }
    notify('Session cleared. A fresh canvas awaits.');
  }
});

function startSample() {
  clearSession(); session.demo = true;
  session.included = workspaceColors(session).map((c, i) => i < sampleColors.length);
  go('/results');
}

document.addEventListener('change', event => {
  if (expireIfNeeded()) return;
  const target = event.target;
  if (target.id === 'photo') selectPhoto(target.files[0]);
  if (target.id === 'consent') {
    session.consent = target.checked;
    document.querySelector('[data-action="analyze"]').disabled = !session.photo || !session.consent || session.photoLoading || !session.backendReady;
    document.querySelector('#analysis-help').textContent = !session.backendReady ? 'Connected analysis is currently unavailable.' : session.consent ? 'Sends this photo to YouCam for analysis.' : 'Agree to the notice to continue.';
  }
  if (target.matches('[data-include]')) {
    if (target.checked && selectedCardColors(session).length >= 8) { target.checked = false; notify('Choose up to eight colors so your card stays readable.'); return; }
    session.included[Number(target.dataset.include)] = target.checked; session.exportStatus = 'idle';
  }
  if (target.id === 'direction' && Object.hasOwn(directionNames, target.value)) { remapChoices(() => { session.direction = target.value; }); render({ restore: '#direction' }); }
  if (target.id === 'include-characteristics') { session.includeCharacteristics = target.checked; session.exportStatus = 'idle'; render({ restore: '#include-characteristics' }); }
  if (target.id === 'reference') { session.reference = Number(target.value); render({ restore: '#reference' }); }
  if (target.id === 'review-state') { session.reviewState = target.value; render({ restore: '#review-state' }); }
});
document.addEventListener('input', event => { if (!expireIfNeeded() && event.target.id === 'picker') updateComparison(event.target.value.toUpperCase()); });
document.addEventListener('keydown', event => {
  if (expireIfNeeded()) { event.preventDefault(); return; }
  const activeDialog = privacyDialog.open ? privacyDialog : dialog.open ? dialog : null;
  if (activeDialog && event.key === 'Tab') {
    const controls = [...activeDialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter(n => n.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
  }
  if (event.target.id === 'hex-input' && event.key === 'Enter') { event.preventDefault(); document.querySelector('[data-action="compare"]').click(); }
});
window.addEventListener('hashchange', () => render({ focus: true }));
// Back/forward-cache restores must not restore a private session after closing/leaving.
window.addEventListener('pagehide', clearSession);
window.addEventListener('pageshow', event => { if (event.persisted) { clearSession(); render({ focus: true }); notify('This temporary session has cleared.'); } });
render();
capabilities().then(info => { session.backendReady = Boolean(info.enabled && info.ready); if (route() === '/upload') render(); }).catch(() => {});

async function runAnalysis() {
  const job = newJob(), revision = ++sessionRevision;
  let file = session.photo.file;
  session.job = job; session.analysisStage = 'submitting'; session.analysisError = ''; session.profile = null; session.demo = false;
  const controller = new AbortController(); analysisController = controller;
  go('/processing');
  try {
    try { await submitAnalysis(job, file, AbortSignal.any([controller.signal, AbortSignal.timeout(45000)])); }
    catch (error) {
      if (controller.signal.aborted) return;
      // Ambiguous submission is recovered by polling the SAME job, never another POST.
      if (!['CONNECTION', 'RESPONSE'].includes(error.code) && error.name !== 'TimeoutError') throw error;
    } finally { file = null; if (revision === sessionRevision) releasePhoto(); }
    const deadline = Date.now() + 10 * 60 * 1000;
    while (!controller.signal.aborted && revision === sessionRevision && Date.now() < deadline) {
      let status;
      try { status = await analysisStatus(job, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])); }
      catch (error) {
        if (controller.signal.aborted) return;
        if (error.code === 'SESSION_EXPIRED') throw error;
        session.analysisError = 'Connection interrupted. Checking the existing task without resubmitting.';
        if (route() === '/processing') render();
        await waitForPoll(controller.signal); continue;
      }
      if (controller.signal.aborted || revision !== sessionRevision) return;
      session.analysisStage = status.stage; session.analysisError = status.error?.message || '';
      if (status.stage === 'success') {
        const names = { skin_color: 'Skin', eye_color: 'Eyes', lip_color: 'Lips', eyebrow_color: 'Eyebrows', hair_color: 'Hair' };
        const colors = (Array.isArray(status.result?.colors) ? status.result.colors : []).filter(c => c && Object.hasOwn(names, c.field) && typeof c.hex === 'string' && normalizeHex(c.hex)).slice(0, 5).map(c => ({ field: c.field, name: names[c.field], hex: normalizeHex(c.hex), ...(typeof c.apiName === 'string' && /^[A-Za-z/ ]{1,20}$/.test(c.apiName) ? { apiName: c.apiName } : {}) }));
        if (!colors.length) throw new Error('No usable color data was returned.');
        session.profile = { colors, partial: colors.length < 5 }; session.selected = 0; session.reference = undefined; session.userColors = []; session.exportStatus = 'idle'; session.included = workspaceColors(session).map((c, i) => i < colors.length);
        session.expiresAt = Math.min(Date.now() + 900000, Number.isFinite(status.expiresAt) ? status.expiresAt : Date.now() + 900000);
        resultExpiryTimer = setTimeout(() => { clearSession(); go('/results'); notify('This temporary session has cleared.'); }, Math.max(0, session.expiresAt - Date.now()));
        // The browser now owns the active result. Release the server copy without waiting for exit.
        session.job = null; analysisController = null; void cancelAnalysis(job);
        go('/results'); notify('Your measured colors are ready.'); return;
      }
      if (['error', 'cancelled'].includes(status.stage)) throw new Error(status.error?.message || 'This analysis was cancelled.');
      if (route() === '/processing') render();
      await waitForPoll(controller.signal);
    }
    if (!controller.signal.aborted && revision === sessionRevision) throw new Error('Analysis timed out. It may still complete at YouCam.');
  } catch (error) {
    if (controller.signal.aborted || revision !== sessionRevision) return;
    session.analysisStage = 'error'; session.analysisError = error.message || 'Analysis is temporarily unavailable.';
    void cancelAnalysis(job); session.job = null;
    if (route() === '/processing') render();
  }
}
function waitForPoll(signal) {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, 2500); signal.addEventListener('abort', done, { once: true });
  });
}
function expireIfNeeded() {
  if (!isSessionExpired(session)) return false;
  clearSession(); render({ focus: true }); notify('This temporary session has cleared.'); return true;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') expireIfNeeded(); });
window.addEventListener('focus', expireIfNeeded);

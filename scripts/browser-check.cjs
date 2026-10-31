// Optional browser QA. Uses an existing Playwright installation, never a runtime dependency.
// Set PLAYWRIGHT_MODULE and optionally CHROMIUM_PATH for your machine.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage(), errors = [], network = [];
    let configuredBackend = 'https://backend.test';
    let downloadsRequested = 0; page.on('download', () => downloadsRequested++);
    let leaveDecision = 'accept'; const nativeWarnings = [];
    page.on('dialog', dialog => { nativeWarnings.push(dialog.type()); void (leaveDecision === 'dismiss' ? dialog.dismiss() : dialog.accept()); });
    page.on('pageerror', e => errors.push(e.message));
    // Offline transport for sandboxed browsers: every asset is fulfilled from this checkout.
    await page.route('https://huefolio.test/**', async route => {
      const url = new URL(route.request().url());
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!(file === 'index.html' || file === 'favicon.svg' || /^src\/[a-z-]+\.(js|css)$/.test(file))) return route.fulfill({ status: 404 });
      const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
      if (file === 'src/config.js') return route.fulfill({ body: `export const BACKEND_URL = ${JSON.stringify(configuredBackend)};`, contentType: 'text/javascript' });
      await route.fulfill({ body: await fs.readFile(file), contentType: mime[path.extname(file)] });
    });
    let analysisPosts = 0, providerMode = 'success', releases = 0;
    const measured = [{ field: 'skin_color', hex: '#BA9279', name: 'Skin', source: 'youcam' }, { field: 'eye_color', hex: '#513C2D', name: 'Eyes', apiName: 'Brown', source: 'youcam' }];
    await page.route('https://backend.test/**', route => {
      const req = route.request();
      if (req.url().endsWith('/capabilities')) return route.fulfill({ json: { enabled: true, ready: true } });
      if (req.method() === 'POST') { analysisPosts++; assert.ok(req.headers()['x-huefolio-consent']); assert.ok(req.headers().authorization?.startsWith('Bearer ')); return providerMode === 'limited' ? route.fulfill({ status: 429, json: { error: { code: 'BUSY', message: 'Analysis is busy. Please try again in a moment.' } } }) : route.fulfill({ status: 202, json: { stage: 'processing' } }); }
      if (req.method() === 'DELETE') { releases++; return route.fulfill({ json: { stage: 'cancelled' } }); }
      return route.fulfill({ json: providerMode === 'waiting' ? { stage: 'processing' } : { stage: 'success', expiresAt: Date.now() + 900000, result: { colors: measured, partial: true } } });
    });
    page.on('request', req => { if (['fetch', 'xhr'].includes(req.resourceType())) network.push(req.url()); });
    await page.goto('https://huefolio.test/');
    await page.getByRole('heading', { level: 1 }).waitFor();
    const bootMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      return { domContentLoadedMs: navigation.domContentLoadedEventEnd, loadMs: navigation.loadEventEnd, firstContentfulPaintMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null };
    });
    await page.keyboard.press('Tab');
    await page.getByRole('link', { name: 'Skip to content' }).press('Enter');
    assert.equal(await page.locator('main').evaluate(n => n === document.activeElement), true);
    assert.equal(new URL(page.url()).hash, '');
    const routes = ['/', '/upload', '/processing', '/results', '/palette', '/lab', '/occasions', '/export'];
    const visit = async route => { await page.evaluate(r => { location.hash = r; }, route); await page.waitForFunction(r => location.hash === '#' + r && document.querySelector('h1'), route); await page.waitForTimeout(40); };
    const collectionDownload = async (kind, format, count) => {
      const ready = page.waitForEvent('download');
      await page.locator(`[data-action="download-${kind}"][data-format="${format}"]`).click();
      const download = await ready, bytes = await fs.readFile(await download.path());
      assert.equal(download.suggestedFilename(), `huefolio-sample-${kind}.${format}`);
      if (format === 'json') {
        const data = JSON.parse(bytes); assert.equal(data.colors.length, count); assert.equal(data.illustrativeSample, true);
        if (kind === 'combination') assert.deepEqual(data.colors.map(c => c.role), ['Base', 'Supporting', 'Accent']);
      } else { assert.equal(bytes.subarray(1, 4).toString(), 'PNG'); assert.equal(bytes.readUInt32BE(16), 1400); await download.saveAs(`.qa/${kind}.png`); }
    };
    await page.getByRole('link', { name: 'Explore How It Works' }).click();
    assert.equal(await page.locator('#how').evaluate(n => n === document.activeElement), true);
    let responsiveChecks = 0, contrastChecks = 0;
    const overflow = async label => {
      responsiveChecks++;
      const result = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
      assert.ok(result.width <= result.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(result)}`);
      const controls = await page.locator('button, a.button').evaluateAll(nodes => nodes.filter(n => n.getClientRects().length).map(n => ({ label: n.getAttribute('aria-label') || n.textContent.trim(), width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height, font: parseFloat(getComputedStyle(n).fontSize) })));
      for (const control of controls) assert.ok(control.label && control.width >= 44 && control.height >= 44 && control.font >= 14, `${label}: unreadable or small control ${JSON.stringify(control)}`);
      const contrast = await page.evaluate(() => {
        const rgba = value => (value.match(/[\d.]+/g) || []).map(Number);
        const luminosity = rgb => rgb.slice(0, 3).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
        const background = node => {
          const ancestors = []; for (let p = node; p; p = p.parentElement) ancestors.unshift(p);
          let result = [255, 255, 255];
          for (const parent of ancestors) {
            const color = rgba(getComputedStyle(parent).backgroundColor), alpha = color[3] ?? 1;
            result = result.map((c, i) => (color[i] ?? c) * alpha + c * (1 - alpha));
          }
          return result;
        };
        let checked = 0; const failures = [];
        for (const node of document.querySelectorAll('h1,h2,h3,p,label,button,a,code,summary,.badge,.provenance,.label,.disclosure')) {
          if (!node.getClientRects().length || !node.textContent.trim() || node.closest('button:disabled')) continue;
          const style = getComputedStyle(node); if (Number(style.opacity) < 1) continue;
          const a = luminosity(rgba(style.color)), b = luminosity(background(node));
          const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
          const large = parseFloat(style.fontSize) >= 24 || Number(style.fontWeight) >= 700 && parseFloat(style.fontSize) >= 18.66;
          checked++; if (ratio + .01 < (large ? 3 : 4.5)) failures.push({ element: node.tagName, text: node.textContent.trim().slice(0, 70), ratio });
        }
        return { checked, failures };
      });
      contrastChecks += contrast.checked;
      assert.deepEqual(contrast.failures, [], `${label}: WCAG text contrast failures`);
    };
    await fs.mkdir('.qa', { recursive: true });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) { await visit(route); await overflow(`empty ${route} at ${width}`); }
      await visit('/');
      await page.getByRole('button', { name: 'Explore sample colors', exact: true }).click();
      for (const route of routes.slice(3)) {
        await visit(route); await overflow(`sample ${route} at ${width}`);
        if ([390, 1440].includes(width)) await page.screenshot({ path: `.qa/${route.slice(1)}-${width}.png`, fullPage: true });
      }
      await visit('/');
      if (width === 390 || width === 1440) await page.screenshot({ path: `.qa/landing-${width}.png`, fullPage: true });
    }
    // Keyboard focus, color relationships, real code validation, and selection persistence.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await visit('/palette');
    await page.getByRole('button', { name: /Dusty lilac/ }).click();
    await page.getByRole('button', { name: /Dusty lilac/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Dusty lilac/ }).getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('unavailable')) } }); });
    await page.getByRole('button', { name: 'Copy HEX', exact: true }).click();
    await page.getByText('Copy unavailable. Select the visible HEX code and copy it manually.', { exact: true }).waitFor();
    await page.getByLabel('Add to my card: Soft sage').uncheck();
    await visit('/lab');
    assert.equal(await page.locator('#reference').inputValue(), '1');
    await page.locator('#hex-input').fill('#123'); await page.getByRole('button', { name: 'Compare', exact: true }).click();
    assert.equal(await page.locator('#hex-input').getAttribute('aria-invalid'), 'true');
    await page.locator('#hex-input').fill('#B4A3C5'); await page.locator('#hex-input').press('Enter');
    await page.getByText('The same color.', { exact: true }).waitFor();
    for (const hex of ['#315B62', '#C18A62']) {
      await page.locator('#hex-input').fill(hex); await page.getByRole('button', { name: 'Keep this color', exact: true }).click();
    }
    assert.equal(await page.locator('.comparison-choice').count(), 2);
    await page.getByRole('button', { name: 'Keep this color', exact: true }).click();
    await page.getByText('This color is already on your comparison board.', { exact: true }).waitFor();
    for (const hex of ['#123456', '#456789', '#987654']) {
      await page.locator('#picker').evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, hex);
      await page.getByRole('button', { name: 'Keep this color', exact: true }).click();
    }
    assert.equal(await page.locator('.comparison-choice').count(), 4);
    await page.getByText('Keep up to four colors. Remove one to try another.', { exact: true }).waitFor();
    for (const hex of ['#123456', '#456789']) await page.getByRole('button', { name: `Remove ${hex}`, exact: true }).click();
    await page.evaluate(() => { navigator.clipboard.writeText = async value => { window.copiedHEX = value; }; });
    await page.locator('.comparison-choice').first().getByRole('button', { name: 'Copy HEX' }).click();
    assert.equal(await page.evaluate(() => window.copiedHEX), '#315B62');
    for (const format of ['png', 'json']) await collectionDownload('board', format, 2);
    await page.setViewportSize({ width: 320, height: 1000 }); await overflow('comparison board at 320');
    await page.screenshot({ path: '.qa/comparison-board-320.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await visit('/palette'); await page.locator('#direction').selectOption('soft');
    for (const format of ['png', 'json']) await collectionDownload('palette', format, 13);
    assert.equal(await page.getByRole('button', { name: /Dusty lilac/ }).count(), 1);
    assert.ok(await page.locator('.source-app').count() > 0); assert.equal(await page.locator('.source-user').count(), 2);
    await page.getByRole('button', { name: /Soft light/ }).click();
    await page.getByText('WHY THIS COLOR? / HUEFOLIO CALCULATION', { exact: true }).waitFor();
    await page.getByText(/Created from Soft sage/).waitFor();
    await visit('/occasions');
    for (const name of ['Wedding', 'Interview', 'Professional', 'Casual']) await page.locator(`[data-occasion="${name}"]`).click();
    await page.getByRole('button', { name: /Party/ }).click();
    await page.getByRole('heading', { name: 'A little unexpected.' }).waitFor();
    await page.getByRole('button', { name: /Traditional event/ }).click();
    await page.getByRole('heading', { name: 'Color with personal meaning.' }).waitFor();
    await page.getByText('Why this combination?', { exact: true }).click();
    assert.equal(await page.locator('main details').evaluate(n => n.open), true);
    await page.locator('.occasion-colors [data-action="copy-color"]').first().click();
    for (const format of ['png', 'json']) await collectionDownload('combination', format, 3);
    await page.getByRole('button', { name: 'Privacy & session' }).click();
    assert.equal(await page.getByRole('button', { name: 'Done', exact: true }).evaluate(n => n === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#privacy-dialog').evaluate(n => n.contains(document.activeElement)), true);
    await page.setViewportSize({ width: 320, height: 700 }); await overflow('privacy modal at 320');
    assert.equal(await page.getByRole('button', { name: 'Done', exact: true }).evaluate(n => { const box = n.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; }), true, 'privacy close control must remain visible while its disclosure scrolls');
    await page.screenshot({ path: '.qa/privacy-320.png' });
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: 'Privacy & session' }).evaluate(n => n === document.activeElement), true);
    await page.getByRole('button', { name: 'Privacy & session' }).click(); await page.getByRole('button', { name: 'Done', exact: true }).click();
    for (const box of await page.locator('.occasion-colors button').evaluateAll(nodes => nodes.map(n => ({ width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })))) assert.ok(box.width >= 120 && box.height >= 48 && box.height <= 80, 'mobile copy buttons must have readable labels and comfortable targets');
    await page.screenshot({ path: '.qa/occasion-colors-320.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Exit', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Keep exploring' }).evaluate(n => n === document.activeElement), true);
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); assert.equal(await page.locator('#exit-dialog').evaluate(n => n.contains(document.activeElement)), true); }
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: 'Exit', exact: true }).evaluate(n => n === document.activeElement), true);
    await page.getByRole('button', { name: 'Exit', exact: true }).click();
    await page.getByRole('button', { name: 'View download options' }).click();
    await visit('/export');
    await page.getByText('4 selected colors, ready to take with you.').waitFor();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download sample card · PNG', exact: true }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'huefolio-sample-card.png');
    const downloadedPath = await download.path();
    const png = await fs.readFile(downloadedPath);
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1400); assert.equal(png.readUInt32BE(20), 1220);
    await download.saveAs('.qa/sample-card.png');
    await page.getByText('Card prepared.', { exact: true }).waitFor();
    const textDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download text summary', exact: true }).click();
    const summaryDownload = await textDownloadPromise;
    const summary = await fs.readFile(await summaryDownload.path(), 'utf8');
    assert.ok(summary.includes('Color direction: Soft')); assert.ok(summary.includes('Traditional event')); assert.ok(summary.includes('SELECTED PALETTE'));
    await visit('/palette');
    const generated = page.locator('.palette-section').filter({ has: page.getByRole('heading', { name: 'Made from your colors' }) }).getByRole('checkbox');
    const userPicks = page.locator('.palette-section').filter({ has: page.getByRole('heading', { name: 'Chosen by you' }) }).getByRole('checkbox');
    for (let i = 0; i < 3; i++) await generated.nth(i).check();
    await userPicks.nth(0).check();
    await generated.nth(3).click(); assert.equal(await generated.nth(3).isChecked(), false);
    await visit('/export'); await page.getByText('8 selected colors, ready to take with you.').waitFor();
    const fullDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download sample card · PNG', exact: true }).click();
    const fullCard = await fullDownload; await fullCard.saveAs('.qa/full-card-8.png');
    assert.equal((await fs.readFile(await fullCard.path())).readUInt32BE(20), 1500);
    await visit('/palette');
    for (let i = 0; i < 3; i++) await generated.nth(i).uncheck(); await userPicks.nth(0).uncheck();
    await visit('/export');
    await page.evaluate(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    await page.getByRole('button', { name: 'Download sample card · PNG', exact: true }).click();
    await page.getByText('Could not export your card.', { exact: true }).waitFor();
    await visit('/palette');
    for (const checkbox of await page.locator('[data-include]').all()) await checkbox.uncheck();
    await visit('/export'); await page.getByRole('heading', { name: 'Your card needs a little color.' }).waitFor();
    await page.getByRole('link', { name: 'Choose card colors' }).click();
    await page.getByLabel('Add to my card: Dusty lilac').check();
    await visit('/export');
    // Cancel preserves session; Start over confirms and opens a fresh photo step.
    await page.getByRole('button', { name: 'Start over', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Keep exploring' }).click();
    await page.getByRole('button', { name: 'Start over', exact: true }).click();
    await page.getByRole('button', { name: 'Clear & start over' }).click();
    await page.waitForURL('**/#/upload');
    await visit('/results'); await page.getByRole('heading', { name: 'No color profile yet.' }).waitFor();
    // Photo validation, image decoding, consent, and replace/reset behavior.
    await visit('/upload');
    await page.locator('#photo').setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await page.getByText('Choose a JPG or PNG photo.', { exact: true }).waitFor();
    await page.locator('#photo').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await page.getByText('Use a valid JPG or PNG with both sides between 320 and 4096 pixels.', { exact: true }).waitFor();
    await page.locator('#photo').setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
    await page.getByText('Choose a photo smaller than 9.5 MB.', { exact: true }).waitFor();
    const photo = { name: 'selfie.png', mimeType: 'image/png', buffer: png };
    await page.locator('#photo').setInputFiles(photo);
    await page.locator('.photo-preview').waitFor();
    await page.getByRole('button', { name: 'Remove photo' }).click();
    assert.equal(await page.locator('.photo-preview').count(), 0);
    await page.locator('#photo').setInputFiles(photo); await page.locator('.photo-preview').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Continue to analysis' }).isDisabled(), true);
    await page.locator('#consent').check();
    assert.equal(await page.getByRole('button', { name: 'Continue to analysis' }).isEnabled(), true);
    await page.locator('#photo').setInputFiles(photo);
    await page.locator('.photo-preview').waitFor();
    assert.equal(await page.locator('#consent').isChecked(), false);
    await page.locator('#consent').check();
    await page.getByRole('button', { name: 'Continue to analysis' }).click();
    await page.waitForURL('**/#/results');
    await page.getByText('Some colors are unavailable.', { exact: true }).waitFor();
    await visit('/palette');
    await page.getByRole('button', { name: /Skin #BA9279/ }).waitFor();
    while (!releases) await page.waitForTimeout(10);
    const transferredRequests = network.length;
    assert.equal(await page.getByRole('button', { name: /Soft sage/ }).count(), 0);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const r of routes) { await visit(r); await overflow(`measured ${r} at ${width}`); }
    }
    await visit('/occasions'); await overflow('measured occasion with only two colors');
    await page.getByRole('button', { name: /Traditional event/ }).click();
    await page.getByRole('button', { name: 'Use this combination on my card', exact: true }).click();
    await visit('/export'); await page.getByRole('button', { name: 'Download my card · PNG' }).waitFor();
    await page.getByText('Eyes (Brown) · #513C2D', { exact: true }).waitFor();
    await page.locator('#include-characteristics').uncheck();
    assert.equal(await page.getByText('Eyes (Brown) · #513C2D', { exact: true }).count(), 0);
    await page.locator('#include-characteristics').check();
    await page.screenshot({ path: '.qa/identity-card-measured.png', fullPage: true });
    assert.equal(analysisPosts, 1);
    assert.equal(network.length, transferredRequests, 'route changes must not contact analysis or provider endpoints');
    await visit('/upload'); assert.equal(await page.locator('.photo-preview').count(), 0);
    // Refresh is a fresh session even on an exploration route.
    await visit('/palette');
    leaveDecision = 'dismiss';
    const warning = page.waitForEvent('dialog'); await page.evaluate(() => location.reload()); await warning;
    await page.getByRole('button', { name: /Skin #BA9279/ }).waitFor();
    leaveDecision = 'accept'; await page.reload();
    assert.ok(nativeWarnings.filter(type => type === 'beforeunload').length >= 2);
    await page.getByRole('heading', { name: 'Your palette is a blank canvas.' }).waitFor();
    // Cancel and rate-limit paths require deliberate fresh consent, never route-driven submissions.
    for (const mode of ['waiting', 'limited', 'success']) {
      providerMode = mode; await visit('/upload');
      await page.locator('#photo').setInputFiles(photo); await page.locator('.photo-preview').waitFor();
      await page.locator('#consent').check(); await page.getByRole('button', { name: 'Continue to analysis' }).click();
      if (mode === 'waiting') {
        await visit('/upload'); assert.equal(await page.getByRole('button', { name: 'Continue to analysis' }).isDisabled(), true);
        await page.getByRole('link', { name: 'View current analysis', exact: true }).click();
        await page.getByRole('button', { name: 'Cancel analysis', exact: true }).click();
        await page.getByText(/Your local analysis was cancelled/).waitFor();
      } else if (mode === 'limited') await page.getByText('Analysis is busy. Please try again in a moment.', { exact: true }).waitFor();
      else {
        await page.waitForURL('**/#/results');
        await page.evaluate(() => { const realNow = Date.now; Date.now = () => realNow() + 901000; document.dispatchEvent(new Event('visibilitychange')); });
        await page.getByRole('heading', { name: 'No color profile yet.' }).waitFor();
      }
    }
    assert.equal(analysisPosts, 4, 'one POST per explicitly consented attempt');
    await visit('/'); await page.getByRole('button', { name: 'Explore sample colors', exact: true }).click();
    assert.equal(await page.evaluate(() => { dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); return document.querySelector('main').textContent; }), '');
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await page.getByRole('heading', { name: 'No color profile yet.' }).waitFor();
    await visit('/'); await page.getByRole('button', { name: 'Explore sample colors', exact: true }).click();
    await visit('/palette');
    await page.evaluate(() => {
      window.originalToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, ...args) { window.originalToBlob.call(this, blob => { window.finishPendingExport = () => callback(blob); }, ...args); };
    });
    const downloadsBeforeReset = downloadsRequested;
    await page.locator('[data-action="download-palette"][data-format="png"]').click();
    await page.waitForFunction(() => typeof window.finishPendingExport === 'function');
    await page.getByRole('button', { name: 'Exit', exact: true }).click(); await page.getByRole('button', { name: 'Exit & clear session' }).click();
    await page.waitForURL('**/#/'); assert.equal(await page.getByRole('button', { name: 'Exit', exact: true }).isDisabled(), true);
    await page.evaluate(() => { window.finishPendingExport(); HTMLCanvasElement.prototype.toBlob = window.originalToBlob; });
    await page.waitForTimeout(50); assert.equal(downloadsRequested, downloadsBeforeReset, 'a reset must suppress an export still being generated');
    assert.deepEqual(await context.cookies(), []);
    assert.equal(await page.evaluate(async () => localStorage.length + sessionStorage.length + (await indexedDB.databases()).length), 0);
    // The actual default build has no backend URL: judge samples must work without any API request.
    configuredBackend = ''; const networkBeforeSample = network.length;
    await page.goto('https://huefolio.test/');
    await visit('/upload'); assert.equal(await page.getByRole('button', { name: 'Continue to analysis' }).isDisabled(), true);
    await visit('/'); await page.getByRole('button', { name: 'Explore sample colors', exact: true }).click();
    await visit('/processing'); await page.getByRole('link', { name: 'View my results', exact: true }).click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const r of ['/results', '/palette', '/lab', '/occasions', '/export']) { await visit(r); await overflow(`unconfigured sample ${r} at ${width}`); }
    }
    await visit('/palette'); await collectionDownload('palette', 'json', 11);
    assert.equal(network.length, networkBeforeSample, 'unconfigured sample demo must never contact an API');
    await page.getByRole('button', { name: 'Exit', exact: true }).click(); await page.getByRole('button', { name: 'Exit & clear session' }).click();
    await page.goto('https://huefolio.test/?review=1#/states');
    for (const value of await page.locator('#review-state option').evaluateAll(nodes => nodes.map(n => n.value))) {
      await page.locator('#review-state').selectOption(value); await overflow(`state ${value}`);
    }
    await page.goto('https://huefolio.test/#/missing'); await page.getByRole('heading', { name: 'This page wandered off.' }).waitFor();
    assert.deepEqual(errors, []); assert.ok(network.every(url => url.startsWith('https://backend.test/')));
    await fs.writeFile('.qa/browser-results.json', JSON.stringify({ environment: 'Headless Chromium; repository assets fulfilled offline; mocked backend and unconfigured sample mode. Not production loading or Core Web Vitals.', browserVersion: browser.version(), bootMetrics, responsiveChecks, contrastChecks, consentedMockSubmissions: analysisPosts, realProviderCalls: 0, pageErrors: errors.length, localStorageEntries: 0, sessionStorageEntries: 0, indexedDBDatabases: 0, cookies: 0 }, null, 2));
    console.log('PASS: 8 routes at 4 widths; product controls; card/palette/board/combination downloads; modal keyboard focus; native Stay/Leave; expiry, reset and simulated cache restoration; export/reset race; consent, cancellation, rate limits; zero route-driven analysis requests or browser storage. Four explicitly consented mocked submissions, no real provider calls.');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

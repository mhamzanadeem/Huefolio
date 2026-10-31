import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// A deliberately synthetic server-only canary must never appear in frontend output.
const canary = 'qa-only-build-canary-not-a-provider-credential';
execFileSync(process.execPath, ['scripts/build.mjs', '--vercel'], { stdio: 'inherit', env: { ...process.env, YOUCAM_API_KEY: canary, HUEFOLIO_ADMIN_TOKEN: canary } });
const disclosure = 'Built for the YouCam API Hackathon using API credits provided for hackathon development.';
assert.ok((await readFile('dist/index.html', 'utf8')).includes(disclosure));
const assets = ['index.html', 'favicon.svg', ...(await readdir('dist/src')).map(f => `src/${f}`)];
let rawBytes = 0, gzipBytes = 0; const manifest = [];
for (const path of assets) {
  const data = await readFile(`dist/${path}`); assert.equal(data.includes(canary), false, 'server secret canary leaked');
  rawBytes += data.length; gzipBytes += gzipSync(data).length;
  manifest.push({ path, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
assert.ok(gzipBytes < 100 * 1024, 'Frontend gzip asset budget exceeds 100 KiB');
const configuration = JSON.parse(await readFile('.vercel/output/config.json', 'utf8'));
const headers = configuration.routes[0].headers;
assert.equal(configuration.version, 3); assert.equal(headers['Cache-Control'], 'no-store');
assert.equal(headers['X-Content-Type-Options'], 'nosniff');
assert.ok(headers['Content-Security-Policy'].includes("frame-ancestors 'none'"));
assert.equal(headers['Content-Security-Policy'].includes('*.onrender.com'), false);
execFileSync(process.execPath, ['scripts/security-check.mjs'], { stdio: 'inherit', env: { ...process.env, YOUCAM_API_KEY: canary, HUEFOLIO_ADMIN_TOKEN: canary } });
await mkdir('.qa', { recursive: true });
await writeFile('.qa/release-assets.json', JSON.stringify({ rawBytes, gzipBytes, assetCount: assets.length, manifest }, null, 2));
console.log(`PASS: release isolation, exact disclosure, Vercel security headers and size budget. ${assets.length} assets, ${rawBytes} raw bytes, ${gzipBytes} gzip bytes (sum of individually compressed assets, not measured network transfer).`);

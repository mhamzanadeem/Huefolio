import { mkdir, copyFile, readdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgePortraits } from './src/judge-portraits.js';
const workspace = resolve(fileURLToPath(new URL('.', import.meta.url)));
if (resolve(process.cwd()) !== workspace) throw new Error('Run the build from the Huefolio repository root.');
// Only these verified generated directories may be replaced. Preserve Vercel project binding.
for (const relative of ['dist', '.vercel/output/static']) {
  const target = resolve(workspace, relative);
  if (!target.startsWith(workspace + sep) || ![resolve(workspace, 'dist'), resolve(workspace, '.vercel/output/static')].includes(target)) throw new Error('Unsafe build output path.');
  await rm(target, { recursive: true, force: true });
}
const files = (await readdir('src')).filter(f => /\.(js|css)$/.test(f));
for (const file of files.filter(f => f.endsWith('.js'))) execFileSync(process.execPath, ['--check', `src/${file}`]);
for (const file of ['index.html', 'favicon.svg', ...files.map(f => `src/${f}`)]) {
  await readFile(file);
  await mkdir('dist/src', { recursive: true });
  await copyFile(file, `dist/${file}`);
}
console.log(`Built dist/ with ${files.length + 2} static assets. No dependencies required.`);
await mkdir('dist/assets/judge', { recursive: true });
for (const portrait of judgePortraits) {
  if (!/^\/assets\/judge\/portrait-[1-4]\.png$/.test(portrait.path)) throw new Error('Unexpected judge portrait path.');
  const relative = portrait.path.slice(1), source = `src/${relative}`, bytes = await readFile(source);
  if (bytes.length >= 9500000 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.readUInt32BE(16) < 320 || bytes.readUInt32BE(16) > 4096 || bytes.readUInt32BE(20) < 320 || bytes.readUInt32BE(20) > 4096) throw new Error('Invalid judge portrait.');
  await copyFile(source, `dist/${relative}`);
}
console.log(`Included ${judgePortraits.length} optional AI-generated judge portraits; fetched only on selection.`);
const publicURL = process.env.HUEFOLIO_BACKEND_URL || '';
let backendOrigin = '';
if (publicURL) {
  const u = new URL(publicURL);
  if (u.origin !== publicURL || u.username || u.password || (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error('HUEFOLIO_BACKEND_URL must be an exact HTTPS origin.');
  backendOrigin = u.origin;
}
await writeFile('dist/src/config.js', `// Public backend URL only.\nexport const BACKEND_URL = ${JSON.stringify(backendOrigin)};\n`);
if (process.argv.includes('--vercel')) {
  await mkdir('.vercel/output', { recursive: true });
  await cp('dist', '.vercel/output/static', { recursive: true });
  const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'${backendOrigin ? ' ' + backendOrigin : ''}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  await writeFile('.vercel/output/config.json', JSON.stringify({ version: 3, routes: [{ src: '/(.*)', headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }, continue: true }, { handle: 'filesystem' }] }, null, 2));
  console.log('Prepared Vercel Build Output API assets with an exact backend CSP origin.');
}

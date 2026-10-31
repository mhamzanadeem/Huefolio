import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Report locations/categories only: never echo suspected credentials or image data.
const git = (...args) => {
  try { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error('Git scan unavailable or exceeded its safety bound; repository contents were not printed.'); }
};
const findings = [];
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['literal provider credential', /(?:YOUCAM_API_KEY|HUEFOLIO_ADMIN_TOKEN)\s*[:=]\s*["']([A-Za-z0-9_+/=-]{24,})["']/]
];
function scan(text, label) {
  for (const [kind, pattern] of patterns) if (pattern.test(text)) findings.push(`${label}: possible ${kind}`);
}
const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
for (const file of new Set(files)) {
  if (/(?:^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example')) findings.push(`${file}: environment file would be published`);
  if (/\.(?:pem|key|p12|pfx)$/i.test(file)) findings.push(`${file}: private credential file would be published`);
  scan(await readFile(file, 'utf8'), file);
}
let historyBlobs = 0;
for (const line of git('rev-list', '--objects', '--all').trim().split('\n').filter(Boolean)) {
  const [sha] = line.split(' ');
  if (git('cat-file', '-t', sha).trim() !== 'blob') continue;
  historyBlobs++; scan(git('cat-file', 'blob', sha), `local history blob ${sha.slice(0, 12)}`);
}
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(e => e.isDirectory() ? walk(join(directory, e.name)) : [join(directory, e.name)]));
  return nested.flat();
}
const personalStorage = /\b(?:localStorage|sessionStorage|indexedDB)\b|document\s*\.\s*cookie\s*=/;
for (const file of await walk('src')) if (file.endsWith('.js') && personalStorage.test(await readFile(file, 'utf8'))) findings.push(`${file}: persistent browser storage requires review`);
const privateValues = ['YOUCAM_API_KEY', 'HUEFOLIO_ADMIN_TOKEN', 'VERCEL_TOKEN', 'RENDER_API_KEY', 'GITHUB_TOKEN'].map(k => process.env[k]).filter(v => v && v.length >= 8);
let assets = 0;
for (const directory of ['dist', '.vercel/output/static']) {
  for (const file of await walk(directory)) {
    assets++;
    if (!/(?:^|[\\/])(?:index\.html|favicon\.svg)$/.test(file) && !/[\\/]src[\\/][a-z-]+\.(?:js|css)$/.test(file)) findings.push(`${file}: unexpected public asset`);
    const body = await readFile(file, 'utf8'); scan(body, file);
    if (privateValues.some(secret => body.includes(secret))) findings.push(`${file}: server environment value in public output`);
    if (/(?:YOUCAM_API_KEY|HUEFOLIO_ADMIN_TOKEN|BEGIN PRIVATE KEY)/.test(body)) findings.push(`${file}: server-only identifier in public output`);
  }
}
if (findings.length) { findings.forEach(f => console.error(f)); process.exitCode = 1; }
else console.log(`PASS: ${files.length} publishable paths, ${historyBlobs} local-history blobs, ${assets} public assets; no detected credential patterns, server secret values, or persistent personal browser storage. Pattern scanning is not an exhaustive secret audit; remote history is not verified.`);

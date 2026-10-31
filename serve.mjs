import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), process.argv.includes('--dist') ? 'dist' : '.');
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // Serve only public application assets, never repository metadata or local documents.
    if (!(path === '/' || path === '/index.html' || path === '/favicon.svg' || /^\/src\/[a-z0-9-]+\.(js|css)$/.test(path))) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const target = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!target.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(target);
    res.writeHead(200, {
      'Content-Type': mime[extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' http://localhost:10000 http://127.0.0.1:10000 https://*.onrender.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Huefolio: http://127.0.0.1:${port}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });

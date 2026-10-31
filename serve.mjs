import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), process.argv.includes('--dist') ? 'dist' : '.');
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // Serve only public application assets, never repository metadata or local documents.
    if (!(path === '/' || path === '/index.html' || path === '/favicon.svg' || /^\/src\/[a-z0-9-]+\.(js|css)$/.test(path) || /^\/assets\/judge\/portrait-[1-4]\.png$/.test(path))) {
      res.writeHead(404); res.end('Not found'); return;
    }
    // Source images live with the frontend; builds retain their public /assets URL.
    const resource = !process.argv.includes('--dist') && /^\/assets\/judge\/portrait-[1-4]\.png$/.test(path) ? '/src' + path : path;
    const target = resolve(root, '.' + (resource === '/' ? '/index.html' : resource));
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

// Static, local-only UI preview. API requests deliberately cannot reach providers.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const headers = await readFile(resolve(root, '_headers'), 'utf8');
const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1];
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return; }
  if (pathname.startsWith('/api/')) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Prévia visual: API não conectada. Use npm run dev para testar a integração local.' }));
    return;
  }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': (mime[extname(path)] || 'application/octet-stream') + '; charset=utf-8',
      'Cache-Control': 'no-store', ...(csp ? { 'Content-Security-Policy': csp } : {}) });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(5173, '127.0.0.1', () => console.log('Prévia visual: http://127.0.0.1:5173 (sem backend)'));

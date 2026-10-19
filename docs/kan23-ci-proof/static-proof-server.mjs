// A private, localhost-only, read-only built-artifact server. Importing does not start it.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
const mime = new Map([['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.mjs','text/javascript; charset=utf-8'],['.css','text/css; charset=utf-8'],['.json','application/json'],['.webmanifest','application/manifest+json'],['.svg','image/svg+xml'],['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.webp','image/webp'],['.avif','image/avif'],['.gif','image/gif'],['.ico','image/x-icon'],['.woff','font/woff'],['.woff2','font/woff2'],['.ttf','font/ttf'],['.txt','text/plain; charset=utf-8']]);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function confinedFile(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes('\0') || path.posix.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) throw new Error('Unsafe artifact relative path');
  const resolvedRoot = fs.realpathSync(root);
  let current = resolvedRoot;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Artifact symlink/reparse path refused');
  }
  const absolute = fs.realpathSync(current), boundary = resolvedRoot.toLowerCase() + path.sep;
  if (!absolute.toLowerCase().startsWith(boundary) || !fs.statSync(absolute).isFile()) throw new Error('Artifact path escaped output root');
  return absolute;
}

export async function serveStaticProof({ root, port, files, onFailure }) {
  const origin = `http://127.0.0.1:${port}`;
  const server = http.createServer((request, response) => {
    const reject = reason => { onFailure(reason); response.writeHead(404, { 'Cache-Control':'no-store' }); response.end('Local fixture request refused'); };
    try {
      if (request.headers.host !== `127.0.0.1:${port}` || request.method !== 'GET') return reject('Static server host/method refused');
      const raw = request.url ?? '';
      if (!raw.startsWith('/') || raw.startsWith('//') || /%2e|%2f|%5c|\\/i.test(raw.split('?')[0])) return reject('Static server encoded/unsafe path refused');
      const url = new URL(raw, origin);
      if (url.origin !== origin || url.pathname.startsWith('/api/')) return reject('Static server API/origin refused');
      const decoded = decodeURIComponent(url.pathname);
      const relative = decoded === '/' || decoded === '/research/early-access/order-request' ? 'index.html' : decoded.slice(1);
      const entry = files.get(relative);
      if (!entry) return reject('Static server path not in artifact manifest');
      const type = mime.get(path.extname(relative).toLowerCase());
      if (!type) return reject('Static server MIME not allowlisted');
      const bytes = fs.readFileSync(confinedFile(root, relative));
      if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) return reject('Static artifact changed after build');
      response.writeHead(200, { 'Content-Type':type, 'Content-Length':bytes.length, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
      response.end(bytes);
    } catch { reject('Static server path/read validation failed'); }
  });
  server.on('upgrade', (_request, socket) => { onFailure('Static fixture websocket refused'); socket.destroy(); });
  server.on('clientError', (_error, socket) => { onFailure('Static fixture malformed client refused'); socket.destroy(); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  server.on('error', () => onFailure('Static fixture listener error'));
  return { origin, address:server.address(), async close() { await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }); } };
}



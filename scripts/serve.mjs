// Servidor estático local para desenvolvimento (sem dependências).
// Gera o assets/js/env.js e serve o site em http://localhost:PORT
// Bloqueia arquivos sensíveis (.env, scripts, SQL, node_modules).
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
import { loadEnv, ROOT } from './env.mjs';

await import('./build-config.mjs');

const PORT = Number(loadEnv().get('PORT', '5500')) || 5500;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8'
};
const BLOCKED = /(^|\/)(\.[^/]*|node_modules|scripts|supabase|package(-lock)?\.json|README\.md)(\/|$)/i;

createServer((req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (path.endsWith('/')) path += 'index.html';
  const rel = normalize(path).replace(/^([/\\])+/, '');
  if (BLOCKED.test(rel.split(sep).join('/'))) { res.writeHead(404).end('Not found'); return; }
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT + sep)) { res.writeHead(403).end('Forbidden'); return; }
  let st;
  try { st = statSync(file); } catch { res.writeHead(404).end('Not found'); return; }
  if (!st.isFile()) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`\nFielTour rodando em http://localhost:${PORT}`);
  console.log(`Site público:   http://localhost:${PORT}/index.html`);
  console.log(`Login admin:    http://localhost:${PORT}/login.html`);
  console.log(`Painel admin:   http://localhost:${PORT}/admin.html\n`);
});

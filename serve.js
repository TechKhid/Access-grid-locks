// Tiny static server for local preview: `node serve.js` → http://localhost:4173
// The site is rebuilt from src/ into public/ whenever a page is requested, so edits show on refresh.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { build, OUT } = require('./build');
const track = require('./api/track');

try { process.loadEnvFile(path.join(__dirname, '.env.local')); } catch { /* no local env file: notifications are only logged */ }

const PORT = Number(process.env.PORT) || 4173;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };

build({ clean: true });
http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (urlPath === '/api/track') { track(req, res); return; }
  const file = path.join(OUT, path.normalize(urlPath === '/' ? '/index.html' : urlPath));
  if (!file.startsWith(OUT)) { res.writeHead(403).end(); return; }
  if (file.endsWith('.html')) { try { build(); } catch (err) { console.error(err.message); } }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  });
}).listen(PORT, () => console.log(`AccessGrid Solutions concept site → http://localhost:${PORT}`));

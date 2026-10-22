/**
 * Arendusserver: serveerib esipaneeli ja simuleerib Apps Scripti API-t
 * aadressil /api (Code.gs käib Node'is simulatsioonis, andmed mälus).
 * Käivita: node tests/dev-server.js  → ava http://localhost:8080
 * Seadistuskood kuvatakse konsoolis. VIIVITUS_MS=3000 lisab igale API vastusele viivituse.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { looKeskkond } = require('./gas-mock');

// VIIVITUS_MS=3000 node tests/dev-server.js → API vastab 3 s viivitusega (nagu aeglane Apps Script)
const VIIVITUS = Number(process.env.VIIVITUS_MS) || 0;
const K = looKeskkond();
console.log(K.g.seadista());
const JUUR = path.join(__dirname, '..');
const TYYBID = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer((req, res) => {
  if (req.url.startsWith('/api')) {
    let keha = '';
    req.on('data', c => (keha += c));
    req.on('end', () => setTimeout(() => {
      const out = req.method === 'POST'
        ? K.g.doPost({ postData: { contents: keha } })
        : K.g.doGet({ parameter: Object.fromEntries(new URL(req.url, 'http://x').searchParams) });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(out.getContent());
    }, VIIVITUS));
    return;
  }
  const p = path.join(JUUR, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(JUUR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYYBID[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(process.env.PORT || 8080, () => console.log('http://localhost:' + (process.env.PORT || 8080)));

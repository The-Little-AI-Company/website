// Serves a live.sh snapshot on 127.0.0.1:PORT, so browser.mjs can drive production's own pages
// and stylesheets inside a sandbox that cannot reach production.
// Usage: node replay.mjs LIVE_DIR PORT
// Each page gets the status and content type production sent. Stylesheets come from files/.
// Anything else answers 404 with production's 404 page. Nothing is fetched from the network.
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize } from 'node:path';

const [dir, port] = process.argv.slice(2);
const pages = new Map();
for (const line of readFileSync(join(dir, 'pages.tsv'), 'utf8').trim().split('\n')) {
  const [name, path, status] = line.split('\t');
  const headers = readFileSync(join(dir, 'pages', `${name}.headers`), 'utf8');
  const type = /^content-type:\s*(.+?)\s*$/im.exec(headers)?.[1] ?? 'text/html; charset=utf-8';
  pages.set(path, { status: Number(status), type, body: readFileSync(join(dir, 'pages', name)) });
}
const notFound = pages.get('/does-not-exist/');
const TYPES = { css: 'text/css; charset=utf-8' };

createServer((req, res) => {
  const path = new URL(req.url, 'http://replay').pathname;
  const page = pages.get(path);
  if (page) {
    res.writeHead(page.status, { 'content-type': page.type });
    return res.end(page.body);
  }
  const file = join(dir, 'files', normalize(path).replace(/^([/\\])+/, ''));
  if (file.startsWith(join(dir, 'files')) && existsSync(file)) {
    res.writeHead(200, { 'content-type': TYPES[path.split('.').pop()] ?? 'application/octet-stream' });
    return res.end(readFileSync(file));
  }
  res.writeHead(404, { 'content-type': notFound.type });
  res.end(notFound.body);
}).listen(Number(port), '127.0.0.1', () => console.log(`REPLAY_RESULT=pass http://127.0.0.1:${port} from ${dir}`));

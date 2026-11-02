// Reads the answer key. Usage: node key.mjs KEYFILE > key.json
// The caller passes the origin/dev copy. Nothing here reads the branch under test.
import { readFileSync } from 'node:fs';

const text = readFileSync(process.argv[2], 'utf8');
const lines = text.split('\n');
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
const unquote = (s) => s.replace(/^`|`$/g, '');

const rows = [];
const pages = [];
const known = [];
let footer = null;
let section = '';
for (const line of lines) {
  if (line.startsWith('## ')) section = line.slice(3).trim();
  if (!line.startsWith('|') || /^\|[-| ]+\|$/.test(line)) continue;
  const c = cells(line);
  if (section === 'Visitor journeys' && /^T\d+$/.test(c[0])) {
    rows.push({ id: c[0], action: c[1], expected: c[2], check: c[3], target: c[4].startsWith('target') });
  } else if (section === 'Pages' && c[0].startsWith('`/')) {
    pages.push({ path: unquote(c[0]), h1: c[1], nav: c[2] });
  } else if (section === 'Footer' && c[0] === 'Privacy promise') {
    footer = c[1];
  } else if (section === 'Known defects' && c[0] !== 'Path') {
    known.push({ path: unquote(c[0]), found: c[1] });
  }
}
if (!rows.length || !pages.length || !footer) {
  console.error(`KEY parse failed: rows=${rows.length} pages=${pages.length} footer=${Boolean(footer)}`);
  process.exit(1);
}
console.log(JSON.stringify({ rows, pages, footer, known }, null, 1));

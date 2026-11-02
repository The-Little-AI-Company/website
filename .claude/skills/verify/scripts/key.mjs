// Reads the answer key. Usage: node key.mjs KEYFILE > key.json
// The caller passes the origin/dev copy. Nothing here reads the branch under test.
import { readFileSync } from 'node:fs';

const text = readFileSync(process.argv[2], 'utf8');
const lines = text.split('\n');
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
const unquote = (s) => s.replace(/^`|`$/g, '');
const spans = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

const rows = [];
const pages = [];
const dark = [];
const required = [];
const lightTokens = {};
const darkTokens = {};
const externalNumbers = [];
const known = [];
let footer = null;
let mark = null;
let section = '';
for (const line of lines) {
  if (line.startsWith('## ')) section = line.slice(3).trim();
  if (section === 'Mark path' && /^`M[^`]+`\s*$/.test(line)) mark = unquote(line.trim());
  if (!line.startsWith('|') || /^\|[-| ]+\|$/.test(line)) continue;
  const c = cells(line);
  if (section === 'Visitor journeys' && /^T\d+$/.test(c[0])) {
    rows.push({ id: c[0], action: c[1], expected: c[2], check: c[3], target: c[4].startsWith('target') });
  } else if (section === 'Pages' && c[0].startsWith('`/')) {
    pages.push({ path: unquote(c[0]), h1: c[1], nav: c[2] });
  } else if (section === 'Dark pages' && c[0].startsWith('`/')) {
    dark.push({ path: unquote(c[0]), light: unquote(c[1]) });
  } else if (section === 'Footer' && c[0] === 'Privacy promise') {
    footer = c[1];
  } else if (section === 'Required strings' && c[0].startsWith('`/')) {
    required.push({ path: unquote(c[0]), strings: c[1].split('·').map((s) => s.trim()).filter(Boolean) });
  } else if (section === 'Light tokens' && c[0].startsWith('`--')) {
    lightTokens[unquote(c[0])] = unquote(c[1]);
  } else if (section === 'Dark tokens' && c[0].startsWith('`--')) {
    darkTokens[unquote(c[0])] = unquote(c[1]);
  } else if (section === 'External page numbers' && /^\d{3}$/.test(c[0])) {
    externalNumbers.push({ number: c[0], targets: spans(c[1]) });
  } else if (section === 'Known defects' && c[0] !== 'Path') {
    known.push({ path: unquote(c[0]), found: c[1] });
  }
}
const parsed = { rows, pages, dark, required, lightTokens, darkTokens, externalNumbers, footer, mark };
const missing = Object.entries(parsed).filter(([, v]) => !v || (typeof v === 'object' && !Object.keys(v).length)).map(([k]) => k);
// Every dark route names a light page the Pages table has, or the dark rows have nothing to compare with.
for (const d of dark) if (!pages.some((p) => p.path === d.light)) missing.push(`dark ${d.path} light page ${d.light}`);
for (const r of required) if (!pages.some((p) => p.path === r.path)) missing.push(`required strings page ${r.path}`);
if (missing.length) {
  console.error(`KEY parse failed, missing or empty: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(JSON.stringify({ ...parsed, known }, null, 1));

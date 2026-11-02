// COVER and the target count. Usage: node cover.mjs KEY_JSON EVIDENCE_DIR
// Every key row must have a result on every side it applies to. A result on one side never
// covers the other. A target row counts as passing on a side only when every result for it
// there (static and browser) is PASS.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [keyFile, evidence] = process.argv.slice(2);
const key = JSON.parse(readFileSync(keyFile, 'utf8'));
// The repo rows run once, on the checkout. Every other row is judged on the build and on
// production. T31 is not build only: its workflow part is a repo check that checks.mjs adds to
// the build result, and its page part runs on both sides.
const BUILD_ONLY = new Set(['T10', 'T14']);
const results = [];
const repo = join(evidence, 'repo.txt');
if (existsSync(repo)) {
  for (const line of readFileSync(repo, 'utf8').trim().split('\n').filter(Boolean)) {
    const [id, verdict] = line.split(' ');
    results.push({ id, side: 'build', verdict });
  }
}
for (const f of ['checks.json', 'browser.json']) {
  const file = join(evidence, f);
  if (existsSync(file)) results.push(...JSON.parse(readFileSync(file, 'utf8')).results);
}

const missing = [];
for (const row of key.rows) {
  for (const side of BUILD_ONLY.has(row.id) ? ['build'] : ['build', 'live']) {
    if (!results.some((r) => r.id === row.id && r.side === side)) missing.push(`${row.id}/${side}`);
  }
}
const failedTargets = (side) => key.rows.filter((row) => row.target).filter((row) => {
  const mine = results.filter((r) => r.id === row.id && r.side === side);
  return mine.length === 0 || mine.some((r) => r.verdict !== 'PASS');
}).map((row) => row.id);

console.log(missing.length ? `FAIL    COVER key rows with no result on a required side: ${missing.join(' ')}`
  : 'PASS    COVER every key row has a result on every side it applies to');
const build = failedTargets('build');
const live = failedTargets('live');
console.log(`TARGETS targets_failed_build=${build.length} targets_failed_live=${live.length} build:[${build.join(' ')}] live:[${live.join(' ')}]`);
process.exit(missing.length ? 1 : 0);

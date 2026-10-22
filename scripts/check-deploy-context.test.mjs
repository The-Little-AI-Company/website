import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const launcher = read('scripts/run-security-container.sh');

// actions/deploy-pages at 368f82528645a54fb793d4d04e342629a3f51346, src/internal/context.js:
// getContext() throws unless each of these is set. GITHUB_API_URL and GITHUB_SERVER_URL have defaults.
const DEPLOY_PAGES_REQUIRED = ['GITHUB_RUN_ID', 'GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_ACTOR', 'GITHUB_ACTION'];

test('every variable deploy-pages requires reaches the container', () => {
  const forwarded = /^for name in ((?:GITHUB_[A-Z_]+ ?)+); do$/m.exec(launcher)?.[1].trim().split(' ') ?? [];
  assert.ok(forwarded.length > 0, 'the forwarded GITHUB_ variable list was not found');
  const fixed = [...launcher.matchAll(/--env (GITHUB_[A-Z_]+)=/g)].map(m => m[1]);
  const missing = DEPLOY_PAGES_REQUIRED.filter(name => !forwarded.includes(name) && !fixed.includes(name));
  assert.deepEqual(missing, [], `deploy-pages would stop with "<variable> is undefined" for ${missing.join(', ')}`);
});

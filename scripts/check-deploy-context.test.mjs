import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const launcher = read('scripts/run-security-container.sh');

// The environment variables actions/deploy-pages needs at this commit, from src/internal/context.js:
// getContext() throws unless each is set. GITHUB_API_URL and GITHUB_SERVER_URL have defaults. The token
// input and the runtime credentials are checked elsewhere.
const DEPLOY_PAGES_COMMIT = '368f82528645a54fb793d4d04e342629a3f51346';
const DEPLOY_PAGES_REQUIRED = ['GITHUB_RUN_ID', 'GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_ACTOR', 'GITHUB_ACTION'];

test('every variable deploy-pages requires reaches the container', () => {
  const forwarded = /^for name in ((?:GITHUB_[A-Z_]+ ?)+); do$/m.exec(launcher)?.[1].trim().split(' ') ?? [];
  assert.ok(forwarded.length > 0, 'the forwarded GITHUB_ variable list was not found');
  const fixed = [...launcher.matchAll(/--env (GITHUB_[A-Z_]+)=/g)].map(m => m[1]);
  const missing = DEPLOY_PAGES_REQUIRED.filter(name => !forwarded.includes(name) && !fixed.includes(name));
  assert.deepEqual(missing, [], `deploy-pages would stop with "<variable> is undefined" for ${missing.join(', ')}`);
});

test('the required list was read from the deploy-pages commit the image actually pins', () => {
  const pins = JSON.parse(read('.github/actions/security-ci/artifacts.json')).artifacts
    .map(artifact => /^https:\/\/raw\.githubusercontent\.com\/actions\/deploy-pages\/([a-f0-9]{40})\//.exec(artifact.url)?.[1])
    .filter(Boolean);
  assert.ok(pins.length > 0, 'no deploy-pages artifact is pinned');
  // A new pin means rereading src/internal/context.js at that commit and updating DEPLOY_PAGES_REQUIRED.
  assert.deepEqual([...new Set(pins)], [DEPLOY_PAGES_COMMIT]);
});

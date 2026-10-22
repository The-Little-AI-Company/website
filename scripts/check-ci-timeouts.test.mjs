import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ci = read('.github/workflows/ci.yml');
const playwright = read('playwright.config.ts');

test('a slow or stuck verify step fails inside the job, so reports, logs and cleanup still run', () => {
  const job = Number(/^    timeout-minutes: (\d+)$/m.exec(ci)?.[1]);
  const verify = ci.slice(ci.indexOf('        id: verify\n'), ci.indexOf('        id: reports\n'));
  const step = Number(/^        timeout-minutes: (\d+)$/m.exec(verify)?.[1]);
  const suite = Number(/globalTimeout: CI \? (\d+) \* 60_000 : 0,/.exec(playwright)?.[1]);
  assert.ok(job > 0 && step > 0 && suite > 0, 'job, verify step and Playwright suite each need a timeout');
  assert.ok(suite < step && step < job, `expected suite ${suite} < verify ${step} < job ${job} minutes`);
});

test('hosted Actions counts as CI inside the allowlisted container environment', () => {
  assert.match(playwright, /const CI = Boolean\(process\.env\.CI\) \|\| process\.env\.GITHUB_ACTIONS === 'true';/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ci = read('.github/workflows/ci.yml');
const playwright = read('playwright.config.ts');
const image = read('.github/actions/security-ci/Dockerfile');

// The steps before verify take about 1.5 minutes. Pack, upload and cleanup need the rest.
const AFTER_VERIFY_MINUTES = 5;

test('each layer stops before the next, leaving the job time to pack, upload and clean up', () => {
  const job = Number(/^    timeout-minutes: (\d+)$/m.exec(ci)?.[1]);
  const verify = ci.slice(ci.indexOf('        id: verify\n'), ci.indexOf('        id: reports\n'));
  const step = Number(/^        timeout-minutes: (\d+)$/m.exec(verify)?.[1]);
  const entry = /^ENTRYPOINT \["\/usr\/bin\/timeout", "--kill-after=(\d+)s", "(\d+)m", "\/bin\/bash", "-p", "\/opt\/company\/entrypoint\.sh"\]$/m.exec(image);
  const container = Number(entry?.[2]);
  const suite = Number(/globalTimeout: CI \? (\d+) \* 60_000 : 0,/.exec(playwright)?.[1]);
  assert.ok(job > 0 && step > 0 && container > 0 && suite > 0, 'job, step, container and suite each need a bound');
  assert.ok(suite < container, `suite ${suite} must end before the container bound ${container}`);
  assert.ok(container + Number(entry[1]) / 60 < step, `container ${container}m plus its kill grace must end before the step ${step}m`);
  assert.ok(job - step >= AFTER_VERIFY_MINUTES, `job ${job}m leaves only ${job - step}m after a ${step}m verify step`);
});

test('hosted Actions counts as CI inside the allowlisted container environment', () => {
  assert.match(playwright, /const CI = Boolean\(process\.env\.CI\) \|\| process\.env\.GITHUB_ACTIONS === 'true';/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ci = read('.github/workflows/ci.yml');
const deploy = read('.github/workflows/deploy.yml');
const playwright = read('playwright.config.ts');
const image = read('.github/actions/security-ci/Dockerfile');

// Steps before verify take about 1.5 minutes. Pack, upload and cleanup need 5 more after verify.
const SETUP_MINUTES = 2;
const AFTER_VERIFY_MINUTES = 5;
// Playwright starts 20 to 30 seconds into the container and needs time to write its report after globalTimeout.
const SUITE_TO_CONTAINER_MINUTES = 2;

const bounds = workflow => {
  const job = Number(/^    timeout-minutes: (\d+)$/m.exec(workflow)?.[1]);
  const start = workflow.indexOf('        id: verify\n');
  const verify = workflow.slice(start, workflow.indexOf('      - name:', start));
  const step = Number(/^        timeout-minutes: (\d+)$/m.exec(verify)?.[1]);
  return { job, step };
};

test('each layer stops before the next, leaving the job time to pack, upload and clean up', () => {
  const entry = /^ENTRYPOINT \["\/usr\/bin\/timeout", "--kill-after=(\d+)s", "(\d+)m", "\/bin\/bash", "-p", "\/opt\/company\/entrypoint\.sh"\]$/m.exec(image);
  const container = Number(entry?.[2]);
  const grace = Number(entry?.[1]) / 60;
  const suite = Number(/globalTimeout: CI \? (\d+) \* 60_000 : 0,/.exec(playwright)?.[1]);
  assert.ok(container > 0 && suite > 0, 'the container and the suite each need a bound');
  assert.ok(container - suite >= SUITE_TO_CONTAINER_MINUTES, `suite ${suite}m leaves under ${SUITE_TO_CONTAINER_MINUTES}m before the container bound ${container}m`);
  for (const [name, workflow] of [['ci.yml', ci], ['deploy.yml', deploy]]) {
    const { job, step } = bounds(workflow);
    assert.ok(job > 0 && step > 0, `${name}: the build job and its verify step each need a timeout`);
    assert.ok(container + grace < step, `${name}: container ${container}m plus grace must end before the ${step}m step`);
    assert.ok(job - SETUP_MINUTES - step >= AFTER_VERIFY_MINUTES, `${name}: job ${job}m leaves ${job - SETUP_MINUTES - step}m after setup and a ${step}m verify step`);
  }
});

test('the verify container runs under an init that reaps orphans', () => {
  assert.match(read('scripts/run-security-container.sh'), /^common=\(run --rm --init --user /m);
});

test('hosted Actions counts as CI inside the allowlisted container environment', () => {
  assert.match(playwright, /const CI = Boolean\(process\.env\.CI\) \|\| process\.env\.GITHUB_ACTIONS === 'true';/);
});

test('local test:node runs every Node policy suite the CI container runs', () => {
  const entry = read('.github/actions/security-ci/entrypoint.sh');
  const suites = /^    node --test (scripts\/\S+(?: scripts\/\S+)*)$/m.exec(entry)?.[1].split(' ') ?? [];
  const local = JSON.parse(read('package.json')).scripts['test:node'].split(' ').slice(2);
  assert.ok(suites.length > 0, 'the CI Node suite list was not found');
  assert.deepEqual(suites.filter(suite => !local.includes(suite)), []);
});

test('the managed Chrome gets writable XDG directories although the image keeps XDG_CONFIG_HOME read-only', () => {
  const entry = read('.github/actions/security-ci/entrypoint.sh');
  assert.match(entry, /export HOME="\$private_home" XDG_CONFIG_HOME=\/opt\/company\/empty-config/);
  assert.match(playwright, /const browserHome = managedBrowser \? mkdtempSync\(join\(tmpdir\(\), 'company-chrome-'\)\) : '';/);
  assert.match(playwright, /XDG_CONFIG_HOME: join\(browserHome, 'config'\), XDG_CACHE_HOME: join\(browserHome, 'cache'\)/);
  assert.match(playwright, /channel: 'chrome' as const, launchOptions: \{ env: \{ \.\.\.process\.env, \.\.\.browserXdg \} \}/);
});

test('a systemic CI failure stops early instead of tracing every test', () => {
  const failures = Number(/maxFailures: CI \? (\d+) : 0,/.exec(playwright)?.[1]);
  assert.ok(failures > 0 && failures <= 25, `maxFailures in CI should be a small positive number, got ${failures}`);
});

test('cleanup stops a verify container that a cancelled step left running before it deletes files', () => {
  const launcher = read('scripts/run-security-container.sh');
  assert.match(launcher, /^container=\$\{directory##\*\/\}$/m);
  assert.match(launcher, /docker "\$\{common\[@\]\}" --name "\$container" --env INPUT_MODE=verify/);
  const cleanup = launcher.slice(launcher.indexOf('if test "$mode" = cleanup; then'));
  assert.ok(cleanup.indexOf('docker rm --force "$container"') >= 0, 'cleanup must remove the named container');
  assert.ok(cleanup.indexOf('docker rm --force "$container"') < cleanup.indexOf('rm -rf -- "$directory"'), 'the container must stop before its files go');
});

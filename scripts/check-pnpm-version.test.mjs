import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { pnpmPinError, pnpmRuntimeError, pnpmVersionError } from './check-pnpm-version.mjs';

const manifest = { packageManager: 'pnpm@10.34.7' };

test('rejects old or unreviewed pnpm artifacts and accepts the selected release', () => {
  for (const version of ['11.0.0', '11.5.3', '11.7.0', '11.8.0', '11.9.0', '11.11.0', '11.25.0', '10.34.6', '11.28.7', '11.29.0']) {
    assert.match(pnpmVersionError(version), /outside the reviewed/, version);
  }
  assert.equal(pnpmVersionError('10.34.7'), null);
  for (const version of ['10.34.5', '12.0.0', '11', '11.11', 'v11.11.0', '011.11.0', '11.11.0-rc.1', '11.11.0+build', '11.11.0 extra']) {
    assert.ok(pnpmVersionError(version), version);
  }
});

test('requires a fixed exact pnpm pin before bootstrap can run', () => {
  assert.equal(pnpmPinError(manifest), null);
  for (const packageManager of ['pnpm@11.9.0', 'pnpm@11.11.0', 'pnpm@^10.34.7', 'pnpm@latest', 'npm@10.34.7', undefined]) {
    assert.ok(pnpmPinError({ packageManager }), String(packageManager));
  }
  assert.match(pnpmPinError({ ...manifest, devEngines: { packageManager: { name: 'pnpm', version: '11.9.0' } } }), /competing/);
  let ran = false;
  assert.ok(pnpmRuntimeError({ packageManager: 'pnpm@11.9.0' }, () => { ran = true; return '11.9.0'; }));
  assert.equal(ran, false);
});

test('checks the observed runtime and fails closed on a mismatch or command failure', () => {
  assert.match(pnpmRuntimeError(manifest, () => '11.9.0'), /outside the reviewed/);
  assert.equal(pnpmRuntimeError(manifest, () => '10.34.7'), null);
  assert.match(pnpmRuntimeError(manifest, () => '11.25.0'), /outside the reviewed/);
  assert.match(pnpmRuntimeError(manifest, () => '10.34.7\nunexpected'), /exact stable/);
  assert.match(pnpmRuntimeError(manifest, () => { throw new Error('not available'); }), /Cannot read/);
});

test('pin-only CLI ignores spoofed version variables and rejects version arguments', () => {
  const script = fileURLToPath(new URL('./check-pnpm-version.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--pin'], {
    encoding: 'utf8', env: { ...process.env, PNPM_VERSION: '11.9.0', npm_config_user_agent: 'pnpm/11.9.0' },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /pnpm@10\.34\.7 pin passes/);
  const spoof = spawnSync(process.execPath, [script, '11.11.0'], { encoding: 'utf8' });
  assert.equal(spoof.status, 1);
  assert.match(spoof.stderr, /Usage:/);
});

test('image-owned policy checks precede the frozen manager at every phase', () => {
  const entry = readFileSync(new URL('../.github/actions/security-ci/entrypoint.sh', import.meta.url), 'utf8');
  const wrapper = entry.slice(entry.indexOf('trusted_pnpm()'), entry.indexOf('upload()'));
  const pin = wrapper.indexOf('/opt/company/assert-project-policy.mjs');
  const runtime = wrapper.indexOf('/opt/company/scripts/check-pnpm-version.mjs');
  const manager = wrapper.indexOf('/opt/node/bin/pnpm "$@"');
  assert.ok(pin >= 0 && pin < runtime && runtime < manager);
  assert.doesNotMatch(entry, /install-ci-pnpm.sh|pnpm_bin|container_path/);
  const audit = entry.indexOf('trusted_pnpm audit --json --audit-level=low');
  const install = entry.indexOf('trusted_pnpm install --frozen-lockfile');
  assert.ok(audit >= 0 && audit < install);
  assert.match(entry, /npm_config_manage_package_manager_versions=false/);
  assert.match(entry, /npm_config_ignore_pnpmfile=true/);
});

test('every site build checks the manager before audit and Astro, and deploy needs that build', () => {
  const { scripts, packageManager } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageManager, 'pnpm@10.34.7');
  assert.equal(scripts.build, 'node scripts/check-node-version.mjs && node scripts/check-pnpm-version.mjs && pnpm audit:deps && astro build');
  const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(readFileSync(new URL('../.github/actions/security-ci/entrypoint.sh', import.meta.url), 'utf8'), /pnpm build/);
  assert.match(deploy, /deploy:\n    needs: build/);
  assert.doesNotMatch(deploy, /pull_request|continue-on-error/);
});

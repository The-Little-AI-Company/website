import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { nodeVersionError } from './check-node-version.mjs';

const verifiedAt = new Date('2026-10-21T00:00:00Z');

test('accepts the security releases and later patches on supported lines', () => {
  for (const version of ['22.23.4', '22.23.5', '22.24.0', '24.22.1', '24.23.0', '26.12.1', '26.13.0']) {
    assert.equal(nodeVersionError(version, verifiedAt), null, version);
  }
});

test('rejects vulnerable releases, including older minors with higher patch numbers', () => {
  for (const version of ['22.23.3', '22.22.99', '24.22.0', '24.21.99', '26.12.0', '26.11.99']) {
    assert.match(nodeVersionError(version, verifiedAt), /below the required/, version);
  }
});

test('rejects EOL, odd, unknown, prerelease, and malformed versions', () => {
  for (const version of ['18.20.8', '20.20.0', '23.11.0', '25.9.0', '27.0.0', '28.0.0']) {
    assert.match(nodeVersionError(version, verifiedAt), /unsupported/, version);
  }
  for (const version of ['', '22', 'v22.23.4', '022.23.4', '22.23.4-rc.1', '22.23.4+build', '22.23.4 extra']) {
    assert.match(nodeVersionError(version, verifiedAt), /not a stable version/, version);
  }
});

test('expires each allowed release line on its scheduled EOL date', () => {
  for (const [version, before, end] of [
    ['22.23.4', '2027-04-29', '2027-04-30'],
    ['24.22.1', '2028-04-29', '2028-04-30'],
    ['26.12.1', '2029-04-29', '2029-04-30'],
  ]) {
    assert.equal(nodeVersionError(version, new Date(before)), null);
    assert.match(nodeVersionError(version, new Date(end)), /end of life/);
  }
});

test('CLI checks its executable and ignores version arguments and environment overrides', () => {
  const script = fileURLToPath(new URL('./check-node-version.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '20.0.0'], {
    encoding: 'utf8',
    env: { ...process.env, NODE_VERSION: '20.0.0' },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.match(result.stdout + result.stderr, new RegExp(`Node.js ${process.versions.node.replaceAll('.', '\\.')} passes`));
});

test('CI and Pages builds select patched runtimes on their existing release lines', () => {
  for (const [path, expected] of [
    ['../.github/workflows/ci.yml', '22.23.4'],
    ['../.github/workflows/deploy.yml', '24.22.1'],
  ]) {
    const workflow = readFileSync(new URL(path, import.meta.url), 'utf8');
    const versions = [...workflow.matchAll(/node-version: '([^']+)'/g)].map((match) => match[1]);
    assert.ok(versions.length > 0, path);
    assert.ok(versions.every((version) => version === expected), path);
    assert.match(workflow, /run: node scripts\/check-node-version\.mjs/);
  }
});

test('every build must pass runtime and dependency gates before Astro can run', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(scripts.build, 'node scripts/check-node-version.mjs && pnpm audit:deps && astro build');
  assert.equal(scripts['audit:deps'], 'pnpm audit --audit-level=low');
  const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(deploy, /deploy:\n    needs: build/);
  assert.doesNotMatch(deploy, /continue-on-error|always\(\)|build-cmd:|pull_request/);
});

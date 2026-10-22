import assert from 'node:assert/strict';
import test from 'node:test';
import { assertBrowserIdentity, assertBrowserVersion } from '../.github/actions/security-ci/check-browser-policy.mjs';

const sha = 'a'.repeat(64);
const policy = { schema: 1, playwrightVersion: '1.64.1', version: '156.0.8078.47', minimumVersion: '156.0.8078.47', channel: 'chrome', executable: '/opt/google/chrome/chrome', artifact: { sha256: sha, bytes: 1234 } };
const installed = { version: policy.version, archiveSha256: sha, archiveBytes: 1234, executableSha256: sha };
const stat = { uid: 0, mode: 0o100555, isFile: true, isSymbolicLink: false };
const check = (p = policy, i = installed, s = stat, path = policy.executable, digest = sha) => assertBrowserIdentity(p, i, digest, s, path);

test('accepts only the reviewed immutable installation and actual CfT version', () => {
  check();
  assertBrowserVersion('Google Chrome for Testing 156.0.8078.47\n', policy.version);
});
test('rejects old bundled Chromium and same-major release below the security floor', () => {
  for (const version of ['141.0.7390.37', '156.0.8078.4', '155.0.8059.84', '157.0.8103.6']) {
    assert.throws(() => assertBrowserVersion(`Google Chrome for Testing ${version}\n`, policy.version));
  }
});
test('rejects version spoofing, other browser brands and extra output', () => {
  for (const text of ['Chromium 156.0.8078.47', 'Google Chrome 156.0.8078.47', 'Google Chrome for Testing 156.0.8078.47\nextra']) {
    assert.throws(() => assertBrowserVersion(text, policy.version));
  }
});
test('rejects pending or rebound archive authentication', () => {
  assert.throws(() => check({ ...policy, artifact: { sha256: null, bytes: null } }));
  assert.throws(() => check(policy, { ...installed, archiveSha256: 'b'.repeat(64) }));
  assert.throws(() => check(policy, { ...installed, archiveBytes: 1235 }));
  assert.throws(() => check(policy, installed, stat, policy.executable, 'b'.repeat(64)));
});
test('rejects alternate paths, symlinks, nonroot ownership and writable executable', () => {
  assert.throws(() => check(policy, installed, stat, '/tmp/chrome'));
  for (const change of [{uid: 1001}, {mode: 0o100777}, {isFile: false}, {isSymbolicLink: true}]) {
    assert.throws(() => check(policy, installed, { ...stat, ...change }));
  }
});
test('rejects package, channel and browser-policy downgrades', () => {
  for (const change of [{playwrightVersion: '1.56.1'}, {channel: 'chromium'}, {version: '156.0.8078.4'}, {minimumVersion: '142.0.7444.175'}]) {
    assert.throws(() => check({ ...policy, ...change }));
  }
});

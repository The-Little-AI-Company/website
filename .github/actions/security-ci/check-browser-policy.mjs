import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function assertBrowserIdentity(policy, installed, executableDigest, stat, actualPath) {
  if (policy.schema !== 1 || policy.playwrightVersion !== '1.64.1' || policy.channel !== 'chrome' ||
      policy.executable !== '/opt/google/chrome/chrome' || actualPath !== policy.executable ||
      policy.version !== '156.0.8078.47' || policy.minimumVersion !== policy.version ||
      !/^[a-f0-9]{64}$/.test(policy.artifact.sha256 ?? '') ||
      !Number.isSafeInteger(policy.artifact.bytes) || policy.artifact.bytes <= 0 || policy.artifact.bytes > 536870912 ||
      installed.version !== policy.version || installed.archiveSha256 !== policy.artifact.sha256 ||
      installed.archiveBytes !== policy.artifact.bytes || installed.executableSha256 !== executableDigest ||
      !/^[a-f0-9]{64}$/.test(executableDigest) || stat.uid !== 0 || !stat.isFile || stat.isSymbolicLink || (stat.mode & 0o022) !== 0) {
    throw new Error('Chrome artifact, path or immutable installation identity is not approved.');
  }
}

export function assertBrowserVersion(stdout, expected) {
  const match = /^Google Chrome for Testing (\d+\.\d+\.\d+\.\d+)\s*$/.exec(stdout);
  if (!match || expected !== '156.0.8078.47' || match[1] !== expected) {
    throw new Error('The actual Chrome for Testing version differs from the reviewed stable release.');
  }
}

export function checkInstalledBrowser() {
  const policy = JSON.parse(readFileSync('/opt/company/browser-policy.json', 'utf8'));
  const installed = JSON.parse(readFileSync('/opt/company/browser-installed.json', 'utf8'));
  const stat = lstatSync(policy.executable);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 536870912) throw new Error('Chrome executable size or type is invalid.');
  const digest = createHash('sha256').update(readFileSync(policy.executable)).digest('hex');
  assertBrowserIdentity(policy, installed, digest, {
    uid: stat.uid, mode: stat.mode, isFile: stat.isFile(), isSymbolicLink: stat.isSymbolicLink(),
  }, realpathSync(policy.executable));
  const result = spawnSync(policy.executable, ['--version'], {
    timeout: 5000, maxBuffer: 4096, encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', HOME: '/tmp', LANG: 'C' },
  });
  if (result.error || result.status !== 0 || result.signal || result.stderr) throw new Error('Chrome version preflight failed.');
  assertBrowserVersion(result.stdout, policy.version);
  console.log(`Reviewed Chrome channel ${policy.channel}: ${policy.version} at ${policy.executable}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) checkInstalledBrowser();

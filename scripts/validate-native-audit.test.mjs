import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {parseReport,validateAuditInput,validateAuditReport} from './validate-native-audit.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const report = {actions: [], advisories: {}, muted: [], metadata: {
  vulnerabilities: {info: 0, low: 0, moderate: 0, high: 0, critical: 0},
  dependencies: 100, devDependencies: 250, optionalDependencies: 53, totalDependencies: 403,
}};
test('exact frozen403-identity lock and manager pin are required', () => {
  const lock = read('pnpm-lock.yaml'), manifest = JSON.parse(read('package.json'));
  assert.equal(validateAuditInput(lock, manifest).packageIdentities,403);
  assert.throws(() => validateAuditInput(lock + '\n',manifest));
  assert.throws(() => validateAuditInput(lock,{...manifest,packageManager:'pnpm@11.28.7'}));
});
test('strict complete native-shaped report is accepted without claiming wire proof', () => {
  const result=validateAuditReport(JSON.stringify(report,null,2));
  assert.equal(result.nativeAuditSchemaPassed,true);
  assert.equal(result.wireCoverageOrCurrentVendorAdvisoryClearanceProved,false);
});
test('empty fallback, omitted graph, error, muted and nonzero finding mutations fail', () => {
  for(const text of ['{}','null','[]','{"error":{"message":"non-JSON response"}}'])assert.throws(()=>validateAuditReport(text));
  for(const mutate of [r=>r.metadata.totalDependencies=0,r=>r.metadata.totalDependencies=402,
    r=>delete r.metadata.vulnerabilities.info,r=>r.metadata.vulnerabilities.info=1,
    r=>r.advisories.x={severity:'info'},r=>r.muted.push('ignored'),r=>r.actions.push({}),
    r=>r.metadata.devDependencies='250']){
    const copy=structuredClone(report);mutate(copy);assert.throws(()=>validateAuditReport(JSON.stringify(copy)));
  }
});
test('native grammar compatibility and decoded duplicate protections coexist', () => {
  assert.deepEqual(parseReport(' { "\\u0061" : 1e0, "b":[1.00,-0] } '),{a:1,b:[1,-0]});
  for(const text of ['{"a":1,"\\u0061":2}','{"outer":{"id":1,"id":2}}','{"a":1,}',
    '['.repeat(129)+'0'+']'.repeat(129),' '.repeat(1048577)])assert.throws(()=>parseReport(text));
});
test('image-owned strict report gate precedes frozen install and cannot be omitted silently', () => {
  const source=read('.github/actions/security-ci/entrypoint.sh');
  const check = value => {
    const input=value.indexOf('node /opt/company/validate-native-audit.mjs --input "$PWD"');
    const audit=value.indexOf('trusted_pnpm audit --json --audit-level=low > "$private_home/native-audit.json"');
    const validate=value.indexOf('node /opt/company/validate-native-audit.mjs "$private_home/native-audit.json"');
    const install=value.indexOf('trusted_pnpm install --frozen-lockfile');
    assert.ok(input>=0&&input<audit&&audit<validate&&validate<install);
  };
  check(source);
  assert.throws(()=>check(source.replace('    node /opt/company/validate-native-audit.mjs "$private_home/native-audit.json"\n','')));
  assert.equal(read('.github/actions/security-ci/validate-native-audit.mjs'),read('scripts/validate-native-audit.mjs'));
  assert.match(read('.github/actions/security-ci/Dockerfile'),/COPY validate-native-audit.mjs \/opt\/company\/validate-native-audit.mjs/);
});

test('bootstrap binds the maintained CJS archive and digest before inert validation and extraction', () => {
  const check = source => {
    assert.match(source,/https:\/\/registry\.npmjs\.org\/pnpm\/-\/pnpm-10\.34\.7\.tgz/);
    assert.ok(source.includes('ba98abc585539933375b5971f4bc6d6c73a1b4b7edc4a879e7d102fe5423d1e02309d67c60a11f04955093a96e521ad9c3b138cdd654ca5be563f378b3ae48bd'));
    assert.match(source,/ln -s \/opt\/pnpm\/package\/bin\/pnpm.cjs \/opt\/node\/bin\/pnpm/);
    assert.ok(source.indexOf('sha512sum --check --status')<source.indexOf('python3 -I -S -B /opt/company/validate-pnpm-archive.py'));
    assert.ok(source.indexOf('python3 -I -S -B /opt/company/validate-pnpm-archive.py')<source.indexOf('tar --extract'));
  };
  const source=read('.github/actions/security-ci/bootstrap.sh');check(source);
  assert.throws(()=>check(source.replace('pnpm-10.34.7.tgz','pnpm-11.28.7.tgz')));
  assert.throws(()=>check(source.replace('ba98abc585539933','0000000000000000')));
  assert.throws(()=>check(source.replace('bin/pnpm.cjs','bin/pnpm.mjs')));
});

test('sealed workspace remains exactly esbuild and sharp with all reviewed overrides', () => {
  const source=read('pnpm-workspace.yaml');
  assert.match(source,/allowBuilds:\n  esbuild: true\n  sharp: true\n/);
  assert.doesNotMatch(source,/dangerouslyAllowAllBuilds|onlyBuiltDependencies|ignoreScripts: false/);
  assert.match(source,/  yaml: '\^2.8.3'/);
  assert.match(source,/  'source-map-js@>=1.0.0 <1.2.2': '1.2.2'/);
  assert.equal(read('pnpm-lock.yaml').includes('vitest@4.1.12'),true);
});


test('actual shell wrapper preserves JSON-only stdout and stops on each noisy guard failure', () => {
  const source = read('.github/actions/security-ci/entrypoint.sh');
  const start = source.indexOf('trusted_pnpm() {\n');
  const end = source.indexOf('\n}\n', start) + 2;
  assert.ok(start >= 0 && end > start);
  const production = source.slice(start, end);
  // Replace only executable tokens with authored inert shell functions. Guard
  // arguments, redirects, ordering, set -e behavior and stdout capture are real Bash.
  const fixture = body => `set -euo pipefail
fixture_guard() {
  printf 'guard:%s\\n' "$1"
  if test "\${GUARD_FAIL:-}" = "$1"; then return 41; fi
}
fixture_manager() { printf '%s\\n' '${JSON.stringify(report)}'; }
${body.replaceAll('/opt/node/bin/node ', 'fixture_guard ').replaceAll('/opt/node/bin/pnpm ', 'fixture_manager ')}
trusted_pnpm audit --json --audit-level=low
`;
  const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
  const run = (body, fail = '') => spawnSync(shell, ['--noprofile', '--norc', '-p', '-c', fixture(body)], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 65536,
    env: {PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, GUARD_FAIL: fail},
  });
  const before = run(production.replaceAll(' >&2', ''));
  assert.ifError(before.error);
  assert.equal(before.status, 0);
  assert.match(before.stdout, /^guard:/);
  assert.throws(() => validateAuditReport(before.stdout));
  const after = run(production);
  assert.ifError(after.error);
  assert.equal(after.status, 0);
  assert.equal(validateAuditReport(after.stdout).nativeAuditSchemaPassed, true);
  const guards = ['/opt/company/check-node-version.mjs', '/opt/company/assert-project-policy.mjs', '/opt/company/scripts/check-pnpm-version.mjs'];
  assert.deepEqual(after.stderr.trim().split(/\r?\n/), guards.map(p => 'guard:' + p));
  for (const [index, guard] of guards.entries()) {
    const failed = run(production, guard);
    assert.ifError(failed.error);
    assert.equal(failed.status, 41);
    assert.equal(failed.stdout, '');
    assert.deepEqual(failed.stderr.trim().split(/\r?\n/), guards.slice(0, index + 1).map(p => 'guard:' + p));
  }
});

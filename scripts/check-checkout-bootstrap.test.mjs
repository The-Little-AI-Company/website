import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const checkout = read('scripts/checkout-ci.sh');
const literal = marker => checkout.split(`<<'${marker}'\n`)[1].split(`\n${marker}\n`)[0] + '\n';
const image = literal('COMPANY_CHECKOUT_DOCKERFILE');
const helper = literal('COMPANY_CHECKOUT_HELPER');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/bash.exe' : '/bin/bash';
const posix = path => path.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const sha = 'a'.repeat(40);

function shell(script, extra = {}) {
  assert.ok(existsSync(bash), 'A reviewed native Bash is required for the authored shell fixtures.');
  const env = { PATH: '/usr/bin:/bin', SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, ...extra };
  const result = spawnSync(bash, ['--noprofile', '--norc', '-p', '-e', '-o', 'pipefail', '-c', script], { encoding: 'utf8', env, timeout: 15000 });
  assert.ifError(result.error);
  assert.ok(Number.isInteger(result.status) && result.status <= 255, result.stderr);
  assert.doesNotMatch(result.stderr, /fatal error|NtCreateDirectoryObject/);
  return result;
}

function fixture(run) {
  const root = resolve(tmpdir());
  const directory = mkdtempSync(join(root, 'company-checkout-fixture-'));
  try { return run(directory, posix(directory)); }
  finally {
    assert.equal(dirname(resolve(directory)), root);
    assert.ok(basename(directory).startsWith('company-checkout-fixture-'));
    rmSync(directory, { recursive: true, force: true });
  }
}

test('canonical checkout remains byte-bound to all three first workflow steps', () => {
  const inline = checkout.trimEnd().split('\n').map(line => `          ${line}\n`).join('');
  for (const [path, count] of [['.github/workflows/ci.yml', 1], ['.github/workflows/deploy.yml', 2]]) {
    const workflow = read(path);
    assert.equal(workflow.split(`        run: |\n${inline}`).length - 1, count);
  }
  // Preserve the original strict test, including its per-job first-step equality.
  assert.equal(createHash('sha256').update(read('scripts/check-container-ci.test.mjs')).digest('hex'), '2384172fc012b95e3ce67cddd7fdf7c219a14c90547d99492acfcb6e016a08e7');
});

test('literal context contains only the pinned base and signed exact CA install', () => {
  assert.equal(checkout.match(/cat > "\$context\//g).length, 2);
  assert.match(checkout, /test -z "\$\(find "\$context" -mindepth 1 -maxdepth 1 -print -quit\)"/);
  assert.equal(image.split('\n')[0], 'FROM docker.io/library/ubuntu@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517');
  for (const part of ['http://archive.ubuntu.com/ubuntu', 'http://security.ubuntu.com/ubuntu', 'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg', 'Acquire::AllowInsecureRepositories "false"', 'Acquire::AllowDowngradeToInsecureRepositories "false"', 'Acquire::Check-Valid-Until "true"', 'APT::Get::AllowUnauthenticated "false"', 'apt-get update --error-on=any', 'ca-certificates=20260816ubuntu0.24.04.1 libc6 libc-bin libssl3t64 openssl git', 'RUN chmod 0444 /opt/company/checkout.sh', 'USER 1001:65534']) assert.ok(image.includes(part), part);
  assert.doesNotMatch(image, /ARG |ADD |--allow-unauthenticated|trusted=yes|curl|wget|node|pnpm|COPY \. /);
  assert.ok(checkout.indexOf('docker_native build --pull --no-cache') < checkout.indexOf('docker_native run --rm --pull=never'));
  assert.match(checkout, /image=\$\(cat "\$bootstrap\/image-id"\)\n\[\[ "\$image" =~ \^sha256:\[a-f0-9\]\{64\}\$ \]\]/);
});

test('checkout has one verified workspace bind and bounded unprivileged isolation', () => {
  const run = checkout.slice(checkout.indexOf('docker_native run --rm'));
  for (const flag of ['--pull=never', '--platform linux/amd64', '--user 1001:65534', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=512m', '--cpus=2', '--network=bridge', '--tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m,mode=1777', '--mount "type=bind,src=$workspace,dst=/workspace"', '--env CI_CHECKOUT_TOKEN', '--env "EXPECTED_SHA=$EXPECTED_SHA" "$image"']) assert.ok(run.includes(flag), flag);
  assert.equal(run.match(/--mount /g).length, 1);
  assert.doesNotMatch(run, /docker.sock|docker-home|docker-config|--privileged|--env-file|--network[= ]host|--pid[= ]host|--ipc[= ]host/);
  assert.ok(checkout.lastIndexOf('assert_checkout_directory "$workspace"') < checkout.indexOf('docker_native run --rm'));
  assert.match(helper, /CapEff CapPrm CapInh CapAmb CapBnd/);
  assert.match(helper, /test ! -e \/var\/run\/docker.sock/);
});

test('native diagnostics reject unsafe environment and nonnetwork identity mutations', () => {
  const guards = checkout.slice(0, checkout.indexOf('assert_checkout_directory()'));
  const prefix = 'id() { printf "%s\\n" "${TEST_UID:-1001}"; }; stat() { printf "%s\\n" "${TEST_OWNER:-1001}"; }; grep() { return 0; };\n';
  const valid = { GITHUB_WORKSPACE: '/fixture', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'The-Little-AI-Company/website', EXPECTED_SHA: sha };
  assert.equal(shell(prefix + guards, valid).status, 0);
  for (const [override, label] of [
    [{ NODE_OPTIONS: 'fixture' }, 'runtime environment overrides'],
    [{ TEST_UID: '0' }, 'runner UID must be 1001'],
    [{ TEST_OWNER: '0' }, 'workspace owner UID must be 1001'],
    [{ RUNNER_ENVIRONMENT: 'self-hosted' }, 'runner must be GitHub hosted'],
    [{ RUNNER_OS: 'Windows' }, 'runner OS must be Linux'],
    [{ RUNNER_ARCH: 'ARM64' }, 'runner architecture must be X64'],
    [{ GITHUB_REPOSITORY: 'other/repo' }, 'repository must be'],
    [{ EXPECTED_SHA: 'refs/heads/dev' }, 'expected SHA must contain'],
    [{ ACTIONS_RUNNER_HOOK_JOB_STARTED: 'fixture' }, 'runner job hooks'],
    [{ GIT_SSL_NO_VERIFY: 'true' }, 'TLS override environment'],
    ...['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'DOCKER_AUTH_CONFIG', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'DOCKER_API_VERSION', 'BUILDX_BUILDER', 'BUILDKIT_HOST'].map(name => [{ [name]: 'synthetic-value' }, 'Docker environment overrides']),
  ]) {
    const result = shell(prefix + guards, { ...valid, ...override });
    assert.notEqual(result.status, 0, JSON.stringify(override));
    assert.ok(result.stderr.includes(label), result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-value/);
  }
});

test('workspace mount guard rejects missing, alias, unsafe delimiter, owner and mode', () => fixture((directory, path) => {
  const guard = checkout.slice(checkout.indexOf('assert_checkout_directory()'), checkout.indexOf(': "${GITHUB_WORKSPACE:?The hosted workspace is required.}"'));
  // Owner and Unix mode are fixture values on Windows. Path existence/canonicalization are real.
  const prefix = 'stat() { printf "%s\\n" "${TEST_OWNER:-1001}"; }; find() { if test "${TEST_WRITABLE:-0}" = 1; then printf "unsafe\\n"; fi; };\n';
  for (const [candidate, extra, accepted] of [[path, {}, true], [path + '/missing', {}, false], [path + '/..', {}, false], [path + ',other', {}, false], [path + ':other', {}, false], [path + '\nother', {}, false], ['relative', {}, false], [path, { TEST_OWNER: '0' }, false], [path, { TEST_WRITABLE: '1' }, false]]) {
    const result = shell(prefix + guard + `\nif assert_checkout_directory ${quote(candidate)}; then exit 0; else exit 23; fi`, extra);
    assert.equal(result.status === 0, accepted, result.stderr + candidate);
  }
}));

test('native Docker export filter passes the token only by name to run', () => {
  const wrapper = checkout.slice(checkout.indexOf('docker_native() ('), checkout.indexOf('# The public base is content-addressed.'));
  const fixtureWrapper = wrapper.replace('exec /usr/bin/docker', 'docker_fixture');
  const script = `set -euo pipefail\nbootstrap=/private-fixture\nexport CI_CHECKOUT_TOKEN=synthetic-checkout GITHUB_TOKEN=synthetic-broad ACTIONS_RUNTIME_TOKEN=synthetic-runtime DOCKER_AUTH_CONFIG=synthetic-registry DOCKER_HOST=tcp://unsafe DOCKER_CONTEXT=unsafe SHELLOPTS\n` +
    `docker_fixture() {\n` +
    `  test "$1" = --host=unix:///var/run/docker.sock\n  local mode=$2 names\n  names=$(compgen -e)\n` +
    `  for banned in GITHUB_TOKEN ACTIONS_RUNTIME_TOKEN DOCKER_AUTH_CONFIG DOCKER_HOST DOCKER_CONTEXT SHELLOPTS; do if grep -qx "$banned" <<< "$names"; then exit 71; fi; done\n` +
    `  test "$DOCKER_CONFIG" = /private-fixture/docker-config\n  test "$HOME" = /private-fixture/docker-home\n` +
    `  if test "$mode" = run; then grep -qx CI_CHECKOUT_TOKEN <<< "$names"; else if grep -qx CI_CHECKOUT_TOKEN <<< "$names"; then exit 72; fi; fi\n` +
    `  case "$*" in *synthetic-*) exit 73 ;; esac\n  printf '%s:isolated\\n' "$mode"\n}\n` +
    fixtureWrapper + '\ndocker_native build\ndocker_native run --env CI_CHECKOUT_TOKEN\n';
  const result = shell(script);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'build:isolated\nrun:isolated\n');
});

function runTrustStage(directory, path, extra) {
  writeFileSync(join(directory, 'ca-bundle.crt'), 'synthetic CA fixture\n');
  // Only replace absolute fixture resources. The CA/backend/Git ordering stays unchanged.
  const stage = helper.slice(helper.indexOf('ca_version='))
    .replaceAll('/etc/ssl/certs/ca-certificates.crt', path + '/ca-bundle.crt')
    .replaceAll('/tmp/home', path + '/home')
    .replace('/usr/bin/git -c', 'git_fixture -c');
  const prefix = `set -euo pipefail\n` +
    `dpkg-query() { test "\${TEST_QUERY_FAIL:-0}" = 0 || return 1; printf '%s\\n' "$TEST_CA_VERSION"; }\n` +
    `dpkg() { test "$1" = --compare-versions; test "$3" = ge; test "$4" = 20260816ubuntu0.24.04.1; test "$2" = 20260816ubuntu0.24.04.1; }\n` +
    `stat() { printf '0\\n'; }\n` +
    `ldd() { test "$1" = /usr/lib/git-core/git-remote-https; printf '%s\\n' "\${TEST_BACKEND:-libcurl-gnutls.so.4 libgnutls.so.30}"; }\n` +
    `git_fixture() {\n` +
    `  case "$*" in *synthetic-checkout*|*AUTHORIZATION*) exit 81 ;; esac\n` +
    `  while test "$1" = -c; do shift 2; done\n` +
    `  printf '%s\\n' "$1" >> ${quote(path + '/git-phases')}\n` +
    `  case "$1" in\n` +
    `    fetch) test "$GIT_CONFIG_COUNT" = 1; test "$GIT_CONFIG_KEY_0" = http.https://github.com/.extraheader; test "$GIT_CONFIG_VALUE_0" = "AUTHORIZATION: basic $(printf 'x-access-token:synthetic-checkout' | base64 -w 0)"; test "\${TEST_FETCH_FAIL:-0}" = 0 ;;\n` +
    `    checkout|rev-parse) test -z "\${CI_CHECKOUT_TOKEN+x}"; test -z "\${GIT_CONFIG_VALUE_0+x}"; test "$GIT_CONFIG_COUNT" = 0; if test "$1" = rev-parse; then printf '%s\\n' "\${TEST_HEAD:-$EXPECTED_SHA}"; fi ;;\n` +
    `  esac\n}\n`;
  const result = shell(prefix + stage, { EXPECTED_SHA: sha, CI_CHECKOUT_TOKEN: 'synthetic-checkout', TEST_CA_VERSION: '20260816ubuntu0.24.04.1', ...extra });
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-checkout|eC1hY2Nlc3MtdG9rZW46/);
  const phases = existsSync(join(directory, 'git-phases')) ? readFileSync(join(directory, 'git-phases'), 'utf8').trim().split('\n') : [];
  return { result, phases };
}

test('old or unmeasurable CA fails before any Git stub', () => {
  for (const extra of [{ TEST_CA_VERSION: '20260601~24.04.1' }, { TEST_QUERY_FAIL: '1' }]) fixture((directory, path) => {
    const { result, phases } = runTrustStage(directory, path, extra);
    assert.notEqual(result.status, 0);
    assert.deepEqual(phases, []);
  });
});

test('fixed CA and actual-backend fixture reach exact-SHA checkout without retained token', () => fixture((directory, path) => {
  const { result, phases } = runTrustStage(directory, path, {});
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(phases, ['init', 'remote', 'fetch', 'checkout', 'rev-parse']);
}));

test('wrong backend, fetch failure and wrong final SHA fail closed', () => {
  for (const [extra, expected] of [[{ TEST_BACKEND: 'libcurl.so.4 libssl.so.3' }, []], [{ TEST_FETCH_FAIL: '1' }, ['init', 'remote', 'fetch']], [{ TEST_HEAD: 'b'.repeat(40) }, ['init', 'remote', 'fetch', 'checkout', 'rev-parse']]]) fixture((directory, path) => {
    const { result, phases } = runTrustStage(directory, path, extra);
    assert.notEqual(result.status, 0);
    assert.deepEqual(phases, expected);
  });
});

test('Git trust, credentials, hooks, templates and exact fixed origin remain constrained', () => {
  for (const part of ['GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_COUNT=0', 'GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false SSH_ASKPASS=/bin/false', '-c credential.helper=', '-c core.hooksPath=/dev/null', '-c init.templateDir=', '-c http.sslVerify=true', '-c http.sslBackend=gnutls', '-c http.sslCAInfo=/etc/ssl/certs/ca-certificates.crt', '-c http.followRedirects=false', '-c protocol.allow=never -c protocol.https.allow=always', 'remote add origin https://github.com/The-Little-AI-Company/website.git', 'fetch --quiet --no-tags --depth=1 --no-recurse-submodules origin "$EXPECTED_SHA"', 'unset CI_CHECKOUT_TOKEN auth\ntrusted_git checkout', 'test "$(trusted_git rev-parse HEAD)" = "$EXPECTED_SHA"']) assert.ok(helper.includes(part), part);
  assert.doesNotMatch(checkout, /::add-mask::|--build-arg|--secret|CI_CHECKOUT_TOKEN=\$|CI_CHECKOUT_TOKEN="\$|credential\.store|sslVerify=false/);
  const host = checkout.replace(image, '').replace(helper, '');
  assert.doesNotMatch(host, /\bgit (fetch|clone|ls-remote)|\bcurl\b|\bwget\b|\bnode\b|\bpnpm\b/);
});

test('host launcher and immutable helper parse without executing either', () => {
  for (const source of [checkout, helper]) {
    const result = spawnSync(bash, ['--noprofile', '--norc', '-p', '-n'], { input: source, encoding: 'utf8', timeout: 15000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  }
});

const caArchive = 'ca-certificates_20260816ubuntu0.24.04.1_all.deb';
const caArchiveHash = '8a0a754aaafed72cc8efb8c1731808133284a84fbfc76a4fcc73fce9e01b4187';
const caCache = '/var/cache/company-checkout-archives';

test('APT checks the exact cached CA bytes before any package installation', () => {
  const download = image.indexOf('install --download-only --reinstall');
  const check = image.indexOf('| sha256sum --check --strict --status');
  const install = image.indexOf('install --no-download --reinstall');
  assert.ok(download > image.indexOf('mkdir -m 0755 ' + caCache));
  assert.ok(download < check && check < install);
  assert.ok(image.includes(`test -f ${caCache}/${caArchive}`));
  assert.ok(image.includes(`test ! -L ${caCache}/${caArchive}`));
  assert.ok(image.includes(`test "$(stat -c %s ${caCache}/${caArchive})" = 138884`));
  assert.ok(image.includes(`printf '%s  %s\\n' ${caArchiveHash} ${caCache}/${caArchive}`));
  const apt = [...image.matchAll(/^ && apt-get -o (\S+) install (--download-only|--no-download)(.+)$/gm)];
  assert.equal(apt.length, 2);
  assert.equal(apt[0][1], `Dir::Cache::archives=${caCache}`);
  assert.equal(apt[1][1], apt[0][1]);
  assert.equal(apt[0][3], apt[1][3]);
  assert.equal(apt[0][3], ' --reinstall --yes --no-install-recommends ca-certificates=20260816ubuntu0.24.04.1 libc6 libc-bin libssl3t64 openssl git \\');
  assert.doesNotMatch(image, /--fix-missing|--ignore-missing|--allow-unauthenticated|--allow-insecure-repositories/);
});

function runArchiveStage(directory, path, extra = {}) {
  const bytes = 'synthetic reviewed CA bytes\n';
  const altered = 'synthetic reviewed CA byteX\n';
  assert.equal(Buffer.byteLength(altered), Buffer.byteLength(bytes));
  const fixtureHash = createHash('sha256').update(bytes).digest('hex');
  const cache = path + '/archives';
  const archive = cache + '/' + caArchive;
  // Only the package resource/hash/size become synthetic. The download/check/install chain is unchanged.
  const stage = image.slice(image.indexOf('mkdir -m 0755 ' + caCache), image.indexOf(' && apt-mark hold'))
    .replace(/ \\\n$/, '\n')
    .replaceAll(caCache, cache)
    .replace(caArchiveHash, fixtureHash)
    .replace(' = 138884', ' = ' + Buffer.byteLength(bytes));
  const prefix = `set -euo pipefail\n` +
    `apt-get() {\n` +
    `  test "$1" = -o || return 31; test "$2" = ${quote('Dir::Cache::archives=' + cache)} || return 32; test "$3" = install || return 33\n` +
    `  local mode=$4; shift 4\n` +
    `  test "$*" = '--reinstall --yes --no-install-recommends ca-certificates=20260816ubuntu0.24.04.1 libc6 libc-bin libssl3t64 openssl git' || return 34\n` +
    `  case "$mode" in\n` +
    `    --download-only)\n` +
    `      printf 'download\\n' >> ${quote(path + '/apt-phases')}\n` +
    `      test "\${TEST_DOWNLOAD_FAIL:-0}" = 0 || return 41\n` +
    `      if test "\${TEST_CACHE_ABSENT:-0}" = 0; then\n` +
    `        if test "\${TEST_WRONG_HASH:-0}" = 1; then printf '%s' ${quote(altered)} > ${quote(archive)}\n` +
    `        elif test "\${TEST_WRONG_SIZE:-0}" = 1; then printf 'short' > ${quote(archive)}\n` +
    `        else printf '%s' ${quote(bytes)} > ${quote(archive)}; fi\n` +
    `      fi ;;\n` +
    `    --no-download)\n` +
    `      test -f ${quote(archive)} || return 35\n` +
    `      test "$(sha256sum ${quote(archive)} | cut -d' ' -f1)" = ${quote(fixtureHash)} || return 36\n` +
    `      printf 'install-same-archive-no-fetch\\n' >> ${quote(path + '/apt-phases')} ;;\n` +
    `    *) return 42 ;;\n` +
    `  esac\n}\n`;
  const result = shell(prefix + stage, extra);
  const phases = existsSync(join(directory, 'apt-phases')) ? readFileSync(join(directory, 'apt-phases'), 'utf8').trim().split('\n') : [];
  return { result, phases };
}

test('verified synthetic archive is the same cached byte sequence installed without fetching', () => fixture((directory, path) => {
  const { result, phases } = runArchiveStage(directory, path);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(phases, ['download', 'install-same-archive-no-fetch']);
}));

test('wrong hash, absent cache, wrong size or failed download stop before package execution', () => {
  for (const extra of [{ TEST_WRONG_HASH: '1' }, { TEST_CACHE_ABSENT: '1' }, { TEST_WRONG_SIZE: '1' }, { TEST_DOWNLOAD_FAIL: '1' }]) fixture((directory, path) => {
    const { result, phases } = runArchiveStage(directory, path, extra);
    assert.notEqual(result.status, 0);
    assert.deepEqual(phases, ['download']);
  });
});

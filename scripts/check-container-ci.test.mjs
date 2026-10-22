import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const checkout = read('scripts/checkout-ci.sh');
const ci = read('.github/workflows/ci.yml');
const pages = read('.github/workflows/deploy.yml');
const launcher = read('scripts/run-security-container.sh');
const action = read('.github/actions/runtime-handoff/action.yml');
const handoffImage = read('.github/actions/runtime-handoff/Dockerfile');
const handoff = read('.github/actions/runtime-handoff/capture-runtime.sh');
const image = read('.github/actions/security-ci/Dockerfile');
const entry = read('.github/actions/security-ci/entrypoint.sh');
const artifacts = JSON.parse(read('.github/actions/security-ci/artifacts.json'));
const loaderKeys = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT', 'GLIBC_TUNABLES', 'BASH_ENV', 'ENV', 'SHELLOPTS', 'NODE_OPTIONS', 'NODE_PATH'];

function checkWorkflow(workflow, count) {
  assert.doesNotMatch(workflow, /hashFiles\(|continue-on-error|actions\/setup-node|withastro\/action|pnpm\/action-setup/);
  for (const [, identity] of workflow.matchAll(/^\s+uses: (.+)$/gm)) assert.equal(identity, './.github/actions/runtime-handoff');
  const jobs = workflow.slice(workflow.indexOf('jobs:\n')).split(/(?=^  [a-z][a-z-]*:\n)/m).slice(1);
  assert.equal(jobs.length, count);
  const inline = checkout.trimEnd().split('\n').map(line => `          ${line}\n`).join('');
  for (const job of jobs) {
    const steps = job.slice(job.indexOf('    steps:\n')).split(/(?=^      - name:)/m).slice(1);
    assert.ok(steps[0].includes(`        run: |\n${inline}`));
    assert.match(steps[0], /shell: bash --noprofile --norc -p -e -o pipefail \{0\}/);
    assert.match(job, /runs-on: ubuntu-24\.04/);
    assert.ok(job.indexOf('id: prepare') < job.indexOf('id: runtime'));
    assert.ok(job.indexOf('id: runtime') < job.indexOf('scripts/run-security-container.sh verify') || job.includes('scripts/run-security-container.sh deploy'));
    const capture = steps.find(step => step.includes('uses:'));
    for (const key of loaderKeys) assert.ok(capture.includes(`          ${key}: ''\n`), key);
    assert.doesNotMatch(capture, /if:|always\(/);
    assert.ok(steps.at(-1).includes('scripts/run-security-container.sh cleanup'));
    assert.match(steps.at(-1), /always\(\) && steps.prepare.outputs.directory != ''/);
    for (const step of steps.slice(0, -1)) assert.doesNotMatch(step, /always\(/);
  }
  for (const key of loaderKeys) assert.ok(workflow.includes(`  ${key}: ''\n`), key);
}

test('every job binds native checkout, frozen helper, guarded handoff and cleanup', () => {
  checkWorkflow(ci, 1);
  checkWorkflow(pages, 2);
});

test('remote action, loader override and handoff bypass mutations fail the contract', () => {
  assert.throws(() => checkWorkflow(ci.replace('uses: ./.github/actions/runtime-handoff', 'uses: actions/checkout@v6'), 1));
  assert.throws(() => checkWorkflow(ci.replaceAll("LD_AUDIT: ''", 'LD_AUDIT: attacker'), 1));
  assert.throws(() => checkWorkflow(ci.replace('        uses: ./.github/actions/runtime-handoff', '        if: always()\n        uses: ./.github/actions/runtime-handoff'), 1));
});

test('handoff starts only immutable setpriv flags before privileged-mode Bash', () => {
  assert.match(handoffImage, /ENTRYPOINT \["\/usr\/bin\/setpriv"\]/);
  assert.doesNotMatch(handoffImage, /^USER |\bnode\b|\bcurl\b/m);
  for (const flag of ['--reuid=1001', '--regid=65534', '--clear-groups', '--bounding-set=-all', '--inh-caps=-all', '--ambient-caps=-all', '--no-new-privs']) assert.ok(action.includes(`    - ${flag}\n`), flag);
  assert.match(action, /- \/bin\/bash\n    - -p\n    - \/opt\/company\/capture-runtime.sh/);
  assert.doesNotMatch(action, /\$\{\{|pre-entrypoint|post-entrypoint|entrypoint:/);
});

test('capture proves nonroot zero capabilities and no socket write before credentials', () => {
  for (const check of ['id -u', 'id -g', 'id -G', 'CapEff CapPrm CapInh CapAmb', 'NoNewPrivs:', 'test ! -w /var/run/docker.sock']) assert.ok(handoff.indexOf(check) < handoff.indexOf('write_value ACTIONS_RUNTIME_URL'), check);
  assert.match(handoff, /stat -c %u \/var\/run\/docker.sock.*!= 1001/);
  assert.match(handoff, /stat -c %g \/var\/run\/docker.sock.*!= 65534/);
  assert.match(handoff, /LD_AUDIT:-/);
  assert.match(handoff, /set -o noclobber/);
  assert.match(handoff, /\*\$'\\n'\*\|\*\$'\\r'\*/);
  assert.match(handoff, /chmod 600/);
  assert.doesNotMatch(handoff, /\beval\b|\bsource\b|\bnode\b|\bcurl\b|\bwget\b|\bdocker /);
});

test('native image and launcher are frozen before any mutable workload, with scoped data', () => {
  assert.match(launcher, /cp -a -- "\$workspace\/.github\/actions\/security-ci" "\$directory\/image-context"/);
  assert.match(launcher, /docker build --file "\$directory\/image-context\/Dockerfile"/);
  assert.match(launcher, /--iidfile "\$directory\/image-id"/);
  assert.match(launcher, /\^sha256:\[a-f0-9\]\{64\}\$/);
  assert.match(launcher, /--user "\$uid:\$gid" --read-only --cap-drop=ALL/);
  assert.match(launcher, /--security-opt=no-new-privileges --pids-limit=512/);
  assert.doesNotMatch(launcher, /docker.sock|--privileged|--network[= ]host|--pid[= ]host|--ipc[= ]host/);
  const build = launcher.split('  verify)\n')[1].split('    ;;')[0];
  assert.match(build, /src=\$workspace,dst=\/source,readonly/);
  assert.match(build, /src=\$directory\/data,dst=\/github\/runner_temp/);
  assert.doesNotMatch(build.replace(/^\s*#.*$/gm, ''), /credentials|--env-file|GITHUB_OUTPUT|GITHUB_STEP_SUMMARY/);
  assert.match(build, /assert_private_mount "\$directory\/data" "\$directory\/data" "\$uid"/);
  const pack = launcher.split('  pack-pages|pack-report)\n')[1].split('    ;;')[0];
  assert.ok(pack.indexOf('assert_private_mount "$directory/data/work" "$directory/data/work" "$uid"') < pack.indexOf('docker "${common[@]}"'));
  const guard = launcher.slice(launcher.indexOf('assert_private_mount()'), launcher.indexOf('if test "$mode" = prepare'));
  assert.ok(guard.indexOf('test ! -L "$candidate"') < guard.indexOf('readlink -f -- "$candidate"'));
});

test('trusted publisher receives only prepared file and command metadata, not project source', () => {
  const publish = launcher.split('  upload-pages|upload-report|deploy)\n')[1].split('    ;;')[0];
  assert.match(publish, /--env-file "\$credentials"/);
  assert.match(publish, /test "\$names" = "\$expected"/);
  assert.match(publish, /src=\$directory\/publish\/artifact.tar,dst=\/publish\/artifact.tar,readonly/);
  assert.doesNotMatch(publish, /dst=\/source|dst=\/work|src=\$workspace|src=\$directory\/data/);
  assert.match(publish, /trap 'rm -f -- "\$credentials"' EXIT/);
  assert.ok(entry.indexOf('node /opt/company/check-node-version.mjs') < entry.indexOf('case "${INPUT_MODE:-}"'));
  assert.equal(read('.github/actions/security-ci/check-node-version.mjs'), read('scripts/check-node-version.mjs'));
  assert.equal(existsSync(new URL('../.github/actions/security-ci/action.yml', import.meta.url)), false);
});

test('Node and official GitHub program digests remain immutable', () => {
  assert.equal(artifacts.artifacts[0].sha256, '6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6');
  assert.equal(artifacts.artifacts[0].member, 'node-v24.22.1-linux-x64/bin/node');
  const expected = ['65e6f8843b48fb8e868fd8e3de993afbc2099fcf8cdebcca6b0da8166c5f8ab6', '3ca9d4afd21425087cf31893b8f9f63c81b0b8408db5e343ca76e5f8aa26ab9a', '63fd34d89cd23d8848618a019f978f2225880a38afe2328e6e7d72f20fc44e89', '1e19cfe548608e6501c19941746f85eadf71a72c4a52a1426b770e30f4f9bdf3'];
  assert.deepEqual(artifacts.artifacts.slice(1).map(item => item.sha256), expected);
  assert.equal(artifacts.nodeAuthentication.buildProvenanceVerified, false);
});

test('scoped manager inputs, full audit and all site tests remain required', () => {
  assert.equal(createHash('sha256').update(read('pnpm-workspace.yaml')).digest('hex'), '3e4be68bf3deb65e33f1276e75c2970f0301b39fb844db5c1a05b08037591384');
  assert.match(entry, /test ! -e \.npmrc/);
  assert.match(entry, /npm_config_ignore_pnpmfile=true/);
  assert.ok(entry.indexOf('pnpm audit --json --audit-level=low') < entry.indexOf('pnpm install --frozen-lockfile'));
  for (const command of ['pnpm check', 'pnpm build', 'pnpm test\n', 'node /opt/company/check-browser-policy.mjs', 'pnpm test:e2e']) assert.ok(entry.includes(command), command);
  assert.doesNotMatch(entry, /playwright install/);
  assert.ok(entry.indexOf('node /opt/company/check-browser-policy.mjs') < entry.indexOf('pnpm test:e2e'));
  assert.doesNotMatch(entry, /--with-deps|\beval\b/);
  assert.match(image, /libasound2t64/);
  assert.match(image, /ca-certificates=20260816ubuntu0.24.04.1/);
});

test('the actual manager and both policies are image-owned before mutable project code', () => {
  const bootstrap = read('.github/actions/security-ci/bootstrap.sh');
  assert.match(bootstrap, /sha512sum --check --status/);
  assert.ok(bootstrap.indexOf('/opt/company/validate-pnpm-archive.py') < bootstrap.indexOf('--directory /opt/pnpm'));
  assert.match(bootstrap, /ln -s \/opt\/pnpm\/package\/bin\/pnpm.cjs \/opt\/node\/bin\/pnpm/);
  assert.doesNotMatch(bootstrap, /\/opt\/node\/bin\/pnpm --|pnpm install/);
  assert.equal(read('.github/actions/security-ci/check-pnpm-version.mjs'), read('scripts/check-pnpm-version.mjs'));
  assert.equal(read('.github/actions/security-ci/validate-pnpm-archive.py'), read('scripts/validate-pnpm-archive.py'));
  assert.match(image, /COPY check-pnpm-version.mjs \/opt\/company\/scripts\/check-pnpm-version.mjs/);
  assert.match(entry, /XDG_CONFIG_HOME=\/opt\/company\/empty-config/);
  const wrapper = entry.slice(entry.indexOf('trusted_pnpm()'), entry.indexOf('upload()'));
  assert.ok(wrapper.indexOf('assert-project-policy.mjs') < wrapper.indexOf('scripts/check-pnpm-version.mjs'));
  assert.match(wrapper, /\/opt\/node\/bin\/pnpm "\$@"/);
});

function checkVerifyTelemetryScope(source) {
  const verify = source.split('  verify)\n')[1].split('    ;;')[0];
  const otherModes = source.replace(verify, '');
  const disabled = verify.indexOf('    export ASTRO_TELEMETRY_DISABLED=1\n');
  assert.ok(disabled >= 0, 'Astro telemetry must be disabled in the isolated verify process');
  assert.ok(disabled < verify.indexOf('    trusted_pnpm audit --json --audit-level=low'));
  assert.match(verify, /private_home=\$\(mktemp -d \/tmp\/company-manager-home\.XXXXXXXX\)/);
  assert.match(verify, /export HOME="\$private_home" XDG_CONFIG_HOME=\/opt\/company\/empty-config/);
  assert.doesNotMatch(verify, /(?:export )?XDG_CONFIG_HOME=(?!\/opt\/company\/empty-config(?:\s|$))/m);
  assert.doesNotMatch(otherModes, /ASTRO_TELEMETRY_DISABLED|company-manager-home/);
}

test('Astro telemetry is disabled before verification while manager config remains immutable', () => {
  checkVerifyTelemetryScope(entry);
});

test('telemetry omission, late disabling and writable manager config fail the scoped runtime contract', () => {
  assert.throws(() => checkVerifyTelemetryScope(entry.replace('    export ASTRO_TELEMETRY_DISABLED=1\n', '')));
  assert.throws(() => checkVerifyTelemetryScope(entry.replace('    export ASTRO_TELEMETRY_DISABLED=1\n', '').replace('    trusted_pnpm check\n', '    trusted_pnpm check\n    export ASTRO_TELEMETRY_DISABLED=1\n')));
  assert.throws(() => checkVerifyTelemetryScope(entry.replace('XDG_CONFIG_HOME=/opt/company/empty-config', 'XDG_CONFIG_HOME="$private_home/config"')));
});

test('no runtime credentials are available to packing and uploader inputs are fixed', () => {
  assert.match(entry, /ACTIONS_RUNTIME_TOKEN:-.*ACTIONS_ID_TOKEN_REQUEST_TOKEN:-.*GITHUB_TOKEN:-/);
  assert.match(entry, /python3 -I -S -B \/opt\/company\/pack-regular.py/);
  assert.match(entry, /INPUT_PATH=\/publish\/artifact.tar/);
  assert.match(entry, /upload github-pages 1/);
  assert.match(entry, /upload playwright-results 7/);
  assert.match(entry, /INPUT_PREVIEW=false/);
});

test('Pages build is read-only and deployment alone has Pages and OIDC rights', () => {
  const build = pages.split('  build:\n')[1].split('  deploy:\n')[0];
  const deploy = pages.split('  deploy:\n')[1];
  assert.doesNotMatch(build, /pages: write|id-token: write|always\(\).*upload/);
  assert.match(deploy, /needs: build\n    permissions:\n      contents: read\n      pages: write\n      id-token: write/);
  assert.match(deploy, /name: github-pages/);
  assert.match(deploy, /scope: deploy/);
  assert.doesNotMatch(pages, /pull_request|continue-on-error/);
});

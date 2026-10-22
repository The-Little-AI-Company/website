#!/bin/bash -p
set -euo pipefail
export PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
test "$(id -u)" != 0
test "$(command -v node)" = /opt/node/bin/node
test -z "${NODE_OPTIONS:-}${NODE_PATH:-}${NODE_EXTRA_CA_CERTS:-}${NODE_TLS_REJECT_UNAUTHORIZED:-}"
test "${GITHUB_REPOSITORY:-}" = The-Little-AI-Company/website
# BEGIN COMPANY OS PACKAGE GUARD
test "$(dpkg --print-architecture)" = amd64
grep --quiet --fixed-strings 'VERSION_ID="24.04"' /etc/os-release
assert_os_floor() {
  local package=$1 minimum=$2 installed status
  status=$(dpkg-query --show --showformat='${Status}' "$package")
  test "$status" = 'install ok installed'
  installed=$(dpkg-query --show --showformat='${Version}' "$package")
  dpkg --compare-versions "$installed" ge "$minimum" || { printf '::error::OS package %s is below required floor %s\n' "$package" "$minimum" >&2; return 1; }
}
assert_os_floor libc6 2.39-0ubuntu8.9
assert_os_floor libc-bin 2.39-0ubuntu8.9
assert_os_floor libssl3t64 3.0.13-0ubuntu3.16
assert_os_floor openssl 3.0.13-0ubuntu3.16
printf '%s\n' 'BEGIN COMPANY INSTALLED OS PACKAGE INVENTORY'
dpkg-query --show --showformat='${binary:Package}\t${Version}\t${Architecture}\t${Status}\n'
printf '%s\n' 'END COMPANY INSTALLED OS PACKAGE INVENTORY'
# END COMPANY OS PACKAGE GUARD

node /opt/company/check-node-version.mjs

trusted_pnpm() {
  /opt/node/bin/node /opt/company/check-node-version.mjs >&2
  /opt/node/bin/node /opt/company/assert-project-policy.mjs "$PWD" >&2
  /opt/node/bin/node /opt/company/scripts/check-pnpm-version.mjs >&2
  /opt/node/bin/pnpm "$@"
}

upload() {
  local name=$1 retention=$2
  : "${ACTIONS_RUNTIME_TOKEN:?The official artifact runtime token is required.}"
  : "${ACTIONS_RESULTS_URL:?The official results endpoint is required.}"
  env "INPUT_NAME=$name" INPUT_PATH=/publish/artifact.tar "INPUT_RETENTION-DAYS=$retention" \
    INPUT_IF-NO-FILES-FOUND=error INPUT_COMPRESSION-LEVEL=6 \
    INPUT_OVERWRITE=false INPUT_INCLUDE-HIDDEN-FILES=false INPUT_ARCHIVE=true \
    /opt/node/bin/node /opt/actions/upload/index.js
}

case "${INPUT_MODE:-}" in
  verify)
    test -z "${ACTIONS_RUNTIME_TOKEN:-}${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}${ACTIONS_ID_TOKEN_REQUEST_URL:-}${GITHUB_TOKEN:-}"
    test -z "$(find /github/runner_temp/work -mindepth 1 -maxdepth 1 -print -quit)"
    cp -a -- /source/. /github/runner_temp/work/
    cd -- /github/runner_temp/work
    node --test scripts/check-node-version.test.mjs scripts/check-pnpm-version.test.mjs scripts/check-container-ci.test.mjs scripts/check-checkout-bootstrap.test.mjs scripts/check-os-image-policy.test.mjs scripts/check-browser-policy.test.mjs scripts/validate-native-audit.test.mjs
    python3 -I -B scripts/validate-pnpm-archive.test.py
    python3 -I -B scripts/pack-regular.test.py
    python3 -I -B scripts/check-ci-mount.test.py
    node scripts/check-pnpm-version.mjs --pin
    printf '%s  %s\n' 3e4be68bf3deb65e33f1276e75c2970f0301b39fb844db5c1a05b08037591384 pnpm-workspace.yaml | sha256sum --check --status
    test ! -e .npmrc
    test ! -e .pnpmfile.cjs
    test ! -e pnpmfile.cjs
    for variable in $(compgen -e); do
      case "${variable,,}" in npm_config_*|pnpm_*|corepack_*) unset "$variable";; esac
    done
    private_home=$(mktemp -d /tmp/company-manager-home.XXXXXXXX)
    export HOME="$private_home" XDG_CONFIG_HOME=/opt/company/empty-config
    # Astro checks telemetry settings before its CI guard; keep global manager config read-only.
    export ASTRO_TELEMETRY_DISABLED=1
    export NPM_CONFIG_USERCONFIG=/dev/null NPM_CONFIG_GLOBALCONFIG=/dev/null
    export npm_config_manage_package_manager_versions=false npm_config_ignore_pnpmfile=true
    node /opt/company/validate-native-audit.mjs --input "$PWD"
    trusted_pnpm audit --json --audit-level=low > "$private_home/native-audit.json"
    node /opt/company/validate-native-audit.mjs "$private_home/native-audit.json"
    trusted_pnpm install --frozen-lockfile
    trusted_pnpm check
    trusted_pnpm build
    trusted_pnpm test
    node /opt/company/check-browser-policy.mjs
    trusted_pnpm test:e2e
    ;;
  pack-pages|pack-report)
    test -z "${ACTIONS_RUNTIME_TOKEN:-}${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}${GITHUB_TOKEN:-}"
    python3 -I -S -B /opt/company/pack-regular.py "${INPUT_MODE#pack-}"
    ;;
  upload-pages)
    upload github-pages 1
    ;;
  upload-report)
    upload playwright-results 7
    ;;
  deploy)
    : "${ACTIONS_ID_TOKEN_REQUEST_URL:?The official OIDC endpoint is required.}"
    : "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?The official OIDC token is required.}"
    : "${GITHUB_TOKEN:?The existing Pages workflow token is required.}"
    env "INPUT_TOKEN=$GITHUB_TOKEN" INPUT_TIMEOUT=600000 INPUT_ERROR_COUNT=10 \
      INPUT_REPORTING_INTERVAL=5000 INPUT_ARTIFACT_NAME=github-pages INPUT_PREVIEW=false \
      /opt/node/bin/node /opt/actions/deploy/index.js
    ;;
  *) echo 'Unsupported company pipeline mode.' >&2; exit 1;;
esac

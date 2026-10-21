#!/bin/bash -p
set -euo pipefail
export PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
test "$(id -u)" != 0
test "$(command -v node)" = /opt/node/bin/node
test -z "${NODE_OPTIONS:-}${NODE_PATH:-}${NODE_EXTRA_CA_CERTS:-}${NODE_TLS_REJECT_UNAUTHORIZED:-}"
test "${GITHUB_REPOSITORY:-}" = The-Little-AI-Company/website
node /opt/company/check-node-version.mjs

trusted_pnpm() {
  /opt/node/bin/node /opt/company/check-node-version.mjs
  /opt/node/bin/node /opt/company/assert-project-policy.mjs "$PWD"
  /opt/node/bin/node /opt/company/scripts/check-pnpm-version.mjs
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
    test -z "${ACTIONS_RUNTIME_TOKEN:-}${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}${ACTIONS_ID_TOKEN_REQUEST_URL:-}"
    test -z "$(find /github/runner_temp/work -mindepth 1 -maxdepth 1 -print -quit)"
    cp -a -- /source/. /github/runner_temp/work/
    cd -- /github/runner_temp/work
    node --test scripts/check-node-version.test.mjs scripts/check-pnpm-version.test.mjs scripts/check-container-ci.test.mjs
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
    export NPM_CONFIG_USERCONFIG=/dev/null NPM_CONFIG_GLOBALCONFIG=/dev/null
    export npm_config_manage_package_manager_versions=false npm_config_ignore_pnpmfile=true
    trusted_pnpm audit --audit-level=low
    trusted_pnpm install --frozen-lockfile
    trusted_pnpm check
    trusted_pnpm build
    trusted_pnpm test
    trusted_pnpm exec playwright install chromium
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

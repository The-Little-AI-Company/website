#!/usr/bin/env bash
# Usage (root, once per fresh sandbox): sandbox-setup.sh REPO
# Turns a sandbox built from sandbox.Dockerfile (see SKILL.md, Launch) into the repo's
# verify container: the security-ci files at /opt/company, bootstrap.sh run as in the
# image build (Node, pnpm and Chrome each checked against its pinned hash), and the
# builder user that runs project code. Prints SETUP_RESULT=pass or stops on the first error.
set -euo pipefail
repo=$(cd "${1:?usage: sandbox-setup.sh REPO}" && pwd)
C="$repo/.github/actions/security-ci"
[ "$(id -u)" = 0 ]
grep -q 'VERSION_ID="24.04"' /etc/os-release
id builder > /dev/null 2>&1 || useradd --create-home --uid 1001 builder
mkdir -p /opt/company/scripts
# The same files, in the same order, as the COPY and RUN steps of $C/Dockerfile.
cp "$C"/{bootstrap.sh,artifacts.json,validate-pnpm-archive.py,browser-policy.json,install-browser.py} /opt/company/
bash /opt/company/bootstrap.sh
cp "$C"/{check-browser-policy.mjs,entrypoint.sh,check-node-version.mjs,pack-regular.py,package.json,assert-project-policy.mjs,validate-native-audit.mjs} /opt/company/
cp "$C"/check-pnpm-version.mjs /opt/company/scripts/
git config --global --add safe.directory "$repo"
chown -R builder: "$repo"
/opt/node/bin/node /opt/company/check-browser-policy.mjs
echo "SETUP_RESULT=pass node $(/opt/node/bin/node --version) chrome $(/opt/google/chrome/chrome --version)"

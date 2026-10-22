#!/usr/bin/env bash
set -euo pipefail

# Only the CI runner's temporary directory and per-job PATH are changed.
node scripts/check-node-version.mjs
node scripts/check-pnpm-version.mjs --pin
: "${RUNNER_TEMP:?The CI runner temporary directory is required.}"
: "${GITHUB_PATH:?The CI per-job PATH file is required.}"

workdir=$(mktemp -d "${RUNNER_TEMP%/}/verified-pnpm.XXXXXXXX")
archive="$workdir/pnpm.tgz"
destination="$workdir/unpacked"
url='https://registry.npmjs.org/pnpm/-/pnpm-10.34.7.tgz'
sha512='ba98abc585539933375b5971f4bc6d6c73a1b4b7edc4a879e7d102fe5423d1e02309d67c60a11f04955093a96e521ad9c3b138cdd654ca5be563f378b3ae48bd'

# Exact registry signature and SRI are retained. Fresh OIDC and execution qualification remain separate.
curl --fail --silent --show-error --proto '=https' --proto-redir '=https' \
  --connect-timeout 15 --max-time 90 --max-filesize 8388608 \
  --output "$archive" "$url"
printf '%s  %s\n' "$sha512" "$archive" | sha512sum --check --status
python3 scripts/validate-pnpm-archive.py "$archive"
mkdir -- "$destination" "$workdir/bin"
tar --extract --gzip --file "$archive" --directory "$destination" \
  --no-same-owner --no-same-permissions --keep-old-files
test -x "$destination/package/bin/pnpm.cjs"
ln -s ../unpacked/package/bin/pnpm.cjs "$workdir/bin/pnpm"
ln -s ../unpacked/package/bin/pnpx.cjs "$workdir/bin/pnpx"
printf '%s\n' "$workdir/bin" >> "$GITHUB_PATH"

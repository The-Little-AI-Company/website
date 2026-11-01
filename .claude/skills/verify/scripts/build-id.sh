#!/usr/bin/env bash
# Usage: build-id.sh repo. Prints HEAD plus a hash of every uncommitted change, untracked
# files included by path, size and bytes. The bytes stream into sha256sum so NULs count.
set -euo pipefail
repo=$1
hash=$( {
  git -C "$repo" diff --binary HEAD
  git -C "$repo" ls-files -z --others --exclude-standard |
    while IFS= read -r -d '' f; do printf '%s\0%s\0' "$f" "$(wc -c < "$repo/$f")"; cat "$repo/$f"; done
} | sha256sum | cut -c1-16)
echo "$(git -C "$repo" rev-parse HEAD) $hash"

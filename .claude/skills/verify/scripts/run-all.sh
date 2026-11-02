#!/usr/bin/env bash
# Usage (root, inside the pinned build sandbox): run-all.sh LIVE_DIR [repo]
# LIVE_DIR is a fresh live.sh folder. Runs KEY, the repo checks (T10, T14), the preview,
# doctor, checks.mjs, browser.mjs and cleanup. Prints VERIFY_RESULT=pass|fail, exits to
# match, and keeps the evidence folder.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
LIVE_DIR="$(cd "${1:?usage: run-all.sh LIVE_DIR [repo]}" && pwd)" || exit 1
. "$HERE/env.sh" "${2:-}"

[ "$(id -u)" = 0 ] || { echo "VERIFY_RESULT=fail run as root inside the build sandbox"; exit 1; }
for f in /opt/company/entrypoint.sh /opt/company/browser-installed.json /opt/google/chrome/chrome "$NODE"; do
  [ -e "$f" ] || { echo "VERIFY_RESULT=fail $f missing: the sandbox is not the pinned build container (see SKILL.md Launch)"; exit 1; }
done
# The container's policy files must be the ones this checkout ships. A branch that changes
# them needs a fresh sandbox, or T14 would test the old policy.
for f in bootstrap.sh artifacts.json browser-policy.json install-browser.py validate-pnpm-archive.py check-browser-policy.mjs \
         entrypoint.sh check-node-version.mjs pack-regular.py package.json assert-project-policy.mjs validate-native-audit.mjs; do
  cmp -s "$REPO/.github/actions/security-ci/$f" "/opt/company/$f" || { echo "VERIFY_RESULT=fail /opt/company/$f differs from the checkout, build a fresh sandbox (SKILL.md, Launch)"; exit 1; }
done
cmp -s "$REPO/.github/actions/security-ci/check-pnpm-version.mjs" /opt/company/scripts/check-pnpm-version.mjs || { echo "VERIFY_RESULT=fail /opt/company/scripts/check-pnpm-version.mjs differs, build a fresh sandbox (SKILL.md, Launch)"; exit 1; }
"$HERE/cleanup.sh" "$REPO" > /dev/null || { echo "VERIFY_RESULT=fail an earlier run left port $VERIFY_PORT busy"; exit 1; }

RUN="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$REPO" rev-parse --short HEAD)"
EVIDENCE="$EVIDENCE_ROOT/$RUN"
mkdir -p "$EVIDENCE" "$STATE/home"
cp -a "$LIVE_DIR" "$EVIDENCE/live"
chown -R "$BUILDER": "$EVIDENCE" "$STATE"
trap '"$HERE/cleanup.sh" "$REPO" > /dev/null' EXIT
trap 'exit 130' INT TERM

run() {
  local status=0 repo_results=() line
  local build_id; build_id=$("$HERE/build-id.sh" "$REPO")
  echo "BUILD $build_id"

  # KEY: the key comes from origin/dev. A branch that edits it, or no copy on dev, fails.
  local key_ok=1
  git -C "$REPO" fetch -q origin dev || key_ok=0
  git -C "$REPO" show origin/dev:.claude/skills/verify/acceptance.md > "$EVIDENCE/key.md" 2>/dev/null || key_ok=0
  [ -s "$EVIDENCE/key.md" ] || key_ok=0
  cmp -s "$EVIDENCE/key.md" "$REPO/.claude/skills/verify/acceptance.md" || key_ok=0
  git -C "$REPO" diff --quiet origin/dev HEAD -- .claude/skills/verify/acceptance.md || key_ok=0
  "$NODE" "$HERE/key.mjs" "$EVIDENCE/key.md" > "$EVIDENCE/key.json" || key_ok=0
  if [ $key_ok = 1 ]; then echo "PASS    KEY  the key is the origin/dev copy and this branch does not change it"
  else echo "FAIL    KEY  the key is missing on origin/dev, unreadable, or changed by this branch"; echo "VERIFY_RESULT=fail no trustworthy key"; return 1; fi
  chown "$BUILDER": "$EVIDENCE/key.json"

  # T14: pnpm verify through the repo's own container entrypoint, as uid of the builder.
  rm -rf /github && mkdir -p "$WORK" && chown -R "$BUILDER": /github
  ln -sfn "$REPO" /source
  # The sandbox reports the host's CPUs inside a 4 CPU cgroup, and Playwright sizes its pool
  # from os.cpus(). A hosted 4 CPU runner gets 2 workers. Only that line may differ.
  sed 's/^    trusted_pnpm test:e2e$/    trusted_pnpm test:e2e --workers=2/' /opt/company/entrypoint.sh > "$STATE/entrypoint.sh"
  if [ "$(diff /opt/company/entrypoint.sh "$STATE/entrypoint.sh" | grep -c '^[<>]')" != 2 ]; then
    echo "FAIL    T14  the entrypoint changed shape, the worker override no longer applies"; status=1
  fi
  (cd /tmp && runuser -u "$BUILDER" -- env -i PATH=/usr/bin:/bin HOME="$STATE/home" GITHUB_REPOSITORY=The-Little-AI-Company/website \
    RUNNER_TEMP=/github/runner_temp GITHUB_WORKSPACE="$WORK" INPUT_MODE=verify \
    /usr/bin/timeout --kill-after=20s 20m /bin/bash -p "$STATE/entrypoint.sh") > "$EVIDENCE/pnpm-verify.log" 2>&1
  local t14=$?
  # Playwright's preview may outlive a killed run. Stop whatever the builder left behind.
  pkill -u "$BUILDER" 2>/dev/null; sleep 1; pkill -9 -u "$BUILDER" 2>/dev/null
  if [ $t14 = 0 ]; then line="PASS    T14  build pnpm verify in the pinned container"; else line="FAIL    T14  build pnpm verify exit $t14, see pnpm-verify.log"; status=1; fi
  echo "$line"; repo_results+=("T14 ${line%% *}")
  sed 's/\x1b\[[0-9;]*m//g' "$EVIDENCE/pnpm-verify.log" | grep -aE '^ℹ (pass|fail) |Tests +[0-9]+ passed|[0-9]+ (passed|failed|skipped)( |$)' | sed 's/^ */        /'

  # T10: the third-party test is byte-identical to origin/dev, and it ran green inside T14.
  if cmp -s <(git -C "$REPO" show origin/dev:tests/unit/third-party.test.ts) "$REPO/tests/unit/third-party.test.ts" \
     && grep -aq 'third-party.test.ts' "$EVIDENCE/pnpm-verify.log" && [ $t14 = 0 ]; then
    line="PASS    T10  build third-party test equals origin/dev and passed"
  else line="FAIL    T10  build third-party test differs from origin/dev, did not run, or T14 failed"; status=1; fi
  echo "$line"; repo_results+=("T10 ${line%% *}")
  printf '%s\n' "${repo_results[@]}" > "$EVIDENCE/repo.txt"

  # The preview serves the dist that T14 built, stamped with the checkout it came from.
  if [ ! -f "$WORK/dist/index.html" ]; then echo "FAIL    the build produced no dist, nothing to drive"; echo "VERIFY_RESULT=fail"; return 1; fi
  echo "$build_id" > "$WORK/.verify-build"
  if ! "$HERE/launch.sh" "$EVIDENCE/preview.log" "$REPO" || ! "$HERE/doctor.sh" "$REPO"; then echo "VERIFY_RESULT=fail"; return 1; fi

  # Production's own pages, replayed from the snapshot, so the browser journeys run on both sides.
  if ! "$HERE/replay.sh" "$EVIDENCE/live" "$EVIDENCE/replay.log"; then echo "VERIFY_RESULT=fail the live replay did not start"; return 1; fi

  as_builder "$NODE" "$HERE/checks.mjs" "$EVIDENCE/key.json" "$BUILD_URL" "$WORK/dist" "$REPO/public" "$EVIDENCE/live" "$WORK" "$EVIDENCE" || status=1
  as_builder "$NODE" "$HERE/browser.mjs" "$EVIDENCE/key.json" "$BUILD_URL" "$REPLAY_URL" "$WORK" "$EVIDENCE" || status=1

  # Every key row has a result on each side it applies to, and every check has a key row.
  local targets
  "$NODE" "$HERE/cover.mjs" "$EVIDENCE/key.json" "$EVIDENCE" > "$EVIDENCE/cover.txt" || status=1
  head -1 "$EVIDENCE/cover.txt"
  targets=$(sed -n 's/^TARGETS //p' "$EVIDENCE/cover.txt")
  [ -n "$targets" ] || { targets='targets unknown'; status=1; }

  "$HERE/cleanup.sh" "$REPO" || status=1
  echo "VERIFY_RESULT=$([ $status = 0 ] && echo pass || echo fail) $targets build $build_id evidence $EVIDENCE"
  return $status
}
run 2>&1 | tee "$EVIDENCE/summary.txt"
exit "${PIPESTATUS[0]}"

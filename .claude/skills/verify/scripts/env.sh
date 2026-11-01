# Sourced by the other scripts. Usage: . env.sh [repo]
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "${1:-$SKILL/../../..}" && pwd)"
VERIFY_PORT="${VERIFY_PORT:-4420}"
BUILD_URL="http://127.0.0.1:$VERIFY_PORT"
# replay.mjs serves the live snapshot here, so the browser journeys run on production's pages too.
REPLAY_PORT=$((VERIFY_PORT + 1))
REPLAY_URL="http://127.0.0.1:$REPLAY_PORT"
# The repo's container layout. entrypoint.sh hard-codes these paths.
WORK=/github/runner_temp/work
STATE=/run/tlac-verify
EVIDENCE_ROOT="${VERIFY_EVIDENCE_ROOT:-/srv/verify-evidence}"
NODE=/opt/node/bin/node
# Project code runs as this uid, never as root, the same as CI.
BUILDER=builder
as_builder() {
  runuser -u "$BUILDER" -- env -i PATH=/opt/node/bin:/usr/bin:/bin HOME="$STATE/home" \
    ASTRO_TELEMETRY_DISABLED=1 "$@"
}
# Prints the pid that listens on TCP port $1, or nothing. The pinned image has no ss or
# lsof, so this reads /proc. Needs root to see other users' sockets.
port_owner() {
  local hex inode fd
  hex=$(printf '%04X' "$1")
  inode=$(awk -v p=":$hex" '$4 == "0A" && $2 ~ (p "$") {print $10; exit}' /proc/net/tcp /proc/net/tcp6)
  [ -n "$inode" ] || return 0
  for fd in /proc/[0-9]*/fd/*; do
    if [ "$(readlink "$fd" 2>/dev/null)" = "socket:[$inode]" ]; then fd=${fd#/proc/}; echo "${fd%%/*}"; return 0; fi
  done
  echo unknown
}
export SKILL REPO VERIFY_PORT BUILD_URL REPLAY_PORT REPLAY_URL WORK STATE EVIDENCE_ROOT NODE BUILDER

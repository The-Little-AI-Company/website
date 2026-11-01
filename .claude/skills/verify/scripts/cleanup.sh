#!/usr/bin/env bash
# Usage: cleanup.sh [repo]. Stops the preview and the live replay this skill started (by their
# session ids, never by name) and removes run state. Evidence under $EVIDENCE_ROOT stays.
# Safe to run twice.
set -uo pipefail
. "$(dirname "$0")/env.sh" "${1:-}"
for name in preview replay; do
  [ -f "$STATE/$name.pid" ] || continue
  pid=$(cat "$STATE/$name.pid")
  # launch.sh and replay.sh each ran their server in its own session. Stop that session only.
  pkill -TERM -s "$pid" 2>/dev/null
  for _ in $(seq 1 20); do pgrep -s "$pid" > /dev/null || break; sleep 0.5; done
  pkill -KILL -s "$pid" 2>/dev/null
  sleep 0.5
  rm -f "$STATE/$name.pid"
done
for port in "$VERIFY_PORT" "$REPLAY_PORT"; do
  if [ -n "$(port_owner "$port")" ]; then
    echo "CLEANUP_RESULT=fail port $port still has a listener"
    exit 1
  fi
done
rm -rf "$STATE"
echo "CLEANUP_RESULT=done evidence kept under $EVIDENCE_ROOT"

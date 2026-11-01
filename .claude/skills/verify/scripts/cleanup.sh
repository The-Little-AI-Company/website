#!/usr/bin/env bash
# Usage: cleanup.sh [repo]. Stops the preview this skill started (by its pid, never by
# name) and removes run state. Evidence under $EVIDENCE_ROOT stays. Safe to run twice.
set -uo pipefail
. "$(dirname "$0")/env.sh" "${1:-}"
if [ -f "$STATE/preview.pid" ]; then
  pid=$(cat "$STATE/preview.pid")
  # launch.sh ran the preview in its own session. Stop that session and nothing else.
  pkill -TERM -s "$pid" 2>/dev/null
  for _ in $(seq 1 20); do pgrep -s "$pid" > /dev/null || break; sleep 0.5; done
  pkill -KILL -s "$pid" 2>/dev/null
  sleep 0.5
  rm -f "$STATE/preview.pid"
fi
if [ -n "$(port_owner "$VERIFY_PORT")" ]; then
  echo "CLEANUP_RESULT=fail port $VERIFY_PORT still has a listener"
  exit 1
fi
rm -rf "$STATE"
echo "CLEANUP_RESULT=done evidence kept under $EVIDENCE_ROOT"

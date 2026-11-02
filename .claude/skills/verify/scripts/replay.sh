#!/usr/bin/env bash
# Usage (root): replay.sh LIVE_DIR LOGFILE. Serves the live snapshot with replay.mjs on
# 127.0.0.1:$REPLAY_PORT as the builder user, in its own session that cleanup.sh stops.
# Prints REPLAY_RESULT=pass|fail.
set -uo pipefail
. "$(dirname "$0")/env.sh" "${3:-}"
dir=${1:?usage: replay.sh LIVE_DIR LOGFILE} log=${2:?usage: replay.sh LIVE_DIR LOGFILE}
[ -z "$(port_owner "$REPLAY_PORT")" ] || { echo "REPLAY_RESULT=fail port $REPLAY_PORT is taken, run cleanup.sh"; exit 1; }
mkdir -p "$STATE" && chown -R "$BUILDER": "$dir"
(setsid bash -c 'echo $$ > "$1"; shift; exec "$@"' _ "$STATE/replay.pid" \
  runuser -u "$BUILDER" -- env -i PATH=/opt/node/bin:/usr/bin:/bin "$NODE" "$SKILL/scripts/replay.mjs" "$dir" "$REPLAY_PORT" \
  > "$log" 2>&1 < /dev/null &)
for _ in $(seq 1 20); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$REPLAY_URL/")" = 200 ] && { echo "REPLAY_RESULT=pass $REPLAY_URL"; exit 0; }
  sleep 0.5
done
echo "REPLAY_RESULT=fail $REPLAY_URL did not answer 200, see $log"
exit 1

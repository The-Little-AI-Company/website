#!/usr/bin/env bash
# Usage (root): launch.sh LOGFILE [repo]. Serves $WORK/dist with astro preview on
# 127.0.0.1:$VERIFY_PORT as the builder user. Needs a dist from run-all.sh's T14 step.
# Prints LAUNCH_RESULT=pass|fail once the home page answers, or after 30 seconds.
set -uo pipefail
. "$(dirname "$0")/env.sh" "${2:-}"
log=${1:?usage: launch.sh LOGFILE [repo]}
[ -f "$WORK/dist/index.html" ] || { echo "LAUNCH_RESULT=fail no $WORK/dist, run run-all.sh first"; exit 1; }
[ -z "$(port_owner "$VERIFY_PORT")" ] || { echo "LAUNCH_RESULT=fail port $VERIFY_PORT is taken, run cleanup.sh"; exit 1; }
mkdir -p "$STATE/home" && chown "$BUILDER": "$STATE/home"
# The preview gets its own session. Its leader writes the session id, and cleanup.sh stops
# exactly that session.
(cd "$WORK" && setsid bash -c 'echo $$ > "$1"; shift; exec "$@"' _ "$STATE/preview.pid" \
  runuser -u "$BUILDER" -- env -i PATH=/opt/node/bin:/usr/bin:/bin HOME="$STATE/home" ASTRO_TELEMETRY_DISABLED=1 \
  "$NODE" node_modules/astro/bin/astro.mjs preview --host 127.0.0.1 --port "$VERIFY_PORT" > "$log" 2>&1 < /dev/null &)
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$BUILD_URL/")" = 200 ] && { echo "LAUNCH_RESULT=pass $BUILD_URL session $(cat "$STATE/preview.pid")"; exit 0; }
  sleep 0.5
done
echo "LAUNCH_RESULT=fail $BUILD_URL did not answer 200 within 30 seconds, see $log"
exit 1

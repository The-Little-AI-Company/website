#!/usr/bin/env bash
# Usage: doctor.sh [repo]. Read-only. Is the preview this skill started worth driving?
# Prints DOCTOR_RESULT=pass|fail and exits to match.
set -uo pipefail
. "$(dirname "$0")/env.sh" "${1:-}"
fail() { echo "DOCTOR_RESULT=fail $*"; exit 1; }
[ -f "$STATE/preview.pid" ] || fail "no preview started by this skill ($STATE/preview.pid missing)"
pid=$(cat "$STATE/preview.pid")
kill -0 "$pid" 2>/dev/null || fail "preview pid $pid is not running"
owner=$(port_owner "$VERIFY_PORT")
[ -n "$owner" ] || fail "nothing listens on $VERIFY_PORT"
# The listener must belong to the session launch.sh started.
[ "$(ps -o sid= -p "$owner" | tr -d ' ')" = "$pid" ] || fail "port $VERIFY_PORT belongs to pid $owner, outside our session $pid"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BUILD_URL/")
[ "$code" = 200 ] || fail "GET / returned $code"
built=$(cat "$WORK/.verify-build" 2>/dev/null)
want=$("$SKILL/scripts/build-id.sh" "$REPO")
[ "$built" = "$want" ] || fail "dist was built from \"$built\", the checkout is \"$want\""
echo "DOCTOR_RESULT=pass pid $pid port $VERIFY_PORT build $built"

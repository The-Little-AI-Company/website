#!/bin/bash -p
set -euo pipefail
set +x
export PATH=/usr/bin:/bin
test "$(id -u)" = 1001
test "$(id -g)" = 65534
test "$(id -G)" = 65534
for capability in CapEff CapPrm CapInh CapAmb; do
  test "$(awk -v key="$capability:" '$1 == key { print $2 }' /proc/self/status)" = 0000000000000000
done
test "$(awk '$1 == "NoNewPrivs:" { print $2 }' /proc/self/status)" = 1
test -S /var/run/docker.sock
test "$(stat -c %u /var/run/docker.sock)" != 1001
test "$(stat -c %g /var/run/docker.sock)" != 65534
test ! -w /var/run/docker.sock
test -z "${LD_PRELOAD:-}${LD_LIBRARY_PATH:-}${LD_AUDIT:-}${GLIBC_TUNABLES:-}${BASH_ENV:-}${ENV:-}"

directory=$(readlink -f -- "${INPUT_DIRECTORY:?A private handoff directory is required.}")
case "$directory" in /github/runner_temp/company-security.????????/credentials) ;; *) exit 1;; esac
test ! -L "$INPUT_DIRECTORY"
test -d "$directory"
test "$(stat -c %u "$directory")" = 1001
test "$(stat -c %a "$directory")" = 700
case "${INPUT_SCOPE:-}" in artifact|deploy) ;; *) exit 1;; esac
umask 077
file="$directory/runtime.env"
set -o noclobber
: > "$file"
complete=false
trap 'if test "$complete" != true; then rm -f -- "$file"; fi' EXIT

write_value() {
  local name=$1 value
  value=$(printenv "$name")
  test -n "$value"
  test "${#value}" -le 16384
  case "$value" in *$'\n'*|*$'\r'*) exit 1;; esac
  case "$name" in
    ACTIONS_RUNTIME_URL|ACTIONS_RESULTS_URL|ACTIONS_ID_TOKEN_REQUEST_URL)
      case "$value" in https://*) ;; *) exit 1;; esac;;
    ACTIONS_RUNTIME_TOKEN|ACTIONS_ID_TOKEN_REQUEST_TOKEN) ;;
    *) exit 1;;
  esac
  printf '%s=%s\n' "$name" "$value" >> "$file"
}

write_value ACTIONS_RUNTIME_URL
write_value ACTIONS_RUNTIME_TOKEN
write_value ACTIONS_RESULTS_URL
if test "$INPUT_SCOPE" = deploy; then
  write_value ACTIONS_ID_TOKEN_REQUEST_URL
  write_value ACTIONS_ID_TOKEN_REQUEST_TOKEN
fi
chmod 600 -- "$file"
test "$(stat -c %u "$file")" = 1001
test "$(stat -c %a "$file")" = 600
complete=true
printf 'Captured the required runtime values after privilege and socket-access checks.\n'

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

# BEGIN COMPANY OS PACKAGE GUARD
test "$(dpkg --print-architecture)" = amd64
grep --quiet --fixed-strings 'VERSION_ID="24.04"' /etc/os-release
assert_os_floor() {
  local package=$1 minimum=$2 installed status
  status=$(dpkg-query --show --showformat='${Status}' "$package")
  test "$status" = 'install ok installed'
  installed=$(dpkg-query --show --showformat='${Version}' "$package")
  dpkg --compare-versions "$installed" ge "$minimum" || { printf '::error::OS package %s is below required floor %s\n' "$package" "$minimum" >&2; return 1; }
}
assert_os_floor libc6 2.39-0ubuntu8.9
assert_os_floor libc-bin 2.39-0ubuntu8.9
assert_os_floor libssl3t64 3.0.13-0ubuntu3.16
assert_os_floor openssl 3.0.13-0ubuntu3.16
printf '%s\n' 'BEGIN COMPANY INSTALLED OS PACKAGE INVENTORY'
dpkg-query --show --showformat='${binary:Package}\t${Version}\t${Architecture}\t${Status}\n'
printf '%s\n' 'END COMPANY INSTALLED OS PACKAGE INVENTORY'
# END COMPANY OS PACKAGE GUARD

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

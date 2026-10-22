#!/bin/bash -p
set -euo pipefail
set +x
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
test -z "${LD_PRELOAD:-}${LD_LIBRARY_PATH:-}${LD_AUDIT:-}${GLIBC_TUNABLES:-}${BASH_ENV:-}${ENV:-}${NODE_OPTIONS:-}${NODE_PATH:-}"
test "${RUNNER_ENVIRONMENT:-}" = github-hosted
test "${RUNNER_OS:-}" = Linux
test "${RUNNER_ARCH:-}" = X64
test "$(id -u)" = 1001
uid=$(id -u)
gid=$(id -g)
test "$gid" -gt 0
workspace=$(readlink -f -- "${GITHUB_WORKSPACE:?}")
test "$(stat -c %u "$workspace")" = "$uid"
temporary=$(readlink -f -- "${RUNNER_TEMP:?}")
mode=${1:?A fixed container mode is required.}

assert_private_mount() {
  local candidate=$1 expected=$2 owner=$3
  test -d "$candidate"
  test ! -L "$candidate"
  test "$(stat -c %u "$candidate")" = "$owner"
  test "$(readlink -f -- "$candidate")" = "$expected"
}

if test "$mode" = prepare; then
  directory=$(mktemp -d "$temporary/company-security.XXXXXXXX")
  chmod 700 -- "$directory"
  mkdir -m 700 -- "$directory/data" "$directory/data/work" "$directory/publish" "$directory/credentials"
  cp -- "${GITHUB_EVENT_PATH:?}" "$directory/event.json"
  chmod 600 -- "$directory/event.json"
  # These inputs remain outside every dependency/build mount.
  cp -a -- "$workspace/.github/actions/security-ci" "$directory/image-context"
  printf 'directory=%s\ncredentials=%s\n' "$directory" "$directory/credentials" >> "${GITHUB_OUTPUT:?}"
  printf 'Native container owner UID:GID %s:%s. Handoff uses UID1001:GID65534.\n' "$uid" "$gid"
  docker build --file "$directory/image-context/Dockerfile" \
    --iidfile "$directory/image-id" "$directory/image-context"
  chmod 600 -- "$directory/image-id"
  exit
fi

directory=$(readlink -f -- "${2:?The private preparation directory is required.}")
case "$directory" in "$temporary"/company-security.????????) ;; *) exit 1;; esac
test ! -L "$2"
test "$(stat -c %u "$directory")" = "$uid"
test "$(stat -c %a "$directory")" = 700
# The verify container is named after its private directory, so cleanup can find it.
container=${directory##*/}
if test "$mode" = cleanup; then
  # A cancelled verify step leaves its container running and writing into data/work.
  docker rm --force "$container" >/dev/null 2>&1 || true
  rm -rf -- "$directory"
  exit
fi
image=$(cat -- "$directory/image-id")
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]]
# --init reaps orphans (timeout as PID 1 does not) and forwards signals to the entrypoint.
common=(run --rm --init --user "$uid:$gid" --read-only --cap-drop=ALL
  --security-opt=no-new-privileges --pids-limit=512 --shm-size=1g
  --tmpfs "/tmp:rw,nosuid,nodev,size=2g,mode=1777"
  --env RUNNER_OS=Linux --env RUNNER_ARCH=X64 --env RUNNER_ENVIRONMENT=github-hosted
  --env GITHUB_REPOSITORY=The-Little-AI-Company/website
  --env NODE_OPTIONS= --env NODE_PATH= --env LD_PRELOAD= --env LD_LIBRARY_PATH= --env LD_AUDIT=
  --env GLIBC_TUNABLES= --env BASH_ENV= --env ENV=)
for name in GITHUB_SERVER_URL GITHUB_API_URL GITHUB_GRAPHQL_URL GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_RUN_NUMBER GITHUB_REF GITHUB_SHA GITHUB_WORKFLOW GITHUB_WORKFLOW_REF GITHUB_WORKFLOW_SHA GITHUB_ACTOR GITHUB_JOB GITHUB_ACTIONS GITHUB_EVENT_NAME GITHUB_BASE_REF GITHUB_HEAD_REF; do
  if test -n "${!name:-}"; then common+=(--env "$name"); fi
done

case "$mode" in
  verify)
    # Only these two mounts reach dependency/build/test code. No parent temp or commands/credentials.
    assert_private_mount "$directory/data" "$directory/data" "$uid"
    docker "${common[@]}" --name "$container" --env INPUT_MODE=verify \
      --env RUNNER_TEMP=/github/runner_temp --env GITHUB_WORKSPACE=/github/runner_temp/work \
      --mount "type=bind,src=$workspace,dst=/source,readonly" \
      --mount "type=bind,src=$directory/data,dst=/github/runner_temp" \
      "$image"
    ;;
  pack-pages|pack-report)
    assert_private_mount "$directory/data" "$directory/data" "$uid"
    assert_private_mount "$directory/data/work" "$directory/data/work" "$uid"
    rm -f -- "$directory/publish/artifact.tar"
    docker "${common[@]}" --env "INPUT_MODE=$mode" \
      --mount "type=bind,src=$directory/data/work,dst=/work,readonly" \
      --mount "type=bind,src=$directory/publish,dst=/publish" "$image"
    ;;
  upload-pages|upload-report|deploy)
    credentials="$directory/credentials/runtime.env"
    test ! -L "$credentials"
    test "$(stat -c %u "$credentials")" = "$uid"
    test "$(stat -c %a "$credentials")" = 600
    names=$(cut -d= -f1 -- "$credentials")
    expected=$'ACTIONS_RUNTIME_URL\nACTIONS_RUNTIME_TOKEN\nACTIONS_RESULTS_URL'
    if test "$mode" = deploy; then expected+=$'\nACTIONS_ID_TOKEN_REQUEST_URL\nACTIONS_ID_TOKEN_REQUEST_TOKEN'; fi
    test "$names" = "$expected"
    ! grep --quiet $'\r' "$credentials"
    common+=(--env-file "$credentials" --env "INPUT_MODE=$mode"
      --env GITHUB_EVENT_PATH=/metadata/event.json --env GITHUB_WORKSPACE=/tmp
      --mount "type=bind,src=$directory/event.json,dst=/metadata/event.json,readonly"
      --env GITHUB_OUTPUT=/commands/output --env GITHUB_STEP_SUMMARY=/commands/summary
      --mount "type=bind,src=${GITHUB_OUTPUT:?},dst=/commands/output"
      --mount "type=bind,src=${GITHUB_STEP_SUMMARY:?},dst=/commands/summary")
    if test "$mode" = deploy; then
      common+=(--env GITHUB_TOKEN)
    else
      test -f "$directory/publish/artifact.tar"
      test ! -L "$directory/publish/artifact.tar"
      test "$(stat -c %h "$directory/publish/artifact.tar")" = 1
      common+=(--mount "type=bind,src=$directory/publish/artifact.tar,dst=/publish/artifact.tar,readonly")
    fi
    trap 'rm -f -- "$credentials"' EXIT
    docker "${common[@]}" "$image"
    ;;
  *) exit 1;;
esac

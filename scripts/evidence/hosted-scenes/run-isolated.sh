#!/usr/bin/env bash
# QA-only profile. Canonical wrapper/controller and closed scenarios remain unchanged.
set -Eeuo pipefail
umask 077
fail(){ printf '%s\n' 'HOSTED_SCENES_SETUP_REFUSED' >&2; exit 1; }
if [[ ${1:-} == --inside ]]; then
  [[ $# == 15 && $EUID == 0 ]] || fail
  shift
  uid=$1; gid=$2; repo=$3; out=$4; node=$5; chrome=$6; inputs=$7
  parent_net=$8; parent_pid=$9; parent_mnt=${10}; run=${11}; attempt=${12}; job=${13}
  init=${14}
  [[ $init == /usr/bin/tini || $init == /usr/bin/docker-init || $init == /usr/libexec/docker/docker-init ]] || fail
  [[ $uid =~ ^[1-9][0-9]*$ && $gid =~ ^[0-9]+$ ]] || fail
  [[ $(readlink /proc/self/ns/net) != "$parent_net" && $(readlink /proc/self/ns/pid) != "$parent_pid" && $(readlink /proc/self/ns/mnt) != "$parent_mnt" ]] || fail
  [[ $(/usr/sbin/ip -o link show | wc -l) == 1 ]]
  /usr/sbin/ip link show dev lo >/dev/null
  /usr/sbin/ip link set dev lo up
  [[ $(/usr/sbin/ip -j route show table main) == '[]' && $(/usr/sbin/ip -6 -j route show table main) == '[]' ]]
  mkdir -- "$out/home" "$out/tmp"
  chown -R "$uid:$gid" -- "$out"
  # Bind only in the newly verified private mount namespace. Even a scrubbed
  # child falling back to /tmp stays within the owned cleanup root.
  /usr/bin/mount --make-rprivate /
  /usr/bin/mount --bind "$out/tmp" /tmp
  cd -- "$repo"
  exec /usr/bin/setpriv --reuid="$uid" --regid="$gid" --clear-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
    /usr/bin/env -i PATH="$(dirname "$node"):/usr/bin:/bin" HOME="$out/home" TMPDIR="$out/tmp" LANG=C.UTF-8 TZ=UTC \
    XR_QA_ACTIONS=true XR_QA_OUT="$out" XR_QA_INPUTS="$inputs" XR_QA_CHROME="$chrome" XR_EVIDENCE_CHROME="$chrome" XR_QA_STARTED_MS="$(date +%s%3N)" \
    XR_QA_PARENT_NET_NS="$parent_net" XR_QA_PARENT_PID_NS="$parent_pid" XR_QA_PARENT_MNT_NS="$parent_mnt" \
    XR_QA_RUN_ID="$run" XR_QA_RUN_ATTEMPT="$attempt" XR_QA_JOB_KEY="$job" \
    XR_QA_INIT_RECORD="$out/reaper-selection.json" \
    XR_QA_INIT_RECORD_SHA256="$(/usr/bin/sha256sum "$out/reaper-selection.json" | /usr/bin/cut -d ' ' -f1)" \
    "$init" -g -- "$node" --import tsx scripts/evidence/hosted-scenes/controller.mjs
fi
[[ $# == 0 && $EUID != 0 && ${GITHUB_ACTIONS:-} == true && ${RUNNER_OS:-} == Linux && ${GITHUB_REPOSITORY:-} == teamxenios/xenios-website \
  && ${GITHUB_EVENT_NAME:-} == push && ${GITHUB_REF:-} == refs/heads/qual/ea-83f95809-studio-fetch-20261124 && ${GITHUB_RUN_ATTEMPT:-} == 1 ]] || fail
repo=$(realpath -e -- "$(git rev-parse --show-toplevel)")
[[ $(realpath -e -- "$(dirname "${BASH_SOURCE[0]}")/../../..") == "$repo" ]] || fail
source "$repo/scripts/evidence/owned-runner-browser-qa.sh" # test-qualified capture_isolated_exit only; no canonical scenario is impersonated
temp=$(realpath -e -- "${RUNNER_TEMP:?}"); inputs=$(realpath -e -- "${XR_HOSTED_INPUT_ROOT:?}")
[[ $inputs == "$temp"/xenios-hosted-scenes-inputs-* && ! -L $inputs && -f $inputs/context.json ]] || fail
out=$(mktemp -d "$temp/xenios-owned-hosted-scenes.XXXXXXXX")
[[ -f ${GITHUB_OUTPUT:-} && ! -L $GITHUB_OUTPUT ]] || fail
printf 'artifact_dir=%s\n' "$out" >> "$GITHUB_OUTPUT"
started=$(date +%s%3N); isolated_started=false; isolated_command_exited=false; controller_status=null
parent_net=$(readlink /proc/self/ns/net); parent_pid=$(readlink /proc/self/ns/pid); parent_mnt=$(readlink /proc/self/ns/mnt)
finish(){
  local shell_status=$? cleanup=false unchanged=false final=1
  trap - EXIT ERR
  set +e
  if [[ $(realpath -e -- "$out") == "$out" && $out == "$temp"/xenios-owned-hosted-scenes.* && ( $isolated_command_exited == true || $isolated_started == false ) ]]; then
    if rm -rf -- "$out/home" "$out/tmp" && [[ ! -e $out/home && ! -e $out/tmp && ! -L $out/home && ! -L $out/tmp ]]; then cleanup=true; fi
  fi
  [[ $(readlink /proc/self/ns/net) == "$parent_net" && $(readlink /proc/self/ns/pid) == "$parent_pid" && $(readlink /proc/self/ns/mnt) == "$parent_mnt" ]] && unchanged=true
  local elapsed=$(($(date +%s%3N)-started))
  if [[ $shell_status == 0 && $controller_status == 0 && $isolated_command_exited == true && $cleanup == true && $unchanged == true && $elapsed -lt 300000 && -f $out/sequence-result.json ]]; then final=0; fi
  printf '{"kind":"QA_ONLY_HOSTED_SCENES_NAMESPACE_RESULT","isolatedCommandExited":%s,"controllerExit":%s,"shellExit":%s,"temporaryDirsRemoved":%s,"hostNamespacesUnchanged":%s,"elapsedMs":%s,"overallBudgetMs":300000,"noProductionAuthority":true}\n' "$isolated_command_exited" "$controller_status" "$shell_status" "$cleanup" "$unchanged" "$elapsed" > "$out/namespace-result.json"
  exit "$final"
}
trap finish EXIT
node=$(realpath -e -- "$(command -v node)")
init=$("$node" scripts/evidence/hosted-scenes/namespace-init.mjs --select "$out/reaper-selection.json")
[[ -x $init ]] || fail
chrome_cmd=$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || true)
[[ -n $chrome_cmd ]] || fail
chrome=$(realpath -e -- "$chrome_cmd")
[[ -x $node && -x $chrome && -x /usr/bin/unshare && -x /usr/bin/setpriv && -x /usr/bin/mount && -x /usr/sbin/ip && -x /usr/bin/timeout ]] || fail
remaining_ms=$((300000-($(date +%s%3N)-started)-15000)); [[ $remaining_ms -gt 0 ]] || fail
isolated_started=true
capture_isolated_exit /usr/bin/timeout --signal=TERM --kill-after=5s "$((remaining_ms/1000))s" \
  /usr/bin/sudo -n -- /usr/bin/unshare --mount --net --pid --fork --kill-child=SIGKILL --mount-proc \
  /usr/bin/env -i PATH=/usr/bin:/bin /bin/bash "$repo/scripts/evidence/hosted-scenes/run-isolated.sh" --inside \
  "$(id -u)" "$(id -g)" "$repo" "$out" "$node" "$chrome" "$inputs" "$parent_net" "$parent_pid" "$parent_mnt" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_JOB" "$init" \
  > "$out/controller.stdout.log" 2> "$out/controller.stderr.log"
isolated_command_exited=true
exit 0

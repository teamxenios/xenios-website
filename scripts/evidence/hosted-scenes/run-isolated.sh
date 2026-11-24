#!/usr/bin/env bash
# New signed-archive profile only. Role, scene, request and cleanup semantics stay closed.
set -Eeuo pipefail
umask 077
fail(){ printf '%s\n' 'HOSTED_SCENES_SETUP_REFUSED' >&2; exit 1; }
# Parsed as ordinary user. Passed as a fixed argument, never reopened through a runner pathname by root.
run_inside(){
  set -Eeuo pipefail
  umask 077
  fail(){ printf '%s\n' 'HOSTED_SCENES_SETUP_REFUSED' >&2; exit 1; }
  [[ $# == 15 && $EUID == 0 ]] || fail
  uid=$1; gid=$2; repo=$3; out=$4; node=$5; chrome=$6; inputs=$7
  parent_net=$8; parent_pid=$9; parent_mnt=${10}; run=${11}; attempt=${12}; job=${13}
  init=${14}; init_record_sha=${15}
  [[ $init == /usr/bin/tini || $init == /usr/bin/docker-init || $init == /usr/libexec/docker/docker-init ]] || fail
  [[ $uid =~ ^[1-9][0-9]*$ && $gid =~ ^[0-9]+$ && $init_record_sha =~ ^[a-f0-9]{64}$ ]] || fail
  [[ $chrome == /run/xenios-protected-browser/google-chrome ]] || fail
  [[ $(readlink /proc/self/ns/net) != "$parent_net" && $(readlink /proc/self/ns/pid) != "$parent_pid" && $(readlink /proc/self/ns/mnt) != "$parent_mnt" ]] || fail
  [[ $(/usr/sbin/ip -o link show | wc -l) == 1 ]]
  /usr/sbin/ip link show dev lo >/dev/null
  /usr/sbin/ip link set dev lo up
  [[ $(/usr/sbin/ip -j route show table main) == '[]' && $(/usr/sbin/ip -6 -j route show table main) == '[]' ]]
  trusted_dir(){
    local path=$1 row owner=null mode=UNKNOWN directory=false nonsymlink=false canonical=false
    [[ -d $path ]] && directory=true
    [[ ! -L $path ]] && nonsymlink=true
    [[ $(realpath -e -- "$path" 2>/dev/null) == "$path" ]] && canonical=true
    row=$(/usr/bin/stat --printf='%u %a' -- "$path" 2>/dev/null) || row=''
    [[ ${row%% *} =~ ^[0-9]+$ ]] && owner=${row%% *}
    [[ ${row#* } =~ ^[0-7]{3,4}$ ]] && mode=${row#* }
    printf '{"kind":"PRIVILEGED_FIXED_ANCHOR_METADATA","path":"%s","directory":%s,"notSymlink":%s,"canonical":%s,"uid":%s,"permissionsOctal":"%s","contentOrBrowserAuthorized":false}\n' "$path" "$directory" "$nonsymlink" "$canonical" "$owner" "$mode"
    [[ $directory == true && $nonsymlink == true && $canonical == true && $owner == 0 && $mode != UNKNOWN ]] && (( (8#$mode & 0022) == 0 )) || fail
  }
  for anchor in / /run; do trusted_dir "$anchor"; done
  [[ -d /tmp && ! -L /tmp && $(realpath -e /tmp) == /tmp && $(/usr/bin/stat -c %u /tmp) == 0 ]] || fail
  [[ ! -e /run/xenios-protected-browser && ! -L /run/xenios-protected-browser ]] || fail
  available_kb=$(/usr/bin/awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
  [[ $available_kb =~ ^[0-9]+$ ]] || available_kb=null
  printf '{"kind":"SIGNED_CHROME158_PRIVATE_PREPARATION","state":"STARTED_NOT_CONTENT_VERIFIED","availableKiB":%s,"requiredKiB":2621440,"browserAuthorized":false}\n' "$available_kb"
  [[ $available_kb != null && $available_kb -ge 2621440 ]] || fail
  /usr/bin/mount --make-rprivate /
  /usr/bin/mount -t tmpfs -o size=1073741824,nr_inodes=8192,mode=0755,nosuid,nodev,noexec tmpfs /run
  browser_stage=/run/xenios-protected-browser
  browser_archive=/run/xenios-chrome158.deb
  mkdir -m 0700 -- "$browser_stage"
  # Standard bounded data intake. No runner-owned pathname is opened with privilege.
  ( set -o noclobber; /usr/bin/head -c 152741121 > "$browser_archive" )
  [[ $(/usr/bin/stat -c %s -- "$browser_archive") == 152741120 ]] || fail
  [[ $(/usr/bin/sha256sum -- "$browser_archive" | /usr/bin/cut -d ' ' -f1) == a656b2db00a8cb7f13a1d754f6aad91f84014906452c6dfb7f3ead93035da03b ]] || fail
  printf '{"kind":"SIGNED_CHROME158_PRIVATE_PREPARATION","state":"WHOLE_PACKAGE_HASH_VERIFIED_BEFORE_DATA_EXTRACTION","bytes":152741120,"sha256":"a656b2db00a8cb7f13a1d754f6aad91f84014906452c6dfb7f3ead93035da03b","installed":false,"maintainerScriptsExecuted":false}\n'
  # This literal is an archive-member prefix only; no shared installation is read or bound.
  TMPDIR=/run /usr/bin/timeout --signal=TERM --kill-after=3s 60s /usr/bin/dpkg-deb --fsys-tarfile "$browser_archive" | \
    /usr/bin/timeout --signal=TERM --kill-after=3s 60s /usr/bin/tar --extract --file=- --directory "$browser_stage" \
      --strip-components=4 --no-same-owner --no-same-permissions --no-overwrite-dir --delay-directory-restore -- ./opt/google/chrome
  /usr/bin/find -P "$browser_stage" -type f -exec /usr/bin/chmod a=rX,u-s,g-s,o-t -- {} +
  /usr/bin/find -P "$browser_stage" -type d -exec /usr/bin/chmod a=rx,u-s,g-s,o-t -- {} +
  /usr/bin/rm -- "$browser_archive"
  /usr/bin/mount -o remount,ro,nosuid,nodev,exec /run
  printf '{"kind":"SIGNED_CHROME158_PRIVATE_PREPARATION","state":"SEALED_REQUIRES_UNPRIVILEGED_COMPLETE_MANIFEST_AND_RUNTIME_CHECKS","privateRoot":"/run/xenios-protected-browser","browserAuthorized":false,"noSharedBrowserPathRequested":true}\n'
  /usr/bin/mount -t tmpfs -o size=536870912,nr_inodes=8192,mode=1777,nosuid,nodev tmpfs /tmp
  # All remaining checkout/evidence/library reads and code execution occur only after UID/capability drop.
  exec /usr/bin/setpriv --reuid="$uid" --regid="$gid" --clear-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
    /usr/bin/env -i PATH="$(dirname "$node"):/usr/bin:/bin" HOME="$out/home" TMPDIR=/tmp LANG=C.UTF-8 TZ=UTC \
    XR_QA_ACTIONS=true XR_QA_OUT="$out" XR_QA_INPUTS="$inputs" XR_QA_CHROME="$chrome" XR_EVIDENCE_CHROME="$chrome" XR_QA_STARTED_MS="$(date +%s%3N)" \
    XR_QA_PARENT_NET_NS="$parent_net" XR_QA_PARENT_PID_NS="$parent_pid" XR_QA_PARENT_MNT_NS="$parent_mnt" \
    XR_QA_RUN_ID="$run" XR_QA_RUN_ATTEMPT="$attempt" XR_QA_JOB_KEY="$job" \
    XR_QA_INIT_RECORD="$out/reaper-selection.json" XR_QA_INIT_RECORD_SHA256="$init_record_sha" \
    "$init" -g -- "$node" --import tsx scripts/evidence/hosted-scenes/controller.mjs < /dev/null
}
[[ $# == 0 && $EUID != 0 && ${GITHUB_ACTIONS:-} == true && ${RUNNER_OS:-} == Linux && ${GITHUB_REPOSITORY:-} == teamxenios/xenios-website \
  && ${GITHUB_EVENT_NAME:-} == push && ${GITHUB_REF:-} == refs/heads/qual/ea-ea78e6bc-chrome158-startup-observation-20261124 && ${GITHUB_RUN_ATTEMPT:-} == 1 ]] || fail
repo=$(realpath -e -- "$(git rev-parse --show-toplevel)")
[[ $(realpath -e -- "$(dirname "${BASH_SOURCE[0]}")/../../..") == "$repo" ]] || fail
source "$repo/scripts/evidence/owned-runner-browser-qa.sh" # test-qualified capture_isolated_exit only; no canonical scenario is impersonated
temp=$(realpath -e -- "${RUNNER_TEMP:?}"); inputs=$(realpath -e -- "${XR_HOSTED_INPUT_ROOT:?}")
[[ $inputs == "$temp"/xenios-hosted-scenes-inputs-* && ! -L $inputs && -f $inputs/context.json ]] || fail
out=$(mktemp -d "$temp/xenios-owned-hosted-scenes.XXXXXXXX")
[[ -f ${GITHUB_OUTPUT:-} && ! -L $GITHUB_OUTPUT ]] || fail
printf 'artifact_dir=%s\n' "$out" >> "$GITHUB_OUTPUT"
mkdir -- "$out/home"
started=$(date +%s%3N); isolated_started=false; isolated_command_exited=false; controller_status=null
parent_net=$(readlink /proc/self/ns/net); parent_pid=$(readlink /proc/self/ns/pid); parent_mnt=$(readlink /proc/self/ns/mnt)
finish(){
  local shell_status=$? cleanup=false unchanged=false protected_absent=false final=1
  trap - EXIT ERR
  set +e
  if [[ $(realpath -e -- "$out") == "$out" && $out == "$temp"/xenios-owned-hosted-scenes.* && ( $isolated_command_exited == true || $isolated_started == false ) ]]; then
    if rm -rf -- "$out/home" "$out/tmp" && [[ ! -e $out/home && ! -e $out/tmp && ! -L $out/home && ! -L $out/tmp ]]; then cleanup=true; fi
    if [[ -r /run && -x /run && ! -e /run/xenios-protected-browser && ! -L /run/xenios-protected-browser ]]; then protected_absent=true; fi
  fi
  [[ $(readlink /proc/self/ns/net) == "$parent_net" && $(readlink /proc/self/ns/pid) == "$parent_pid" && $(readlink /proc/self/ns/mnt) == "$parent_mnt" ]] && unchanged=true
  local elapsed=$(($(date +%s%3N)-started))
  if [[ $shell_status == 0 && $controller_status == 0 && $isolated_command_exited == true && $cleanup == true && $protected_absent == true && $unchanged == true && $elapsed -lt 300000 && -f $out/sequence-result.json ]]; then final=0; fi
  printf '{"kind":"QA_ONLY_HOSTED_SCENES_NAMESPACE_RESULT","isolatedCommandExited":%s,"controllerExit":%s,"shellExit":%s,"temporaryDirsRemoved":%s,"privateBrowserPathAbsentInHost":%s,"noSharedBrowserPathRequested":true,"hostNamespacesUnchanged":%s,"elapsedMs":%s,"overallBudgetMs":300000,"noProductionAuthority":true}\n' "$isolated_command_exited" "$controller_status" "$shell_status" "$cleanup" "$protected_absent" "$unchanged" "$elapsed" > "$out/namespace-result.json"
  exit "$final"
}
trap finish EXIT
[[ -r /run && -x /run && ! -e /run/xenios-protected-browser && ! -L /run/xenios-protected-browser ]] || fail

node=$(realpath -e -- "$(command -v node)")
init=$("$node" scripts/evidence/hosted-scenes/namespace-init.mjs --select "$out/reaper-selection.json")
[[ -x $init ]] || fail
init_record_sha=$(/usr/bin/sha256sum "$out/reaper-selection.json" | /usr/bin/cut -d ' ' -f1)
package=$(realpath -e -- "${XR_CHROME158_PACKAGE:?}")
[[ $package == "$inputs/selected-chrome158.deb" && ! -L $XR_CHROME158_PACKAGE && -f $package ]] || fail
exec {package_fd}< "$package"
inside_code="$(declare -f run_inside); run_inside \"\$@\""
chrome=/run/xenios-protected-browser/google-chrome
[[ -x $node && -x /usr/bin/dpkg-deb && -x /usr/bin/tar && -x /usr/bin/unshare && -x /usr/bin/setpriv && -x /usr/bin/mount && -x /usr/sbin/ip && -x /usr/bin/timeout ]] || fail
remaining_ms=$((300000-($(date +%s%3N)-started)-15000)); [[ $remaining_ms -gt 0 ]] || fail
isolated_started=true
capture_isolated_exit /usr/bin/timeout --signal=TERM --kill-after=5s "$((remaining_ms/1000))s" \
  /usr/bin/sudo -n -- /usr/bin/unshare --mount --net --pid --fork --kill-child=SIGKILL --mount-proc \
  /usr/bin/env -i PATH=/usr/bin:/bin /bin/bash --noprofile --norc -c "$inside_code" -- \
  "$(id -u)" "$(id -g)" "$repo" "$out" "$node" "$chrome" "$inputs" "$parent_net" "$parent_pid" "$parent_mnt" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_JOB" "$init" "$init_record_sha" <&"$package_fd" \
  > "$out/controller.stdout.log" 2> "$out/controller.stderr.log"
exec {package_fd}<&-
isolated_command_exited=true
exit 0

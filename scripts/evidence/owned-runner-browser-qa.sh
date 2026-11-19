#!/usr/bin/env bash
# Actions-only. No installs, host firewall changes, real-service URLs or secrets.
# Root owns the workflow. This wrapper owns one nonpersistent child namespace.
set -Eeuo pipefail
umask 077

fixed_failure() { printf '%s\n' 'OWNED_BROWSER_QA_SETUP_FAILED' >&2; exit 1; }
trap fixed_failure ERR

if [[ ${1:-} == --inside ]]; then
  [[ $# == 17 && $EUID == 0 ]] || fixed_failure
  shift
  runner_uid=$1; runner_gid=$2; repo_dir=$3; artifact_dir=$4; node_bin=$5; chrome_bin=$6
  source_head=$7; source_tree=$8; parent_net=$9; parent_pid=${10}; started_ms=${11}
  run_id=${12}; run_attempt=${13}; job_key=${14}; image_id=${15}; numeric_job_id=${16}
  [[ $runner_uid =~ ^[1-9][0-9]*$ && $runner_gid =~ ^[0-9]+$ ]] || fixed_failure
  [[ $(readlink /proc/self/ns/net) != "$parent_net" && $(readlink /proc/self/ns/pid) != "$parent_pid" ]] || fixed_failure
  # No interface is added. Only the new namespace's loopback may exist.
  [[ $(/usr/sbin/ip -o link show | wc -l) == 1 ]]
  /usr/sbin/ip link show dev lo >/dev/null
  /usr/sbin/ip link set dev lo up
  [[ $(/usr/sbin/ip -j route show table main) == '[]' ]]
  [[ $(/usr/sbin/ip -6 -j route show table main) == '[]' ]]
  mkdir -- "$artifact_dir/home" "$artifact_dir/tmp"
  chown -R "$runner_uid:$runner_gid" -- "$artifact_dir"
  cd -- "$repo_dir"
  # No sudo/Actions/provider/Auth environment survives into the QA controller.
  # no-new-privs and an empty capability bounding set remain inherited by Chrome.
  exec /usr/bin/setpriv --reuid="$runner_uid" --regid="$runner_gid" --clear-groups \
    --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
    /usr/bin/env -i \
    PATH="$(dirname "$node_bin"):/usr/bin:/bin" HOME="$artifact_dir/home" TMPDIR="$artifact_dir/tmp" \
    LANG=C.UTF-8 TZ=UTC \
    XR_QA_ACTIONS=true XR_QA_OUT="$artifact_dir" XR_QA_CHROME="$chrome_bin" \
    XR_QA_PARENT_NET_NS="$parent_net" XR_QA_PARENT_PID_NS="$parent_pid" XR_QA_STARTED_MS="$started_ms" \
    XR_QA_SOURCE_HEAD="$source_head" XR_QA_SOURCE_TREE="$source_tree" \
    XR_QA_RUN_ID="$run_id" XR_QA_RUN_ATTEMPT="$run_attempt" XR_QA_JOB_KEY="$job_key" \
    XR_QA_RUNNER_IMAGE="$image_id" XR_QA_JOB_ID="$numeric_job_id" \
    "$node_bin" --import tsx scripts/evidence/owned-runner-browser-qa.mjs --run
fi

[[ $# == 0 && $EUID != 0 && ${GITHUB_ACTIONS:-} == true && ${RUNNER_OS:-} == Linux \
  && ${GITHUB_REPOSITORY:-} == teamxenios/xenios-website ]] || fixed_failure
started_ms=$(date +%s%3N)
[[ ${XR_QA_SOURCE_HEAD:-} =~ ^[a-f0-9]{40}$ && ${XR_QA_SOURCE_TREE:-} =~ ^[a-f0-9]{40}$ ]] || fixed_failure
[[ ${GITHUB_RUN_ID:-} =~ ^[0-9]+$ && ${GITHUB_RUN_ATTEMPT:-} =~ ^[0-9]+$ \
  && ${GITHUB_JOB:-} =~ ^[a-zA-Z0-9_-]+$ && ${XR_QA_JOB_ID:-} =~ ^[0-9]*$ ]] || fixed_failure
repo_dir=$(git rev-parse --show-toplevel)
repo_dir=$(realpath -e -- "$repo_dir")
[[ $(realpath -e -- "$(dirname "${BASH_SOURCE[0]}")/../..") == "$repo_dir" ]] || fixed_failure
runner_temp=$(realpath -e -- "${RUNNER_TEMP:?}")
[[ -d $runner_temp && ! -L $runner_temp ]] || fixed_failure
artifact_dir=$(mktemp -d "$runner_temp/xenios-owned-browser.XXXXXXXX")
[[ -n ${GITHUB_OUTPUT:-} && -f $GITHUB_OUTPUT && ! -L $GITHUB_OUTPUT ]] || fixed_failure
printf 'artifact_dir=%s\n' "$artifact_dir" >> "$GITHUB_OUTPUT"
printf '%s\n' '{"schemaVersion":1,"state":"SETUP_STARTED","browserExecuted":false,"scope":"LOCAL_STATIC_404_FIXTURE_ONLY"}' > "$artifact_dir/setup.json"

runner_uid=$(id -u); runner_gid=$(id -g)
node_bin=$(realpath -e -- "$(command -v node)")
chrome_cmd=$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || true)
[[ -n $chrome_cmd ]] || fixed_failure
chrome_bin=$(realpath -e -- "$chrome_cmd")
[[ -x $node_bin && -x $chrome_bin && -x /usr/bin/unshare && -x /usr/bin/setpriv \
  && -x /usr/sbin/ip && -x /usr/bin/timeout ]] || fixed_failure
parent_net=$(readlink /proc/self/ns/net); parent_pid=$(readlink /proc/self/ns/pid)
image_id=${ImageOS:-unknown}-${ImageVersion:-unknown}
[[ $image_id =~ ^[a-zA-Z0-9._-]+$ ]] || fixed_failure
script_path="$repo_dir/scripts/evidence/owned-runner-browser-qa.sh"

# Budget begins at wrapper entry, not at first browser navigation. No renewed
# timeout is granted after setup. Reserve the tail for durable outer evidence.
remaining_ms=$((300000 - ($(date +%s%3N) - started_ms) - 15000))
[[ $remaining_ms -gt 0 ]] || fixed_failure
remaining_seconds=$((remaining_ms / 1000))
set +e
/usr/bin/timeout --signal=TERM --kill-after=5s "${remaining_seconds}s" \
  /usr/bin/sudo -n -- /usr/bin/unshare --mount --net --pid --fork --kill-child=SIGKILL --mount-proc \
  /usr/bin/env -i PATH=/usr/bin:/bin /bin/bash "$script_path" --inside \
  "$runner_uid" "$runner_gid" "$repo_dir" "$artifact_dir" "$node_bin" "$chrome_bin" \
  "$XR_QA_SOURCE_HEAD" "$XR_QA_SOURCE_TREE" "$parent_net" "$parent_pid" "$started_ms" \
  "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_JOB" "$image_id" "${XR_QA_JOB_ID:-}" \
  > "$artifact_dir/controller.stdout.log" 2> "$artifact_dir/controller.stderr.log"
controller_status=$?
set -e
elapsed_ms=$(($(date +%s%3N) - started_ms))
# Never upload profiles/cache/home directories, including a failed launch's
# leftovers. These are the two literal children of the directory we created.
[[ $(realpath -e -- "$artifact_dir") == "$artifact_dir" && $artifact_dir == "$runner_temp"/xenios-owned-browser.* ]] || fixed_failure
rm -rf -- "$artifact_dir/home" "$artifact_dir/tmp"
# PID namespace init termination kills its remaining descendants. Record the
# namespace process outcome separately; never infer UI success from this alone.
printf '{"schemaVersion":1,"isolatedCommandExited":true,"exitCode":%s,"elapsedMs":%s,"overallBudgetMs":300000,"hostNetworkUnchanged":true,"profilesExcluded":true,"scope":"LOCAL_STATIC_404_FIXTURE_ONLY"}\n' \
  "$controller_status" "$elapsed_ms" > "$artifact_dir/namespace-result.json"
[[ $controller_status == 0 && $elapsed_ms -lt 300000 && -f $artifact_dir/result.json ]] || {
  printf '%s\n' 'OWNED_BROWSER_QA_FAILED_OR_NOT_EXECUTED' >&2; exit 1;
}
printf '%s\n' 'OWNED_BROWSER_QA_COMPLETE_LOCAL_FIXTURE_ONLY'

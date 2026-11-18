// PRIVATE, UNINSTALLED proposal. Pure offline projection of an owner-supplied
// c50 status export; never reads files, controls a worker or manufactures runs.
import { createHash } from 'node:crypto';

export const NATIVE_EXPORTER_SCHEMA_SHA = 'c50e3afe17357fe247d2f4da4c8ae03dffdcd2a3';
const REPORT_KEYS = ['mode', 'paused', 'operator_actions', 'operator_action_count',
  'operator_actions_truncated', 'input_hash', 'tasks', 'truncated', 'result',
  'last_intake_result', 'worker_launch_claimed', 'automatic_publication'];
const ACTION_KEYS = ['task', 'seat', 'repository', 'head', 'state', 'observed_at',
  'since_at', 'next_action', 'source'];
const ACTIONS = Object.freeze({
  blocked_auth: 'Authenticate in the same native seat and verify its session before resuming.',
  blocked_approval: 'Resolve the pending decision in the original host approval control.',
  waiting_review: 'Collect independent review for this exact commit.',
  retryable_failure: 'Verify worker ownership and correct the failure before retrying.',
});
const RESULT_STATES = new Set(['prepared', 'existing-work-retained', 'no-ready-task',
  'held-input', 'paused-no-intake', 'unchanged-input-not-reexecuted']);
const UNKNOWN_FIELDS = Object.freeze(['native_worker_execution', 'execution_run_count',
  'native_smoke_result', 'actual_run_duration_seconds', 'approval_wait_seconds',
  'test_receipts', 'independent_review_receipts', 'hosted_ci_receipts',
  'browser_receipts', 'staging_receipts', 'production_receipts', 'release_authority',
  'provider_usage_and_cost', 'cross_model_comparison', 'current_authentication_state',
  'native_seat_pause_state', 'runtime_source_version', 'snapshot_capture_time']);
const SHA = /^[0-9a-f]{40}$/, HASH = /^[0-9a-f]{64}$/;
const ISSUE = /^KAN-[1-9][0-9]*$/, TASK = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;
const SEAT = /^[a-z0-9][a-z0-9-]{0,47}@[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const refuse = () => { throw new Error('UNSUPPORTED_NATIVE_OBSERVATION_EXPORT'); };
// Comparing the whole match also rejects a final newline (JS `$` alone does not).
const string = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
}
function exactKeys(value, keys) {
  object(value);
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) refuse();
}
function epoch(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 253402300799) refuse();
  return new Date(value * 1000).toISOString();
}
function resultState(value) {
  if (value === null) return null;
  object(value);
  // These are the pinned exporter's exact optional result fields. Validate the
  // opaque lease/dispatch context, but never copy it or a reason into output.
  if (Object.keys(value).some(key => !['state', 'reason', 'issue', 'token', 'dispatch_key'].includes(key))
    || !RESULT_STATES.has(value.state)
    || Object.hasOwn(value, 'reason') && !string(value.reason, /^[A-Z0-9_]{1,100}$/)
    || Object.hasOwn(value, 'issue') && !string(value.issue, ISSUE)
    || Object.hasOwn(value, 'token') && (!Number.isSafeInteger(value.token) || value.token < 1)
    || Object.hasOwn(value, 'dispatch_key') && !string(value.dispatch_key, SAFE_ID)) refuse();
  return value.state;
}

/** Input is exact owner-supplied export text, not a live status path. The digest
 * identifies these input bytes only: neither it nor the caller's schema pin is
 * runtime provenance, an authenticated capture, or evidence of fresh execution.
 * Opaque native result fields are validated then redacted. No raw input echoes.
 */
export function summarizeNativeObservationExport(exportText, { sourceSha } = {}) {
  if (sourceSha !== NATIVE_EXPORTER_SCHEMA_SHA || typeof exportText !== 'string'
    || Buffer.byteLength(exportText, 'utf8') > 65536) refuse();
  let report;
  try { report = JSON.parse(exportText); } catch { refuse(); }
  exactKeys(report, REPORT_KEYS);
  if (report.mode !== 'ASSISTED_INTAKE_PREPARE_ONLY'
    || report.worker_launch_claimed !== false || report.automatic_publication !== false
    || !string(report.input_hash, HASH)
    || ['paused', 'operator_actions_truncated', 'truncated'].some(key => typeof report[key] !== 'boolean')
    || !Array.isArray(report.tasks) || report.tasks.length > 1000
    || !Array.isArray(report.operator_actions) || report.operator_actions.length > 1000
    || !Number.isSafeInteger(report.operator_action_count)
    || report.operator_action_count < report.operator_actions.length
    || (report.operator_actions_truncated
      ? report.operator_action_count <= report.operator_actions.length
      : report.operator_action_count !== report.operator_actions.length)) refuse();
  const currentResult = resultState(report.result), lastResult = resultState(report.last_intake_result);
  const issues = new Set();
  const taskContext = report.tasks.map(row => {
    exactKeys(row, ['issue', 'state', 'review_head']);
    if (!string(row.issue, ISSUE) || !string(row.state, /^[A-Z_]{1,40}$/)
      || row.review_head !== null && !string(row.review_head, SHA) || issues.has(row.issue)) refuse();
    issues.add(row.issue);
    return { issue: row.issue, task_state_context_only: row.state, review_sha_context_only: row.review_head };
  }).sort((a, b) => a.issue < b.issue ? -1 : a.issue > b.issue ? 1 : 0);
  const ownerships = new Set();
  const observations = report.operator_actions.map(row => {
    exactKeys(row, ACTION_KEYS);
    if (!string(row.task, TASK) || !string(row.seat, SEAT)
      || !['factory', 'teamxenios/xenios-website'].includes(row.repository)
      || !string(row.head, SHA) || typeof row.state !== 'string' || !Object.hasOwn(ACTIONS, row.state)
      || row.next_action !== ACTIONS[row.state] || row.source !== 'root_observation') refuse();
    const first = epoch(row.since_at), last = epoch(row.observed_at);
    const ownership = JSON.stringify([row.task, row.repository, row.seat]);
    if (row.since_at > row.observed_at || ownerships.has(ownership)) refuse();
    ownerships.add(ownership);
    const episode = JSON.stringify([row.task, row.repository, row.seat, row.head, row.state, row.since_at]);
    return { ownership_observation_key: hash(ownership), observation_episode_id: hash(episode),
      observation_record_id: hash(JSON.stringify([episode, row.observed_at])),
      task_context_only: row.task, seat_context_only: row.seat, repository_context_only: row.repository,
      head_context_only: row.head, root_reported_state: row.state,
      first_root_observed_at: first, last_root_observed_at: last,
      observation_window_seconds: row.observed_at - row.since_at };
  }).sort((a, b) => a.ownership_observation_key < b.ownership_observation_key ? -1 : a.ownership_observation_key > b.ownership_observation_key ? 1 : 0);
  return {
    schema_version: 2, proposal_status: 'PRIVATE_UNINSTALLED_PROPOSAL',
    evidence_kind: 'root_operator_observation_snapshot',
    source_schema_sha: sourceSha, source_pin_basis: 'caller_asserted_schema_pin_not_runtime_attestation',
    input_export_bytes_sha256: hash(exportText), source_configuration_sha256: report.input_hash,
    export_provenance: 'UNVERIFIED_OWNER_SUPPLIED_BYTES',
    coverage: report.truncated || report.operator_actions_truncated ? 'partial_snapshot' : 'snapshot_only',
    snapshot_context: { controller_paused_reported: report.paused,
      reported_operator_action_count: report.operator_action_count,
      exported_operator_action_count: observations.length,
      operator_actions_truncated: report.operator_actions_truncated,
      exported_task_record_count: taskContext.length, tasks_truncated: report.truncated,
      worker_launch_claimed_by_exporter: false, automatic_publication_claimed_by_exporter: false },
    timestamp_basis: 'root_observations_not_execution_or_continuous_state',
    intake_context_only: { result_state: currentResult, last_intake_state: lastResult, opaque_fields_redacted: true },
    observations, task_states_context_only: taskContext,
    authority_basis: 'NONE_GRANTED_BY_SUMMARY',
    unknown: Object.fromEntries(UNKNOWN_FIELDS.map(key => [key, null])),
  };
}

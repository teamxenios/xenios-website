// Candidate-only projections. Never serialize raw helper output, argv, env,
// paths, host/boot identities, or exception messages into the diagnostic channel.
const { createHash } = require('node:crypto');
const stages = new Set(['runtime', 'authority_path', 'fixed_ntfs', 'operating_system', 'process', 'complete']);
const classes = new Set(['tool_launch', 'tool_timeout', 'tool_output_limit', 'tool_signal', 'tool_exit', 'native_error', 'protocol_error', 'protocol_returned']);
const token = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : null;
const type = value => typeof value === 'string' && /^[A-Za-z0-9_.+`]{1,160}$/.test(value) ? value : null;
const integer = value => Number.isSafeInteger(value) ? value : null;
const bytes = value => Buffer.isBuffer(value) ? value : typeof value === 'string' ? Buffer.from(value) : Buffer.alloc(0);
const hash = value => createHash('sha256').update(value).digest('hex');
function helperProjection(value) {
  return {
    schemaVersion: value?.schemaVersion === 1 ? 1 : null,
    available: typeof value?.available === 'boolean' ? value.available : null,
    code: value?.code === 'owner_observation_unavailable' ? value.code : null,
    stage: stages.has(value?.stage) ? value.stage : null,
    exceptionType: type(value?.exceptionType), hresult: integer(value?.hresult),
    platform: value?.platform === 'win32' ? 'win32' : null,
    fileSystem: value?.fileSystem === 'NTFS' ? 'NTFS' : null,
    localFixedDrive: typeof value?.localFixedDrive === 'boolean' ? value.localFixedDrive : null,
    pid: integer(value?.pid), found: typeof value?.found === 'boolean' ? value.found : null
  };
}
function classify(error, helper, validation) {
  if (['ENOENT', 'EACCES', 'EPERM'].includes(error?.code)) return 'tool_launch';
  if (error?.code === 'ETIMEDOUT') return 'tool_timeout';
  if (error?.code === 'ENOBUFS') return 'tool_output_limit';
  if (helper.available === false && helper.code) return 'native_error';
  if (error?.signal) return 'tool_signal';
  if (Number.isInteger(error?.status) && error.status !== 0) return 'tool_exit';
  if (validation === 'refused' || helper.schemaVersion !== 1 || helper.available !== true || helper.stage !== 'complete') return 'protocol_error';
  return 'protocol_returned'; // The production observer alone decides acceptance.
}
function invocation({ stdout, stderr, error, subjectPid, elapsedMilliseconds }) {
  const out = bytes(stdout), err = bytes(stderr);
  let value = null;
  try { value = JSON.parse(out.toString('utf8').replace(/^\uFEFF/, '')); } catch { /* Hashes/lengths suffice. */ }
  const helper = helperProjection(value);
  return {
    schemaVersion: 1, kind: 'candidate-owner-observer-diagnostic',
    classification: classify(error, helper), validation: 'unknown',
    subjectPid: integer(subjectPid), helperPid: integer(error?.pid),
    helperExitCode: error ? integer(error.status) : 0,
    transportCode: token(error?.code), signal: token(error?.signal),
    elapsedMilliseconds: Number.isFinite(elapsedMilliseconds) ? Math.max(0, Math.round(elapsedMilliseconds)) : null,
    stdoutBytes: out.length, stderrBytes: err.length, stdoutSha256: hash(out), stderrSha256: hash(err), helper
  };
}
function receipt(value) {
  const helper = helperProjection(value?.helperJson);
  const error = { code: value?.transportCode, signal: value?.signal, status: value?.helperExitCode };
  const validation = ['accepted', 'refused'].includes(value?.validation) ? value.validation : 'unknown';
  return {
    schemaVersion: 1, kind: 'candidate-owner-observer-diagnostic',
    classification: classify(error, helper, validation), validation,
    subjectPid: integer(value?.pid), helperPid: null, helperExitCode: integer(value?.helperExitCode),
    transportCode: token(value?.transportCode), signal: token(value?.signal), elapsedMilliseconds: null,
    stdoutBytes: integer(value?.stdoutBytes), stderrBytes: integer(value?.stderrBytes),
    stdoutSha256: typeof value?.stdoutSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.stdoutSha256) ? value.stdoutSha256 : null,
    stderrSha256: typeof value?.stderrSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.stderrSha256) ? value.stderrSha256 : null,
    helper
  };
}
function isProjection(value) {
  if (!value || value.schemaVersion !== 1 || value.kind !== 'candidate-owner-observer-diagnostic' || !classes.has(value.classification)) return false;
  const keys = Object.keys(invocation({}));
  if (Object.keys(value).some(key => !keys.includes(key))) return false;
  // Re-project the parsed child payload; arbitrary new fields or strings cannot
  // pass through the separate pipe into the supervisor's full stderr artifact.
  const safe = receipt({ ...value, pid: value.subjectPid, helperJson: value.helper });
  safe.classification = value.classification; safe.helperPid = integer(value.helperPid);
  safe.elapsedMilliseconds = Number.isSafeInteger(value.elapsedMilliseconds) && value.elapsedMilliseconds >= 0 ? value.elapsedMilliseconds : null;
  return JSON.stringify(safe) === JSON.stringify(value);
}
module.exports = { invocation, receipt, isProjection };

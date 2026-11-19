// Source-only diagnostic projection checks; not part of the38 protocol count.
const test = require('node:test'), assert = require('node:assert/strict');
const { invocation, receipt, isProjection } = require('./observer-diagnostics.cjs');
test('actual transport observations retain classification without raw content', () => {
  for (const [code, expected] of [['ENOENT', 'tool_launch'], ['ETIMEDOUT', 'tool_timeout'], ['ENOBUFS', 'tool_output_limit']]) {
    const record = invocation({ error: { code, pid: 33, stdout: 'unused' }, stdout: 'secret output', stderr: 'secret stderr', subjectPid: 11, elapsedMilliseconds: 8001 });
    assert.equal(record.classification, expected); assert.equal(record.helperPid, 33);
    assert(isProjection(record)); assert(!JSON.stringify(record).includes('secret'));
    assert.equal(record.stdoutBytes, 13); assert.equal(record.stderrBytes, 13);
  }
});
test('native refusal retains exact safe stage and error without host or messages', () => {
  const output = JSON.stringify({ schemaVersion: 1, available: false, code: 'owner_observation_unavailable', stage: 'operating_system', exceptionType: 'System.ComponentModel.Win32Exception', hresult: -1, hostId: 'private-host', bootId: 'private-boot', message: 'private message', env: { token: 'private-token' } });
  const record = invocation({ stdout: output, error: { status: 2 }, subjectPid: 11, elapsedMilliseconds: 23 });
  assert.equal(record.classification, 'native_error'); assert.equal(record.helper.stage, 'operating_system');
  assert.equal(record.helper.exceptionType, 'System.ComponentModel.Win32Exception'); assert(isProjection(record));
  assert(!JSON.stringify(record).includes('private'));
});
test('protocol failure and arbitrary side-channel fields cannot be accepted', () => {
  assert.equal(invocation({ stdout: 'not JSON' }).classification, 'protocol_error');
  const record = receipt({ pid: 11, helperExitCode: 0, validation: 'refused', stdoutBytes: 1, stderrBytes: 0,
    stdoutSha256: 'a'.repeat(64), stderrSha256: 'b'.repeat(64), helperJson: { schemaVersion: 1, available: true, stage: 'complete', hostId: 'private-host' } });
  assert.equal(record.classification, 'protocol_error'); assert(isProjection(record));
  assert(!isProjection({ ...record, raw: 'private' }));
  assert(!isProjection({ ...record, helper: { ...record.helper, hostId: 'private' } }));
  assert(!isProjection({ ...record, transportCode: 'raw message' }));
});

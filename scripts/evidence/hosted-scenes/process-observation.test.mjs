import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observeNamespaceProcesses, browserAbsenceDecision } from './process-observation.mjs';
const stat = (pid, name, state, parent = 1, ticks = '99') => `${pid} (${name}) ${[state, parent, ...Array(17).fill('0'), ticks].join(' ')}\n`;
const sample = (name = 'chrome', state = 'S') => observeNamespaceProcesses({ list: () => ['1', '2', 'not-a-pid'], read: pid => stat(pid, pid === '1' ? 'node' : name, pid === '1' ? 'R' : state) });
test('actual stat parser retains PID, parent, state, start identity and safe name', () => {
  assert.deepEqual(sample().processes[1], { pid: 2, parent: 1, state: 'S', startTicks: '99', name: 'chrome' });
});
test('live browser observation is refused with actual matching row', () => {
  const d = browserAbsenceDecision(sample()); assert.equal(d.absent, false); assert.equal(d.status, 'LIVE_BROWSER_NAMES_OBSERVED'); assert.equal(d.matches[0].pid, 2);
});
test('zombie Chrome remains refused, never silently filtered as released', () => {
  const d = browserAbsenceDecision(sample('chrome_crashpad', 'Z')); assert.equal(d.absent, false); assert.equal(d.status, 'UNREAPED_BROWSER_NAMES_OBSERVED');
});
test('unreadable process is unknown, not proof of absence or confirmed stray', () => {
  const s = observeNamespaceProcesses({ list: () => ['2'], read: () => { throw Object.assign(Error('not retained'), { code: 'EACCES' }); } });
  assert.deepEqual(s.readErrors, [{ pid: 2, code: 'EACCES' }]); assert.equal(browserAbsenceDecision(s).status, 'OBSERVATION_INCOMPLETE'); assert.equal(browserAbsenceDecision(s).absent, false);
});
test('list failure remains closed with bounded code', () => {
  const s = observeNamespaceProcesses({ list: () => { throw Error('do not retain raw path'); } }); assert.equal(browserAbsenceDecision(s).absent, false); assert.deepEqual(s.readErrors, [{ pid: null, code: 'PROC_LIST_FAILED' }]);
});
test('raced exit is explicitly distinct from an unreadable surviving PID', () => {
  const s = observeNamespaceProcesses({ list: () => ['1', '2'], read: pid => { if (pid === '2') throw Object.assign(Error(), { code: 'ENOENT' }); return stat(pid, 'node', 'R'); } });
  assert.deepEqual(s.exitedDuringRead, [2]); assert.equal(browserAbsenceDecision(s).absent, true);
});
test('malformed process record is observation failure', () => {
  const s = observeNamespaceProcesses({ list: () => ['2'], read: () => 'bad' }); assert.equal(browserAbsenceDecision(s).absent, false);
});
test('two observations retain a transient instead of rewriting its first failure', () => {
  const first = browserAbsenceDecision(sample('chromium', 'S'));
  const later = browserAbsenceDecision(sample('esbuild', 'S'));
  assert.equal(first.absent, false); assert.equal(later.absent, true); assert.equal(first.matches.length, 1);
});
test('bounded process census refuses excessive input', () => {
  const s = observeNamespaceProcesses({ list: () => Array.from({ length: 1025 }, (_, i) => String(i + 1)), read: () => assert.fail() });
  assert.equal(browserAbsenceDecision(s).absent, false); assert.equal(s.readErrors[0].code, 'PROC_COUNT_BOUND');
});

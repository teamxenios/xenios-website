// Read-only private PID-namespace evidence. A zombie or unreadable record is
// never silently discarded or accepted as released. No signal is sent here.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
export function observeNamespaceProcesses(io = { list: () => readdirSync('/proc'), read: pid => readFileSync(`/proc/${pid}/stat`, 'utf8') }) {
  const snapshot = { processes: [], exitedDuringRead: [], readErrors: [] };
  let ids;
  try { ids = io.list().filter(n => /^\d+$/.test(n)); }
  catch (e) { snapshot.readErrors.push({ pid: null, code: /^[A-Z0-9_]+$/.test(e.code ?? '') ? e.code : 'PROC_LIST_FAILED' }); return snapshot; }
  if (ids.length > 1024) { snapshot.readErrors.push({ pid: null, code: 'PROC_COUNT_BOUND' }); return snapshot; }
  for (const id of ids) {
    const pid = Number(id);
    try {
      const raw = io.read(id), split = raw.lastIndexOf(') '), open = raw.indexOf('(');
      assert(split > open && raw.slice(0, open).trim() === id, 'PROC_STAT_SHAPE');
      const f = raw.slice(split + 2).trim().split(/\s+/);
      assert(/^[A-Z]$/.test(f[0]) && /^\d+$/.test(f[1]) && /^\d+$/.test(f[19]), 'PROC_STAT_FIELDS');
      snapshot.processes.push({ pid, parent: Number(f[1]), startTicks: f[19], state: f[0], name: raw.slice(open + 1, split).replace(/[^A-Za-z0-9_.-]/g, '?').slice(0, 80) });
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ESRCH') snapshot.exitedDuringRead.push(pid);
      else snapshot.readErrors.push({ pid, code: /^[A-Z0-9_]+$/.test(e.code ?? '') ? e.code : 'PROC_STAT_UNREADABLE' });
    }
  }
  snapshot.processes.sort((a, b) => a.pid - b.pid);
  return snapshot;
}
export function browserAbsenceDecision(snapshot) {
  if (snapshot.readErrors.length) return { status: 'OBSERVATION_INCOMPLETE', absent: false, matches: [] };
  const matches = snapshot.processes.filter(p => /chrome|chromium/.test(p.name));
  if (!matches.length) return { status: 'BROWSER_NAMES_ABSENT', absent: true, matches };
  return { status: matches.some(p => p.state !== 'Z' && p.state !== 'X') ? 'LIVE_BROWSER_NAMES_OBSERVED' : 'UNREAPED_BROWSER_NAMES_OBSERVED', absent: false, matches };
}

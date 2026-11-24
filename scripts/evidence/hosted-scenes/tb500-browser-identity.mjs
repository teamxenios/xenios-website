import assert from 'node:assert/strict';

// Exact two identities selected by Root from original83 evidence, not an
// assumption that a launcher wrapper is the process executable.
export const PINNED_BROWSER = Object.freeze({
  launcherPath: '/opt/google/chrome/google-chrome',
  launcherSha256: 'aea09d69ce7f24d5901f6bfb15dd44d0c856e793e0a498f8d8393ec7d2c308ec',
  executable: '/opt/google/chrome/chrome',
  executableSha256: '91e519ce83eac12740d54398364583b3131116055eca863d0a240d6062e84053',
  browserVersion: '157.0.8103.78',
});

export function assertPinnedOwnedBrowserIdentity(owned, before, after) {
  assert(owned && Number.isSafeInteger(owned.pid) && owned.pid>0
    && Number.isSafeInteger(owned.parentPid) && owned.parentPid>0
    && typeof owned.startTicks==='string' && /^\d+$/.test(owned.startTicks), 'OWNED_BROWSER_STAMP_MISSING');
  for (const sample of [before,after]) {
    assert(sample && typeof sample==='object', 'BROWSER_IDENTITY_SAMPLE_MISSING');
    assert.equal(sample.pid,owned.pid,'OWNED_BROWSER_PID_CHANGED');
    assert.equal(sample.parentPid,owned.parentPid,'OWNED_BROWSER_PARENT_CHANGED');
    assert.equal(sample.startTicks,owned.startTicks,'OWNED_BROWSER_START_CHANGED');
    assert(typeof sample.state==='string' && /^[A-Za-z]$/.test(sample.state)
      && !['Z','X','x'].includes(sample.state), 'OWNED_BROWSER_NOT_LIVE');
    for(const [key,value] of Object.entries(PINNED_BROWSER)) assert.equal(sample[key],value,'PINNED_BROWSER_'+key);
  }
  return {state:'PINNED_LAUNCHER_AND_OWNED_EXECUTABLE_IDENTITIES_MATCH',pid:owned.pid,startTicks:owned.startTicks};
}

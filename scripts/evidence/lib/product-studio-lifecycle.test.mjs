import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBootstrapDiagnosticFetch, createRequestLifecycle, safeFixtureTarget, DENIAL_PROBE } from './product-studio-lifecycle.mjs';
const origin = 'http://127.0.0.1:52943';
const url = origin + '/preview-backend/auth/v1/admin/users?page=1&per_page=1';
const options = { headers: { authorization: 'Bearer native-preview-service' } };
test('pre-listen diagnostic returns only the existing synthetic empty users without sockets', async () => {
  let calls = 0;
  const shim = createBootstrapDiagnosticFetch(origin, () => { calls++; throw Error('WOULD_DIAL_CLOSED_LISTENER'); });
  assert.deepEqual(await (await shim.fetch(url, options)).json(), { users: [], aud: 'authenticated', next_page: null });
  assert.equal(calls, 0); assert.equal(shim.counts.syntheticDiagnosticReads, 1);
  // The old direct path actually reaches the failing transport in this causal control.
  assert.throws(() => { calls++; throw Error('WOULD_DIAL_CLOSED_LISTENER'); }, /CLOSED_LISTENER/);
});
for (const [name, target, opts] of [
  ['wrong bearer', url, { headers: { authorization: 'Bearer not-fixture' } }],
  ['write', url, { ...options, method: 'POST' }],
  ['other page', url.replace('page=1&', 'page=2&'), options],
  ['extra query', url + '&token=private', options],
  ['fragment', url + '#private', options],
  ['body', url, { ...options, body: 'private' }],
]) test('synthetic diagnostic refuses ' + name, async () => {
  const shim = createBootstrapDiagnosticFetch(origin, () => { throw Error('UNEXPECTED_FALLBACK'); });
  await assert.rejects(shim.fetch(target, opts), /SYNTHETIC_BOOTSTRAP_CONTRACT/);
  assert.equal(shim.counts.refusedDiagnosticReads, 1);
});
test('real user verification remains outside synthetic bootstrap interception', async () => {
  const seen = []; const shim = createBootstrapDiagnosticFetch(origin, (...args) => { seen.push(args); return new Response('{}'); });
  const path = origin + '/preview-backend/auth/v1/user'; await shim.fetch(path, options);
  assert.equal(seen.length, 1); assert.equal(seen[0][0], path); assert.equal(shim.counts.syntheticDiagnosticReads, 0);
});
test('aborted synthetic diagnostic does not manufacture success', async () => {
  const shim = createBootstrapDiagnosticFetch(origin, () => assert.fail());
  await assert.rejects(shim.fetch(url, { ...options, signal: AbortSignal.abort(Error('ABORTED')) }), /ABORTED/);
});
test('lifecycle redacts off-origin, unknown paths, queries, headers and bodies', () => {
  const l = createRequestLifecycle(origin);
  l.cdp({ method: 'Network.requestWillBeSent', sessionId: 'worker:1', params: { requestId: 'r1', type: 'Fetch',
    request: { url: origin + '/api/admin/me?token=SECRET', method: 'GET', headers: { authorization: 'SECRET' }, postData: 'SECRET' } } });
  l.cdp({ method: 'Network.responseReceived', params: { requestId: 'r1', response: { url: 'https://private.invalid/SECRET', status: 200 } } });
  assert(!JSON.stringify(l.snapshot()).includes('SECRET'));
  assert.equal(safeFixtureTarget(origin + '/person/SECRET', origin).path, 'UNKNOWN_PATH_REDACTED');
});
test('earlier phase terminal events and authoritative pending IDs remain distinguishable', () => {
  const l = createRequestLifecycle(origin); l.phase('denial');
  l.cdp({ method: 'Network.loadingFinished', sessionId: 'page1', params: { requestId: 'old' } });
  l.phase('authenticated-1440');
  const page = { inflight: new Map([['new', { url: origin + '/api/admin/me', type: 'Fetch', method: 'GET',
    sessionId: 'page1', loaderId: 'loader2', generation: 0, observedAtMs: Date.now() - 10, responseRecord: { status: 200 } }]]), network: [{}], networkBoundaryViolations: [] };
  const s = l.snapshot(page); assert.equal(s.pending[0].path, '/api/admin/me'); assert.equal(s.pending[0].loader, 'loader2');
  assert.equal(s.pending[0].status, 200); assert.equal(s.events[1].phase, 'denial'); assert.equal(page.inflight.size, 1);
});
test('diagnostics explicitly disclose bounded truncation without erasing inflight state', () => {
  const l = createRequestLifecycle(origin, 8); for(let i=0;i<20;i++) l.phase('phase-' + i);
  const page = { inflight: new Map(Array.from({length:60}, (_,i) => ['r'+i, { url: origin+'/api/config' }])) };
  const s = l.snapshot(page); assert.equal(s.events.length, 8); assert.equal(s.droppedEvents, 12);
  assert.equal(s.pending.length, 48); assert.equal(s.pendingCount, 60); assert.equal(s.pendingTruncated, true); assert.equal(page.inflight.size, 60);
});
test('server finish and early close remain separate request-correlated observations', () => {
  const l = createRequestLifecycle(origin); const first = l.http('GET','/api/admin/me'); const second = l.http('GET','/api/admin/me');
  first('finish',200); first('close',200); second('close',200);
  const e=l.snapshot().events; assert.equal(e[2].request,e[0].request); assert.notEqual(e[2].request,e[4].request);
  assert.equal(e[4].event,'server-close'); assert(!e.some(row=>row.request===e[1].request&&row.event==='server-finish'));
});
test('denial probe drains actual bounded Response stream and retains refusal', async () => {
  const probe = new Function('fetch', `return (${DENIAL_PROBE});`)(async () => new Response('{"success":false}', {status:401}));
  assert.deepEqual(await probe('/synthetic'), { status:401, bodyBytes:17, bodyDrained:true });
});
test('denial probe refuses oversized response instead of silently forgiving it', async () => {
  const probe = new Function('fetch', `return (${DENIAL_PROBE});`)(async () => new Response('x'.repeat(65537), {status:401}));
  await assert.rejects(probe('/synthetic'),/DENIAL_BODY_BOUND/);
});
test('actual owner/staff integration retains guard, whole-run telemetry and original idle timeout', () => {
  const browser=readFileSync(new URL('../publication-owner-browser.mjs',import.meta.url),'utf8');
  const server=readFileSync(new URL('../../preview-publication-owner.ts',import.meta.url),'utf8');
  assert(browser.includes('navigateWholeRun(page,origin+PAGE)'));
  assert(browser.includes('return super.onMessage(message)')); assert(browser.includes('await page.settle()'));
  assert(!browser.includes('maxSettleMs:')); assert(!browser.includes('inflight.delete')); assert(!browser.includes('resetRecords:true'));
  assert(browser.indexOf('result.failureLifecycle=lifecycle.snapshot(page)') < browser.indexOf("cleanup('pageCloseConfirmed'"));
  assert(server.includes("'/preview-backend/auth/v1/user', '/__product_studio_fixture'"));
  assert(server.includes('requireAdmin: requireSupabaseAdmin')); assert(server.includes('realServiceRoleQualified: false'));
  assert(server.includes('app.use(OWNER_BASE, requireSupabaseAdmin'));
});

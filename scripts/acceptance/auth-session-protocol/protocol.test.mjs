import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { KEY, EPOCH, browser, memory, mutex, provider, client, session, deferred, tick, until, verify, login, assertCurrent, websocketFixture, subscribeFixture, withDeadline } from './fixtures.mjs';
if (process.env.XENIOS_AUTH_PROTOCOL_RECEIPT === '1') console.log('prototype-worker:' + JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));

const root = path.dirname(fileURLToPath(import.meta.url));
const { sandbox } = JSON.parse(fs.readFileSync(path.join(root, '.sandbox/latest.json')));
if (!fs.realpathSync(sandbox).startsWith(fs.realpathSync(path.join(root, '.sandbox')) + path.sep)) throw new Error('UNOWNED_FIXTURE_SANDBOX');
const manifest = JSON.parse(fs.readFileSync(path.join(sandbox, 'manifest.json')));
assert.equal(manifest.sdkVersion, '2.108.2');
assert.equal(manifest.schema, 'xenios-auth-protocol-build-v2', 'new source requires a fresh isolated build');
for (const input of manifest.prototypeInputs) {
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, input.path))).digest('hex'), input.sha256, 'prototype source differs from built artifact input');
}
for (const output of manifest.outputs) {
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(sandbox, output.path))).digest('hex'), output.sha256, 'public SDK artifact digest mismatch');
}
const requireOwned = createRequire(path.join(sandbox, 'fixture-loader.cjs'));
const entries = {
  cjs: requireOwned('@supabase/supabase-js'),
  esm: await import(pathToFileURL(path.join(sandbox, 'node_modules/@supabase/supabase-js/dist/index.mjs')).href),
};
const same = (actual, expected, message) => assert.ok(actual === expected, message);

for (const [entry, sdk] of Object.entries(entries)) {
  const scenario = (name, fn, options = {}) => test(`${entry}: ${name}`, { concurrency: false, timeout: options.timeout ?? 7000 }, async () => {
    const environment = browser(); const opened = [];
    const open = async (...args) => { const created = await client(sdk, ...args); opened.push(created); return created; };
    try { await fn({ open, environment, sdk }); }
    finally { for (const created of opened.reverse()) await created.dispose(); environment.restore(); }
  });

  for (const operation of ['mfa', 'refresh']) for (const stage of ['fetch', 'json']) for (const transition of ['B', 'signout', 'same-subject']) {
    scenario(`held ${operation}/${stage} cannot overwrite committed ${transition}`, async ({ open }) => {
      const store = memory(); const lock = mutex(); const transport = provider();
      const a = await open(store, lock, transport); const b = await open(store, lock);
      transport.reply = operation === 'mfa' ? session('A-mfa', 'A', 'aal2') : session('A-refresh', 'A');
      const held = transport.block(call => operation === 'mfa' ? call.path.endsWith('/verify') : call.grant === 'refresh_token', stage);
      const pending = operation === 'mfa' ? verify(a.auth) : a.auth.refreshSession();
      await (stage === 'json' ? held.jsonReached.promise : held.reached.promise);
      if (transition === 'signout') await b.auth.signOut({ scope: 'local' });
      else {
        b.transport.reply = transition === 'same-subject' ? session('A-new-session', 'A') : session('B');
        same((await login(b.auth)).error, null, 'new login commits');
      }
      const current = store.read(); const before = a.events.length; const realtimeBefore = a.realtime.accessTokenValue;
      held.release.resolve(); const result = await pending; await tick();
      assert.ok(result.error, 'old caller receives discarded/error result');
      same(store.read().revision, current.revision, 'old operation adds no commit');
      assertCurrent(store, current.session);
      assert.ok(!a.events.slice(before).some(event => ['MFA_CHALLENGE_VERIFIED', 'TOKEN_REFRESHED'].includes(event.event)), 'old success never delivered');
      same(a.realtime.accessTokenValue, realtimeBefore, 'old result cannot actuate raw Supabase Realtime subscriber');
      let admitted = false;
      same(await a.auth.consumeSessionResult(result, () => { admitted = true; }), false, 'stale caller continuation denied');
      same(admitted, false);
    });
  }

  scenario('normal MFA then refresh retains real SDK behavior and current continuation', async ({ open }) => {
    const store = memory(); const a = await open(store, mutex());
    const verified = await verify(a.auth);
    same(verified.error, null); assertCurrent(store, session('A-mfa', 'A', 'aal2'));
    let admitted = false;
    same(await a.auth.consumeSessionResult(verified, () => { admitted = true; }), true); same(admitted, true);
    const aal = await a.auth.mfa.getAuthenticatorAssuranceLevel();
    same(aal.data.currentLevel, 'aal2', 'actual SDK currentLevel remains decisive');
    a.transport.reply = session('A-refresh', 'A', 'aal2');
    same((await a.auth.refreshSession()).error, null);
    assert.ok(a.events.some(item => item.event === 'MFA_CHALLENGE_VERIFIED'));
    assert.ok(a.events.some(item => item.event === 'TOKEN_REFRESHED'));
    await until(() => a.realtime.accessTokenValue === store.read().session.access_token);
  });

  for (const expiry of ['proactive', 'expired']) for (const failure of ['retryable', 'nonretryable']) {
    scenario(`${expiry} getSession refresh ${failure} failure preserves SDK cleanup semantics`, async ({ open }) => {
      // Use intentional fixture deadlines; neither SDK clocks nor retry/backoff
      // methods are replaced. A 503 runs the real bounded SDK retry policy.
      const expiresAt = Math.floor(Date.now() / 1000) + (expiry === 'proactive' ? 75 : -60);
      const initial = session('refresh-error-A', 'A', 'aal1', { expiresAt });
      const store = memory(initial); const a = await open(store, mutex());
      a.transport.refreshFailure = failure;
      const before = a.events.length;
      const result = await a.auth.getSession();
      const refreshCalls = a.transport.calls.filter(call => call.grant === 'refresh_token');
      assert.ok(refreshCalls.length > 0, 'public getSession reaches actual refresh provider path');
      if (failure === 'retryable') assert.ok(refreshCalls.length > 1, 'real SDK retry/backoff ran');
      if (expiry === 'proactive') {
        same(result.error, null, 'current usable access token survives proactive failure');
        same(result.data.session?.access_token, initial.access_token);
      } else {
        assert.ok(result.error, 'expired access token is not returned as usable');
        same(result.data.session, null);
        if (failure === 'retryable') same(result.error.name, 'AuthRetryableFetchError');
      }
      const revoked = expiry === 'expired' && failure === 'nonretryable';
      assertCurrent(store, revoked ? null : initial);
      same(store.read().revision, revoked ? '1' : '0', 'only definitive expired rejection creates tombstone');
      same(a.events.slice(before).filter(event => event.event === 'SIGNED_OUT').length, revoked ? 1 : 0);
      same(store.counts.remove, 0, 'cleanup remains one canonical commit without raw removals');
      if (!revoked) {
        await a.auth.getSession();
        same(a.transport.calls.filter(call => call.grant === 'refresh_token').length, refreshCalls.length, 'serial failure uses revision/token cooldown');
      }
    }, { timeout: failure === 'retryable' ? 45000 : 7000 });
  }

  scenario('explicit proactive refresh reports nonretryable failure while preserving current valid session', async ({ open }) => {
    const initial = session('explicit-refresh-A', 'A', 'aal1', { expiresAt: Math.floor(Date.now() / 1000) + 75 });
    const store = memory(initial); const a = await open(store, mutex()); a.transport.refreshFailure = 'nonretryable';
    const result = await a.auth.refreshSession();
    assert.ok(result.error, 'explicit refresh failure is not masked by proactive getSession fallback');
    same(result.data.session, null); assertCurrent(store, initial); same(store.read().revision, '0');
    assert.ok(a.transport.calls.some(call => call.grant === 'refresh_token'));
  });

  for (const method of ['getSession', 'refreshSession']) {
    scenario(`concurrent public ${method} calls share one original revision refresh`, async ({ open }) => {
      const initial = session('cohort-A', 'A', 'aal1', { expiresAt: Math.floor(Date.now() / 1000) + (method === 'getSession' ? 75 : 3600) });
      const store = memory(initial); const a = await open(store, mutex());
      const held = a.transport.block(call => call.grant === 'refresh_token');
      const first = a.auth[method](); await held.reached.promise;
      const second = a.auth[method](); const third = a.auth[method](); await tick(); await tick();
      same(a.transport.calls.filter(call => call.grant === 'refresh_token').length, 1, 'one provider operation before commit');
      held.release.resolve(); const results = await Promise.all([first, second, third]);
      assert.ok(results.every(result => result.error === null), 'the explicit cohort shares its actual committed result');
      same(a.transport.calls.filter(call => call.grant === 'refresh_token').length, 1);
      same(store.read().revision, '1');
      assert.ok(results.every(result => result.data.session.access_token === store.read().session.access_token));
    });
  }

  scenario('old pending refresh neither blocks B refresh nor clears its flight', async ({ open }) => {
    const store = memory(); const lock = mutex(); const a = await open(store, lock); const b = await open(store, lock);
    const heldA = a.transport.block(call => call.grant === 'refresh_token');
    const pendingA = a.auth.refreshSession(); await heldA.reached.promise;
    await login(b.auth);
    b.transport.reply = session('B-refresh', 'B');
    const heldB = b.transport.block(call => call.grant === 'refresh_token');
    const pendingB = b.auth.refreshSession(); await heldB.reached.promise;
    heldA.release.resolve(); assert.ok((await pendingA).error);
    heldB.release.resolve(); same((await pendingB).error, null); assertCurrent(store, session('B-refresh', 'B'));
  });

  scenario('two clients cannot issue parallel provider refresh for the same original revision', async ({ open }) => {
    const store = memory(), lock = mutex(); const a = await open(store, lock); const b = await open(store, lock);
    const held = a.transport.block(call => call.grant === 'refresh_token');
    const first = a.auth.refreshSession(); await held.reached.promise; const second = b.auth.refreshSession(); await tick(); await tick();
    same(b.transport.calls.filter(call => call.grant === 'refresh_token').length, 0, 'same-revision cross-tab work waits outside provider');
    held.release.resolve(); same((await first).error, null); assert.ok((await second).error, 'queued old tab is discarded after the first actual commit');
    same(b.transport.calls.filter(call => call.grant === 'refresh_token').length, 0);
    assertCurrent(store, session('A-refresh'));
  });

  scenario('post-commit reentrant refresh does not join its unresolved outer flight', async ({ open }) => {
    const store = memory(); const a = await open(store, mutex()); let nested; let fired = false;
    a.auth.onAuthStateChange(event => {
      if (event === 'TOKEN_REFRESHED' && !fired) { fired = true; nested = a.auth.refreshSession(); }
    });
    const outer = await a.auth.refreshSession();
    assert.ok(outer.error === null || outer.error.code === 'session_transition_discarded');
    await until(() => Boolean(nested)); same((await nested).error, null);
    same(a.transport.calls.filter(call => call.grant === 'refresh_token').length, 2);
    same(store.read().revision, '2');
  });

  scenario('failure cooldown for A cannot suppress a new B revision and token', async ({ open }) => {
    const initial = session('cooldown-A', 'A', 'aal1', { expiresAt: Math.floor(Date.now() / 1000) + 75 });
    const store = memory(initial); const a = await open(store, mutex());
    a.transport.refreshFailure = 'nonretryable'; same((await a.auth.getSession()).error, null);
    same((await a.auth.getSession()).error, null);
    same(a.transport.calls.filter(call => call.grant === 'refresh_token').length, 1);
    a.transport.reply = session('cooldown-B', 'B', 'aal1', { expiresAt: Math.floor(Date.now() / 1000) + 75 });
    await login(a.auth); a.transport.refreshFailure = null; a.transport.reply = session('B-refresh', 'B');
    same((await a.auth.getSession()).error, null);
    same(a.transport.calls.filter(call => call.grant === 'refresh_token').length, 2);
    assertCurrent(store, session('B-refresh', 'B'));
  });

  scenario('stale completed caller result cannot admit after B commit', async ({ open }) => {
    const store = memory(); const lock = mutex(); const a = await open(store, lock); const b = await open(store, lock);
    const completed = await a.auth.getSession(); same(completed.error, null);
    await login(b.auth);
    same(await a.auth.consumeSessionResult(completed, () => assert.fail('stale admission')), false);
  });

  scenario('fresh initial read rejects a captured delayed storage snapshot', async ({ open }) => {
    const store = memory(); const lock = mutex(); const a = await open(store, lock); const b = await open(store, lock);
    const held = deferred(); const reached = deferred(); let once = true;
    store.hooks.get = async key => { if (key === KEY && once) { once = false; reached.resolve(); await held.promise; } };
    const pending = a.auth.getSession(); await reached.promise; await login(b.auth); held.resolve();
    const result = await pending; assert.ok(result.error); same(result.data.session, null);
  });

  scenario('stale verifier cleanup cannot touch a newer canonical envelope', async ({ open }) => {
    const store = memory(); const lock = mutex(); const a = await open(store, lock); const b = await open(store, lock);
    const held = a.transport.block(call => call.path.endsWith('/verify'), 'json');
    const pending = verify(a.auth); await held.jsonReached.promise; await login(b.auth);
    const writes = store.counts.set, removes = store.counts.remove;
    held.release.resolve(); await pending;
    same(store.counts.set, writes); same(store.counts.remove, removes, 'no post-hoc verifier/session cleanup');
  });

  scenario('commit rejection emits no success and does not roll back storage', async ({ open }) => {
    const store = memory(); const a = await open(store, mutex()); const before = a.events.length;
    store.hooks.set = async () => { throw new Error('SYNTHETIC_WRITE_REJECTED'); };
    const result = await verify(a.auth); assert.ok(result.error); same(store.read().revision, '0');
    assert.ok(!a.events.slice(before).some(event => event.event === 'MFA_CHALLENGE_VERIFIED'));
    same(a.auth.getSessionProtocolCapability().available, false, 'uncertain writer suspends');
  });

  scenario('held storage commit is linearized before a waiting B commit', async ({ open }) => {
    const store = memory(); const lock = mutex(); const a = await open(store, lock); const b = await open(store, lock);
    const release = deferred(), reached = deferred(); let once = true;
    store.hooks.set = async () => { if (once) { once = false; reached.resolve(); await release.promise; } };
    const pendingA = verify(a.auth); await reached.promise;
    const pendingB = login(b.auth); await tick(); same(store.read().revision, '0');
    release.resolve(); await pendingA; const resultB = await pendingB;
    // B observed revision 0 while A was pending and must explicitly retry;
    // pending intent is not entitled to silently supersede a committed A.
    assert.ok(resultB.error, 'old B snapshot fails CAS rather than rebasing');
    same((await login(b.auth)).error, null); assertCurrent(store, session('B'));
  });

  scenario('reordered broadcasts re-read current canonical state', async ({ open, environment }) => {
    const store = memory(); const lock = mutex(); const a = await open(store, lock); const b = await open(store, lock);
    await login(a.auth, 'A2'); const old = environment.channels[0].messages.at(-1);
    await login(b.auth); const latest = environment.channels[1].messages.at(-1);
    const before = a.events.length;
    await environment.channels[0].deliver(latest); await environment.channels[0].deliver(old); await tick();
    const received = a.events.slice(before);
    assert.ok(received.some(event => event.session?.access_token === session('B').access_token));
    assert.ok(!received.some(event => event.session?.access_token === session('A2').access_token));
  });

  scenario('observer throw and reentrant transition cannot revoke committed MFA', async ({ open }) => {
    const store = memory(); const a = await open(store, mutex()); let reentrant;
    a.auth.onAuthStateChange((event) => { if (event === 'MFA_CHALLENGE_VERIFIED') { reentrant = login(a.auth, 'B'); throw new Error('SYNTHETIC_OBSERVER_THROW'); } });
    const verified = await verify(a.auth); assert.ok(!verified.error || verified.error.code === 'session_transition_discarded');
    await until(() => Boolean(reentrant)); await reentrant; await tick();
    assertCurrent(store, session('B')); assert.ok(a.observerErrors.length > 0);
    same(store.counts.remove, 0, 'observer exception never triggers revocation');
  });

  scenario('async observer continuation consumes its original committed revision', async ({ open }) => {
    const store = memory(); const a = await open(store, mutex()); const release = deferred(); const finished = deferred();
    let admitted = false;
    a.auth.onAuthStateChange(async (event, _current, ticket) => {
      if (event !== 'MFA_CHALLENGE_VERIFIED') return;
      await release.promise;
      const accepted = await a.auth.consumeSessionTicket(ticket, () => { admitted = true; });
      finished.resolve(accepted);
      throw new Error('SYNTHETIC_ASYNC_OBSERVER_THROW');
    });
    same((await verify(a.auth)).error, null); await login(a.auth); release.resolve();
    same(await finished.promise, false); same(admitted, false); await tick(); assert.ok(a.observerErrors.length > 0);
  });

  scenario('recovery is denied immediately; exact-instance cleanup cannot clear B', async ({ open }) => {
    const store = memory(); const lock = mutex(); const a = await open(store, lock); const b = await open(store, lock);
    const before = await a.auth.getSession();
    const release = deferred(), reached = deferred(); let once = true;
    store.hooks.get = async key => { if (key === KEY && once) { once = false; reached.resolve(); await release.promise; } };
    const cleanup = a.auth.requestRecoveryCleanup(session().access_token, before);
    const denied = a.auth.consumeSessionResult(before, () => assert.fail('recovery admission'));
    await reached.promise; await login(b.auth); release.resolve();
    same(await denied, false); assert.ok((await cleanup).error); assertCurrent(store, session('B'));
  });

  scenario('recovery cleanup lock failure leaves purpose denied and never clears', async ({ open }) => {
    const store = memory(); const lock = mutex(); const a = await open(store, lock); const before = await a.auth.getSession();
    lock.fail = true; assert.ok((await a.auth.requestRecoveryCleanup(session().access_token, before)).error);
    same(await a.auth.consumeSessionResult(before, () => assert.fail('recovery admission')), false);
    assertCurrent(store, session()); same(store.counts.remove, 0);
  });

  scenario('recovery cleanup rejects newer ordinary revision with the same token after delayed sampling', async ({ open }) => {
    const initial = session(); const store = memory(initial); const lock = mutex();
    const a = await open(store, lock); const b = await open(store, lock); const original = await a.auth.getSession();
    const reached = deferred(), release = deferred(); let once = true;
    store.hooks.beforeGet = async key => { if (key === KEY && once) { once = false; reached.resolve(); await release.promise; } };
    const cleanup = a.auth.requestRecoveryCleanup(initial.access_token, original);
    await reached.promise; b.transport.reply = initial; same((await login(b.auth)).error, null);
    same(store.read().revision, '1'); release.resolve();
    assert.ok((await cleanup).error, 'original opaque revision cannot adopt same-token newer commit');
    assertCurrent(store, initial); same(store.read().revision, '1'); same(store.counts.remove, 0);
  });

  scenario('recovery cleanup requires original opaque snapshot and can clear its exact current instance', async ({ open }) => {
    const store = memory(); const a = await open(store, mutex()); const original = await a.auth.getSession();
    assert.ok((await a.auth.requestRecoveryCleanup(session().access_token, JSON.parse(JSON.stringify(original.sessionProtocol)))).error);
    same(store.read().revision, '0');
    same((await a.auth.requestRecoveryCleanup(session().access_token, original)).error, null);
    assertCurrent(store, null); same(store.read().revision, '1'); same(store.counts.remove, 0);
  });

  scenario('canonical recovery purpose denies other tabs MFA and ordinary continuations', async ({ open }) => {
    const store = memory(); const value = store.read(); value.purpose = 'recovery'; store.map.set(KEY, JSON.stringify(value));
    const a = await open(store, mutex());
    const result = await a.auth.getSession(); same(result.purposeDenied, true);
    same(await a.auth.consumeSessionResult(result, () => assert.fail('ordinary admission')), false);
    assert.ok((await verify(a.auth)).error); same(a.transport.calls.length, 0);
    assert.ok(a.events.filter(event => event.event === 'INITIAL_SESSION').every(event => event.session === null));
  });

  scenario('implicit recovery denies ordinary access before initialization finishes', async ({ open, environment }) => {
    const store = memory(); const transport = provider(); const recovery = session('recovery-A', 'A');
    environment.window.location = new URL('https://fixture.invalid/#' + new URLSearchParams({
      ...Object.fromEntries(['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type'].map(key => [key, String(recovery[key])])), type: 'recovery',
    }));
    const a = await open(store, mutex(), transport, { deferInitialize: true, detectSessionInUrl: true });
    const held = transport.block(call => call.path.endsWith('/user'), 'json');
    const pending = a.auth.initialize(); await held.jsonReached.promise;
    // This call is synchronous in its purpose-denial decision, regardless of
    // whether any cross-tab lock/storage cleanup has completed.
    same(await a.auth.consumeSessionResult({}, () => assert.fail('recovery admitted')), false);
    held.release.resolve(); same((await pending).error, null); same(store.read().purpose, 'recovery');
    await environment.flushTimers();
    assert.ok(a.events.some(event => event.event === 'PASSWORD_RECOVERY'));
    assert.ok(!a.events.some(event => event.event === 'SIGNED_IN'));
    same((await a.auth.getSession()).purposeDenied, true);
  });

  scenario('legacy writer and unversioned broadcast suspend instead of adopting', async ({ open, environment }) => {
    const store = memory(); const a = await open(store, mutex());
    await environment.channels[0].deliver({ event: 'SIGNED_IN', session: session('B') });
    same(a.auth.getSessionProtocolCapability().available, false);
    assert.ok((await a.auth.getSession()).error);
    const second = memory(); const b = await open(second, mutex()); second.map.set(KEY, JSON.stringify(session('legacy')));
    assert.ok((await b.auth.getSession()).error); same(b.auth.getSessionProtocolCapability().available, false);
  });

  scenario('legacy custom SDK lock is refused before provider work', async () => {
    const store = memory(); const p = provider();
    const c = sdk.createClient('https://fixture.invalid', 'fixture-anon-key', { global: { fetch: p.fetch },
      auth: { storage: store, storageKey: KEY, skipAutoInitialize: true, autoRefreshToken: false, lock: async (_name, _timeout, work) => work() },
      realtime: { transport: class FixtureWebSocket {} } });
    assert.throws(() => c.auth.configureSessionCoordination({ rolloutBarrier: true, epoch: EPOCH, lock: mutex() }));
    same(p.calls.length, 0);
  });

  scenario('held implicit initialization cannot overwrite another tab B', async ({ open, environment }) => {
    const store = memory(); const lock = mutex(); const transport = provider();
    const a = await open(store, lock, transport, { deferInitialize: true, detectSessionInUrl: true });
    const implicit = session('implicit-A', 'A'); transport.users.set(implicit.access_token, implicit.user);
    // URL contains only the explicit implicit-grant fields, never a user object.
    environment.window.location = new URL('https://fixture.invalid/#' + new URLSearchParams(Object.fromEntries(['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type'].map(key => [key, String(implicit[key])]))));
    const held = transport.block(call => call.path.endsWith('/user'), 'json');
    const initializing = a.auth.initialize(); await held.jsonReached.promise;
    environment.window.location = new URL('https://fixture.invalid/');
    const b = await open(store, lock); await login(b.auth); held.release.resolve();
    assert.ok((await initializing).error); await environment.flushTimers(); assertCurrent(store, session('B'));
    assert.ok(!a.events.some(event => event.session?.access_token === implicit.access_token));
  });

  scenario('deferred initialization event is fenced after B commit', async ({ open, environment }) => {
    const store = memory(); const lock = mutex(); const transport = provider();
    const a = await open(store, lock, transport, { deferInitialize: true, detectSessionInUrl: true });
    const implicit = session('implicit-A', 'A'); transport.users.set(implicit.access_token, implicit.user);
    environment.window.location = new URL('https://fixture.invalid/#' + new URLSearchParams(Object.fromEntries(['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type'].map(key => [key, String(implicit[key])]))));
    same((await a.auth.initialize()).error, null);
    environment.window.location = new URL('https://fixture.invalid/'); const b = await open(store, lock); await login(b.auth);
    const before = a.events.length; await environment.flushTimers();
    assert.ok(!a.events.slice(before).some(event => event.session?.access_token === implicit.access_token));
    assertCurrent(store, session('B'));
  });

  scenario('Realtime late token and stale auth promise cannot undo B', async ({ open }) => {
    const store = memory(); const a = await open(store, mutex());
    const heldA = deferred(), heldB = deferred(); let requests = 0;
    const realtime = new sdk.RealtimeClient('wss://fixture.invalid/realtime/v1', {
      transport: class FixtureWebSocket {},
      accessToken: () => (++requests === 1 ? heldA.promise : heldB.promise),
      sessionProtocolBoundary: a.realtime.getSessionProtocolBoundary(),
    });
    const channel = realtime.channel('fixture');
    const pendingA = realtime.setAuth(); await until(() => requests === 1);
    await login(a.auth); const pendingB = realtime.setAuth(); await until(() => requests === 2);
    heldA.resolve(session().access_token); await pendingA;
    same(realtime.accessTokenValue, null, 'old token cannot mutate final state');
    assert.ok(realtime._authPromise, 'old finally preserves newer pending Auth promise');
    heldB.resolve(session('B').access_token); await pendingB;
    same(realtime.accessTokenValue, session('B').access_token);
    same(channel.joinPush.payload().access_token, session('B').access_token, 'real channel receives only current join token');
    same(realtime._authPromise, null);
  });

  scenario('normal public subscribe websocket send and HTTP send use current authenticated frame', async ({ open }) => {
    const wire = websocketFixture(); const a = await open(memory(), mutex(), provider(), { realtime: { transport: wire.FakeWebSocket, vsn: '1.0.0' } });
    const joined = await subscribeFixture(a, wire);
    same(joined.join.payload.access_token, session().access_token);
    same(await joined.channel.send({ type: 'broadcast', event: 'fixture', payload: { synthetic: true } }), 'ok');
    await until(() => wire.packets(joined.socket).some(packet => packet.event === 'broadcast'));
    same((await joined.channel.httpSend('fixture', { synthetic: true })).success, true);
    same(a.transport.calls.filter(call => call.path.startsWith('/realtime/v1/api/broadcast')).at(-1).authorization, 'Bearer ' + session().access_token);
  });

  scenario('ordinary ACK-required broadcast settles successfully after current server ACK', async ({ open }) => {
    const wire = websocketFixture(); const a = await open(memory(), mutex(), provider(), { realtime: { transport: wire.FakeWebSocket, vsn: '1.0.0' } });
    const joined = await subscribeFixture(a, wire, 'ack-success', true, { broadcast: { ack: true } });
    let settlements = 0;
    const pending = joined.channel.send({ type: 'broadcast', event: 'fixture', payload: { synthetic: true } }).then(value => { settlements++; return value; });
    await until(() => wire.packets(joined.socket).some(packet => packet.event === 'broadcast'));
    same(settlements, 0, 'ack=true must actually await its server result');
    const sent = wire.packets(joined.socket).filter(packet => packet.event === 'broadcast').at(-1);
    wire.reply(joined.socket, sent); same(await withDeadline(pending), 'ok'); same(settlements, 1);
    wire.reply(joined.socket, sent); await tick(); same(settlements, 1);
  });

  for (const transition of ['replacement', 'signout']) {
    scenario(`in-flight ACK-required send settles once when ${transition} retires its frame`, async ({ open, environment }) => {
      const wire = websocketFixture(); const a = await open(memory(), mutex(), provider(), { realtime: { transport: wire.FakeWebSocket, vsn: '1.0.0' } });
      const joined = await subscribeFixture(a, wire, 'ack-retire-' + transition, true, { broadcast: { ack: true } });
      environment.holdTimerDelays.add(9876); let settlements = 0;
      const pending = joined.channel.send({ type: 'broadcast', event: 'held-ack', payload: { synthetic: true } }, { timeout: 9876 })
        .then(value => { settlements++; return value; });
      await until(() => wire.packets(joined.socket).some(packet => packet.event === 'broadcast'));
      const sent = wire.packets(joined.socket).filter(packet => packet.event === 'broadcast').at(-1);
      same(settlements, 0); const sentBefore = joined.socket.sent.length;
      if (transition === 'replacement') same((await login(a.auth)).error, null);
      else same((await a.auth.signOut({ scope: 'local' })).error, null);
      same(await withDeadline(pending), 'error', 'retirement must not leave the public send promise pending');
      same(settlements, 1); wire.reply(joined.socket, sent, 'ok', { syntheticLateAck: true });
      await environment.flushHeldTimers(); await tick();
      same(settlements, 1); same(joined.socket.sent.length, sentBefore, 'no old payload resend');
    });
  }

  scenario('stale local ACK timeout settles even when data admission and broadcast delivery are delayed', async ({ open, environment }) => {
    const store = memory(), lock = mutex(), wire = websocketFixture();
    const a = await open(store, lock, provider(), { realtime: { transport: wire.FakeWebSocket, vsn: '1.0.0' } }); const b = await open(store, lock);
    const joined = await subscribeFixture(a, wire, 'ack-timeout', true, { broadcast: { ack: true } });
    environment.holdTimerDelays.add(9877);
    const pending = joined.channel.send({ type: 'broadcast', event: 'held-ack', payload: { synthetic: true } }, { timeout: 9877 });
    await until(() => wire.packets(joined.socket).some(packet => packet.event === 'broadcast'));
    const sent = wire.packets(joined.socket).filter(packet => packet.event === 'broadcast').at(-1);
    const sentBefore = joined.socket.sent.length; await login(b.auth);
    // No B BroadcastChannel notification is delivered to A, so the old cache
    // and channel remain. Its local terminal timer must bypass data admission.
    assert.ok(environment.heldTimers.length > 0); await environment.flushHeldTimers();
    same(await withDeadline(pending), 'timed out'); wire.reply(joined.socket, sent); await tick();
    same(joined.socket.sent.length, sentBefore); assertCurrent(store, session('B'));
  });

  scenario('stable anonymous public channel works while anonymous private admission is refused', async ({ open }) => {
    const wire = websocketFixture(); const a = await open(memory(null), mutex(), provider(), { realtime: { transport: wire.FakeWebSocket, vsn: '1.0.0' } });
    const joined = await subscribeFixture(a, wire, 'public-fixture', false);
    same(joined.join.payload.access_token, 'fixture-anon-key');
    same(await joined.channel.send({ type: 'broadcast', event: 'fixture', payload: { synthetic: true } }), 'ok');
    same((await joined.channel.httpSend('fixture', { synthetic: true })).success, true);
    const statuses = []; a.instance.channel('private-fixture', { config: { private: true } }).subscribe(status => statuses.push(status));
    await until(() => statuses.includes('CHANNEL_ERROR'));
    assert.ok(!wire.packets(joined.socket).some(packet => packet.topic === 'realtime:private-fixture'));
  });

  scenario('bound private sends cannot fall back to anonymous or stale cached bearer after signout', async ({ open }) => {
    const store = memory(), lock = mutex(), wire = websocketFixture();
    const a = await open(store, lock, provider(), { realtime: { transport: wire.FakeWebSocket, vsn: '1.0.0' } }); const b = await open(store, lock);
    const joined = await subscribeFixture(a, wire); await b.auth.signOut({ scope: 'local' });
    const before = joined.socket.sent.length; const httpBefore = a.transport.calls.length;
    same(await joined.channel.send({ type: 'broadcast', event: 'stale', payload: { synthetic: true } }), 'error');
    await assert.rejects(joined.channel.httpSend('stale', { synthetic: true })); await tick();
    same(joined.socket.sent.length, before); same(a.transport.calls.length, httpBefore);
    same(a.realtime.accessTokenValue, session().access_token, 'deliberately stale cache is not transport authority');
  });

  scenario('queued disconnected A join cannot flush after B commits', async ({ open }) => {
    const store = memory(), lock = mutex(), wire = websocketFixture();
    const a = await open(store, lock, provider(), { realtime: { transport: wire.FakeWebSocket, vsn: '1.0.0' } }); const b = await open(store, lock);
    a.instance.channel('queued-fixture', { config: { private: true } }).subscribe();
    await until(() => wire.sockets.length === 1 && a.realtime.sendBuffer.length > 0);
    await login(b.auth); wire.sockets[0].open(); await tick(); await tick();
    assert.ok(!wire.packets(wire.sockets[0]).some(packet => packet.payload?.access_token === session().access_token));
  });

  scenario('delayed encoder A cannot write after B even on the same physical socket', async ({ open }) => {
    const store = memory(), lock = mutex(), wire = websocketFixture(); const reached = deferred(); let encoded;
    const a = await open(store, lock, provider(), { realtime: { transport: wire.FakeWebSocket, vsn: '1.0.0',
      encode: (data, callback) => { encoded = () => callback(JSON.stringify(data)); reached.resolve(); } } }); const b = await open(store, lock);
    a.instance.channel('encode-fixture', { config: { private: true } }).subscribe();
    await until(() => wire.sockets.length === 1); wire.sockets[0].open(); await reached.promise;
    await login(b.auth); encoded(); await tick(); await tick(); same(wire.sockets[0].sent.length, 0);
  });

  scenario('A HTTP work cannot rebase through a delayed getSession read onto B', async ({ open }) => {
    const store = memory(), lock = mutex(), wire = websocketFixture();
    const a = await open(store, lock, provider(), { realtime: { transport: wire.FakeWebSocket, vsn: '1.0.0' } }); const b = await open(store, lock);
    const joined = await subscribeFixture(a, wire); let reads = 0; const reached = deferred(), release = deferred();
    store.hooks.beforeGet = async key => { if (key === KEY && ++reads === 3) { reached.resolve(); await release.promise; } };
    const pending = joined.channel.httpSend('held-http', { synthetic: true });
    const rejected = assert.rejects(pending); await reached.promise; await login(b.auth); release.resolve(); await rejected;
    same(a.transport.calls.filter(call => call.path.startsWith('/realtime/v1/api/broadcast')).length, 0);
  });

  scenario('normal refresh retires old channels and requires a fresh current join', async ({ open }) => {
    const store = memory(), wire = websocketFixture();
    const a = await open(store, mutex(), provider(), { realtime: { transport: wire.FakeWebSocket, vsn: '1.0.0' } });
    const old = await subscribeFixture(a, wire, 'refresh-fixture'); same((await a.auth.refreshSession()).error, null);
    await until(() => a.instance.getChannels().length === 0 && old.socket.readyState === 3);
    same(await old.channel.send({ type: 'broadcast', event: 'stale', payload: { synthetic: true } }), 'error');
    const current = await subscribeFixture(a, wire, 'refresh-fixture');
    assert.notEqual(current.channel, old.channel); assert.notEqual(current.socket, old.socket);
    same(current.join.payload.access_token, store.read().session.access_token);
    same(await current.channel.send({ type: 'broadcast', event: 'current', payload: { synthetic: true } }), 'ok');
  });

  scenario('delayed old connection decode cannot deliver into a fresh B subscription', async ({ open }) => {
    const store = memory(), wire = websocketFixture(); let finishOldDecode; const reached = deferred();
    const a = await open(store, mutex(), provider(), { realtime: { transport: wire.FakeWebSocket, vsn: '1.0.0',
      decode: (data, callback) => { const message = JSON.parse(data); if (message.event === 'broadcast') { finishOldDecode = () => callback(message); reached.resolve(); } else callback(message); } } });
    const old = await subscribeFixture(a, wire, 'decode-fixture'); let delivered = 0;
    old.socket.message(JSON.stringify({ topic: old.channel.topic, event: 'broadcast', payload: { type: 'broadcast', event: 'fixture', payload: { synthetic: true } } }));
    await reached.promise; await login(a.auth); await until(() => old.socket.readyState === 3);
    const currentChannel = a.instance.channel('decode-fixture', { config: { private: true } }).on('broadcast', { event: 'fixture' }, () => { delivered++; });
    const statuses = []; currentChannel.subscribe(status => statuses.push(status));
    await until(() => wire.sockets.length === 2); wire.sockets[1].open();
    await until(() => wire.packets(wire.sockets[1]).some(packet => packet.event === 'phx_join')); wire.acknowledge(wire.sockets[1]);
    await until(() => statuses.includes('SUBSCRIBED')); finishOldDecode(); await tick(); same(delivered, 0);
  });

  scenario('scheduled A automatic rejoin retains A frame after B commits', async ({ open, environment }) => {
    const store = memory(), lock = mutex(), wire = websocketFixture();
    const a = await open(store, lock, provider(), { realtime: { transport: wire.FakeWebSocket, vsn: '1.0.0' } }); const b = await open(store, lock);
    const joined = await subscribeFixture(a, wire); environment.holdTimerDelays.add(1000); joined.socket.error();
    await until(() => environment.heldTimers.length > 0); const before = joined.socket.sent.length;
    await login(b.auth); await environment.flushHeldTimers(); await tick(); same(joined.socket.sent.length, before);
  });
}

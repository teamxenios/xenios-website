import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KEY, EPOCH, browser, memory, mutex, provider, client, session, deferred, tick, until, verify, login, assertCurrent } from './fixtures.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const { sandbox } = JSON.parse(fs.readFileSync(path.join(root, '.sandbox/latest.json')));
if (!fs.realpathSync(sandbox).startsWith(fs.realpathSync(path.join(root, '.sandbox')) + path.sep)) throw new Error('UNOWNED_FIXTURE_SANDBOX');
const manifest = JSON.parse(fs.readFileSync(path.join(sandbox, 'manifest.json')));
assert.equal(manifest.sdkVersion, '2.108.2');
const requireOwned = createRequire(path.join(sandbox, 'fixture-loader.cjs'));
const entries = {
  cjs: requireOwned('@supabase/supabase-js'),
  esm: await import(pathToFileURL(path.join(sandbox, 'node_modules/@supabase/supabase-js/dist/index.mjs')).href),
};
const same = (actual, expected, message) => assert.ok(actual === expected, message);

for (const [entry, sdk] of Object.entries(entries)) {
  const scenario = (name, fn) => test(`${entry}: ${name}`, { concurrency: false, timeout: 7000 }, async () => {
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
    const cleanup = a.auth.requestRecoveryCleanup(session().access_token);
    const denied = a.auth.consumeSessionResult(before, () => assert.fail('recovery admission'));
    await reached.promise; await login(b.auth); release.resolve();
    same(await denied, false); assert.ok((await cleanup).error); assertCurrent(store, session('B'));
  });

  scenario('recovery cleanup lock failure leaves purpose denied and never clears', async ({ open }) => {
    const store = memory(); const lock = mutex(); const a = await open(store, lock); const before = await a.auth.getSession();
    lock.fail = true; assert.ok((await a.auth.requestRecoveryCleanup(session().access_token)).error);
    same(await a.auth.consumeSessionResult(before, () => assert.fail('recovery admission')), false);
    assertCurrent(store, session()); same(store.counts.remove, 0);
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
      sessionProtocolBoundary: { active: () => true, capture: () => a.auth.captureSessionTicket(), consume: (ticket, finalToken, effect) => a.auth.consumeRealtimeToken(ticket, finalToken, 'fixture-anon-key', effect) },
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
}

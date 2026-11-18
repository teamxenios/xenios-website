// Synthetic fixtures only. No real URL, credentials, native seat or network.
import assert from 'node:assert/strict';
export const KEY = 'fixture-session';
export const EPOCH = 'fixture-rollout-1';
export const PROTOCOL = 'xenios-isolated-session-v1';
export const clone = value => JSON.parse(JSON.stringify(value));
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export const tick = () => new Promise(resolve => setImmediate(resolve));
export async function until(predicate) {
  for (let count = 0; count < 100; count++) { if (predicate()) return; await tick(); }
  throw new Error('FIXTURE_EXPECTED_BOUNDARY_NOT_REACHED');
}
export function session(label = 'A', subject = label, aal = 'aal1') {
  const payload = { sub: subject, session_id: 'session-' + label, aal, exp: Math.floor(Date.now() / 1000) + 3600,
    amr: [{ method: 'password', timestamp: 1 }] };
  return { access_token: [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify(payload)).toString('base64url'), Buffer.from('fixture-signature').toString('base64url')].join('.'),
    refresh_token: 'fixture-refresh-' + label, expires_in: 3600, expires_at: payload.exp, token_type: 'bearer',
    user: { id: subject, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      factors: [{ id: 'fixture-factor', factor_type: 'totp', status: 'verified' }] } };
}
export function memory(initial = session()) {
  const map = new Map([[KEY, JSON.stringify({ protocol: PROTOCOL, epoch: EPOCH, revision: '0', session: initial, verifier: null, purpose: 'ordinary' })]]);
  const hooks = { get: null, set: null, remove: null };
  const counts = { get: 0, set: 0, remove: 0 };
  return { map, hooks, counts, read: () => JSON.parse(map.get(KEY)),
    getItem: async key => { counts.get++; const captured = map.get(key) ?? null; if (hooks.get) await hooks.get(key, captured); return captured; },
    setItem: async (key, value) => { counts.set++; if (hooks.set) await hooks.set(key, value); map.set(key, value); },
    removeItem: async key => { counts.remove++; if (hooks.remove) await hooks.remove(key); map.delete(key); } };
}
export function mutex() {
  let tail = Promise.resolve();
  return { fail: false, async run(name, work) {
    if (this.fail) throw new Error('FIXTURE_LOCK_FAILURE');
    const prior = tail; const done = deferred(); tail = done.promise;
    await prior; try { return await work(); } finally { done.resolve(); }
  } };
}
export function provider() {
  const state = { calls: [], hold: null, reply: null, users: new Map() };
  const response = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
  state.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'fixture.invalid', 'network is synthetic only');
    const body = init.body ? JSON.parse(init.body) : {};
    const authorization = new Headers(init.headers).get('authorization');
    const call = { path: url.pathname, grant: url.searchParams.get('grant_type'), method: init.method ?? 'GET', body };
    state.calls.push(call);
    let value;
    if (url.pathname.endsWith('/token')) value = state.reply ?? (call.grant === 'password' ? session(body.email, body.email) : session('A-refresh'));
    else if (url.pathname.endsWith('/verify')) value = state.reply ?? session('A-mfa', 'A', 'aal2');
    else if (url.pathname.endsWith('/challenge')) value = { id: 'fixture-challenge', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 120 };
    else if (url.pathname.endsWith('/logout')) return new Response(null, { status: 204 });
    else if (url.pathname.endsWith('/user')) value = state.users.get(authorization?.slice(7)) ?? session().user;
    else throw new Error('UNRECOGNIZED_SYNTHETIC_PROVIDER_ROUTE');
    const held = state.hold;
    if (held && held.match(call)) {
      held.reached.resolve();
      if (held.stage === 'fetch') await held.release.promise;
    }
    const result = response(clone(value));
    if (held && held.match(call) && held.stage === 'json') {
      const json = result.json.bind(result);
      result.json = async () => { held.jsonReached.resolve(); await held.release.promise; return json(); };
    }
    return result;
  };
  state.block = (match, stage = 'fetch') => state.hold = { match, stage, reached: deferred(), jsonReached: deferred(), release: deferred() };
  return state;
}
export function browser() {
  const timers = [];
  const originalTimeout = globalThis.setTimeout;
  const original = Object.fromEntries(['window', 'document', 'BroadcastChannel', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const channels = [];
  class FakeBroadcastChannel {
    constructor(name) { this.name = name; this.listeners = []; this.messages = []; channels.push(this); }
    addEventListener(kind, fn) { if (kind === 'message') this.listeners.push(fn); }
    postMessage(message) { this.messages.push(clone(message)); }
    async deliver(message) { for (const fn of this.listeners) await fn({ data: clone(message) }); }
    close() {}
  }
  const location = new URL('https://fixture.invalid/');
  const window = { location, addEventListener() {}, removeEventListener() {}, history: { replaceState(_s, _t, url) { window.location = new URL(url, window.location.href); } } };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: FakeBroadcastChannel });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => { throw new Error('ACCIDENTAL_NETWORK_REFUSED'); } });
  globalThis.setTimeout = (fn, delay, ...args) => {
    if (delay === 0) { const timer = { fn: () => fn(...args), unref() {} }; timers.push(timer); return timer; }
    return originalTimeout(fn, delay, ...args);
  };
  return { window, channels, timers, async flushTimers() { for (const timer of timers.splice(0)) await timer.fn(); await tick(); },
    restore() { globalThis.setTimeout = originalTimeout; for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    } } };
}
export async function client(sdk, store, lock, transport = provider(), options = {}) {
  const instance = sdk.createClient('https://fixture.invalid', 'fixture-anon-key', {
    global: { fetch: transport.fetch }, auth: { storageKey: KEY, storage: store, persistSession: true,
      autoRefreshToken: false, detectSessionInUrl: false, skipAutoInitialize: true, ...options },
    realtime: { transport: class FixtureWebSocket {} },
  });
  const observerErrors = [];
  instance.auth.configureSessionCoordination({ rolloutBarrier: true, epoch: EPOCH, lock, onObserverError: () => observerErrors.push('isolated') });
  const events = [];
  instance.auth.onAuthStateChange((event, current, ticket) => { events.push({ event, session: current, ticket }); });
  if (!options.deferInitialize) await instance.auth.initialize();
  await tick();
  return { instance, auth: instance.auth, realtime: instance.realtime, events, transport, observerErrors,
    // No fixture ever connects/subscribes a socket. Avoid creating a new SDK
    // disconnect timeout during teardown of an instance that never connected.
    async dispose() { await instance.auth.stopAutoRefresh(); instance.auth.broadcastChannel?.close(); } };
}
export const verify = auth => auth.mfa.verify({ factorId: 'fixture-factor', challengeId: 'fixture-challenge', code: '000000' });
export const login = (auth, label = 'B') => auth.signInWithPassword({ email: label, password: 'synthetic-fixture-only' });
export function assertCurrent(store, expected) { assert.equal(store.read().session?.access_token ?? null, expected?.access_token ?? null); }

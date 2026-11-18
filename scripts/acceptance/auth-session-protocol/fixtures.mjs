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
export async function withDeadline(promise, timeout = 1200) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('FIXTURE_TERMINAL_RESULT_DEADLINE')), timeout); })]);
  } finally { clearTimeout(timer); }
}
export async function until(predicate) {
  for (let count = 0; count < 1500; count++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 1)); }
  throw new Error('FIXTURE_EXPECTED_BOUNDARY_NOT_REACHED');
}
export function createSessionFactory(clockSeconds = () => Math.floor(Date.now() / 1000)) {
  // Capture fixture time once. Delayed expectations must preserve the exact
  // synthetic session while the real SDK/runtime clocks continue normally.
  const epochSeconds = clockSeconds();
  return function session(label = 'A', subject = label, aal = 'aal1', timing = {}) {
    const payload = { sub: subject, session_id: 'session-' + label, aal, exp: timing.expiresAt ?? epochSeconds + 3600,
      amr: [{ method: 'password', timestamp: 1 }] };
    return { access_token: [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify(payload)).toString('base64url'), Buffer.from('fixture-signature').toString('base64url')].join('.'),
      refresh_token: 'fixture-refresh-' + label, expires_in: timing.expiresIn ?? 3600, expires_at: payload.exp, token_type: 'bearer',
      user: { id: subject, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
        factors: [{ id: 'fixture-factor', factor_type: 'totp', status: 'verified' }] } };
  };
}
export const session = createSessionFactory();
export function memory(initial = session()) {
  const map = new Map([[KEY, JSON.stringify({ protocol: PROTOCOL, epoch: EPOCH, revision: '0', session: initial, verifier: null, purpose: 'ordinary' })]]);
  const hooks = { beforeGet: null, get: null, set: null, remove: null };
  const counts = { get: 0, set: 0, remove: 0 };
  return { map, hooks, counts, read: () => JSON.parse(map.get(KEY)),
    getItem: async key => { counts.get++; if (hooks.beforeGet) await hooks.beforeGet(key); const captured = map.get(key) ?? null; if (hooks.get) await hooks.get(key, captured); return captured; },
    setItem: async (key, value) => { counts.set++; if (hooks.set) await hooks.set(key, value); map.set(key, value); },
    removeItem: async key => { counts.remove++; if (hooks.remove) await hooks.remove(key); map.delete(key); } };
}
export function mutex() {
  const tails = new Map();
  return { fail: false, async run(name, work) {
    if (this.fail) throw new Error('FIXTURE_LOCK_FAILURE');
    const prior = tails.get(name) ?? Promise.resolve(); const done = deferred(); tails.set(name, done.promise);
    await prior; try { return await work(); } finally { done.resolve(); }
  } };
}
export function provider() {
  const state = { calls: [], hold: null, reply: null, refreshFailure: null, users: new Map() };
  const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  state.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'fixture.invalid', 'network is synthetic only');
    const body = init.body ? JSON.parse(init.body) : {};
    const authorization = new Headers(init.headers).get('authorization');
    const call = { path: url.pathname, grant: url.searchParams.get('grant_type'), method: init.method ?? 'GET', body, authorization };
    state.calls.push(call);
    let value;
    if (url.pathname.endsWith('/token')) value = state.reply ?? (call.grant === 'password' ? session(body.email, body.email) : session('A-refresh'));
    else if (url.pathname.endsWith('/verify')) value = state.reply ?? session('A-mfa', 'A', 'aal2');
    else if (url.pathname.endsWith('/challenge')) value = { id: 'fixture-challenge', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 120 };
    else if (url.pathname.endsWith('/logout')) return new Response(null, { status: 204 });
    else if (url.pathname.endsWith('/user')) value = state.users.get(authorization?.slice(7)) ?? session().user;
    else if (url.pathname.startsWith('/realtime/v1/api/broadcast')) return response({}, 202);
    else throw new Error('UNRECOGNIZED_SYNTHETIC_PROVIDER_ROUTE');
    const held = state.hold;
    if (held && held.match(call)) {
      held.reached.resolve();
      if (held.stage === 'fetch') await held.release.promise;
    }
    const refreshFailure = call.grant === 'refresh_token' ? state.refreshFailure : null;
    const result = refreshFailure
      ? response({ error_code: 'refresh_token_not_found', message: 'Synthetic refresh rejection.' }, refreshFailure === 'retryable' ? 503 : 400)
      : response(clone(value));
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
  const heldTimers = [];
  const holdTimerDelays = new Set();
  const nativeTimers = new Set();
  const originalTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
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
    if (holdTimerDelays.has(delay)) { const timer = { fn: () => fn(...args), unref() {} }; heldTimers.push(timer); return timer; }
    const timer = originalTimeout(() => { nativeTimers.delete(timer); fn(...args); }, delay);
    nativeTimers.add(timer);
    return timer;
  };
  return { window, channels, timers, heldTimers, holdTimerDelays,
    async flushTimers() { for (const timer of timers.splice(0)) await timer.fn(); await tick(); },
    async flushHeldTimers() { for (const timer of heldTimers.splice(0)) await timer.fn(); await tick(); },
    restore() { for (const timer of nativeTimers) originalClearTimeout(timer); globalThis.setTimeout = originalTimeout; for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    } } };
}
export async function client(sdk, store, lock, transport = provider(), options = {}) {
  const { realtime = {}, deferInitialize = false, ...authOptions } = options;
  const instance = sdk.createClient('https://fixture.invalid', 'fixture-anon-key', {
    global: { fetch: transport.fetch }, auth: { storageKey: KEY, storage: store, persistSession: true,
      autoRefreshToken: false, detectSessionInUrl: false, skipAutoInitialize: true, ...authOptions },
    realtime: { transport: class FixtureWebSocket {}, ...realtime },
  });
  const observerErrors = [];
  instance.auth.configureSessionCoordination({ rolloutBarrier: true, epoch: EPOCH, lock, onObserverError: () => observerErrors.push('isolated') });
  const events = [];
  instance.auth.onAuthStateChange((event, current, ticket) => { events.push({ event, session: current, ticket }); });
  if (!deferInitialize) await instance.auth.initialize();
  await tick();
  return { instance, auth: instance.auth, realtime: instance.realtime, events, transport, observerErrors,
    async dispose() { await instance.auth.stopAutoRefresh(); instance.auth.broadcastChannel?.close(); await instance.realtime.disconnect(); } };
}
export function websocketFixture() {
  const sockets = [];
  class FakeWebSocket {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    readyState = 0; sent = []; bufferedAmount = 0;
    constructor(url) { assert.equal(new URL(url).hostname, 'fixture.invalid'); sockets.push(this); }
    open() { this.readyState = 1; this.onopen?.({ target: this }); }
    send(data) { assert.equal(this.readyState, 1); this.sent.push(data); }
    message(data) { this.onmessage?.({ data, target: this }); }
    close(code = 1000, reason = '') { this.readyState = 3; this.onclose?.({ code, reason, wasClean: true, target: this }); }
    error() { this.onerror?.({ target: this, message: 'Synthetic socket error.' }); }
    addEventListener(kind, callback) { this['on' + kind] = callback; }
    removeEventListener(kind, callback) { if (this['on' + kind] === callback) this['on' + kind] = null; }
  }
  const packets = socket => socket.sent.map(data => JSON.parse(String(data)));
  const reply = (socket, packet, status = 'ok', response = {}) => {
    socket.message(JSON.stringify({ topic: packet.topic, event: 'phx_reply', ref: packet.ref, join_ref: packet.join_ref,
      payload: { status, response } }));
  };
  const acknowledge = socket => {
    const join = packets(socket).filter(packet => packet.event === 'phx_join').at(-1);
    assert.ok(join, 'actual public subscribe sent a join');
    reply(socket, join);
    return join;
  };
  return { FakeWebSocket, sockets, packets, acknowledge, reply };
}
export async function subscribeFixture(opened, wire, topic = 'fixture', isPrivate = true, channelConfig = {}) {
  const statuses = [];
  const channel = opened.instance.channel(topic, { config: { private: isPrivate, ...channelConfig } });
  channel.subscribe(status => statuses.push(status));
  await until(() => wire.sockets.some(socket => socket.readyState === 0 || socket.readyState === 1));
  const socket = wire.sockets.at(-1); if (socket.readyState === 0) socket.open();
  await until(() => wire.packets(socket).some(packet => packet.event === 'phx_join'));
  const join = wire.acknowledge(socket);
  await until(() => statuses.includes('SUBSCRIBED'));
  return { channel, socket, join, statuses };
}
export const verify = auth => auth.mfa.verify({ factorId: 'fixture-factor', challengeId: 'fixture-challenge', code: '000000' });
export const login = (auth, label = 'B') => auth.signInWithPassword({ email: label, password: 'synthetic-fixture-only' });
export function assertCurrent(store, expected) { assert.equal(store.read().session?.access_token ?? null, expected?.access_token ?? null); }

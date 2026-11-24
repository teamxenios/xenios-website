// Fixture-only diagnostics. No sockets, credentials, bodies or live provider calls.
const DIAGNOSTIC = '/preview-backend/auth/v1/admin/users';
const PRODUCT = '11111111-1111-4111-8111-111111111111';
const VARIANTS = new Set(['22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444']);
const PATHS = new Set(['/api/config', '/api/admin/me', '/api/admin/research/required-inputs',
  `/api/admin/research/products/${PRODUCT}`, `/admin/research/products/${PRODUCT}`,
  '/preview-backend/auth/v1/user', DIAGNOSTIC, '/__native_preview', '/__product_studio_fixture',
  '/sw.js', '/offline.html']);
const tag = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value) ? value : null;
const number = value => Number.isFinite(value) ? value : null;
export function safeFixtureTarget(raw, origin) {
  try {
    const u = new URL(raw, origin);
    if (u.origin !== origin || u.username || u.password) return { path: 'OFF_ORIGIN_REDACTED' };
    const known = PATHS.has(u.pathname) || /^\/assets\/[a-zA-Z0-9_.-]{1,160}$/.test(u.pathname);
    const value = u.searchParams.get('previewVariantId');
    return { path: known ? u.pathname : 'UNKNOWN_PATH_REDACTED', queryPresent: Boolean(u.search),
      ...(VARIANTS.has(value) && u.pathname === `/api/admin/research/products/${PRODUCT}`
        ? { syntheticVariant: value } : {}) };
  } catch { return { path: 'INVALID_TARGET_REDACTED' }; }
}

// Native bootstrap invokes this existing nonfatal diagnostic before listen().
// Supply its already-existing synthetic response without opening a socket.
// All user checks still go through real getUser and the unchanged HTTP guard.
export function createBootstrapDiagnosticFetch(origin, fallback) {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('BOOTSTRAP_LOOPBACK_ONLY');
  const counts = { syntheticDiagnosticReads: 0, refusedDiagnosticReads: 0 };
  const fetch = async (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(raw);
    if (u.origin !== origin || u.pathname !== DIAGNOSTIC) return fallback(input, init);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (u.username || u.password || u.hash || method !== 'GET'
      || u.search !== '?page=1&per_page=1' || headers.get('authorization') !== 'Bearer native-preview-service'
      || init?.body != null || input instanceof Request && input.body != null) {
      counts.refusedDiagnosticReads++; throw Error('SYNTHETIC_BOOTSTRAP_CONTRACT');
    }
    const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
    if (signal?.aborted) throw signal.reason ?? Error('SYNTHETIC_BOOTSTRAP_ABORTED');
    counts.syntheticDiagnosticReads++;
    return new Response(JSON.stringify({ users: [], aud: 'authenticated', next_page: null }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  };
  return { fetch, counts };
}

export function createRequestLifecycle(origin, limit = 256) {
  if (!Number.isSafeInteger(limit) || limit < 8 || limit > 512) throw Error('DIAGNOSTIC_BOUND');
  const events = []; let dropped = 0, phase = 'bootstrap', sequence = 0;
  const add = event => { if (events.length === limit) { events.shift(); dropped++; } events.push({ phase, at: Date.now(), ...event }); };
  return {
    phase(value) { if (!tag(value)) throw Error('DIAGNOSTIC_PHASE'); phase = value; add({ event: 'phase' }); },
    http(method, target) {
      const row = { request: ++sequence, method: tag(method), ...safeFixtureTarget(target, origin) };
      add({ event: 'server-request', ...row });
      return (event, status) => {
        if (!['finish', 'close'].includes(event)) throw Error('DIAGNOSTIC_HTTP_EVENT');
        add({ event: `server-${event}`, ...row, status: number(status) });
      };
    },
    cdp(message) {
      if (!['Network.requestWillBeSent', 'Network.responseReceived', 'Network.loadingFinished', 'Network.loadingFailed'].includes(message.method)) return;
      const p = message.params ?? {};
      add({ event: message.method, session: tag(message.sessionId ?? 'root'), request: tag(p.requestId),
        ...((p.request?.url ?? p.response?.url) ? safeFixtureTarget(p.request?.url ?? p.response?.url, origin) : {}),
        method: tag(p.request?.method), type: tag(p.type), loader: tag(p.loaderId),
        status: number(p.response?.status), fromServiceWorker: p.response ? p.response.fromServiceWorker === true : null,
        canceled: p.canceled === true });
    },
    snapshot(page = null) {
      const all = page?.inflight ? [...page.inflight.entries()] : [];
      return { phase, droppedEvents: dropped, eventLimit: limit, events: events.map(e => ({ ...e })),
        pendingCount: all.length, pendingTruncated: all.length > 48,
        pending: all.slice(0, 48).map(([key, r]) => ({ request: tag(key), ...safeFixtureTarget(r.url, origin),
          method: tag(r.method), type: tag(r.type), targetType: tag(r.targetType), loader: tag(r.loaderId),
          frame: tag(r.frameId), session: tag(r.sessionId), generation: number(r.generation),
          ageMs: Number.isFinite(r.observedAtMs) ? Math.max(0, Date.now() - r.observedAtMs) : null,
          status: number(r.responseRecord?.status), fromServiceWorker: r.responseFromServiceWorker === true })),
        networkRecords: page?.network?.length ?? null, boundaryViolations: page?.networkBoundaryViolations?.length ?? null };
    },
  };
}

// Drain the deliberately refused fixture response before navigating away.
// No request may be declared complete or deleted from CDP by this helper.
export const DENIAL_PROBE = `async (path) => {
  const r = await fetch(path, {headers:{Authorization:'Bearer inert-invalid-fixture'},cache:'no-store',signal:AbortSignal.timeout(5000)});
  const reader = r.body?.getReader(); let bytes=0;
  if(reader) try { for(;;) {const n=await reader.read();if(n.done)break;bytes+=n.value.byteLength;if(bytes>65536)throw Error('DENIAL_BODY_BOUND');} }
  finally { await reader.cancel().catch(()=>{}); }
  return {status:r.status,bodyBytes:bytes,bodyDrained:true};
}`;

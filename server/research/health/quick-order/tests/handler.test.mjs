import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickOrderHandler, createQuickOrderErrorHandler } from '../handler.mjs';
import { fixture, sampleInput, ITEM, AGREEMENTS, ORIGIN, PREFIX, testPorts } from './fixtures.mjs';

test('config exposes canonical form facts separately and private safe headers', async () => {
  const f = fixture(), response = await f.get();
  assert.equal(response.status, 200);
  assert.equal(response.body.enabled, true);
  assert.equal(response.body.agreements.filter(item => item.type === 'form_acknowledgment').length, 3);
  assert.equal('demo' in response.body, false);
  assert.equal(response.headers['cache-control'], 'no-store, private');
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
});

test('strict HTTPS configuration excludes runtime demonstration and guessed origins', () => {
  for (const origin of ['http://127.0.0.1', 'https://example.test/path', 'https://name:password@example.test', 'https://example.test?query']) assert.throws(() => createQuickOrderHandler(testPorts(), { origin }));
  assert.throws(() => createQuickOrderHandler(testPorts(), { origin: ORIGIN, demo: true }));
  assert.throws(() => createQuickOrderHandler(testPorts(), { origin: ORIGIN, prefix: '/api/' }));
});

test('only confirmed adapter receipt yields submitted, never payment or clinical approval', async () => {
  const f = fixture(), response = await f.post();
  assert.equal(response.status, 201);
  assert.match(response.body.publicReference, /^XRR-\d{8}-[A-F0-9]{10}$/u);
  assert.equal(response.body.paymentStatus, 'not_collected');
  assert.equal(response.body.commissionState, 'not_authorized');
  assert.equal(response.body.status, 'submitted');
  assert.equal(f.ports.records.size, 1);
});

test('missing required evidence cannot reach commit', async () => {
  const f = fixture(), input = sampleInput(); delete input.referral;
  assert.equal((await f.post(input)).status, 422);
  assert.equal(f.ports.calls.includes('commit'), false);
});

test('same-actor retry recovers before new-write legal/catalog failures', async () => {
  const f = fixture(), first = await f.post();
  f.ports.config = async () => { throw new Error('legal unavailable'); };
  f.ports.resolveItem = async () => { throw new Error('catalog unavailable'); };
  const second = await f.post();
  assert.equal(second.status, 200);
  assert.equal(second.body.requestId, first.body.requestId);
  assert.equal(second.body.replayed, true);
  assert.equal(f.ports.calls.filter(call => call === 'commit').length, 1);
});

test('config outage permits refreshed session CSRF and same-key receipt recovery without new-write authority', async () => {
  const events = [], f = fixture(), first = await f.post();
  let configReads = 0;
  const rotatedCsrf = 'synthetic-rotated-session-csrf';
  f.ports.session = async () => ({ actorId: f.ports.actor, csrfToken: rotatedCsrf });
  f.ports.config = async () => { configReads++; throw new Error('private legal-service failure'); };
  f.ports.onOperationalError = event => { events.push(event); throw new Error('private observer failure'); };
  assert.equal((await f.post()).status, 403);
  const config = await f.get();
  assert.equal(config.status, 200);
  assert.equal(config.body.enabled, false);
  assert.deepEqual(config.body.agreements, []);
  assert.equal(config.body.csrfToken, rotatedCsrf);
  assert.equal(config.headers['cache-control'], 'no-store, private');
  assert.equal(JSON.stringify(config.body).includes('private'), false);
  assert.deepEqual(events, [{ code: 'quick_order_unavailable' }]);
  const recovered = await f.post(sampleInput(), { headers: { 'x-csrf-token': config.body.csrfToken } });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.requestId, first.body.requestId);
  assert.equal(recovered.body.replayed, true);
  assert.equal(configReads, 1);
  const different = sampleInput(); different.idempotencyKey = 'new-synthetic-key-00001';
  assert.equal((await f.post(different, { headers: { 'x-csrf-token': rotatedCsrf } })).status, 503);
  assert.equal(f.ports.records.size, 1);
  assert.equal(f.ports.calls.filter(call => call === 'commit').length, 1);
});

test('config outage recovery still requires authentication, origin and shared rate checks first', async () => {
  const f = fixture();
  let configReads = 0;
  f.ports.config = async () => { configReads++; throw new Error('unavailable'); };
  assert.equal((await f.invoke(`${PREFIX}/config`, { headers: { origin: 'https://evil.test' } })).status, 403);
  f.ports.takeRateLimit = async () => false;
  assert.equal((await f.get()).status, 429);
  f.ports.session = async () => null;
  assert.equal((await f.get()).status, 401);
  assert.equal(configReads, 0);
});

test('readiness revocation disables new writes but permits actor-scoped existing receipt recovery', async () => {
  const f = fixture(), first = await f.post(); f.ports.productionReady = false;
  assert.equal((await f.get()).body.enabled, false);
  const recovered = await f.post();
  assert.equal(recovered.status, 200); assert.equal(recovered.body.requestId, first.body.requestId);
  const different = sampleInput(); different.idempotencyKey = 'new-synthetic-key-00001';
  assert.equal((await f.post(different)).status, 503);
  assert.equal(f.ports.records.size, 1);
});

test('same key changed payload conflicts before authority reads', async () => {
  const f = fixture(); await f.post(); f.ports.config = async () => { throw new Error('not needed for recovery'); };
  const input = sampleInput(); input.lines[0].quantity = 2;
  const response = await f.post(input);
  assert.equal(response.status, 409); assert.equal(response.body.code, 'idempotency_conflict');
});

test('different actor cannot recover another account receipt with its key', async () => {
  const f = fixture(), first = await f.post(); f.ports.actor = 'synthetic-account-b';
  f.ports.productionReady = false;
  const other = await f.post();
  assert.equal(other.status, 503); assert.equal(other.body.requestId, undefined);
  assert.equal(f.ports.records.size, 1);
  assert.equal(JSON.stringify(other.body).includes(first.body.requestId), false);
});

test('parallel handler retries use same actor/key and fake atomic receipt, without claiming database concurrency', async () => {
  const f = fixture();
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.post()));
  assert.equal(new Set(responses.map(response => response.body.requestId)).size, 1);
  assert.equal(responses.filter(response => response.status === 201).length, 1);
  assert.equal(f.ports.records.size, 1);
});

test('response loss after fake commit recovers with original key and receipt', async () => {
  const f = fixture(ports => {
    const commit = ports.commit;
    ports.commit = async (...args) => { await commit(...args); throw new Error('Synthetic lost response'); };
  });
  assert.equal((await f.post()).status, 503);
  const recovered = await f.post();
  assert.equal(recovered.status, 200); assert.equal(recovered.body.replayed, true);
  assert.equal(f.ports.records.size, 1);
});

test('unconfirmed, malformed or inconsistent persistence returns no success identity', async () => {
  for (const mutate of [value => ({ ...value, persisted: 1 }), value => ({ ...value, requestId: 'bad' }), value => ({ ...value, estimate: undefined }), value => ({ ...value, estimate: { ...value.estimate, knownSubtotalCents: 999 } }), value => ({ ...value, attributionState: 'captured_unmatched' }), value => ({ ...value, replayed: 'yes' })]) {
    const f = fixture(ports => { const commit = ports.commit; ports.commit = async (...args) => mutate(await commit(...args)); });
    const response = await f.post(); assert.equal(response.status, 503); assert.equal(response.body.requestId, undefined);
  }
});

test('persisted replay strips status token/private fields and ignores false paid fields', async () => {
  const f = fixture(); await f.post();
  const record = [...f.ports.records.values()][0];
  Object.assign(record.publicReceipt, { statusToken: 'private-token', supplier: 'private-supplier', paymentStatus: 'paid' });
  const response = await f.post();
  assert.equal(response.status, 200); assert.equal(response.body.paymentStatus, 'not_collected');
  assert.equal('statusToken' in response.body, false); assert.equal('supplier' in response.body, false);
  record.publicReceipt.attributionState = 'commission_approved';
  assert.equal((await f.post()).status, 503);
});

test('unknown recovery record hash is not translated into a receipt', async () => {
  const f = fixture(ports => { ports.getExisting = async () => ({ payloadHash: '', publicReceipt: {} }); });
  const response = await f.post(); assert.equal(response.status, 503); assert.equal(response.body.requestId, undefined);
});

test('auth, exact-origin and CSRF remain mandatory even during receipt recovery', async () => {
  const f = fixture(); await f.post();
  for (const headers of [{ origin: 'https://evil.test' }, { origin: undefined }, { 'x-csrf-token': 'bad' }, { 'x-csrf-token': undefined }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await f.post(sampleInput(), { headers })).status, 403);
  f.ports.session = async () => null;
  assert.equal((await f.post()).status, 401);
  assert.equal((await f.get()).status, 401);
});

test('shared limiter applies before catalog and recovery lookup', async () => {
  const f = fixture(ports => { ports.takeRateLimit = async () => false; });
  assert.equal((await f.post()).status, 429); assert.equal((await f.get('/catalog')).status, 429);
  assert.deepEqual(f.ports.calls, []);
});

test('runtime feature requires explicit enabled and adapter readiness', async () => {
  for (const options of [{ enabled: false }, {}]) {
    const f = fixture(ports => { ports.productionReady = false; }, options);
    assert.equal((await f.get()).body.enabled, false);
    assert.equal((await f.get('/catalog')).status, 503);
    assert.equal((await f.post()).body.code, 'feature_disabled');
  }
});

test('malformed legal configuration cannot appear valid or permit new commit', async () => {
  const f = fixture(ports => { ports.config = async () => ({ enabled: true, agreements: [{ ...AGREEMENTS[0], url: 'javascript:bad' }] }); });
  const config = await f.get();
  assert.equal(config.body.enabled, false); assert.deepEqual(config.body.agreements, []);
  assert.equal((await f.post()).body.code, 'legal_requirements_unavailable');
});

test('stale legal and catalog/price versions fail before commit', async () => {
  const staleTerms = sampleInput(); staleTerms.agreements[0].version = 'old';
  const f = fixture(); assert.equal((await f.post(staleTerms)).body.code, 'terms_changed');
  for (const update of [{ priceVersion: 'new-price' }, { catalogVersion: 'new-catalog' }, { maximumQuantity: 0 }]) {
    f.ports.resolveItem = async () => ({ ...ITEM, ...update });
    assert.ok([409, 503].includes((await f.post()).status));
  }
  assert.equal(f.ports.records.size, 0);
});

test('provider, held, research, classification-pending and hidden authority never reach commit', async () => {
  for (const update of [{ workflowMode: 'provider_request' }, { workflowMode: 'request_activation' }, { workflowMode: 'availability_review' }, { researchUseOnly: true }, { requestable: false }]) {
    const f = fixture(ports => { ports.resolveItem = async () => ({ ...ITEM, ...update }); });
    assert.equal((await f.post()).status, 409); assert.equal(f.ports.calls.includes('commit'), false);
  }
});

test('every request resolves exact variant and destination instead of browser price', async () => {
  let received;
  const f = fixture(ports => { ports.resolveItem = async (...args) => { received = args; return { ...ITEM }; }; });
  await f.post();
  assert.equal(received[0].actorId, f.ports.actor); assert.deepEqual(received.slice(1), [ITEM.productId, ITEM.variantId, 'TX']);
  const input = sampleInput(); input.lines[0].variantId = 'guessed';
  assert.equal((await fixture().post(input)).status, 409);
});

test('pending prices stay unknown in receipt estimates', async () => {
  const f = fixture(ports => { ports.resolveItem = async () => ({ ...ITEM, unitPriceCents: null, priceVersion: null, workflowMode: 'request_pricing' }); });
  const input = sampleInput(); input.lines[0].expectedPriceVersion = null;
  const response = await f.post(input);
  assert.equal(response.status, 201); assert.equal(response.body.estimate.estimateComplete, false); assert.equal(response.body.estimate.knownSubtotalCents, 0);
});

test('variant page 2 keeps accurate total and does not silently return first page', async () => {
  const f = fixture(ports => { ports.listCatalog = async (_session, query) => ({ items: query.page === 2 ? [{ ...ITEM, variantId: 'last' }] : Array.from({ length: 24 }, (_, index) => ({ ...ITEM, variantId: `variant-${index}` })), total: 25, page: query.page, pageSize: query.pageSize }); });
  const response = await f.get('/catalog?page=2');
  assert.equal(response.status, 200); assert.equal(response.body.total, 25); assert.equal(response.body.items[0].variantId, 'last');
});

test('incorrect page totals, truncated pages and duplicate variants fail closed', async () => {
  for (const result of [{ items: [ITEM], total: 25, page: 1, pageSize: 24 }, { items: [ITEM, ITEM], total: 2, page: 1, pageSize: 24 }, { items: [], total: -1, page: 1, pageSize: 24 }, { items: [ITEM], total: 1, page: 2, pageSize: 24 }]) {
    const f = fixture(ports => { ports.listCatalog = async () => result; });
    assert.equal((await f.get('/catalog')).body.code, 'catalog_unavailable');
  }
});

test('bad page/search and control characters fail before catalog access', async () => {
  const f = fixture();
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=1&page=2', 'search=%00', `search=${'x'.repeat(121)}`]) assert.equal((await f.get(`/catalog?${query}`)).status, 422);
});

test('raw and upstream-parsed JSON both enforce original 64KiB including whitespace', async () => {
  const f = fixture(), input = sampleInput();
  const raw = `${' '.repeat(65536)}${JSON.stringify(input)}`;
  assert.equal((await f.post(input, { raw })).status, 413);
  assert.equal((await f.post(input, { raw, upstream: true, headers: { 'content-length': undefined } })).status, 413);
  assert.equal(f.ports.records.size, 0);
  assert.equal((await f.post(input, { upstream: true })).status, 201);
});

test('upstream body without raw-size evidence refuses and parsed tampering cannot change input', async () => {
  const f = fixture(), input = sampleInput();
  assert.equal((await f.post(input, { upstream: true, omitRawBody: true })).body.code, 'body_limit_unverified');
  const tampered = structuredClone(input); tampered.contact.email = 'different@example.test';
  assert.equal((await f.post(input, { upstream: true, parsedBody: tampered })).status, 201);
  assert.equal([...f.ports.records.values()][0].args.input.contact.email, input.contact.email);
});

test('invalid JSON, encoding, content type and raw length return safe JSON refusals', async () => {
  const f = fixture();
  assert.equal((await f.post(undefined, { raw: '{bad private content' })).body.code, 'invalid_json');
  assert.equal((await f.post(undefined, { raw: Buffer.from([0xff, 0xfe]) })).status, 400);
  assert.equal((await f.post(sampleInput(), { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await f.post(sampleInput(), { headers: { 'content-encoding': 'gzip' } })).status, 415);
  assert.equal((await f.post(sampleInput(), { headers: { 'content-length': '1' } })).status, 400);
  assert.equal((await f.post(sampleInput(), { headers: { 'content-length': '-1' } })).status, 400);
});

test('exact API root and unknown descendants return JSON instead of SPA fallback', async () => {
  const f = fixture();
  for (const path of [PREFIX, `${PREFIX}/`, `${PREFIX}/missing`]) {
    const response = await f.invoke(path); assert.equal(response.status, 404); assert.equal(response.next, false);
  }
  assert.equal((await f.invoke(`${PREFIX}-unrelated`)).next, true);
});

test('Express originalUrl restores stripped prefix for config and request paths', async () => {
  const f = fixture();
  assert.equal((await f.invoke('/config', { originalUrl: `${PREFIX}/config` })).status, 200);
  const response = await f.invoke('/requests', { originalUrl: `${PREFIX}/requests`, method: 'POST', input: sampleInput() });
  assert.equal(response.status, 201);
});

test('unexpected exceptions and broken operational observer cannot leak input or defeat JSON response', async () => {
  let event;
  const f = fixture(ports => {
    ports.config = async () => { throw new Error('customer@example.test private-token'); };
    ports.onOperationalError = value => { event = value; throw new Error('observer failed'); };
  });
  const response = await f.post();
  assert.equal(response.status, 503); assert.deepEqual(event, { code: 'quick_order_unavailable' });
  assert.equal(JSON.stringify(response).includes('customer@example.test'), false);
  assert.equal(JSON.stringify(response).includes('private-token'), false);
});

test('upstream parser error middleware only handles exact namespace with safe bounded JSON', () => {
  const handler = createQuickOrderErrorHandler();
  for (const [error, status] of [[{ type: 'entity.too.large', body: 'private' }, 413], [{ type: 'entity.parse.failed', body: 'private' }, 400], [new Error('private'), 503]]) {
    let output;
    const res = { statusCode: 200, setHeader() {}, end(body) { output = { status: this.statusCode, body: JSON.parse(body) }; } };
    handler(error, { url: PREFIX, headers: {} }, res, () => assert.fail('API error must not reach SPA fallback'));
    assert.equal(output.status, status); assert.equal(JSON.stringify(output).includes('private'), false);
  }
  const error = new Error('unrelated'); let forwarded;
  handler(error, { url: '/other', headers: {} }, {}, value => { forwarded = value; });
  assert.equal(forwarded, error);
});

// Direct request doubles deliberately omit all application adapters and streams.
// Fixture call lists do not observe session/rate/body access, so they cannot
// establish the ownership-before-input boundary covered by these regressions.
function ownershipBoundaryProbe(target) {
  const accesses = [], forwarded = [];
  const forbidden = name => { accesses.push(name); throw new Error('Unexpected request-time access'); };
  const ports = { productionReady: true };
  for (const name of ['session', 'config', 'listCatalog', 'resolveItem', 'takeRateLimit', 'getExisting', 'commit', 'onOperationalError']) {
    ports[name] = () => forbidden(`port:${name}`);
  }
  const req = { ...target, method: 'POST', headers: { origin: 'https://untrusted.example.test' } };
  for (const name of ['body', 'rawBody', 'on', 'once', 'pipe', 'read', 'resume', 'pause', 'setEncoding']) {
    Object.defineProperty(req, name, { get: () => forbidden(`request:${name}`) });
  }
  Object.defineProperty(req, Symbol.asyncIterator, { get: () => forbidden('request:asyncIterator') });
  const result = { status: null, body: null, headers: {} };
  const res = {
    statusCode: 200,
    setHeader(name, value) { result.headers[name.toLowerCase()] = value; },
    end(body) { result.status = this.statusCode; result.body = JSON.parse(body); },
  };
  const next = error => { forwarded.push(error); };
  return { ports, req, res, result, accesses, forwarded, next };
}

const MALFORMED_OWNED_TARGETS = [
  ['literal dot segment', { url: `${PREFIX}/./config` }],
  ['raw owned path traverses outside the prefix', { url: `${PREFIX}/../elsewhere` }],
  ['unowned raw path normalizes into the prefix', { url: '/api/health/elsewhere/../quick-order/config' }],
  ['encoded dot escapes the prefix', { url: `${PREFIX}/%2e%2e/elsewhere` }],
  ['encoded dot normalizes into the prefix', { url: '/api/health/elsewhere/%2E%2E/quick-order/config' }],
  ['mixed encoded dot', { url: `${PREFIX}/.%2e/elsewhere` }],
  ['encoded prefix character', { url: '/api/health/%71uick-order/config' }],
  ['backslash separator after prefix', { url: `${PREFIX}\\config` }],
  ['backslash separators within prefix', { url: '/api\\health\\quick-order\\config' }],
  ['leading backslash path', { url: '\\api\\health\\quick-order\\config' }],
  ['case alias', { url: `${PREFIX.toUpperCase()}/config` }],
  ['mixed case alias', { url: '/API/Health/quick-order/config' }],
  ['leading duplicate slash is a path, not authority', { url: `/${PREFIX}/config` }],
  ['duplicate slash inside prefix', { url: '/api//health/quick-order/config' }],
  ['duplicate slash after prefix', { url: `${PREFIX}//config` }],
  ['encoded slash within prefix', { url: '/api%2fhealth%2fquick-order/config' }],
  ['encoded slash after prefix', { url: `${PREFIX}%2Fconfig` }],
  ['encoded backslash within prefix', { url: '/api%5chealth%5cquick-order/config' }],
  ['owned path with malformed percent encoding', { url: `${PREFIX}/%GG` }],
  ['fragment after path', { url: `${PREFIX}/config#private-fragment` }],
  ['fragment after query', { url: `${PREFIX}/config?view=1#private-fragment` }],
  ['same-origin absolute target within namespace', { url: `${ORIGIN}${PREFIX}/config` }],
  ['different-origin absolute target within namespace', { url: `https://elsewhere.example.test${PREFIX}/config` }],
  ['absolute target with excess scheme separators', { url: `http:////elsewhere.example.test${PREFIX}/config` }],
  ['absolute target with mixed scheme separators', { url: `https:/\\/elsewhere.example.test${PREFIX}/config` }],
  ['absolute target traverses out after excess scheme separators', { url: `http:////elsewhere.example.test${PREFIX}/../other` }],
  ['absolute target traverses out after one scheme separator', { url: `http:/elsewhere.example.test${PREFIX}/../other` }],
  ['absolute target traverses out with no scheme separators', { url: `http:elsewhere.example.test${PREFIX}/../other` }],
];

const UNRELATED_TARGETS = [
  ['neighboring longer name', { url: `${PREFIX}s/config` }],
  ['neighboring hyphen name', { url: `${PREFIX}-other/config` }],
  ['encoded neighboring name', { url: `${PREFIX}%73/config` }],
  ['casefolded neighboring name', { url: `${PREFIX.toUpperCase()}-OTHER/config` }],
  ['owned text appears only in query', { url: `/elsewhere?return=${PREFIX}/config` }],
  ['owned text appears only in fragment', { url: `/elsewhere#${PREFIX}/config` }],
  ['unrelated malformed percent encoding', { url: '/elsewhere/%GG' }],
  ['unrelated backslash', { url: '/elsewhere\\other' }],
  ['unrelated non-origin form', { url: 'elsewhere/other' }],
  ['unrelated malformed absolute URL', { url: 'https://[invalid-host/elsewhere' }],
  ['unrelated absolute same-origin URL', { url: `${ORIGIN}/elsewhere` }],
  ['unrelated absolute different-origin URL', { url: 'https://elsewhere.example.test/other' }],
  ['leading duplicate slash never assigns an authority', { url: `//elsewhere.example.test${PREFIX}/config` }],
  ['absent target', {}],
  ['non-string target', { url: 42 }],
  ['both original and effective targets unrelated', { originalUrl: '/elsewhere/%GG', url: 'https://elsewhere.example.test/other' }],
];

const CONFLICTING_TARGETS = [
  ['unrelated original cannot hide owned effective target', { originalUrl: '/elsewhere', url: `${PREFIX}/config` }],
  ['owned original cannot rewrite to unrelated effective target', { originalUrl: `${PREFIX}/config`, url: '/elsewhere' }],
  ['different full owned endpoints', { originalUrl: `${PREFIX}/config`, url: `${PREFIX}/requests` }],
  ['different mount-stripped endpoints', { originalUrl: `${PREFIX}/config`, url: '/requests' }],
  ['different mount-stripped queries', { originalUrl: `${PREFIX}/config?view=1`, url: '/config?view=2' }],
  ['malformed original remains owned after normalization elsewhere', { originalUrl: `${PREFIX}/../elsewhere`, url: '/elsewhere' }],
  ['owned malformed original cannot be replaced by valid effective target', { originalUrl: `${PREFIX.toUpperCase()}/config`, url: `${PREFIX}/config` }],
  ['owned malformed effective cannot be hidden by valid original', { originalUrl: `${PREFIX}/config`, url: `${PREFIX}/./config` }],
  ['absolute unrelated original cannot hide owned effective target', { originalUrl: `${ORIGIN}/elsewhere`, url: `${PREFIX}/config` }],
  ['absolute unrelated effective cannot replace owned original', { originalUrl: `${PREFIX}/config`, url: `${ORIGIN}/elsewhere` }],
];

test('unrelated malformed, absolute and neighboring targets pass through before all ports and input access', async () => {
  for (const [label, target] of UNRELATED_TARGETS) {
    const probe = ownershipBoundaryProbe(target);
    const handler = createQuickOrderHandler(probe.ports, { origin: ORIGIN, enabled: true });
    await handler(probe.req, probe.res, probe.next);
    assert.deepEqual(probe.accesses, [], label);
    assert.deepEqual(probe.forwarded, [undefined], label);
    assert.equal(probe.result.status, null, label);
    assert.equal(probe.result.body, null, label);
    assert.deepEqual(probe.result.headers, {}, label);
  }
});

test('owned path aliases refuse with invalid_request before ports, origin checks or body/stream access', async () => {
  for (const [label, target] of MALFORMED_OWNED_TARGETS) {
    const probe = ownershipBoundaryProbe(target);
    const handler = createQuickOrderHandler(probe.ports, { origin: ORIGIN, enabled: true });
    await handler(probe.req, probe.res, probe.next);
    assert.deepEqual(probe.accesses, [], label);
    assert.deepEqual(probe.forwarded, [], label);
    assert.equal(probe.result.status, 400, label);
    assert.equal(probe.result.body?.code, 'invalid_request', label);
    assert.equal(probe.result.headers['content-type'], 'application/json; charset=utf-8', label);
    assert.equal(probe.result.headers['cache-control'], 'no-store, private', label);
    assert.equal(JSON.stringify(probe.result.body).includes('private-fragment'), false, label);
  }
});

test('conflicting original and effective targets cannot hide or reroute an owned request', async () => {
  for (const [label, target] of CONFLICTING_TARGETS) {
    const probe = ownershipBoundaryProbe(target);
    const handler = createQuickOrderHandler(probe.ports, { origin: ORIGIN, enabled: true });
    await handler(probe.req, probe.res, probe.next);
    assert.deepEqual(probe.accesses, [], label);
    assert.deepEqual(probe.forwarded, [], label);
    assert.equal(probe.result.status, 400, label);
    assert.equal(probe.result.body?.code, 'invalid_request', label);
  }
});

test('canonical exact roots and query-bearing paths retain valid ownership including Express stripped paths', async () => {
  const f = fixture();
  for (const [label, url, originalUrl, status] of [
    ['exact root', PREFIX, undefined, 404],
    ['exact root with query', `${PREFIX}?view=1`, undefined, 404],
    ['trailing slash root', `${PREFIX}/?view=1`, undefined, 404],
    ['configuration query containing escaped path characters', `${PREFIX}/config?return=%2fother%5cpath%23fragment`, undefined, 200],
    ['matching full original and effective paths', `${PREFIX}/config?view=1`, `${PREFIX}/config?view=1`, 200],
    ['mount-stripped configuration and preserved query', '/config?view=1', `${PREFIX}/config?view=1`, 200],
    ['mount-stripped exact root', '/', PREFIX, 404],
  ]) {
    const response = await f.invoke(url, originalUrl === undefined ? {} : { originalUrl });
    assert.equal(response.status, status, label);
    assert.equal(response.next, false, label);
    assert.equal(response.headers['content-type'], 'application/json; charset=utf-8', label);
  }
});

test('parser error ownership forwards unrelated errors unchanged without reading request inputs', () => {
  const handler = createQuickOrderErrorHandler();
  for (const [label, target] of UNRELATED_TARGETS) {
    const probe = ownershipBoundaryProbe(target);
    const originalError = { type: 'entity.too.large', status: 413, body: 'private-original-parser-body' };
    handler(originalError, probe.req, probe.res, probe.next);
    assert.deepEqual(probe.accesses, [], label);
    assert.equal(probe.forwarded.length, 1, label);
    assert.equal(probe.forwarded[0], originalError, label);
    assert.equal(probe.result.status, null, label);
    assert.deepEqual(probe.result.headers, {}, label);
  }
});

test('parser errors on owned aliases and conflicting targets always become fixed invalid_request responses', () => {
  const handler = createQuickOrderErrorHandler();
  for (const [label, target] of [...MALFORMED_OWNED_TARGETS, ...CONFLICTING_TARGETS]) {
    const probe = ownershipBoundaryProbe(target);
    const originalError = { type: 'entity.too.large', status: 413, body: 'private-original-parser-body' };
    handler(originalError, probe.req, probe.res, probe.next);
    assert.deepEqual(probe.accesses, [], label);
    assert.deepEqual(probe.forwarded, [], label);
    assert.equal(probe.result.status, 400, label);
    assert.equal(probe.result.body?.code, 'invalid_request', label);
    assert.equal(JSON.stringify(probe.result.body).includes('private-original-parser-body'), false, label);
  }
});

test('canonical parser error paths preserve payload-too-large, invalid-json and unavailable classifications', () => {
  const handler = createQuickOrderErrorHandler();
  for (const [label, target] of [
    ['exact root query', { url: `${PREFIX}?view=1` }],
    ['canonical request query', { url: `${PREFIX}/requests?trace=%2f` }],
    ['Express stripped request', { originalUrl: `${PREFIX}/requests?trace=1`, url: '/requests?trace=1' }],
  ]) {
    for (const [error, status, code] of [
      [{ type: 'entity.too.large', body: 'private-original-parser-body' }, 413, 'payload_too_large'],
      [{ type: 'entity.parse.failed', body: 'private-original-parser-body' }, 400, 'invalid_json'],
      [new Error('private-original-parser-body'), 503, 'temporarily_unavailable'],
    ]) {
      const probe = ownershipBoundaryProbe(target);
      handler(error, probe.req, probe.res, probe.next);
      assert.deepEqual(probe.accesses, [], label);
      assert.deepEqual(probe.forwarded, [], label);
      assert.equal(probe.result.status, status, label);
      assert.equal(probe.result.body?.code, code, label);
      assert.equal(JSON.stringify(probe.result.body).includes('private-original-parser-body'), false, label);
    }
  }
});

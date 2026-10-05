import { createHash, timingSafeEqual } from 'node:crypto';
import { InputError, ESTIMATE_EXCLUSIONS, validateSubmission, validateAgreements, publicCatalogItem, validateCurrentLine, estimate, attributionSnapshot } from './core.mjs';
import { classifyQuickOrderTarget, QUICK_ORDER_PREFIX } from './paths.mjs';

export const QUICK_ORDER_MAX_BYTES = 65536;
const FORM_HASHES = Object.freeze({
  'assisted_order_form_v1:accuracy': 'aeb2ba5a069dd3f4',
  'assisted_order_form_v1:contact_consent': '6da1cc70338029ed',
  'assisted_order_form_v1:request_notice': '22788ae1ac7cab44',
});
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const submissionHash = input => createHash('sha256').update(JSON.stringify(stable(input))).digest('hex');

function boundedString(value, max) {
  return typeof value === 'string' && value.length > 0 && value === value.trim() && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
}
function safeLegalUrl(value) {
  if (!boundedString(value, 2048) || /[\s\\]/u.test(value)) return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
/** Verify published documents and the separate canonical operational facts. */
export function publishedAgreements(config) {
  if (!Array.isArray(config?.agreements) || config.agreements.length < 4 || config.agreements.length > 30) return false;
  const seen = new Set();
  let legalCount = 0;
  for (const agreement of config.agreements) {
    if (!agreement || !boundedString(agreement.kind, 100) || !boundedString(agreement.version, 100) || !boundedString(agreement.label, 1000) || seen.has(agreement.kind)) return false;
    seen.add(agreement.kind);
    if (agreement.type === 'form_acknowledgment') {
      if (!Object.hasOwn(FORM_HASHES, agreement.kind) || FORM_HASHES[agreement.kind] !== agreement.version || agreement.url !== null || createHash('sha256').update(agreement.label).digest('hex').slice(0, 16) !== agreement.version) return false;
    } else {
      if (agreement.type !== undefined && agreement.type !== 'legal') return false;
      if (agreement.kind.startsWith('assisted_order_form') || /demo/iu.test(agreement.kind) || !safeLegalUrl(agreement.url)) return false;
      legalCount++;
    }
  }
  return legalCount > 0 && Object.keys(FORM_HASHES).every(kind => seen.has(kind));
}
/** Do not repair missing/malformed persisted fields into apparent success. */
export function safeReceipt(value, replayed = false) {
  if (!value || typeof value.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value.requestId) || typeof value.publicReference !== 'string' || !/^XRR-\d{8}-[A-F0-9]{10}$/u.test(value.publicReference)) throw new Error('Receipt identity unavailable');
  if (!['direct_no_referrer', 'captured_unmatched'].includes(value.attributionState)) throw new Error('Receipt attribution unavailable');
  const computed = value.estimate;
  if (!computed || !Number.isSafeInteger(computed.knownSubtotalCents) || computed.knownSubtotalCents < 0 || typeof computed.estimateComplete !== 'boolean' || computed.currency !== 'USD' || computed.excludes !== ESTIMATE_EXCLUSIONS) throw new Error('Receipt estimate unavailable');
  return {
    requestId: value.requestId, publicReference: value.publicReference, status: 'submitted', paymentStatus: 'not_collected',
    attributionState: value.attributionState, commissionState: 'not_authorized',
    estimate: { knownSubtotalCents: computed.knownSubtotalCents, estimateComplete: computed.estimateComplete, currency: 'USD', excludes: ESTIMATE_EXCLUSIONS },
    replayed,
    nextSteps: ['Your request has been received for review.', 'The team will confirm the applicable pathway, availability and next steps.', 'No payment was collected. A request does not approve treatment or guarantee fulfillment.'],
  };
}
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end(JSON.stringify(body));
}
function prefixValue(value = QUICK_ORDER_PREFIX) {
  if (typeof value !== 'string' || !/^\/[a-zA-Z0-9/_-]+$/u.test(value) || value.endsWith('/') || value.includes('//')) throw new Error('A non-empty absolute API prefix is required.');
  return value;
}
function lengthHeader(req) {
  const raw = req.headers['content-length'];
  if (raw === undefined) return null;
  if (typeof raw !== 'string' || !/^\d+$/u.test(raw)) throw new InputError('request', 'Invalid request length.', 400, 'invalid_request');
  const size = Number(raw);
  if (!Number.isSafeInteger(size) || size > QUICK_ORDER_MAX_BYTES) throw new InputError('request', 'Request is too large.', 413, 'payload_too_large');
  return size;
}
async function readBody(req) {
  if (typeof req.headers['content-type'] !== 'string' || !/^application\/json(?:\s*;|$)/iu.test(req.headers['content-type'])) throw new InputError('request', 'JSON is required.', 415, 'unsupported_media');
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new InputError('request', 'Compressed request bodies are not supported.', 415, 'unsupported_encoding');
  const declaredLength = lengthHeader(req);
  let bytes;
  if (req.body !== undefined) {
    // The host's existing JSON verifier supplies this buffer. Serialized parsed
    // length alone loses whitespace, duplicate keys and original byte size.
    if (!Buffer.isBuffer(req.rawBody)) throw new InputError('request', 'Request body verification is unavailable.', 503, 'body_limit_unverified');
    bytes = req.rawBody;
  } else {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += part.length;
      if (size > QUICK_ORDER_MAX_BYTES) throw new InputError('request', 'Request is too large.', 413, 'payload_too_large');
      chunks.push(part);
    }
    bytes = Buffer.concat(chunks);
  }
  if (bytes.length > QUICK_ORDER_MAX_BYTES) throw new InputError('request', 'Request is too large.', 413, 'payload_too_large');
  if (declaredLength !== null && bytes.length !== declaredLength) throw new InputError('request', 'Invalid request length.', 400, 'invalid_request');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new InputError('request', 'Invalid JSON.', 400, 'invalid_json'); }
}
function verifySession(session) {
  if (!session || !boundedString(session.actorId, 200) || !boundedString(session.csrfToken, 512)) throw new InputError('session', 'Please sign in through the website to continue.', 401, 'authentication_required');
}
function reportUnavailable(ports) {
  // Operational sinks receive one fixed code only, never payloads or exceptions.
  try { ports?.onOperationalError?.({ code: 'quick_order_unavailable' }); } catch { /* A failing observer cannot replace a safe JSON response. */ }
}
function unavailable(res, ports) {
  reportUnavailable(ports);
  return send(res, 503, { code: 'temporarily_unavailable', message: 'We could not confirm receipt. Keep this form open and retry using the same request; do not send payment.' });
}

export function createQuickOrderHandler(ports, options = {}) {
  const prefix = prefixValue(options.prefix);
  if (typeof options.origin !== 'string') throw new Error('An explicit HTTPS same-origin URL is required.');
  const origin = new URL(options.origin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('An explicit HTTPS origin without credentials or a path is required.');
  if (Object.hasOwn(options, 'demo')) throw new Error('Demo mode is not part of the application handler.');
  for (const key of ['session', 'config', 'listCatalog', 'resolveItem', 'takeRateLimit', 'getExisting', 'commit']) if (typeof ports?.[key] !== 'function') throw new Error(`Missing port: ${key}`);
  const enabled = () => options.enabled === true && ports.productionReady === true;
  const requireEnabled = config => {
    if (!enabled() || config?.enabled !== true) throw new InputError('request', 'Quick Order is not available. Please contact support.', 503, 'feature_disabled');
    if (!publishedAgreements(config)) throw new InputError('agreements', 'Published terms are unavailable.', 503, 'legal_requirements_unavailable');
  };
  return async function handle(req, res, next) {
    try {
      const target = classifyQuickOrderTarget(req, prefix);
      if (target.kind === 'unrelated') return next ? next() : send(res, 404, { code: 'not_found' });
      if (target.kind === 'owned-malformed') throw new InputError('request', 'Invalid request path.', 400, 'invalid_request');
      const url = target.url;
      const path = url.pathname.slice(prefix.length);
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin !== undefined && req.headers.origin !== origin.origin) || (req.method === 'POST' && req.headers.origin !== origin.origin)) throw new InputError('request', 'Use the same-site form.', 403, 'origin_rejected');
      const session = await ports.session(req);
      verifySession(session);
      if (await ports.takeRateLimit(session, req) !== true) throw new InputError('request', 'Too many requests. Try again shortly.', 429, 'rate_limited');
      if (req.method === 'POST' && path === '/requests') {
        if (!safeEqual(req.headers['x-csrf-token'], session.csrfToken)) throw new InputError('request', 'Refresh the form and try again.', 403, 'csrf_rejected');
        const input = validateSubmission(await readBody(req));
        const payloadHash = submissionHash(input);
        // Recovery is read-only, actor-scoped and precedes every new-write gate.
        // Current legal/catalog outages must not hide an already stored receipt.
        const existing = await ports.getExisting(session, input.idempotencyKey);
        if (existing !== null && existing !== undefined) {
          if (!existing || typeof existing.payloadHash !== 'string' || !/^[a-f0-9]{64}$/u.test(existing.payloadHash)) throw new Error('Recovery record unavailable');
          if (existing.payloadHash !== payloadHash) throw new InputError('request', 'This request key was used with different details. Recover the original request before starting another.', 409, 'idempotency_conflict');
          return send(res, 200, safeReceipt(existing.publicReceipt, true));
        }
        const config = await ports.config(session);
        requireEnabled(config);
        validateAgreements(input.agreements, config.agreements);
        const snapshots = [];
        for (const line of input.lines) {
          const authority = await ports.resolveItem(session, line.productId, line.variantId, input.contact.shippingAddress.region);
          snapshots.push(validateCurrentLine(line, authority ? publicCatalogItem(authority) : null));
        }
        const receivedAt = new Date().toISOString();
        const attribution = attributionSnapshot(input, receivedAt);
        const computedEstimate = estimate(snapshots);
        // This port must repeat decisive authority checks atomically. No claim of
        // durability can be derived from this handler's preflight checks.
        const saved = await ports.commit(session, { input, payloadHash, attribution, snapshots, computedEstimate, receivedAt });
        if (saved?.persisted !== true || (saved.replayed !== undefined && typeof saved.replayed !== 'boolean')) throw new Error('Durable receipt unavailable');
        const receipt = safeReceipt(saved, saved.replayed === true);
        if (receipt.attributionState !== attribution.reviewState || receipt.estimate.knownSubtotalCents !== computedEstimate.knownSubtotalCents || receipt.estimate.estimateComplete !== computedEstimate.estimateComplete) throw new Error('Durable receipt mismatch');
        return send(res, saved.replayed === true ? 200 : 201, receipt);
      }
      if (req.method === 'GET' && path === '/config') {
        let config;
        try { config = await ports.config(session); }
        catch { reportUnavailable(ports); }
        // Auth and rate checks already succeeded. A configuration outage must
        // not prevent this session refreshing CSRF for same-key receipt recovery.
        // Missing config supplies no legal set and never enables a new write.
        const legalReady = publishedAgreements(config);
        const isEnabled = enabled() && config?.enabled === true && legalReady;
        return send(res, 200, {
          enabled: isEnabled, csrfToken: session.csrfToken,
          agreements: legalReady ? config.agreements.map(agreement => ({ kind: agreement.kind, version: agreement.version, label: agreement.label, url: agreement.url, type: agreement.type || 'legal' })) : [],
          notice: 'Submit a request for review. Payment and treatment are separate steps.',
          disabledReason: isEnabled ? null : !legalReady ? 'Published agreements are unavailable.' : 'Quick Order is not enabled for customer use.',
        });
      }
      if (req.method === 'GET' && path === '/catalog') {
        const config = await ports.config(session);
        requireEnabled(config);
        const pageValue = url.searchParams.get('page') || '1';
        if (!/^[1-9]\d{0,4}$/u.test(pageValue) || url.searchParams.getAll('page').length > 1 || url.searchParams.getAll('search').length > 1) throw new InputError('page', 'Invalid page.');
        const search = (url.searchParams.get('search') || '').trim();
        if (search.length > 120 || /[\u0000-\u001f\u007f]/u.test(search)) throw new InputError('search', 'Enter a shorter search without control characters.');
        const page = Number(pageValue), pageSize = 24;
        const result = await ports.listCatalog(session, { page, pageSize, search });
        const expectedLength = result && Math.max(0, Math.min(pageSize, result.total - (page - 1) * pageSize));
        if (!result || !Number.isSafeInteger(result.total) || result.total < 0 || result.page !== page || result.pageSize !== pageSize || !Array.isArray(result.items) || result.items.length !== expectedLength) throw new InputError('catalog', 'Catalog pagination unavailable.', 503, 'catalog_unavailable');
        const items = result.items.map(publicCatalogItem);
        if (new Set(items.map(item => JSON.stringify([item.productId, item.variantId]))).size !== items.length) throw new InputError('catalog', 'Catalog pagination unavailable.', 503, 'catalog_unavailable');
        return send(res, 200, { items, total: result.total, page, pageSize });
      }
      return send(res, 404, { code: 'not_found' });
    } catch (error) {
      if (error instanceof InputError) return send(res, error.status, { code: error.code, field: error.field, message: error.message });
      return unavailable(res, ports);
    }
  };
}

/** Place after upstream parsers and before the host's general error handler. */
export function createQuickOrderErrorHandler({ prefix: configuredPrefix } = {}) {
  const prefix = prefixValue(configuredPrefix);
  return function handleParserError(error, req, res, next) {
    const target = classifyQuickOrderTarget(req, prefix);
    if (target.kind === 'unrelated') return next(error);
    if (target.kind === 'owned-malformed') return send(res, 400, { code: 'invalid_request', field: 'request', message: 'Invalid request path.' });
    if (error?.type === 'entity.too.large' || error?.status === 413) return send(res, 413, { code: 'payload_too_large', message: 'Request is too large.' });
    if (['entity.parse.failed', 'request.aborted', 'request.size.invalid'].includes(error?.type) || error?.status === 400) return send(res, 400, { code: 'invalid_json', message: 'Invalid JSON.' });
    return unavailable(res);
  };
}

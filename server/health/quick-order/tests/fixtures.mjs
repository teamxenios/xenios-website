// Private unit fixtures only. This Map is not an application adapter and proves
// no database durability, transaction isolation, multi-process safety or Auth.
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { InputError } from '../core.mjs';
import { createQuickOrderHandler } from '../handler.mjs';

export const ORIGIN = 'https://quick-order.example.test';
export const PREFIX = '/api/health/quick-order';
export const CSRF = 'synthetic-session-bound-csrf';
export const AGREEMENTS = [
  { kind: 'synthetic_test_policy', version: 'test-v1', label: 'Synthetic test policy', type: 'legal', url: '/policies/test' },
  { kind: 'assisted_order_form_v1:accuracy', version: 'aeb2ba5a069dd3f4', label: 'I confirm that the information I provided is accurate to the best of my knowledge.', type: 'form_acknowledgment', url: null },
  { kind: 'assisted_order_form_v1:contact_consent', version: '6da1cc70338029ed', label: 'I agree that Xenios may contact me regarding this request and the next steps.', type: 'form_acknowledgment', url: null },
  { kind: 'assisted_order_form_v1:request_notice', version: '22788ae1ac7cab44', label: 'I understand that this submission is an order request, not an accepted order or completed purchase. Xenios will confirm availability, pricing, documentation requirements, and the next steps before fulfillment.', type: 'form_acknowledgment', url: null },
];
export const ITEM = {
  productId: 'synthetic-product', variantId: 'synthetic-variant', productName: 'Synthetic permitted item', specification: null,
  family: 'wellness', workflowMode: 'direct_order_request', unitPriceCents: 2500, currency: 'USD',
  catalogVersion: 'catalog-test-v1', priceVersion: 'price-test-v1', minimumQuantity: 1, maximumQuantity: 50, quantityIncrement: 1,
  researchUseOnly: false, requestable: true, accessNotice: null,
};
export function sampleInput() {
  return {
    schemaVersion: 'quick-order-v1', idempotencyKey: 'synthetic-key-00000001',
    contact: { fullLegalName: 'Synthetic Customer', email: 'customer@example.test', mobilePhone: '(202) 555-0123', organizationName: '', ageConfirmed: true,
      shippingAddress: { line1: '123 Example Street', line2: '', city: 'Austin', region: 'TX', postalCode: '78701', countryCode: 'US' }, billingSameAsShipping: true },
    referral: { kind: 'direct', detail: '', declaredCode: '', confirmed: true }, affiliation: { kind: 'none', detail: '' },
    lines: [{ productId: ITEM.productId, variantId: ITEM.variantId, quantity: 1, expectedCatalogVersion: ITEM.catalogVersion, expectedPriceVersion: ITEM.priceVersion }],
    agreements: AGREEMENTS.map(({ kind, version }) => ({ kind, version })), requestAcknowledged: true,
  };
}
export function testPorts() {
  const records = new Map(), calls = [];
  const ports = {
    productionReady: true, records, calls, actor: 'synthetic-account-a',
    session: async () => ({ actorId: ports.actor, csrfToken: CSRF }),
    config: async () => { calls.push('config'); return { enabled: true, agreements: structuredClone(AGREEMENTS) }; },
    listCatalog: async (_session, query) => ({ items: query.page === 1 ? [structuredClone(ITEM)] : [], total: 1, page: query.page, pageSize: query.pageSize }),
    resolveItem: async (_session, productId, variantId) => { calls.push('resolve'); return productId === ITEM.productId && variantId === ITEM.variantId ? structuredClone(ITEM) : null; },
    takeRateLimit: async () => true,
    getExisting: async (session, key) => { calls.push('lookup'); return records.get(JSON.stringify([session.actorId, key])) || null; },
    commit: async (session, args) => {
      calls.push('commit');
      const key = JSON.stringify([session.actorId, args.input.idempotencyKey]), existing = records.get(key);
      if (existing) {
        if (existing.payloadHash !== args.payloadHash) throw new InputError('request', 'Conflicting request details.', 409, 'idempotency_conflict');
        return { ...existing.publicReceipt, persisted: true, replayed: true };
      }
      const publicReceipt = { requestId: randomUUID(), publicReference: `XRR-20261005-${String(records.size + 1).padStart(10, '0')}`, attributionState: args.attribution.reviewState, estimate: args.computedEstimate };
      records.set(key, { payloadHash: args.payloadHash, publicReceipt, args });
      return { ...publicReceipt, persisted: true };
    },
  };
  return ports;
}
export function fixture(modify = () => {}, options = {}) {
  const ports = testPorts();
  modify(ports);
  const handler = createQuickOrderHandler(ports, { origin: ORIGIN, enabled: true, ...options });
  async function invoke(path, { method = 'GET', input, raw, headers = {}, upstream = false, omitRawBody = false, parsedBody, originalUrl } = {}) {
    const bytes = raw !== undefined ? Buffer.from(raw) : input !== undefined ? Buffer.from(JSON.stringify(input)) : Buffer.alloc(0);
    const req = Readable.from([bytes]);
    req.url = path;
    req.method = method;
    req.headers = { ...(method === 'POST' ? { origin: ORIGIN, 'content-type': 'application/json', 'x-csrf-token': CSRF, 'content-length': String(bytes.length) } : {}), ...headers };
    if (originalUrl !== undefined) req.originalUrl = originalUrl;
    if (upstream) { req.body = parsedBody ?? input ?? {}; if (!omitRawBody) req.rawBody = bytes; }
    const output = { status: null, body: null, headers: {}, next: false };
    const res = { statusCode: 200, setHeader(key, value) { output.headers[key.toLowerCase()] = value; }, end(value) { output.status = this.statusCode; output.body = JSON.parse(value); } };
    await handler(req, res, () => { output.next = true; });
    return output;
  }
  return { ports, invoke, get: (path = '/config') => invoke(PREFIX + path), post: (input = sampleInput(), options = {}) => invoke(PREFIX + '/requests', { method: 'POST', input, ...options }) };
}

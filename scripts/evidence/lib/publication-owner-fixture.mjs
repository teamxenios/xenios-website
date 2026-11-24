// Private UI protocol fixture only. Importing starts no server/browser or provider.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PRODUCT, EXACT, syntheticProduct } from './product-studio-fixture.mjs';

export const OWNER_SOURCE = 'ea78e6bcb24b247074f3b76f5e73addc73bb755a';
export const OWNER_TREE = '49651b5d5ab6914227957e7b3faf84c7e2445847';
export const OWNER_IDENTITY = Object.freeze({ offeringId: 'mo_ab', offeringVariantId: 'mov_cd', productId: PRODUCT, variantId: EXACT });
export const OWNER_MEDIA = '66666666-6666-4666-8666-666666666666';
export const OWNER_BASE = '/api/admin/research/products/' + PRODUCT + '/variants/' + EXACT + '/catalog-publication';
export const OWNER_APPROVAL = OWNER_BASE + '/approval';
export const EXPIRED_APPROVALS = Object.freeze(['88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999']);
const FRESH_APPROVALS = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'];
const REVISION = '77777777-7777-4777-8777-777777777777';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9mQAAAAASUVORK5CYII=', 'base64');
const hash = value => createHash('sha256').update(value).digest('hex');
export const OWNER_MEDIA_SHA256 = hash(PNG);
export const OWNER_SOURCE_SHA256 = hash('SYNTHETIC UI SOURCE — NOT ACTUAL REVIEWED PRODUCT OR RIGHTS');
export const OWNER_METADATA = Object.freeze({
  contentApprovalReference: 'SYNTHETIC-ONLY-CONTENT-REVIEW',
  rightsEvidenceReference: 'SYNTHETIC-NOT-REAL-RIGHTS',
  expiresAt: null, width: 1, height: 1, representation: 'catalog_reference', packagingDesign: false,
});
const clone = value => JSON.parse(JSON.stringify(value));
const identity = () => clone(OWNER_IDENTITY);
const sameKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const outcome = (status, body) => ({ status, body });
const denied = () => outcome(403, { error: 'synthetic_owner_capability_absent', operationConfirmed: false });

export function ownerFixtureProduct() {
  const product = syntheticProduct();
  // The approved row is protocol input, not actual storage/review/rights evidence.
  // storageKey remains null; no private locator, signed URL or invented image is exposed.
  product.media = [{
    id: OWNER_MEDIA, productId: PRODUCT, kind: 'primary_image', state: 'approved',
    storageKey: null, filename: 'SYNTHETIC-UI-PROTOCOL-ONLY.png', contentType: 'image/png',
    sizeBytes: PNG.length, altText: 'Synthetic one-pixel protocol fixture, not product artwork',
    sortOrder: 0, approvedBy: 'synthetic-only', createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z',
  }];
  return product;
}

/** Role is Root-selected at process construction, never read from a browser query/body.
 * This is a finite UI transport model, NOT the production approval/rights authority.
 * Existing actual admin guard must precede every model call in the loopback wrapper.
 */
export function createOwnerProtocolFixture(role) {
  assert(['owner', 'staff'].includes(role), 'EXACT_FIXTURE_ROLE_REQUIRED');
  const owner = role === 'owner';
  let version = 2, newApprovals = 0;
  const history = EXPIRED_APPROVALS.map((approvalId, n) => ({
    approvalId, recordedDecision: 'approved', approvalVersion: n + 1,
    sourceSha256: OWNER_SOURCE_SHA256, mediaId: OWNER_MEDIA, mediaVersion: 1,
    mediaSha256: OWNER_MEDIA_SHA256, expiresAt: '2020-01-01T00:00:00.000Z',
  }));
  const operations = new Map();
  const counts = { headReads: 0, approvalReads: 0, previews: 0,
    approveAttempts: 0, approveCommits: 0, approveReplays: 0, revokeAttempts: 0, revokeCommits: 0,
    unknownAcknowledgments: 0, refusedWrites: 0, unexpectedRequests: 0 };
  const records = [];
  function snapshot() {
    return { kind: 'OWNER_APPROVAL_UI_PROTOCOL_FIXTURE_NOT_AUTHORITY', role, approvalVersion: version,
      counts: clone(counts), records: clone(records), history: clone(history),
      realAuth: false, realOwnerGrant: false, realRights: false, publication: false, storageWrite: false };
  }
  function respond(method, target, rawBody = '', key) {
    if (method === 'GET' && target === OWNER_BASE) {
      counts.headReads++;
      return outcome(200, { identity: identity(), generation: 7, currentRevisionId: REVISION,
        revisions: [{ revisionId: REVISION, previouslyPublished: true }], operations: [], historyTruncated: false });
    }
    if (method === 'GET' && target === OWNER_APPROVAL) {
      counts.approvalReads++;
      return outcome(200, { identity: identity(), approvalVersion: version, ownerAuthorized: owner,
        approvals: owner ? clone(history) : [], historyTruncated: false });
    }
    const preview = method === 'POST' && target === OWNER_APPROVAL + '/preview';
    const approve = method === 'POST' && target === OWNER_APPROVAL;
    const expired = EXPIRED_APPROVALS.find(id => target === OWNER_APPROVAL + '/' + id + '/revoke');
    const revoke = method === 'POST' && Boolean(expired);
    if (!preview && !approve && !revoke) { counts.unexpectedRequests++; return outcome(404, { error: 'fixture_operation_not_admitted' }); }
    if (!owner) { counts.refusedWrites++; return denied(); }
    if (typeof rawBody !== 'string' || Buffer.byteLength(rawBody) > 16384) { counts.refusedWrites++; return outcome(400, { error: 'fixture_body_bound' }); }
    let body;
    try { body = JSON.parse(rawBody); } catch { counts.refusedWrites++; return outcome(400, { error: 'fixture_json' }); }
    if (preview) {
      if (!sameKeys(body, ['mediaId']) || body.mediaId !== OWNER_MEDIA || key !== undefined) {
        counts.refusedWrites++; return outcome(400, { error: 'fixture_preview_shape' });
      }
      counts.previews++;
      return outcome(200, { identity: identity(), approvalVersion: version, ownerAuthorized: true,
        sourceSha256: OWNER_SOURCE_SHA256,
        content: { summary: 'SYNTHETIC owner preview — not real approved product content.',
          overview: 'UI protocol fixture only. No legal rights, product availability or publication is established.' },
        media: { mediaId: OWNER_MEDIA, mediaVersion: 1, altText: 'Synthetic one-pixel protocol bytes',
          contentType: 'image/png', sizeBytes: PNG.length, sha256: OWNER_MEDIA_SHA256 } });
    }
    if (typeof key !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(key)) {
      counts.refusedWrites++; return outcome(400, { error: 'fixture_key_shape' });
    }
    const operation = approve ? 'approve' : 'revoke';
    const bodySha256 = hash(rawBody), keySha256 = hash(key);
    if (approve) counts.approveAttempts++; else counts.revokeAttempts++;
    const prior = operations.get(key);
    if (prior) {
      if (prior.target !== target || prior.bodySha256 !== bodySha256) {
        counts.refusedWrites++; return outcome(409, { error: 'publication_idempotency_conflict', operationConfirmed: false });
      }
      if (approve) counts.approveReplays++;
      records.push({ operation, keySha256, bodySha256, replayed: true, status: 200 });
      return outcome(200, { ...clone(prior.receipt), replayed: true });
    }
    if (!Number.isSafeInteger(body?.expectedApprovalVersion) || body.expectedApprovalVersion !== version) {
      counts.refusedWrites++; return outcome(409, { error: 'publication_approval_version_conflict', operationConfirmed: false });
    }
    if (approve) {
      const expected = { expectedApprovalVersion: version, mediaId: OWNER_MEDIA,
        sourceSha256: OWNER_SOURCE_SHA256, expectedMediaSha256: OWNER_MEDIA_SHA256, ...OWNER_METADATA };
      if (!sameKeys(body, Object.keys(expected)) || Object.keys(expected).some(k => body[k] !== expected[k]) || newApprovals >= 2) {
        counts.refusedWrites++; return outcome(400, { error: 'fixture_approval_intent' });
      }
      const approvalId = FRESH_APPROVALS[newApprovals++];
      version++;
      const receipt = { operation, identity: identity(), approvalId, approvalVersion: version, decision: 'approved', replayed: false };
      history.push({ approvalId, recordedDecision: 'approved', approvalVersion: version,
        sourceSha256: OWNER_SOURCE_SHA256, mediaId: OWNER_MEDIA, mediaVersion: 1,
        mediaSha256: OWNER_MEDIA_SHA256, expiresAt: null });
      operations.set(key, { target, bodySha256, receipt });
      counts.approveCommits++; counts.unknownAcknowledgments++;
      records.push({ operation, keySha256, bodySha256, replayed: false, status: 503 });
      return outcome(503, { error: 'SYNTHETIC_COMMITTED_ACKNOWLEDGMENT_UNCONFIRMED' });
    }
    if (!sameKeys(body, ['expectedApprovalVersion', 'reason']) || body.reason !== 'SYNTHETIC revoke expired record') {
      counts.refusedWrites++; return outcome(400, { error: 'fixture_revoke_intent' });
    }
    const row = history.find(r => r.approvalId === expired && r.recordedDecision === 'approved');
    if (!row) { counts.refusedWrites++; return outcome(409, { error: 'publication_approval_already_revoked', operationConfirmed: false }); }
    version++; row.recordedDecision = 'revoked'; row.approvalVersion = version;
    const receipt = { operation, identity: identity(), approvalId: expired, approvalVersion: version, decision: 'revoked', replayed: false };
    operations.set(key, { target, bodySha256, receipt }); counts.revokeCommits++;
    records.push({ operation, keySha256, bodySha256, replayed: false, status: 200 });
    return outcome(200, receipt);
  }
  return Object.freeze({ role, respond, snapshot });
}


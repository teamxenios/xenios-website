import { ASSISTED_ORDER_CURRENCY, ASSISTED_ORDER_MAX_QUANTITY, ASSISTED_ORDER_SOURCE, assistedOrderWorkflowModes } from "../../../shared/research/assisted-order/contract";
import type { QuickOrderAdminObservation, QuickOrderAdminProjection, QuickOrderAffiliationKind, QuickOrderDeclaredSource, QuickOrderEstimate, QuickOrderInitialReviewState, QuickOrderIntakeProjection, QuickOrderNotificationStatus } from "../../../shared/research/assisted-order/quick-order";
import { AFFILIATIONS, SOURCE_KINDS, text as normalizedDeclarationText } from "../health/quick-order/core.mjs";

/** Proposed wire identities, not installed RPCs, approved templates or adapters. */
export const QUICK_ORDER_ADMIN_ENVELOPE_VERSION = "quick-order-admin-envelope-v1" as const;
export const PROPOSED_QUICK_ORDER_ADMIN_TEMPLATE = "research.assisted_order.quick_order.submitted.admin.v1" as const;
const SCHEMA = "quick-order-v1";
type Row = Record<string, unknown>;
export class QuickOrderAdminEnvelopeError extends Error {
  constructor() { super("Quick Order admin evidence is unavailable."); this.name = "QuickOrderAdminEnvelopeError"; }
}
function refuse(): never { throw new QuickOrderAdminEnvelopeError(); }
function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) refuse();
  if (Reflect.ownKeys(value).some(key => typeof key !== "string" || !Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), "value"))) refuse();
  return value as Row;
}
function closed(value: unknown, keys: readonly string[]): Row {
  const row = object(value);
  if (Reflect.ownKeys(row).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(row, key))) refuse();
  return row;
}
function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(value)) refuse();
  return value;
}
function bound(value: unknown, expected: string): void { if (value !== expected) refuse(); }
function canonicalText(value: unknown, max: number, optional = false): string {
  try {
    const result = normalizedDeclarationText(value, "retained declaration", max, optional);
    if (value !== result) refuse();
    return result;
  } catch { return refuse(); }
}
function timestamp(value: unknown): string {
  // Proposed envelope uses normalized UTC millisecond strings. No clock read or
  // freshness assertion: this validates representation, not database currentness.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) refuse();
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) refuse();
  return value;
}
function nullableTime(value: unknown): string | null { return value === null ? null : timestamp(value); }
function nonnegative(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) refuse();
  return value as number;
}
function estimate(value: unknown): QuickOrderEstimate {
  const row = closed(value, ["knownSubtotalCents", "estimateComplete", "currency"]);
  if (row.currency !== ASSISTED_ORDER_CURRENCY || typeof row.estimateComplete !== "boolean") refuse();
  return Object.freeze({ knownSubtotalCents: nonnegative(row.knownSubtotalCents), estimateComplete: row.estimateComplete, currency: ASSISTED_ORDER_CURRENCY });
}
function sameEstimate(value: unknown, expected: QuickOrderEstimate): void {
  const actual = estimate(value);
  if (actual.knownSubtotalCents !== expected.knownSubtotalCents || actual.estimateComplete !== expected.estimateComplete) refuse();
}
function intake(value: unknown): QuickOrderIntakeProjection {
  const row = closed(value, ["schemaVersion", "source", "sourceDetail", "declaredCode", "affiliationKind", "affiliationDetail", "confirmedByCustomer", "confirmedAt", "requestAcknowledged", "reviewState", "commissionState", "estimate"]);
  if (row.schemaVersion !== SCHEMA || typeof row.source !== "string" || !SOURCE_KINDS.includes(row.source) || typeof row.affiliationKind !== "string" || !AFFILIATIONS.includes(row.affiliationKind)) refuse();
  const sourceDetail = canonicalText(row.sourceDetail, 180, row.source === "direct");
  const affiliationDetail = canonicalText(row.affiliationDetail, 180, row.affiliationKind === "none");
  if (row.affiliationKind === "none" && affiliationDetail !== "") refuse();
  const declaredCode = row.declaredCode === null ? null : canonicalText(row.declaredCode, 64);
  if (declaredCode !== null && !/^[A-Z0-9_-]{1,64}$/u.test(declaredCode)) refuse();
  const reviewState: QuickOrderInitialReviewState = row.source === "direct" && declaredCode === null ? "direct_no_referrer" : "captured_unmatched";
  if (row.confirmedByCustomer !== true || row.requestAcknowledged !== true || row.commissionState !== "not_authorized" || row.reviewState !== reviewState) refuse();
  return Object.freeze({ schemaVersion: SCHEMA, source: row.source as QuickOrderDeclaredSource, sourceDetail, declaredCode, affiliationKind: row.affiliationKind as QuickOrderAffiliationKind, affiliationDetail, confirmedByCustomer: true, confirmedAt: timestamp(row.confirmedAt), requestAcknowledged: true, reviewState, commissionState: "not_authorized", estimate: estimate(row.estimate) });
}

const DETAIL_KEYS = ["requestId", "publicReference", "status", "source", "actorMemberId", "fullLegalName", "email", "mobilePhone", "organizationName", "shippingAddress", "billingAddress", "lines", "estimatedTotalCents", "currency", "generalNotes", "agreements", "affiliateAttributionRef", "declaredAffiliateCode", "declaredAffiliateCodeState", "timeline", "documents", "createdAt", "updatedAt"] as const;
const LINE_KEYS = ["lineId", "productId", "variantId", "productName", "specification", "format", "packBasis", "quantity", "minimumQuantity", "maximumQuantity", "quantityIncrement", "workflowMode", "customerActionLabel", "unitPriceCents", "lineEstimateCents", "currency", "catalogVersion", "priceVersion", "accessNotice", "researchUseOnly"] as const;
function verifyCanonicalEstimate(detail: Row, expected: QuickOrderEstimate): void {
  if (!Array.isArray(detail.lines) || detail.lines.length < 1 || detail.lines.length > 100) refuse();
  let subtotal = 0, complete = true;
  const seen = new Set<string>();
  for (const value of detail.lines) {
    const line = closed(value, LINE_KEYS);
    // Canonical retained-line identities have a160-character bound. The QO
    // browser input's200-character limit does not enlarge that stored contract.
    const product = canonicalText(line.productId, 160), variant = canonicalText(line.variantId, 160);
    const identity = JSON.stringify([product, variant]);
    if (seen.has(identity)) refuse(); seen.add(identity);
    const quantity = nonnegative(line.quantity);
    if (quantity < 1 || quantity > ASSISTED_ORDER_MAX_QUANTITY || typeof line.workflowMode !== "string" || !(assistedOrderWorkflowModes as readonly string[]).includes(line.workflowMode) || line.currency !== ASSISTED_ORDER_CURRENCY) refuse();
    // Match the recorded QO submission restrictions, not today's catalog.
    if (line.researchUseOnly !== false || ["provider_request", "request_activation", "availability_review"].includes(line.workflowMode)) refuse();
    const minimum = nonnegative(line.minimumQuantity), increment = nonnegative(line.quantityIncrement);
    const maximum = line.maximumQuantity === null ? null : nonnegative(line.maximumQuantity);
    if (minimum < 1 || increment < 1 || quantity < minimum || (quantity - minimum) % increment !== 0 || (maximum !== null && (maximum < minimum || quantity > maximum))) refuse();
    if (line.workflowMode === "request_pricing" && line.unitPriceCents !== null) refuse();
    if (line.unitPriceCents === null) {
      if (line.lineEstimateCents !== null) refuse(); complete = false;
    } else {
      const unit = nonnegative(line.unitPriceCents), amount = unit * quantity;
      if (unit === 0 || !Number.isSafeInteger(amount) || line.lineEstimateCents !== amount || !Number.isSafeInteger(subtotal + amount)) refuse();
      subtotal += amount;
    }
  }
  if (expected.knownSubtotalCents !== subtotal || expected.estimateComplete !== complete || detail.estimatedTotalCents !== (subtotal === 0 ? null : subtotal) || detail.currency !== ASSISTED_ORDER_CURRENCY) refuse();
}
function observation(value: unknown, eventKey: string): QuickOrderAdminObservation {
  const row = object(value);
  if (row.state === "stale") { closed(row, ["state"]); return Object.freeze({ state: "stale" }); }
  closed(row, ["state", "eventKey", "observedAt", "notification"]);
  if (row.state !== "observed") refuse();
  bound(row.eventKey, eventKey);
  const observedAt = timestamp(row.observedAt);
  const item = closed(row.notification, ["status", "attemptCount", "nextAttemptAt", "completedAt"]);
  // Later canonical outbox migration20261001040351 adds held; the worker's
  // five-status count loop is not the full schema vocabulary.
  const statuses: readonly string[] = ["held", "pending", "processing", "sent", "delivered", "failed_retryable", "failed_permanent", "cancelled"];
  if (typeof item.status !== "string" || !statuses.includes(item.status)) refuse();
  const attemptCount = nonnegative(item.attemptCount), nextAttemptAt = timestamp(item.nextAttemptAt), completedAt = nullableTime(item.completedAt);
  // No attempt ceiling, chronology or status/completion equivalence is inferred.
  // Manual requeue resets the counter; terminal rows may retain next-attempt time.
  return Object.freeze({ state: "observed", observedAt, notification: Object.freeze({ status: item.status as QuickOrderNotificationStatus, attemptCount, nextAttemptAt, completedAt }) });
}

/** Pure proposed service-only envelope decoder; no RPC/client/storage access.
 * null is only an absent request. Missing enrichment is never legacy fallback.
 * The returned detail remains unknown and MUST still pass the existing canonical
 * admin-detail decoder and read_all guard in a separately authorized integration.
 * This checks evidence consistency, never existence, authenticity or atomicity. */
export function decodeQuickOrderAdminEnvelope(value: unknown, expectedRequestId: string): Readonly<{ detail: unknown; quickOrder: QuickOrderAdminProjection | null }> | null {
  uuid(expectedRequestId);
  if (value === null) return null;
  const envelope = closed(value, ["schemaVersion", "requestId", "detail", "submittedEvent", "enrichment"]);
  if (envelope.schemaVersion !== QUICK_ORDER_ADMIN_ENVELOPE_VERSION) refuse();
  bound(uuid(envelope.requestId), expectedRequestId);
  const detail = closed(envelope.detail, DETAIL_KEYS);
  bound(uuid(detail.requestId), expectedRequestId);
  bound(detail.source, ASSISTED_ORDER_SOURCE);
  const publicReference = canonicalText(detail.publicReference, 100);
  if (!/^XRR-[0-9]{8}-[A-F0-9]{10}$/u.test(publicReference)) refuse();
  if (envelope.enrichment === null) {
    if (envelope.submittedEvent !== null) refuse();
    return Object.freeze({ detail: envelope.detail, quickOrder: null });
  }
  const marker = closed(envelope.submittedEvent, ["schemaVersion", "requestId", "eventType", "occurredAt", "payloadHash"]);
  if (marker.schemaVersion !== SCHEMA || marker.eventType !== "submitted" || typeof marker.payloadHash !== "string" || !/^[a-f0-9]{64}$/u.test(marker.payloadHash)) refuse();
  bound(marker.requestId, expectedRequestId);
  const evidence = closed(envelope.enrichment, ["schemaVersion", "companion", "receipt", "obligation", "observation"]);
  if (evidence.schemaVersion !== SCHEMA) refuse();
  const companion = closed(evidence.companion, ["requestId", "payloadHash", "intake"]);
  bound(companion.requestId, expectedRequestId); bound(companion.payloadHash, marker.payloadHash);
  const projected = intake(companion.intake);
  bound(timestamp(marker.occurredAt), projected.confirmedAt); bound(timestamp(detail.createdAt), projected.confirmedAt);
  const receipt = closed(evidence.receipt, ["schemaVersion", "requestId", "publicReference", "payloadHash", "attributionState", "estimate"]);
  if (receipt.schemaVersion !== SCHEMA || receipt.attributionState !== projected.reviewState) refuse();
  bound(receipt.requestId, expectedRequestId); bound(receipt.publicReference, publicReference); bound(receipt.payloadHash, marker.payloadHash);
  sameEstimate(receipt.estimate, projected.estimate); verifyCanonicalEstimate(detail, projected.estimate);
  const obligation = closed(evidence.obligation, ["eventKey", "templateKey", "payload"]);
  const eventKey = `assisted-order:${expectedRequestId}:quick-order-submitted:admin`;
  bound(obligation.eventKey, eventKey);
  bound(obligation.templateKey, PROPOSED_QUICK_ORDER_ADMIN_TEMPLATE);
  const payload = closed(obligation.payload, ["schemaVersion", "requestId", "publicReference"]);
  if (payload.schemaVersion !== SCHEMA) refuse();
  bound(payload.requestId, expectedRequestId); bound(payload.publicReference, publicReference);
  const quickOrder = Object.freeze({ intake: projected, observation: observation(evidence.observation, eventKey) });
  return Object.freeze({ detail: envelope.detail, quickOrder });
}

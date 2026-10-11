import { createHash } from "node:crypto";
import { ASSISTED_ORDER_CURRENCY, ASSISTED_ORDER_MAX_QUANTITY, ASSISTED_ORDER_SOURCE, assistedOrderWorkflowModes } from "../../../shared/research/assisted-order/contract";
import type { QuickOrderAdminObservation, QuickOrderAdminProjection, QuickOrderAffiliationKind, QuickOrderDeclaredSource, QuickOrderEstimate, QuickOrderInitialReviewState, QuickOrderIntakeProjection, QuickOrderNotificationStatus } from "../../../shared/research/assisted-order/quick-order";
import { AFFILIATIONS, SOURCE_KINDS, ESTIMATE_EXCLUSIONS, InputError, text as normalizedDeclarationText } from "../health/quick-order/core.mjs";
import { submissionHash } from "../health/quick-order/handler.mjs";
import type { AssistedOrderViewer } from "./ports";
import type { CommitArguments, PublicReceipt, QuickOrderAttempt, QuickOrderDisabledTransactionExtension, QuickOrderPrivateContext } from "../health/quick-order/ports";

/** Proposed wire identities, not installed RPCs, approved templates or adapters. */
// Source-only reader cutover dependency. Deployment requires the future wrapper
// to be installed and independently qualified; a missing RPC must never fall back.
export const QUICK_ORDER_ADMIN_DETAIL_RPC = "research_health_quick_order_admin_detail" as const;
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

export const QUICK_ORDER_COMMIT_RPC = "research_health_quick_order_commit" as const;
export const QUICK_ORDER_REPLAY_RPC = "research_health_quick_order_replay" as const;
export type QuickOrderCommitOutcome = "DEFINITE_REFUSAL" | "DEFINITE_REFUSAL_RETRYABLE" | "OUTCOME_UNCERTAIN" | "IDEMPOTENCY_CONFLICT";

/** Deliberately sanitized: no payload, recipient, session hash, SQL detail or
 * connection identity is attached to an error. The unchanged handler retains
 * the submitted key on 503, and may recover it through the read-only RPC. */
export class QuickOrderTransactionError extends InputError {
  readonly outcome: QuickOrderCommitOutcome;
  constructor(outcome: QuickOrderCommitOutcome) {
    const conflict = outcome === "IDEMPOTENCY_CONFLICT";
    super("request", conflict ? "This request key was used with different details. Recover the original request before starting another."
      : "We could not confirm receipt. Keep this form open and retry using the same request; do not send payment.",
    conflict ? 409 : 503, conflict ? "idempotency_conflict" : "temporarily_unavailable");
    this.name = "QuickOrderTransactionError";
    this.outcome = outcome;
  }
}

export interface QuickOrderCandidateRpcResult {
  readonly data: unknown;
  readonly error: { readonly code?: string; readonly details?: string } | null;
  /** Trusted transport metadata, never an RPC JSON field. Absent means unknown.
   * A future qualified single-RPC/autocommit transport must supply this proof;
   * the existing Supabase adapter is intentionally not changed or wired. */
  readonly transactionOutcome?: "committed" | "aborted";
}
export interface QuickOrderCandidateDependencies {
  rpc(name: string, args: Readonly<Record<string, unknown>>, options?: { readonly signal: AbortSignal }): Promise<QuickOrderCandidateRpcResult>;
  /** Independently accepted immutable binding, absent in real composition. */
  readonly expectedConfigurationDigest?: string | null;
  readonly approvedLimitsJson?: string | null;
  readonly notificationRecipient?: string | null;
  readonly privateContextFor?: (viewer: AssistedOrderViewer) => QuickOrderPrivateContext | null;
  readonly runtime?: {
    now(): number;
    /** Implementations must reject unsupported delays, never clamp to a
     * different timeout. This capability is also absent in real composition. */
    readonly maximumDelayMs: number;
    schedule(milliseconds: number, expire: () => void): () => void;
  } | null;
}

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const SHA256 = /^[a-f0-9]{64}$/u;
const KEY = /^[a-zA-Z0-9_-]{16,80}$/u;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/u;
const TIMER_FIELDS = ["lockTimeoutMs", "statementTimeoutMs", "transactionTimeoutMs", "idleTimeoutMs", "deadlockTimeoutMs", "cleanupMs", "attemptDeadlineMs", "acquisitionMs", "responseMs"] as const;
type Timers = Record<typeof TIMER_FIELDS[number], number>;
const definite = (): never => { throw new QuickOrderTransactionError("DEFINITE_REFUSAL"); };
function positiveMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return definite();
  return value;
}
function exactSum(...values: number[]): number {
  const sum = values.reduce((total, value) => total + value, 0);
  return positiveMs(sum);
}
function configuredText(value: unknown): string {
  if (typeof value !== "string" || !value || value !== value.trim() || /[^\x20-\x7e]/u.test(value)) return definite();
  return value;
}
function identity(value: unknown): { name: string; oid: string } {
  const row = closed(value, ["name", "oid"]);
  const name = configuredText(row.name), oid = configuredText(row.oid);
  if (!POSITIVE_DECIMAL.test(oid)) return definite();
  return { name, oid };
}
function timers(value: unknown, writer: boolean): Timers & Partial<Record<"gateWaitMs" | "postGateReserveMs", number>> {
  const row = closed(value, writer ? [...TIMER_FIELDS, "gateWaitMs", "postGateReserveMs"] : TIMER_FIELDS);
  const result = Object.fromEntries(TIMER_FIELDS.map(key => [key, positiveMs(row[key])])) as Timers & Partial<Record<"gateWaitMs" | "postGateReserveMs", number>>;
  if (!(result.idleTimeoutMs < result.statementTimeoutMs && result.statementTimeoutMs < result.transactionTimeoutMs)) return definite();
  if (result.attemptDeadlineMs !== exactSum(result.acquisitionMs, result.transactionTimeoutMs, result.cleanupMs, result.responseMs)) return definite();
  if (writer) {
    result.gateWaitMs = positiveMs(row.gateWaitMs);
    result.postGateReserveMs = positiveMs(row.postGateReserveMs);
    if (result.lockTimeoutMs !== result.gateWaitMs || exactSum(result.gateWaitMs, result.postGateReserveMs) >= result.statementTimeoutMs) return definite();
  } else if (result.lockTimeoutMs >= result.deadlockTimeoutMs) return definite();
  return result;
}

/** Canonical carrier preimage: compact ASCII JSON, keys in this fixed order,
 * with no final newline. Duplicate/extra/reordered keys and numeric coercions
 * fail the exact re-encoding comparison. The external digest is not in its own
 * preimage. This is consistency validation, not deployed/pre-BEGIN proof. */
function intakeBudget(raw: string | null | undefined, expected: string | null | undefined): number {
  if (typeof raw !== "string" || typeof expected !== "string" || !SHA256.test(expected) || sha256(raw) !== expected) return definite();
  const row = closed(JSON.parse(raw), ["schemaVersion", "profileId", "profileVersion", "database", "loginRole", "requestRole", "ownerRole", "routeClass", "routeId", "timeZone", "dateStyle", "intake", "writer", "enforcement"]);
  if (row.schemaVersion !== "quick-order-approved-limits-v1" || row.routeClass !== "intake") return definite();
  const intake = timers(row.intake, false), writer = timers(row.writer, true);
  if (writer.gateWaitMs! < exactSum(intake.transactionTimeoutMs, intake.cleanupMs)) return definite();
  const enforcement = closed(row.enforcement, ["preBeginAttestationSha256", "writerOrderAttestationSha256", "singleRpcAutocommit"]);
  if (typeof enforcement.preBeginAttestationSha256 !== "string" || !SHA256.test(enforcement.preBeginAttestationSha256)
    || typeof enforcement.writerOrderAttestationSha256 !== "string" || !SHA256.test(enforcement.writerOrderAttestationSha256)
    || enforcement.singleRpcAutocommit !== true) return definite();
  const canonical = {
    schemaVersion: row.schemaVersion, profileId: configuredText(row.profileId), profileVersion: configuredText(row.profileVersion),
    database: identity(row.database), loginRole: identity(row.loginRole), requestRole: identity(row.requestRole), ownerRole: identity(row.ownerRole),
    routeClass: row.routeClass, routeId: configuredText(row.routeId), timeZone: configuredText(row.timeZone), dateStyle: configuredText(row.dateStyle),
    intake, writer, enforcement: { preBeginAttestationSha256: enforcement.preBeginAttestationSha256, writerOrderAttestationSha256: enforcement.writerOrderAttestationSha256, singleRpcAutocommit: true },
  };
  if (JSON.stringify(canonical) !== raw) return definite();
  return intake.attemptDeadlineMs;
}
function actorFor(viewer: AssistedOrderViewer): string | null {
  if (!viewer.capabilities.has("assisted_orders:submit")) return null;
  if (viewer.actorType === "member" && viewer.memberId && viewer.authUserId && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(viewer.authUserId)) return `member:${viewer.authUserId}`;
  if (viewer.actorType === "early_access_session" && viewer.earlyAccessCustomerRef && /^eac_[a-f0-9]{32}$/u.test(viewer.earlyAccessCustomerRef)) return `early_access:${viewer.earlyAccessCustomerRef}`;
  return null;
}
function privateContext(value: unknown, actorId: string): QuickOrderPrivateContext {
  const row = closed(value, ["rawStoredSessionHash", "configuredOwnerId", "actorScope", "requiredRole"]);
  if (typeof row.rawStoredSessionHash !== "string" || !SHA256.test(row.rawStoredSessionHash) || row.actorScope !== actorId) return definite();
  return Object.freeze({ rawStoredSessionHash: row.rawStoredSessionHash, configuredOwnerId: uuid(row.configuredOwnerId), actorScope: actorId, requiredRole: configuredText(row.requiredRole) });
}
function receipt(value: unknown): PublicReceipt {
  const row = closed(value, ["requestId", "publicReference", "attributionState", "estimate"]);
  if (typeof row.publicReference !== "string" || !/^XRR-\d{8}-[A-F0-9]{10}$/u.test(row.publicReference)
    || !["direct_no_referrer", "captured_unmatched"].includes(row.attributionState as string)) return definite();
  const amounts = closed(row.estimate, ["knownSubtotalCents", "estimateComplete", "currency", "excludes"]);
  if (amounts.excludes !== ESTIMATE_EXCLUSIONS) return definite();
  const checked = estimate({ knownSubtotalCents: amounts.knownSubtotalCents, estimateComplete: amounts.estimateComplete, currency: amounts.currency });
  return Object.freeze({ requestId: uuid(row.requestId), publicReference: row.publicReference, attributionState: row.attributionState as PublicReceipt["attributionState"], estimate: Object.freeze({ ...checked, excludes: ESTIMATE_EXCLUSIONS }) });
}
function databaseRefusal(response: QuickOrderCandidateRpcResult): QuickOrderTransactionError {
  const error = response.error;
  // Session termination and codeless errors cannot acknowledge rollback. Do not
  // promote generic 23505/57014 into a key conflict or safe retry.
  if (!error?.code || ["25P03", "25P04"].includes(error.code) || response.transactionOutcome !== "aborted") return new QuickOrderTransactionError("OUTCOME_UNCERTAIN");
  if (["55P03", "40P01", "40001"].includes(error.code)) return new QuickOrderTransactionError("DEFINITE_REFUSAL_RETRYABLE");
  let detail: unknown;
  try { detail = JSON.parse(error.details ?? ""); } catch { return new QuickOrderTransactionError("OUTCOME_UNCERTAIN"); }
  try {
    const marker = closed(detail, ["quickOrderCode"]);
    if (error.code === "23505" && marker.quickOrderCode === "IDEMPOTENCY_CONFLICT") return new QuickOrderTransactionError("IDEMPOTENCY_CONFLICT");
    if (error.code === "55000" && marker.quickOrderCode === "DEFINITE_REFUSAL") return new QuickOrderTransactionError("DEFINITE_REFUSAL");
  } catch { /* Malformed/unrecognized database detail supplies no evidence. */ }
  return new QuickOrderTransactionError("OUTCOME_UNCERTAIN");
}

/** Disabled, injectable implementation over the EXISTING canonical RPC family.
 * No client, credentials, connection pool, settings or timer defaults are
 * created. Real production wiring supplies none of the private admission
 * dependencies. Recovery deliberately remains independent of those gates. */
export function createQuickOrderTransactionExtension(dependencies: QuickOrderCandidateDependencies): QuickOrderDisabledTransactionExtension {
  // Snapshot immutable constructor values; never consult browser input or a
  // later mutation of the caller's dependencies for recipient/config authority.
  const rpc = dependencies.rpc.bind(dependencies);
  const rawLimits = dependencies.approvedLimitsJson, expectedDigest = dependencies.expectedConfigurationDigest;
  const recipient = dependencies.notificationRecipient, contextFor = dependencies.privateContextFor;
  const runtime = dependencies.runtime;
  const now = runtime?.now.bind(runtime), schedule = runtime?.schedule.bind(runtime), maximumDelayMs = runtime?.maximumDelayMs;
  const attempts = new WeakMap<QuickOrderAttempt, { viewer: AssistedOrderViewer; actorId: string; context: QuickOrderPrivateContext; deadlineMs: number; used: boolean }>();
  const unavailable = () => new QuickOrderTransactionError("DEFINITE_REFUSAL");
  return {
    monotonicNow() { return now ? now() : Number.NaN; },
    beginAttempt(viewer, actorId, enteredAtMonotonicMs) {
      try {
        if (!now || !schedule || !Number.isFinite(enteredAtMonotonicMs) || enteredAtMonotonicMs < 0 || actorFor(viewer) !== actorId || !contextFor) return null;
        const deadlineMs = intakeBudget(rawLimits, expectedDigest);
        if (deadlineMs > positiveMs(maximumDelayMs) || typeof recipient !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipient)) return null;
        const context = privateContext(contextFor(viewer), actorId);
        const attempt = Object.freeze({ enteredAtMonotonicMs });
        attempts.set(attempt, { viewer, actorId, context, deadlineMs, used: false });
        return attempt;
      } catch { return null; }
    },
    async getExisting(viewer, actorId, key) {
      if (actorFor(viewer) !== actorId || !KEY.test(key)) throw unavailable();
      let response: QuickOrderCandidateRpcResult;
      try {
        response = await rpc(QUICK_ORDER_REPLAY_RPC, { p_actor_scope: actorId, p_key_hash: sha256(`xenios:health:quick-order:key:v1|${actorId}|${key}`) });
      } catch { throw new QuickOrderTransactionError("OUTCOME_UNCERTAIN"); }
      if (!response || response.error) throw new QuickOrderTransactionError("OUTCOME_UNCERTAIN");
      if (response.data === null) return null;
      try {
        const row = closed(response.data, ["payloadHash", "publicReceipt"]);
        if (typeof row.payloadHash !== "string" || !SHA256.test(row.payloadHash)) throw unavailable();
        return Object.freeze({ payloadHash: row.payloadHash, publicReceipt: receipt(row.publicReceipt) });
      } catch { throw new QuickOrderTransactionError("OUTCOME_UNCERTAIN"); }
    },
    async commit() { throw unavailable(); },
    async commitAttempt(viewer, actorId, args, attempt) {
      const state = attempts.get(attempt);
      if (!state || state.used || state.viewer !== viewer || state.actorId !== actorId || actorFor(viewer) !== actorId || !now || !schedule) throw unavailable();
      state.used = true;
      let submission: CommitArguments;
      try {
        // Copy before transmission; later caller mutation cannot change a key or
        // preflight snapshot while the transport is still serializing it.
        submission = structuredClone(args);
        if (!submission.input || !KEY.test(submission.input.idempotencyKey) || !SHA256.test(submission.payloadHash)
          || submissionHash(submission.input) !== submission.payloadHash) throw unavailable();
      } catch { throw unavailable(); }
      let elapsed: number;
      try { elapsed = now() - attempt.enteredAtMonotonicMs; } catch { throw unavailable(); }
      if (!Number.isFinite(elapsed) || elapsed < 0) throw unavailable();
      const remaining = state.deadlineMs - elapsed;
      if (remaining <= 0) throw new QuickOrderTransactionError("DEFINITE_REFUSAL_RETRYABLE");
      return new Promise<PublicReceipt & { persisted: true; replayed: boolean }>((resolve, reject) => {
        let transmitted = false, settled = false;
        let cancel: (() => void) | undefined;
        const controller = new AbortController();
        const finish = (error: QuickOrderTransactionError | null, value?: PublicReceipt & { persisted: true; replayed: boolean }) => {
          if (settled) return;
          settled = true;
          try { cancel?.(); } catch { /* Cancellation cannot replace the outcome. */ }
          if (error) reject(error); else resolve(value!);
        };
        try {
          cancel = schedule(remaining, () => {
            finish(new QuickOrderTransactionError(transmitted ? "OUTCOME_UNCERTAIN" : "DEFINITE_REFUSAL_RETRYABLE"));
            controller.abort(); // Cancels observation only; never proof of rollback.
          });
          if (settled) { cancel(); return; }
          const beforeSend = now() - attempt.enteredAtMonotonicMs;
          if (!Number.isFinite(beforeSend) || beforeSend < 0 || beforeSend >= state.deadlineMs) {
            finish(new QuickOrderTransactionError("DEFINITE_REFUSAL_RETRYABLE")); return;
          }
          transmitted = true; // Conservative even for a synchronous transport throw.
          const result = rpc(QUICK_ORDER_COMMIT_RPC, { p_payload: {
            schemaVersion: "quick-order-commit-v1", actorScope: actorId, context: state.context,
            expectedConfigurationDigest: expectedDigest, notificationRecipient: recipient, submission,
          } }, { signal: controller.signal });
          Promise.resolve(result).then(response => {
            if (settled) return;
            try {
              const completeElapsed = now() - attempt.enteredAtMonotonicMs;
              if (!Number.isFinite(completeElapsed) || completeElapsed < 0 || completeElapsed >= state.deadlineMs) throw new QuickOrderTransactionError("OUTCOME_UNCERTAIN");
              if (!response || response.error) throw response ? databaseRefusal(response) : new QuickOrderTransactionError("OUTCOME_UNCERTAIN");
              if (response.transactionOutcome !== "committed") throw new QuickOrderTransactionError("OUTCOME_UNCERTAIN");
              const row = closed(response.data, ["requestId", "publicReference", "attributionState", "estimate", "persisted", "replayed"]);
              if (row.persisted !== true || typeof row.replayed !== "boolean") throw unavailable();
              const saved = receipt({ requestId: row.requestId, publicReference: row.publicReference, attributionState: row.attributionState, estimate: row.estimate });
              if (saved.attributionState !== submission.attribution.reviewState || saved.estimate.knownSubtotalCents !== submission.computedEstimate.knownSubtotalCents
                || saved.estimate.estimateComplete !== submission.computedEstimate.estimateComplete) throw unavailable();
              finish(null, Object.freeze({ ...saved, persisted: true, replayed: row.replayed }));
            } catch (error) { finish(error instanceof QuickOrderTransactionError && response?.error ? error : new QuickOrderTransactionError("OUTCOME_UNCERTAIN")); }
          }, () => finish(new QuickOrderTransactionError("OUTCOME_UNCERTAIN")));
        } catch { finish(new QuickOrderTransactionError(transmitted ? "OUTCOME_UNCERTAIN" : "DEFINITE_REFUSAL")); }
      });
    },
  };
}

/**
 * Early Access supplier release and fulfillment. Server only, pure, side effect free.
 *
 * The ordering constraint this module exists to hold: NOTHING SHIPS BEFORE A HUMAN
 * CONFIRMED THE MONEY ARRIVED. `supplier-release.ts` already refuses to build a packet
 * from anything but a verified-order projection, which closes the SHAPE of the input.
 * This module closes its PROVENANCE: the projection must be backed by a real approval
 * row in the verification trail, matching on order, key, actor, role, timestamp, and
 * amount. A hand-built projection carrying `status: "payment_verified"` therefore
 * releases nothing, because no decision on file could have produced it.
 *
 * WHAT IS STORED IS NOT WHAT IS SENT. The supplier packet carries the shipping address,
 * which lives under its own consent and retention rules. The ledger row keeps only what
 * is needed to reconcile a shipment later: order, supplier, SKU, quantity, who released
 * it, when, and the decision that authorized it. The packet is returned to the caller
 * and never written here, so this ledger is not a second copy of a member's address.
 *
 * APPEND ONLY. A corrected tracking number is a new row with a higher sequence, so the
 * number the customer was originally given is still readable afterwards.
 *
 * The carrier and the tracking number arrive from a supplier, which makes them
 * untrusted text like any other. Separators, traversal runs, and control characters are
 * refused in both, because these two strings end up in customer copy and in carrier URLs.
 */

import {
  accepted,
  isBoundedText,
  isCanonicalTimestamp,
  isNotBefore,
  isSafeIdentifier,
  readPlainArray,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";
import {
  readEarlyAccessVerifiedOrder,
  type EarlyAccessVerifiedOrder,
} from "./payment-verification";
import {
  buildSupplierReleasePacket,
  type EarlyAccessSupplierReleasePacket,
  type SupplierReleaseFailureCode,
} from "./supplier-release";
import {
  COMMISSION_HOLD_KEYS,
  buildCommissionAccrual,
  commissionHoldFrom,
  readCommissionAccrual,
  type CommissionHoldFailureCode,
  type EarlyAccessCommissionAccrual,
  type EarlyAccessCommissionHold,
} from "./commission-event";
import {
  readEarlyAccessVerificationHistory,
  type EarlyAccessVerificationEntry,
} from "./verification-service";

/** Bounded like every other chain here. Re-tracking more than this is an escalation. */
export const EARLY_ACCESS_MAX_TRACKING_UPDATES = 8;

/**
 * A carrier name and a tracking number are shown to a customer and pasted into carrier
 * URLs. Both classes exclude slashes and backslashes, and `isBoundedText` already
 * refuses control characters, so neither can carry a path or a null byte into either place.
 */
const CARRIER = /^[A-Za-z0-9][A-Za-z0-9 .&-]{1,63}$/;
const TRACKING_NUMBER = /^[A-Za-z0-9][A-Za-z0-9-]{3,63}$/;

export type SupplierReleaseServiceFailureCode =
  | SupplierReleaseFailureCode
  | "input_invalid"
  | "decision_history_invalid"
  | "payment_not_verified"
  | "actor_invalid"
  | "released_at_invalid"
  | "release_already_recorded";

export type TrackingFailureCode =
  | "input_invalid"
  | "release_missing"
  | "carrier_invalid"
  | "tracking_number_invalid"
  | "actor_invalid"
  | "recorded_at_invalid"
  | "tracking_limit_reached"
  | "tracking_history_invalid";

export type FulfillmentFailureCode =
  | CommissionHoldFailureCode
  | "input_invalid"
  | "release_missing"
  | "tracking_missing"
  | "actor_invalid"
  | "fulfilled_at_invalid";

/** One supplier release as it is stored. There is at most one per order. */
export type EarlyAccessReleaseRecord = Readonly<{
  releaseId: string;
  orderId: string;
  supplierId: string;
  supplierSku: string;
  quantity: number;
  releasedByActorId: string;
  releasedAt: string;
  /** Ties the shipment back to the exact decision that authorized it. */
  verificationIdempotencyKey: string;
}>;

export const EARLY_ACCESS_RELEASE_RECORD_KEYS = [
  "releaseId",
  "orderId",
  "supplierId",
  "supplierSku",
  "quantity",
  "releasedByActorId",
  "releasedAt",
  "verificationIdempotencyKey",
] as const;

export type EarlyAccessTrackingRecord = Readonly<{
  releaseId: string;
  orderId: string;
  carrier: string;
  trackingNumber: string;
  recordedByActorId: string;
  recordedAt: string;
  /** One based position in this order's trail. Corrections append, never overwrite. */
  sequence: number;
}>;

export const EARLY_ACCESS_TRACKING_RECORD_KEYS = [
  "releaseId",
  "orderId",
  "carrier",
  "trackingNumber",
  "recordedByActorId",
  "recordedAt",
  "sequence",
] as const;

export type EarlyAccessFulfillmentRecord = Readonly<{
  orderId: string;
  releaseId: string;
  carrier: string;
  trackingNumber: string;
  fulfilledByActorId: string;
  fulfilledAt: string;
  /** Null when the order carried no referral, or no attribution was supplied. */
  commissionHold: EarlyAccessCommissionHold | null;
  /**
   * The server side economics behind the hold: policy, version, basis amount, rate, and
   * the commission they produced. Stored so a commission can be explained later without
   * recomputing it from a price list that may have moved.
   */
  commissionAccrual: EarlyAccessCommissionAccrual | null;
}>;

export const EARLY_ACCESS_FULFILLMENT_RECORD_KEYS = [
  "orderId",
  "releaseId",
  "carrier",
  "trackingNumber",
  "fulfilledByActorId",
  "fulfilledAt",
  "commissionHold",
  "commissionAccrual",
] as const;

export type EarlyAccessSupplierReleaseOutcome = Readonly<{
  /** What the ledger keeps. */
  record: EarlyAccessReleaseRecord;
  /** What the supplier is handed. Deliberately not persisted by this repository. */
  packet: EarlyAccessSupplierReleasePacket;
}>;

export type SupplierReleaseServiceResult = CommerceResult<
  EarlyAccessSupplierReleaseOutcome,
  SupplierReleaseServiceFailureCode
>;

export type TrackingResult = CommerceResult<EarlyAccessTrackingRecord, TrackingFailureCode>;

export type FulfillmentOutcome = Readonly<{
  record: EarlyAccessFulfillmentRecord;
  /** Non-null exactly once. A second fulfillment reports the original and writes nothing. */
  append: EarlyAccessFulfillmentRecord | null;
}>;

export type FulfillmentResult = CommerceResult<FulfillmentOutcome, FulfillmentFailureCode>;

const RELEASE_REQUIRED_KEYS = [
  "verifiedOrder",
  "decisions",
  "supplier",
  "actorId",
  "releasedAt",
] as const;

const TRACKING_REQUIRED_KEYS = [
  "release",
  "tracking",
  "carrier",
  "trackingNumber",
  "actorId",
  "recordedAt",
] as const;

const FULFILL_REQUIRED_KEYS = [
  "verifiedOrder",
  "release",
  "tracking",
  "fulfillments",
  "attribution",
  "actorId",
  "fulfilledAt",
] as const;

export function isCarrier(value: unknown): value is string {
  return isBoundedText(value, 64) && CARRIER.test(value);
}

export function isTrackingNumber(value: unknown): value is string {
  return isBoundedText(value, 64) && TRACKING_NUMBER.test(value);
}

/**
 * Find the approval that authorizes shipping this exact projection.
 *
 * Matching every field the projection claims to have inherited from the decision is
 * what makes the projection unforgeable: an attacker would need a real approval row,
 * written by an authorized human, for the same order, key, actor, role, time, and amount.
 */
export function authorizingApproval(
  verified: EarlyAccessVerifiedOrder,
  history: readonly EarlyAccessVerificationEntry[],
): EarlyAccessVerificationEntry | null {
  return (
    history.find(
      (entry) =>
        entry.decision === "approve" &&
        entry.orderId === verified.orderId &&
        entry.idempotencyKey === verified.verificationIdempotencyKey &&
        entry.actorId === verified.verifiedByActorId &&
        entry.actorRole === verified.verifiedByActorRole &&
        entry.decidedAt === verified.verifiedAt &&
        // The confirmed amount, and the amount that was owed, must both match the
        // projection. Matching against `orderTotalCents` (the pre-discount subtotal)
        // was how a discounted order could never find its own approval.
        entry.amountVerifiedCents === verified.verifiedAmountCents &&
        entry.payableTotalCents === verified.money.payableTotalCents &&
        entry.currency === verified.currency,
    ) ?? null
  );
}

/**
 * Describe the release of one verified order to its supplier.
 *
 * The verification trail is supplied rather than fetched so the ordering rule is a pure
 * function of its inputs: no approval in the trail, no packet, no exceptions.
 */
export function describeSupplierRelease(input: unknown): SupplierReleaseServiceResult {
  const record = readPlainRecord(input, RELEASE_REQUIRED_KEYS);
  if (!record) return refused("input_invalid");

  const verified = readEarlyAccessVerifiedOrder(record.verifiedOrder);
  if (!verified) return refused("verified_order_invalid");

  const history = readEarlyAccessVerificationHistory(record.decisions);
  if (!history) return refused("decision_history_invalid");

  // HARD RULE: a box moves only after a named human confirmed the money arrived.
  const approval = authorizingApproval(verified, history);
  if (approval === null) return refused("payment_not_verified");

  if (!isSafeIdentifier(record.actorId)) return refused("actor_invalid");
  if (!isCanonicalTimestamp(record.releasedAt)) return refused("released_at_invalid");
  // A release stamped before the approval it cites is not an ordering, it is a story.
  if (!isNotBefore(record.releasedAt, approval.decidedAt)) return refused("released_at_invalid");

  const packet = buildSupplierReleasePacket(record.verifiedOrder, record.supplier);
  if (!packet.ok) return refused(packet.code);

  return accepted(
    Object.freeze({
      record: Object.freeze({
        releaseId: packet.value.releaseId,
        orderId: verified.orderId,
        supplierId: packet.value.supplierId,
        supplierSku: packet.value.supplierSku,
        quantity: packet.value.quantity,
        releasedByActorId: record.actorId,
        releasedAt: record.releasedAt,
        verificationIdempotencyKey: approval.idempotencyKey,
      }),
      packet: packet.value,
    }),
  );
}

/** Validate a stored release record. Fails closed on any deviation. */
export function readEarlyAccessReleaseRecord(value: unknown): EarlyAccessReleaseRecord | null {
  const record = readPlainRecord(value, EARLY_ACCESS_RELEASE_RECORD_KEYS);
  if (!record) return null;
  if (!isBoundedText(record.releaseId, 200) || record.releaseId.includes("/")) return null;
  if (!isSafeIdentifier(record.orderId)) return null;
  if (!isSafeIdentifier(record.supplierId) || !isSafeIdentifier(record.supplierSku)) return null;
  if (
    typeof record.quantity !== "number" ||
    !Number.isSafeInteger(record.quantity) ||
    record.quantity < 1
  ) {
    return null;
  }
  if (!isSafeIdentifier(record.releasedByActorId)) return null;
  if (!isCanonicalTimestamp(record.releasedAt)) return null;
  if (!isSafeIdentifier(record.verificationIdempotencyKey)) return null;

  return Object.freeze({
    releaseId: record.releaseId,
    orderId: record.orderId,
    supplierId: record.supplierId,
    supplierSku: record.supplierSku,
    quantity: record.quantity,
    releasedByActorId: record.releasedByActorId,
    releasedAt: record.releasedAt,
    verificationIdempotencyKey: record.verificationIdempotencyKey,
  });
}

/** Validate a stored tracking record. Fails closed on any deviation. */
export function readEarlyAccessTrackingRecord(value: unknown): EarlyAccessTrackingRecord | null {
  const record = readPlainRecord(value, EARLY_ACCESS_TRACKING_RECORD_KEYS);
  if (!record) return null;
  if (!isBoundedText(record.releaseId, 200) || record.releaseId.includes("/")) return null;
  if (!isSafeIdentifier(record.orderId)) return null;
  if (!isCarrier(record.carrier)) return null;
  if (!isTrackingNumber(record.trackingNumber)) return null;
  if (!isSafeIdentifier(record.recordedByActorId)) return null;
  if (!isCanonicalTimestamp(record.recordedAt)) return null;
  if (
    typeof record.sequence !== "number" ||
    !Number.isSafeInteger(record.sequence) ||
    record.sequence < 1 ||
    record.sequence > EARLY_ACCESS_MAX_TRACKING_UPDATES
  ) {
    return null;
  }

  return Object.freeze({
    releaseId: record.releaseId,
    orderId: record.orderId,
    carrier: record.carrier,
    trackingNumber: record.trackingNumber,
    recordedByActorId: record.recordedByActorId,
    recordedAt: record.recordedAt,
    sequence: record.sequence,
  });
}

/** Validate a stored commission hold. `commission-event.ts` owns its vocabulary. */
function readCommissionHold(value: unknown): EarlyAccessCommissionHold | null {
  const record = readPlainRecord(value, COMMISSION_HOLD_KEYS);
  if (!record) return null;
  if (!isBoundedText(record.holdId, 200) || record.holdId.includes("/")) return null;
  if (!isSafeIdentifier(record.orderReference)) return null;
  if (!isSafeIdentifier(record.affiliateId)) return null;
  if (!isSafeIdentifier(record.referralCode)) return null;
  // Structural: this lane has no state in which money has left.
  if (record.state !== "held" || record.payout !== false) return null;
  if (
    typeof record.holdAmountCents !== "number" ||
    !Number.isSafeInteger(record.holdAmountCents) ||
    record.holdAmountCents < 1
  ) {
    return null;
  }
  if (record.currency !== "USD") return null;
  if (!isCanonicalTimestamp(record.heldAt)) return null;

  return Object.freeze({
    holdId: record.holdId,
    orderReference: record.orderReference,
    affiliateId: record.affiliateId,
    referralCode: record.referralCode,
    state: "held" as const,
    holdAmountCents: record.holdAmountCents,
    currency: "USD" as const,
    heldAt: record.heldAt,
    payout: false as const,
  });
}

/** Validate a stored fulfillment record. Fails closed on any deviation. */
export function readEarlyAccessFulfillmentRecord(
  value: unknown,
): EarlyAccessFulfillmentRecord | null {
  const record = readPlainRecord(value, EARLY_ACCESS_FULFILLMENT_RECORD_KEYS);
  if (!record) return null;
  if (!isSafeIdentifier(record.orderId)) return null;
  if (!isBoundedText(record.releaseId, 200) || record.releaseId.includes("/")) return null;
  if (!isCarrier(record.carrier)) return null;
  if (!isTrackingNumber(record.trackingNumber)) return null;
  if (!isSafeIdentifier(record.fulfilledByActorId)) return null;
  if (!isCanonicalTimestamp(record.fulfilledAt)) return null;

  let commissionHold: EarlyAccessCommissionHold | null = null;
  if (record.commissionHold !== null) {
    commissionHold = readCommissionHold(record.commissionHold);
    if (commissionHold === null) return null;
  }

  let commissionAccrual: EarlyAccessCommissionAccrual | null = null;
  if (record.commissionAccrual !== null) {
    commissionAccrual = readCommissionAccrual(record.commissionAccrual);
    if (commissionAccrual === null) return null;
  }
  // The two must describe one commission. A hold with no accrual behind it is an amount
  // nobody can explain, and an accrual whose amount disagrees with its hold is a row
  // that would reconcile two different ways.
  if ((commissionHold === null) !== (commissionAccrual === null)) return null;
  if (
    commissionHold !== null &&
    commissionAccrual !== null &&
    commissionHold.holdAmountCents !== commissionAccrual.commissionAmountCents
  ) {
    return null;
  }

  return Object.freeze({
    orderId: record.orderId,
    releaseId: record.releaseId,
    carrier: record.carrier,
    trackingNumber: record.trackingNumber,
    fulfilledByActorId: record.fulfilledByActorId,
    fulfilledAt: record.fulfilledAt,
    commissionHold,
    commissionAccrual,
  });
}

/**
 * Describe one tracking update.
 *
 * A release must already exist, because a tracking number with no release behind it is
 * a claim that something shipped which was never authorized to ship.
 */
export function describeTrackingUpdate(input: unknown): TrackingResult {
  const record = readPlainRecord(input, TRACKING_REQUIRED_KEYS);
  if (!record) return refused("input_invalid");

  const release = readEarlyAccessReleaseRecord(record.release);
  if (!release) return refused("release_missing");

  const existing = readPlainArray(record.tracking, EARLY_ACCESS_MAX_TRACKING_UPDATES);
  if (!existing) return refused("tracking_history_invalid");
  if (existing.length >= EARLY_ACCESS_MAX_TRACKING_UPDATES) {
    return refused("tracking_limit_reached");
  }

  if (!isCarrier(record.carrier)) return refused("carrier_invalid");
  if (!isTrackingNumber(record.trackingNumber)) return refused("tracking_number_invalid");
  if (!isSafeIdentifier(record.actorId)) return refused("actor_invalid");
  if (!isCanonicalTimestamp(record.recordedAt)) return refused("recorded_at_invalid");
  if (!isNotBefore(record.recordedAt, release.releasedAt)) return refused("recorded_at_invalid");

  return accepted(
    Object.freeze({
      releaseId: release.releaseId,
      orderId: release.orderId,
      carrier: record.carrier,
      trackingNumber: record.trackingNumber,
      recordedByActorId: record.actorId,
      recordedAt: record.recordedAt,
      sequence: existing.length + 1,
    }),
  );
}

/**
 * Describe the fulfillment of one order and the commission it earns.
 *
 * The hold is built by `commission-event.ts` from the same verified-order projection,
 * so an affiliate can be credited only for an order a human actually approved, and only
 * for the amount that module is willing to compute.
 */
export function describeFulfillment(input: unknown): FulfillmentResult {
  const record = readPlainRecord(input, FULFILL_REQUIRED_KEYS);
  if (!record) return refused("input_invalid");

  const verified = readEarlyAccessVerifiedOrder(record.verifiedOrder);
  if (!verified) return refused("verified_order_invalid");

  const release = readEarlyAccessReleaseRecord(record.release);
  if (!release) return refused("release_missing");
  if (release.orderId !== verified.orderId) return refused("release_missing");

  const tracking = readPlainArray(record.tracking, EARLY_ACCESS_MAX_TRACKING_UPDATES);
  if (!tracking || tracking.length === 0) return refused("tracking_missing");
  const latest = readEarlyAccessTrackingRecord(tracking[tracking.length - 1]);
  if (!latest || latest.releaseId !== release.releaseId) return refused("tracking_missing");

  if (!isSafeIdentifier(record.actorId)) return refused("actor_invalid");
  if (!isCanonicalTimestamp(record.fulfilledAt)) return refused("fulfilled_at_invalid");
  if (!isNotBefore(record.fulfilledAt, latest.recordedAt)) return refused("fulfilled_at_invalid");

  const priorFulfillments = readPlainArray(record.fulfillments, 1);
  if (!priorFulfillments) return refused("input_invalid");
  if (priorFulfillments.length > 0) {
    const original = readEarlyAccessFulfillmentRecord(priorFulfillments[0]);
    if (!original || original.orderId !== verified.orderId) return refused("input_invalid");
    // Fulfilling twice would hold a second commission against one payment.
    return accepted(Object.freeze({ record: original, append: null }));
  }

  let commissionHold: EarlyAccessCommissionHold | null = null;
  let commissionAccrual: EarlyAccessCommissionAccrual | null = null;
  if (record.attribution !== null) {
    const accrual = buildCommissionAccrual(record.verifiedOrder, record.attribution);
    if (!accrual.ok) return refused(accrual.code);
    commissionAccrual = accrual.value;
    commissionHold = commissionHoldFrom(accrual.value);
  }

  const fulfillment: EarlyAccessFulfillmentRecord = Object.freeze({
    orderId: verified.orderId,
    releaseId: release.releaseId,
    carrier: latest.carrier,
    trackingNumber: latest.trackingNumber,
    fulfilledByActorId: record.actorId,
    fulfilledAt: record.fulfilledAt,
    commissionHold,
    commissionAccrual,
  });

  return accepted(Object.freeze({ record: fulfillment, append: fulfillment }));
}

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

export type ReleaseAppendResult = CommerceResult<
  EarlyAccessReleaseRecord,
  SupplierReleaseServiceFailureCode
>;

export type TrackingAppendResult = CommerceResult<EarlyAccessTrackingRecord, TrackingFailureCode>;

export type FulfillmentAppendResult = CommerceResult<
  EarlyAccessFulfillmentRecord,
  FulfillmentFailureCode
>;

/** Append-only by construction: there is no update, no delete, and no clear. */
export interface EarlyAccessReleaseRepository {
  appendRelease(record: unknown): Promise<ReleaseAppendResult>;
  release(orderId: string): Promise<EarlyAccessReleaseRecord | null>;
  appendTracking(record: unknown): Promise<TrackingAppendResult>;
  /** Every tracking number ever recorded for an order, oldest first. */
  tracking(orderId: string): Promise<readonly EarlyAccessTrackingRecord[]>;
  appendFulfillment(record: unknown): Promise<FulfillmentAppendResult>;
  fulfillments(orderId: string): Promise<readonly EarlyAccessFulfillmentRecord[]>;
}

export class InMemoryReleaseRepository implements EarlyAccessReleaseRepository {
  private readonly releases = new Map<string, EarlyAccessReleaseRecord>();
  private readonly trackingByOrder = new Map<string, readonly EarlyAccessTrackingRecord[]>();
  private readonly fulfillmentsByOrder = new Map<
    string,
    readonly EarlyAccessFulfillmentRecord[]
  >();

  /**
   * Records are re-validated on the way in even though the pure functions already built
   * them, because a repository that trusts its caller can be handed a hand-written row
   * by a later, less careful call site.
   */
  async appendRelease(record: unknown): Promise<ReleaseAppendResult> {
    const validated = readEarlyAccessReleaseRecord(record);
    if (!validated) return refused("input_invalid");
    // One order, one shipment. A second release is a duplicate order to the supplier.
    if (this.releases.has(validated.orderId)) return refused("release_already_recorded");
    this.releases.set(validated.orderId, validated);
    return accepted(validated);
  }

  async release(orderId: string): Promise<EarlyAccessReleaseRecord | null> {
    return this.releases.get(orderId) ?? null;
  }

  async appendTracking(record: unknown): Promise<TrackingAppendResult> {
    const validated = readEarlyAccessTrackingRecord(record);
    if (!validated) return refused("input_invalid");
    if (!this.releases.has(validated.orderId)) return refused("release_missing");
    const trail = this.trackingByOrder.get(validated.orderId) ?? [];
    if (trail.length >= EARLY_ACCESS_MAX_TRACKING_UPDATES) return refused("tracking_limit_reached");
    if (validated.sequence !== trail.length + 1) return refused("tracking_history_invalid");
    this.trackingByOrder.set(validated.orderId, Object.freeze([...trail, validated]));
    return accepted(validated);
  }

  async tracking(orderId: string): Promise<readonly EarlyAccessTrackingRecord[]> {
    return this.trackingByOrder.get(orderId) ?? Object.freeze([]);
  }

  async appendFulfillment(record: unknown): Promise<FulfillmentAppendResult> {
    const validated = readEarlyAccessFulfillmentRecord(record);
    if (!validated) return refused("input_invalid");
    if (!this.releases.has(validated.orderId)) return refused("release_missing");
    const trail = this.fulfillmentsByOrder.get(validated.orderId) ?? [];
    // The store is the last line of defense for one commission per payment.
    if (trail.length > 0) return refused("input_invalid");
    this.fulfillmentsByOrder.set(validated.orderId, Object.freeze([...trail, validated]));
    return accepted(validated);
  }

  async fulfillments(orderId: string): Promise<readonly EarlyAccessFulfillmentRecord[]> {
    return this.fulfillmentsByOrder.get(orderId) ?? Object.freeze([]);
  }
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

export type ReleaseServiceDependencies = Readonly<{
  verifications: Readonly<{
    history(orderId: string): Promise<readonly EarlyAccessVerificationEntry[]>;
  }>;
  releases: EarlyAccessReleaseRepository;
}>;

export type ReleaseToSupplierInput = Readonly<{
  verifiedOrder: unknown;
  supplier: unknown;
  actorId: unknown;
  releasedAt: unknown;
}>;

/** Release one verified order to its supplier, reading the trail from the repository. */
export async function releaseToSupplier(
  deps: ReleaseServiceDependencies,
  input: ReleaseToSupplierInput,
): Promise<SupplierReleaseServiceResult> {
  const verified = readEarlyAccessVerifiedOrder(input.verifiedOrder);
  if (!verified) return refused("verified_order_invalid");

  const decisions = await deps.verifications.history(verified.orderId);
  const described = describeSupplierRelease({
    verifiedOrder: input.verifiedOrder,
    decisions: [...decisions],
    supplier: input.supplier,
    actorId: input.actorId,
    releasedAt: input.releasedAt,
  });
  if (!described.ok) return described;

  const appended = await deps.releases.appendRelease(described.value.record);
  if (!appended.ok) return refused(appended.code);
  return described;
}

export type RecordTrackingInput = Readonly<{
  orderId: string;
  carrier: unknown;
  trackingNumber: unknown;
  actorId: unknown;
  recordedAt: unknown;
}>;

export async function recordTracking(
  deps: ReleaseServiceDependencies,
  input: RecordTrackingInput,
): Promise<TrackingResult> {
  const release = await deps.releases.release(input.orderId);
  if (release === null) return refused("release_missing");

  const tracking = await deps.releases.tracking(input.orderId);
  const described = describeTrackingUpdate({
    release,
    tracking: [...tracking],
    carrier: input.carrier,
    trackingNumber: input.trackingNumber,
    actorId: input.actorId,
    recordedAt: input.recordedAt,
  });
  if (!described.ok) return described;

  const appended = await deps.releases.appendTracking(described.value);
  if (!appended.ok) return refused(appended.code);
  return described;
}

export type FulfillOrderInput = Readonly<{
  verifiedOrder: unknown;
  attribution: unknown;
  actorId: unknown;
  fulfilledAt: unknown;
}>;

export async function fulfillOrder(
  deps: ReleaseServiceDependencies,
  input: FulfillOrderInput,
): Promise<FulfillmentResult> {
  const verified = readEarlyAccessVerifiedOrder(input.verifiedOrder);
  if (!verified) return refused("verified_order_invalid");

  const release = await deps.releases.release(verified.orderId);
  if (release === null) return refused("release_missing");

  const [tracking, fulfillments] = await Promise.all([
    deps.releases.tracking(verified.orderId),
    deps.releases.fulfillments(verified.orderId),
  ]);

  const described = describeFulfillment({
    verifiedOrder: input.verifiedOrder,
    release,
    tracking: [...tracking],
    fulfillments: [...fulfillments],
    attribution: input.attribution,
    actorId: input.actorId,
    fulfilledAt: input.fulfilledAt,
  });
  if (!described.ok) return described;
  if (described.value.append === null) return described;

  const appended = await deps.releases.appendFulfillment(described.value.append);
  if (!appended.ok) return refused(appended.code);
  return described;
}

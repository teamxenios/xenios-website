/**
 * Early Access manual payment verification. Server only, pure, side effect free.
 *
 * This is the only place in the domain where a payment becomes received. A browser
 * action cannot reach this state, a screenshot cannot reach this state, and an
 * automated job cannot reach this state. A named human in an authorized role decides,
 * and the decision is recorded with the actor who made it.
 *
 * EXACTLY ONCE
 * ------------
 * The dangerous failure is not a wrong decision, it is a repeated one: two receipts,
 * or two supplier orders, from one payment. This module is pure, so it cannot hold a
 * lock. It closes the hole structurally instead:
 *
 *   1. The caller supplies the verification ledger for the order. The ledger may hold
 *      AT MOST ONE record, and a second record for the same order is refused as an
 *      invalid ledger rather than accepted as a second approval.
 *   2. Every derived key is a function of the ORDER id, not of the idempotency key or
 *      the actor. `verificationUniqueKey`, the receipt intent id, and the supplier
 *      release intent id are therefore identical for every call, first or replayed.
 *      A store that treats them as unique constraints can physically hold one of each,
 *      so even two concurrent callers reading the same empty ledger collide on insert
 *      instead of both succeeding.
 *   3. Exactly one call reports `outcome: "applied"` with `firstApplication: true`.
 *      Replays and later duplicate approvals return `ok: true` with `"replayed"` or
 *      `"noop"`, carrying the ORIGINAL record so the effect is reported once.
 *
 * The intents are descriptions. Nothing here sends a receipt or releases a supplier
 * order; `performed` is false on both.
 */

import {
  isEarlyAccessPaymentOptionCode,
  type EarlyAccessPaymentOptionCode,
} from "@shared/research/early-access-payment-options";
import {
  accepted,
  isCanonicalTimestamp,
  isNotBefore,
  isOneOf,
  isSafeIdentifier,
  readPlainArray,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";
import {
  readEarlyAccessOrder,
  type EarlyAccessCurrency,
  type EarlyAccessOrder,
  type EarlyAccessOrderStatus,
} from "./early-access-order";

/**
 * The only roles that may decide a manual payment. Everything else, including every
 * support, analyst, partner, affiliate, and member role, is refused with `forbidden`.
 */
export const EARLY_ACCESS_VERIFIER_ROLES = ["founder_admin", "operations_admin"] as const;

export type EarlyAccessVerifierRole = (typeof EARLY_ACCESS_VERIFIER_ROLES)[number];

export const EARLY_ACCESS_VERIFICATION_DECISIONS = ["approve", "reject"] as const;

export type EarlyAccessVerificationDecision =
  (typeof EARLY_ACCESS_VERIFICATION_DECISIONS)[number];

/** One decision per order. The ledger is read, not appended to, by this module. */
const MAX_LEDGER_ENTRIES = 8;

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{15,127}$/;

/** Statuses from which a human may still decide the payment. */
const DECIDABLE_STATUSES = ["awaiting_payment", "payment_under_review"] as const;

export type EarlyAccessVerificationFailureCode =
  | "input_invalid"
  | "actor_invalid"
  | "forbidden"
  | "decision_invalid"
  | "idempotency_key_invalid"
  | "timestamp_invalid"
  | "order_invalid"
  | "method_unsupported"
  | "ledger_invalid"
  | "ledger_inconsistent"
  | "idempotency_conflict"
  | "order_rejected"
  | "order_already_verified";

/** The durable record of a decision. One per order, ever. */
export type EarlyAccessVerificationRecord = Readonly<{
  orderId: string;
  idempotencyKey: string;
  decision: EarlyAccessVerificationDecision;
  actorId: string;
  actorRole: EarlyAccessVerifierRole;
  decidedAt: string;
  method: EarlyAccessPaymentOptionCode | null;
}>;

export const EARLY_ACCESS_VERIFICATION_RECORD_KEYS = [
  "orderId",
  "idempotencyKey",
  "decision",
  "actorId",
  "actorRole",
  "decidedAt",
  "method",
] as const;

/** The verified order projection every downstream lane consumes. */
export type EarlyAccessVerifiedOrder = Readonly<{
  orderId: string;
  customerRef: string;
  status: "payment_verified";
  productId: string;
  variantId: string;
  sku: string;
  quantity: number;
  currency: EarlyAccessCurrency;
  orderTotalCents: number;
  referralCode: string | null;
  paymentMethod: EarlyAccessPaymentOptionCode | null;
  verifiedAt: string;
  verifiedByActorId: string;
  verifiedByActorRole: EarlyAccessVerifierRole;
  verificationIdempotencyKey: string;
}>;

export const EARLY_ACCESS_VERIFIED_ORDER_KEYS = [
  "orderId",
  "customerRef",
  "status",
  "productId",
  "variantId",
  "sku",
  "quantity",
  "currency",
  "orderTotalCents",
  "referralCode",
  "paymentMethod",
  "verifiedAt",
  "verifiedByActorId",
  "verifiedByActorRole",
  "verificationIdempotencyKey",
] as const;

export type EarlyAccessReceiptIntent = Readonly<{
  intentId: string;
  kind: "customer_receipt";
  orderReference: string;
  amountCents: number;
  currency: EarlyAccessCurrency;
  issuedAt: string;
  performed: false;
}>;

export type EarlyAccessSupplierReleaseIntent = Readonly<{
  intentId: string;
  kind: "supplier_release";
  orderReference: string;
  sku: string;
  quantity: number;
  releasedAt: string;
  performed: false;
}>;

export type EarlyAccessVerificationOutcome = "applied" | "replayed" | "noop";

export type EarlyAccessPaymentVerification = Readonly<{
  orderId: string;
  outcome: EarlyAccessVerificationOutcome;
  decision: EarlyAccessVerificationDecision;
  transition: Readonly<{ from: EarlyAccessOrderStatus; to: EarlyAccessOrderStatus }>;
  record: EarlyAccessVerificationRecord;
  commit: Readonly<{
    verificationUniqueKey: string;
    idempotencyKey: string;
    firstApplication: boolean;
  }>;
  receiptIntent: EarlyAccessReceiptIntent | null;
  supplierReleaseIntent: EarlyAccessSupplierReleaseIntent | null;
  verifiedOrder: EarlyAccessVerifiedOrder | null;
}>;

export type EarlyAccessVerificationResult = CommerceResult<
  EarlyAccessPaymentVerification,
  EarlyAccessVerificationFailureCode
>;

/**
 * The contract a persistence lane must honor for the exactly once guarantee to hold
 * outside this pure function. Exported so the integrator wires the same keys.
 */
export const EARLY_ACCESS_EXACTLY_ONCE_INVARIANT = Object.freeze({
  verificationsPerOrder: 1,
  receiptsPerVerifiedOrder: 1,
  supplierReleasesPerVerifiedOrder: 1,
  uniqueKeysAreDerivedFrom: "orderId" as const,
  storageRequirement:
    "Insert the verification record, the receipt, and the supplier release under their " +
    "returned unique keys with a unique constraint. A duplicate insert must lose, not upsert.",
});

const VERIFY_REQUIRED_KEYS = [
  "order",
  "actor",
  "decision",
  "idempotencyKey",
  "now",
  "appliedVerifications",
] as const;

const VERIFY_OPTIONAL_KEYS = ["method"] as const;

const ACTOR_KEYS = ["id", "role"] as const;

export function verificationUniqueKeyFor(orderId: string): string {
  return `early-access-payment-verification:${orderId}`;
}

export function receiptIntentIdFor(orderId: string): string {
  return `early-access-receipt:${orderId}`;
}

export function supplierReleaseIntentIdFor(orderId: string): string {
  return `early-access-supplier-release:${orderId}`;
}

function isIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && IDEMPOTENCY_KEY.test(value);
}

function statusForDecision(decision: EarlyAccessVerificationDecision): EarlyAccessOrderStatus {
  return decision === "approve" ? "payment_verified" : "payment_rejected";
}

/** Validate one stored verification record. Fails closed on any deviation. */
export function readEarlyAccessVerificationRecord(
  value: unknown,
): EarlyAccessVerificationRecord | null {
  const record = readPlainRecord(value, EARLY_ACCESS_VERIFICATION_RECORD_KEYS);
  if (!record) return null;
  if (!isSafeIdentifier(record.orderId)) return null;
  if (!isIdempotencyKey(record.idempotencyKey)) return null;
  if (!isOneOf(record.decision, EARLY_ACCESS_VERIFICATION_DECISIONS)) return null;
  if (!isSafeIdentifier(record.actorId)) return null;
  if (!isOneOf(record.actorRole, EARLY_ACCESS_VERIFIER_ROLES)) return null;
  if (!isCanonicalTimestamp(record.decidedAt)) return null;
  if (record.method !== null && !isEarlyAccessPaymentOptionCode(record.method)) return null;

  return Object.freeze({
    orderId: record.orderId,
    idempotencyKey: record.idempotencyKey,
    decision: record.decision,
    actorId: record.actorId,
    actorRole: record.actorRole,
    decidedAt: record.decidedAt,
    method: record.method === null ? null : record.method,
  });
}

/** Validate a verified order projection that arrived from storage or another module. */
export function readEarlyAccessVerifiedOrder(value: unknown): EarlyAccessVerifiedOrder | null {
  const record = readPlainRecord(value, EARLY_ACCESS_VERIFIED_ORDER_KEYS);
  if (!record) return null;
  if (!isSafeIdentifier(record.orderId)) return null;
  if (!isSafeIdentifier(record.customerRef)) return null;
  // A projection that is not verified must never reach a supplier or a commission.
  if (record.status !== "payment_verified") return null;
  if (
    !isSafeIdentifier(record.productId) ||
    !isSafeIdentifier(record.variantId) ||
    !isSafeIdentifier(record.sku)
  ) {
    return null;
  }
  if (
    typeof record.quantity !== "number" ||
    !Number.isSafeInteger(record.quantity) ||
    record.quantity < 1
  ) {
    return null;
  }
  if (record.currency !== "USD") return null;
  if (
    typeof record.orderTotalCents !== "number" ||
    !Number.isSafeInteger(record.orderTotalCents) ||
    record.orderTotalCents <= 0
  ) {
    return null;
  }
  if (record.referralCode !== null && !isSafeIdentifier(record.referralCode)) return null;
  if (record.paymentMethod !== null && !isEarlyAccessPaymentOptionCode(record.paymentMethod)) {
    return null;
  }
  if (!isCanonicalTimestamp(record.verifiedAt)) return null;
  if (!isSafeIdentifier(record.verifiedByActorId)) return null;
  if (!isOneOf(record.verifiedByActorRole, EARLY_ACCESS_VERIFIER_ROLES)) return null;
  if (!isIdempotencyKey(record.verificationIdempotencyKey)) return null;

  return Object.freeze({
    orderId: record.orderId,
    customerRef: record.customerRef,
    status: "payment_verified" as const,
    productId: record.productId,
    variantId: record.variantId,
    sku: record.sku,
    quantity: record.quantity,
    currency: "USD" as const,
    orderTotalCents: record.orderTotalCents,
    referralCode: record.referralCode === null ? null : record.referralCode,
    paymentMethod: record.paymentMethod === null ? null : record.paymentMethod,
    verifiedAt: record.verifiedAt,
    verifiedByActorId: record.verifiedByActorId,
    verifiedByActorRole: record.verifiedByActorRole,
    verificationIdempotencyKey: record.verificationIdempotencyKey,
  });
}

/**
 * Decide one manual payment.
 *
 * Authorization is checked before the order is even read, so an unauthorized caller
 * learns nothing about the order's payment state from the refusal code.
 */
export function verifyManualPayment(input: unknown): EarlyAccessVerificationResult {
  const record = readPlainRecord(input, VERIFY_REQUIRED_KEYS, VERIFY_OPTIONAL_KEYS);
  if (!record) return refused("input_invalid");

  const actor = readPlainRecord(record.actor, ACTOR_KEYS);
  if (!actor || !isSafeIdentifier(actor.id)) return refused("actor_invalid");
  if (!isOneOf(actor.role, EARLY_ACCESS_VERIFIER_ROLES)) return refused("forbidden");
  const actorId = actor.id;
  const actorRole = actor.role;

  if (!isOneOf(record.decision, EARLY_ACCESS_VERIFICATION_DECISIONS)) {
    return refused("decision_invalid");
  }
  const decision = record.decision;
  if (!isIdempotencyKey(record.idempotencyKey)) return refused("idempotency_key_invalid");
  const idempotencyKey = record.idempotencyKey;
  if (!isCanonicalTimestamp(record.now)) return refused("timestamp_invalid");
  const now = record.now;

  const order = readEarlyAccessOrder(record.order);
  if (!order) return refused("order_invalid");
  if (!isNotBefore(now, order.createdAt)) return refused("timestamp_invalid");

  const method =
    record.method === undefined || record.method === null ? null : record.method;
  if (method !== null && !isEarlyAccessPaymentOptionCode(method)) {
    return refused("method_unsupported");
  }

  const entries = readPlainArray(record.appliedVerifications, MAX_LEDGER_ENTRIES);
  if (!entries) return refused("ledger_invalid");
  // More than one decision for an order is not a history, it is a double apply.
  if (entries.length > 1) return refused("ledger_invalid");
  const prior = entries.length === 1 ? readEarlyAccessVerificationRecord(entries[0]) : null;
  if (entries.length === 1 && !prior) return refused("ledger_invalid");
  if (prior && prior.orderId !== order.orderId) return refused("ledger_invalid");

  const uniqueKey = verificationUniqueKeyFor(order.orderId);

  if (prior) {
    if (prior.idempotencyKey === idempotencyKey) {
      // A replay must be the same call. A different decision, actor, or method under a
      // used key is a conflict, never a second decision.
      if (
        prior.decision !== decision ||
        prior.actorId !== actorId ||
        prior.actorRole !== actorRole ||
        prior.method !== method
      ) {
        return refused("idempotency_conflict");
      }
      return accepted(outcomeFor("replayed", order, prior, uniqueKey, false));
    }

    // A different key against a decided order. The prior decision stands.
    if (prior.decision === "reject") {
      // A rejected payment is terminal here. Reopening it is a new order, not a retry.
      if (decision === "approve") return refused("order_rejected");
      return accepted(outcomeFor("noop", order, prior, uniqueKey, false));
    }
    if (decision === "reject") return refused("order_already_verified");
    return accepted(outcomeFor("noop", order, prior, uniqueKey, false));
  }

  // No ledger entry, so the order status must still be undecided. A status claiming a
  // terminal payment with no record behind it is refused rather than trusted.
  if (!isOneOf(order.status, DECIDABLE_STATUSES)) return refused("ledger_inconsistent");

  const applied: EarlyAccessVerificationRecord = Object.freeze({
    orderId: order.orderId,
    idempotencyKey,
    decision,
    actorId,
    actorRole,
    decidedAt: now,
    method,
  });
  return accepted(outcomeFor("applied", order, applied, uniqueKey, true));
}

/**
 * Build the result from the authoritative record. Every derived value comes from the
 * record and the order, so a replay reproduces a byte identical result.
 */
function outcomeFor(
  outcome: EarlyAccessVerificationOutcome,
  order: EarlyAccessOrder,
  record: EarlyAccessVerificationRecord,
  uniqueKey: string,
  firstApplication: boolean,
): EarlyAccessPaymentVerification {
  const target = statusForDecision(record.decision);
  const approved = record.decision === "approve";

  const receiptIntent: EarlyAccessReceiptIntent | null = approved
    ? Object.freeze({
        intentId: receiptIntentIdFor(order.orderId),
        kind: "customer_receipt" as const,
        orderReference: order.orderId,
        amountCents: order.orderTotalCents,
        currency: order.currency,
        issuedAt: record.decidedAt,
        performed: false as const,
      })
    : null;

  const supplierReleaseIntent: EarlyAccessSupplierReleaseIntent | null = approved
    ? Object.freeze({
        intentId: supplierReleaseIntentIdFor(order.orderId),
        kind: "supplier_release" as const,
        orderReference: order.orderId,
        sku: order.line.sku,
        quantity: order.line.quantity,
        releasedAt: record.decidedAt,
        performed: false as const,
      })
    : null;

  const verifiedOrder: EarlyAccessVerifiedOrder | null = approved
    ? Object.freeze({
        orderId: order.orderId,
        customerRef: order.customerRef,
        status: "payment_verified" as const,
        productId: order.line.productId,
        variantId: order.line.variantId,
        sku: order.line.sku,
        quantity: order.line.quantity,
        currency: order.currency,
        orderTotalCents: order.orderTotalCents,
        referralCode: order.referralCode,
        paymentMethod: record.method,
        verifiedAt: record.decidedAt,
        verifiedByActorId: record.actorId,
        verifiedByActorRole: record.actorRole,
        verificationIdempotencyKey: record.idempotencyKey,
      })
    : null;

  return Object.freeze({
    orderId: order.orderId,
    outcome,
    decision: record.decision,
    transition: Object.freeze({ from: order.status, to: target }),
    record,
    commit: Object.freeze({
      verificationUniqueKey: uniqueKey,
      idempotencyKey: record.idempotencyKey,
      firstApplication,
    }),
    receiptIntent,
    supplierReleaseIntent,
    verifiedOrder,
  });
}

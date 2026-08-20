// xenios research: the canonical order domain.
//
// A legitimate paid or accepted transaction becomes ONE durable canonical
// order here, and nowhere else. Four rules shape this file.
//
// First, conversion is evidence-gated. A conversion carrying payment evidence
// (who verified which payment, when) mints a `paid` order; one carrying only
// quote-acceptance evidence mints an `awaiting_payment` order; one carrying
// neither is refused. Payment state is DERIVED from evidence — there is no
// input field that states it, and a raw input that tries anyway is refused by
// name.
//
// Second, money is computed, never copied. The input carries authorized unit
// prices (from the pricing authority, supplied by the trusted converter) and
// quantities; every line total and the order total are recomputed here, and
// the caller's `expectedTotalCents` echo must match the recomputation or the
// conversion refuses. An input object smuggling its own total keys is refused
// before any arithmetic runs.
//
// Third, conversion is idempotent by construction. The order number is a pure
// function of the source transaction, the repository is insert-once on that
// identity, and a duplicate conversion returns the incumbent order — if and
// only if it describes the same content. The same source presented with
// different money or a different customer is a conflict, not a replay.
//
// Fourth, ownership is the customer's handle set and nothing else. Reads
// resolve ownership first and look for the order inside what is owned, so a
// foreign order is never read at all. Affiliate attribution is carried for
// the commission ledger and is never consulted by any ownership decision.

import {
  CANONICAL_ORDER_FULFILLMENT_STATES,
  CANONICAL_ORDER_SOURCE_KINDS,
  CANONICAL_ORDER_SOURCE_PREFIXES,
  type CanonicalOrderFulfillmentState,
  type CanonicalOrderPaymentState,
  type CanonicalOrderSourceKind,
  type CanonicalOrderSourceView,
  type CanonicalOrderTrackingView,
  type CanonicalOrderView,
} from "@shared/research/orders/canonical-order";
import { canonicalConversionKey, canonicalOrderNumberFor } from "./order-number";

// ---------------------------------------------------------------------------
// Bounds. Work bounds, not policy.
// ---------------------------------------------------------------------------

export const MAX_CANONICAL_ORDER_LINES = 100;
export const MAX_CANONICAL_LINE_QUANTITY = 10_000;
/** $100,000.00 per unit. Far above any authorized price in the catalog. */
export const MAX_CANONICAL_UNIT_PRICE_CENTS = 10_000_000;
/** $1,000,000.00 per order. A total beyond this is a bug, not a purchase. */
export const MAX_CANONICAL_ORDER_TOTAL_CENTS = 100_000_000;
/** Mirrors the bound the member order history already applies to handle sets. */
export const MAX_CANONICAL_HISTORY_CUSTOMER_REFS = 64;

// ---------------------------------------------------------------------------
// Records.
// ---------------------------------------------------------------------------

export interface CanonicalOrderCustomer {
  /** The durable opaque handle (M62-joinable). Ownership is decided on this. */
  customerRef: string;
  /** Convenience linkage only. Never an ownership authority by itself. */
  memberId: string | null;
}

export interface CanonicalOrderShippingSnapshot {
  recipient: string;
  /** One to three non-blank lines. */
  addressLines: readonly string[];
  city: string;
  /** May be empty: not every country has one. */
  region: string;
  postalCode: string;
  country: string;
  serviceLabel: string | null;
}

/** Carried for the commission ledger. Never consulted for ownership. */
export interface CanonicalOrderAttribution {
  affiliateAttributionRef: string;
}

export interface CanonicalOrderAcceptanceEvidence {
  quoteRef: string;
  acceptanceId: string;
  acceptedAt: string;
}

export interface CanonicalOrderPaymentEvidence {
  verificationId: string;
  /** The named admin who verified. Never blank, never synthesized. */
  verifiedBy: string;
  verifiedAt: string;
  externalTransactionId: string | null;
}

export interface CanonicalOrderActor {
  actor: "admin" | "system";
  actorId: string;
}

export interface CanonicalOrderLineRecord {
  sku: string;
  displayName: string;
  quantity: number;
  unitPriceCents: number;
  /** Computed here from unit price and quantity. Never read from an input. */
  lineTotalCents: number;
}

export interface CanonicalOrderFulfillmentEvent {
  to: Exclude<CanonicalOrderFulfillmentState, "unfulfilled">;
  at: string;
  actorId: string;
  /** Points at real evidence (a dispatch record, a tracking upload). Never blank. */
  evidenceRef: string;
  trackingNumber: string | null;
  carrier: string | null;
  note: string | null;
}

/**
 * The stored order. Wider than the customer view on purpose: attribution,
 * evidence and actor identities are operator data that the view projection
 * never touches.
 */
export interface CanonicalOrderRecord {
  orderNumber: string;
  conversionKey: string;
  source: CanonicalOrderSourceView;
  customer: CanonicalOrderCustomer;
  organizationRef: string | null;
  attribution: CanonicalOrderAttribution | null;
  shipping: CanonicalOrderShippingSnapshot;
  lines: CanonicalOrderLineRecord[];
  currency: "usd";
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  paymentState: CanonicalOrderPaymentState;
  paymentEvidence: CanonicalOrderPaymentEvidence | null;
  acceptanceEvidence: CanonicalOrderAcceptanceEvidence | null;
  fulfillmentState: CanonicalOrderFulfillmentState;
  fulfillmentEvents: CanonicalOrderFulfillmentEvent[];
  placedAt: string;
  convertedAt: string;
  updatedAt: string;
  convertedBy: CanonicalOrderActor;
  /** Optimistic concurrency. Progression refuses a lost update by name. */
  revision: number;
}

// ---------------------------------------------------------------------------
// Ports.
// ---------------------------------------------------------------------------

export type CanonicalOrderInsert =
  | { inserted: true; order: CanonicalOrderRecord }
  | { inserted: false; incumbent: CanonicalOrderRecord };

export interface CanonicalOrderRepository {
  /**
   * Insert-once on BOTH the conversion key and the order number (which are
   * deterministic images of each other). A conflict returns the incumbent
   * rather than throwing, so the domain can decide replay versus conflict.
   */
  insert(record: CanonicalOrderRecord): Promise<CanonicalOrderInsert>;
  byNumber(orderNumber: string): Promise<CanonicalOrderRecord | null>;
  byConversionKey(conversionKey: string): Promise<CanonicalOrderRecord | null>;
  listByCustomerRefs(customerRefs: readonly string[]): Promise<readonly CanonicalOrderRecord[]>;
  /** Refuses a lost update: the stored revision must equal `expectedRevision`. */
  update(
    record: CanonicalOrderRecord,
    expectedRevision: number,
  ): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "REVISION_STALE" }>;
}

/** The one direction of the legal binding directory these reads need. */
export interface CanonicalOrderBindingsPort {
  customerRefsFor(memberId: string): Promise<readonly string[]>;
}

// ---------------------------------------------------------------------------
// Results.
// ---------------------------------------------------------------------------

export type CanonicalOrderRefusalCode =
  | "ACTOR_REQUIRED"
  | "SOURCE_INVALID"
  | "CUSTOMER_REQUIRED"
  | "SHIPPING_INVALID"
  | "LINES_INVALID"
  | "CLIENT_TOTAL_REFUSED"
  | "TOTAL_MISMATCH"
  | "EVIDENCE_REQUIRED"
  | "EVIDENCE_INVALID"
  | "CONVERSION_CONFLICT"
  | "ORDER_NOT_FOUND"
  | "PAYMENT_STATE_INVALID"
  | "FULFILLMENT_INVALID"
  | "REVISION_STALE";

export interface CanonicalOrderRefusal {
  ok: false;
  code: CanonicalOrderRefusalCode;
  message: string;
}

export type CanonicalOrderConversionResult =
  | { ok: true; order: CanonicalOrderRecord; replayed: boolean }
  | CanonicalOrderRefusal;

export type CanonicalOrderMutationResult =
  | { ok: true; order: CanonicalOrderRecord; replayed: boolean }
  | CanonicalOrderRefusal;

function refuse(code: CanonicalOrderRefusalCode, message: string): CanonicalOrderRefusal {
  return { ok: false, code, message };
}

// ---------------------------------------------------------------------------
// Conversion input.
// ---------------------------------------------------------------------------

export interface CanonicalOrderConversionInput {
  source: {
    kind: CanonicalOrderSourceKind;
    sourceRef: string;
    requestRef?: string | null;
  };
  customer: {
    customerRef: string;
    memberId?: string | null;
  };
  organizationRef?: string | null;
  attribution?: CanonicalOrderAttribution | null;
  shipping: CanonicalOrderShippingSnapshot;
  /**
   * Authorized unit prices and quantities ONLY. There is deliberately no
   * writable total anywhere in a line: totals are recomputed here, and a raw
   * object smuggling one in is refused.
   */
  lines: ReadonlyArray<{
    sku: string;
    displayName: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  shippingCents: number;
  /**
   * The total the customer was shown, echoed. A mismatch with the
   * server-side recomputation refuses the conversion instead of preferring
   * either number.
   */
  expectedTotalCents: number;
  acceptance?: CanonicalOrderAcceptanceEvidence | null;
  payment?: CanonicalOrderPaymentEvidence | null;
  /** When the source transaction was placed or accepted. */
  placedAt: string;
  convertedBy: CanonicalOrderActor;
  at: Date;
}

// ---------------------------------------------------------------------------
// Validation helpers.
// ---------------------------------------------------------------------------

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

function isIsoInstant(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isCount(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= max;
}

/**
 * The keys a conversion input must NEVER state, checked on the raw objects so
 * an untyped caller cannot smuggle them past the compiler. Money is computed
 * and state is derived; an input claiming either is refused, not sanitized.
 */
const FORBIDDEN_ROOT_KEYS = [
  "totalCents",
  "subtotalCents",
  "paymentState",
  "fulfillmentState",
  "orderNumber",
] as const;

const FORBIDDEN_LINE_KEYS = ["lineTotalCents", "totalCents", "subtotalCents"] as const;

function statedForbiddenKey(input: CanonicalOrderConversionInput): string | null {
  const root = input as unknown as Record<string, unknown>;
  for (const key of FORBIDDEN_ROOT_KEYS) {
    if (key in root) return key;
  }
  for (const line of input.lines ?? []) {
    const raw = line as unknown as Record<string, unknown>;
    for (const key of FORBIDDEN_LINE_KEYS) {
      if (key in raw) return `lines.${key}`;
    }
  }
  return null;
}

function validActor(actor: CanonicalOrderActor | undefined | null): boolean {
  if (!actor) return false;
  if (actor.actor !== "admin" && actor.actor !== "system") return false;
  return !isBlank(actor.actorId);
}

function validAcceptance(evidence: CanonicalOrderAcceptanceEvidence): boolean {
  return (
    !isBlank(evidence.quoteRef) &&
    !isBlank(evidence.acceptanceId) &&
    isIsoInstant(evidence.acceptedAt)
  );
}

function validPayment(evidence: CanonicalOrderPaymentEvidence): boolean {
  if (isBlank(evidence.verificationId)) return false;
  if (isBlank(evidence.verifiedBy)) return false;
  if (!isIsoInstant(evidence.verifiedAt)) return false;
  if (evidence.externalTransactionId !== null && isBlank(evidence.externalTransactionId)) {
    return false;
  }
  return true;
}

function validShipping(shipping: CanonicalOrderShippingSnapshot): boolean {
  if (isBlank(shipping.recipient)) return false;
  if (!Array.isArray(shipping.addressLines)) return false;
  if (shipping.addressLines.length < 1 || shipping.addressLines.length > 3) return false;
  if (shipping.addressLines.some((line) => isBlank(line))) return false;
  if (isBlank(shipping.city)) return false;
  if (typeof shipping.region !== "string") return false;
  if (isBlank(shipping.postalCode)) return false;
  if (isBlank(shipping.country)) return false;
  if (shipping.serviceLabel !== null && isBlank(shipping.serviceLabel)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Money. Computed once, here.
// ---------------------------------------------------------------------------

interface ComputedMoney {
  lines: CanonicalOrderLineRecord[];
  subtotalCents: number;
  totalCents: number;
}

function computeMoney(
  lines: CanonicalOrderConversionInput["lines"],
  shippingCents: number,
): ComputedMoney | CanonicalOrderRefusal {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_CANONICAL_ORDER_LINES) {
    return refuse("LINES_INVALID", "A canonical order needs between 1 and 100 line items.");
  }
  const computed: CanonicalOrderLineRecord[] = [];
  let subtotalCents = 0;
  for (const line of lines) {
    if (isBlank(line.sku) || isBlank(line.displayName)) {
      return refuse("LINES_INVALID", "Every line needs a sku and a display name.");
    }
    if (!isCount(line.quantity, MAX_CANONICAL_LINE_QUANTITY)) {
      return refuse("LINES_INVALID", `Line ${line.sku} has an invalid quantity.`);
    }
    if (!isCount(line.unitPriceCents, MAX_CANONICAL_UNIT_PRICE_CENTS)) {
      return refuse("LINES_INVALID", `Line ${line.sku} has an invalid authorized unit price.`);
    }
    const lineTotalCents = line.unitPriceCents * line.quantity;
    subtotalCents += lineTotalCents;
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents > MAX_CANONICAL_ORDER_TOTAL_CENTS) {
      return refuse("LINES_INVALID", "The order subtotal exceeds the supported maximum.");
    }
    computed.push({
      sku: line.sku.trim(),
      displayName: line.displayName.trim(),
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents,
    });
  }
  if (
    typeof shippingCents !== "number" ||
    !Number.isSafeInteger(shippingCents) ||
    shippingCents < 0 ||
    shippingCents > MAX_CANONICAL_ORDER_TOTAL_CENTS
  ) {
    return refuse("LINES_INVALID", "Shipping must be a non-negative integer amount of cents.");
  }
  const totalCents = subtotalCents + shippingCents;
  if (!Number.isSafeInteger(totalCents) || totalCents > MAX_CANONICAL_ORDER_TOTAL_CENTS) {
    return refuse("LINES_INVALID", "The order total exceeds the supported maximum.");
  }
  return { lines: computed, subtotalCents, totalCents };
}

// ---------------------------------------------------------------------------
// Replay identity: when is a duplicate conversion the SAME conversion?
// ---------------------------------------------------------------------------

/**
 * The material content of a conversion. Two conversions of one source with
 * equal fingerprints are one event told twice; unequal fingerprints are two
 * different claims about the same transaction, which no one gets to absorb
 * silently.
 */
function conversionFingerprint(record: CanonicalOrderRecord): string {
  return JSON.stringify({
    customerRef: record.customer.customerRef,
    subtotalCents: record.subtotalCents,
    shippingCents: record.shippingCents,
    totalCents: record.totalCents,
    lines: record.lines.map((line) => [line.sku, line.quantity, line.unitPriceCents]),
    acceptanceId: record.acceptanceEvidence?.acceptanceId ?? null,
    verificationId: record.paymentEvidence?.verificationId ?? null,
  });
}

// ---------------------------------------------------------------------------
// Conversion.
// ---------------------------------------------------------------------------

export async function convertToCanonicalOrder(
  input: CanonicalOrderConversionInput,
  repository: CanonicalOrderRepository,
): Promise<CanonicalOrderConversionResult> {
  // A customer never converts. Conversion is an act of the operator plane on
  // evidence, and an unnamed actor cannot be audited.
  if (!validActor(input.convertedBy)) {
    return refuse("ACTOR_REQUIRED", "Conversion requires a named admin or system actor.");
  }

  const smuggled = statedForbiddenKey(input);
  if (smuggled !== null) {
    return refuse(
      "CLIENT_TOTAL_REFUSED",
      `The conversion input may not state '${smuggled}'; money and state are derived server-side.`,
    );
  }

  const kind = input.source?.kind;
  if (!(CANONICAL_ORDER_SOURCE_KINDS as readonly unknown[]).includes(kind)) {
    return refuse("SOURCE_INVALID", "Unknown conversion source kind.");
  }
  const sourceRef = input.source.sourceRef;
  if (isBlank(sourceRef) || !sourceRef.startsWith(CANONICAL_ORDER_SOURCE_PREFIXES[kind])) {
    return refuse(
      "SOURCE_INVALID",
      `A ${kind} conversion needs a source ref in the ${CANONICAL_ORDER_SOURCE_PREFIXES[kind]} id space.`,
    );
  }
  const requestRef = input.source.requestRef ?? null;
  if (requestRef !== null && isBlank(requestRef)) {
    return refuse("SOURCE_INVALID", "A stated request ref may not be blank.");
  }

  if (isBlank(input.customer?.customerRef)) {
    return refuse("CUSTOMER_REQUIRED", "A canonical order must belong to a customer handle.");
  }
  const memberId = input.customer.memberId ?? null;
  if (memberId !== null && isBlank(memberId)) {
    return refuse("CUSTOMER_REQUIRED", "A stated member id may not be blank.");
  }

  const organizationRef = input.organizationRef ?? null;
  if (organizationRef !== null && isBlank(organizationRef)) {
    return refuse("CUSTOMER_REQUIRED", "A stated organization ref may not be blank.");
  }

  const attribution = input.attribution ?? null;
  if (attribution !== null && isBlank(attribution.affiliateAttributionRef)) {
    return refuse("EVIDENCE_INVALID", "A stated affiliate attribution ref may not be blank.");
  }

  if (!validShipping(input.shipping)) {
    return refuse("SHIPPING_INVALID", "The shipping snapshot is incomplete.");
  }

  if (!isIsoInstant(input.placedAt)) {
    return refuse("SOURCE_INVALID", "placedAt must be a parseable instant.");
  }

  const money = computeMoney(input.lines, input.shippingCents);
  if ("ok" in money) return money;

  // The echo check. The number the customer was shown must be the number this
  // domain computes; a mismatch means one of the two is wrong, and choosing
  // either silently would hide it.
  if (input.expectedTotalCents !== money.totalCents) {
    return refuse(
      "TOTAL_MISMATCH",
      `Computed total ${money.totalCents} does not match the echoed total ${input.expectedTotalCents}.`,
    );
  }

  const acceptance = input.acceptance ?? null;
  if (acceptance !== null && !validAcceptance(acceptance)) {
    return refuse("EVIDENCE_INVALID", "Acceptance evidence is present but incomplete.");
  }
  const payment = input.payment ?? null;
  if (payment !== null && !validPayment(payment)) {
    return refuse("EVIDENCE_INVALID", "Payment evidence is present but incomplete.");
  }
  // The gate. No evidence, no order. This is what keeps an XRR request a
  // request until something real happened.
  if (acceptance === null && payment === null) {
    return refuse(
      "EVIDENCE_REQUIRED",
      "Conversion requires quote-acceptance evidence, payment evidence, or both.",
    );
  }

  const conversionKey = canonicalConversionKey(kind, sourceRef);
  const now = input.at.toISOString();
  const record: CanonicalOrderRecord = {
    orderNumber: canonicalOrderNumberFor(conversionKey),
    conversionKey,
    source: {
      kind,
      sourceRef,
      requestRef,
      quoteRef: acceptance?.quoteRef ?? null,
    },
    customer: {
      customerRef: input.customer.customerRef,
      memberId,
    },
    organizationRef,
    attribution,
    shipping: {
      recipient: input.shipping.recipient,
      addressLines: [...input.shipping.addressLines],
      city: input.shipping.city,
      region: input.shipping.region,
      postalCode: input.shipping.postalCode,
      country: input.shipping.country,
      serviceLabel: input.shipping.serviceLabel,
    },
    lines: money.lines,
    currency: "usd",
    subtotalCents: money.subtotalCents,
    shippingCents: input.shippingCents,
    totalCents: money.totalCents,
    // Derived, never stated. Payment evidence is the ONLY road to `paid`.
    paymentState: payment !== null ? "paid" : "awaiting_payment",
    paymentEvidence: payment,
    acceptanceEvidence: acceptance,
    fulfillmentState: "unfulfilled",
    fulfillmentEvents: [],
    placedAt: input.placedAt,
    convertedAt: now,
    updatedAt: now,
    convertedBy: { actor: input.convertedBy.actor, actorId: input.convertedBy.actorId },
    revision: 1,
  };

  const inserted = await repository.insert(record);
  if (inserted.inserted) {
    return { ok: true, order: inserted.order, replayed: false };
  }

  // Same source, second arrival. A replay only if it tells the same story.
  const incumbent = inserted.incumbent;
  if (conversionFingerprint(incumbent) === conversionFingerprint(record)) {
    return { ok: true, order: incumbent, replayed: true };
  }
  return refuse(
    "CONVERSION_CONFLICT",
    `Source ${sourceRef} was already converted as ${incumbent.orderNumber} with different content.`,
  );
}

// ---------------------------------------------------------------------------
// Progression: payment verification after an acceptance-only conversion.
// ---------------------------------------------------------------------------

export async function recordCanonicalPaymentVerified(
  orderNumber: string,
  evidence: CanonicalOrderPaymentEvidence,
  actor: CanonicalOrderActor,
  at: Date,
  repository: CanonicalOrderRepository,
): Promise<CanonicalOrderMutationResult> {
  if (!validActor(actor)) {
    return refuse("ACTOR_REQUIRED", "Payment verification requires a named admin or system actor.");
  }
  if (!validPayment(evidence)) {
    return refuse("EVIDENCE_INVALID", "Payment evidence is incomplete.");
  }
  const order = await repository.byNumber(orderNumber);
  if (order === null) return refuse("ORDER_NOT_FOUND", `No canonical order ${orderNumber}.`);

  if (order.paymentState === "paid") {
    // The same verification told twice is a replay; a different one on an
    // already-paid order is a contradiction someone must look at.
    if (order.paymentEvidence?.verificationId === evidence.verificationId) {
      return { ok: true, order, replayed: true };
    }
    return refuse(
      "PAYMENT_STATE_INVALID",
      `Order ${orderNumber} is already paid under a different verification.`,
    );
  }

  const next: CanonicalOrderRecord = {
    ...order,
    paymentState: "paid",
    paymentEvidence: evidence,
    updatedAt: at.toISOString(),
    revision: order.revision + 1,
  };
  const saved = await repository.update(next, order.revision);
  if (!saved.ok) {
    return saved.code === "NOT_FOUND"
      ? refuse("ORDER_NOT_FOUND", `No canonical order ${orderNumber}.`)
      : refuse("REVISION_STALE", `Order ${orderNumber} changed underneath this verification; re-read and retry.`);
  }
  return { ok: true, order: next, replayed: false };
}

// ---------------------------------------------------------------------------
// Progression: fulfillment.
// ---------------------------------------------------------------------------

const FULFILLMENT_TRANSITIONS: Readonly<
  Record<CanonicalOrderFulfillmentState, readonly CanonicalOrderFulfillmentState[]>
> = Object.freeze({
  unfulfilled: ["processing", "cancelled", "exception"],
  processing: ["shipped", "cancelled", "exception"],
  shipped: ["delivered", "exception"],
  delivered: [],
  cancelled: [],
  exception: ["processing", "cancelled"],
});

/** The states that represent goods moving toward the customer. */
const FORWARD_FULFILLMENT: ReadonlySet<CanonicalOrderFulfillmentState> =
  new Set<CanonicalOrderFulfillmentState>(["processing", "shipped", "delivered"]);

/**
 * The states a fulfillment EVENT may target. `unfulfilled` is the state an
 * order starts in, never one an event moves it to, so it is absent here — and
 * checked at runtime as well as in the type, because a caller reaching this
 * function from untyped JSON has no compiler protecting it.
 */
const FULFILLMENT_EVENT_TARGETS: readonly CanonicalOrderFulfillmentState[] =
  CANONICAL_ORDER_FULFILLMENT_STATES.filter((state) => state !== "unfulfilled");

export interface CanonicalFulfillmentEventInput {
  to: Exclude<CanonicalOrderFulfillmentState, "unfulfilled">;
  evidenceRef: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  note?: string | null;
  actor: CanonicalOrderActor;
  at: Date;
}

export async function recordCanonicalFulfillmentEvent(
  orderNumber: string,
  event: CanonicalFulfillmentEventInput,
  repository: CanonicalOrderRepository,
): Promise<CanonicalOrderMutationResult> {
  if (!validActor(event.actor)) {
    return refuse("ACTOR_REQUIRED", "Fulfillment progression requires a named admin or system actor.");
  }
  if (!(FULFILLMENT_EVENT_TARGETS as readonly unknown[]).includes(event.to)) {
    return refuse("FULFILLMENT_INVALID", "Unknown fulfillment target state.");
  }
  // Fulfillment states are never asserted from nothing: each event points at
  // the evidence that makes it true.
  if (isBlank(event.evidenceRef)) {
    return refuse("FULFILLMENT_INVALID", "A fulfillment event needs a non-blank evidence ref.");
  }
  const trackingNumber = event.trackingNumber ?? null;
  if (trackingNumber !== null && isBlank(trackingNumber)) {
    return refuse("FULFILLMENT_INVALID", "A stated tracking number may not be blank.");
  }
  const carrier = event.carrier ?? null;
  if (carrier !== null && isBlank(carrier)) {
    return refuse("FULFILLMENT_INVALID", "A stated carrier may not be blank.");
  }

  const order = await repository.byNumber(orderNumber);
  if (order === null) return refuse("ORDER_NOT_FOUND", `No canonical order ${orderNumber}.`);

  // The same evidence applied to the same target twice is one event told
  // twice, not two events.
  const already = order.fulfillmentEvents.find(
    (existing) => existing.evidenceRef === event.evidenceRef && existing.to === event.to,
  );
  if (already !== undefined) {
    return { ok: true, order, replayed: true };
  }

  if (!FULFILLMENT_TRANSITIONS[order.fulfillmentState].includes(event.to)) {
    return refuse(
      "FULFILLMENT_INVALID",
      `Order ${orderNumber} cannot move from ${order.fulfillmentState} to ${event.to}.`,
    );
  }
  // Goods never move toward a customer whose money has not been verified. An
  // unpaid order can be cancelled or flagged, never processed or shipped, so
  // an unpaid path cannot end up looking like a fulfilled paid order.
  if (FORWARD_FULFILLMENT.has(event.to) && order.paymentState !== "paid") {
    return refuse(
      "FULFILLMENT_INVALID",
      `Order ${orderNumber} is not paid; it cannot progress to ${event.to}.`,
    );
  }

  const appended: CanonicalOrderFulfillmentEvent = {
    to: event.to,
    at: event.at.toISOString(),
    actorId: event.actor.actorId,
    evidenceRef: event.evidenceRef,
    trackingNumber,
    carrier,
    note: event.note ?? null,
  };
  const next: CanonicalOrderRecord = {
    ...order,
    fulfillmentState: event.to,
    fulfillmentEvents: [...order.fulfillmentEvents, appended],
    updatedAt: event.at.toISOString(),
    revision: order.revision + 1,
  };
  const saved = await repository.update(next, order.revision);
  if (!saved.ok) {
    return saved.code === "NOT_FOUND"
      ? refuse("ORDER_NOT_FOUND", `No canonical order ${orderNumber}.`)
      : refuse("REVISION_STALE", `Order ${orderNumber} changed underneath this event; re-read and retry.`);
  }
  return { ok: true, order: next, replayed: false };
}

// ---------------------------------------------------------------------------
// The customer view projection. An allowlist, never a spread.
// ---------------------------------------------------------------------------

/** The latest tracking any recorded event carried, or nothing. */
function latestTracking(record: CanonicalOrderRecord): CanonicalOrderTrackingView | null {
  for (let i = record.fulfillmentEvents.length - 1; i >= 0; i -= 1) {
    const event = record.fulfillmentEvents[i];
    if (event.trackingNumber !== null) {
      return { trackingNumber: event.trackingNumber, carrier: event.carrier };
    }
  }
  return null;
}

/**
 * Field by field, so a future field added to the record stays OFF the wire
 * until someone deliberately puts it here. Attribution, evidence ids,
 * verifier names and actor ids are never touched by this function.
 */
export function canonicalOrderView(record: CanonicalOrderRecord): CanonicalOrderView {
  return {
    orderNumber: record.orderNumber,
    placedAt: record.placedAt,
    convertedAt: record.convertedAt,
    currency: record.currency,
    lines: record.lines.map((line) => ({
      sku: line.sku,
      displayName: line.displayName,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents,
    })),
    subtotalCents: record.subtotalCents,
    shippingCents: record.shippingCents,
    totalCents: record.totalCents,
    paymentState: record.paymentState,
    fulfillmentState: record.fulfillmentState,
    tracking: latestTracking(record),
    source: {
      kind: record.source.kind,
      sourceRef: record.source.sourceRef,
      requestRef: record.source.requestRef,
      quoteRef: record.source.quoteRef,
    },
    organizationRef: record.organizationRef,
  };
}

// ---------------------------------------------------------------------------
// Customer reads. Ownership first; a foreign order is never read at all.
// ---------------------------------------------------------------------------

export interface MemberCanonicalOrderHistory {
  listForMember(memberId: string): Promise<CanonicalOrderView[]>;
  getForMember(memberId: string, orderNumber: string): Promise<CanonicalOrderView | null>;
}

async function ownedRecords(
  memberId: unknown,
  bindings: CanonicalOrderBindingsPort,
  repository: Pick<CanonicalOrderRepository, "listByCustomerRefs">,
): Promise<readonly CanonicalOrderRecord[]> {
  if (typeof memberId !== "string" || memberId.trim() === "") return [];
  const refs = await bindings.customerRefsFor(memberId);
  if (!Array.isArray(refs) || refs.length === 0) return [];

  const owned = new Set<string>();
  for (const ref of refs) {
    if (typeof ref !== "string" || ref === "") continue;
    owned.add(ref);
    if (owned.size >= MAX_CANONICAL_HISTORY_CUSTOMER_REFS) break;
  }
  if (owned.size === 0) return [];

  const records = await repository.listByCustomerRefs(Array.from(owned));
  if (!Array.isArray(records)) return [];

  const seen = new Set<string>();
  const kept: CanonicalOrderRecord[] = [];
  for (const record of records) {
    if (record === null || typeof record !== "object") continue;
    // THE RE-CHECK. The store filtered on these handles; it is checked again
    // here because this read decides whose purchase history renders. Note
    // what is NOT consulted: attribution. An affiliate ref on the order can
    // never move it into or out of anyone's history.
    if (!owned.has(record.customer.customerRef)) continue;
    if (seen.has(record.orderNumber)) continue;
    seen.add(record.orderNumber);
    kept.push(record);
  }
  return kept.sort((a, b) =>
    a.placedAt === b.placedAt
      ? a.orderNumber.localeCompare(b.orderNumber)
      : b.placedAt.localeCompare(a.placedAt),
  );
}

export function createMemberCanonicalOrderHistory(deps: {
  bindings: CanonicalOrderBindingsPort;
  repository: Pick<CanonicalOrderRepository, "listByCustomerRefs">;
}): MemberCanonicalOrderHistory {
  return {
    async listForMember(memberId: string): Promise<CanonicalOrderView[]> {
      const records = await ownedRecords(memberId, deps.bindings, deps.repository);
      return records.map(canonicalOrderView);
    },

    async getForMember(memberId: string, orderNumber: string): Promise<CanonicalOrderView | null> {
      if (typeof orderNumber !== "string" || orderNumber === "") return null;
      // Resolved through the SAME ownership path as the list, never by
      // looking the order up first. A probe cannot distinguish another
      // customer's order from one that does not exist.
      const records = await ownedRecords(memberId, deps.bindings, deps.repository);
      const match = records.find((record) => record.orderNumber === orderNumber);
      return match === undefined ? null : canonicalOrderView(match);
    },
  };
}

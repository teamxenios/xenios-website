/**
 * Private Early Access order placement. Server only, injectable, no network, no
 * Express, no clock, no randomness.
 *
 * This is the step above `early-access-order.ts`. That module is the money
 * arithmetic and the order shape. This one answers the question that must be
 * settled before any arithmetic happens at all: may this exact unit be sold to
 * this customer right now, and at what price.
 *
 * The answer never comes from the request. Product Control holds every Early
 * Access unit and has no approved price for any of them, so the only thing that
 * can price a unit here is a founder release, and the only thing that can permit
 * the sale is that same release. The request supplies identity and intent
 * (which unit, how many, for whom); the server supplies everything that costs
 * money.
 *
 * FOUR PROPERTIES, EACH ENFORCED STRUCTURALLY RATHER THAN BY VALIDATION
 *
 * 1. THE PRICE IS NOT AN INPUT. The request is projected onto a fixed key list
 *    before it is read, so a `priceCents`, `total`, or `currency` field is not
 *    rejected, argued with, or logged: it is never read. There is no code path
 *    on which a client value reaches the line total. Compare
 *    `early-access-order.ts`, which refuses the whole request when such a key is
 *    present. Refusing is correct for that module, whose caller is trusted
 *    server code that should never send one. It is wrong at this boundary, where
 *    a browser or a proxy may attach fields for its own reasons and the
 *    customer would be blocked from buying by something that could never have
 *    influenced the outcome.
 *
 * 2. A SALE REQUIRES A NAMED DECISION. `decideEarlyAccessRelease` must return
 *    `released: true`. A unit Product Control already considers purchasable is
 *    still refused here without a release, because Early Access is the portal
 *    the override exists for, and selling without an override on it would leave
 *    no record of who decided.
 *
 * 3. THE ORDER OUTLIVES THE BRIDGE. The release id and the product version it
 *    was approved against are copied onto the order. Deleting the release ledger
 *    when Product Control catches up leaves every historical order still able to
 *    state what it was sold under.
 *
 * 4. THE DISCOUNT IS SERVER ARITHMETIC. Bundle pricing is derived from the
 *    quantity alone, in integer cents, so two runs of the same request produce
 *    the same cents and no fractional cent is ever invented.
 */

import type { EarlyAccessCatalogRow } from "../catalog/early-access-catalog";
import {
  decideEarlyAccessRelease,
  type EarlyAccessRelease,
  type EarlyAccessReleaseHold,
} from "../release/founder-release";
import {
  EARLY_ACCESS_CURRENCIES,
  EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS,
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MAX_UNIT_PRICE_CENTS,
  EARLY_ACCESS_MIN_QUANTITY,
  createEarlyAccessOrder as buildEarlyAccessOrderRecord,
  type EarlyAccessCurrency,
  type EarlyAccessOrder,
  type EarlyAccessOrderFailureCode,
} from "./early-access-order";
import {
  accepted,
  isBoundedInteger,
  isCanonicalTimestamp,
  isOneOf,
  isPositiveCents,
  isSafeIdentifier,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";

// ---------------------------------------------------------------------------
// Idempotency keys
// ---------------------------------------------------------------------------

/**
 * The key format already used by the manual-payment lane in
 * server/research/commerce/manual-order-payments.ts, restated here rather than
 * imported so this folder keeps its rule that every module is a pure function
 * over injected values with no dependency outside it.
 *
 * Sixteen characters minimum is the point of the shape. A short key is one a
 * second customer can collide with by accident, and a collision on this key
 * means one of them silently receives the other's order.
 */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{15,127}$/;

export function isEarlyAccessIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && IDEMPOTENCY_KEY.test(value);
}

// ---------------------------------------------------------------------------
// Bundle tiers
// ---------------------------------------------------------------------------

export type EarlyAccessBundleTier = Readonly<{
  quantity: number;
  label: string;
  /** Basis points off the line subtotal. 2000 is twenty percent. */
  discountBasisPoints: number;
}>;

/**
 * The three quantities Early Access sells, and the only discount that exists.
 *
 * Twenty percent at three units is the whole promotion. One and two units carry
 * no discount because none has been decided, and a discount nobody approved is a
 * financial fact this module is not entitled to invent.
 */
export const EARLY_ACCESS_BUNDLE_TIERS: readonly EarlyAccessBundleTier[] = Object.freeze([
  Object.freeze({ quantity: 1, label: "1 Unit", discountBasisPoints: 0 }),
  Object.freeze({ quantity: 2, label: "2 Units", discountBasisPoints: 0 }),
  Object.freeze({ quantity: 3, label: "3-Unit Bundle", discountBasisPoints: 2_000 }),
]);

export function earlyAccessBundleTier(quantity: number): EarlyAccessBundleTier | null {
  return EARLY_ACCESS_BUNDLE_TIERS.find((tier) => tier.quantity === quantity) ?? null;
}

/**
 * The discount in whole cents, computed in integer arithmetic end to end.
 *
 * `subtotal * basisPoints` is an exact integer well inside the safe range, and
 * removing the remainder before dividing means no floating point value is ever
 * rounded, so the result cannot drift by a cent between runs or platforms.
 *
 * The remainder is dropped rather than rounded up, so the discount is never
 * larger than the approved percentage of the approved price. The customer pays
 * at most one cent more than an exact percentage, which is the direction that
 * cannot overstate what the founder released.
 */
export function earlyAccessBundleDiscountCents(
  subtotalCents: number,
  discountBasisPoints: number,
): number {
  const gross = subtotalCents * discountBasisPoints;
  return (gross - (gross % 10_000)) / 10_000;
}

// ---------------------------------------------------------------------------
// The stored order
// ---------------------------------------------------------------------------

/**
 * One placed Early Access order.
 *
 * The domain order is embedded whole rather than flattened, so it stays valid
 * under `readEarlyAccessOrder` and every module downstream (invoicing, proof,
 * verification, commission) keeps reading the shape it already knows. Its
 * `orderTotalCents` is the undiscounted subtotal, because that module derives
 * the total from unit price times quantity and refuses a snapshot that disagrees
 * with its own line. The bundle discount therefore lives here, one level up,
 * where it can be stated explicitly instead of hidden inside a unit price that
 * would not divide evenly.
 */
export type EarlyAccessReleaseOrder = Readonly<{
  idempotencyKey: string;
  order: EarlyAccessOrder;
  /** The exact founder decision this unit was sold under. */
  releaseId: string;
  /** The product fingerprint that decision was bound to. */
  productVersion: string;
  tier: EarlyAccessBundleTier;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: EarlyAccessCurrency;
}>;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * The outcome of an insert attempt.
 *
 * `insert` reports the record already occupying the slot rather than throwing,
 * because the race it closes is normal traffic: a customer double taps, two
 * requests carry one key, and both reach the store. Returning the incumbent lets
 * the loser of that race answer with the same order the winner created.
 */
export type EarlyAccessOrderInsert =
  | Readonly<{ inserted: true; record: EarlyAccessReleaseOrder }>
  | Readonly<{
      inserted: false;
      /** Which uniqueness rule held. Each has a different correct response. */
      reason: "idempotency_key" | "order_id";
      record: EarlyAccessReleaseOrder;
    }>;

export interface EarlyAccessOrderRepository {
  findByIdempotencyKey(idempotencyKey: string): Promise<EarlyAccessReleaseOrder | null>;
  findByOrderId(orderId: string): Promise<EarlyAccessReleaseOrder | null>;
  /** Insert only. There is no update and no delete: a placed order is a fact. */
  insert(record: EarlyAccessReleaseOrder): Promise<EarlyAccessOrderInsert>;
}

export class InMemoryEarlyAccessOrderRepository implements EarlyAccessOrderRepository {
  private readonly byIdempotencyKey = new Map<string, EarlyAccessReleaseOrder>();
  private readonly byOrderId = new Map<string, EarlyAccessReleaseOrder>();

  async findByIdempotencyKey(idempotencyKey: string): Promise<EarlyAccessReleaseOrder | null> {
    return this.byIdempotencyKey.get(idempotencyKey) ?? null;
  }

  async findByOrderId(orderId: string): Promise<EarlyAccessReleaseOrder | null> {
    return this.byOrderId.get(orderId) ?? null;
  }

  async insert(record: EarlyAccessReleaseOrder): Promise<EarlyAccessOrderInsert> {
    const byKey = this.byIdempotencyKey.get(record.idempotencyKey);
    if (byKey) {
      return Object.freeze({
        inserted: false as const,
        reason: "idempotency_key" as const,
        record: byKey,
      });
    }
    const byOrder = this.byOrderId.get(record.order.orderId);
    if (byOrder) {
      return Object.freeze({
        inserted: false as const,
        reason: "order_id" as const,
        record: byOrder,
      });
    }
    this.byIdempotencyKey.set(record.idempotencyKey, record);
    this.byOrderId.set(record.order.orderId, record);
    return Object.freeze({ inserted: true as const, record });
  }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/**
 * Codes this module raises on its own. The domain constructor's codes are unioned
 * in below and passed through unchanged, so a caller switching on `code` sees one
 * flat vocabulary and never has to unwrap a nested failure.
 */
export type EarlyAccessOrderServiceCode =
  | "request_invalid"
  | "idempotency_key_invalid"
  | "idempotency_key_conflict"
  | "order_id_taken"
  | "timestamp_invalid"
  | "quantity_limit_exceeded"
  | "unit_not_in_catalog"
  | "unit_ambiguous"
  | "release_required"
  | "release_revoked"
  | "release_stale"
  | "release_expired"
  | "product_held"
  | "release_blockers_not_waived"
  | "release_price_invalid"
  | "release_currency_invalid"
  | "bundle_tier_unavailable"
  | "amount_overflow";

export type EarlyAccessOrderServiceFailure =
  | EarlyAccessOrderServiceCode
  | EarlyAccessOrderFailureCode;

export type EarlyAccessOrderPlacement = Readonly<{
  record: EarlyAccessReleaseOrder;
  /** True when this call returned an order a previous call with the same key created. */
  replayed: boolean;
}>;

export type EarlyAccessOrderServiceResult = CommerceResult<
  EarlyAccessOrderPlacement,
  EarlyAccessOrderServiceFailure
>;

export interface EarlyAccessOrderServiceInput {
  /** Whatever arrived from the client. Treated as hostile. */
  readonly request: unknown;
  /** The Early Access catalog projection, already computed by the caller. */
  readonly rows: readonly EarlyAccessCatalogRow[];
  /** Every founder release on record, including revocations. */
  readonly releases: readonly EarlyAccessRelease[];
  readonly orders: EarlyAccessOrderRepository;
}

// ---------------------------------------------------------------------------
// Request reading
// ---------------------------------------------------------------------------

const REQUEST_REQUIRED_KEYS = [
  "idempotencyKey",
  "orderId",
  "customerRef",
  "productId",
  "variantId",
  "quantity",
  "now",
] as const;

const REQUEST_OPTIONAL_KEYS = ["referralCode"] as const;

const REQUEST_KEYS: readonly string[] = [...REQUEST_REQUIRED_KEYS, ...REQUEST_OPTIONAL_KEYS];

/**
 * Copy the fields this module uses onto a fresh plain object and discard the rest.
 *
 * This is what makes "the price is ignored" a structural fact rather than a
 * promise. A key outside the list is not compared against a deny list, so a deny
 * list cannot be out of date, and a field named `price`, `unitPriceCents`,
 * `total`, or anything else a client invents is simply not carried forward.
 *
 * Values are read from descriptors rather than by property access, so an accessor
 * planted on the request is refused instead of invoked.
 */
function projectRequestFields(input: unknown): Record<string, unknown> | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const descriptors = Object.getOwnPropertyDescriptors(input) as Record<
      string,
      PropertyDescriptor | undefined
    >;
    const projected: Record<string, unknown> = {};
    for (const key of REQUEST_KEYS) {
      const descriptor = descriptors[key];
      if (descriptor === undefined) continue;
      if (!("value" in descriptor) || descriptor.enumerable !== true) return null;
      projected[key] = descriptor.value;
    }
    return projected;
  } catch {
    return null;
  }
}

type EarlyAccessOrderRequest = Readonly<{
  idempotencyKey: string;
  orderId: string;
  customerRef: string;
  productId: string;
  variantId: string;
  quantity: number;
  referralCode: string | null;
  now: string;
}>;

type RequestRead = CommerceResult<EarlyAccessOrderRequest, EarlyAccessOrderServiceFailure>;

function readRequest(input: unknown): RequestRead {
  const projected = projectRequestFields(input);
  if (!projected) return refused("request_invalid");

  const record = readPlainRecord(projected, REQUEST_REQUIRED_KEYS, REQUEST_OPTIONAL_KEYS);
  if (!record) return refused("request_invalid");

  if (!isEarlyAccessIdempotencyKey(record.idempotencyKey)) return refused("idempotency_key_invalid");
  if (!isSafeIdentifier(record.orderId)) return refused("order_id_invalid");
  if (!isSafeIdentifier(record.customerRef)) return refused("customer_invalid");
  if (!isSafeIdentifier(record.productId) || !isSafeIdentifier(record.variantId)) {
    return refused("product_invalid");
  }
  if (!isBoundedInteger(record.quantity, EARLY_ACCESS_MIN_QUANTITY, EARLY_ACCESS_MAX_QUANTITY)) {
    return refused("quantity_out_of_range");
  }
  if (!isCanonicalTimestamp(record.now)) return refused("timestamp_invalid");

  const referral = record.referralCode;
  const referralCode = referral === undefined || referral === null ? null : referral;
  // The shape is checked by the domain constructor. Reading it here only decides
  // whether a value is carried forward at all.
  if (referralCode !== null && typeof referralCode !== "string") return refused("referral_invalid");

  return accepted(
    Object.freeze({
      idempotencyKey: record.idempotencyKey,
      orderId: record.orderId,
      customerRef: record.customerRef,
      productId: record.productId,
      variantId: record.variantId,
      quantity: record.quantity,
      referralCode,
      now: record.now,
    }),
  );
}

/**
 * Whether a stored order was created by the request now being replayed.
 *
 * An idempotency key answers "have I already done this", so reusing one key for a
 * different unit, quantity, or customer is not a replay, it is two orders wearing
 * one name. That is refused rather than answered with the first order, which is
 * the failure mode where a customer is charged for something they did not ask for.
 */
function matchesStoredOrder(
  stored: EarlyAccessReleaseOrder,
  request: EarlyAccessOrderRequest,
): boolean {
  return (
    stored.order.orderId === request.orderId &&
    stored.order.customerRef === request.customerRef &&
    stored.order.line.productId === request.productId &&
    stored.order.line.variantId === request.variantId &&
    stored.order.line.quantity === request.quantity &&
    stored.order.referralCode === request.referralCode
  );
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

// Typed against the hold union itself rather than a copy of it, so a new hold
// code added to the bridge becomes a compile error here instead of falling
// through to a default that would let an order past.
function releaseFailure(hold: EarlyAccessReleaseHold): EarlyAccessOrderServiceCode {
  switch (hold) {
    case "NO_FOUNDER_RELEASE":
      return "release_required";
    case "RELEASE_REVOKED":
      return "release_revoked";
    case "RELEASE_STALE":
      return "release_stale";
    case "RELEASE_EXPIRED":
      return "release_expired";
    case "NONWAIVABLE_BLOCKER":
      return "product_held";
    case "BLOCKERS_NOT_WAIVED":
      return "release_blockers_not_waived";
  }
}

/**
 * Place one Early Access order.
 *
 * Named for the act, not for the arithmetic. `early-access-order.ts` exports a
 * function of the same name that builds an order record from an already resolved
 * price. This one decides whether there is a price to resolve at all, and calls
 * that one to do the money.
 */
export async function createEarlyAccessOrder(
  input: EarlyAccessOrderServiceInput,
): Promise<EarlyAccessOrderServiceResult> {
  const read = readRequest(input.request);
  if (!read.ok) return refused(read.code);
  const request = read.value;

  // Answered before the catalog and the ledger are consulted, so a replay returns
  // the order that was actually sold even after the release behind it is revoked
  // or goes stale. What was sold stays sold; the ledger governs new sales only.
  const priorByKey = await input.orders.findByIdempotencyKey(request.idempotencyKey);
  if (priorByKey) {
    if (!matchesStoredOrder(priorByKey, request)) return refused("idempotency_key_conflict");
    return accepted(Object.freeze({ record: priorByKey, replayed: true }));
  }

  const matches = input.rows.filter(
    (row) => row.productId === request.productId && row.variantId === request.variantId,
  );
  if (matches.length === 0) return refused("unit_not_in_catalog");
  // Two rows for one identity means the projection could not say which unit this
  // is. Selling either one would be a guess about what ships.
  if (matches.length > 1) return refused("unit_ambiguous");
  const row = matches[0] as EarlyAccessCatalogRow;

  const decision = decideEarlyAccessRelease({
    row,
    releases: input.releases,
    now: Date.parse(request.now),
  });
  if (!decision.released) return refused(releaseFailure(decision.hold));

  // The release is the only price. `row.priceCents` is deliberately not read: it
  // is null for every held unit, and reading it would create a second path to a
  // number that no founder approved for this portal.
  if (!isPositiveCents(decision.priceCents, EARLY_ACCESS_MAX_UNIT_PRICE_CENTS)) {
    return refused("release_price_invalid");
  }
  if (!isOneOf(decision.currency, EARLY_ACCESS_CURRENCIES)) {
    return refused("release_currency_invalid");
  }

  // A per unit cap recorded by Product Control is a supply fact, so it binds even
  // though the founder waived the blockers that made the unit unsellable.
  if (row.quantityLimit !== null && request.quantity > row.quantityLimit) {
    return refused("quantity_limit_exceeded");
  }

  const tier = earlyAccessBundleTier(request.quantity);
  if (!tier) return refused("bundle_tier_unavailable");

  const built = buildEarlyAccessOrderRecord({
    orderId: request.orderId,
    customerRef: request.customerRef,
    productId: row.productId,
    variantId: row.variantId,
    // The SKU is the catalog's, never the request's. A customer cannot name the
    // unit they are billed for.
    sku: row.sku,
    quantity: request.quantity,
    unitPriceCents: decision.priceCents,
    currency: decision.currency,
    now: request.now,
    referralCode: request.referralCode,
  });
  if (!built.ok) return refused(built.code);
  const order = built.value;

  const subtotalCents = order.orderTotalCents;
  const discountCents = earlyAccessBundleDiscountCents(subtotalCents, tier.discountBasisPoints);
  const totalCents = subtotalCents - discountCents;
  if (!isPositiveCents(totalCents, EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS)) {
    return refused("amount_overflow");
  }

  const record: EarlyAccessReleaseOrder = Object.freeze({
    idempotencyKey: request.idempotencyKey,
    order,
    releaseId: decision.releaseId,
    productVersion: decision.productVersion,
    tier,
    subtotalCents,
    discountCents,
    totalCents,
    currency: order.currency,
  });

  const written = await input.orders.insert(record);
  if (written.inserted) return accepted(Object.freeze({ record: written.record, replayed: false }));
  if (written.reason === "order_id") return refused("order_id_taken");
  // The key was claimed between the read above and this write. The incumbent is
  // the order that exists, so it answers, exactly as the early return would have.
  if (!matchesStoredOrder(written.record, request)) return refused("idempotency_key_conflict");
  return accepted(Object.freeze({ record: written.record, replayed: true }));
}

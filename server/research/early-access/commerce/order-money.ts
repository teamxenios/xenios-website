/**
 * The Early Access order money snapshot. Server only, pure, side effect free.
 *
 * THE DEFECT THIS MODULE EXISTS TO CLOSE
 * --------------------------------------
 * An Early Access order used to state exactly one amount, `orderTotalCents`, derived
 * structurally as unit price times quantity. That number is the PRE-DISCOUNT
 * merchandise subtotal. The bundle discount lived a level up, in the placement
 * service, where the receipt, the commission, and the verification could not see it.
 * On a three unit bundle the customer owed 47,760 while the receipt and the affiliate
 * hold both read 59,700. A receipt or a commission stated on an amount the customer
 * never owed is not a rounding problem, it is an incorrect financial record.
 *
 * The fix is to give the order ONE immutable statement of its money, carrying every
 * component and the single amount that is actually payable, and to make the payable
 * amount a type that a subtotal cannot be substituted for.
 *
 * THE INVARIANT
 * -------------
 *   payableTotalCents === subtotalCents - discountCents + shippingCents + taxCents
 *
 * It is checked when a snapshot is built and again every time one is read back from
 * storage, so a row edited by hand, restored from a backup taken under older rules, or
 * written by a future call site that skipped the constructor cannot be carried forward
 * into an invoice, a verification, a receipt, or a commission.
 *
 * THE BRAND
 * ---------
 * `payableTotalCents` is a branded number. A plain `number`, and therefore
 * `orderTotalCents`, `subtotalCents`, or any other loose amount, is NOT assignable to
 * it. Every site that needs the final amount declares `PayableTotalCents`, so
 * reintroducing the original defect by reading the subtotal again is a compile error
 * rather than a number that looks plausible. The brand exists only in the type system;
 * the runtime invariant checks below are what a test can observe.
 */

import {
  accepted,
  carriesAnyKey,
  isSafeIdentifier,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";

/**
 * Closed currency vocabulary, owned here rather than by the order module, because the
 * order module imports this one and a value cycle between them would be fragile under
 * ESM. `early-access-order.ts` re-exports these so existing importers are unaffected.
 * A currency outside this list is refused, never converted: this domain holds no rate.
 */
export const EARLY_ACCESS_CURRENCIES = ["USD"] as const;
export type EarlyAccessCurrency = (typeof EARLY_ACCESS_CURRENCIES)[number];

/**
 * The ceiling for any single money field in this domain, equal to the maximum unit
 * price times the maximum quantity. A test asserts it stays equal to
 * `EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS`, so widening one without the other is caught.
 */
export const EARLY_ACCESS_MAX_MONEY_CENTS = 25_000_000;

declare const PAYABLE_TOTAL_BRAND: unique symbol;

/**
 * The amount the customer actually owes.
 *
 * Nominal on purpose. It is produced only by this module, from a snapshot whose
 * invariant held, so a value of this type cannot have come from anywhere else.
 */
export type PayableTotalCents = number & { readonly [PAYABLE_TOTAL_BRAND]: "payable_total" };

/**
 * The single immutable statement of one order's money.
 *
 * Every component is an integer in minor units. There is no floating point anywhere in
 * this domain, so no amount can drift by a fraction of a cent between two runs.
 */
export type OrderMoneySnapshot = Readonly<{
  currency: EarlyAccessCurrency;
  /** Merchandise before any discount. This is what `orderTotalCents` has always been. */
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  payableTotalCents: PayableTotalCents;
  /** Null exactly when no promotion applied. A named promotion always has a version. */
  promotionId: string | null;
  promotionVersion: string | null;
}>;

/** The exact public shape. A field added later must be added here on purpose. */
export const ORDER_MONEY_SNAPSHOT_KEYS = [
  "currency",
  "subtotalCents",
  "discountCents",
  "shippingCents",
  "taxCents",
  "payableTotalCents",
  "promotionId",
  "promotionVersion",
] as const;

const BUILD_REQUIRED_KEYS = [
  "currency",
  "subtotalCents",
  "discountCents",
  "shippingCents",
  "taxCents",
] as const;

const BUILD_OPTIONAL_KEYS = ["promotionId", "promotionVersion"] as const;

/**
 * Names a caller might use to state the payable total itself.
 *
 * The payable total is DERIVED here and never accepted. Present for any reason, the
 * whole build is refused with a dedicated code, so the refusal is visible in a log
 * rather than blending into a generic validation failure.
 */
export const CLIENT_SUPPLIED_MONEY_KEYS = [
  "amount",
  "amountCents",
  "amountDue",
  "amountDueCents",
  "grandTotal",
  "grandTotalCents",
  "payableTotal",
  "payableTotalCents",
  "total",
  "totalCents",
] as const;

export type OrderMoneyFailureCode =
  | "client_amount_supplied"
  | "input_invalid"
  | "currency_unsupported"
  | "subtotal_invalid"
  | "discount_invalid"
  | "discount_exceeds_subtotal"
  | "shipping_invalid"
  | "tax_invalid"
  | "payable_total_invalid"
  | "payable_total_mismatch"
  | "promotion_invalid"
  | "amount_overflow";

export type OrderMoneyResult = CommerceResult<OrderMoneySnapshot, OrderMoneyFailureCode>;

/**
 * The one place a `PayableTotalCents` comes into existence.
 *
 * Private, so the brand cannot be minted from an arbitrary number anywhere else. Every
 * caller reaches a payable total through a snapshot whose invariant was checked.
 */
function asPayableTotal(value: number): PayableTotalCents {
  return value as PayableTotalCents;
}

/** A non-negative whole number of minor units inside the domain ceiling. */
function isMoneyComponent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= EARLY_ACCESS_MAX_MONEY_CENTS
  );
}

/**
 * The invariant, stated once.
 *
 * Both the constructor and the reader call this, so there is no second expression of
 * the same rule that could be edited on one path and not the other.
 */
export function payableTotalFor(components: {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly shippingCents: number;
  readonly taxCents: number;
}): number {
  return (
    components.subtotalCents -
    components.discountCents +
    components.shippingCents +
    components.taxCents
  );
}

/** True when a snapshot's stated payable total agrees with its own components. */
export function moneySnapshotInvariantHolds(snapshot: OrderMoneySnapshot): boolean {
  return snapshot.payableTotalCents === payableTotalFor(snapshot);
}

/**
 * Validate the promotion pair.
 *
 * A discount with no promotion behind it is an unattributable price cut, so it is
 * refused rather than accepted as a generous rounding. A promotion id without a
 * version cannot be reconciled against the rule that produced it later.
 */
function promotionPairInvalid(
  promotionId: string | null,
  promotionVersion: string | null,
  discountCents: number,
): boolean {
  if (promotionId === null && promotionVersion === null) return discountCents > 0;
  if (promotionId === null || promotionVersion === null) return true;
  return !isSafeIdentifier(promotionId) || !isSafeIdentifier(promotionVersion);
}

/**
 * Build one money snapshot from its components.
 *
 * The payable total is computed, never read from the input, so there is no code path on
 * which a caller supplied amount becomes the amount a customer is asked to pay.
 */
export function buildOrderMoneySnapshot(input: unknown): OrderMoneyResult {
  if (carriesAnyKey(input, CLIENT_SUPPLIED_MONEY_KEYS)) {
    return refused("client_amount_supplied");
  }

  const record = readPlainRecord(input, BUILD_REQUIRED_KEYS, BUILD_OPTIONAL_KEYS);
  if (!record) return refused("input_invalid");

  if (
    typeof record.currency !== "string" ||
    !(EARLY_ACCESS_CURRENCIES as readonly string[]).includes(record.currency)
  ) {
    return refused("currency_unsupported");
  }
  const currency = record.currency as EarlyAccessCurrency;

  if (!isMoneyComponent(record.subtotalCents)) return refused("subtotal_invalid");
  if (!isMoneyComponent(record.discountCents)) return refused("discount_invalid");
  if (!isMoneyComponent(record.shippingCents)) return refused("shipping_invalid");
  if (!isMoneyComponent(record.taxCents)) return refused("tax_invalid");
  // A discount larger than the merchandise it applies to would make the order a payout.
  if (record.discountCents > record.subtotalCents) return refused("discount_exceeds_subtotal");

  const promotionId =
    record.promotionId === undefined || record.promotionId === null
      ? null
      : (record.promotionId as string);
  const promotionVersion =
    record.promotionVersion === undefined || record.promotionVersion === null
      ? null
      : (record.promotionVersion as string);
  if (promotionPairInvalid(promotionId, promotionVersion, record.discountCents)) {
    return refused("promotion_invalid");
  }

  const payableTotalCents = payableTotalFor({
    subtotalCents: record.subtotalCents,
    discountCents: record.discountCents,
    shippingCents: record.shippingCents,
    taxCents: record.taxCents,
  });
  if (!Number.isSafeInteger(payableTotalCents) || payableTotalCents <= 0) {
    return refused("payable_total_invalid");
  }
  // The components are individually bounded, but shipping and tax are additive, so the
  // ceiling is restated on the sum rather than assumed from the parts.
  if (payableTotalCents > EARLY_ACCESS_MAX_MONEY_CENTS) return refused("amount_overflow");

  return accepted(
    Object.freeze({
      currency,
      subtotalCents: record.subtotalCents,
      discountCents: record.discountCents,
      shippingCents: record.shippingCents,
      taxCents: record.taxCents,
      payableTotalCents: asPayableTotal(payableTotalCents),
      promotionId,
      promotionVersion,
    }),
  );
}

/**
 * Validate a money snapshot that arrived from storage or from another module.
 *
 * The stated payable total is checked against the components rather than recomputed and
 * silently substituted. A snapshot that disagrees with itself is refused, because
 * quietly correcting it would hide the fact that something wrote a wrong number.
 */
export function readOrderMoneySnapshot(value: unknown): OrderMoneySnapshot | null {
  const record = readPlainRecord(value, ORDER_MONEY_SNAPSHOT_KEYS);
  if (!record) return null;

  if (
    typeof record.currency !== "string" ||
    !(EARLY_ACCESS_CURRENCIES as readonly string[]).includes(record.currency)
  ) {
    return null;
  }
  if (!isMoneyComponent(record.subtotalCents)) return null;
  if (!isMoneyComponent(record.discountCents)) return null;
  if (!isMoneyComponent(record.shippingCents)) return null;
  if (!isMoneyComponent(record.taxCents)) return null;
  if (record.discountCents > record.subtotalCents) return null;

  const promotionId = record.promotionId === null ? null : (record.promotionId as string);
  const promotionVersion =
    record.promotionVersion === null ? null : (record.promotionVersion as string);
  if (record.promotionId !== null && typeof record.promotionId !== "string") return null;
  if (record.promotionVersion !== null && typeof record.promotionVersion !== "string") return null;
  if (promotionPairInvalid(promotionId, promotionVersion, record.discountCents)) return null;

  if (
    typeof record.payableTotalCents !== "number" ||
    !Number.isSafeInteger(record.payableTotalCents) ||
    record.payableTotalCents <= 0 ||
    record.payableTotalCents > EARLY_ACCESS_MAX_MONEY_CENTS
  ) {
    return null;
  }
  const expected = payableTotalFor({
    subtotalCents: record.subtotalCents,
    discountCents: record.discountCents,
    shippingCents: record.shippingCents,
    taxCents: record.taxCents,
  });
  if (record.payableTotalCents !== expected) return null;

  return Object.freeze({
    currency: record.currency as EarlyAccessCurrency,
    subtotalCents: record.subtotalCents,
    discountCents: record.discountCents,
    shippingCents: record.shippingCents,
    taxCents: record.taxCents,
    payableTotalCents: asPayableTotal(record.payableTotalCents),
    promotionId,
    promotionVersion,
  });
}

/**
 * Re-derive a payable total from components that are not a full order.
 *
 * A stored invoice states the same three amounts an order does, but it does not restate
 * the promotion, so it cannot go through `buildOrderMoneySnapshot`. This is the only
 * other way to obtain the brand, and it still checks the whole invariant, so a document
 * whose amounts do not add up produces null rather than a payable total.
 */
export function payableTotalFromComponents(components: {
  readonly subtotalCents: unknown;
  readonly discountCents: unknown;
  readonly shippingCents: unknown;
  readonly taxCents: unknown;
  readonly statedPayableTotalCents: unknown;
}): PayableTotalCents | null {
  if (!isMoneyComponent(components.subtotalCents)) return null;
  if (!isMoneyComponent(components.discountCents)) return null;
  if (!isMoneyComponent(components.shippingCents)) return null;
  if (!isMoneyComponent(components.taxCents)) return null;
  if (components.discountCents > components.subtotalCents) return null;

  const expected = payableTotalFor({
    subtotalCents: components.subtotalCents,
    discountCents: components.discountCents,
    shippingCents: components.shippingCents,
    taxCents: components.taxCents,
  });
  if (!Number.isSafeInteger(expected) || expected <= 0) return null;
  if (expected > EARLY_ACCESS_MAX_MONEY_CENTS) return null;
  if (components.statedPayableTotalCents !== expected) return null;
  return asPayableTotal(expected);
}

/**
 * The accessor every downstream site uses to name the final amount.
 *
 * It exists so a call site reads "the payable total of this order's money" rather than
 * reaching for whichever number is nearest, and so the branded type propagates.
 */
export function payableTotalOf(snapshot: OrderMoneySnapshot): PayableTotalCents {
  return snapshot.payableTotalCents;
}

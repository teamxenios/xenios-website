/**
 * Early Access manual-payment order creation. Server only, pure, side effect free.
 *
 * The one rule this module exists to enforce: money is computed here, never accepted
 * here. The caller supplies the server-resolved unit price and a quantity, and this
 * module derives the line total, the promotion, the discount, and the amount actually
 * payable from them. A request that carries its own total is refused outright rather
 * than ignored, so a tampered checkout body cannot quietly become an order that a human
 * later approves for the wrong amount.
 *
 * THE MONEY LIVES ON THE ORDER
 * ----------------------------
 * The discount used to be applied a level up, in the placement service, which left the
 * order stating only its pre-discount subtotal. Everything downstream reads the ORDER:
 * the invoice, the verification, the receipt, the commission. All of them therefore
 * read a number the customer never owed. The order now carries an `OrderMoneySnapshot`
 * whose `payableTotalCents` is the one amount owed, and a promotion snapshot recording
 * exactly which rule produced the discount, in which version, against which approved
 * price. Both are validated on every read, so a stored order that disagrees with itself
 * is refused rather than carried into a financial record.
 *
 * A created order is `awaiting_payment` and nothing else. No module in this folder
 * can move an order to `payment_verified` except an authorized manual verification.
 */

import {
  accepted,
  carriesAnyKey,
  isBoundedInteger,
  isCanonicalTimestamp,
  isOneOf,
  isPositiveCents,
  isSafeIdentifier,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";
import {
  EARLY_ACCESS_CURRENCIES,
  buildOrderMoneySnapshot,
  readOrderMoneySnapshot,
  type EarlyAccessCurrency,
  type OrderMoneySnapshot,
} from "./order-money";
import {
  EARLY_ACCESS_PROMOTIONS,
  EARLY_ACCESS_PROMOTION_RULES,
  EARLY_ACCESS_PROMOTION_SNAPSHOT_KEYS,
  earlyAccessPromotionDiscountCents,
  earlyAccessPromotionFor,
  type EarlyAccessPromotion,
  type EarlyAccessPromotionSnapshot,
} from "./promotion";

/**
 * The quantity band, re-exported from the one policy module so the single-order
 * lane and the cart lane cannot state different ceilings. See
 * `shared/research/early-access-quantity.ts`.
 */
export {
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
} from "@shared/research/early-access-quantity";
import {
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
} from "@shared/research/early-access-quantity";

/** Re-exported so existing importers keep one name for the currency vocabulary. */
export { EARLY_ACCESS_CURRENCIES, type EarlyAccessCurrency };

export const EARLY_ACCESS_MAX_UNIT_PRICE_CENTS = 500_000;
export const EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS =
  EARLY_ACCESS_MAX_UNIT_PRICE_CENTS * EARLY_ACCESS_MAX_QUANTITY;

/**
 * The full lifecycle an Early Access order can occupy. `payment_verified` is reachable
 * only through `payment-verification.ts`, and `payment_under_review` only through a
 * proof submission or that same verification lane.
 */
export const EARLY_ACCESS_ORDER_STATUSES = [
  "awaiting_payment",
  "payment_under_review",
  "payment_verified",
  "payment_rejected",
] as const;

export type EarlyAccessOrderStatus = (typeof EARLY_ACCESS_ORDER_STATUSES)[number];

/**
 * Keys that would let a caller state its own money. Present for any reason, the
 * request is refused with a dedicated code so the refusal is visible in a log rather
 * than blending into a generic validation failure.
 *
 * Shipping, tax, and discount are on the list even though this lane charges no shipping
 * and computes no tax: the point is that a caller may not state ANY component of the
 * amount owed, not that today's components happen to be zero.
 */
export const CLIENT_SUPPLIED_TOTAL_KEYS = [
  "amount",
  "amountCents",
  "amountDue",
  "amountDueCents",
  "discount",
  "discountCents",
  "grandTotal",
  "grandTotalCents",
  "lineTotal",
  "lineTotalCents",
  "orderTotal",
  "orderTotalCents",
  "payableTotal",
  "payableTotalCents",
  "price",
  "priceCents",
  "promotionId",
  "shipping",
  "shippingCents",
  "subtotal",
  "subtotalCents",
  "tax",
  "taxCents",
  "total",
  "totalCents",
] as const;

export type EarlyAccessOrderFailureCode =
  | "client_total_supplied"
  | "input_invalid"
  | "order_id_invalid"
  | "customer_invalid"
  | "product_invalid"
  | "quantity_out_of_range"
  | "price_invalid"
  | "price_version_invalid"
  | "currency_invalid"
  | "referral_invalid"
  | "promotion_unavailable"
  | "money_invalid"
  | "amount_overflow";

/** The price at the time of order, frozen with the line it priced. */
export type EarlyAccessOrderLine = Readonly<{
  productId: string;
  variantId: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  currency: EarlyAccessCurrency;
  pricedAt: string;
}>;

export type EarlyAccessOrder = Readonly<{
  orderId: string;
  customerRef: string;
  status: EarlyAccessOrderStatus;
  currency: EarlyAccessCurrency;
  line: EarlyAccessOrderLine;
  /**
   * @deprecated This is the PRE-DISCOUNT merchandise subtotal, not the amount owed.
   * It is kept because it is part of stored order rows and of the verified-order
   * projection, and renaming a persisted field is riskier than naming it precisely.
   * New code reads `money.subtotalCents` for the subtotal and `money.payableTotalCents`
   * for the amount a customer actually pays. Every site that needs the final amount
   * declares the branded `PayableTotalCents`, so this number cannot be substituted for
   * it without a compile error.
   */
  orderTotalCents: number;
  /**
   * The version of the approved price this order was built from. On the Early Access
   * lane that is the founder release's product fingerprint, so a historical order can
   * always state which approved price it was sold under even after the release ledger
   * is deleted.
   */
  unitPriceVersion: string;
  /** The single immutable statement of what this order costs. */
  money: OrderMoneySnapshot;
  /** Null exactly when no discount applied. */
  promotion: EarlyAccessPromotionSnapshot | null;
  referralCode: string | null;
  createdAt: string;
}>;

export type EarlyAccessOrderResult = CommerceResult<
  EarlyAccessOrder,
  EarlyAccessOrderFailureCode
>;

const CREATE_REQUIRED_KEYS = [
  "orderId",
  "customerRef",
  "productId",
  "variantId",
  "sku",
  "quantity",
  "unitPriceCents",
  "unitPriceVersion",
  "currency",
  "now",
] as const;

const CREATE_OPTIONAL_KEYS = ["referralCode"] as const;

const ORDER_KEYS = [
  "orderId",
  "customerRef",
  "status",
  "currency",
  "line",
  "orderTotalCents",
  "unitPriceVersion",
  "money",
  "promotion",
  "referralCode",
  "createdAt",
] as const;

const ORDER_LINE_KEYS = [
  "productId",
  "variantId",
  "sku",
  "quantity",
  "unitPriceCents",
  "lineTotalCents",
  "currency",
  "pricedAt",
] as const;

const REFERRAL_CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;

function isReferralCode(value: unknown): value is string {
  return typeof value === "string" && REFERRAL_CODE.test(value);
}

function isQuantity(value: unknown): value is number {
  return isBoundedInteger(value, EARLY_ACCESS_MIN_QUANTITY, EARLY_ACCESS_MAX_QUANTITY);
}

/**
 * Build the promotion snapshot for one resolved promotion.
 *
 * A zero discount promotion produces NO snapshot. Recording "the one unit rule applied
 * and took nothing off" would put a promotion id on an order that was never discounted,
 * and the money snapshot's own rule is that a promotion id means a price was changed.
 */
function promotionSnapshotFor(
  promotion: EarlyAccessPromotion,
  subtotalCents: number,
  discountCents: number,
  payableTotalCents: number,
): EarlyAccessPromotionSnapshot | null {
  if (discountCents === 0) return null;
  return Object.freeze({
    promotionId: promotion.promotionId,
    promotionVersion: promotion.promotionVersion,
    rule: promotion.rule,
    eligibleQuantity: promotion.eligibleQuantity,
    discountBasisPoints: promotion.discountBasisPoints,
    subtotalCents,
    discountCents,
    payableTotalCents,
  });
}

/**
 * Create one Early Access order from a fully resolved, server-supplied price.
 *
 * `orderId` and `now` are inputs so the result is deterministic: this module never
 * reads a clock and never generates an identifier. `promotions` is a second positional
 * parameter rather than a field of the request record, so it can never arrive from a
 * request body: only server code can choose which promotion table applies.
 */
export function createEarlyAccessOrder(
  input: unknown,
  promotions: readonly EarlyAccessPromotion[] = EARLY_ACCESS_PROMOTIONS,
): EarlyAccessOrderResult {
  if (carriesAnyKey(input, CLIENT_SUPPLIED_TOTAL_KEYS)) {
    return refused("client_total_supplied");
  }

  const record = readPlainRecord(input, CREATE_REQUIRED_KEYS, CREATE_OPTIONAL_KEYS);
  if (!record) return refused("input_invalid");

  if (!isSafeIdentifier(record.orderId)) return refused("order_id_invalid");
  if (!isSafeIdentifier(record.customerRef)) return refused("customer_invalid");
  if (
    !isSafeIdentifier(record.productId) ||
    !isSafeIdentifier(record.variantId) ||
    !isSafeIdentifier(record.sku)
  ) {
    return refused("product_invalid");
  }
  if (!isQuantity(record.quantity)) return refused("quantity_out_of_range");
  if (!isPositiveCents(record.unitPriceCents, EARLY_ACCESS_MAX_UNIT_PRICE_CENTS)) {
    return refused("price_invalid");
  }
  if (!isSafeIdentifier(record.unitPriceVersion)) return refused("price_version_invalid");
  if (!isOneOf(record.currency, EARLY_ACCESS_CURRENCIES)) return refused("currency_invalid");
  if (!isCanonicalTimestamp(record.now)) return refused("input_invalid");

  const referralCode =
    record.referralCode === undefined || record.referralCode === null
      ? null
      : record.referralCode;
  if (referralCode !== null && !isReferralCode(referralCode)) return refused("referral_invalid");

  const lineTotalCents = record.unitPriceCents * record.quantity;
  // The bounds above already keep this inside the maximum, but an explicit guard keeps
  // the public money bound true if those constants are ever widened.
  if (!isPositiveCents(lineTotalCents, EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS)) {
    return refused("amount_overflow");
  }

  // A quantity with no rule in the table is refused rather than sold at full price. A
  // withdrawn promotion should stop new sales at that quantity, not quietly charge a
  // customer more than the offer they came in on.
  const promotion = earlyAccessPromotionFor(record.quantity, promotions);
  if (!promotion) return refused("promotion_unavailable");

  const discountCents = earlyAccessPromotionDiscountCents(
    lineTotalCents,
    promotion.discountBasisPoints,
  );

  // Early Access charges no shipping and computes no tax. Both are stated as zero
  // rather than omitted, so the invariant already covers them on the day either
  // becomes a real number computed here.
  const money = buildOrderMoneySnapshot({
    currency: record.currency,
    subtotalCents: lineTotalCents,
    discountCents,
    shippingCents: 0,
    taxCents: 0,
    promotionId: discountCents === 0 ? null : promotion.promotionId,
    promotionVersion: discountCents === 0 ? null : promotion.promotionVersion,
  });
  if (!money.ok) {
    return refused(money.code === "amount_overflow" ? "amount_overflow" : "money_invalid");
  }

  const line: EarlyAccessOrderLine = Object.freeze({
    productId: record.productId,
    variantId: record.variantId,
    sku: record.sku,
    quantity: record.quantity,
    unitPriceCents: record.unitPriceCents,
    lineTotalCents,
    currency: record.currency,
    pricedAt: record.now,
  });

  return accepted(
    Object.freeze({
      orderId: record.orderId,
      customerRef: record.customerRef,
      status: "awaiting_payment" as const,
      currency: record.currency,
      line,
      orderTotalCents: lineTotalCents,
      unitPriceVersion: record.unitPriceVersion,
      money: money.value,
      promotion: promotionSnapshotFor(
        promotion,
        lineTotalCents,
        discountCents,
        money.value.payableTotalCents,
      ),
      referralCode,
      createdAt: record.now,
    }),
  );
}

/**
 * Validate a stored promotion snapshot against the money it claims to have produced.
 *
 * The discount is checked against the snapshot's OWN basis points, never against
 * today's promotion table. That is what makes a withdrawn or edited promotion unable to
 * rewrite history: yesterday's order still reads, still states its 20 percent, and
 * still names the exact rule version that authorized it.
 */
function readPromotionSnapshot(
  value: unknown,
  money: OrderMoneySnapshot,
  quantity: number,
): EarlyAccessPromotionSnapshot | null {
  const record = readPlainRecord(value, EARLY_ACCESS_PROMOTION_SNAPSHOT_KEYS);
  if (!record) return null;
  if (!isSafeIdentifier(record.promotionId)) return null;
  if (!isSafeIdentifier(record.promotionVersion)) return null;
  if (!isOneOf(record.rule, EARLY_ACCESS_PROMOTION_RULES)) return null;
  if (!isBoundedInteger(record.eligibleQuantity, EARLY_ACCESS_MIN_QUANTITY, EARLY_ACCESS_MAX_QUANTITY)) {
    return null;
  }
  // The rule that priced this order must be the rule for the quantity it sold.
  if (record.eligibleQuantity !== quantity) return null;
  if (!isBoundedInteger(record.discountBasisPoints, 1, 10_000)) return null;
  const subtotalCents = record.subtotalCents;
  const discountCents = record.discountCents;
  const payableTotalCents = record.payableTotalCents;
  if (!isBoundedInteger(subtotalCents, 0, EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS)) return null;
  if (!isBoundedInteger(discountCents, 0, EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS)) return null;
  if (!isBoundedInteger(payableTotalCents, 1, EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS)) return null;
  // The two statements of the same sale must agree, field for field.
  if (subtotalCents !== money.subtotalCents) return null;
  if (discountCents !== money.discountCents) return null;
  if (payableTotalCents !== money.payableTotalCents) return null;
  if (
    discountCents !== earlyAccessPromotionDiscountCents(subtotalCents, record.discountBasisPoints)
  ) {
    return null;
  }
  // The money snapshot and the promotion snapshot must name the same rule version.
  if (money.promotionId !== record.promotionId) return null;
  if (money.promotionVersion !== record.promotionVersion) return null;

  return Object.freeze({
    promotionId: record.promotionId,
    promotionVersion: record.promotionVersion,
    rule: record.rule,
    eligibleQuantity: record.eligibleQuantity,
    discountBasisPoints: record.discountBasisPoints,
    subtotalCents,
    discountCents,
    payableTotalCents,
  });
}

/**
 * Validate an order snapshot that arrived from storage or from another module.
 *
 * The subtotal is re-derived from the unit price and quantity at every hop, so a
 * snapshot whose stored total disagrees with its own line is refused rather than
 * carried forward into an invoice, a verification, or a commission. The payable total
 * is re-checked against its own components by `readOrderMoneySnapshot`, so an order
 * cannot claim a discount its components do not support.
 */
export function readEarlyAccessOrder(value: unknown): EarlyAccessOrder | null {
  const record = readPlainRecord(value, ORDER_KEYS);
  if (!record) return null;

  if (!isSafeIdentifier(record.orderId)) return null;
  if (!isSafeIdentifier(record.customerRef)) return null;
  if (!isOneOf(record.status, EARLY_ACCESS_ORDER_STATUSES)) return null;
  if (!isOneOf(record.currency, EARLY_ACCESS_CURRENCIES)) return null;
  if (!isSafeIdentifier(record.unitPriceVersion)) return null;
  if (!isCanonicalTimestamp(record.createdAt)) return null;

  const referralCode = record.referralCode;
  if (referralCode !== null && !isReferralCode(referralCode)) return null;

  const lineRecord = readPlainRecord(record.line, ORDER_LINE_KEYS);
  if (!lineRecord) return null;
  if (
    !isSafeIdentifier(lineRecord.productId) ||
    !isSafeIdentifier(lineRecord.variantId) ||
    !isSafeIdentifier(lineRecord.sku)
  ) {
    return null;
  }
  if (!isQuantity(lineRecord.quantity)) return null;
  if (!isPositiveCents(lineRecord.unitPriceCents, EARLY_ACCESS_MAX_UNIT_PRICE_CENTS)) return null;
  if (lineRecord.currency !== record.currency) return null;
  if (!isCanonicalTimestamp(lineRecord.pricedAt)) return null;

  const lineTotalCents = lineRecord.unitPriceCents * lineRecord.quantity;
  if (lineRecord.lineTotalCents !== lineTotalCents) return null;
  if (record.orderTotalCents !== lineTotalCents) return null;
  if (!isPositiveCents(lineTotalCents, EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS)) return null;

  const money = readOrderMoneySnapshot(record.money);
  if (!money) return null;
  if (money.currency !== record.currency) return null;
  // The subtotal on the money snapshot is the same merchandise the line describes.
  if (money.subtotalCents !== lineTotalCents) return null;

  let promotion: EarlyAccessPromotionSnapshot | null = null;
  if (record.promotion === null) {
    // No promotion snapshot means nothing was taken off, in either statement.
    if (money.discountCents !== 0 || money.promotionId !== null) return null;
  } else {
    promotion = readPromotionSnapshot(record.promotion, money, lineRecord.quantity);
    if (!promotion) return null;
  }

  const line: EarlyAccessOrderLine = Object.freeze({
    productId: lineRecord.productId,
    variantId: lineRecord.variantId,
    sku: lineRecord.sku,
    quantity: lineRecord.quantity,
    unitPriceCents: lineRecord.unitPriceCents,
    lineTotalCents,
    currency: record.currency,
    pricedAt: lineRecord.pricedAt,
  });

  return Object.freeze({
    orderId: record.orderId,
    customerRef: record.customerRef,
    status: record.status,
    currency: record.currency,
    line,
    orderTotalCents: lineTotalCents,
    unitPriceVersion: record.unitPriceVersion,
    money,
    promotion,
    referralCode: referralCode as string | null,
    createdAt: record.createdAt,
  });
}

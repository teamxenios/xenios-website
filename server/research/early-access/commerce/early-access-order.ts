/**
 * Early Access manual-payment order creation. Server only, pure, side effect free.
 *
 * The one rule this module exists to enforce: money is computed here, never accepted
 * here. The caller supplies the server-resolved unit price and a quantity, and this
 * module derives the line total and the order total from them. A request that carries
 * its own total is refused outright rather than ignored, so a tampered checkout body
 * cannot quietly become an order that a human later approves for the wrong amount.
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

export const EARLY_ACCESS_MIN_QUANTITY = 1;
export const EARLY_ACCESS_MAX_QUANTITY = 3;

/** Closed currency vocabulary. A currency outside this list is refused, not converted. */
export const EARLY_ACCESS_CURRENCIES = ["USD"] as const;
export type EarlyAccessCurrency = (typeof EARLY_ACCESS_CURRENCIES)[number];

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
 */
export const CLIENT_SUPPLIED_TOTAL_KEYS = [
  "amount",
  "amountCents",
  "amountDue",
  "amountDueCents",
  "grandTotal",
  "grandTotalCents",
  "lineTotal",
  "lineTotalCents",
  "orderTotal",
  "orderTotalCents",
  "price",
  "priceCents",
  "subtotal",
  "subtotalCents",
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
  | "currency_invalid"
  | "referral_invalid"
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
  orderTotalCents: number;
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
 * Create one Early Access order from a fully resolved, server-supplied price.
 *
 * `orderId` and `now` are inputs so the result is deterministic: this module never
 * reads a clock and never generates an identifier.
 */
export function createEarlyAccessOrder(input: unknown): EarlyAccessOrderResult {
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
      referralCode,
      createdAt: record.now,
    }),
  );
}

/**
 * Validate an order snapshot that arrived from storage or from another module.
 *
 * The totals are re-derived from the unit price and quantity at every hop, so a
 * snapshot whose stored total disagrees with its own line is refused rather than
 * carried forward into an invoice, a verification, or a commission.
 */
export function readEarlyAccessOrder(value: unknown): EarlyAccessOrder | null {
  const record = readPlainRecord(value, ORDER_KEYS);
  if (!record) return null;

  if (!isSafeIdentifier(record.orderId)) return null;
  if (!isSafeIdentifier(record.customerRef)) return null;
  if (!isOneOf(record.status, EARLY_ACCESS_ORDER_STATUSES)) return null;
  if (!isOneOf(record.currency, EARLY_ACCESS_CURRENCIES)) return null;
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
    referralCode: referralCode as string | null,
    createdAt: record.createdAt,
  });
}

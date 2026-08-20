// The conversion gate: the one place that decides whether an XRR request has
// earned a canonical order, and that builds the exact conversion input from
// evidence the request already carries.
//
// This module is PURE. It performs no I/O, holds no repository and mints no
// order. It takes the accepted quote, the payment record and the shipping
// snapshot, and it returns either a refusal naming what is missing, or the
// `CanonicalOrderConversionInput` the canonical order engine already knows how
// to consume idempotently. Keeping it pure is what makes the negative cases
// cheap to prove: every rule below is a function of its arguments.
//
// WHY A SEPARATE MODULE. The canonical order engine validates a conversion it
// is handed; it cannot know whether the quote behind it was the one accepted,
// whether the payment lineage matches, or whether the money is real. Those are
// facts of THIS lane. Putting them here means the order engine keeps one job
// (mint exactly one order, correctly) and the request lane keeps the other
// (decide when that is legitimate).
//
// FOUR RULES.
//
// 1. LINEAGE IS CHECKED, NOT ASSUMED. The payment must point at the same quote
//    id, the same quote VERSION and the same acceptance id the quote records.
//    A payment opened against version 3 cannot convert a request whose live
//    quote is now version 4 — that is a stale quote, and it refuses rather than
//    billing the customer for numbers they never saw.
//
// 2. PRICES COME FROM THE ACCEPTED QUOTE, NEVER FROM A FRESH CATALOG READ. The
//    sold price is whatever the customer accepted, frozen. A catalog change
//    between acceptance and conversion must not move the amount, so this module
//    never consults a price authority at all.
//
// 3. MONEY DECIDES PAYMENT STATE, NOT AN INPUT FIELD. There is no payment-state
//    parameter. A settled payment produces payment evidence and the order mints
//    `paid`; an unsettled one produces acceptance evidence only and the order
//    mints `awaiting_payment`. Both are legitimate orders — an unpaid order is
//    a real record — but only one is fulfillment-ready, and that is rule 4.
//
// 4. FULFILLMENT READS `isSettledPaymentState` AND NOTHING ELSE. An unpaid
//    request cannot become fulfillment-ready, and the predicate that decides it
//    is the shared one, so no surface re-derives "paid enough" for itself.

import {
  isSettledPaymentState,
  type AssistedOrderPaymentState,
} from "../../../../shared/research/assisted-order/payment-contract";
import { CANONICAL_ORDER_SOURCE_PREFIXES } from "../../../../shared/research/orders/canonical-order";
import type {
  CanonicalOrderActor,
  CanonicalOrderConversionInput,
  CanonicalOrderShippingSnapshot,
} from "../../orders/canonical-order";
import type { AssistedOrderPaymentRecord } from "../payment/ports";

// ---------------------------------------------------------------------------
// Refusals.
// ---------------------------------------------------------------------------

export const conversionRefusalCodes = [
  "QUOTE_NOT_ACCEPTED",
  "QUOTE_STALE",
  "LINEAGE_MISMATCH",
  "PAYMENT_MISSING",
  "PAYMENT_NOT_SETTLED",
  "SOURCE_REF_INVALID",
  "LINES_INVALID",
  "QUANTITY_EXCEEDED",
  "PRICE_MISSING",
  "TOTAL_MISMATCH",
  "SHIPPING_INVALID",
  "ACTOR_REQUIRED",
] as const;

export type ConversionRefusalCode = (typeof conversionRefusalCodes)[number];

export type ConversionRefusal = Readonly<{
  ok: false;
  code: ConversionRefusalCode;
  message: string;
}>;

export type ConversionAdjudication =
  | Readonly<{
      ok: true;
      input: CanonicalOrderConversionInput;
      /**
       * Whether the resulting order may be released to a supplier. Derived from
       * the payment state and nothing else.
       */
      fulfillmentReady: boolean;
    }>
  | ConversionRefusal;

function refuse(
  code: ConversionRefusalCode,
  message: string,
): ConversionRefusal {
  return Object.freeze({ ok: false as const, code, message });
}

// ---------------------------------------------------------------------------
// Inputs.
// ---------------------------------------------------------------------------

/** The accepted quote as this gate needs to see it. Read-only, from the quote lane. */
export type AcceptedQuoteSnapshot = Readonly<{
  quoteId: string;
  requestId: string;
  requestPublicReference: string;
  version: number;
  state: string;
  totalCents: number;
  currency: "USD";
  acceptanceId: string | null;
  acceptedAt: string | null;
  lines: readonly Readonly<{
    lineId: string;
    productId: string;
    variantId: string;
    productName: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>[];
}>;

export type ConversionAdjudicationInput = Readonly<{
  quote: AcceptedQuoteSnapshot;
  /** Null when no payment was ever opened. */
  payment: AssistedOrderPaymentRecord | null;
  customer: Readonly<{ customerRef: string; memberId?: string | null }>;
  organizationRef?: string | null;
  shipping: CanonicalOrderShippingSnapshot;
  shippingCents: number;
  /**
   * The affiliate code exactly as the affiliate lane normalized and stored it
   * on the request, or null. This gate never normalizes, never validates
   * against an owner directory and never lets the code influence price,
   * access, payment or ownership — it copies it onto the order so an authorized
   * admin can match it by hand, which is the whole of the launch requirement.
   */
  affiliateCode: string | null;
  convertedBy: CanonicalOrderActor;
  at: Date;
  /**
   * The maximum units of one exact variant. INJECTED rather than imported so
   * this lane follows the canonical quantity authority when it moves, instead
   * of pinning a second copy of the number.
   */
  maxQuantityPerVariant: number;
}>;

// ---------------------------------------------------------------------------
// The gate.
// ---------------------------------------------------------------------------

/**
 * The ONE predicate a fulfillment-readiness decision may consult for an
 * assisted request. A request with no payment is not ready; a request whose
 * payment is anything but settled is not ready.
 */
export function isRequestFulfillmentReady(
  payment: AssistedOrderPaymentRecord | null,
): boolean {
  return payment !== null && isSettledPaymentState(payment.state);
}

/** Same predicate, for a caller that only holds the state. */
export function isPaymentStateFulfillmentReady(
  state: AssistedOrderPaymentState | null,
): boolean {
  return state !== null && isSettledPaymentState(state);
}

/**
 * Decide whether this request converts, and build the exact input if it does.
 *
 * `requirePaid` is the caller's policy, not the gate's: an admin converting an
 * accepted-but-unpaid request into a real order is legitimate (the order exists
 * and shows `awaiting_payment`), while a fulfillment release is not. Both paths
 * run the same lineage and money checks.
 */
export function adjudicateAssistedRequestConversion(
  input: ConversionAdjudicationInput,
  options: Readonly<{ requirePaid: boolean }> = { requirePaid: false },
): ConversionAdjudication {
  const { quote, payment } = input;

  // --- Actor ---------------------------------------------------------------
  if (
    !input.convertedBy ||
    typeof input.convertedBy.actorId !== "string" ||
    input.convertedBy.actorId.trim() === ""
  ) {
    return refuse("ACTOR_REQUIRED", "A conversion must name who performed it.");
  }

  // --- The quote must actually have been accepted ---------------------------
  if (quote.state !== "accepted" || !quote.acceptanceId || !quote.acceptedAt) {
    return refuse(
      "QUOTE_NOT_ACCEPTED",
      "Only an accepted quote can become an order.",
    );
  }

  const prefix = CANONICAL_ORDER_SOURCE_PREFIXES.assisted_request_quote;
  if (!quote.requestPublicReference.startsWith(prefix)) {
    return refuse(
      "SOURCE_REF_INVALID",
      `An assisted request reference must start with ${prefix}.`,
    );
  }

  // --- Payment lineage ------------------------------------------------------
  if (payment) {
    if (payment.requestId !== quote.requestId) {
      return refuse(
        "LINEAGE_MISMATCH",
        "The payment belongs to a different request.",
      );
    }
    if (payment.quoteId !== quote.quoteId) {
      return refuse(
        "LINEAGE_MISMATCH",
        "The payment was opened against a different quote.",
      );
    }
    if (payment.acceptanceId !== quote.acceptanceId) {
      return refuse(
        "LINEAGE_MISMATCH",
        "The payment does not carry this quote's acceptance.",
      );
    }
    // The stale-quote rule. A re-issued quote bumps the version; a payment
    // still holding the old one is money owed against numbers the customer no
    // longer sees, so it re-quotes instead of converting.
    if (payment.quoteVersion !== quote.version) {
      return refuse(
        "QUOTE_STALE",
        `The payment covers quote version ${payment.quoteVersion}, but the accepted quote is version ${quote.version}. Re-quote before converting.`,
      );
    }
    if (payment.amountDueCents !== quote.totalCents) {
      return refuse(
        "TOTAL_MISMATCH",
        "The amount owed does not match the accepted quote total.",
      );
    }
  }

  const ready = isRequestFulfillmentReady(payment);
  if (options.requirePaid) {
    if (!payment) {
      return refuse(
        "PAYMENT_MISSING",
        "This request has no payment; it cannot be released for fulfillment.",
      );
    }
    if (!ready) {
      return refuse(
        "PAYMENT_NOT_SETTLED",
        `The payment is ${payment.state}; only a settled payment can be released for fulfillment.`,
      );
    }
  }

  // --- Lines. Prices come from the accepted quote, frozen. ------------------
  if (!Array.isArray(quote.lines) || quote.lines.length === 0) {
    return refuse("LINES_INVALID", "An order needs at least one line.");
  }
  if (
    !Number.isSafeInteger(input.maxQuantityPerVariant) ||
    input.maxQuantityPerVariant <= 0
  ) {
    return refuse(
      "QUANTITY_EXCEEDED",
      "The quantity authority did not supply a usable maximum.",
    );
  }

  const perVariant = new Map<string, number>();
  let subtotalCents = 0;
  const lines: {
    sku: string;
    displayName: string;
    quantity: number;
    unitPriceCents: number;
  }[] = [];
  for (const line of quote.lines) {
    if (
      typeof line.variantId !== "string" ||
      line.variantId.trim() === "" ||
      typeof line.productName !== "string" ||
      line.productName.trim() === ""
    ) {
      return refuse(
        "LINES_INVALID",
        "Every line needs a variant identity and a display name.",
      );
    }
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      return refuse(
        "LINES_INVALID",
        `Line ${line.lineId} has an invalid quantity.`,
      );
    }
    // A missing price is "on request" upstream and must never arrive here as a
    // zero. Refusing is the mechanism behind "never show $0".
    if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents <= 0) {
      return refuse(
        "PRICE_MISSING",
        `Line ${line.lineId} has no authorized price; it cannot be sold at zero.`,
      );
    }

    const running = (perVariant.get(line.variantId) ?? 0) + line.quantity;
    if (running > input.maxQuantityPerVariant) {
      return refuse(
        "QUANTITY_EXCEEDED",
        `Variant ${line.variantId} totals ${running} units, above the maximum of ${input.maxQuantityPerVariant}.`,
      );
    }
    perVariant.set(line.variantId, running);

    subtotalCents += line.unitPriceCents * line.quantity;
    lines.push({
      sku: line.variantId,
      displayName: line.productName,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    });
  }

  if (
    typeof input.shippingCents !== "number" ||
    !Number.isSafeInteger(input.shippingCents) ||
    input.shippingCents < 0
  ) {
    return refuse(
      "SHIPPING_INVALID",
      "Shipping must be a non-negative integer amount of cents.",
    );
  }

  // The quote total is the customer's agreed price for the goods. Recomputing
  // it from the frozen lines and comparing catches a quote whose stored total
  // and stored lines disagree — a corrupted record, not a sale.
  if (subtotalCents !== quote.totalCents) {
    return refuse(
      "TOTAL_MISMATCH",
      "The accepted quote's stored total does not match its own lines.",
    );
  }

  const built: CanonicalOrderConversionInput = {
    source: {
      kind: "assisted_request_quote",
      sourceRef: quote.requestPublicReference,
      requestRef: quote.requestPublicReference,
    },
    customer: {
      customerRef: input.customer.customerRef,
      memberId: input.customer.memberId ?? null,
    },
    organizationRef: input.organizationRef ?? null,
    attribution: input.affiliateCode
      ? { affiliateAttributionRef: input.affiliateCode }
      : null,
    shipping: input.shipping,
    lines,
    shippingCents: input.shippingCents,
    expectedTotalCents: subtotalCents + input.shippingCents,
    acceptance: {
      quoteRef: quote.quoteId,
      acceptanceId: quote.acceptanceId,
      acceptedAt: quote.acceptedAt,
    },
    // Payment evidence exists only when money is real. There is no branch here
    // that fabricates a verification id.
    payment:
      payment && payment.settlement
        ? {
            verificationId: payment.settlement.settlementId,
            verifiedBy: payment.settlement.verifiedByLabel,
            verifiedAt: payment.settlement.verifiedAt,
            externalTransactionId: payment.settlement.evidenceRef,
          }
        : null,
    placedAt: quote.acceptedAt,
    convertedBy: input.convertedBy,
    at: input.at,
  };

  return Object.freeze({
    ok: true as const,
    input: built,
    fulfillmentReady: ready,
  });
}

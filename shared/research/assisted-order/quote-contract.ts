// The assisted-order QUOTE contract — the missing conversion half the
// 2026-08-17 vision gap map named: "no quote entity/table, no admin
// 'issue quote' action, no customer quote acceptance step". A quote is a
// customer-specific priced answer to one XRR request. It is NOT an order, NOT
// a payment, and NOT a status transition by itself: acceptance mints an
// evidence id the EXISTING 15-state assisted-order machine consumes when an
// admin advances the request (agreements_pending / payment_pending), so the
// one status authority stays in charge.
//
// Money rules carried from the platform's settled lessons:
// - integer cents, USD only, positive only — a missing price is "on request",
//   never $0;
// - a priced line's amount comes from the authoritative resolved line the
//   request already stored, never from an admin keystroke;
// - a price-pending line may be priced by the admin ONLY with a recorded
//   internal pricing basis, which never reaches a customer payload;
// - acceptance echoes the exact quote version and total the customer saw, so
//   a stale acceptance refuses instead of silently binding new numbers.

export const assistedOrderQuoteStates = [
  "issued",
  "accepted",
  "declined",
  "expired",
  "superseded",
  "withdrawn",
] as const;

export type AssistedOrderQuoteState = (typeof assistedOrderQuoteStates)[number];

export function isAssistedOrderQuoteState(
  value: unknown,
): value is AssistedOrderQuoteState {
  return (
    typeof value === "string" &&
    (assistedOrderQuoteStates as readonly string[]).includes(value)
  );
}

/** One priced line of a quote, customer-safe. */
export type AssistedOrderQuoteLineView = Readonly<{
  lineId: string;
  productId: string;
  variantId: string;
  productName: string;
  specification: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  currency: "USD";
  /**
   * Where the unit price came from, stated truthfully to the customer:
   * "catalog" — the approved authoritative price the request already carried;
   * "quoted"  — priced for this quote by Xenios (a price-pending item).
   */
  priceSource: "catalog" | "quoted";
}>;

/** The customer-facing quote projection. Never cost, margin, or basis notes. */
export type AssistedOrderQuoteView = Readonly<{
  quoteId: string;
  requestPublicReference: string;
  version: number;
  state: AssistedOrderQuoteState;
  lines: readonly AssistedOrderQuoteLineView[];
  totalCents: number;
  currency: "USD";
  issuedAt: string;
  validUntil: string;
  /** Customer-safe terms note (payment path, lead time). Optional. */
  customerNote: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
}>;

/** What the customer must echo to accept: exact identity, no ambient state. */
export type AssistedOrderQuoteAcceptInput = Readonly<{
  quoteId: string;
  /** The exact version the customer is looking at. */
  version: number;
  /** The exact total the customer saw, for stale detection. */
  expectedTotalCents: number;
  acceptedAt?: string;
}>;

/** The acceptance receipt; acceptanceId is the evidence the admin uses when
 * advancing the request's existing status machine. */
export type AssistedOrderQuoteAcceptance = Readonly<{
  acceptanceId: string;
  quoteId: string;
  requestPublicReference: string;
  version: number;
  totalCents: number;
  acceptedAt: string;
  /** True when this call replayed an identical prior acceptance. */
  replayed: boolean;
}>;

export function quoteLineTotalCents(
  quantity: number,
  unitPriceCents: number,
): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive integer.");
  }
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents <= 0) {
    throw new Error("Unit price must be positive integer cents.");
  }
  const total = quantity * unitPriceCents;
  if (!Number.isSafeInteger(total)) {
    throw new Error("Line total exceeds the safe integer range.");
  }
  return total;
}

export function quoteTotalCents(
  lines: readonly Readonly<{ lineTotalCents: number }>[],
): number {
  let total = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.lineTotalCents) || line.lineTotalCents <= 0) {
      throw new Error("Every quote line total must be positive integer cents.");
    }
    total += line.lineTotalCents;
    if (!Number.isSafeInteger(total)) {
      throw new Error("Quote total exceeds the safe integer range.");
    }
  }
  return total;
}

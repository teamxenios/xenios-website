/**
 * Order price snapshot. Server only. Pure.
 *
 * Transforms an accepted CheckoutPriceQuote into OrderLinePriceSnapshot rows
 * and into the exact database column values the order-lines migration added:
 *
 *   price_id uuid, price_version integer > 0,
 *   audience in ('retail','member','professional','wholesale'),
 *   unit_amount_cents bigint > 0, currency in ('USD'),
 *   priced_at timestamptz,
 *
 * with an all-six-null-or-all-six-non-null coherence CHECK. This module only
 * ever produces the all-six-non-null shape. It refuses partial lineage: if
 * any line of a quote cannot be snapshotted, no line is, and the legacy -1
 * sentinel can never appear because every amount is validated positive.
 *
 * HISTORICAL IMMUTABILITY: an order line snapshot records what the member
 * agreed to at agreedAt. It is written once and never recomputed. Consumers
 * (receipts, refunds, disputes, exports, analytics) must read the stored
 * snapshot and must never re-derive an order's prices from the current
 * catalog or the current price rows; current prices answer "what would this
 * cost now", never "what was agreed". The emitted objects are frozen to make
 * accidental mutation loud.
 */

import {
  isValidCartPriceSnapshot,
  isValidOrderLinePriceSnapshot,
  normalizePriceCurrency,
  type CartPriceSnapshot,
  type CustomerPriceAudience,
  type OrderLinePriceSnapshot,
  type SupportedPriceCurrency,
} from "@shared/research/pricing";
import { parseProductControlTimestamp } from "../catalog/product-control-reader";
import {
  computeQuoteHash,
  type CheckoutPriceQuote,
} from "./checkout-recompute";

// ---------------------------------------------------------------------------
// Refusal taxonomy
// ---------------------------------------------------------------------------

export type OrderSnapshotRefusalReason =
  | "quote_malformed"
  | "quote_empty"
  | "quote_hash_mismatch"
  | "subtotal_mismatch"
  | "line_malformed"
  | "currency_mixed";

export type OrderSnapshotResult =
  | { state: "complete"; lines: readonly OrderLinePriceSnapshot[] }
  | { state: "refused"; reason: OrderSnapshotRefusalReason };

function refused(reason: OrderSnapshotRefusalReason): OrderSnapshotResult {
  return { state: "refused", reason };
}

// ---------------------------------------------------------------------------
// Quote verification
// ---------------------------------------------------------------------------

function isStructurallyQuote(value: unknown): value is CheckoutPriceQuote {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.lines) &&
    typeof candidate.subtotalCents === "number" &&
    Number.isSafeInteger(candidate.subtotalCents) &&
    candidate.subtotalCents > 0 &&
    typeof candidate.currency === "string" &&
    typeof candidate.quotedAt === "string" &&
    typeof candidate.quoteHash === "string" &&
    candidate.quoteHash.length > 0
  );
}

/**
 * Turn an accepted quote into order line snapshots, all or none.
 *
 * The quote is re-verified, not trusted: structure, per-line validity, a
 * uniform currency, the subtotal arithmetic, the quoting instant, and the
 * quote hash must all check out. A quote whose hash does not recompute is a
 * quote that was altered after it was issued, and it snapshots nothing.
 */
export function snapshotOrderLinesFromQuote(
  quote: CheckoutPriceQuote,
): OrderSnapshotResult {
  if (!isStructurallyQuote(quote)) return refused("quote_malformed");
  if (quote.lines.length === 0) return refused("quote_empty");

  const currency = normalizePriceCurrency(quote.currency);
  if (currency === null || currency !== quote.currency) {
    return refused("quote_malformed");
  }
  if (parseProductControlTimestamp(quote.quotedAt) === null) {
    return refused("quote_malformed");
  }

  // Every line must be a valid cart snapshot priced at the quoting instant
  // and in the quote's currency. One bad line refuses the whole quote.
  for (const line of quote.lines) {
    if (!isValidCartPriceSnapshot(line)) return refused("line_malformed");
    if (line.currency !== currency) return refused("currency_mixed");
    if (line.pricedAt !== quote.quotedAt) return refused("line_malformed");
  }

  let subtotalCents = 0;
  for (const line of quote.lines) {
    subtotalCents += line.lineTotalCents;
    if (!Number.isSafeInteger(subtotalCents)) return refused("subtotal_mismatch");
  }
  if (subtotalCents !== quote.subtotalCents) return refused("subtotal_mismatch");

  const expectedHash = computeQuoteHash(
    quote.lines,
    quote.subtotalCents,
    currency,
    quote.quotedAt,
  );
  if (expectedHash !== quote.quoteHash) return refused("quote_hash_mismatch");

  const lines: OrderLinePriceSnapshot[] = [];
  for (const line of quote.lines) {
    // Explicit field picks. agreedAt is stamped from the quote: the instant
    // the recompute priced the cart is the instant the member agreed to.
    const snapshot: OrderLinePriceSnapshot = Object.freeze({
      productId: line.productId,
      variantId: line.variantId,
      sku: line.sku,
      displayName: line.displayName,
      priceId: line.priceId,
      priceVersion: line.priceVersion,
      audience: line.audience,
      currency: line.currency,
      unitAmountCents: line.unitAmountCents,
      quantity: line.quantity,
      lineTotalCents: line.lineTotalCents,
      effectiveAt: line.effectiveAt,
      expiresAt: line.expiresAt,
      agreedAt: quote.quotedAt,
    });
    if (!isValidOrderLinePriceSnapshot(snapshot)) return refused("line_malformed");
    lines.push(snapshot);
  }
  return { state: "complete", lines: Object.freeze(lines) };
}

// ---------------------------------------------------------------------------
// Database column mapping
// ---------------------------------------------------------------------------

/**
 * The six nullable order-line columns, in their database names. This module
 * only ever emits the all-six-non-null shape, matching the migration's
 * coherence CHECK. There is no partial shape and no sentinel value.
 */
export interface OrderLinePriceColumns {
  price_id: string;
  price_version: number;
  audience: CustomerPriceAudience;
  unit_amount_cents: number;
  currency: SupportedPriceCurrency;
  priced_at: string;
}

export type OrderLineColumnMapping =
  | { state: "mapped"; columns: OrderLinePriceColumns }
  | { state: "refused"; reason: "line_malformed" | "price_id_not_uuid" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Map one order line snapshot to the database columns. The price_id column
 * is uuid typed, so a non-uuid price id refuses here rather than failing
 * inside the database. priced_at carries agreedAt: the migration's column
 * records when this exact price was agreed.
 */
export function toOrderLinePriceColumns(
  line: OrderLinePriceSnapshot,
): OrderLineColumnMapping {
  if (!isValidOrderLinePriceSnapshot(line)) {
    return { state: "refused", reason: "line_malformed" };
  }
  if (!UUID_PATTERN.test(line.priceId)) {
    return { state: "refused", reason: "price_id_not_uuid" };
  }
  return {
    state: "mapped",
    columns: Object.freeze({
      price_id: line.priceId,
      price_version: line.priceVersion,
      audience: line.audience,
      unit_amount_cents: line.unitAmountCents,
      currency: line.currency,
      // App-side agreedAt maps to the DB column priced_at (timestamptz).
      priced_at: line.agreedAt,
    }),
  };
}

export type OrderLineColumnRowsMapping =
  | { state: "mapped"; rows: readonly OrderLinePriceColumns[] }
  | {
      state: "refused";
      reason: "line_malformed" | "price_id_not_uuid";
      /** Which line refused, so the operator can name it. */
      index: number;
    };

/**
 * Map a whole order's snapshots, all or none. One refusing line means no
 * rows at all: the coherence CHECK in the database forbids partial lineage
 * per line, and this lane forbids it per order.
 */
export function toOrderLinePriceColumnRows(
  lines: readonly OrderLinePriceSnapshot[],
): OrderLineColumnRowsMapping {
  const rows: OrderLinePriceColumns[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const mapped = toOrderLinePriceColumns(lines[index]);
    if (mapped.state === "refused") {
      return { state: "refused", reason: mapped.reason, index };
    }
    rows.push(mapped.columns);
  }
  return { state: "mapped", rows: Object.freeze(rows) };
}

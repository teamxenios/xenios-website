/**
 * Checkout recompute. Server only. Pure: no payment calls, no side effects,
 * no clock reads. Time is always an explicit input.
 *
 * At checkout the server cart's lines (sku and quantity, nothing else) are
 * re-resolved against the price authority, every line total and the subtotal
 * are recomputed with integer arithmetic, and the client-presented numbers
 * are compared against the recomputation. The client's numbers are only ever
 * a claim to verify; they are never inputs to authority. Any mismatch is a
 * typed rejection, and rejections ACCUMULATE so an operator sees the complete
 * blocking set, not the first failure.
 *
 * A successful recompute emits an immutable CheckoutPriceQuote: the full per
 * line snapshots, the server subtotal, the quoting instant, and a
 * deterministic sha256 quoteHash over a stable serialization. The hash is
 * suitable for idempotency keys and payment-adapter metadata: the same cart
 * priced the same way at the same instant always hashes identically, and any
 * economic change flips it.
 */

import { createHash } from "node:crypto";
import {
  isValidCartPriceSnapshot,
  normalizePriceCurrency,
  type CartPriceSnapshot,
  type SupportedPriceCurrency,
} from "@shared/research/pricing";
import { parseProductControlTimestamp } from "../catalog/product-control-reader";
import {
  bindCartPrice,
  isRuntimeAuthorizedAudience,
  type CartBindingRejectionReason,
  type CartPriceBindingDeps,
} from "./cart-price-binding";
import type { ServerAuthorizedAudience } from "./authoritative-price-resolver";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** What the server cart stores per line. Nothing else exists to trust. */
export interface ServerCartLine {
  sku: string;
  quantity: number;
}

/**
 * What the client claims it showed the member. Compared, never believed.
 * The priceVersion is the version the client rendered from its last cart
 * read, so a price that moved between add-to-cart and checkout surfaces as a
 * typed stale_version rather than a silent recharge at the new number.
 */
export interface PresentedCartLine {
  sku: string;
  quantity: number;
  unitAmountCents: number;
  lineTotalCents: number;
  priceVersion: number;
}

export interface PresentedTotals {
  lines: readonly PresentedCartLine[];
  subtotalCents: number;
  currency: string;
}

export interface RecomputeCheckoutInput {
  serverLines: readonly ServerCartLine[];
  presented: PresentedTotals;
  authenticatedAudience: ServerAuthorizedAudience;
  currency: string;
  /** The quoting instant. Always explicit, never a clock read. */
  at: string;
}

// ---------------------------------------------------------------------------
// Rejection taxonomy
// ---------------------------------------------------------------------------

export type CheckoutRejectionReason =
  | "amount_mismatch"
  | "stale_version"
  | "line_missing_price"
  | "ambiguous"
  | "quantity_invalid"
  | "audience_unauthorized"
  | "invalid_instant"
  | "currency_unsupported"
  | "sku_unknown"
  | "duplicate_line"
  | "empty_cart"
  | "presented_line_missing"
  | "presented_line_unknown"
  | "line_total_overflow"
  | "subtotal_overflow";

export interface CheckoutRejection {
  /** Null for cart-level rejections (subtotal, empty cart, bad instant). */
  sku: string | null;
  reason: CheckoutRejectionReason;
  /** The underlying pricing-core reason when one exists, for the operator. */
  detail: string | null;
}

// ---------------------------------------------------------------------------
// The quote
// ---------------------------------------------------------------------------

export interface CheckoutPriceQuote {
  readonly lines: readonly CartPriceSnapshot[];
  readonly subtotalCents: number;
  readonly currency: SupportedPriceCurrency;
  readonly quotedAt: string;
  readonly quoteHash: string;
}

export type CheckoutRecomputeResult =
  | { state: "quoted"; quote: CheckoutPriceQuote }
  | { state: "rejected"; rejections: readonly CheckoutRejection[] };

const QUOTE_HASH_PREFIX = "xenios-checkout-quote-v1:";

/**
 * Stable serialization for hashing: explicit alphabetical key order, lines in
 * SKU order (the quote itself is emitted in SKU order, so serialization and
 * emission agree). JSON.stringify preserves insertion order for string keys,
 * so this is deterministic across processes and runs.
 */
function canonicalQuotePayload(
  lines: readonly CartPriceSnapshot[],
  subtotalCents: number,
  currency: SupportedPriceCurrency,
  quotedAt: string,
): string {
  return JSON.stringify({
    currency,
    lines: lines.map((line) => ({
      audience: line.audience,
      currency: line.currency,
      displayName: line.displayName,
      effectiveAt: line.effectiveAt,
      expiresAt: line.expiresAt,
      lineTotalCents: line.lineTotalCents,
      priceId: line.priceId,
      priceVersion: line.priceVersion,
      pricedAt: line.pricedAt,
      productId: line.productId,
      quantity: line.quantity,
      sku: line.sku,
      unitAmountCents: line.unitAmountCents,
      variantId: line.variantId,
    })),
    quotedAt,
    subtotalCents,
  });
}

/**
 * The deterministic quote hash: sha256 hex over the versioned canonical
 * payload. Exported so the order snapshot lane can re-verify a quote it is
 * handed instead of trusting it.
 */
export function computeQuoteHash(
  lines: readonly CartPriceSnapshot[],
  subtotalCents: number,
  currency: SupportedPriceCurrency,
  quotedAt: string,
): string {
  return createHash("sha256")
    .update(
      QUOTE_HASH_PREFIX +
        canonicalQuotePayload(lines, subtotalCents, currency, quotedAt),
    )
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Recompute
// ---------------------------------------------------------------------------

const BINDING_TO_CHECKOUT: Readonly<
  Record<CartBindingRejectionReason, CheckoutRejectionReason>
> = {
  price_missing: "line_missing_price",
  price_ambiguous: "ambiguous",
  price_inactive: "line_missing_price",
  price_unapproved: "line_missing_price",
  price_future: "line_missing_price",
  price_expired: "line_missing_price",
  wrong_audience: "line_missing_price",
  wrong_currency: "currency_unsupported",
  product_inactive: "line_missing_price",
  variant_inactive: "line_missing_price",
  variant_unapproved: "line_missing_price",
  member_ineligible: "line_missing_price",
  sku_unknown: "sku_unknown",
  audience_unauthorized: "audience_unauthorized",
  invalid_instant: "invalid_instant",
  quantity_invalid: "quantity_invalid",
  line_total_overflow: "line_total_overflow",
};

function rejection(
  sku: string | null,
  reason: CheckoutRejectionReason,
  detail: string | null = null,
): CheckoutRejection {
  return { sku, reason, detail };
}

/**
 * Re-resolve every server cart line fresh, recompute all money server-side,
 * and verify the client-presented numbers. Fail closed and accumulate.
 */
export async function recomputeCheckout(
  input: RecomputeCheckoutInput,
  deps: CartPriceBindingDeps,
): Promise<CheckoutRecomputeResult> {
  const rejections: CheckoutRejection[] = [];

  // Cart-level gates first. A bad instant or forged audience rejects the
  // whole recompute; per-line resolution never runs with either.
  const atMillis = parseProductControlTimestamp(input.at);
  if (atMillis === null) {
    return { state: "rejected", rejections: [rejection(null, "invalid_instant")] };
  }
  if (!isRuntimeAuthorizedAudience(input.authenticatedAudience, atMillis)) {
    return {
      state: "rejected",
      rejections: [rejection(null, "audience_unauthorized")],
    };
  }
  const currency = normalizePriceCurrency(input.currency);
  if (currency === null) {
    return {
      state: "rejected",
      rejections: [rejection(null, "currency_unsupported")],
    };
  }
  if (input.serverLines.length === 0) {
    return { state: "rejected", rejections: [rejection(null, "empty_cart")] };
  }

  // Duplicate SKUs make the presented-line comparison ambiguous, so the cart
  // must be normalized before checkout, not silently merged here.
  const seen = new Set<string>();
  for (const line of input.serverLines) {
    if (seen.has(line.sku)) {
      rejections.push(rejection(line.sku, "duplicate_line"));
    }
    seen.add(line.sku);
  }
  if (rejections.length > 0) return { state: "rejected", rejections };

  // The presented currency is a claim too.
  if (normalizePriceCurrency(input.presented.currency) !== currency) {
    rejections.push(rejection(null, "currency_unsupported", "presented_currency"));
  }

  // Re-resolve EVERY line fresh. The client's numbers are not consulted yet;
  // authority comes first.
  const snapshots: CartPriceSnapshot[] = [];
  const orderedLines = [...input.serverLines].sort((a, b) =>
    a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0,
  );
  for (const line of orderedLines) {
    const bound = await bindCartPrice(
      {
        sku: line.sku,
        quantity: line.quantity,
        authenticatedAudience: input.authenticatedAudience,
        currency: input.currency,
        at: input.at,
      },
      deps,
    );
    if (bound.state === "rejected") {
      const mapped = BINDING_TO_CHECKOUT[bound.reason];
      rejections.push(
        rejection(
          mapped === "invalid_instant" || mapped === "audience_unauthorized"
            ? null
            : line.sku,
          mapped,
          mapped === bound.reason ? null : bound.reason,
        ),
      );
      continue;
    }
    snapshots.push(bound.snapshot);
  }

  // Compare the client's claims line by line against the fresh truth.
  const presentedBySku = new Map<string, PresentedCartLine>();
  for (const presented of input.presented.lines) {
    if (presentedBySku.has(presented.sku)) {
      rejections.push(rejection(presented.sku, "duplicate_line", "presented"));
      continue;
    }
    presentedBySku.set(presented.sku, presented);
  }
  for (const presented of input.presented.lines) {
    if (!seen.has(presented.sku)) {
      rejections.push(rejection(presented.sku, "presented_line_unknown"));
    }
  }
  for (const snapshot of snapshots) {
    const presented = presentedBySku.get(snapshot.sku);
    if (presented === undefined) {
      rejections.push(rejection(snapshot.sku, "presented_line_missing"));
      continue;
    }
    if (presented.priceVersion !== snapshot.priceVersion) {
      rejections.push(
        rejection(
          snapshot.sku,
          "stale_version",
          `current_version:${snapshot.priceVersion}`,
        ),
      );
    }
    if (
      presented.quantity !== snapshot.quantity ||
      presented.unitAmountCents !== snapshot.unitAmountCents ||
      presented.lineTotalCents !== snapshot.lineTotalCents
    ) {
      rejections.push(rejection(snapshot.sku, "amount_mismatch"));
    }
  }

  // Server-side subtotal, integer only, overflow checked.
  let subtotalCents = 0;
  let overflowed = false;
  for (const snapshot of snapshots) {
    subtotalCents += snapshot.lineTotalCents;
    if (!Number.isSafeInteger(subtotalCents)) {
      overflowed = true;
      break;
    }
  }
  if (overflowed) {
    rejections.push(rejection(null, "subtotal_overflow"));
  } else if (
    snapshots.length === input.serverLines.length &&
    input.presented.subtotalCents !== subtotalCents
  ) {
    // Only compare the subtotal when every line resolved; otherwise the
    // server subtotal is not the full cart and the comparison would mislead.
    rejections.push(rejection(null, "amount_mismatch", "subtotal"));
  }

  if (rejections.length > 0) return { state: "rejected", rejections };

  // Belt and braces: every emitted snapshot must satisfy the shared guard.
  for (const snapshot of snapshots) {
    const snapshotSku = snapshot.sku;
    if (!isValidCartPriceSnapshot(snapshot)) {
      return {
        state: "rejected",
        rejections: [rejection(snapshotSku, "line_missing_price", "invalid_snapshot")],
      };
    }
  }

  const lines = Object.freeze(snapshots.map((snapshot) => Object.freeze({ ...snapshot })));
  const quote: CheckoutPriceQuote = Object.freeze({
    lines,
    subtotalCents,
    currency,
    quotedAt: input.at,
    quoteHash: computeQuoteHash(lines, subtotalCents, currency, input.at),
  });
  return { state: "quoted", quote };
}

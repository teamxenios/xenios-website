/**
 * THE MONEY PRICE AUTHORITY SEAM. Server only.
 *
 * xenios research runs two price runtimes today, and only one of them is an
 * authority:
 *
 *   1. Product Control (server/research/products-diagnostics/product-control-price-resolver.ts,
 *      reached through server/research/pricing/authoritative-price-resolver.ts and
 *      server/research/pricing/cart-price-binding.ts) decides the read-only pricing
 *      API and the cart SELECTION lane. It knows about approval, audience,
 *      currency, effectivity windows, ambiguity, and contested strengths.
 *   2. The transacting runtime (server/research/commerce/cart.ts) reads
 *      CatalogProduct.facts.priceCents, a supplier-fact projection that knows
 *      none of those things, and that number is what a member is CHARGED.
 *
 * The consequence, driven rather than argued by PR #222's composition suite:
 * a SKU the Product Control authority answers `sku_unknown` for settled a
 * captured order. The variant_strength_disputed guard therefore governs what a
 * member is SHOWN, never what they are CHARGED.
 *
 * This module is the ONE resolution seam both runtimes go through. It answers
 * exactly one question:
 *
 *     what does this exact SKU cost this audience in this currency right now?
 *
 * It writes no resolver of its own. Every decision is delegated to
 * `resolveSkuPrice`, which is the existing Product Control chain, so every
 * failure state that lane already decides survives intact: price_missing,
 * price_ambiguous, price_inactive, price_not_effective (surfaced as
 * price_future), price_expired, wrong_audience, wrong_currency, and
 * variant_strength_disputed (which the Product Control resolver projects onto
 * variant_unapproved and carries with its dispute record).
 *
 * Two rules are structural here, not conventional:
 *
 *   - FAIL CLOSED. Anything other than one exact, positive, in-window,
 *     approved row for this exact identity is a refusal, and a refusal never
 *     produces a number. There is no fallback to the legacy fact, no default,
 *     no sentinel.
 *   - NEVER ZERO. `isChargeableAmountCents` is the last gate before any amount
 *     leaves this module, and `assertNoZeroOrNegativeCharge` is exported so the
 *     cart and the checkout can assert the same invariant on the legacy path
 *     too. A price that is not positive is indistinguishable from a price that
 *     is missing, which is the honest state and the one that blocks purchase.
 *
 * Nothing here reads a clock or performs IO of its own: the instant is always
 * an explicit input and every reader is injected, so callers and tests are
 * deterministic.
 */

import type { CommerceDenialCode } from "@shared/research/commerce-api";
import {
  computeLineTotalCents,
  isCustomerSafeAmountCents,
  isSafeQuantity,
} from "@shared/research/pricing";
import {
  authorizeAudienceFromServerIdentity,
  type ServerAuthorizedAudience,
} from "../pricing/authoritative-price-resolver";
import {
  resolveSkuPrice,
  type PriceLineageReaders,
  type SkuResolveFailureReason,
} from "../pricing/cart-price-binding";

// ---------------------------------------------------------------------------
// The flag
// ---------------------------------------------------------------------------

/**
 * The environment variable that moves MONEY onto the Product Control
 * authority. It follows the repo's existing flag convention exactly (see
 * NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED in server/research/index.ts and
 * RESEARCH_QUANTUM_COMMERCE_ENABLED in production-deps.ts): a named env var
 * compared against the literal string "true", read through one exported
 * predicate so there is a single reference rather than a re-derivation.
 */
export const PRICE_AUTHORITY_FLAG = "RESEARCH_PRICE_AUTHORITY_ENABLED" as const;

/**
 * True only for the exact string "true". Every other value, including "1",
 * "TRUE", "yes", and undefined, reads as OFF, so an operator cannot half-flip
 * this by accident. OFF is the default and OFF must be identical to today.
 */
export function priceAuthorityEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[PRICE_AUTHORITY_FLAG] === "true";
}

// ---------------------------------------------------------------------------
// The zero floor
// ---------------------------------------------------------------------------

/**
 * The one predicate every money path in the commerce runtime asks before it
 * shows or charges an amount. A chargeable amount is a positive safe integer
 * number of cents. Zero is not a price, and neither is a negative number.
 */
export function isChargeableAmountCents(value: unknown): value is number {
  return isCustomerSafeAmountCents(value);
}

/**
 * The assertion form, for the paths that hold a nullable amount. `null` is the
 * honest "no price" state and passes; any non-positive or non-integer number
 * is a defect and is reported rather than displayed.
 *
 * This is deliberately enforced under BOTH flag states. It is the single
 * behavior that is not gated, because a $0 or negative charge is never the
 * intended behavior of either runtime, and a guard that only runs when a flag
 * is on is not a floor.
 */
export function assertNoZeroOrNegativeCharge(
  amountCents: number | null,
): boolean {
  return amountCents === null || isChargeableAmountCents(amountCents);
}

// ---------------------------------------------------------------------------
// The seam contract
// ---------------------------------------------------------------------------

/** What the caller knows: a SKU and how many of it. Nothing about money. */
export interface MoneyPriceRequest {
  sku: string;
  quantity: number;
}

/**
 * The lineage the authority proved, carried alongside the amount so a caller
 * can persist exactly which row it charged against. Field picks only; no
 * supplier cost, wholesale source, margin, approver, or approval note ever
 * crosses this boundary.
 */
export interface AuthoritativePriceLineage {
  productId: string;
  variantId: string;
  priceId: string;
  priceVersion: number;
  audience: string;
  currency: string;
  effectiveAt: string;
  expiresAt: string | null;
  pricedAt: string;
}

export type AuthoritativeLinePrice =
  | {
      state: "priced";
      unitPriceCents: number;
      lineTotalCents: number;
      lineage: AuthoritativePriceLineage;
    }
  | { state: "refused"; reason: MoneyPriceRefusalReason };

/**
 * The refusal taxonomy. It is the Product Control lane's own failure set,
 * unchanged, plus the two the quantity policy contributes. Widening this union
 * cannot turn a refusal into a price: every arm is a refusal.
 */
export type MoneyPriceRefusalReason =
  | SkuResolveFailureReason
  | "quantity_invalid"
  | "line_total_overflow";

/** Keyed by SKU. A SKU absent from the map was never asked about. */
export type AuthoritativePriceMap = ReadonlyMap<string, AuthoritativeLinePrice>;

/**
 * The seam. One implementation in production (Product Control), one in tests.
 * Deliberately batch shaped: the cart prices a whole cart at one instant, so
 * every line in one read is evaluated against the same moment.
 */
export interface MoneyPriceAuthority {
  priceLines(
    requests: readonly MoneyPriceRequest[],
    asOf: Date,
  ): Promise<AuthoritativePriceMap>;
}

// ---------------------------------------------------------------------------
// Refusal to member-facing denial
// ---------------------------------------------------------------------------

/**
 * How each authority refusal reaches a member. The mapping is exhaustive over
 * the closed union, so a new refusal reason will not compile until someone
 * decides what a member is told, and every arm is a BLOCKING code: no refusal
 * can map to a state where the line is purchasable.
 *
 * `unconfirmed_supplier_facts` is the code the cart already uses for a line it
 * cannot price, so a member sees the same honest state whichever runtime
 * refused. The operator-precise reason is not collapsed: it travels on the
 * refusal object for logging and admin surfaces.
 */
const REFUSAL_TO_DENIAL: Readonly<
  Record<MoneyPriceRefusalReason, CommerceDenialCode>
> = {
  // The authority does not know this SKU at all. This is the exact state that
  // settled a captured order before this seam existed.
  sku_unknown: "product_not_found",
  audience_unauthorized: "product_not_purchasable",
  invalid_instant: "unconfirmed_supplier_facts",
  price_missing: "unconfirmed_supplier_facts",
  price_ambiguous: "unconfirmed_supplier_facts",
  price_inactive: "unconfirmed_supplier_facts",
  price_unapproved: "unconfirmed_supplier_facts",
  price_future: "unconfirmed_supplier_facts",
  price_expired: "unconfirmed_supplier_facts",
  wrong_audience: "product_not_purchasable",
  wrong_currency: "product_not_purchasable",
  product_inactive: "product_not_purchasable",
  // A contested presentation and an unapproved variant both arrive here: the
  // Product Control resolver projects variant_strength_disputed onto
  // variant_unapproved and carries the dispute record with it.
  variant_unapproved: "product_not_purchasable",
  variant_inactive: "product_not_purchasable",
  member_ineligible: "product_not_purchasable",
  quantity_invalid: "quantity_invalid",
  line_total_overflow: "quantity_invalid",
};

export function denialForRefusal(
  reason: MoneyPriceRefusalReason,
): CommerceDenialCode {
  return REFUSAL_TO_DENIAL[reason] ?? "unconfirmed_supplier_facts";
}

// ---------------------------------------------------------------------------
// The Product Control implementation
// ---------------------------------------------------------------------------

/**
 * How the server derives the buying audience. The browser never chooses it.
 * `sourceVersion` names the server-side rule that granted it, so an audience
 * decision is attributable.
 */
export interface MoneyAudienceGrant {
  audience: "retail" | "member" | "professional" | "wholesale";
  sourceVersion: string;
}

export interface ProductControlMoneyAuthorityDeps extends PriceLineageReaders {
  /** Resolved from the authenticated server-side identity, never a request. */
  audience: MoneyAudienceGrant;
  /** USD only today; normalized and allowlisted downstream. */
  currency: string;
  /** Mirrors MAX_LINE_QUANTITY in cart.ts. Injectable for tests. */
  maxQuantity?: number;
}

export const DEFAULT_MONEY_MAX_QUANTITY = 1000;

function refused(reason: MoneyPriceRefusalReason): AuthoritativeLinePrice {
  return { state: "refused", reason };
}

/**
 * Product Control as the money authority.
 *
 * Every line goes through `resolveSkuPrice`, the same function the cart
 * selection lane and the subscription price validation already use. This
 * module adds no pricing logic: it adds the quantity policy, the batch shape,
 * and the final non-negotiable positivity check.
 */
export function createProductControlMoneyAuthority(
  deps: ProductControlMoneyAuthorityDeps,
): MoneyPriceAuthority {
  const maxQuantity = deps.maxQuantity ?? DEFAULT_MONEY_MAX_QUANTITY;

  async function priceOne(
    request: MoneyPriceRequest,
    at: string,
  ): Promise<AuthoritativeLinePrice> {
    if (!isSafeQuantity(request.quantity) || request.quantity > maxQuantity) {
      return refused("quantity_invalid");
    }

    // The audience is branded at THIS instant, so a grant cannot price a later
    // moment than the one it was evaluated for.
    const authorized: ServerAuthorizedAudience | null =
      authorizeAudienceFromServerIdentity({
        audience: deps.audience.audience,
        sourceVersion: deps.audience.sourceVersion,
        evaluatedAt: at,
      });
    if (authorized === null) return refused("audience_unauthorized");

    const outcome = await resolveSkuPrice(
      {
        sku: request.sku,
        authenticatedAudience: authorized,
        currency: deps.currency,
        at,
      },
      { variants: deps.variants, priceResolver: deps.priceResolver },
    );
    if (outcome.state === "failed") return refused(outcome.reason);

    // Defense in depth. The authority already refuses a non-positive row; this
    // makes it structural at the seam, so no future reordering upstream can put
    // a zero on a customer surface or into a charge.
    if (!isChargeableAmountCents(outcome.price.amountCents)) {
      return refused("price_missing");
    }

    let lineTotalCents: number;
    try {
      lineTotalCents = computeLineTotalCents(
        outcome.price.amountCents,
        request.quantity,
      );
    } catch {
      return refused("line_total_overflow");
    }
    if (!isChargeableAmountCents(lineTotalCents)) {
      return refused("line_total_overflow");
    }

    return {
      state: "priced",
      unitPriceCents: outcome.price.amountCents,
      lineTotalCents,
      lineage: {
        productId: outcome.variant.productId,
        variantId: outcome.variant.variantId,
        priceId: outcome.price.priceId,
        priceVersion: outcome.price.version,
        audience: outcome.price.audience,
        currency: outcome.price.currency,
        effectiveAt: outcome.price.effectiveAt,
        expiresAt: outcome.price.expiresAt,
        pricedAt: at,
      },
    };
  }

  return {
    async priceLines(requests, asOf) {
      const at = asOf.toISOString();
      const resolved = new Map<string, AuthoritativeLinePrice>();
      // One instant for the whole cart. Distinct SKUs only: a repeated SKU is
      // the same identity and must not be resolved twice at two different
      // quantities, so the caller's own line is the unit of resolution.
      for (const request of requests) {
        if (resolved.has(request.sku)) continue;
        resolved.set(request.sku, await priceOne(request, at));
      }
      return resolved;
    },
  };
}

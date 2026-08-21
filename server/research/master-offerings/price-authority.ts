/**
 * The buyer price seam for the full master offerings catalog. Server only.
 *
 * There is exactly one way a price reaches this catalog:
 *
 *   planning variant -> read-only exact binding -> Product Control product and
 *   variant -> the existing authoritative price resolver -> one approved,
 *   active, in-window price row.
 *
 * Every other outcome is `on_request`. No binding, no price. No approval, no
 * price. Resolver ambiguity, no price. A thrown error, no price. That is what
 * "do not invent prices" means structurally rather than as a promise: this
 * module has no amount of its own and no fallback branch that can produce one.
 *
 * Showing a price is not authorizing a purchase. `Add to Cart` still requires
 * an exact CartProductSelection resolved in `action.ts`; a price view alone
 * never produces one.
 */

import type { PriceResolution } from "@shared/research/pricing";
import {
  formatPriceCents,
  MASTER_OFFERING_PRICE_ON_REQUEST,
  type MasterOfferingPriceView,
} from "@shared/research/master-offerings/pricing-contract";
import type {
  AuthoritativePriceResolver,
  ServerAuthorizedAudience,
} from "../pricing/authoritative-price-resolver";
import type { MasterOfferingCommerceBindingReader } from "./product-control-adapter";
import type {
  NormalizedMasterOffering,
  NormalizedMasterOfferingVariant,
} from "./model";

/** The narrow read this seam needs from the approved price authority. */
export interface MasterOfferingApprovedPriceReader {
  readApprovedPrice(input: {
    productId: string;
    variantId: string;
  }): Promise<PriceResolution> | PriceResolution;
}

export interface MasterOfferingPriceAuthority {
  priceFor(
    offering: NormalizedMasterOffering,
    variant: NormalizedMasterOfferingVariant,
  ): Promise<MasterOfferingPriceView>;
}

/** The fail-closed default. Used whenever no price authority is composed in. */
export const noMasterOfferingPrices: MasterOfferingPriceAuthority = {
  async priceFor() {
    return MASTER_OFFERING_PRICE_ON_REQUEST;
  },
};

/**
 * Server-derived pricing context. The browser never chooses any of it: the
 * audience is the branded fact that only server identity can construct, and the
 * instant is taken from that same fact so a stale authorization cannot price a
 * later moment.
 */
export interface MasterOfferingPricingContext {
  authenticatedAudience: ServerAuthorizedAudience;
  currency: string;
}

/**
 * Adapt the existing authoritative resolver into this seam. It reconstructs no
 * price fact of its own; it forwards identity and returns the verdict.
 */
export function createAuthoritativeApprovedPriceReader(
  resolver: Pick<AuthoritativePriceResolver, "resolveApprovedResearchPrice">,
  context: () =>
    | Promise<MasterOfferingPricingContext | null>
    | MasterOfferingPricingContext
    | null,
): MasterOfferingApprovedPriceReader {
  return {
    async readApprovedPrice(input) {
      const resolved = await context();
      if (
        resolved === null ||
        typeof resolved.currency !== "string" ||
        resolved.currency.trim() === ""
      ) {
        return { state: "unavailable", reason: "price_missing" };
      }
      return resolver.resolveApprovedResearchPrice({
        productId: input.productId,
        variantId: input.variantId,
        authenticatedAudience: resolved.authenticatedAudience,
        currency: resolved.currency,
        // Pinned to the authorization instant on purpose. The resolver requires
        // these to be the same moment, so deriving it here removes the class of
        // bug where a caller prices "now" with an older authorization.
        at: resolved.authenticatedAudience.evaluatedAt,
      });
    },
  };
}

function toPriceView(resolution: PriceResolution): MasterOfferingPriceView {
  if (resolution.state !== "available") return MASTER_OFFERING_PRICE_ON_REQUEST;
  const price = resolution.price;
  const display = formatPriceCents(price.amountCents, price.currency);
  // Defense in depth. A non-positive or unformattable amount is indistinguish-
  // able from no price at all, never a zero and never a bare currency symbol.
  if (display === null) return MASTER_OFFERING_PRICE_ON_REQUEST;
  return {
    state: "priced",
    amountCents: price.amountCents,
    currency: price.currency,
    display,
    basis: "exact_listed_unit",
    priceId: price.priceId,
    priceVersion: price.version,
    effectiveAt: price.effectiveAt,
    expiresAt: price.expiresAt,
  };
}

/**
 * Why a price could not be shown even though the product may well have one.
 *
 * These are the cases where "Price on request" is not a business fact about the
 * product but the shape of our own failure. A genuinely unpriced variant is NOT
 * one of them and raises nothing, so this signal stays quiet until something is
 * actually wrong.
 */
export type MasterOfferingPricingIncidentReason =
  /** Two concurrently-active in-window rows. The product HAS an approved price;
   *  we cannot tell which one, so nothing may be displayed. */
  | "price_ambiguous"
  /** The binding or price read threw. A transient upstream fault, not a
   *  decision about the product. */
  | "reader_threw"
  /** The resolver answered about a different identity than the one asked for. */
  | "identity_mismatch";

export interface MasterOfferingPricingIncident {
  reason: MasterOfferingPricingIncidentReason;
  offeringId: string;
  offeringVariantId: string;
}

export interface MasterOfferingPriceAuthorityDependencies {
  bindings: MasterOfferingCommerceBindingReader;
  prices: MasterOfferingApprovedPriceReader;
  /**
   * Called when a price could not be determined for a reason that is not the
   * product simply having no price.
   *
   * This exists because the failure it reports is otherwise completely silent.
   * The 426-row retail reconciliation states the consequence exactly: an
   * ambiguous price "silently disappears from every customer surface", the
   * product "becomes indistinguishable from one that was never priced", and
   * there is "no error, no log line a customer or an operator would see". The
   * same is true of a transient reader fault, which can turn every price on a
   * catalogue page into Price on request while the catalogue looks perfectly
   * healthy.
   *
   * Optional, and its own failure is swallowed: observing a problem must never
   * become a second problem.
   */
  onPricingIncident?: (incident: MasterOfferingPricingIncident) => void;
}

/**
 * Build a request-scoped price authority.
 *
 * The per-variant memo matters: one catalog page asks for up to a hundred
 * variants and the underlying reader re-reads Product Control per call. Scope
 * one instance to one request so a page is consistent with itself and a later
 * page re-reads fresh.
 */
export function createMasterOfferingPriceAuthority(
  dependencies: MasterOfferingPriceAuthorityDependencies,
): MasterOfferingPriceAuthority {
  const cache = new Map<string, Promise<MasterOfferingPriceView>>();

  const report = (
    reason: MasterOfferingPricingIncidentReason,
    offering: NormalizedMasterOffering,
    variant: NormalizedMasterOfferingVariant,
  ): void => {
    if (dependencies.onPricingIncident === undefined) return;
    try {
      dependencies.onPricingIncident({
        reason,
        offeringId: offering.id,
        offeringVariantId: variant.id,
      });
    } catch {
      // An observer that throws must not take the catalogue down with it.
    }
  };

  const resolve = async (
    offering: NormalizedMasterOffering,
    variant: NormalizedMasterOfferingVariant,
  ): Promise<MasterOfferingPriceView> => {
    if (offering.visibility !== "member" || variant.visibility !== "member") {
      return MASTER_OFFERING_PRICE_ON_REQUEST;
    }
    try {
      const binding = await dependencies.bindings.readBinding({
        offeringId: offering.id,
        offeringVariantId: variant.id,
      });
      if (
        binding === null ||
        binding.offeringVariantId !== variant.id ||
        !binding.productId.trim() ||
        !binding.variantId.trim()
      ) {
        return MASTER_OFFERING_PRICE_ON_REQUEST;
      }
      const resolution = await dependencies.prices.readApprovedPrice({
        productId: binding.productId,
        variantId: binding.variantId,
      });
      // Ambiguity is the documented silent failure: the product has an
      // approved price and we cannot say which, so it renders exactly like a
      // product that was never priced.
      if (resolution.state === "ambiguous") report("price_ambiguous", offering, variant);
      const view = toPriceView(resolution);
      // The price must belong to the exact variant that was asked for. A
      // resolver that answered about a different identity is not an answer.
      if (
        view.state === "priced" &&
        resolution.state === "available" &&
        (resolution.price.productId !== binding.productId ||
          resolution.price.variantId !== binding.variantId)
      ) {
        report("identity_mismatch", offering, variant);
        return MASTER_OFFERING_PRICE_ON_REQUEST;
      }
      return view;
    } catch {
      // Still fail closed — no price is invented — but no longer in silence.
      // One blip here reads to a customer as "this product is quote-only", a
      // claim about the product that we did not mean to make.
      report("reader_threw", offering, variant);
      return MASTER_OFFERING_PRICE_ON_REQUEST;
    }
  };

  return {
    priceFor(offering, variant) {
      const key = `${offering.id}|${variant.id}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const pending = resolve(offering, variant);
      cache.set(key, pending);
      return pending;
    },
  };
}

/** Resolve every variant of one offering, in order, with the memo applied. */
export async function priceOfferingVariants(
  authority: MasterOfferingPriceAuthority,
  offering: NormalizedMasterOffering,
): Promise<ReadonlyMap<string, MasterOfferingPriceView>> {
  const entries = await Promise.all(
    offering.variants.map(
      async (variant) =>
        [variant.id, await authority.priceFor(offering, variant)] as const,
    ),
  );
  return new Map(entries);
}

import type {
  CartProductSelectionRequest,
  CartProductSelectionSource,
} from "@shared/research/cart-product-selection";
import {
  selectCartProduct,
  type AuthoritativeCartProductSelectionResult,
} from "../commerce/cart-product-selection";
import type { ProductControlSelectionAuthority } from "./product-control-adapter";
import {
  resolveCurrentProductVariantActivationAuthority,
  unavailableProductVariantActivationLedger,
  type ProductVariantActivationLedgerRepository,
} from "../product-activation/authority-repository";

/**
 * The founder gate for direct commerce on the v2 member catalog.
 *
 * The catalog shipped with its purchase seam hard-wired to a truthful refusal:
 * every selection answers `product_commerce_unapproved`, so a price view can
 * never become a cart line. This module is the one place that seam is allowed
 * to open, and it opens only when the composition root passes an environment
 * where `RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE` is exactly the string
 * "true". Anything else, including "TRUE", "1", and unset, keeps the refusal.
 *
 * Nothing here creates purchase authority. The real authority remains the
 * existing `selectCartProduct` evaluation over Product Control facts; this
 * module only decides whether that authority is asked at all.
 */

export const RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE_ENV_VAR =
  "RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE";

export interface DirectCommerceEnv {
  [key: string]: string | undefined;
}

export function masterOfferingsDirectCommerceEnabled(
  env: DirectCommerceEnv,
): boolean {
  return env[RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE_ENV_VAR] === "true";
}

/**
 * The refusal the production composition root has hard-wired since the catalog
 * mounted. Exported so the flag-gated replacement provably answers the same
 * shape when the flag is off, not a near-copy that drifts.
 */
export const MASTER_OFFERINGS_COMMERCE_REFUSAL: AuthoritativeCartProductSelectionResult = {
  ok: false,
  code: "product_commerce_unapproved",
};

export const refusedMasterOfferingSelections: ProductControlSelectionAuthority =
  {
    select: () => MASTER_OFFERINGS_COMMERCE_REFUSAL,
  };

/**
 * Reads every Product Control fact one selection evaluation needs, for one
 * exact request. Returning null means "the facts could not be assembled", and
 * the authority below turns that into a refusal rather than a guess. A reader
 * must never fabricate a fact it did not read.
 */
export interface CartSelectionFactsReader {
  readSelectionSource(
    request: CartProductSelectionRequest,
  ):
    | Promise<CartProductSelectionSource | null>
    | CartProductSelectionSource
    | null;
}

/**
 * The real selection authority: the existing `selectCartProduct` evaluation
 * over facts a reader assembled. Fail closed on every seam: a missing source,
 * a thrown read, or a rejected promise each answers the frozen refusal,
 * because on a purchase path "we could not check" must never be
 * distinguishable from "no" in the buyer's favor.
 */
export function createProductControlSelectionAuthority(
  facts: CartSelectionFactsReader,
  activationRepository: ProductVariantActivationLedgerRepository =
    unavailableProductVariantActivationLedger,
): ProductControlSelectionAuthority {
  return {
    async select(request, session) {
      try {
        const source = await facts.readSelectionSource(request);
        if (source === null) return MASTER_OFFERINGS_COMMERCE_REFUSAL;
        // The reader owns the Product Control facts; the session owns the
        // viewer's authorization. When the reader left the audience seat empty
        // and the composition supplied the session fact, it is seated here and
        // then VALIDATED by the evaluation like every other fact (identity
        // match, instant match, non-blank provenance). No session fact means
        // the evaluation refuses with audience_eligibility_missing.
        const evaluated =
          source.audienceEligibility === null && session !== undefined
            ? { ...source, audienceEligibility: session.audienceEligibility }
            : source;
        const variant = evaluated.variants.find(
          (candidate) =>
            candidate.id === request.variantId &&
            candidate.productId === request.productId,
        );
        if (variant === undefined || !variant.sku.trim()) {
          return MASTER_OFFERINGS_COMMERCE_REFUSAL;
        }
        const activation = await resolveCurrentProductVariantActivationAuthority(
          activationRepository,
          {
            productId: request.productId,
            variantId: request.variantId,
            sku: variant.sku,
            evaluatedAt: new Date(request.evaluatedAt).toISOString(),
          },
        );
        return selectCartProduct(request, evaluated, activation);
      } catch {
        return MASTER_OFFERINGS_COMMERCE_REFUSAL;
      }
    },
  };
}

/**
 * The one switch. Off answers the identical hard-wired refusal the catalog has
 * always answered; on delegates to the real authority and adds nothing to it.
 * The decision is taken once, at composition time, from the environment the
 * process started with: a purchase surface must not change its authority
 * mid-flight because a variable was edited under it.
 */
export function masterOfferingSelectionAuthorityFromEnv(
  env: DirectCommerceEnv,
  real: ProductControlSelectionAuthority,
): ProductControlSelectionAuthority {
  return masterOfferingsDirectCommerceEnabled(env)
    ? real
    : refusedMasterOfferingSelections;
}

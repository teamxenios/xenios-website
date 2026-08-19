// The production cart-selection authority for surfaces OUTSIDE the member
// catalog page — first consumer: the master-offerings v2 seam in
// server/index.ts, whose selection source has been a hard-wired
// product_commerce_unapproved refusal since the catalog mounted (the general
// units carried no commerce approval). This module exists so that flipping
// direct commerce on for a founder-approved set is a WIRING decision at the
// composition root, never a copied second selection engine: every verdict
// still comes from the ONE selectCartProduct over the same Product Control
// reader, required-inputs repository, and lot-allocatability read the member
// catalog trusts.
//
// The authorized audience fact is an INPUT. It must be derived upstream from
// the authenticated session (the same server-derived grant the price
// authority uses); this module never invents one, and a missing or
// mismatched fact fails closed through selectCartProduct's own codes.

import type {
  CartAudienceEligibility,
  CartProductSelectionRequest,
  CartProductSelectionResult,
} from "@shared/research/cart-product-selection";
import type { AdminProductDetail, AdminProductVariant } from "@shared/research/product-admin";
import type { DomainReadiness, RequiredInput } from "@shared/research/required-inputs";
import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";
import { selectCartProduct } from "../commerce/cart-product-selection";
import {
  inventoryFactsForVariant,
  type VariantInventoryFacts,
} from "./member-catalog-service";
import { createProductionProductControlReader } from "./product-control-reader";
import { buildRequiredInputProductionRepository } from "../required-inputs";

/** The server-derived authorization for one audience at one instant. */
export type AuthorizedCartAudienceFact = Readonly<{
  audience: CartProductSelectionRequest["audience"];
  sourceVersion: string;
  evaluatedAt: string;
}>;

export type CartSelectionAuthority = Readonly<{
  select(
    request: CartProductSelectionRequest,
    authorized: AuthorizedCartAudienceFact,
  ): Promise<CartProductSelectionResult>;
}>;

export type CartSelectionAuthorityDependencies = Readonly<{
  configured(): boolean;
  readCatalog(): Promise<readonly AdminProductDetail[]>;
  listRequiredInputs(): Promise<readonly RequiredInput[]>;
  readinessAll(): Promise<readonly DomainReadiness[]>;
  variantInventoryFacts(
    productId: string,
    variant: AdminProductVariant,
    evaluatedAt: string,
  ): Promise<VariantInventoryFacts>;
}>;

function refused(
  code: CartProductSelectionResult & { ok: false } extends { code: infer C }
    ? C
    : never,
): CartProductSelectionResult {
  return { ok: false, code } as CartProductSelectionResult;
}

export function createCartSelectionAuthority(
  deps: CartSelectionAuthorityDependencies,
): CartSelectionAuthority {
  return Object.freeze({
    async select(request, authorized) {
      // No database means no canonical readiness facts; the refusal names
      // that rather than pretending the product is merely unapproved.
      if (!deps.configured()) return refused("readiness_incomplete");

      // One instant for authorization and selection, exactly like the member
      // catalog: a fact evaluated at a different instant is not this
      // request's fact.
      if (
        authorized.audience !== request.audience ||
        authorized.evaluatedAt !== request.evaluatedAt ||
        !authorized.sourceVersion.trim()
      ) {
        return refused("audience_unauthorized");
      }
      const audienceEligibility: CartAudienceEligibility = {
        audience: authorized.audience,
        state: "authorized",
        sourceVersion: authorized.sourceVersion,
        evaluatedAt: authorized.evaluatedAt,
      };

      const catalog = await deps.readCatalog();
      const product = catalog.find((entry) => entry.id === request.productId) ?? null;
      const variant =
        product?.variants.find((entry) => entry.id === request.variantId) ?? null;

      // Facts only resolvable with a concrete variant; without one,
      // selectCartProduct answers product_missing/variant_missing itself
      // from an empty source.
      let inventory: VariantInventoryFacts | null = null;
      if (product && variant) {
        inventory = await deps.variantInventoryFacts(
          product.id,
          variant,
          request.evaluatedAt,
        );
        // Lot/CoA parity with the member catalog: an unverified lot never
        // reaches a purchase selection, whatever the other facts say.
        if (!["verified", "not_applicable"].includes(inventory.lotCoa.state)) {
          return refused("inventory_unavailable");
        }
      }

      const [requiredInputs, readiness] = await Promise.all([
        deps.listRequiredInputs(),
        deps.readinessAll(),
      ]);

      return selectCartProduct(request, {
        products: product ? [product] : [],
        variants: product?.variants ?? [],
        prices: product?.prices ?? [],
        media: product?.media ?? [],
        requiredInputs: [...requiredInputs],
        readiness: [...readiness],
        audienceEligibility,
        inventoryEligibility: inventory?.inventory ?? null,
      });
    },
  });
}

/** Production wiring over the same readers the member catalog trusts. */
export function buildProductionCartSelectionAuthority(): CartSelectionAuthority {
  const products = createProductionProductControlReader();
  const requiredInputs = buildRequiredInputProductionRepository();
  return createCartSelectionAuthority({
    configured: supabaseConfigured,
    readCatalog: () => products.readCatalog(),
    listRequiredInputs: () => requiredInputs.list() as Promise<readonly RequiredInput[]>,
    readinessAll: () => requiredInputs.readinessAll() as Promise<readonly DomainReadiness[]>,
    variantInventoryFacts: (productId, variant, evaluatedAt) =>
      inventoryFactsForVariant(getSupabaseAdmin(), productId, variant, evaluatedAt),
  });
}

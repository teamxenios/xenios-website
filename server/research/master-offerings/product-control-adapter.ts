import type {
  CartAudienceEligibility,
  CartProductSelectionRequest,
  CartProductSelectionResult,
} from "@shared/research/cart-product-selection";
import type {
  AsyncMasterOfferingCommerceResolver,
  MasterOfferingCommerceIdentityBinding,
} from "./model";

/**
 * Read-only exact-variant join. Implementations may read only reviewed binding
 * state; this interface has deliberately no create, update, or delete method.
 */
export interface MasterOfferingCommerceBindingReader {
  readBinding(input: {
    offeringId: string;
    offeringVariantId: string;
  }):
    | Promise<MasterOfferingCommerceIdentityBinding | null>
    | MasterOfferingCommerceIdentityBinding
    | null;
}
/**
 * The session facts a selection evaluation cannot read for itself. The
 * eligibility inside is the server-resolved authorization of the requesting
 * viewer; an authority that receives it must still validate it (identity,
 * instant, non-blank provenance) exactly as it validates every other fact.
 */
export interface ProductControlSelectionSessionContext {
  audienceEligibility: CartAudienceEligibility;
}

/** Existing Product Control remains responsible for producing the selection. */
export interface ProductControlSelectionAuthority {
  select(
    request: CartProductSelectionRequest,
    /**
     * Optional on purpose: the hard-wired refusal and every existing test
     * double stay valid without it, and an authority that needs the session
     * facts fails closed when they are absent rather than inventing them.
     */
    session?: ProductControlSelectionSessionContext,
  ): Promise<CartProductSelectionResult> | CartProductSelectionResult;
}

export interface MasterOfferingProductControlContext {
  audience: CartProductSelectionRequest["audience"];
  currency: string;
  evaluatedAt: string;
  /**
   * The provenance fingerprint of the server-side authorization decision that
   * produced `audience`, when the composition has one. With it the adapter can
   * hand the selection authority a complete audience-eligibility fact; without
   * it the authority receives none and fails closed on that seam.
   */
  audienceSourceVersion?: string;
}

export interface MasterOfferingProductControlAdapterDependencies {
  bindings: MasterOfferingCommerceBindingReader;
  selections: ProductControlSelectionAuthority;
  context():
    | Promise<MasterOfferingProductControlContext | null>
    | MasterOfferingProductControlContext
    | null;
}

function validContext(
  value: MasterOfferingProductControlContext | null,
): value is MasterOfferingProductControlContext {
  return (
    value !== null &&
    typeof value.currency === "string" &&
    value.currency.trim() !== "" &&
    value.currency === value.currency.toUpperCase() &&
    typeof value.evaluatedAt === "string" &&
    Number.isFinite(Date.parse(value.evaluatedAt))
  );
}

/**
 * Bridges a visible planning variant to the existing Product Control selector.
 * It never reconstructs price, readiness, inventory, media, audience, or
 * quantity facts and it never writes a binding. Any missing or failed authority
 * resolves to the normal non-commerce catalog action.
 */
export function createMasterOfferingProductControlResolver(
  dependencies: MasterOfferingProductControlAdapterDependencies,
): AsyncMasterOfferingCommerceResolver {
  return async (offering, variant) => {
    if (offering.visibility !== "member" || variant.visibility !== "member") {
      return { binding: null, selection: null };
    }

    try {
      const binding = await dependencies.bindings.readBinding({
        offeringId: offering.id,
        offeringVariantId: variant.id,
      });
      if (binding === null || binding.offeringVariantId !== variant.id) {
        return { binding: null, selection: null };
      }

      const context = await dependencies.context();
      if (!validContext(context)) return { binding, selection: null };

      const request: CartProductSelectionRequest = {
        productId: binding.productId,
        variantId: binding.variantId,
        audience: context.audience,
        currency: context.currency,
        evaluatedAt: context.evaluatedAt,
      };
      // The session facts travel only when the composition resolved a real
      // authorization fingerprint. The same evaluation instant is used for the
      // request and the eligibility, so a selection can never be authorized at
      // one moment and priced at another.
      const sourceVersion = context.audienceSourceVersion;
      const result =
        typeof sourceVersion === "string" && sourceVersion.trim() !== ""
          ? await dependencies.selections.select(request, {
              audienceEligibility: {
                audience: context.audience,
                state: "authorized",
                sourceVersion,
                evaluatedAt: context.evaluatedAt,
              },
            })
          : await dependencies.selections.select(request);
      return {
        binding,
        selection: result.ok ? result.selection : null,
      };
    } catch {
      return { binding: null, selection: null };
    }
  };
}

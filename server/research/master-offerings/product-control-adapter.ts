import type {
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
/** Existing Product Control remains responsible for producing the selection. */
export interface ProductControlSelectionAuthority {
  select(
    request: CartProductSelectionRequest,
  ): Promise<CartProductSelectionResult> | CartProductSelectionResult;
}

export interface MasterOfferingProductControlContext {
  audience: CartProductSelectionRequest["audience"];
  currency: string;
  evaluatedAt: string;
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

      const result = await dependencies.selections.select({
        productId: binding.productId,
        variantId: binding.variantId,
        audience: context.audience,
        currency: context.currency,
        evaluatedAt: context.evaluatedAt,
      });
      return {
        binding,
        selection: result.ok ? result.selection : null,
      };
    } catch {
      return { binding: null, selection: null };
    }
  };
}

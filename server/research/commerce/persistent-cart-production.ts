import { getSupabaseAdmin } from "../../supabase";
import type { MemberCatalogService } from "../catalog/member-catalog-service";
import type { MemberRow } from "../member-auth";
import { createPersistentCartRepository } from "./persistence/persistent-cart";
import type { CartSelectionResolver } from "./persistent-cart-routes";

export function buildPersistentCartRepository() {
  return createPersistentCartRepository({
    rpc: async (name, params) => {
      const result = await getSupabaseAdmin().rpc(name, params);
      return {
        data: result.data,
        error: result.error ? { message: result.error.message } : null,
      };
    },
  });
}

export function buildMemberCartSelectionResolver(
  catalog: MemberCatalogService,
): CartSelectionResolver {
  return {
    async resolveMemberSelection(input: {
      member: MemberRow;
      productId?: string;
      slug?: string;
      variantId: string;
    }) {
      let slug = input.slug;
      if (!slug && input.productId) {
        const listing = await catalog.list({ member: input.member });
        slug = listing.items.find((item) => item.id === input.productId)?.slug;
      }
      if (!slug) return null;
      const detail = await catalog.detail({ member: input.member, slug });
      if (
        !detail ||
        (input.productId !== undefined && detail.id !== input.productId) ||
        detail.slug !== slug
      ) {
        return null;
      }
      return (
        detail.variants.find((variant) => variant.id === input.variantId)
          ?.selection ?? null
      );
    },

    // The supplied V3 catalog has no anonymously authorized sellable offer.
    // Keep anonymous persistence wired but fail selection closed until Product
    // Control publishes an explicit public-audience selection contract.
    async resolveAnonymousSelection() {
      return null;
    },
  };
}

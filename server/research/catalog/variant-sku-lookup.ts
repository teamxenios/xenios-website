/**
 * SKU to Product Control variant identity. Server only.
 *
 * The pricing lane has always declared a `VariantLookupBySku` port
 * (server/research/pricing/cart-price-binding.ts) and never had an
 * implementation, which is one half of why the transacting runtime could not
 * reach the price authority. This is that implementation, over the same
 * drift-checked `ProductCatalogReader` the read-only pricing API already uses,
 * so both lanes see one catalog.
 *
 * It resolves nothing on its own beyond identity. It reads no price, exposes
 * no admin field, and answers null for anything that is not exactly one
 * published, public, active product carrying exactly one variant with that SKU.
 *
 * Determinism and fail-closed rules:
 *   - SKU comparison is exact after trimming. It is NOT case folded, because
 *     research_product_variants.sku is UNIQUE on the stored value and folding
 *     here would invent a collision the database does not have.
 *   - A SKU that appears on more than one variant, or on variants under more
 *     than one product, is ambiguous and answers null. A caller that cannot
 *     tell which unit it is pricing must not price one.
 *   - A blank SKU, a blank product id, a blank variant id, or a blank display
 *     name answers null: a snapshot needs all four to be provable later.
 *
 * Nothing here caches. The reader in front of it is the drift-checking one, so
 * caching a resolved identity would defeat the double-read it performs.
 */

import type {
  AdminProductDetail,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { VariantIdentity, VariantLookupBySku } from "../pricing/cart-price-binding";
import type { ProductCatalogReader } from "./product-control-reader";

function usable(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The display name a snapshot records: the product name, qualified by the
 * variant's label when it carries one, so "Product One 10 mg" rather than a
 * bare "10 mg" or a SKU standing in for a name. Answers null when the product
 * has no usable name at all, which fails the whole lookup closed.
 */
function displayNameFor(
  product: AdminProductDetail,
  variant: AdminProductVariant,
): string | null {
  if (!usable(product.displayName)) return null;
  const base = product.displayName.trim();
  if (!usable(variant.label)) return base;
  const label = variant.label.trim();
  return base.includes(label) ? base : `${base} ${label}`;
}

export class CatalogVariantLookupBySku implements VariantLookupBySku {
  constructor(private readonly reader: ProductCatalogReader) {}

  async findVariantBySku(sku: string): Promise<VariantIdentity | null> {
    const wanted = typeof sku === "string" ? sku.trim() : "";
    if (wanted.length === 0) return null;

    const catalog = await this.reader.readCatalog();
    const matches: VariantIdentity[] = [];

    for (const product of catalog) {
      for (const variant of product.variants) {
        if (variant.sku.trim() !== wanted) continue;
        // Identity coherence: a variant that claims a different parent than the
        // product it was read under is a data fault, not a match.
        if (variant.productId !== product.id) return null;
        const displayName = displayNameFor(product, variant);
        if (
          !usable(product.id) ||
          !usable(variant.id) ||
          displayName === null
        ) {
          return null;
        }
        matches.push({
          productId: product.id,
          variantId: variant.id,
          sku: wanted,
          displayName,
        });
      }
    }

    // Exactly one, or nothing. Ambiguity is a refusal, never a first-wins pick.
    return matches.length === 1 ? matches[0] : null;
  }
}

export function createCatalogVariantLookupBySku(
  reader: ProductCatalogReader,
): CatalogVariantLookupBySku {
  return new CatalogVariantLookupBySku(reader);
}

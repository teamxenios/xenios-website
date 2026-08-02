import type {
  OfficialSourceAdapter,
  OfficialSourceProduct,
  SourceLookupResult,
  SupplementManifestRow,
} from "./contracts";
import {
  assertOfficialUrl,
  fetchOfficialText,
  mediaFormatFromUrl,
  sha256Text,
  type FetchLike,
} from "./http";

interface ShopifyVariant {
  id?: string | number;
  title?: string;
  sku?: string;
  featured_image?: { src?: string; width?: number; height?: number } | null;
}

interface ShopifyProduct {
  id?: string | number;
  title?: string;
  handle?: string;
  vendor?: string;
  featured_image?: string;
  images?: string[];
  variants?: ShopifyVariant[];
}

function shopifyJsonUrl(value: string): string {
  const url = new URL(value);
  const match = url.pathname.match(/^(.*\/products\/[^/]+?)(?:\.js)?\/?$/);
  if (!match) throw new Error("Official URL is not a Shopify product path");
  url.pathname = `${match[1]}.js`;
  url.search = "";
  return url.toString();
}

function countLike(value: string | null): string | null {
  if (!value) return null;
  return value.match(/\b\d+(?:\.\d+)?\s*(?:servings?|capsules?|tablets?|softgels?|packets?|count|ct|g|kg|mg|oz|lb)\b/i)?.[0] ?? null;
}

export class ShopifyOfficialProductAdapter implements OfficialSourceAdapter {
  readonly id = "official-shopify-product-json-v1";

  constructor(
    private readonly fetcher: FetchLike = globalThis.fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  supports(row: SupplementManifestRow): boolean {
    if (!row.officialProductUrl) return false;
    try {
      assertOfficialUrl(row.brand, row.officialProductUrl);
      shopifyJsonUrl(row.officialProductUrl);
      return true;
    } catch {
      return false;
    }
  }

  async lookup(row: SupplementManifestRow): Promise<SourceLookupResult> {
    if (!row.officialProductUrl) {
      return { sourceUrl: "", candidates: [], warnings: ["No official product URL"] };
    }
    const sourceUrl = assertOfficialUrl(row.brand, row.officialProductUrl).toString();
    const fetched = await fetchOfficialText({
      brand: row.brand,
      url: shopifyJsonUrl(sourceUrl),
      fetcher: this.fetcher,
      accept: "application/json",
    });
    const product = JSON.parse(fetched.body) as ShopifyProduct;
    const retrievedAt = this.now().toISOString();
    const sourceHash = sha256Text(fetched.body);
    const variants = product.variants?.length ? product.variants : [{}];
    const candidates = variants.map((variant): OfficialSourceProduct => {
      const rawImageUrl = variant.featured_image?.src ?? product.featured_image ?? product.images?.[0] ?? null;
      const imageUrl = rawImageUrl ? new URL(rawImageUrl, sourceUrl).toString() : null;
      const variantName = variant.title?.trim() && variant.title !== "Default Title"
        ? variant.title.trim()
        : null;
      return {
        officialProductUrl: sourceUrl,
        officialImageUrl: imageUrl,
        brand: product.vendor?.trim() || row.brand,
        officialProductId: product.id == null ? null : String(product.id),
        officialVariantId: variant.id == null ? null : String(variant.id),
        officialSku: variant.sku?.trim() || null,
        upc: null,
        productName: product.title?.trim() || row.productName,
        variantName,
        packageCount: countLike(`${product.title ?? ""} ${variantName ?? ""}`),
        form: null,
        flavor: variantName,
        sizeOrWeight: countLike(variantName),
        width: variant.featured_image?.width ?? null,
        height: variant.featured_image?.height ?? null,
        format: mediaFormatFromUrl(imageUrl),
        altText: [product.vendor, product.title, variantName].filter(Boolean).join(" "),
        retrievedAt,
        sourceAdapter: this.id,
        sourceHash,
      };
    });
    return { sourceUrl, candidates, warnings: [] };
  }
}

export class CompositeOfficialSourceAdapter implements OfficialSourceAdapter {
  readonly id = "official-source-composite-v1";

  constructor(private readonly adapters: readonly OfficialSourceAdapter[]) {}

  supports(row: SupplementManifestRow): boolean {
    return this.adapters.some((adapter) => adapter.supports(row));
  }

  async lookup(row: SupplementManifestRow): Promise<SourceLookupResult> {
    const warnings: string[] = [];
    for (const adapter of this.adapters) {
      if (!adapter.supports(row)) continue;
      try {
        const result = await adapter.lookup(row);
        if (result.candidates.length > 0) return result;
        warnings.push(...result.warnings.map((warning) => `${adapter.id}: ${warning}`));
      } catch (error) {
        warnings.push(`${adapter.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return {
      sourceUrl: row.officialProductUrl ?? "",
      candidates: [],
      warnings: warnings.length ? warnings : ["No official-source adapter supports this row"],
    };
  }
}

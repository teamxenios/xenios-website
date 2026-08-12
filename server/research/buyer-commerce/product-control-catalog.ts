import type { BuyerCatalogVariant } from "@shared/research/buyer-commerce";
import { EARLY_ACCESS_MAX_QUANTITY } from "@shared/research/early-access-quantity";
import type { ProductCatalogReader } from "../catalog/product-control-reader";
import type { EarlyAccessCatalogSource } from "../early-access/catalog/product-control-source";
import { decideEarlyAccessRelease, type EarlyAccessReleaseLedger } from "../early-access/release/founder-release";
import { buildEarlyAccessStorefront } from "../early-access/release/storefront-view";
import type { BuyerCatalogPort } from "./service";

/**
 * Buyer projection over the existing Product Control and founder-release
 * systems. It writes no catalog data and infers no purchase authority.
 */
export class ProductControlBuyerCatalog implements BuyerCatalogPort {
  constructor(
    private readonly dependencies: Readonly<{
      productControl: ProductCatalogReader;
      earlyAccess: EarlyAccessCatalogSource;
      releases: EarlyAccessReleaseLedger;
    }>,
  ) {}

  async variants(input: Readonly<{ customerRef: string; at: Date }>): Promise<readonly BuyerCatalogVariant[]> {
    const [products, projection, releases] = await Promise.all([
      this.dependencies.productControl.readCatalog(),
      this.dependencies.earlyAccess.load(input.at, {
        earlyAccessCustomer: { customerRef: input.customerRef },
      }),
      this.dependencies.releases.all(),
    ]);
    const storefront = buildEarlyAccessStorefront({ projection, releases, scope: "all" });
    const productsById = new Map<string, (typeof products)[number] | null>();
    for (const product of products) {
      productsById.set(product.id, productsById.has(product.id) ? null : product);
    }
    const rows = new Map(projection.rows.map((row) => [`${row.productId}\u0000${row.variantId}`, row]));

    return Object.freeze(
      storefront.units.map((unit) => {
        const product = productsById.get(unit.productId) ?? null;
        const variantMatches = product?.variants.filter((variant) => variant.id === unit.variantId) ?? [];
        const exactVariant = variantMatches.length === 1 ? variantMatches[0]! : null;
        const row = rows.get(`${unit.productId}\u0000${unit.variantId}`) ?? null;
        const releaseDecision = row === null
          ? null
          : decideEarlyAccessRelease({ row, releases, now: input.at.getTime() });
        const authorityLimit = unit.basis === "founder_release"
          ? releaseDecision?.released === true
            ? releaseDecision.approvedQuantityLimit
            : null
          : unit.quantityLimit;
        const acceptedLimit = authorityLimit === null
          ? null
          : Math.min(authorityLimit, EARLY_ACCESS_MAX_QUANTITY);
        const carePathway = product?.lane === "future_clinical";
        const direct =
          !carePathway &&
          unit.purchasable &&
          acceptedLimit !== null &&
          acceptedLimit >= 1 &&
          typeof unit.priceCents === "number";

        return Object.freeze({
          offeringId: unit.productId,
          variantId: unit.variantId,
          sku: exactVariant?.sku ?? unit.sku,
          slug: unit.slug,
          productName: unit.displayName,
          category: product?.category ?? "uncategorized",
          ...(unit.strength ? { strengthLabel: unit.strength } : {}),
          ...(unit.presentation ? { presentation: unit.presentation } : {}),
          ...(unit.priceCents === null ? {} : { displayPriceCents: unit.priceCents }),
          currency: unit.currency || "USD",
          displayState: unit.availability,
          directPurchaseAuthorized: direct,
          directQuantityLimit: direct ? acceptedLimit : null,
          directAuthorityBasis: direct ? unit.basis : null,
          carePathway,
        });
      }),
    );
  }
}

import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductSummary,
  AdminProductVariant,
} from "@shared/research/product-admin";
import {
  CART_PURCHASE_AUDIENCES,
  type CartAudienceEligibility,
} from "@shared/research/cart-product-selection";
import type { ProductAdminRepository } from "../products-diagnostics/product-admin";
import { SupabaseProductAdminRepository } from "../products-diagnostics/product-admin-production";

export type ProductControlReadRepository = Pick<
  ProductAdminRepository,
  "list" | "get"
>;

export interface ProductCatalogReader {
  readCatalog(): Promise<AdminProductDetail[]>;
}

export interface ProductDetailReader {
  readDetail(slug: string): Promise<AdminProductDetail | null>;
}

export interface CurrentPriceResolver {
  resolve(input: {
    productId: string;
    variant: AdminProductVariant;
    prices: readonly AdminProductPrice[];
    audienceEligibility: CartAudienceEligibility;
    currency: string;
    evaluatedAt: string;
  }): AdminProductPrice | null;
}

function publiclyPublished(product: AdminProductSummary): boolean {
  return (
    product.status === "published" &&
    product.visibility === "public" &&
    product.active
  );
}

/**
 * Server-only reader over the live Product Control repository. Admin records,
 * private media keys, and audit history never leave this boundary directly.
 */
export class LiveProductControlReader
  implements ProductCatalogReader, ProductDetailReader
{
  constructor(private readonly repository: ProductControlReadRepository) {}

  async readCatalog(): Promise<AdminProductDetail[]> {
    const summaries = await this.repository.list({
      status: "published",
      visibility: "public",
    });
    const idCounts = new Map<string, number>();
    const slugCounts = new Map<string, number>();
    for (const product of summaries) {
      idCounts.set(product.id, (idCounts.get(product.id) ?? 0) + 1);
      slugCounts.set(
        product.slug.toLowerCase(),
        (slugCounts.get(product.slug.toLowerCase()) ?? 0) + 1,
      );
    }
    const exact = summaries.filter(
      (product) =>
        publiclyPublished(product) &&
        idCounts.get(product.id) === 1 &&
        slugCounts.get(product.slug.toLowerCase()) === 1,
    );
    const details = await Promise.all(
      exact.map((product) => this.repository.get(product.id)),
    );
    return details.filter(
      (product): product is AdminProductDetail =>
        product !== null && publiclyPublished(product),
    );
  }

  async readDetail(slug: string): Promise<AdminProductDetail | null> {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) return null;
    const summaries = await this.repository.list({
      query: normalized,
      status: "published",
      visibility: "public",
    });
    const matches = summaries.filter(
      (product) =>
        publiclyPublished(product) &&
        product.slug.toLowerCase() === normalized,
    );
    if (matches.length !== 1) return null;
    const detail = await this.repository.get(matches[0].id);
    return detail !== null && publiclyPublished(detail) ? detail : null;
  }
}

export function parseProductControlTimestamp(value: string): number | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1] ||
    Number(hourText) > 23 ||
    Number(minuteText) > 59 ||
    Number(secondText) > 59
  ) {
    return null;
  }
  if (
    zone !== "Z" &&
    (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)
  ) {
    return null;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export class ProductControlCurrentPriceResolver
  implements CurrentPriceResolver
{
  resolve({
    productId,
    variant,
    prices,
    audienceEligibility,
    currency,
    evaluatedAt,
  }: Parameters<CurrentPriceResolver["resolve"]>[0]): AdminProductPrice | null {
    const at = parseProductControlTimestamp(evaluatedAt);
    if (
      at === null ||
      !productId.trim() ||
      !variant.id.trim() ||
      !variant.sku.trim() ||
      !currency.trim() ||
      currency !== currency.toUpperCase() ||
      audienceEligibility.state !== "authorized" ||
      !audienceEligibility.sourceVersion.trim() ||
      parseProductControlTimestamp(audienceEligibility.evaluatedAt) !== at ||
      !(CART_PURCHASE_AUDIENCES as readonly string[]).includes(
        audienceEligibility.audience,
      ) ||
      variant.productId !== productId ||
      variant.status !== "approved" ||
      !variant.active ||
      (audienceEligibility.audience === "member" && !variant.memberEligible)
    ) {
      return null;
    }
    const matches = prices.filter((price) => {
      const effectiveAt = parseProductControlTimestamp(price.effectiveAt);
      const expiresAt =
        price.expiresAt === null
          ? null
          : parseProductControlTimestamp(price.expiresAt);
      return (
        price.productId === productId &&
        price.variantId === variant.id &&
        price.audience === audienceEligibility.audience &&
        price.currency === currency &&
        price.status === "active" &&
        Boolean(price.id.trim()) &&
        Boolean(price.approvedBy) &&
        Number.isSafeInteger(price.amountCents) &&
        price.amountCents >= 0 &&
        Number.isInteger(price.version) &&
        price.version > 0 &&
        effectiveAt !== null &&
        effectiveAt <= at &&
        (price.expiresAt === null || (expiresAt !== null && expiresAt > at))
      );
    });
    return matches.length === 1 ? matches[0] : null;
  }
}

export function createProductionProductControlReader(): LiveProductControlReader {
  return new LiveProductControlReader(new SupabaseProductAdminRepository());
}

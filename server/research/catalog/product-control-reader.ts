import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductSummary,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { CartAudienceEligibility } from "@shared/research/cart-product-selection";
import type { ProductAdminRepository } from "../products-diagnostics/product-admin";
import { SupabaseProductAdminRepository } from "../products-diagnostics/product-admin-production";
import { resolveProductControlPrice } from "../products-diagnostics/product-control-price-resolver";

export {
  parseProductControlTimestamp,
  parseProductControlTimestampMicros,
} from "../products-diagnostics/product-control-price-resolver";

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

function sameSummarySnapshot(
  summary: AdminProductSummary,
  detail: AdminProductSummary,
): boolean {
  return (
    detail.id === summary.id &&
    detail.slug.trim().toLowerCase() === summary.slug.trim().toLowerCase() &&
    detail.productCode === summary.productCode &&
    detail.displayName === summary.displayName &&
    detail.canonicalName === summary.canonicalName &&
    JSON.stringify(detail.aliases) === JSON.stringify(summary.aliases) &&
    detail.lane === summary.lane &&
    detail.category === summary.category &&
    detail.classification === summary.classification &&
    detail.status === summary.status &&
    detail.active === summary.active &&
    detail.visibility === summary.visibility &&
    detail.availability === summary.availability &&
    detail.commerceApproval === summary.commerceApproval &&
    detail.qualityDocumentState === summary.qualityDocumentState &&
    detail.variantCount === summary.variantCount &&
    detail.approvedVariantCount === summary.approvedVariantCount &&
    detail.missingInputCount === summary.missingInputCount &&
    detail.updatedAt === summary.updatedAt &&
    detail.publishedAt === summary.publishedAt
  );
}

function detailSnapshotToken(detail: AdminProductDetail): string {
  const variants = [...detail.variants].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const prices = [...detail.prices].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const media = [...detail.media].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  return JSON.stringify({
    summary: {
      id: detail.id,
      productCode: detail.productCode,
      slug: detail.slug,
      displayName: detail.displayName,
      canonicalName: detail.canonicalName,
      aliases: detail.aliases,
      lane: detail.lane,
      category: detail.category,
      classification: detail.classification,
      status: detail.status,
      active: detail.active,
      visibility: detail.visibility,
      availability: detail.availability,
      commerceApproval: detail.commerceApproval,
      qualityDocumentState: detail.qualityDocumentState,
      variantCount: detail.variantCount,
      approvedVariantCount: detail.approvedVariantCount,
      missingInputCount: detail.missingInputCount,
      updatedAt: detail.updatedAt,
      publishedAt: detail.publishedAt,
    },
    content: detail.content,
    variants,
    prices,
    media,
  });
}

/**
 * Server-only reader over the live Product Control repository. Admin records,
 * private media keys, and audit history never leave this boundary directly.
 */
export class LiveProductControlReader
  implements ProductCatalogReader, ProductDetailReader
{
  constructor(private readonly repository: ProductControlReadRepository) {}

  private async readStableDetail(
    summary: AdminProductSummary,
  ): Promise<AdminProductDetail | null> {
    const first = await this.repository.get(summary.id);
    if (
      first === null ||
      !publiclyPublished(first) ||
      !sameSummarySnapshot(summary, first)
    ) {
      return null;
    }
    const second = await this.repository.get(summary.id);
    return second !== null &&
      publiclyPublished(second) &&
      sameSummarySnapshot(summary, second) &&
      detailSnapshotToken(first) === detailSnapshotToken(second)
      ? second
      : null;
  }

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
      exact.map((product) => this.readStableDetail(product)),
    );
    const verification = await this.repository.list({
      status: "published",
      visibility: "public",
    });
    const verificationIdCounts = new Map<string, number>();
    const verificationSlugCounts = new Map<string, number>();
    for (const candidate of verification.filter(publiclyPublished)) {
      verificationIdCounts.set(
        candidate.id,
        (verificationIdCounts.get(candidate.id) ?? 0) + 1,
      );
      const candidateSlug = candidate.slug.trim().toLowerCase();
      verificationSlugCounts.set(
        candidateSlug,
        (verificationSlugCounts.get(candidateSlug) ?? 0) + 1,
      );
    }
    return details.filter((product, index): product is AdminProductDetail => {
      if (product === null) return false;
      const summary = exact[index];
      const matches = verification.filter(
        (candidate) =>
          publiclyPublished(candidate) &&
          candidate.id === summary.id &&
          candidate.slug.trim().toLowerCase() ===
            summary.slug.trim().toLowerCase(),
      );
      return (
        matches.length === 1 &&
        verificationIdCounts.get(summary.id) === 1 &&
        verificationSlugCounts.get(summary.slug.trim().toLowerCase()) === 1 &&
        sameSummarySnapshot(summary, matches[0]) &&
        sameSummarySnapshot(matches[0], product)
      );
    });
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
    const summary = matches[0];
    const detail = await this.readStableDetail(summary);
    if (detail === null) return null;
    const verification = await this.repository.list({
      query: normalized,
      status: "published",
      visibility: "public",
    });
    const verifiedMatches = verification.filter(
      (product) =>
        publiclyPublished(product) &&
        product.slug.trim().toLowerCase() === normalized,
    );
    return verifiedMatches.length === 1 &&
      sameSummarySnapshot(summary, verifiedMatches[0]) &&
      sameSummarySnapshot(verifiedMatches[0], detail)
      ? detail
      : null;
  }
}

export class ProductControlCurrentPriceResolver
  implements CurrentPriceResolver
{
  resolve(
    input: Parameters<CurrentPriceResolver["resolve"]>[0],
  ): AdminProductPrice | null {
    const result = resolveProductControlPrice(input);
    return result.ok ? result.price : null;
  }
}

export function createProductionProductControlReader(): LiveProductControlReader {
  return new LiveProductControlReader(new SupabaseProductAdminRepository());
}

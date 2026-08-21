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
> & {
  /**
   * Read every published, public product WITH the fields a customer catalog
   * renders, in a bounded number of remote calls.
   *
   * OPTIONAL, and its absence is not a failure: a repository without it keeps
   * the per-product path below, unchanged. When it IS supplied, `readCatalog`
   * costs a constant number of reads instead of two per product.
   *
   * The measured cost of not having it, at 236 published products, is 472 get
   * calls plus 2 list calls; each get is a product query plus six more, which
   * is the ~3,300-query catalog read the Early Access storefront was paying on
   * every request.
   *
   * WHAT AN IMPLEMENTATION MUST INCLUDE. Everything a customer surface reads:
   * the product summary, its variants, its prices AND its content. The
   * existing `listForPricing` is the right SHAPE but not a valid substitute —
   * it returns `content` empty because pricing never reads it, and the Early
   * Access catalog renders `content.shortDescription`. Wiring this to
   * `listForPricing` would make the catalog fast and silently wordless.
   */
  listDetails?(): Promise<AdminProductDetail[]>;
};

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

  /**
   * The same answer as the per-product path, from two bulk reads.
   *
   * The stability guarantee is preserved rather than traded away. The
   * per-product path reads each product twice and compares snapshot tokens so
   * a concurrent edit cannot be served half-applied; this reads the whole
   * catalog twice and compares the same tokens. That is equal or stronger: it
   * also catches a product appearing or disappearing between the two reads,
   * which the per-product path needed a separate verification list to see.
   */
  private async readCatalogInBulk(
    listDetails: () => Promise<AdminProductDetail[]>,
  ): Promise<AdminProductDetail[]> {
    const [first, second] = [await listDetails(), await listDetails()];

    const uniquePublished = (details: readonly AdminProductDetail[]) => {
      const idCounts = new Map<string, number>();
      const slugCounts = new Map<string, number>();
      for (const detail of details) {
        idCounts.set(detail.id, (idCounts.get(detail.id) ?? 0) + 1);
        const slug = detail.slug.trim().toLowerCase();
        slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
      }
      const byId = new Map<string, AdminProductDetail>();
      for (const detail of details) {
        if (!publiclyPublished(detail)) continue;
        // A duplicated id or slug is ambiguous, and the per-product path drops
        // it for the same reason: two rows claiming one product is not a
        // product we can name.
        if (idCounts.get(detail.id) !== 1) continue;
        if (slugCounts.get(detail.slug.trim().toLowerCase()) !== 1) continue;
        byId.set(detail.id, detail);
      }
      return byId;
    };

    const before = uniquePublished(first);
    const after = uniquePublished(second);

    const stable: AdminProductDetail[] = [];
    before.forEach((detail, id) => {
      const confirmed = after.get(id);
      if (confirmed === undefined) return;
      if (detailSnapshotToken(detail) !== detailSnapshotToken(confirmed)) return;
      if (!sameSummarySnapshot(detail, confirmed)) return;
      stable.push(confirmed);
    });
    return stable;
  }

  async readCatalog(): Promise<AdminProductDetail[]> {
    const listDetails = this.repository.listDetails?.bind(this.repository);
    if (listDetails !== undefined) {
      return this.readCatalogInBulk(listDetails);
    }
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

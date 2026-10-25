import type { SupplementMediaRecord } from "../official-sources/contracts";
import { mayLinkPublicAsset } from "../rights/policy";

export interface ProductControlMediaLinkRequest {
  canonicalProductId: string;
  canonicalVariantId: string;
  assetId: string;
  storagePath: string;
  publicUrl: string;
  altText: string;
  idempotencyKey: string;
}

export function buildProductControlLinkRequests(
  records: readonly SupplementMediaRecord[],
): ProductControlMediaLinkRequest[] {
  return records.flatMap((record) => {
    if (
      !mayLinkPublicAsset({
        approvalStatus: record.approvalStatus,
        rightsStatus: record.rights.status,
        matchState: record.matchState,
        exactVariantId: record.canonicalVariantId,
        sourceUrl: record.sourceProductUrl,
      }) ||
      !record.storagePath ||
      !record.publicUrl
    ) {
      return [];
    }
    return [{
      canonicalProductId: record.canonicalProductId,
      canonicalVariantId: record.canonicalVariantId,
      assetId: record.assetId,
      storagePath: record.storagePath,
      publicUrl: record.publicUrl,
      altText: record.altText,
      idempotencyKey: `supplement-media-link:${record.canonicalVariantId}:${record.assetId}`,
    }];
  });
}

export type ProductImageChoice =
  | { kind: "exact_variant"; url: string }
  | { kind: "canonical_product"; url: string }
  | { kind: "brand_placeholder"; url: string }
  | { kind: "category_placeholder"; url: string }
  | { kind: "image_pending"; url: string };

export function resolveSupplementProductImage(input: {
  exactVariantUrl?: string | null;
  canonicalProductUrl?: string | null;
  brandPlaceholderUrl?: string | null;
  categoryPlaceholderUrl?: string | null;
  imagePendingUrl: string;
}): ProductImageChoice {
  if (input.exactVariantUrl) return { kind: "exact_variant", url: input.exactVariantUrl };
  if (input.canonicalProductUrl) return { kind: "canonical_product", url: input.canonicalProductUrl };
  if (input.brandPlaceholderUrl) return { kind: "brand_placeholder", url: input.brandPlaceholderUrl };
  if (input.categoryPlaceholderUrl) return { kind: "category_placeholder", url: input.categoryPlaceholderUrl };
  return { kind: "image_pending", url: input.imagePendingUrl };
}

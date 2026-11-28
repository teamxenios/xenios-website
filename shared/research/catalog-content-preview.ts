import type { ReviewedProductContent, ReviewedProductMedia } from "./master-offerings/approved-content";

/** Operator read-only view. No draft field, price, action or release authority. */
export type CatalogContentPreview = Readonly<{
  state: "preview_available" | "select_variant" | "invalid_selection" | "variant_not_in_product"
    | "binding_missing" | "binding_ambiguous" | "catalog_unavailable" | "catalog_identity_mismatch";
  productId: string | null;
  variantId: string | null;
  identity: Readonly<{ offeringId: string; offeringVariantId: string; displayName: string;
    variantLabel: string; offeringState: string; variantState: string }> | null;
  contentState: "reviewed_content" | "no_reviewed_content";
  mediaState: "reviewed_media" | "no_reviewed_media";
  content: ReviewedProductContent | null;
  media: ReviewedProductMedia | null;
  reviewMessage: string | null;
}>;

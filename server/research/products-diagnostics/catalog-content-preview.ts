import type { AdminProductDetail } from "@shared/research/product-admin";
import type { CatalogContentPreview } from "@shared/research/catalog-content-preview";
import type { ReviewedProductContent, ReviewedProductMedia } from "@shared/research/master-offerings/approved-content";
import type { MasterOfferingCommerceIdentityBinding, NormalizedMasterOffering, NormalizedMasterOfferingVariant } from "../master-offerings/model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type View = { label: string; reviewedContent?: ReviewedProductContent; reviewedMedia?: ReviewedProductMedia; reviewMessage?: string };
export interface CatalogPreviewReaders {
  bindings(): { index: ReadonlyMap<string, MasterOfferingCommerceIdentityBinding>; problem: string | null };
  catalog(): readonly NormalizedMasterOffering[];
  project(offering: NormalizedMasterOffering, variant: NormalizedMasterOfferingVariant): View;
}

const text = (v: unknown, limit = 20_000): v is string => typeof v === "string" && v.trim().length > 0
  && v.length <= limit && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
const publicHref = (v: unknown): v is string => typeof v === "string" && v.startsWith("/") && !v.startsWith("//")
  && v.length <= 2048 && !/[\\%?#\x00-\x20]/.test(v) && !v.split("/").includes("..")
  && !/^\/(?:api|admin|private)(?:\/|$)/.test(v);
function documentHref(value: unknown): value is string {
  if (publicHref(value)) return true;
  if (typeof value !== "string" || value.length > 2048 || /[\\\x00-\x20]/.test(value)) return false;
  try {
    const url = new URL(value);
    // These are links from the existing reviewed-content reader, not caller
    // URLs or a server fetch. Retain approved public manufacturer documents.
    return url.protocol === "https:" && !url.username && !url.password
      && /^[a-z0-9.-]+\.[a-z]+$/i.test(url.hostname) && !url.hostname.endsWith(".localhost")
      && ![...url.searchParams.keys()].some(key => /token|secret|password|credential|authorization|signature/i.test(key));
  } catch { return false; }
}

function contentProjection(raw: ReviewedProductContent | undefined): ReviewedProductContent | null {
  if (!raw || !text(raw.summary) || !text(raw.overview)) return null;
  const result: Record<string, unknown> = { summary: raw.summary, overview: raw.overview };
  for (const key of ["browseSummary", "brand", "purpose", "ingredients", "label", "cautions", "storage"] as const) {
    if (text(raw[key])) result[key] = raw[key];
  }
  if (Array.isArray(raw.specifications) && raw.specifications.length <= 100) {
    result.specifications = raw.specifications.filter(p => p && text(p.label, 200) && text(p.value, 2000))
      .map(p => ({ label: p.label, value: p.value }));
  }
  if (Array.isArray(raw.documentation) && raw.documentation.length <= 50) {
    result.documentation = raw.documentation.filter(p => p && text(p.label, 200) && documentHref(p.href))
      .map(p => ({ label: p.label, href: p.href }));
  }
  return result as unknown as ReviewedProductContent;
}

function mediaProjection(raw: ReviewedProductMedia | undefined): ReviewedProductMedia | null {
  const image = (value: ReviewedProductMedia["primary"] | undefined) => value && publicHref(value.href)
    && text(value.altText, 1000) && Number.isSafeInteger(value.width) && value.width > 0 && value.width <= 20_000
    && Number.isSafeInteger(value.height) && value.height > 0 && value.height <= 20_000
    ? { href: value.href, altText: value.altText, width: value.width, height: value.height } : null;
  if (!raw || typeof raw.packagingDesign !== "boolean") return null;
  const primary = image(raw.primary); if (!primary) return null;
  if (raw.representation !== undefined && !["proposed_carton", "proposed_vial", "catalog_reference"].includes(raw.representation)) return null;
  const labelPreview = image(raw.labelPreview);
  return { primary, packagingDesign: raw.packagingDesign,
    ...(labelPreview ? { labelPreview } : {}), ...(raw.representation ? { representation: raw.representation } : {}) };
}

/** Called only after the existing requireAdmin guard and service.get. No auth claims are accepted here. */
export function createCatalogContentPreview(readers: CatalogPreviewReaders) {
  return function preview(product: AdminProductDetail, selection: unknown): CatalogContentPreview {
    const productId = UUID.test(product?.id ?? "") ? product.id : null;
    const variantId = typeof selection === "string" && UUID.test(selection) ? selection : null;
    const empty = (state: CatalogContentPreview["state"]): CatalogContentPreview => ({ state, productId, variantId,
      identity: null, contentState: "no_reviewed_content", mediaState: "no_reviewed_media",
      content: null, media: null, reviewMessage: null });
    if (selection === undefined || selection === null || selection === "") return empty("select_variant");
    if (!productId || !variantId) return empty("invalid_selection");
    const owned = product.variants?.filter(v => v.id === variantId && v.productId === productId) ?? [];
    if (owned.length !== 1) return empty("variant_not_in_product");
    try {
      const { index, problem } = readers.bindings();
      if (problem !== null) return empty("catalog_unavailable");
      const matching = [...index].filter(([, b]) => b.productId === productId && b.variantId === variantId);
      if (matching.length === 0) return empty("binding_missing");
      if (matching.length !== 1) return empty("binding_ambiguous");
      const [key, binding] = matching[0], parts = key.split("|");
      if (parts.length !== 2 || !/^mo_[0-9a-f]+$/.test(parts[0]) || !/^mov_[0-9a-f]+$/.test(parts[1])
        || parts[1] !== binding.offeringVariantId) return empty("catalog_identity_mismatch");
      const offerings = readers.catalog().filter(o => o.id === parts[0]);
      if (offerings.length !== 1 || offerings[0].visibility !== "member") return empty("catalog_identity_mismatch");
      const offering = offerings[0], variants = offering.variants.filter(v => v.id === parts[1]);
      if (variants.length !== 1 || variants[0].visibility !== "member") return empty("catalog_identity_mismatch");
      // The canonical projector carries neutral labels and held-education rules.
      // Never fall back to ProductAdminDetail.content/media or another variant.
      const view = readers.project(offering, variants[0]);
      if (!text(offering.displayName, 1000) || !text(view.label, 1000)) return empty("catalog_identity_mismatch");
      const content = contentProjection(view.reviewedContent), media = mediaProjection(view.reviewedMedia);
      return {
        state: "preview_available", productId, variantId,
        identity: { offeringId: offering.id, offeringVariantId: variants[0].id, displayName: offering.displayName,
          variantLabel: view.label, offeringState: offering.displayState, variantState: variants[0].displayState },
        contentState: content ? "reviewed_content" : "no_reviewed_content",
        mediaState: media ? "reviewed_media" : "no_reviewed_media", content, media,
        reviewMessage: text(view.reviewMessage, 4000) ? view.reviewMessage : null,
      };
    } catch { return empty("catalog_unavailable"); }
  };
}

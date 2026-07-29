import { v3PreviewProducts } from "./v3-preview-catalog";

export type V3SupplementPreview = {
  previewId: string;
  slug: string;
  displayName: string;
  category: "Supplements";
  format: "being_confirmed";
  flavorState: "not_confirmed";
  subscriptionState: "not_configured";
  pricingState: "public_price_pending";
  approvedPrice: null;
  availabilityState: "coming_soon";
  purchasingEnabled: false;
  primaryAction: "request_sourcing";
};

export const v3SupplementPreviews: readonly V3SupplementPreview[] =
  v3PreviewProducts
    .filter((profile) => profile.kind === "supplement")
    .map((profile) => ({
      previewId: profile.previewId,
      slug: profile.slug,
      displayName: profile.displayName,
      category: "Supplements",
      format: "being_confirmed",
      flavorState: "not_confirmed",
      subscriptionState: "not_configured",
      pricingState: "public_price_pending",
      approvedPrice: null,
      availabilityState: "coming_soon",
      purchasingEnabled: false,
      primaryAction: "request_sourcing",
    }));

export const v3PublicSupplements = v3SupplementPreviews;

export function searchV3Supplements(query: string): V3SupplementPreview[] {
  const normalized = query.trim().toLocaleLowerCase("en-US");
  if (!normalized) return [...v3SupplementPreviews];
  return v3SupplementPreviews.filter((item) =>
    `${item.displayName} ${item.slug}`.toLocaleLowerCase("en-US").includes(normalized),
  );
}

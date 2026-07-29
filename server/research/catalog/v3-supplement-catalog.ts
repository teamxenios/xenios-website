import type { V3PreviewProfile } from "./v3-preview-catalog";
import { v3PreviewProfiles } from "./v3-preview-catalog";

export type V3SupplementPreview = Pick<
  V3PreviewProfile,
  | "id"
  | "slug"
  | "displayName"
  | "summary"
  | "availability"
  | "pricingState"
  | "approvedPrice"
  | "approvedVariantCount"
  | "purchasingEnabled"
  | "documentationState"
> & {
  form: null;
  flavor: null;
  pairingKeys: readonly string[];
};

export type V3SupplementQuery = {
  query?: string;
  sort?: "recommended" | "name_ascending" | "name_descending";
};

export function buildV3SupplementCatalog(
  profiles: readonly V3PreviewProfile[] = v3PreviewProfiles,
): readonly V3SupplementPreview[] {
  return profiles
    .filter((profile) => profile.kind === "supplement_profile")
    .map((profile) => ({
      id: profile.id,
      slug: profile.slug,
      displayName: profile.displayName,
      summary: profile.summary,
      availability: profile.availability,
      pricingState: profile.pricingState,
      approvedPrice: profile.approvedPrice,
      approvedVariantCount: profile.approvedVariantCount,
      purchasingEnabled: profile.purchasingEnabled,
      documentationState: profile.documentationState,
      form: null,
      flavor: null,
      pairingKeys: [],
    }));
}

export function searchV3SupplementCatalog(
  query: V3SupplementQuery = {},
  catalog: readonly V3SupplementPreview[] = buildV3SupplementCatalog(),
): readonly V3SupplementPreview[] {
  const needle = (query.query ?? "").trim().toLocaleLowerCase("en-US");
  const filtered = catalog.filter(
    (item) =>
      needle.length === 0 ||
      `${item.displayName} ${item.summary}`
        .toLocaleLowerCase("en-US")
        .includes(needle),
  );
  if (query.sort === "name_descending") {
    return [...filtered].sort((left, right) =>
      right.displayName.localeCompare(left.displayName),
    );
  }
  if (query.sort === "name_ascending") {
    return [...filtered].sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
  }
  return filtered;
}

export function relatedV3SupplementPreviews(
  slug: string,
  catalog: readonly V3SupplementPreview[] = buildV3SupplementCatalog(),
): readonly V3SupplementPreview[] {
  const selected = catalog.find((item) => item.slug === slug);
  if (!selected) return [];
  return catalog
    .filter((item) => item.slug !== selected.slug)
    .slice(0, 3);
}

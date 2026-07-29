import {
  createV3MemberProductDetail,
  v3PreviewProducts,
  type V3PreviewProfile,
  type V3PreviewProfileKind,
} from "./v3-preview-catalog";

export const V3_CATALOG_SORTS = [
  "editorial",
  "name_ascending",
  "name_descending",
] as const;

export type V3CatalogSort = (typeof V3_CATALOG_SORTS)[number];

export type V3CatalogSearchInput = {
  query?: string;
  kind?: V3PreviewProfileKind | "all";
  category?: string | "all";
  sort?: V3CatalogSort;
};

export type V3CatalogSearchItem = V3PreviewProfile & {
  route: string;
  access: "member";
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function searchableText(profile: V3PreviewProfile): string {
  return normalize(
    [
      profile.displayName,
      profile.slug,
      profile.kind,
      profile.category,
      profile.classification,
      ...profile.aliases,
    ].join(" "),
  );
}

function asSearchItem(profile: V3PreviewProfile): V3CatalogSearchItem {
  return {
    ...profile,
    route: `/research/member/products/${profile.slug}`,
    access: "member",
  };
}

export function searchV3Catalog(
  input: V3CatalogSearchInput = {},
): V3CatalogSearchItem[] {
  const query = normalize(input.query ?? "");
  const kind = input.kind ?? "all";
  const category = input.category ?? "all";
  const sort = input.sort ?? "editorial";
  const results = v3PreviewProducts
    .filter((profile) => kind === "all" || profile.kind === kind)
    .filter((profile) => category === "all" || profile.category === category)
    .filter((profile) => !query || searchableText(profile).includes(query))
    .map(asSearchItem);

  if (sort === "name_ascending") {
    return results.sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
  }
  if (sort === "name_descending") {
    return results.sort((left, right) =>
      right.displayName.localeCompare(left.displayName),
    );
  }
  return results;
}

export function autocompleteV3Catalog(
  query: string,
  limit = 8,
): V3CatalogSearchItem[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) return [];
  const normalized = normalize(query);
  if (normalized.length < 2) return [];
  return searchV3Catalog({ query: normalized, sort: "name_ascending" }).slice(
    0,
    limit,
  );
}

export function compareV3Catalog(
  slugs: readonly string[],
): V3CatalogSearchItem[] {
  const unique = Array.from(
    new Set(slugs.map(normalize).filter(Boolean)),
  ).slice(0, 4);
  const bySlug = new Map(
    v3PreviewProducts.map((profile) => [profile.slug, asSearchItem(profile)]),
  );
  return unique.flatMap((slug) => {
    const profile = bySlug.get(slug);
    return profile ? [profile] : [];
  });
}

export function getV3CatalogDetail(slug: string, evaluatedAt: string) {
  const normalizedSlug = normalize(slug);
  if (!normalizedSlug || normalizedSlug !== slug.trim()) return null;
  return createV3MemberProductDetail(normalizedSlug, evaluatedAt);
}

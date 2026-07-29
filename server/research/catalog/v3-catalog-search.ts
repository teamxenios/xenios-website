import type {
  V3PreviewAvailability,
  V3PreviewKind,
  V3PreviewProfile,
} from "./v3-preview-catalog";
import { getV3PreviewProfile, v3PreviewProfiles } from "./v3-preview-catalog";

export const V3_CATALOG_SORTS = [
  "recommended",
  "name_ascending",
  "name_descending",
] as const;

export type V3CatalogSort = (typeof V3_CATALOG_SORTS)[number];

export type V3CatalogSearchQuery = {
  query?: string;
  kind?: V3PreviewKind | "all";
  category?: string | "all";
  availability?: V3PreviewAvailability | "all";
  sort?: V3CatalogSort;
};

export type V3CatalogSearchResult = {
  items: readonly V3PreviewProfile[];
  total: number;
  categories: readonly string[];
  kinds: readonly V3PreviewKind[];
};

function searchableText(item: V3PreviewProfile): string {
  return [
    item.displayName,
    item.category,
    item.summary,
    ...item.aliases,
    ...item.keywords,
  ]
    .join(" ")
    .toLocaleLowerCase("en-US");
}

function normalizedQuery(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("en-US");
}

function sortItems(
  items: readonly V3PreviewProfile[],
  sort: V3CatalogSort,
): V3PreviewProfile[] {
  return [...items].sort((left, right) => {
    if (sort === "name_ascending") {
      return left.displayName.localeCompare(right.displayName);
    }
    if (sort === "name_descending") {
      return right.displayName.localeCompare(left.displayName);
    }
    return left.sortOrder - right.sortOrder;
  });
}

export function searchV3PreviewCatalog(
  query: V3CatalogSearchQuery = {},
  catalog: readonly V3PreviewProfile[] = v3PreviewProfiles,
): V3CatalogSearchResult {
  const needle = normalizedQuery(query.query);
  const kind = query.kind ?? "all";
  const category = query.category ?? "all";
  const availability = query.availability ?? "all";
  const sort = query.sort ?? "recommended";
  const items = catalog.filter((item) => {
    if (kind !== "all" && item.kind !== kind) return false;
    if (category !== "all" && item.category !== category) return false;
    if (availability !== "all" && item.availability !== availability) {
      return false;
    }
    return needle.length === 0 || searchableText(item).includes(needle);
  });
  return {
    items: sortItems(items, sort),
    total: items.length,
    categories: Array.from(
      new Set(catalog.map((item) => item.category)),
    ).sort(),
    kinds: Array.from(new Set(catalog.map((item) => item.kind))).sort(),
  };
}

export function compareV3PreviewProfiles(
  slugs: readonly string[],
  catalog: readonly V3PreviewProfile[] = v3PreviewProfiles,
): readonly V3PreviewProfile[] {
  const unique = Array.from(
    new Set(slugs.map((slug) => slug.trim().toLowerCase())),
  )
    .filter(Boolean)
    .slice(0, 4);
  const bySlug = new Map(catalog.map((item) => [item.slug, item]));
  return unique.flatMap((slug) => {
    const item = bySlug.get(slug);
    return item ? [item] : [];
  });
}

export function readV3PreviewDetail(
  slug: string,
): V3PreviewProfile | null {
  return getV3PreviewProfile(slug);
}

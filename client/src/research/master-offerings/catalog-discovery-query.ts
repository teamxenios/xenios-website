import {
  CATALOG_DISCOVERY_ACCESS_PATHS,
  CATALOG_DISCOVERY_FACET_KEY_PATTERN,
  CATALOG_DISCOVERY_STATUSES,
  type CatalogDiscoveryAccessPath,
  type CatalogDiscoveryFacetValue,
  type CatalogDiscoveryItem,
  type CatalogDiscoveryStatus,
} from "@shared/research/master-offerings/presentation-contract";

export interface CatalogDiscoveryQuery {
  q?: string;
  category?: string;
  strength?: string;
  form?: string;
  access?: CatalogDiscoveryAccessPath;
  status?: CatalogDiscoveryStatus;
}

export interface CatalogDiscoveryFilterOptions {
  categories: readonly CatalogDiscoveryFacetValue[];
  strengths: readonly CatalogDiscoveryFacetValue[];
  forms: readonly CatalogDiscoveryFacetValue[];
}

function closedValue<TValue extends string>(
  value: string | null,
  vocabulary: readonly TValue[],
): TValue | undefined {
  return value && vocabulary.includes(value as TValue)
    ? (value as TValue)
    : undefined;
}

function facetKey(value: string | null): string | undefined {
  return value && CATALOG_DISCOVERY_FACET_KEY_PATTERN.test(value)
    ? value
    : undefined;
}

export function parseCatalogDiscoveryQuery(
  search: string,
): CatalogDiscoveryQuery {
  const params = new URLSearchParams(search);
  const q = (params.get("q") ?? "").trim().slice(0, 160);
  const category = facetKey(params.get("category"));
  const strength = facetKey(params.get("strength"));
  const form = facetKey(params.get("form"));
  const access = closedValue(
    params.get("access"),
    CATALOG_DISCOVERY_ACCESS_PATHS,
  );
  const status = closedValue(
    params.get("status"),
    CATALOG_DISCOVERY_STATUSES,
  );
  return {
    ...(q ? { q } : {}),
    ...(category ? { category } : {}),
    ...(strength ? { strength } : {}),
    ...(form ? { form } : {}),
    ...(access ? { access } : {}),
    ...(status ? { status } : {}),
  };
}

export function serializeCatalogDiscoveryQuery(
  query: CatalogDiscoveryQuery,
): string {
  const params = new URLSearchParams();
  const q = query.q?.trim().slice(0, 160);
  if (q) params.set("q", q);
  if (
    query.category &&
    CATALOG_DISCOVERY_FACET_KEY_PATTERN.test(query.category)
  ) {
    params.set("category", query.category);
  }
  if (
    query.strength &&
    CATALOG_DISCOVERY_FACET_KEY_PATTERN.test(query.strength)
  ) {
    params.set("strength", query.strength);
  }
  if (query.form && CATALOG_DISCOVERY_FACET_KEY_PATTERN.test(query.form)) {
    params.set("form", query.form);
  }
  if (
    query.access &&
    (CATALOG_DISCOVERY_ACCESS_PATHS as readonly string[]).includes(query.access)
  ) {
    params.set("access", query.access);
  }
  if (
    query.status &&
    (CATALOG_DISCOVERY_STATUSES as readonly string[]).includes(query.status)
  ) {
    params.set("status", query.status);
  }
  const result = params.toString();
  return result ? `?${result}` : "";
}

function orderedFacets(
  values: readonly (CatalogDiscoveryFacetValue | null)[],
): CatalogDiscoveryFacetValue[] {
  const byKey = new Map<string, CatalogDiscoveryFacetValue>();
  const conflicting = new Set<string>();
  for (const value of values) {
    if (!value || conflicting.has(value.key)) continue;
    const existing = byKey.get(value.key);
    if (!existing) {
      byKey.set(value.key, value);
    } else if (existing.label !== value.label) {
      byKey.delete(value.key);
      conflicting.add(value.key);
    }
  }
  return Array.from(byKey.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function catalogDiscoveryFilterOptions(
  items: readonly CatalogDiscoveryItem[],
): CatalogDiscoveryFilterOptions {
  return {
    categories: orderedFacets(items.map((item) => item.category)),
    strengths: orderedFacets(items.map((item) => item.strength)),
    forms: orderedFacets(items.map((item) => item.form)),
  };
}

export function filterCatalogDiscoveryItems(
  items: readonly CatalogDiscoveryItem[],
  query: CatalogDiscoveryQuery,
): CatalogDiscoveryItem[] {
  const search = query.q?.trim().toLowerCase() ?? "";
  return items.filter((item) => {
    if (query.category && item.category.key !== query.category) return false;
    if (query.strength && item.strength?.key !== query.strength) return false;
    if (query.form && item.form?.key !== query.form) return false;
    if (query.access && item.accessPath !== query.access) return false;
    if (query.status && item.status !== query.status) return false;
    if (!search) return true;
    const haystack = [
      item.displayName,
      item.variantLabel,
      item.category.label,
      item.strength?.label ?? "",
      item.form?.label ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
}

import { v3CatalogProfiles, type V3CatalogProfile } from "./v3-preview-catalog";

export const V3_CATALOG_SORTS = [
  "editorial",
  "alphabetical",
  "newest_reviewed",
  "documentation_completeness",
  "availability",
  "approved_price",
] as const;

export type V3CatalogSort = (typeof V3_CATALOG_SORTS)[number];
export type V3CompositionKind = "single" | "blend";
export type V3ProductType = "research" | "laboratory_supply" | "quantum";

export type V3CatalogSearchQuery = {
  query?: string;
  productClass?: string;
  category?: string;
  composition?: V3CompositionKind;
  productType?: V3ProductType;
  format?: "pending_confirmation";
  presentation?: "pending_confirmation";
  documentation?: "pending";
  availability?: "coming_soon";
  supplierReadiness?: "pending";
  subscriptionEligibility?: "disabled";
  access?: "member";
  sort?: V3CatalogSort;
};

export type V3PublicCatalogItem = {
  productKey: string;
  slug: string;
  displayName: string;
  productClass: string;
  category: string;
  composition: V3CompositionKind;
  productType: V3ProductType;
  customerState: "coming_soon";
  purchaseState: "disabled_pending_readiness";
  priceState: "public_price_pending";
  formatState: "pending_confirmation";
  presentationState: "pending_confirmation";
  documentationState: "pending";
  availability: "coming_soon";
  supplierReadiness: "pending";
  subscriptionEligibility: "disabled";
  access: "member";
  primaryCta: "Notify me";
  secondaryCta: "Request sourcing";
  route: string;
  summary: string;
  reviewedAt: "2026-07-27";
  editorialOrder: number;
};

export type V3PublicCatalogDetail = V3PublicCatalogItem & {
  statusBanner: string;
  overview: string;
  presentationSummary: "Options being confirmed";
  documentation: Array<{
    key: "product" | "quality" | "storage" | "shipping";
    label: string;
    state: "pending";
  }>;
  reviewedQuestions: string[];
  relatedProducts: Array<Pick<V3PublicCatalogItem, "slug" | "displayName" | "route">>;
  relatedSupplementsState: "pairing_review_pending";
};

export type V3CatalogSearchResult = {
  items: V3PublicCatalogItem[];
  total: number;
  facets: {
    productClasses: Array<{ value: string; count: number }>;
    categories: Array<{ value: string; count: number }>;
    compositions: Array<{ value: V3CompositionKind; count: number }>;
    productTypes: Array<{ value: V3ProductType; count: number }>;
  };
};

function composition(profile: V3CatalogProfile): V3CompositionKind {
  return /blend/i.test(profile.product_class) ? "blend" : "single";
}

function productType(profile: V3CatalogProfile): V3ProductType {
  if (profile.product_key === "xn-quantum-foundational-reset") return "quantum";
  if (profile.status_classification === "laboratory_supply") {
    return "laboratory_supply";
  }
  return "research";
}

function publicItem(
  profile: V3CatalogProfile,
  editorialOrder: number,
): V3PublicCatalogItem {
  return {
    productKey: profile.product_key,
    slug: profile.slug,
    displayName: profile.display_name,
    productClass: profile.product_class,
    category: profile.merchandising_category,
    composition: composition(profile),
    productType: productType(profile),
    customerState: "coming_soon",
    purchaseState: "disabled_pending_readiness",
    priceState: "public_price_pending",
    formatState: "pending_confirmation",
    presentationState: "pending_confirmation",
    documentationState: "pending",
    availability: "coming_soon",
    supplierReadiness: "pending",
    subscriptionEligibility: "disabled",
    access: "member",
    primaryCta: "Notify me",
    secondaryCta: "Request sourcing",
    route: `/research/member/products/${profile.slug}`,
    summary: profile.preview_copy,
    reviewedAt: "2026-07-27",
    editorialOrder,
  };
}

export const v3PublicCatalogItems = Object.freeze(
  v3CatalogProfiles.map((profile, index) =>
    Object.freeze(publicItem(profile, index + 1)),
  ),
);

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function counts<T extends string>(
  values: readonly T[],
): Array<{ value: T; count: number }> {
  const map = new Map<T, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return Array.from(map, ([value, count]) => ({ value, count })).sort((a, b) =>
    a.value.localeCompare(b.value),
  );
}

function compareItems(
  left: V3PublicCatalogItem,
  right: V3PublicCatalogItem,
  sort: V3CatalogSort,
): number {
  if (sort === "alphabetical") {
    return left.displayName.localeCompare(right.displayName);
  }
  if (sort === "newest_reviewed") {
    return (
      right.reviewedAt.localeCompare(left.reviewedAt) ||
      left.editorialOrder - right.editorialOrder
    );
  }
  if (sort === "documentation_completeness") {
    return (
      left.documentationState.localeCompare(right.documentationState) ||
      left.editorialOrder - right.editorialOrder
    );
  }
  if (sort === "availability") {
    return (
      left.availability.localeCompare(right.availability) ||
      left.editorialOrder - right.editorialOrder
    );
  }
  if (sort === "approved_price") {
    return left.editorialOrder - right.editorialOrder;
  }
  return left.editorialOrder - right.editorialOrder;
}

export function searchV3Catalog(
  query: V3CatalogSearchQuery = {},
): V3CatalogSearchResult {
  const search = query.query ? normalized(query.query) : "";
  const items = v3PublicCatalogItems
    .filter((item) => {
      if (
        search &&
        ![
          item.displayName,
          item.productClass,
          item.category,
          item.composition,
          item.productType,
        ]
          .map(normalized)
          .some((value) => value.includes(search))
      ) {
        return false;
      }
      if (query.productClass && item.productClass !== query.productClass) {
        return false;
      }
      if (query.category && item.category !== query.category) return false;
      if (query.composition && item.composition !== query.composition) {
        return false;
      }
      if (query.productType && item.productType !== query.productType) {
        return false;
      }
      if (query.format && item.formatState !== query.format) return false;
      if (
        query.presentation &&
        item.presentationState !== query.presentation
      ) {
        return false;
      }
      if (
        query.documentation &&
        item.documentationState !== query.documentation
      ) {
        return false;
      }
      if (query.availability && item.availability !== query.availability) {
        return false;
      }
      if (
        query.supplierReadiness &&
        item.supplierReadiness !== query.supplierReadiness
      ) {
        return false;
      }
      if (
        query.subscriptionEligibility &&
        item.subscriptionEligibility !== query.subscriptionEligibility
      ) {
        return false;
      }
      if (query.access && item.access !== query.access) return false;
      return true;
    })
    .slice()
    .sort((left, right) =>
      compareItems(left, right, query.sort ?? "editorial"),
    );

  return {
    items,
    total: items.length,
    facets: {
      productClasses: counts(
        v3PublicCatalogItems.map((item) => item.productClass),
      ),
      categories: counts(v3PublicCatalogItems.map((item) => item.category)),
      compositions: counts(
        v3PublicCatalogItems.map((item) => item.composition),
      ),
      productTypes: counts(
        v3PublicCatalogItems.map((item) => item.productType),
      ),
    },
  };
}

export function autocompleteV3Catalog(
  query: string,
  limit = 8,
): Array<Pick<V3PublicCatalogItem, "slug" | "displayName" | "route">> {
  const search = normalized(query);
  if (!search || !Number.isInteger(limit) || limit < 1 || limit > 20) return [];
  return v3PublicCatalogItems
    .filter((item) =>
      [item.displayName, item.productClass, item.category]
        .map(normalized)
        .some((value) => value.includes(search)),
    )
    .sort((left, right) => {
      const leftPrefix = normalized(left.displayName).startsWith(search) ? 0 : 1;
      const rightPrefix = normalized(right.displayName).startsWith(search)
        ? 0
        : 1;
      return (
        leftPrefix - rightPrefix ||
        left.displayName.localeCompare(right.displayName)
      );
    })
    .slice(0, limit)
    .map(({ slug, displayName, route }) => ({ slug, displayName, route }));
}

export function compareV3Catalog(
  slugs: readonly string[],
): V3PublicCatalogItem[] {
  const normalizedSlugs = slugs.map(normalized);
  if (
    normalizedSlugs.length < 2 ||
    normalizedSlugs.length > 3 ||
    new Set(normalizedSlugs).size !== normalizedSlugs.length
  ) {
    return [];
  }
  const bySlug = new Map(v3PublicCatalogItems.map((item) => [item.slug, item]));
  const selected = normalizedSlugs.map((slug) => bySlug.get(slug));
  if (selected.some((item) => item === undefined)) return [];
  return selected as V3PublicCatalogItem[];
}

export function getV3CatalogDetail(
  slug: string,
): V3PublicCatalogDetail | null {
  const item = v3PublicCatalogItems.find(
    (candidate) => candidate.slug === normalized(slug),
  );
  if (!item) return null;
  return {
    ...item,
    statusBanner:
      "Coming soon. Supplier coverage, public pricing, approved variants, inventory, and exact-lot documentation are still required.",
    overview:
      `${item.displayName} is a supplier-independent Xenios Research discovery profile. ` +
      "It is not an offer for sale and does not provide prescribing, dosing, treatment, or individualized recommendations.",
    presentationSummary: "Options being confirmed",
    documentation: [
      { key: "product", label: "Product documentation", state: "pending" },
      { key: "quality", label: "Exact-lot quality record", state: "pending" },
      { key: "storage", label: "Storage source", state: "pending" },
      { key: "shipping", label: "Shipping profile", state: "pending" },
    ],
    reviewedQuestions: [
      "What information is confirmed?",
      "What remains required before purchase can open?",
      "How will exact-lot quality documents appear?",
    ],
    relatedProducts: v3PublicCatalogItems
      .filter(
        (candidate) =>
          candidate.productKey !== item.productKey &&
          candidate.category === item.category,
      )
      .slice(0, 4)
      .map(({ slug: relatedSlug, displayName, route }) => ({
        slug: relatedSlug,
        displayName,
        route,
      })),
    relatedSupplementsState: "pairing_review_pending",
  };
}

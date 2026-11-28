import type { MasterOfferingFamily } from "../master-offerings/contract";

/**
 * The four Early Access catalog categories a link may name, for example
 * /earlyaccess?category=supplements. A category is a navigation hint only: it
 * never grants admission, skips intake, selects an item or changes a row's
 * classification, hold, price boundary or availability.
 */
export const EARLY_ACCESS_CATALOG_CATEGORIES = ["clinical", "research_peptides", "supplements", "topicals"] as const;
export type EarlyAccessCatalogCategory = typeof EARLY_ACCESS_CATALOG_CATEGORIES[number];

/** Three categories are one catalog family each. Clinical opens the whole clinical family; no peptide flag exists. */
export const EARLY_ACCESS_CATEGORY_FAMILY: Readonly<Record<Exclude<EarlyAccessCatalogCategory, "topicals">, MasterOfferingFamily>> = {
  clinical: "clinical_formulations_503a",
  research_peptides: "research_peptides_materials",
  supplements: "supplements",
};

/** Catalog presentations a query may ask for. Topicals spans families, so it is not a family. */
export const ASSISTED_ORDER_CATALOG_PRESENTATIONS = ["topicals"] as const;
export type AssistedOrderCatalogPresentation = typeof ASSISTED_ORDER_CATALOG_PRESENTATIONS[number];

/**
 * The catalog form values that say topical, exactly as the dataset carries them
 * in each offering's subcategory. Membership is by this explicit form fact only,
 * never by a name or alias: a "Solution" row is not included, because its form
 * does not say topical.
 */
export const TOPICAL_CATALOG_FORMS = ["Topical Cream", "Topical Gel / Serum", "Topical Serum"] as const;

export function isTopicalCatalogForm(subcategory: string | null | undefined): boolean {
  return typeof subcategory === "string" && (TOPICAL_CATALOG_FORMS as readonly string[]).includes(subcategory);
}

export function isAssistedOrderCatalogPresentation(value: unknown): value is AssistedOrderCatalogPresentation {
  return typeof value === "string" && (ASSISTED_ORDER_CATALOG_PRESENTATIONS as readonly string[]).includes(value);
}

/**
 * Reads a category link. Exactly one key, `category`, once, with one exact value
 * from the closed set. Any other shape (unknown, empty, differently cased,
 * repeated, or with any extra key) returns null, and the ordinary catalog opens.
 */
export function catalogCategoryFromSearch(search: string): EarlyAccessCatalogCategory | null {
  const params = new URLSearchParams(search);
  const keys = [...params.keys()];
  if (keys.length !== 1 || keys[0] !== "category") return null;
  const value = params.get("category");
  return value !== null && (EARLY_ACCESS_CATALOG_CATEGORIES as readonly string[]).includes(value)
    ? value as EarlyAccessCatalogCategory : null;
}

/** How a category becomes a catalog query: a family for three, the topical presentation for one. */
export function catalogQueryForCategory(category: EarlyAccessCatalogCategory):
  Readonly<{ family: MasterOfferingFamily; presentation?: undefined } | { family?: undefined; presentation: AssistedOrderCatalogPresentation }> {
  return category === "topicals" ? { presentation: "topicals" } : { family: EARLY_ACCESS_CATEGORY_FAMILY[category] };
}

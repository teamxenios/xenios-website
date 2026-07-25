import type { CatalogProduct } from "@shared/research/catalog";
import {
  PRODUCT_FAMILIES,
  PRODUCT_FAMILY_LABELS,
  PRODUCT_PAGE_SECTIONS,
  type ProductCommerceRecord,
  type ProductFamily,
  type ProductFamilySummary,
  type ProductMaster,
  type ProductRecord,
  type ProductTemplateClass,
  type ProductTruthState,
} from "./model";

function stableId(prefix: string, value: string): string {
  return `${prefix}_${value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function isBlend(product: CatalogProduct): boolean {
  return (
    product.displayName.toLowerCase().includes("blend") ||
    product.slug.includes("-plus-") ||
    product.slug.includes("-tb-") ||
    product.relatedGuideSlugs.some((slug) => slug.split("-").length >= 4)
  );
}

export function familyForCatalogProduct(product: CatalogProduct): ProductFamily {
  switch (product.lane) {
    case "supplement":
      return "supplements";
    case "quantum":
      return "quantum";
    case "future_clinical":
      return "clinician_guided_care";
    case "non_product_program":
      return "programs";
    case "research_material":
      return isBlend(product) ? "blends" : "research_vials";
  }
}

export function templateForFamily(family: ProductFamily): ProductTemplateClass {
  switch (family) {
    case "research_vials":
      return "research_material";
    case "blends":
      return "blend";
    case "supplements":
      return "supplement";
    case "programs":
      return "program";
    case "quantum":
      return "quantum";
    case "laboratory_supplies":
      return "laboratory_supply";
    case "diagnostics":
      return "diagnostic";
    case "clinician_guided_care":
      return "clinician_guided_care";
    case "storage_and_organization":
      return "storage_accessory";
  }
}

export function truthStateForCatalogProduct(product: CatalogProduct): ProductTruthState {
  if (product.lane === "future_clinical") return "clinician_pathway_pending";
  if (product.laneDecision === "needs_samuel_decision") return "under_review";
  if (product.commerceApproval === "blocked_by_documentation") return "documentation_pending";
  if (product.commerceApproval !== "approved") {
    if (product.availability === "coming_soon") return "coming_soon";
    if (product.availability === "out_of_stock") return "out_of_stock";
    if (product.availability === "waitlist" || product.availability === "commerce_review") {
      return "request_access";
    }
    return "under_review";
  }
  switch (product.availability) {
    case "in_stock":
    case "low_stock":
      return "available";
    case "out_of_stock":
      return "out_of_stock";
    case "coming_soon":
      return "coming_soon";
    case "documentation_review":
      return "documentation_pending";
    case "waitlist":
    case "commerce_review":
      return "request_access";
    case "temporarily_unavailable":
      return "not_currently_offered";
  }
}

function productRecord(product: CatalogProduct, at: string): ProductRecord {
  const family = familyForCatalogProduct(product);
  return {
    productId: stableId("product", product.sku),
    slug: product.slug,
    displayName: product.displayName,
    family,
    templateClass: templateForFamily(family),
    searchAliases: [...new Set([product.sku, product.slug, ...product.nameAliases])],
    sourceLane: product.lane,
    adminEditable: true,
    createdAt: at,
    updatedAt: at,
  };
}

function commerceRecord(product: CatalogProduct, productId: string, at: string): ProductCommerceRecord {
  const price =
    product.facts.priceCents.confirmation === "confirmed" &&
    !product.facts.priceCents.conflictNote
      ? product.facts.priceCents.value
      : null;
  const truthState = truthStateForCatalogProduct(product);
  return {
    commerceId: stableId("commerce", product.sku),
    productId,
    truthState,
    sourceAvailability: product.availability,
    sourceApproval: product.commerceApproval,
    priceCents: price,
    inventoryVisible: truthState === "available" || truthState === "out_of_stock",
    purchasable: truthState === "available" && price !== null,
    checkoutMessage:
      truthState === "available"
        ? null
        : "This listing is informational until its current review and commerce gates are complete.",
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * Builds the normalized Website 3 product master from the existing authoritative
 * CatalogProduct records. It does not create a second product catalog and it does
 * not promote unverified legacy facts.
 */
export function buildProductMaster(catalog: readonly CatalogProduct[], at: string): ProductMaster {
  const products = catalog.map((item) => productRecord(item, at));
  const bySku = new Map(catalog.map((item) => [item.sku, item]));

  return {
    products,
    variants: products.map((product) => {
      const source = bySku.get(product.searchAliases[0]);
      if (!source) throw new Error(`Catalog source missing for ${product.productId}`);
      return {
        variantId: stableId("variant", source.sku),
        productId: product.productId,
        sku: source.sku,
        label: "Primary catalog variant",
        attributes: {},
        createdAt: at,
        updatedAt: at,
      };
    }),
    // Lot, certificate, and media rows are created only from actual source records.
    // Empty arrays are truthful; fabricated lots or certificates would be unsafe.
    lots: [],
    certificates: [],
    media: [],
    content: products.flatMap((product) =>
      PRODUCT_PAGE_SECTIONS.map((section) => ({
        contentId: stableId("content", `${product.productId}_${section}`),
        productId: product.productId,
        section,
        state: "draft" as const,
        heading: null,
        body: null,
        adminEditable: true as const,
        updatedBy: null,
        createdAt: at,
        updatedAt: at,
      })),
    ),
    commerce: products.map((product) => {
      const source = bySku.get(product.searchAliases[0]);
      if (!source) throw new Error(`Catalog source missing for ${product.productId}`);
      return commerceRecord(source, product.productId, at);
    }),
  };
}

export function summarizeFamilies(master: ProductMaster): ProductFamilySummary[] {
  const counts = new Map<ProductFamily, number>();
  for (const product of master.products) {
    counts.set(product.family, (counts.get(product.family) ?? 0) + 1);
  }
  return [
    {
      family: "all_products",
      label: PRODUCT_FAMILY_LABELS.all_products,
      productCount: master.products.length,
    },
    ...PRODUCT_FAMILIES.map((family) => ({
      family,
      label: PRODUCT_FAMILY_LABELS[family],
      productCount: counts.get(family) ?? 0,
    })),
  ];
}

export function searchProductMaster(
  master: ProductMaster,
  query: string,
  family: ProductFamily | "all_products" = "all_products",
): ProductRecord[] {
  const normalized = query.trim().toLowerCase();
  return master.products.filter((product) => {
    if (family !== "all_products" && product.family !== family) return false;
    if (!normalized) return true;
    return [product.displayName, product.slug, ...product.searchAliases]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}


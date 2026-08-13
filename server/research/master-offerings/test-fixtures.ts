import type { CartProductSelection } from "@shared/research/cart-product-selection";
import type {
  NormalizedMasterOffering,
  NormalizedMasterOfferingVariant,
  RawMasterOfferingRow,
} from "./model";

export function rawMasterRow(
  overrides: Partial<RawMasterOfferingRow> = {},
): RawMasterOfferingRow {
  return {
    sheetRow: 5,
    sourceGroup: "Planning expansion benchmark",
    category: "Peptides & Research",
    brandOrSubcategory: "Single peptide",
    sourceSku: "PLAN-001",
    productName: "BPC-157 Research Material",
    variantOrFormat: "10 mg vial",
    familyOrTag: "Recovery research",
    supplierOrOwner: "Private supplier",
    originalWholesaleCost: null,
    updatedWholesaleCost: null,
    wholesaleStatus: "Pending",
    originalSellPrice: null,
    updatedSellPrice: 99,
    targetSellAtUpdatedCost: null,
    recommendedLaunchSellPrice: 99,
    updatedMarkupMultiple: null,
    updatedGrossProfit: null,
    updatedGrossMargin: null,
    sourceAccessState: "Planning / source verification required",
    activationPriority: "NEEDS SOURCE / APPROVAL",
    austinSupplierBenchmark: false,
    activationRequirement: "Supplier approval required",
    sourceNotes: "Private source note",
    productUrl: null,
    ...overrides,
  };
}

export function variant(
  overrides: Partial<NormalizedMasterOfferingVariant> = {},
): NormalizedMasterOfferingVariant {
  return {
    id: "mov_test_variant",
    label: "10 mg vial",
    displayState: "available_now",
    visibility: "member",
    sourceReferences: [],
    ...overrides,
  };
}

export function offering(
  overrides: Partial<NormalizedMasterOffering> = {},
): NormalizedMasterOffering {
  const defaultVariant = variant();
  return {
    id: "mo_test_product",
    slug: "research-vials-bpc-157",
    canonicalKey: "research_vials|bpc 157",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    family: "research_vials",
    category: "Peptides & Research",
    subcategory: "Single peptide",
    brand: null,
    aliases: ["BPC 157"],
    displayState: defaultVariant.displayState,
    stateExplanation: "Test state explanation.",
    copyState: "needs_review",
    visibility: "member",
    variants: [defaultVariant],
    sourceReferences: [],
    ...overrides,
  };
}

export function cartSelection(
  overrides: Partial<CartProductSelection> = {},
): CartProductSelection {
  return {
    productId: "pc_product_1",
    variantId: "pc_variant_1",
    sku: "XEN-BPC-10",
    audience: "member",
    audienceEligibility: {
      audience: "member",
      state: "authorized",
      sourceVersion: "audience-v1",
      evaluatedAt: "2026-08-09T12:00:00.000Z",
    },
    price: {
      id: "price_1",
      amountCents: 9900,
      currency: "USD",
      effectiveAt: "2026-08-09T00:00:00.000Z",
      expiresAt: null,
      version: 1,
    },
    media: {
      id: "media_1",
      kind: "primary_image",
      altText: "BPC-157 vial",
    },
    canonicalReadiness: {
      ready: true,
      verifiedInputCount: 4,
      inputVersions: [{ id: "input_1", version: 1 }],
      domainVersions: [{ domain: "commerce", version: 1 }],
    },
    inventoryEligibility: {
      productId: "pc_product_1",
      variantId: "pc_variant_1",
      state: "eligible",
      sourceVersion: "inventory-v1",
      evaluatedAt: "2026-08-09T12:00:00.000Z",
    },
    evaluatedAt: "2026-08-09T12:00:00.000Z",
    ...overrides,
  };
}

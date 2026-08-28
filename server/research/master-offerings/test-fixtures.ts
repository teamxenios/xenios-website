import type { AuthoritativeCartProductSelection } from "../commerce/cart-product-selection";
import {
  canonicalProductVariantActivationFingerprint,
  resolveProductVariantActivationAuthorityForTest,
} from "../product-activation/authority-repository";
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
  overrides: Partial<AuthoritativeCartProductSelection> = {},
): AuthoritativeCartProductSelection {
  const productId = overrides.productId ?? "pc_product_1";
  const variantId = overrides.variantId ?? "pc_variant_1";
  const sku = overrides.sku ?? "XEN-BPC-10";
  const evaluatedAt = overrides.evaluatedAt ?? "2026-08-09T12:00:00.000Z";
  const unsigned = {
    schemaVersion: 1 as const,
    ledgerRevision: 9,
    productState: "live" as const,
    variantState: "live" as const,
    productId,
    variantId,
    sku,
    approvalId: "11111111-1111-4111-8111-111111111111",
    approvedByActorId: "22222222-2222-4222-8222-222222222222",
    approvedByRole: "founder" as const,
    approvedAt: "2026-08-01T00:00:00.000Z",
    reviewedAt: "2026-08-08T00:00:00.000Z",
    validFrom: "2026-08-08T12:00:00.000Z",
    validThrough: "2026-09-01T00:00:00.000Z",
    revokedAt: null,
  };
  const row = {
    ...unsigned,
    evidenceFingerprint:
      canonicalProductVariantActivationFingerprint(unsigned),
  };
  const activationAuthority =
    resolveProductVariantActivationAuthorityForTest(
      { readCurrentCandidates: () => [row] },
    { productId, variantId, sku, evaluatedAt },
    );
  if (activationAuthority.state !== "live") {
    throw new Error("test fixture activation must resolve live");
  }
  return {
    productId,
    variantId,
    sku,
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
      productId,
      variantId,
      state: "eligible",
      sourceVersion: "inventory-v1",
      evaluatedAt: "2026-08-09T12:00:00.000Z",
    },
    activationAuthority,
    evaluatedAt,
    ...overrides,
  };
}

import { describe, expect, it } from "vitest";
import { PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS } from "@shared/research/product-admin";
import type { AdminProductDetail } from "@shared/research/product-admin";
import type { DomainReadiness, RequiredInput } from "@shared/research/required-inputs";
import {
  createCartSelectionAuthority,
  type AuthorizedCartAudienceFact,
  type CartSelectionAuthorityDependencies,
} from "./cart-selection-authority";
import type { VariantInventoryFacts } from "./member-catalog-service";

const AT = "2026-08-19T16:00:00.000Z";

const AUTHORIZED: AuthorizedCartAudienceFact = {
  audience: "member",
  sourceVersion: "audience-v1",
  evaluatedAt: AT,
};

const REQUEST = {
  productId: "product-a",
  variantId: "variant-a",
  audience: "member" as const,
  currency: "USD",
  evaluatedAt: AT,
};

function readiness(domain: string): DomainReadiness {
  return {
    domain,
    launchStatus: "public_enabled",
    softwareComplete: true,
    realInputsRequired: false,
    publicEnabled: true,
    manifestApproved: true,
    expectedInputCount: 2,
    actualInputCount: 2,
    blockingInputCount: 0,
    blockingKeys: [],
    version: 3,
  };
}

function requiredInputs(productId = "product-a"): RequiredInput[] {
  return PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS.map((binding, index) => ({
    id: `input-${index}`,
    key: binding.key,
    domain: binding.domain,
    label: "Verified input",
    description: "Verified input",
    whyRequired: "Required by canonical readiness.",
    recordType: binding.recordType,
    recordId: productId,
    fieldPath: "field",
    currentState: "verified",
    blockingLevel: "blocks_display",
    responsibleRole: "product_admin",
    verificationMethod: "review",
    evidenceRequired: [],
    entryMode: "direct",
    valueSensitivity: "ordinary",
    enteredValue: "verified",
    externalReferenceName: null,
    enteredBy: "admin",
    enteredAt: AT,
    verifiedBy: "reviewer",
    verifiedAt: AT,
    rejectionReason: null,
    publicLaunchImpact: "Blocks release.",
    nextAction: "Review.",
    adminEntryHref: "/internal",
    version: index + 1,
    auditHistory: [],
  }));
}

function productDetail(): AdminProductDetail {
  return {
    id: "product-a",
    productCode: "PRODUCT-A",
    slug: "product-a",
    displayName: "Product A",
    canonicalName: "Product A",
    aliases: [],
    lane: "research_material",
    category: "Research",
    classification: "Research",
    status: "published",
    active: true,
    visibility: "members_only",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: AT,
    publishedAt: AT,
    variants: [
      {
        id: "variant-a",
        productId: "product-a",
        sku: "SKU-A",
        catalogNumber: "CAT-A",
        label: "Variant A",
        strength: null,
        size: null,
        format: null,
        presentation: null,
        shippingClass: "standard",
        memberEligible: true,
        status: "approved",
        active: true,
        sortOrder: 0,
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    prices: [
      {
        id: "price-a",
        productId: "product-a",
        variantId: "variant-a",
        audience: "member",
        amountCents: 14900,
        currency: "USD",
        effectiveAt: "2026-08-01T00:00:00.000Z",
        expiresAt: null,
        status: "active",
        approvalNote: "Approved",
        version: 2,
        createdBy: "admin",
        approvedBy: "reviewer",
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    media: [
      {
        id: "media-a",
        productId: "product-a",
        kind: "primary_image",
        state: "approved",
        storageKey: "private/product-a.webp",
        filename: "product-a.webp",
        contentType: "image/webp",
        sizeBytes: 1000,
        altText: "Product A",
        sortOrder: 0,
        approvedBy: "reviewer",
        createdAt: AT,
        updatedAt: AT,
      },
    ],
  } as unknown as AdminProductDetail;
}

function facts(eligible: boolean, lotState = eligible ? "verified" : "required"): VariantInventoryFacts {
  return {
    inventory: {
      productId: "product-a",
      variantId: "variant-a",
      state: eligible ? "eligible" : "unavailable",
      reason: eligible ? null : "not_currently_available",
      sourceVersion: "inventory-v1",
      evaluatedAt: AT,
    },
    lotCoa: {
      productId: "product-a",
      variantId: "variant-a",
      state: lotState as VariantInventoryFacts["lotCoa"]["state"],
      sourceVersion: "inventory-v1",
      evaluatedAt: AT,
    },
  };
}

function authority(
  overrides: Partial<CartSelectionAuthorityDependencies> = {},
) {
  return createCartSelectionAuthority({
    configured: () => true,
    readCatalog: async () => [productDetail()],
    listRequiredInputs: async () => requiredInputs(),
    readinessAll: async () => {
      const domains = Array.from(
        new Set(PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS.map((b) => b.domain)),
      );
      return domains.map(readiness);
    },
    variantInventoryFacts: async () => facts(true),
    ...overrides,
  });
}

describe("createCartSelectionAuthority", () => {
  it("selects a fully approved, priced, eligible variant through the one selection engine", async () => {
    const result = await authority().select(REQUEST, AUTHORIZED);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selection.price.amountCents).toBe(14900);
      expect(result.selection.audienceEligibility.state).toBe("authorized");
    }
  });

  it("fails closed with no database", async () => {
    const result = await authority({ configured: () => false }).select(REQUEST, AUTHORIZED);
    expect(result).toEqual({ ok: false, code: "readiness_incomplete" });
  });

  it("refuses an authorization fact from a different instant or audience", async () => {
    const drifted = await authority().select(REQUEST, {
      ...AUTHORIZED,
      evaluatedAt: "2026-08-19T16:00:01.000Z",
    });
    expect(drifted).toEqual({ ok: false, code: "audience_unauthorized" });

    const wrongAudience = await authority().select(REQUEST, {
      ...AUTHORIZED,
      audience: "professional",
    });
    expect(wrongAudience).toEqual({ ok: false, code: "audience_unauthorized" });

    const emptyVersion = await authority().select(REQUEST, {
      ...AUTHORIZED,
      sourceVersion: "  ",
    });
    expect(emptyVersion).toEqual({ ok: false, code: "audience_unauthorized" });
  });

  it("never sells an unverified lot, whatever the other facts say", async () => {
    const result = await authority({
      variantInventoryFacts: async () => facts(true, "required"),
    }).select(REQUEST, AUTHORIZED);
    expect(result).toEqual({ ok: false, code: "inventory_unavailable" });
  });

  it("refuses ineligible inventory through the selection engine", async () => {
    const result = await authority({
      variantInventoryFacts: async () => facts(false, "not_applicable"),
    }).select(REQUEST, AUTHORIZED);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("inventory_unavailable");
  });

  it("answers product_missing for an unknown product without inventing facts", async () => {
    const result = await authority({ readCatalog: async () => [] }).select(
      REQUEST,
      AUTHORIZED,
    );
    expect(result).toEqual({ ok: false, code: "product_missing" });
  });
});

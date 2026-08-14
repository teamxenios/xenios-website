import { describe, expect, it, vi } from "vitest";
import { PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS } from "@shared/research/product-admin";
import type {
  CartAudienceEligibility,
  CartInventoryEligibility,
  CartProductSelectionRequest,
} from "@shared/research/cart-product-selection";
import type { AdminProductDetail } from "@shared/research/product-admin";
import type {
  DomainReadiness,
  RequiredInput,
} from "@shared/research/required-inputs";
import { selectCartProduct } from "../commerce/cart-product-selection";
import type { VariantInventoryFacts } from "../catalog/member-catalog-service";
import {
  createProductControlCartSelectionAuthority,
  type ProductControlCartSelectionDependencies,
} from "./product-control-selection-authority";

const AT = "2026-08-14T19:00:00.000Z";
const REQUEST: CartProductSelectionRequest = {
  productId: "product-a",
  variantId: "variant-a",
  audience: "member",
  currency: "USD",
  evaluatedAt: AT,
};

function product(): AdminProductDetail {
  return {
    id: "product-a",
    productCode: "PRODUCT-A",
    slug: "product-a",
    displayName: "Product A",
    canonicalName: "Product A",
    aliases: [],
    lane: "research_material",
    category: "Research",
    classification: "Research material",
    status: "published",
    active: true,
    visibility: "public",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: AT,
    publishedAt: AT,
    content: {
      shortDescription: "Reviewed summary.",
      longDescription: null,
      overview: null,
      specifications: null,
      researchInformation: null,
      storageInformation: null,
      handlingInformation: null,
      shippingInformation: null,
      returnInformation: null,
      disclaimers: null,
      citations: [],
      reviewDate: null,
    },
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
        approvalNote: "Private approval note",
        version: 2,
        createdBy: "admin-internal",
        approvedBy: "reviewer-internal",
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
        filename: "private-filename.webp",
        contentType: "image/webp",
        sizeBytes: 100,
        altText: "Product A vial",
        sortOrder: 0,
        approvedBy: "reviewer-internal",
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    history: [],
  };
}

function inputs(productId = "product-a"): RequiredInput[] {
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

function domainReadiness(domain: string): DomainReadiness {
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

function readiness(): DomainReadiness[] {
  return [domainReadiness("product_content"), domainReadiness("products")];
}

function audience(
  overrides: Partial<CartAudienceEligibility> = {},
): CartAudienceEligibility {
  return {
    audience: "member",
    state: "authorized",
    sourceVersion: "member-v1",
    evaluatedAt: AT,
    ...overrides,
  };
}

function inventory(
  overrides: Partial<CartInventoryEligibility> = {},
): VariantInventoryFacts {
  return {
    inventory: {
      productId: "product-a",
      variantId: "variant-a",
      state: "eligible",
      reason: null,
      sourceVersion: "inventory-v1",
      evaluatedAt: AT,
      ...overrides,
    },
    lotCoa: {
      productId: "product-a",
      variantId: "variant-a",
      state: "verified",
      sourceVersion: "private-lot-evidence",
      evaluatedAt: AT,
    },
  };
}

function harness(
  overrides: {
    product?: AdminProductDetail | null;
    inputs?: RequiredInput[];
    readiness?: DomainReadiness[];
    audience?: CartAudienceEligibility | null;
    inventory?: VariantInventoryFacts;
  } = {},
) {
  const selectedProduct =
    "product" in overrides ? (overrides.product ?? null) : product();
  const selectedInputs = overrides.inputs ?? inputs();
  const selectedReadiness = overrides.readiness ?? readiness();
  const selectedAudience =
    "audience" in overrides ? (overrides.audience ?? null) : audience();
  const selectedInventory = overrides.inventory ?? inventory();
  const reads = {
    product: vi.fn(async () => selectedProduct),
    inputs: vi.fn(async () => selectedInputs),
    readiness: vi.fn(async () => selectedReadiness),
    audience: vi.fn(async () => selectedAudience),
    inventory: vi.fn(async () => selectedInventory),
  };
  const dependencies: ProductControlCartSelectionDependencies = {
    products: { readProductForPricing: reads.product },
    requiredInputs: {
      list: reads.inputs,
      readinessAll: reads.readiness,
    },
    inventory: { readVariantInventoryFacts: reads.inventory },
    audienceEligibility: reads.audience,
  };
  return {
    authority: createProductControlCartSelectionAuthority(dependencies),
    reads,
    facts: {
      product: selectedProduct,
      inputs: selectedInputs,
      readiness: selectedReadiness,
      audience: selectedAudience,
      inventory: selectedInventory,
    },
  };
}

describe("Product Control cart selection authority", () => {
  it("returns the exact existing selector verdict for canonical source facts", async () => {
    const { authority, reads, facts } = harness();
    const result = await authority.select(REQUEST);
    expect(result).toEqual(
      selectCartProduct(REQUEST, {
        products: [facts.product!],
        variants: facts.product!.variants,
        prices: facts.product!.prices,
        media: facts.product!.media,
        requiredInputs: facts.inputs,
        readiness: facts.readiness,
        audienceEligibility: facts.audience,
        inventoryEligibility: facts.inventory.inventory,
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      selection: {
        productId: "product-a",
        variantId: "variant-a",
        price: { id: "price-a", amountCents: 14900 },
      },
    });
    expect(reads.product).toHaveBeenCalledTimes(1);
    expect(reads.inputs).toHaveBeenCalledTimes(1);
    expect(reads.readiness).toHaveBeenCalledTimes(1);
    expect(reads.audience).toHaveBeenCalledTimes(1);
    expect(reads.inventory).toHaveBeenCalledTimes(1);
  });

  it("returns preliminary failures without reading inventory", async () => {
    const cases = [
      {
        expected: "product_missing",
        build: () => harness({ product: null }),
      },
      {
        expected: "price_missing",
        build: () => {
          const value = product();
          value.prices = [];
          return harness({ product: value });
        },
      },
      {
        expected: "audience_identity_mismatch",
        build: () => harness({ audience: audience({ audience: "wholesale" }) }),
      },
      {
        expected: "required_inputs_incomplete",
        build: () => harness({ inputs: inputs().slice(0, -1) }),
      },
    ] as const;

    for (const { expected, build } of cases) {
      const { authority, reads } = build();
      await expect(authority.select(REQUEST)).resolves.toEqual({
        ok: false,
        code: expected,
      });
      expect(reads.inventory).not.toHaveBeenCalled();
    }
  });

  it("rejects malformed selection requests before reading Product Control", async () => {
    const { authority, reads } = harness();
    await expect(
      authority.select({ ...REQUEST, productId: "" }),
    ).resolves.toEqual({ ok: false, code: "invalid_request" });
    expect(reads.product).not.toHaveBeenCalled();
    expect(reads.inputs).not.toHaveBeenCalled();
    expect(reads.readiness).not.toHaveBeenCalled();
    expect(reads.audience).not.toHaveBeenCalled();
    expect(reads.inventory).not.toHaveBeenCalled();
  });

  it("preserves exact inventory identity and availability failures", async () => {
    const mismatched = harness({
      inventory: inventory({ variantId: "variant-b" }),
    });
    await expect(mismatched.authority.select(REQUEST)).resolves.toEqual({
      ok: false,
      code: "inventory_identity_mismatch",
    });

    const unavailable = harness({
      inventory: inventory({
        state: "unavailable",
        reason: "internal lot detail that must not escape",
      }),
    });
    const result = await unavailable.authority.select(REQUEST);
    expect(result).toEqual({ ok: false, code: "inventory_unavailable" });
    expect(JSON.stringify(result)).not.toContain("internal lot detail");
  });

  it("does not let the requested audience override server authorization", async () => {
    const { authority, reads } = harness();
    await expect(
      authority.select({ ...REQUEST, audience: "wholesale" }),
    ).resolves.toEqual({ ok: false, code: "audience_identity_mismatch" });
    expect(reads.inventory).not.toHaveBeenCalled();

    const stale = harness({
      audience: audience({ evaluatedAt: "2026-08-14T18:59:59.000Z" }),
    });
    await expect(stale.authority.select(REQUEST)).resolves.toEqual({
      ok: false,
      code: "audience_unauthorized",
    });
    expect(stale.reads.inventory).not.toHaveBeenCalled();
  });

  it("memoizes governance and exact inventory facts for one request lifetime", async () => {
    const { authority, reads } = harness();
    const first = await authority.select(REQUEST);
    const second = await authority.select(REQUEST);
    expect(second).toEqual(first);
    expect(reads.inputs).toHaveBeenCalledTimes(1);
    expect(reads.readiness).toHaveBeenCalledTimes(1);
    expect(reads.audience).toHaveBeenCalledTimes(1);
    expect(reads.inventory).toHaveBeenCalledTimes(1);
  });

  it("propagates infrastructure failures for the outer resolver to fail closed", async () => {
    const failure = new Error("product-control-unavailable");
    const authority = createProductControlCartSelectionAuthority({
      products: {
        readProductForPricing: vi.fn(async () => {
          throw failure;
        }),
      },
      requiredInputs: {
        list: vi.fn(async () => inputs()),
        readinessAll: vi.fn(async () => readiness()),
      },
      inventory: {
        readVariantInventoryFacts: vi.fn(async () => inventory()),
      },
      audienceEligibility: () => audience(),
    });
    await expect(authority.select(REQUEST)).rejects.toBe(failure);
  });

  it("projects no private Product Control, inventory, or readiness fields", async () => {
    const { authority } = harness();
    const serialized = JSON.stringify(await authority.select(REQUEST));
    for (const privateValue of [
      "private/product-a.webp",
      "private-filename.webp",
      "Private approval note",
      "admin-internal",
      "reviewer-internal",
      "private-lot-evidence",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });
});

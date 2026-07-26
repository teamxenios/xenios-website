import { describe, expect, it } from "vitest";
import { PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS } from "@shared/research/product-admin";
import type {
  CartProductSelectionRequest,
  CartProductSelectionSource,
} from "@shared/research/cart-product-selection";
import type { DomainReadiness, RequiredInput } from "@shared/research/required-inputs";
import { selectCartProduct } from "./cart-product-selection";

const AT = "2026-07-26T22:00:00.000Z";
const request: CartProductSelectionRequest = {
  productId: "product-a",
  variantId: "variant-a",
  audience: "member",
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

function source(): CartProductSelectionSource {
  return {
    products: [
      {
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
      },
    ],
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
        effectiveAt: "2026-07-01T00:00:00.000Z",
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
        sizeBytes: 100,
        altText: "Product A",
        sortOrder: 0,
        approvedBy: "reviewer",
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    requiredInputs: requiredInputs(),
    readiness: [readiness("product_content"), readiness("products")],
    audienceEligibility: {
      audience: "member",
      state: "authorized",
      sourceVersion: "account-tier-v1",
      evaluatedAt: AT,
    },
    inventoryEligibility: {
      productId: "product-a",
      variantId: "variant-a",
      state: "eligible",
      reason: null,
      sourceVersion: "inventory-v1",
      evaluatedAt: AT,
    },
  };
}

describe("Website 3 cart product selection", () => {
  it("fails closed when the exact product, variant, price, or inventory fact is missing", () => {
    const missingProduct = source();
    missingProduct.products = [];
    expect(selectCartProduct(request, missingProduct)).toEqual({
      ok: false,
      code: "product_missing",
    });

    const missingVariant = source();
    missingVariant.variants = [];
    expect(selectCartProduct(request, missingVariant)).toEqual({
      ok: false,
      code: "variant_missing",
    });

    const missingPrice = source();
    missingPrice.prices = [];
    expect(selectCartProduct(request, missingPrice)).toEqual({
      ok: false,
      code: "price_missing",
    });

    const missingInventory = source();
    missingInventory.inventoryEligibility = null;
    expect(selectCartProduct(request, missingInventory)).toEqual({
      ok: false,
      code: "inventory_eligibility_missing",
    });
  });

  it("selects the same exact identities regardless of source ordering", () => {
    const first = source();
    first.products.push({ ...first.products[0], id: "product-b" });
    first.variants.push({
      ...first.variants[0],
      id: "variant-b",
      productId: "product-b",
      sku: "SKU-B",
    });
    first.prices.push({
      ...first.prices[0],
      id: "price-b",
      productId: "product-b",
      variantId: "variant-b",
    });
    first.media.push({
      ...first.media[0],
      id: "media-b",
      productId: "product-b",
    });
    const reversed: CartProductSelectionSource = {
      ...first,
      products: [...first.products].reverse(),
      variants: [...first.variants].reverse(),
      prices: [...first.prices].reverse(),
      media: [...first.media].reverse(),
      requiredInputs: [...first.requiredInputs].reverse(),
      readiness: [...first.readiness].reverse(),
    };

    expect(selectCartProduct(request, first)).toEqual(
      selectCartProduct(request, reversed),
    );
    expect(selectCartProduct(request, first)).toMatchObject({
      ok: true,
      selection: {
        productId: "product-a",
        variantId: "variant-a",
        sku: "SKU-A",
        price: { id: "price-a", version: 2 },
        media: { id: "media-a" },
      },
    });
  });

  it("fails closed when the exact variant belongs to another product", () => {
    const value = source();
    value.variants[0] = { ...value.variants[0], productId: "product-b" };
    expect(selectCartProduct(request, value)).toEqual({
      ok: false,
      code: "variant_product_mismatch",
    });
  });

  it.each([
    ["draft", true, "variant_unapproved"],
    ["archived", false, "variant_unapproved"],
    ["approved", false, "variant_inactive"],
  ] as const)(
    "rejects %s/%s variant lifecycle state",
    (status, active, code) => {
      const value = source();
      value.variants[0] = { ...value.variants[0], status, active };
      expect(selectCartProduct(request, value)).toEqual({ ok: false, code });
    },
  );

  it("requires a purchase-only, server-authorized audience and member eligibility", () => {
    const memberIneligible = source();
    memberIneligible.variants[0] = {
      ...memberIneligible.variants[0],
      memberEligible: false,
    };
    expect(selectCartProduct(request, memberIneligible)).toEqual({
      ok: false,
      code: "member_variant_ineligible",
    });

    const compareAt = {
      ...request,
      audience: "compare_at",
    } as unknown as CartProductSelectionRequest;
    expect(selectCartProduct(compareAt, source())).toEqual({
      ok: false,
      code: "invalid_request",
    });

    for (const audience of ["professional", "wholesale"] as const) {
      const unauthorized = source();
      unauthorized.audienceEligibility = {
        audience,
        state: "unauthorized",
        sourceVersion: "account-tier-v1",
        evaluatedAt: AT,
      };
      expect(
        selectCartProduct(
          { ...request, audience },
          unauthorized,
        ),
      ).toEqual({ ok: false, code: "audience_unauthorized" });
    }
  });

  it("rejects unapproved, future, expired, and ambiguous prices", () => {
    const unapproved = source();
    unapproved.prices[0] = {
      ...unapproved.prices[0],
      status: "approved",
    };
    expect(selectCartProduct(request, unapproved)).toEqual({
      ok: false,
      code: "price_unapproved",
    });

    const future = source();
    future.prices[0] = {
      ...future.prices[0],
      effectiveAt: "2026-08-01T00:00:00.000Z",
    };
    expect(selectCartProduct(request, future)).toEqual({
      ok: false,
      code: "price_stale",
    });

    const expired = source();
    expired.prices[0] = {
      ...expired.prices[0],
      expiresAt: "2026-07-20T00:00:00.000Z",
    };
    expect(selectCartProduct(request, expired)).toEqual({
      ok: false,
      code: "price_stale",
    });

    const ambiguous = source();
    ambiguous.prices.push({ ...ambiguous.prices[0], id: "price-a-copy" });
    expect(selectCartProduct(request, ambiguous)).toEqual({
      ok: false,
      code: "price_ambiguous",
    });
  });

  it("accepts PostgreSQL timestamptz forms, compares instants, and normalizes the projection", () => {
    const value = source();
    value.prices[0] = {
      ...value.prices[0],
      effectiveAt: "2026-07-01T00:00:00.123456+00:00",
      expiresAt: "2026-08-01T01:02:03.654321+00:00",
    };
    value.audienceEligibility = {
      ...value.audienceEligibility!,
      evaluatedAt: "2026-07-27T00:00:00+02:00",
    };
    value.inventoryEligibility = {
      ...value.inventoryEligibility!,
      evaluatedAt: "2026-07-26T18:00:00-04:00",
    };

    expect(
      selectCartProduct(
        { ...request, evaluatedAt: "2026-07-26T22:00:00+00:00" },
        value,
      ),
    ).toMatchObject({
      ok: true,
      selection: {
        price: {
          effectiveAt: "2026-07-01T00:00:00.123Z",
          expiresAt: "2026-08-01T01:02:03.654Z",
        },
        audienceEligibility: {
          evaluatedAt: "2026-07-26T22:00:00.000Z",
        },
        inventoryEligibility: {
          evaluatedAt: "2026-07-26T22:00:00.000Z",
        },
        evaluatedAt: "2026-07-26T22:00:00.000Z",
      },
    });
  });

  it.each([
    "2026-02-30T22:00:00+00:00",
    "2026-07-26T22:00:00+24:00",
    "2026-07-26T22:00:00+00:60",
  ])("rejects invalid RFC3339/PostgreSQL timestamp %s", (evaluatedAt) => {
    expect(selectCartProduct({ ...request, evaluatedAt }, source())).toEqual({
      ok: false,
      code: "invalid_request",
    });
  });

  it("requires the exact per-product canonical input set and current manifests", () => {
    const wrongRecord = source();
    wrongRecord.requiredInputs = requiredInputs("product-b");
    expect(selectCartProduct(request, wrongRecord)).toEqual({
      ok: false,
      code: "required_inputs_incomplete",
    });

    const truncated = source();
    truncated.requiredInputs = truncated.requiredInputs.slice(0, -1);
    expect(selectCartProduct(request, truncated)).toEqual({
      ok: false,
      code: "required_inputs_incomplete",
    });

    const staleManifest = source();
    staleManifest.readiness[0] = {
      ...staleManifest.readiness[0],
      actualInputCount: 1,
    };
    expect(selectCartProduct(request, staleManifest)).toEqual({
      ok: false,
      code: "readiness_incomplete",
    });
  });

  it("requires revalidatable canonical input and readiness identities", () => {
    const invalidInputs = [
      (inputs: RequiredInput[]) => {
        inputs[0] = { ...inputs[0], id: "" };
      },
      (inputs: RequiredInput[]) => {
        inputs[1] = { ...inputs[1], id: inputs[0].id };
      },
      (inputs: RequiredInput[]) => {
        inputs[0] = { ...inputs[0], version: 0 };
      },
      (inputs: RequiredInput[]) => {
        inputs[0] = { ...inputs[0], version: -1 };
      },
      (inputs: RequiredInput[]) => {
        inputs[0] = { ...inputs[0], version: 1.5 };
      },
    ];
    for (const corrupt of invalidInputs) {
      const value = source();
      const inputs = [...value.requiredInputs];
      corrupt(inputs);
      value.requiredInputs = inputs;
      expect(selectCartProduct(request, value)).toEqual({
        ok: false,
        code: "required_inputs_incomplete",
      });
    }

    const blankDomain = source();
    blankDomain.readiness[0] = { ...blankDomain.readiness[0], domain: "" };
    expect(selectCartProduct(request, blankDomain)).toEqual({
      ok: false,
      code: "readiness_incomplete",
    });

    const duplicateDomain = source();
    duplicateDomain.readiness.push({ ...duplicateDomain.readiness[0] });
    expect(selectCartProduct(request, duplicateDomain)).toEqual({
      ok: false,
      code: "readiness_incomplete",
    });

    for (const version of [0, -1, 1.5]) {
      const value = source();
      value.readiness[0] = { ...value.readiness[0], version };
      expect(selectCartProduct(request, value)).toEqual({
        ok: false,
        code: "readiness_incomplete",
      });
    }
  });

  it("requires exact injected inventory identity and eligibility", () => {
    const crossProduct = source();
    crossProduct.inventoryEligibility = {
      ...crossProduct.inventoryEligibility!,
      productId: "product-b",
    };
    expect(selectCartProduct(request, crossProduct)).toEqual({
      ok: false,
      code: "inventory_identity_mismatch",
    });

    const unavailable = source();
    unavailable.inventoryEligibility = {
      ...unavailable.inventoryEligibility!,
      state: "unavailable",
      reason: "No eligible inventory.",
    };
    expect(selectCartProduct(request, unavailable)).toEqual({
      ok: false,
      code: "inventory_unavailable",
    });

    const leaking = source();
    leaking.inventoryEligibility = {
      ...leaking.inventoryEligibility!,
      reason: "lot LOT-1 at internal location 42, quantity 9, provider secret",
    };
    expect(selectCartProduct(request, leaking)).toEqual({
      ok: false,
      code: "inventory_unavailable",
    });

    const stale = source();
    stale.inventoryEligibility = {
      ...stale.inventoryEligibility!,
      evaluatedAt: "2026-07-26T21:59:59.000Z",
    };
    expect(selectCartProduct(request, stale)).toEqual({
      ok: false,
      code: "inventory_unavailable",
    });
  });
});

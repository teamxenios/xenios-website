import { describe, expect, it } from "vitest";
import { PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS } from "@shared/research/product-admin";
import type { AdminProductDetail } from "@shared/research/product-admin";
import type {
  MemberCatalogProjectionSource,
} from "@shared/research/member-catalog";
import type { DomainReadiness, RequiredInput } from "@shared/research/required-inputs";
import {
  MemberCatalogProjectionError,
  projectMemberCatalog,
  projectMemberProductDetail,
  type MemberCatalogProjectionInput,
} from "./member-catalog-projection";

const AT = "2026-07-26T22:00:00+00:00";

function requiredInputs(productId: string): RequiredInput[] {
  return PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS.map((binding, index) => ({
    id: `${productId}-input-${index}`,
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

function product(
  id = "product-a",
  overrides: Partial<AdminProductDetail> = {},
): AdminProductDetail {
  return {
    id,
    productCode: id.toUpperCase(),
    slug: id,
    displayName: id === "product-a" ? "Alpha Research" : "Beta Research",
    canonicalName: id === "product-a" ? "Alpha" : "Beta",
    aliases: id === "product-a" ? ["A-1"] : [],
    lane: "research_material",
    category: id === "product-a" ? "Research" : "Diagnostics",
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
    updatedAt: id === "product-a" ? AT : "2026-07-25T20:00:00+00:00",
    publishedAt: AT,
    content: {
      shortDescription: `${id} reviewed summary.`,
      longDescription: null,
      overview: "Reviewed overview.",
      specifications: "Reviewed specifications.",
      researchInformation: "Research information.",
      storageInformation: "Storage information.",
      handlingInformation: null,
      shippingInformation: "Shipping information.",
      returnInformation: "Return information.",
      disclaimers: "Research use only.",
      citations: [],
      reviewDate: "2026-07-20",
    },
    variants: [
      {
        id: `${id}-variant`,
        productId: id,
        sku: `${id.toUpperCase()}-SKU`,
        catalogNumber: null,
        label: "Standard",
        strength: "10 mg",
        size: null,
        format: "Vial",
        presentation: "Single unit",
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
        id: `${id}-price`,
        productId: id,
        variantId: `${id}-variant`,
        audience: "member",
        amountCents: id === "product-a" ? 14900 : 9900,
        currency: "USD",
        effectiveAt: "2026-07-01T00:00:00.123456+00:00",
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
        id: `${id}-media`,
        productId: id,
        kind: "primary_image",
        state: "approved",
        storageKey: `private/${id}.webp`,
        filename: `${id}.webp`,
        contentType: "image/webp",
        sizeBytes: 100,
        altText: `${id} package`,
        sortOrder: 0,
        approvedBy: "reviewer",
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    history: [{ at: AT, action: "published", actor: "admin", detail: null }],
    ...overrides,
  };
}

function source(products: AdminProductDetail[]): MemberCatalogProjectionInput {
  const projectionSource: MemberCatalogProjectionSource = {
    audienceEligibility: {
      audience: "member",
      state: "authorized",
      sourceVersion: "member-tier-v1",
      evaluatedAt: "2026-07-27T00:00:00+02:00",
    },
    inventoryEligibility: products.flatMap((item) =>
      item.variants.map((variant) => ({
        productId: item.id,
        variantId: variant.id,
        state: "eligible" as const,
        reason: null,
        sourceVersion: "inventory-v1",
        evaluatedAt: "2026-07-26T18:00:00-04:00",
      })),
    ),
    mediaPresentations: products.flatMap((item) =>
      item.media.map((media) => ({
        mediaId: media.id,
        productId: item.id,
        href: `https://media.xeniostechnology.com/${media.id}`,
        altText: media.altText,
        sourceVersion: "media-v1",
      })),
    ),
    lotCoaPresentations: products.flatMap((item) =>
      item.variants.map((variant) => ({
        productId: item.id,
        variantId: variant.id,
        state: "verified" as const,
        sourceVersion: "lot-coa-v1",
        evaluatedAt: AT,
      })),
    ),
    evaluatedAt: AT,
    currency: "USD",
  };
  return {
    products,
    requiredInputs: products.flatMap((item) => requiredInputs(item.id)),
    readiness: [readiness("product_content"), readiness("products")],
    source: projectionSource,
  };
}

describe("member catalog projection", () => {
  it("projects only public Product Control facts through exact readiness and cart seams", () => {
    const result = projectMemberCatalog(source([product()]));
    expect(result).toMatchObject({
      audience: "member",
      currency: "USD",
      evaluatedAt: "2026-07-26T22:00:00.000Z",
      items: [
        {
          id: "product-a",
          slug: "product-a",
          displayState: "available",
          price: {
            id: "product-a-price",
            effectiveAt: "2026-07-01T00:00:00.123Z",
          },
          media: {
            href: "https://media.xeniostechnology.com/product-a-media",
          },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /storageKey|private\/product-a|enteredValue|auditHistory/,
    );
  });

  it("fails catalog visibility closed and isolates cross-product operational facts", () => {
    const hidden = product("hidden", { visibility: "hidden" });
    const draft = product("draft", { status: "draft" });
    const input = source([product(), hidden, draft]);
    input.source.inventoryEligibility = [
      {
        ...input.source.inventoryEligibility[0],
        productId: "other-product",
      },
    ];
    const result = projectMemberCatalog(input);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "product-a",
      displayState: "unavailable",
    });

    const duplicateSlug = product("product-b", { slug: "product-a" });
    expect(
      projectMemberCatalog(source([product(), duplicateSlug])).items,
    ).toEqual([]);
  });

  it("supports order-independent search, lane/category filtering, and sort", () => {
    const alpha = product();
    const beta = product("product-b");
    const first = projectMemberCatalog(
      source([beta, alpha]),
      { query: "A-1", lane: "research_material", sort: "name_ascending" },
    );
    const reversed = projectMemberCatalog(
      source([alpha, beta]),
      { query: "A-1", lane: "research_material", sort: "name_ascending" },
    );
    expect(first).toEqual(reversed);
    expect(first.items.map((item) => item.id)).toEqual(["product-a"]);

    expect(
      projectMemberCatalog(source([alpha, beta]), {
        category: "Diagnostics",
        sort: "name_descending",
      }).items.map((item) => item.id),
    ).toEqual(["product-b"]);
  });

  it("renders canonical failures truthfully without exposing technical required-input keys", () => {
    const input = source([product()]);
    input.requiredInputs = input.requiredInputs.slice(1);
    const result = projectMemberCatalog(input);
    expect(result.items[0].displayState).toBe("documentation_pending");
    expect(JSON.stringify(result)).not.toContain("products.sku");
    expect(JSON.stringify(result)).not.toContain("product_content.primary_image");
  });

  it("rejects unsafe or mismatched media presentations", () => {
    const input = source([product()]);
    input.source.mediaPresentations = [
      {
        ...input.source.mediaPresentations[0],
        href: "http://private-storage.local/object",
      },
    ];
    expect(projectMemberCatalog(input).items[0]).toMatchObject({
      media: null,
      selection: null,
      displayState: "documentation_pending",
    });
  });

  it("keeps exact-lot COA requirements fail-closed even when inventory is eligible", () => {
    const input = source([product()]);
    input.source.lotCoaPresentations = [
      {
        ...input.source.lotCoaPresentations[0],
        state: "required",
      },
    ];
    const detail = projectMemberProductDetail(input, "product-a");
    expect(detail?.variants[0]).toMatchObject({
      availability: "available",
      lotCoaState: "required",
      selection: null,
      selectionFailure: "inventory_unavailable",
    });
    expect(detail?.displayState).toBe("unavailable");
  });

  it("keeps GLP/future-clinical records as non-transactional Research catalog states", () => {
    const glp = product("glp-1", {
      displayName: "GLP-1 pathway",
      lane: "future_clinical",
      content: {
        ...product().content,
        shortDescription: "Take a weekly dose for treatment.",
        overview: "Prescribing workflow.",
      },
    });
    const result = projectMemberProductDetail(source([glp]), "glp-1");
    expect(result).toMatchObject({
      displayState: "catalog_only",
      overview: null,
      researchInformation: null,
    });
    expect(result?.variants[0].selection).toBeNull();
    expect(JSON.stringify(result)).not.toContain("weekly dose");
    expect(JSON.stringify(result)).not.toContain("Prescribing workflow");
  });

  it("projects exact detail identity, related products, variants, and lot-COA state", () => {
    const alpha = product();
    const related = product("product-c", { category: alpha.category });
    const result = projectMemberProductDetail(
      source([alpha, related]),
      "PRODUCT-A",
    );
    expect(result).toMatchObject({
      id: "product-a",
      variants: [
        {
          id: "product-a-variant",
          lotCoaState: "verified",
          selection: {
            productId: "product-a",
            variantId: "product-a-variant",
          },
        },
      ],
      relatedProducts: [{ id: "product-c" }],
      readiness: { ready: true, verifiedInputCount: 4 },
    });
    expect(
      projectMemberProductDetail(source([alpha]), "missing"),
    ).toBeNull();
  });

  it("requires a server-authorized audience and canonical evaluation context", () => {
    const input = source([product()]);
    input.source.audienceEligibility = null;
    expect(() => projectMemberCatalog(input)).toThrow(
      MemberCatalogProjectionError,
    );

    const staleAudience = source([product()]);
    staleAudience.source.audienceEligibility = {
      ...staleAudience.source.audienceEligibility!,
      evaluatedAt: "2026-07-26T21:59:59+00:00",
    };
    expect(() => projectMemberCatalog(staleAudience)).toThrow(
      MemberCatalogProjectionError,
    );
  });

  it("fails stale operational availability and lot-COA facts closed", () => {
    const input = source([product()]);
    input.source.inventoryEligibility = [
      {
        ...input.source.inventoryEligibility[0],
        evaluatedAt: "2026-07-26T21:59:59+00:00",
      },
    ];
    input.source.lotCoaPresentations = [
      {
        ...input.source.lotCoaPresentations[0],
        evaluatedAt: "2026-07-26T21:59:59+00:00",
      },
    ];
    const detail = projectMemberProductDetail(input, "product-a");
    expect(detail?.variants[0]).toMatchObject({
      availability: "unavailable",
      lotCoaState: "required",
      selection: null,
    });
  });
});

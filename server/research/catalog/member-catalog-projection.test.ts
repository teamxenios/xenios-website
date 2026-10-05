import { describe, expect, it } from "vitest";
import {
  PRODUCT_COMMERCE_REQUIRED_INPUT_BINDINGS,
  PRODUCT_PRESENTATION_INPUT_BINDINGS,
} from "@shared/research/product-admin";
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
  return PRODUCT_COMMERCE_REQUIRED_INPUT_BINDINGS.map((binding, index) => ({
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

function legacyImageInput(productId: string): RequiredInput {
  return {
    ...requiredInputs(productId)[0],
    ...PRODUCT_PRESENTATION_INPUT_BINDINGS[0],
    id: `${productId}-legacy-image`,
  };
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
        variantId: `${id}-variant`, width: 1024, height: 1024, contentSha256: "a".repeat(64), illustrative: false,
        kind: "primary_image",
        state: "approved",
        storageKey: `${id}/${id}-media/${id}.webp`,
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
        variantId: media.variantId!, width: media.width!, height: media.height!, contentSha256: media.contentSha256!, illustrative: media.illustrative!,
        href: `https://media.xeniostechnology.com/${media.id}`,
        altText: media.altText,
        filename: media.filename,
        sourceVersion: "media-v1",
        policy: "xenios_public_media_v1" as const,
        expiresAt: null,
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
  it("shares exact primary delivery identity across card and detail without changing commerce", () => {
    const input = source([product()]);
    const card = projectMemberCatalog(input).items[0];
    const detail = projectMemberProductDetail(input, "product-a")!;
    expect(card.media).toEqual(detail.media);
    expect(card.media).toMatchObject({ mediaId: "product-a-media", variantId: "product-a-variant",
      contentSha256: "a".repeat(64), width: 1024, height: 1024 });
    const absent = { ...input, source: { ...input.source, mediaPresentations: [] } };
    const noImage = projectMemberCatalog(absent).items[0];
    expect({ ...noImage, media: null }).toEqual({ ...card, media: null });
  });

  it("does not change the default variant to rescue a second-variant image", () => {
    const p = product();
    p.variants.push({ ...p.variants[0], id: "variant-b", sku: "VARIANT-B", label: "Second variant", sortOrder: 2 });
    const baseline = projectMemberProductDetail(source([p]), "product-a")!;
    p.media[0] = { ...p.media[0], variantId: "variant-b" };
    const input = source([p]);
    const card = projectMemberCatalog(input).items[0];
    const detail = projectMemberProductDetail(input, "product-a")!;
    expect(card.media).toBeNull();
    expect(detail.media).toBeNull();
    expect(detail.variants[0].id).toBe("product-a-variant");
    expect({ ...detail, media: null }).toEqual({ ...baseline, media: null });
  });

  it("does not rescue a malformed approved-primary or presentation duplicate", () => {
    const p = product();
    const mixed = { ...p, media: [...p.media, { ...p.media[0], id: "duplicate", width: null }] };
    expect(projectMemberCatalog(source([mixed])).items[0].media).toBeNull();
    const input = source([p]);
    input.source.mediaPresentations = [...input.source.mediaPresentations,
      { ...input.source.mediaPresentations[0], contentSha256: "bad" }];
    expect(projectMemberCatalog(input).items[0].media).toBeNull();
  });

  it("withholds images for variants hidden from the member surface", () => {
    const p = product();
    for (const hidden of [
      { ...p, variants: p.variants.map((variant) => ({ ...variant, memberEligible: false })) },
      { ...p, lane: "future_clinical" as const },
      { ...p, lane: "non_product_program" as const },
    ]) {
      const result = projectMemberCatalog(source([hidden]));
      expect(result.items).toHaveLength(1);
      expect(result.items[0].media).toBeNull();
    }
  });

  it("rejects width, height, hash and exact-variant mismatches without changing product truth", () => {
    const baseline = projectMemberCatalog(source([product()])).items[0];
    for (const change of [{ width: 512 }, { height: 768 }, { contentSha256: "bad" },
      { variantId: "foreign-variant" }, { illustrative: null }, { altText: "x".repeat(501) }]) {
      const p = product(); p.media[0] = { ...p.media[0], ...change };
      const result = projectMemberCatalog(source([p])).items[0];
      expect(result.media).toBeNull();
      expect({ ...result, media: null }).toEqual({ ...baseline, media: null });
    }
  });
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
          // Catalog facts remain visible, but this synchronous projection has
          // no request-time durable activation lookup and therefore cannot
          // advertise an orderable state or mint a selection.
          displayState: "unavailable",
          readiness: null,
          selection: null,
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
    input.requiredInputs = input.requiredInputs.filter(
      ({ key }) => key !== "products.family",
    );
    const result = projectMemberCatalog(input);
    expect(result.items).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("PRODUCT-A-SKU");
    expect(JSON.stringify(result)).not.toContain("products.sku");
    expect(JSON.stringify(result)).not.toContain("product_content.primary_image");
  });

  it("suppresses each commerce-required field before member projection", () => {
    const unresolvedStates = [
      "missing",
      "rejected",
      "expired",
      "superseded",
    ] as const;
    for (const state of unresolvedStates) {
      const family = source([product()]);
      family.requiredInputs = family.requiredInputs.map((item) =>
        item.key === "products.family"
          ? { ...item, currentState: state }
          : item,
      );
      expect(projectMemberCatalog(family).items).toEqual([]);
      expect(projectMemberProductDetail(family, "product-a")).toBeNull();

      const sku = source([product()]);
      sku.requiredInputs = sku.requiredInputs.map((item) =>
        item.key === "products.sku" ? { ...item, currentState: state } : item,
      );
      const skuDetail = projectMemberProductDetail(sku, "product-a");
      if (state === "superseded") {
        expect(skuDetail).toBeNull();
      } else {
        expect(skuDetail?.variants).toEqual([]);
      }
      expect(JSON.stringify(skuDetail)).not.toContain("PRODUCT-A-SKU");

      const storage = source([product()]);
      storage.requiredInputs = storage.requiredInputs.map((item) =>
        item.key === "product_content.storage_information"
          ? { ...item, currentState: state }
          : item,
      );
      if (state === "superseded") {
        expect(projectMemberProductDetail(storage, "product-a")).toBeNull();
      } else {
        expect(
          projectMemberProductDetail(
            storage,
            "product-a",
          )?.storageInformation,
        ).toBeNull();
      }
      expect(JSON.stringify(projectMemberProductDetail(storage, "product-a")))
        .not.toContain("Storage information.");
    }

    const crossProduct = source([product()]);
    crossProduct.requiredInputs = crossProduct.requiredInputs.map((item) => ({
      ...item,
      recordId: "product-b",
    }));
    expect(projectMemberCatalog(crossProduct).items).toEqual([]);

    const duplicate = source([product()]);
    duplicate.requiredInputs = [
      ...duplicate.requiredInputs,
      { ...duplicate.requiredInputs[0], id: "duplicate-input" },
    ];
    expect(projectMemberProductDetail(duplicate, "product-a")).toBeNull();

    const invalidVersion = source([product()]);
    invalidVersion.requiredInputs = invalidVersion.requiredInputs.map(
      (item) =>
        item.key === "products.family" ? { ...item, version: 0 } : item,
    );
    expect(projectMemberCatalog(invalidVersion).items).toEqual([]);

    const unverifiedMetadata = source([product()]);
    unverifiedMetadata.requiredInputs =
      unverifiedMetadata.requiredInputs.map((item) =>
        item.key === "product_content.storage_information"
          ? { ...item, verifiedAt: null }
          : item,
      );
    expect(
      projectMemberProductDetail(
        unverifiedMetadata,
        "product-a",
      )?.storageInformation,
    ).toBeNull();

    const futureVerified = source([product()]);
    futureVerified.requiredInputs = futureVerified.requiredInputs.map(
      (item) =>
        item.key === "product_content.storage_information"
          ? {
              ...item,
              verifiedAt: "2026-07-26T22:00:00.000001+00:00",
            }
          : item,
    );
    const futureDetail = projectMemberProductDetail(
      futureVerified,
      "product-a",
    );
    expect(futureDetail?.storageInformation).toBeNull();
    expect(futureDetail?.selection).toBeNull();
    expect(futureDetail?.variants[0]?.selection).toBeNull();

    const reusedId = source([product()]);
    reusedId.requiredInputs = reusedId.requiredInputs.map((item, index) =>
      index === 1 ? { ...item, id: reusedId.requiredInputs[0].id } : item,
    );
    expect(projectMemberCatalog(reusedId).items).toEqual([]);
    expect(projectMemberProductDetail(reusedId, "product-a")).toBeNull();

    const extraDisplayInput = source([product()]);
    extraDisplayInput.requiredInputs = [
      ...extraDisplayInput.requiredInputs,
      {
        ...extraDisplayInput.requiredInputs[0],
        id: "unexpected-display-input",
        key: "product_content.unreviewed",
      },
    ];
    expect(projectMemberCatalog(extraDisplayInput).items).toEqual([]);
    expect(
      projectMemberProductDetail(extraDisplayInput, "product-a"),
    ).toBeNull();

    const downgradedCanonical = source([product()]);
    downgradedCanonical.requiredInputs =
      downgradedCanonical.requiredInputs.map((item) =>
        item.key === "products.family"
          ? { ...item, blockingLevel: "informational" }
          : item,
      );
    expect(projectMemberCatalog(downgradedCanonical).items).toEqual([]);
    expect(
      projectMemberProductDetail(downgradedCanonical, "product-a"),
    ).toBeNull();

    const notApplicable = source([product()]);
    notApplicable.requiredInputs = notApplicable.requiredInputs.map((item) => ({
      ...item,
      currentState: "not_applicable",
      verifiedBy: null,
      verifiedAt: null,
    }));
    expect(projectMemberProductDetail(notApplicable, "product-a")).toMatchObject({
      media: { mediaId: "product-a-media" },
      storageInformation: "Storage information.",
      variants: [{ sku: "PRODUCT-A-SKU" }],
    });
  });

  it("keeps catalog facts and real holds invariant across unusable media", () => {
    const base = source([product()]);
    const baseline = projectMemberProductDetail(base, "product-a")!;
    const expected = { ...baseline, media: null };
    const baseMedia = base.products[0].media[0];
    const cases: MemberCatalogProjectionInput[] = [];
    for (const media of [
      undefined,
      null,
      3,
      {},
      [],
      [null],
      [undefined],
      [{}],
      [{ ...baseMedia, id: null }],
      [{ ...baseMedia, altText: null }],
      [{ ...baseMedia, filename: 42 }],
      [{ ...baseMedia, approvedBy: {} }],
      [{ ...baseMedia, state: "rejected" }],
      [{ ...baseMedia, state: "pending_upload" }],
      [baseMedia, { ...baseMedia, id: "ambiguous-media" }],
    ]) {
      const input = source([product()]);
      input.products[0].media = media as unknown as AdminProductDetail["media"];
      cases.push(input);
    }
    const basePresentation = base.source.mediaPresentations[0];
    for (const presentations of [
      undefined,
      null,
      {},
      [],
      [null],
      [{}],
      [{ ...basePresentation, altText: null }],
      [{ ...basePresentation, sourceVersion: null }],
      [{ ...basePresentation, href: {} }],
      [{ ...basePresentation, href: "https://tracking.example.com/object" }],
      [basePresentation, basePresentation],
    ]) {
      const input = source([product()]);
      input.source.mediaPresentations = presentations as unknown as
        MemberCatalogProjectionSource["mediaPresentations"];
      cases.push(input);
    }
    for (const input of cases) {
      expect(projectMemberProductDetail(input, "product-a")).toEqual(expected);
      const catalog = projectMemberCatalog(input);
      expect(catalog.items).toHaveLength(1);
      expect(catalog.items[0]).toMatchObject({
        id: "product-a",
        media: null,
        price: baseline.price,
        displayState: baseline.displayState,
      });
      expect(catalog.items[0].displayState).not.toBe("documentation_pending");
    }
  });

  it("ignores absent, malformed, duplicate and unresolved legacy image inputs", () => {
    const baseline = projectMemberProductDetail(source([product()]), "product-a");
    for (const currentState of [
      "verified", "missing", "rejected", "expired", "superseded",
    ] as const) {
      const input = source([product()]);
      input.requiredInputs = [
        ...input.requiredInputs,
        { ...legacyImageInput("product-a"), currentState },
      ];
      expect(projectMemberProductDetail(input, "product-a")).toEqual(baseline);
    }
    const input = source([product()]);
    input.requiredInputs = [
      ...input.requiredInputs,
      legacyImageInput("product-a"),
      {
        ...legacyImageInput("product-a"),
        id: "duplicate-legacy-image",
        domain: "malformed-domain",
        recordType: "malformed-record-type",
        version: 0,
      },
    ];
    expect(projectMemberProductDetail(input, "product-a")).toEqual(baseline);
    input.requiredInputs = input.requiredInputs.filter(
      ({ key }) => key !== "products.family",
    );
    expect(projectMemberProductDetail(input, "product-a")).toBeNull();
  });

  it("rejects unsafe or mismatched media presentations without changing product state", () => {
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
      displayState: "unavailable",
    });

    for (const href of [
      "https://tracking.example.com/object",
      "https://user:password@media.xeniostechnology.com/object",
      "https://media.xeniostechnology.com/object#fragment",
      "https://media.xeniostechnology.com/object?token=secret",
    ]) {
      const unsafe = source([product()]);
      unsafe.source.mediaPresentations = [
        { ...unsafe.source.mediaPresentations[0], href },
      ];
      expect(projectMemberCatalog(unsafe).items[0].media).toBeNull();
    }

    const staleSigned = source([product()]);
    staleSigned.source.mediaPresentations = [
      {
        ...staleSigned.source.mediaPresentations[0],
        href: "https://yvzeduaxbwgcwllhywff.supabase.co/storage/v1/object/sign/research-product-media-production/product-a/product-a-media/product-a.webp?token=header.payload.signature",
        policy: "xenios_signed_storage_v1",
        expiresAt: "2026-07-26T21:59:59+00:00",
      },
    ];
    expect(projectMemberCatalog(staleSigned).items[0].media).toBeNull();

    const unknownSignedQuery = source([product()]);
    unknownSignedQuery.source.mediaPresentations = [
      {
        ...unknownSignedQuery.source.mediaPresentations[0],
        href: "https://yvzeduaxbwgcwllhywff.supabase.co/storage/v1/object/sign/research-product-media-production/product-a/product-a-media/product-a.webp?token=header.payload.signature&download=1",
        policy: "xenios_signed_storage_v1",
        expiresAt: "2026-07-26T22:05:00+00:00",
      },
    ];
    expect(projectMemberCatalog(unknownSignedQuery).items[0].media).toBeNull();

    for (const expiresAt of [
      "2026-07-26T22:05:00.000001+00:00",
      "2099-01-01T00:00:00+00:00",
    ]) {
      const overlongSigned = source([product()]);
      overlongSigned.source.mediaPresentations = [
        {
          ...overlongSigned.source.mediaPresentations[0],
          href: "https://yvzeduaxbwgcwllhywff.supabase.co/storage/v1/object/sign/research-product-media-production/product-a/product-a-media/product-a.webp?token=header.payload.signature",
          policy: "xenios_signed_storage_v1",
          expiresAt,
        },
      ];
      expect(projectMemberCatalog(overlongSigned).items[0].media).toBeNull();
    }

    for (const path of [
      "private-coa/product-a/product-a-media/product-a.webp",
      "research-product-media/product-a/product-a-media/product-a.webp",
      "research-product-media-production/product-b/product-a-media/product-a.webp",
      "research-product-media-production/product-a/other-media/product-a.webp",
      "research-product-media-production/product-a/product-a-media/%2e%2e%2fproduct-a.webp",
    ]) {
      const wrongObject = source([product()]);
      wrongObject.source.mediaPresentations = [
        {
          ...wrongObject.source.mediaPresentations[0],
          href: `https://yvzeduaxbwgcwllhywff.supabase.co/storage/v1/object/sign/${path}?token=header.payload.signature`,
          policy: "xenios_signed_storage_v1",
          expiresAt: "2026-07-26T22:05:00+00:00",
        },
      ];
      expect(projectMemberCatalog(wrongObject).items[0].media).toBeNull();
    }

    const validSigned = source([product()]);
    validSigned.source.mediaPresentations = [
      {
        ...validSigned.source.mediaPresentations[0],
        href: "https://yvzeduaxbwgcwllhywff.supabase.co/storage/v1/object/sign/research-product-media-production/product-a/product-a-media/product-a.webp?token=header.payload.signature",
        policy: "xenios_signed_storage_v1",
        expiresAt: "2026-07-26T22:05:00+00:00",
      },
    ];
    expect(projectMemberCatalog(validSigned).items[0].media).toMatchObject({
      policy: "xenios_signed_storage_v1",
      expiresAt: "2026-07-26T22:05:00.000Z",
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

    for (const facts of [
      [
        {
          ...input.source.lotCoaPresentations[0],
          state: "passed" as never,
        },
      ],
      [
        input.source.lotCoaPresentations[0],
        { ...input.source.lotCoaPresentations[0] },
      ],
      [
        {
          ...input.source.lotCoaPresentations[0],
          evaluatedAt: "2026-07-26T21:59:59+00:00",
        },
      ],
      [
        {
          ...input.source.lotCoaPresentations[0],
          productId: "other-product",
        },
      ],
    ]) {
      const adversarial = source([product()]);
      adversarial.source.lotCoaPresentations = facts;
      expect(
        projectMemberProductDetail(adversarial, "product-a")?.variants[0],
      ).toMatchObject({
        lotCoaState: "required",
        selection: null,
      });
    }
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
      price: null,
      selection: null,
      variants: [],
      variantCount: 0,
      overview: null,
      researchInformation: null,
      researchOnlyBoundary: true,
    });
    expect(JSON.stringify(result)).not.toContain("GLP-1-SKU");
    expect(JSON.stringify(result)).not.toContain("10 mg");
    expect(JSON.stringify(result)).not.toContain("14900");
    expect(JSON.stringify(result)).not.toContain("weekly dose");
    expect(JSON.stringify(result)).not.toContain("Prescribing workflow");
  });

  it("projects exact detail identity and lot-COA state without minting purchase authority", () => {
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
          selection: null,
          selectionFailure: "activation_authority_missing",
        },
      ],
      relatedProducts: [{ id: "product-c" }],
      readiness: null,
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

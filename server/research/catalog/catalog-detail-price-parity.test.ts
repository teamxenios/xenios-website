/**
 * XCA-W8 cross-lane assembly, Task 1: catalog-detail price parity.
 *
 * The composition risk: the member catalog card and the member product detail
 * page are two projections over the same Product Control facts, and the
 * pricing lane's AuthoritativePriceResolver is a third consumer of the same
 * facts. If any of the three ever disagreed on which price row is current
 * (id, version, amount) for the same instant and audience, a member could see
 * one number on the card and be charged another at the detail or cart step.
 *
 * This suite runs ONE AdminProductDetail fixture with ONE approved active
 * price through the REAL projectMemberCatalog and projectMemberProductDetail
 * (member-catalog-projection module, imported read-only) and through the REAL
 * AuthoritativePriceResolver, and asserts all three agree exactly on
 * id, version, and amountCents for the same instant and audience.
 */

import { describe, expect, it } from "vitest";
import { PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS } from "@shared/research/product-admin";
import type { AdminProductDetail } from "@shared/research/product-admin";
import type { MemberCatalogProjectionSource } from "@shared/research/member-catalog";
import type {
  DomainReadiness,
  RequiredInput,
} from "@shared/research/required-inputs";
import {
  projectMemberCatalog,
  projectMemberProductDetail,
  type MemberCatalogProjectionInput,
} from "./member-catalog-projection";
import {
  authorizeAudienceFromServerIdentity,
  createAuthoritativePriceResolver,
  type PricingProductSource,
} from "../pricing/authoritative-price-resolver";

const AT = "2026-07-29T12:00:00+00:00";
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VARIANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRICE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PRICE_VERSION = 3;
const PRICE_AMOUNT_CENTS = 15900;
const SLUG = "parity-product";

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

function parityProduct(): AdminProductDetail {
  return {
    id: PRODUCT_ID,
    productCode: "PARITY-A",
    slug: SLUG,
    displayName: "Parity Research",
    canonicalName: "Parity",
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
      shortDescription: "Parity fixture summary.",
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
        id: VARIANT_ID,
        productId: PRODUCT_ID,
        sku: "PARITY-SKU-A",
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
        id: PRICE_ID,
        productId: PRODUCT_ID,
        variantId: VARIANT_ID,
        audience: "member",
        amountCents: PRICE_AMOUNT_CENTS,
        currency: "USD",
        effectiveAt: "2026-07-01T00:00:00+00:00",
        expiresAt: null,
        status: "active",
        approvalNote: "Approved",
        version: PRICE_VERSION,
        createdBy: "admin",
        approvedBy: "reviewer",
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    media: [
      {
        id: "parity-media",
        productId: PRODUCT_ID,
        kind: "primary_image",
        state: "approved",
        storageKey: `${PRODUCT_ID}/parity-media/parity.webp`,
        filename: "parity.webp",
        contentType: "image/webp",
        sizeBytes: 100,
        altText: "Parity package",
        sortOrder: 0,
        approvedBy: "reviewer",
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    history: [{ at: AT, action: "published", actor: "admin", detail: null }],
  };
}

function projectionInput(
  product: AdminProductDetail,
): MemberCatalogProjectionInput {
  const source: MemberCatalogProjectionSource = {
    audienceEligibility: {
      audience: "member",
      state: "authorized",
      sourceVersion: "member-tier-v1",
      evaluatedAt: AT,
    },
    inventoryEligibility: [
      {
        productId: product.id,
        variantId: VARIANT_ID,
        state: "eligible",
        reason: null,
        sourceVersion: "inventory-v1",
        evaluatedAt: AT,
      },
    ],
    mediaPresentations: [
      {
        mediaId: "parity-media",
        productId: product.id,
        href: "https://media.xeniostechnology.com/parity-media",
        altText: "Parity package",
        filename: "parity.webp",
        sourceVersion: "media-v1",
        policy: "xenios_public_media_v1",
        expiresAt: null,
      },
    ],
    lotCoaPresentations: [
      {
        productId: product.id,
        variantId: VARIANT_ID,
        state: "verified",
        sourceVersion: "lot-coa-v1",
        evaluatedAt: AT,
      },
    ],
    evaluatedAt: AT,
    currency: "USD",
  };
  return {
    products: [product],
    requiredInputs: requiredInputs(product.id),
    readiness: [readiness("product_content"), readiness("products")],
    source,
  };
}

function fixtureSource(product: AdminProductDetail): PricingProductSource {
  return {
    async readProductForPricing(productId) {
      return productId === product.id ? product : null;
    },
  };
}

describe("catalog-detail price parity (real projections, one fixture)", () => {
  it("projects the same price identity on the catalog card and the detail variant", () => {
    const product = parityProduct();

    const catalog = projectMemberCatalog(projectionInput(product));
    expect(catalog.items).toHaveLength(1);
    const card = catalog.items[0];
    expect(card.id).toBe(PRODUCT_ID);
    expect(card.displayState).toBe("available");
    expect(card.price).not.toBeNull();

    const detail = projectMemberProductDetail(projectionInput(product), SLUG);
    expect(detail).not.toBeNull();
    expect(detail!.variants).toHaveLength(1);
    const detailVariantPrice = detail!.variants[0].price;
    expect(detailVariantPrice).not.toBeNull();

    // The parity contract: same instant, same audience, same price identity.
    expect(catalog.audience).toBe("member");
    expect(detail!.audience).toBe("member");
    expect(catalog.evaluatedAt).toBe(detail!.evaluatedAt);

    const expected = {
      id: PRICE_ID,
      version: PRICE_VERSION,
      amountCents: PRICE_AMOUNT_CENTS,
    };
    expect({
      id: card.price!.id,
      version: card.price!.version,
      amountCents: card.price!.amountCents,
    }).toEqual(expected);
    expect({
      id: detailVariantPrice!.id,
      version: detailVariantPrice!.version,
      amountCents: detailVariantPrice!.amountCents,
    }).toEqual(expected);

    // The detail page's headline price and the card price are the same
    // projection, not merely similar objects.
    expect(detail!.price).toEqual(card.price);
  });

  it("agrees with the real AuthoritativePriceResolver for the same instant and audience", async () => {
    const product = parityProduct();
    const resolver = createAuthoritativePriceResolver(fixtureSource(product));
    const authorized = authorizeAudienceFromServerIdentity({
      audience: "member",
      sourceVersion: "member-tier-v1",
      evaluatedAt: AT,
    });
    expect(authorized).not.toBeNull();

    const resolution = await resolver.resolveApprovedResearchPrice({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      authenticatedAudience: authorized!,
      currency: "USD",
      at: AT,
    });
    expect(resolution.state).toBe("available");
    if (resolution.state !== "available") return;

    const card = projectMemberCatalog(projectionInput(product)).items[0];
    expect(card.price).not.toBeNull();
    expect({
      id: resolution.price.priceId,
      version: resolution.price.version,
      amountCents: resolution.price.amountCents,
    }).toEqual({
      id: card.price!.id,
      version: card.price!.version,
      amountCents: card.price!.amountCents,
    });
    expect(resolution.price.audience).toBe("member");
    expect(resolution.price.currency).toBe("USD");
  });
});

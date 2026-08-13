import { describe, expect, it } from "vitest";

import type { AdminProductDetail } from "@shared/research/product-admin";
import type { EarlyAccessCatalogProjection, EarlyAccessCatalogRow } from "../early-access/catalog/early-access-catalog";
import {
  earlyAccessReleaseVersion,
  InMemoryEarlyAccessReleaseLedger,
} from "../early-access/release/founder-release";
import { ProductControlBuyerCatalog } from "./product-control-catalog";

const NOW = new Date("2026-08-12T19:00:00.000Z");

function product(id: string, lane: AdminProductDetail["lane"]): AdminProductDetail {
  return {
    id,
    productCode: id.toUpperCase(),
    slug: id,
    displayName: `Product ${id}`,
    canonicalName: `Product ${id}`,
    aliases: [],
    lane,
    category: lane === "future_clinical" ? "care" : "peptide",
    classification: "test",
    status: "published",
    active: true,
    visibility: "public",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: NOW.toISOString(),
    publishedAt: NOW.toISOString(),
    content: {
      shortDescription: null,
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
        id: `${id}-variant`,
        productId: id,
        sku: `${id.toUpperCase()}-SKU`,
        catalogNumber: null,
        label: "5 mg vial",
        strength: "5 mg",
        size: null,
        format: null,
        presentation: "vial",
        shippingClass: null,
        memberEligible: true,
        status: "approved",
        active: true,
        sortOrder: 1,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
    prices: [],
    media: [],
    history: [],
  };
}

function row(id: string): EarlyAccessCatalogRow {
  return {
    productId: id,
    slug: id,
    displayName: `Product ${id}`,
    canonicalName: `Product ${id}`,
    variantId: `${id}-variant`,
    sku: `${id.toUpperCase()}-SKU`,
    strength: "5 mg",
    presentation: "vial",
    priceCents: 5_000,
    currency: "USD",
    audience: "private_early_access",
    availability: "available",
    offerState: null,
    description: "Product information confirmed.",
    imageState: "approved",
    quantityLimit: 50,
    supplierReady: true,
    fulfillmentOwner: "xenios",
    disputeStatus: { identity: "cleared", strength: "cleared" },
    purchasable: true,
    blockers: [],
  };
}

describe("Product Control buyer catalog adapter", () => {
  it("projects exact variants and clamps direct authority to the accepted 1-20 release band", async () => {
    const products = [product("direct", "research_material"), product("care", "future_clinical")];
    const projection: EarlyAccessCatalogProjection = {
      evaluatedAt: NOW.toISOString(),
      rows: [row("direct"), row("care")],
      productsWithoutVariants: [],
    };
    const adapter = new ProductControlBuyerCatalog({
      productControl: { readCatalog: async () => products },
      earlyAccess: { load: async () => projection },
      releases: new InMemoryEarlyAccessReleaseLedger(),
    });

    const variants = await adapter.variants({
      customerRef: "eac_0123456789abcdef0123456789abcdef",
      at: NOW,
    });
    expect(variants[0]).toMatchObject({
      offeringId: "direct",
      variantId: "direct-variant",
      category: "peptide",
      directPurchaseAuthorized: true,
      directQuantityLimit: 20,
      directAuthorityBasis: "product_control",
      carePathway: false,
    });
    expect(variants[1]).toMatchObject({
      carePathway: true,
      directPurchaseAuthorized: false,
      directQuantityLimit: null,
      directAuthorityBasis: null,
    });
  });

  it("fails direct authority closed when Product Control identity or its projection is ambiguous", async () => {
    const ambiguousVariant = product("duplicate-variant", "research_material");
    ambiguousVariant.variants.push({ ...ambiguousVariant.variants[0]! });
    const duplicateProduct = product("duplicate-product", "research_material");
    const projection: EarlyAccessCatalogProjection = {
      evaluatedAt: NOW.toISOString(),
      rows: [
        row("duplicate-variant"),
        row("duplicate-product"),
        row("duplicate-product"),
      ],
      productsWithoutVariants: [],
    };
    const adapter = new ProductControlBuyerCatalog({
      productControl: {
        readCatalog: async () => [
          ambiguousVariant,
          duplicateProduct,
          { ...duplicateProduct },
        ],
      },
      earlyAccess: { load: async () => projection },
      releases: new InMemoryEarlyAccessReleaseLedger(),
    });

    const variants = await adapter.variants({
      customerRef: "eac_0123456789abcdef0123456789abcdef",
      at: NOW,
    });
    expect(variants).not.toHaveLength(0);
    expect(variants.every((variant) => variant.directPurchaseAuthorized === false)).toBe(true);
    expect(variants.every((variant) => variant.directQuantityLimit === null)).toBe(true);
  });

  it("uses the most restrictive Product Control, founder-release, and global direct limit", async () => {
    const limited = row("limited");
    limited.purchasable = false;
    limited.quantityLimit = 5;
    limited.blockers = ["DOCUMENTATION_NOT_SATISFIED"];
    const releases = new InMemoryEarlyAccessReleaseLedger();
    const appended = await releases.append({
      releaseId: "rel-limited-001",
      productId: limited.productId,
      variantId: limited.variantId,
      productVersion: earlyAccessReleaseVersion(limited),
      status: "approved",
      approvedPriceCents: 5_000,
      currency: "USD",
      waivedBlockers: [...limited.blockers],
      approvedQuantityLimit: 20,
      expiresAt: null,
      actor: "Samuel Boadu",
      reason: "Founder release for regression coverage.",
      recordedAt: NOW.toISOString(),
    });
    expect(appended.ok).toBe(true);
    const projection: EarlyAccessCatalogProjection = {
      evaluatedAt: NOW.toISOString(),
      rows: [limited],
      productsWithoutVariants: [],
    };
    const adapter = new ProductControlBuyerCatalog({
      productControl: { readCatalog: async () => [product("limited", "research_material")] },
      earlyAccess: { load: async () => projection },
      releases,
    });

    const [projected] = await adapter.variants({
      customerRef: "eac_0123456789abcdef0123456789abcdef",
      at: NOW,
    });
    expect(projected).toMatchObject({
      directPurchaseAuthorized: true,
      directQuantityLimit: 5,
      directAuthorityBasis: "founder_release",
    });
  });
});

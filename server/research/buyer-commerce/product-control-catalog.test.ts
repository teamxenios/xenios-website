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
  it("projects exact variants through the accepted 1-50 normal-order band", async () => {
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
      directQuantityLimit: 50,
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

  it("distinguishes a missing Product Control cap from missing release authority", async () => {
    const releaseNoCap = row("release-no-cap");
    releaseNoCap.purchasable = false;
    releaseNoCap.quantityLimit = null;
    releaseNoCap.blockers = ["DOCUMENTATION_NOT_SATISFIED"];
    const releaseNarrowCap = row("release-narrow-cap");
    releaseNarrowCap.purchasable = false;
    releaseNarrowCap.quantityLimit = 5;
    releaseNarrowCap.blockers = ["DOCUMENTATION_NOT_SATISFIED"];
    const noReleaseNoCap = row("no-release-no-cap");
    noReleaseNoCap.purchasable = false;
    noReleaseNoCap.quantityLimit = null;
    noReleaseNoCap.blockers = ["DOCUMENTATION_NOT_SATISFIED"];
    const noReleaseNumericCap = row("no-release-numeric-cap");
    noReleaseNumericCap.purchasable = false;
    noReleaseNumericCap.quantityLimit = 5;
    noReleaseNumericCap.blockers = ["DOCUMENTATION_NOT_SATISFIED"];

    const releases = new InMemoryEarlyAccessReleaseLedger();
    for (const [index, released] of [releaseNoCap, releaseNarrowCap].entries()) {
      const appended = await releases.append({
        releaseId: `rel-limit-matrix-00${index + 1}`,
        productId: released.productId,
        variantId: released.variantId,
        productVersion: earlyAccessReleaseVersion(released),
        status: "approved",
        approvedPriceCents: 5_000,
        currency: "USD",
        waivedBlockers: [...released.blockers],
        approvedQuantityLimit: 20,
        expiresAt: null,
        actor: "Samuel Boadu",
        reason: "Founder release for quantity authority regression coverage.",
        recordedAt: NOW.toISOString(),
      });
      expect(appended.ok).toBe(true);
    }
    const rows = [releaseNoCap, releaseNarrowCap, noReleaseNoCap, noReleaseNumericCap];
    const projection: EarlyAccessCatalogProjection = {
      evaluatedAt: NOW.toISOString(),
      rows,
      productsWithoutVariants: [],
    };
    const adapter = new ProductControlBuyerCatalog({
      productControl: {
        readCatalog: async () => rows.map((entry) => product(entry.productId, "research_material")),
      },
      earlyAccess: { load: async () => projection },
      releases,
    });

    const projected = await adapter.variants({
      customerRef: "eac_0123456789abcdef0123456789abcdef",
      at: NOW,
    });
    const byOffering = new Map(projected.map((variant) => [variant.offeringId, variant]));
    expect(byOffering.get("release-no-cap")).toMatchObject({
      directPurchaseAuthorized: true,
      directQuantityLimit: 20,
      directAuthorityBasis: "founder_release",
    });
    expect(byOffering.get("release-narrow-cap")).toMatchObject({
      directPurchaseAuthorized: true,
      directQuantityLimit: 5,
      directAuthorityBasis: "founder_release",
    });
    expect(byOffering.get("no-release-no-cap")).toMatchObject({
      directPurchaseAuthorized: false,
      directQuantityLimit: null,
      directAuthorityBasis: null,
    });
    expect(byOffering.get("no-release-numeric-cap")).toMatchObject({
      directPurchaseAuthorized: false,
      directQuantityLimit: null,
      directAuthorityBasis: null,
    });
  });
});

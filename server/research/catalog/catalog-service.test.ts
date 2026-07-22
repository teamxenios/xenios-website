import { describe, expect, it } from "vitest";
import { products as LIVE_PRODUCTS } from "../products-data";
import { adaptLegacyCatalog } from "./legacy-adapter";
import { createCatalogService } from "./catalog-service";
import type { CatalogProduct, ProvenancedFact } from "@shared/research/catalog";

const REVIEWED_ON = "2026-07-20";

// The real shipping catalog, not a fixture. A fixture would only prove the service
// works on data this test authored.
const LIVE_CATALOG = adaptLegacyCatalog(LIVE_PRODUCTS, REVIEWED_ON).products;

function liveService() {
  return createCatalogService({
    products: LIVE_CATALOG,
    commerceEnabled: false,
    quantumCommerceEnabled: false,
  });
}

function confirmed<T>(value: T): ProvenancedFact<T> {
  return {
    value,
    confirmation: "confirmed",
    source: { kind: "supplier_document", reference: "TEST-DOC-1", recordedAt: REVIEWED_ON },
  };
}

/** A product where every gate passes, so the positive path is exercised too. */
function fullyConfirmedProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    sku: "T001",
    slug: "test-confirmed",
    displayName: "Test Confirmed Item",
    lane: "supplement",
    availability: "in_stock",
    commerceApproval: "approved",
    fulfillmentOwner: "xenios",
    facts: {
      composition: confirmed("Single component"),
      strength: confirmed("10 mg"),
      format: confirmed("Capsule"),
      priceCents: confirmed(4900),
      shelfLife: confirmed("24 months"),
      storage: confirmed("Room temperature"),
      coa: confirmed("COA-1"),
    },
    guideState: "guide_published",
    qualityDocumentState: "approved",
    storageDataState: "approved",
    shippingProfileState: "approved",
    goalMappings: ["recover_faster"],
    relatedGuideSlugs: ["test-guide"],
    prohibitedClaims: ["never say this"],
    subscriptionEligible: true,
    lastReviewed: REVIEWED_ON,
    openSupplierQuestions: [],
    ...overrides,
  };
}

describe("price serialization", () => {
  it("serializes an unconfirmed price as null and never as zero", () => {
    const summaries = liveService().listProducts();
    expect(summaries.length).toBeGreaterThan(0);
    for (const summary of summaries) {
      expect(summary.priceCents).toBeNull();
      expect(summary.priceCents).not.toBe(0);
    }
  });

  it("serializes a legacy price as null even though the legacy record carries a number", () => {
    const withLegacyPrice = LIVE_CATALOG.find((product) => product.facts.priceCents.value !== null);
    expect(withLegacyPrice, "expected at least one legacy price on file").toBeDefined();

    const detail = liveService().getProduct(withLegacyPrice!.slug);
    expect(detail!.priceCents).toBeNull();
  });

  it("serializes a confirmed price", () => {
    const service = createCatalogService({
      products: [fullyConfirmedProduct()],
      commerceEnabled: true,
      quantumCommerceEnabled: true,
    });
    expect(service.getProduct("test-confirmed")!.priceCents).toBe(4900);
  });
});

describe("confirmed facts", () => {
  it("omits the disputed KLOW composition entirely", () => {
    const klow = LIVE_CATALOG.find((product) => product.slug === "klow-research-blend");
    expect(klow, "expected the KLOW record in the live catalog").toBeDefined();
    expect(klow!.facts.composition.conflictNote).toBeTruthy();

    const detail = liveService().getProduct("klow-research-blend")!;
    expect("composition" in detail.confirmedFacts).toBe(false);
    expect(detail.confirmedFacts.composition).toBeUndefined();
    expect(JSON.stringify(detail)).not.toContain("composition");
  });

  it("omits every unconfirmed fact across the whole live catalog", () => {
    const service = liveService();
    for (const product of LIVE_CATALOG) {
      const detail = service.getProduct(product.slug)!;
      expect(Object.keys(detail.confirmedFacts)).toEqual([]);
    }
  });

  it("never serializes a fact as null or as an empty string", () => {
    const service = liveService();
    for (const product of LIVE_CATALOG) {
      for (const value of Object.values(service.getProduct(product.slug)!.confirmedFacts)) {
        expect(value).toBeTruthy();
      }
    }
  });

  // Shelf life, storage, and COA are not merely unconfirmed on today's records, they
  // are outside the member shape entirely. This pins that: even when all three are
  // CONFIRMED and would satisfy isMemberDisplayable, no member payload carries them.
  it("never serializes shelf life, storage, or COA even when they are confirmed", () => {
    const service = createCatalogService({
      products: [
        fullyConfirmedProduct({
          facts: {
            ...fullyConfirmedProduct().facts,
            shelfLife: confirmed("24 months at 2 to 8 C"),
            storage: confirmed("Refrigerate, protect from light"),
            coa: confirmed("COA-BATCH-77"),
          },
        }),
      ],
      commerceEnabled: true,
      quantumCommerceEnabled: true,
    });

    const detail = service.getProduct("test-confirmed")!;
    const serialized = JSON.stringify(detail);
    for (const leak of ["24 months at 2 to 8 C", "Refrigerate, protect from light", "COA-BATCH-77"]) {
      expect(serialized, `member payload leaked "${leak}"`).not.toContain(leak);
    }
    expect(Object.keys(detail.confirmedFacts).sort()).toEqual(["composition", "format", "strength"]);

    const summary = JSON.stringify(service.listProducts()[0]);
    expect(summary).not.toContain("COA-BATCH-77");
    expect(summary).not.toContain("Refrigerate");
  });

  it("includes a fact only when it is confirmed and undisputed", () => {
    const mixed = fullyConfirmedProduct({
      facts: {
        ...fullyConfirmedProduct().facts,
        strength: {
          value: "10 mg",
          confirmation: "confirmed",
          source: { kind: "supplier_document" },
          conflictNote: "Two supplier documents disagree.",
        },
        format: { value: "Capsule", confirmation: "unverified_legacy", source: { kind: "legacy_catalog_file" } },
      },
    });
    const service = createCatalogService({
      products: [mixed],
      commerceEnabled: true,
      quantumCommerceEnabled: true,
    });

    const facts = service.getProduct("test-confirmed")!.confirmedFacts;
    expect(facts.composition).toBe("Single component");
    expect("strength" in facts).toBe(false);
    expect("format" in facts).toBe(false);
  });
});

describe("purchasability", () => {
  it("makes nothing in the live catalog purchasable today", () => {
    for (const summary of liveService().listProducts()) {
      expect(summary.purchasable).toBe(false);
    }
  });

  it("stays unpurchasable even if the commerce capability is turned on, because facts are unconfirmed", () => {
    const service = createCatalogService({
      products: LIVE_CATALOG,
      commerceEnabled: true,
      quantumCommerceEnabled: true,
    });
    for (const summary of service.listProducts()) {
      expect(summary.purchasable).toBe(false);
    }
  });

  it("does not read purchasability off availability", () => {
    const inStockButUnconfirmed = fullyConfirmedProduct({
      availability: "in_stock",
      facts: { ...fullyConfirmedProduct().facts, coa: { value: null, confirmation: "not_confirmed", source: { kind: "none" } } },
    });
    const service = createCatalogService({
      products: [inStockButUnconfirmed],
      commerceEnabled: true,
      quantumCommerceEnabled: true,
    });
    const detail = service.getProduct("test-confirmed")!;
    expect(detail.availability).toBe("in_stock");
    expect(detail.purchasable).toBe(false);
  });

  it("denies a quantum item while quantum commerce is off", () => {
    const quantum = fullyConfirmedProduct({ slug: "test-quantum", lane: "quantum" });
    const service = createCatalogService({
      products: [quantum],
      commerceEnabled: true,
      quantumCommerceEnabled: false,
    });
    const detail = service.getProduct("test-quantum")!;
    expect(detail.purchasable).toBe(false);
    expect(detail.unavailableReason).toBe("This item is not available to order.");
  });

  it("permits purchase only when every gate passes", () => {
    const service = createCatalogService({
      products: [fullyConfirmedProduct()],
      commerceEnabled: true,
      quantumCommerceEnabled: true,
    });
    const detail = service.getProduct("test-confirmed")!;
    expect(detail.purchasable).toBe(true);
    expect(detail.unavailableReason).toBeNull();
  });
});

describe("unavailableReason leaks nothing internal", () => {
  // Anything that would tell a member which gate moved, which fact is missing, or what
  // system is involved.
  const FORBIDDEN = [
    "capability",
    "commerce_",
    "env",
    "ENV",
    "flag",
    "supplier",
    "COA",
    "coa",
    "mitch",
    "Mitch",
    "xenios",
    "approval",
    "disabled",
    "unconfirmed",
    "quantum",
    "provider",
    "stripe",
    "Stripe",
    "database",
    "null",
    "undefined",
  ];

  it("returns a member-safe sentence for every live product", () => {
    const service = liveService();
    for (const product of LIVE_CATALOG) {
      const reason = service.getProduct(product.slug)!.unavailableReason;
      expect(reason, `expected a reason for ${product.slug}`).toBeTruthy();
      for (const token of FORBIDDEN) {
        expect(reason!, `reason for ${product.slug} leaked "${token}"`).not.toContain(token);
      }
    }
  });

  it("says only that documentation is being confirmed when facts are the blocker", () => {
    const missingFacts = fullyConfirmedProduct({
      facts: {
        ...fullyConfirmedProduct().facts,
        storage: { value: null, confirmation: "not_confirmed", source: { kind: "none" } },
      },
    });
    const service = createCatalogService({
      products: [missingFacts],
      commerceEnabled: true,
      quantumCommerceEnabled: true,
    });
    expect(service.getProduct("test-confirmed")!.unavailableReason).toBe(
      "Product documentation is still being confirmed.",
    );
  });

  it("does not name which fact is missing", () => {
    const service = createCatalogService({
      products: [
        fullyConfirmedProduct({
          facts: {
            ...fullyConfirmedProduct().facts,
            shelfLife: { value: null, confirmation: "not_confirmed", source: { kind: "none" } },
          },
        }),
      ],
      commerceEnabled: true,
      quantumCommerceEnabled: true,
    });
    const reason = service.getProduct("test-confirmed")!.unavailableReason!;
    expect(reason.toLowerCase()).not.toContain("shelf");
  });

  it("says ordering is not open when the capability itself is off", () => {
    const service = createCatalogService({
      products: [fullyConfirmedProduct()],
      commerceEnabled: false,
      quantumCommerceEnabled: false,
    });
    expect(service.getProduct("test-confirmed")!.unavailableReason).toBe("Ordering is not open yet.");
  });
});

describe("lookup and goals", () => {
  it("returns null for an unknown slug rather than throwing", () => {
    expect(liveService().getProduct("no-such-product")).toBeNull();
  });

  it("returns null for an empty slug", () => {
    expect(liveService().getProduct("")).toBeNull();
  });

  it("returns no goals when no product carries a goal mapping", () => {
    expect(liveService().listGoals()).toEqual([]);
  });

  it("maps a goal to its SKUs and guides without any effect language", () => {
    const service = createCatalogService({
      products: [
        fullyConfirmedProduct(),
        fullyConfirmedProduct({
          sku: "T002",
          slug: "test-two",
          goalMappings: ["recover_faster", "sleep_better"],
          relatedGuideSlugs: ["test-guide", "second-guide"],
        }),
      ],
      commerceEnabled: false,
      quantumCommerceEnabled: false,
    });

    const goals = service.listGoals();
    const recover = goals.find((goal) => goal.slug === "recover_faster")!;
    expect(recover.label).toBe("Recover Faster");
    expect(recover.productSkus).toEqual(["T001", "T002"]);
    expect(recover.guideSlugs).toEqual(["test-guide", "second-guide"]);

    // The DTO has room for slugs and a label only, so no goal can carry a claim.
    expect(Object.keys(recover).sort()).toEqual(["guideSlugs", "label", "productSkus", "slug"]);
  });

  it("returns a defensive copy so a caller cannot mutate the catalog", () => {
    const service = createCatalogService({
      products: [fullyConfirmedProduct()],
      commerceEnabled: false,
      quantumCommerceEnabled: false,
    });
    service.listProducts()[0].goalMappings.push("get_leaner");
    expect(service.listProducts()[0].goalMappings).toEqual(["recover_faster"]);
  });

  it("never carries prohibited claims text into a member payload", () => {
    const service = createCatalogService({
      products: [fullyConfirmedProduct()],
      commerceEnabled: false,
      quantumCommerceEnabled: false,
    });
    const detail = service.getProduct("test-confirmed")!;
    expect(detail.prohibitedClaims).toEqual([]);
    expect(JSON.stringify(detail)).not.toContain("never say this");
  });
});

import { describe, expect, it } from "vitest";
import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { ProductCatalogReader } from "../../catalog/product-control-reader";
import { EarlyAccessCatalogError } from "./early-access-catalog";
import type {
  EarlyAccessProductRecord,
  EarlyAccessVariantFacts,
} from "./eligibility";
import {
  EARLY_ACCESS_UNSOURCED_FACTS,
  EarlyAccessCatalogSourceError,
  EmptyEarlyAccessCatalogSource,
  ProductControlCatalogSource,
  createProductionEarlyAccessCatalogSource,
  heldVariantFacts,
  resolveEarlyAccessSettlementCurrency,
  type EarlyAccessDeclaredFactsReader,
  type EarlyAccessDeclaredProductFacts,
} from "./product-control-source";

const NOW = new Date("2026-08-04T12:00:00.000Z");
const EVALUATED_AT = NOW.toISOString();

const PRODUCT_ID = "prod-ea-src-0001";
const VARIANT_ID = "var-ea-src-0001";
const NEUTRAL_SKU = "EA-SRC-0001";

function variant(overrides: Partial<AdminProductVariant> = {}): AdminProductVariant {
  return {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    sku: NEUTRAL_SKU,
    catalogNumber: null,
    label: "Primary presentation",
    strength: "10 mg",
    size: "1 unit",
    format: "vial",
    presentation: "Single-use vial",
    shippingClass: "ambient",
    memberEligible: true,
    status: "approved",
    active: true,
    sortOrder: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function price(overrides: Partial<AdminProductPrice> = {}): AdminProductPrice {
  return {
    id: "price-ea-src-0001",
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    audience: "member",
    amountCents: 24_900,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00.000Z",
    expiresAt: null,
    status: "active",
    approvalNote: null,
    version: 1,
    createdBy: "operations",
    approvedBy: "founder",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * A product in the exact shape the live reader returns one: published, active,
 * publicly visible, commerce approved, in stock, with an approved active member
 * price. `LiveProductControlReader.readCatalog` filters to published and public,
 * so nothing weaker than this can reach the adapter in production.
 */
function product(overrides: Partial<AdminProductDetail> = {}): AdminProductDetail {
  return {
    id: PRODUCT_ID,
    productCode: "EASRC0001",
    slug: "early-access-source-item",
    displayName: "Early Access Source Item",
    canonicalName: "Early Access Source Item",
    aliases: [],
    lane: "research_material",
    category: "Research materials",
    classification: "Research catalog item",
    status: "published",
    active: true,
    visibility: "public",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: "2026-07-01T00:00:00.000Z",
    publishedAt: "2026-07-01T00:00:00.000Z",
    content: {
      shortDescription: "A research catalog item held for internal review.",
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
    variants: [variant()],
    prices: [price()],
    media: [],
    history: [],
    ...overrides,
  };
}

/** A reader that answers with exactly these products and touches no database. */
function fakeReader(products: readonly AdminProductDetail[]): ProductCatalogReader {
  return { readCatalog: async () => products.map((item) => ({ ...item })) };
}

function failingReader(failure: Error): ProductCatalogReader {
  return {
    readCatalog: async () => {
      throw failure;
    },
  };
}

/** Every declared fact present and satisfied, which is the future wired state. */
function readyVariantFacts(
  overrides: Partial<EarlyAccessVariantFacts> = {},
): EarlyAccessVariantFacts {
  return {
    variantId: VARIANT_ID,
    supplier: {
      variantId: VARIANT_ID,
      fulfillmentOwner: "xenios",
      sourceVersion: "supplier-v1",
    },
    fulfillment: {
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      state: "eligible",
      reason: null,
      sourceVersion: "inventory-v1",
      evaluatedAt: EVALUATED_AT,
    },
    documentation: {
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      state: "verified",
      sourceVersion: "coa-v1",
      evaluatedAt: EVALUATED_AT,
    },
    quantityLimit: { variantId: VARIANT_ID, maxUnitsPerOrder: 3 },
    offerState: "APPROVAL_REQUIRED_PURCHASE",
    identityDispute: "cleared",
    strengthDispute: "cleared",
    image: {
      variantId: VARIANT_ID,
      mediaId: "media-ea-src-0001",
      state: "approved",
      approvedBy: "operations",
      altText: "Product image",
    },
    ...overrides,
  };
}

function readyDeclaredFacts(
  overrides: Partial<EarlyAccessDeclaredProductFacts> = {},
): EarlyAccessDeclaredProductFacts {
  return {
    productId: PRODUCT_ID,
    audience: {
      audience: "member",
      state: "authorized",
      sourceVersion: "member-v1",
      evaluatedAt: EVALUATED_AT,
    },
    variantFacts: [readyVariantFacts()],
    ...overrides,
  };
}

function factsReader(
  entries: readonly EarlyAccessDeclaredProductFacts[],
): EarlyAccessDeclaredFactsReader {
  return { readDeclaredFacts: async () => entries };
}

/** The blockers a well-formed product carries when no fact has been declared. */
const UNSOURCED_BLOCKERS = [
  "PRICE_NOT_APPROVED",
  "AUDIENCE_NOT_PERMITTED",
  "SUPPLIER_NOT_ASSIGNED",
  "FULFILLMENT_UNAVAILABLE",
  "QUANTITY_LIMIT_MISSING",
  "DOCUMENTATION_NOT_SATISFIED",
  "IDENTITY_DISPUTE_UNRESOLVED",
  "STRENGTH_DISPUTE_UNRESOLVED",
  "OFFER_STATE_NOT_PURCHASABLE",
];

describe("resolveEarlyAccessSettlementCurrency", () => {
  it("names the one currency Early Access settles in", () => {
    expect(resolveEarlyAccessSettlementCurrency()).toBe("USD");
  });

  it("declines to choose when the vocabulary carries more than one currency", () => {
    expect(resolveEarlyAccessSettlementCurrency(["USD", "EUR"])).toBe("");
  });

  it("declines when the vocabulary is empty or unsupported", () => {
    expect(resolveEarlyAccessSettlementCurrency([])).toBe("");
    expect(resolveEarlyAccessSettlementCurrency(["ZZZ"])).toBe("");
    expect(resolveEarlyAccessSettlementCurrency([" "])).toBe("");
  });
});

describe("heldVariantFacts", () => {
  it("resolves every fact Product Control does not carry to its blocking value", () => {
    expect(heldVariantFacts(VARIANT_ID)).toEqual({
      variantId: VARIANT_ID,
      supplier: null,
      fulfillment: null,
      documentation: null,
      quantityLimit: null,
      offerState: null,
      identityDispute: "unknown",
      strengthDispute: "unknown",
      image: null,
    });
  });

  it("holds no fact the unsourced list does not name", () => {
    const held = heldVariantFacts(VARIANT_ID);
    const absent = (
      Object.keys(held) as (keyof EarlyAccessVariantFacts)[]
    ).filter((key) => key !== "variantId");
    for (const key of absent) {
      expect(EARLY_ACCESS_UNSOURCED_FACTS).toContain(key);
    }
    // The record-level fact belongs to the same gap and is named with them.
    expect(EARLY_ACCESS_UNSOURCED_FACTS).toContain("audience");
  });
});

describe("ProductControlCatalogSource, wired as production wires it", () => {
  const source = () =>
    new ProductControlCatalogSource({ catalog: fakeReader([product()]) });

  it("reads Product Control and projects one row per exact variant", async () => {
    const projection = await source().load(NOW);
    expect(projection.evaluatedAt).toBe(EVALUATED_AT);
    expect(projection.rows).toHaveLength(1);
    expect(projection.rows[0].productId).toBe(PRODUCT_ID);
    expect(projection.rows[0].variantId).toBe(VARIANT_ID);
    expect(projection.rows[0].sku).toBe(NEUTRAL_SKU);
  });

  it("holds a fully formed product, and names every missing fact", async () => {
    const row = (await source().load(NOW)).rows[0];
    expect(row.purchasable).toBe(false);
    expect(row.blockers).toEqual(UNSOURCED_BLOCKERS);
  });

  it("shows no amount, no supplier, no limit, and no image for a held unit", async () => {
    const row = (await source().load(NOW)).rows[0];
    expect(row.priceCents).toBeNull();
    expect(row.currency).toBe("");
    expect(row.audience).toBeNull();
    expect(row.supplierReady).toBe(false);
    expect(row.quantityLimit).toBeNull();
    expect(row.availability).toBe("unavailable");
    expect(row.offerState).toBeNull();
    expect(row.imageState).toBe("none");
    expect(row.disputeStatus).toEqual({
      identity: "unknown",
      strength: "unknown",
    });
  });

  it("holds every unit whatever the product record says about itself", async () => {
    const products = [
      product(),
      product({
        id: "prod-ea-src-0002",
        slug: "early-access-source-item-two",
        productCode: "EASRC0002",
        displayName: "Early Access Source Item Two",
        canonicalName: "Early Access Source Item Two",
        availability: "low_stock",
        variants: [
          variant({
            id: "var-ea-src-0002",
            productId: "prod-ea-src-0002",
            sku: "EA-SRC-0002",
          }),
        ],
        prices: [
          price({
            id: "price-ea-src-0002",
            productId: "prod-ea-src-0002",
            variantId: "var-ea-src-0002",
          }),
        ],
      }),
    ];
    const projection = await new ProductControlCatalogSource({
      catalog: fakeReader(products),
    }).load(NOW);
    expect(projection.rows).toHaveLength(2);
    for (const row of projection.rows) {
      expect(row.purchasable).toBe(false);
      expect(row.priceCents).toBeNull();
    }
  });

  it("reports a product with no variants rather than dropping it", async () => {
    const projection = await new ProductControlCatalogSource({
      catalog: fakeReader([
        product({ variants: [], prices: [], variantCount: 0, approvedVariantCount: 0 }),
      ]),
    }).load(NOW);
    expect(projection.rows).toEqual([]);
    expect(projection.productsWithoutVariants).toEqual([PRODUCT_ID]);
  });

  it("returns an empty catalog when Product Control holds nothing", async () => {
    const projection = await new ProductControlCatalogSource({
      catalog: fakeReader([]),
    }).load(NOW);
    expect(projection.rows).toEqual([]);
    expect(projection.productsWithoutVariants).toEqual([]);
  });

  it("refuses an unusable evaluation instant instead of inventing one", async () => {
    await expect(source().load(new Date(Number.NaN))).rejects.toBeInstanceOf(
      EarlyAccessCatalogError,
    );
  });
});

describe("ProductControlCatalogSource, with declared facts wired", () => {
  it("projects a genuinely ready unit as purchasable at the Product Control amount", async () => {
    const projection = await new ProductControlCatalogSource({
      catalog: fakeReader([product()]),
      declaredFacts: factsReader([readyDeclaredFacts()]),
    }).load(NOW);
    const row = projection.rows[0];
    expect(row.blockers).toEqual([]);
    expect(row.purchasable).toBe(true);
    expect(row.priceCents).toBe(24_900);
    expect(row.currency).toBe("USD");
    expect(row.audience).toBe("member");
    expect(row.availability).toBe("available");
    expect(row.supplierReady).toBe(true);
    expect(row.quantityLimit).toBe(3);
  });

  it("holds the unit when a single declared fact is absent", async () => {
    const missing: readonly (keyof EarlyAccessVariantFacts)[] = [
      "supplier",
      "fulfillment",
      "documentation",
      "quantityLimit",
      "offerState",
    ];
    for (const key of missing) {
      const projection = await new ProductControlCatalogSource({
        catalog: fakeReader([product()]),
        declaredFacts: factsReader([
          readyDeclaredFacts({
            variantFacts: [readyVariantFacts({ [key]: null })],
          }),
        ]),
      }).load(NOW);
      expect(projection.rows[0].purchasable).toBe(false);
    }
  });

  it("holds the unit when a dispute has not been cleared", async () => {
    for (const key of ["identityDispute", "strengthDispute"] as const) {
      const projection = await new ProductControlCatalogSource({
        catalog: fakeReader([product()]),
        declaredFacts: factsReader([
          readyDeclaredFacts({
            variantFacts: [readyVariantFacts({ [key]: "unknown" })],
          }),
        ]),
      }).load(NOW);
      expect(projection.rows[0].purchasable).toBe(false);
    }
  });

  it("holds the unit when the audience was never authorized server side", async () => {
    const projection = await new ProductControlCatalogSource({
      catalog: fakeReader([product()]),
      declaredFacts: factsReader([readyDeclaredFacts({ audience: null })]),
    }).load(NOW);
    expect(projection.rows[0].purchasable).toBe(false);
    expect(projection.rows[0].blockers).toContain("AUDIENCE_NOT_PERMITTED");
  });

  it("uses no declaration when two of them claim the same product", async () => {
    const projection = await new ProductControlCatalogSource({
      catalog: fakeReader([product()]),
      declaredFacts: factsReader([readyDeclaredFacts(), readyDeclaredFacts()]),
    }).load(NOW);
    expect(projection.rows[0].purchasable).toBe(false);
    expect(projection.rows[0].blockers).toEqual(UNSOURCED_BLOCKERS);
  });

  it("uses no declaration when two of them claim the same unit", async () => {
    const projection = await new ProductControlCatalogSource({
      catalog: fakeReader([product()]),
      declaredFacts: factsReader([
        readyDeclaredFacts({
          variantFacts: [readyVariantFacts(), readyVariantFacts()],
        }),
      ]),
    }).load(NOW);
    expect(projection.rows[0].purchasable).toBe(false);
    expect(projection.rows[0].supplierReady).toBe(false);
  });

  it("ignores a declaration for a product the reader did not return", async () => {
    const projection = await new ProductControlCatalogSource({
      catalog: fakeReader([product()]),
      declaredFacts: factsReader([
        readyDeclaredFacts({ productId: "prod-ea-src-9999" }),
      ]),
    }).load(NOW);
    expect(projection.rows).toHaveLength(1);
    expect(projection.rows[0].purchasable).toBe(false);
  });

  it("hands the reader the products and the one evaluation instant", async () => {
    const seen: Array<{ products: readonly AdminProductDetail[]; now: Date }> = [];
    await new ProductControlCatalogSource({
      catalog: fakeReader([product()]),
      declaredFacts: {
        readDeclaredFacts: async (input) => {
          seen.push({ products: input.products, now: input.now });
          return [];
        },
      },
    }).load(NOW);
    expect(seen).toHaveLength(1);
    expect(seen[0].products.map((item) => item.id)).toEqual([PRODUCT_ID]);
    expect(seen[0].now).toBe(NOW);
  });

  it("carries the settlement currency onto every record", async () => {
    // A vocabulary the adapter cannot choose from blocks the price rather than
    // letting an amount out under a currency nobody named.
    const projection = await new ProductControlCatalogSource({
      catalog: fakeReader([product()]),
      declaredFacts: factsReader([readyDeclaredFacts()]),
      currencies: ["USD", "EUR"],
    }).load(NOW);
    expect(projection.rows[0].purchasable).toBe(false);
    expect(projection.rows[0].blockers).toContain("PRICE_CURRENCY_MISSING");
    expect(projection.rows[0].priceCents).toBeNull();
  });
});

describe("a failed read never looks like an empty catalog", () => {
  it("surfaces a Product Control failure as an error", async () => {
    const source = new ProductControlCatalogSource({
      catalog: failingReader(new Error("connection refused")),
    });
    await expect(source.load(NOW)).rejects.toBeInstanceOf(
      EarlyAccessCatalogSourceError,
    );
  });

  it("keeps the original failure as the cause", async () => {
    const failure = new Error("connection refused");
    const source = new ProductControlCatalogSource({
      catalog: failingReader(failure),
    });
    await expect(source.load(NOW)).rejects.toMatchObject({ cause: failure });
  });

  it("surfaces a declared-facts failure as an error", async () => {
    const source = new ProductControlCatalogSource({
      catalog: fakeReader([product()]),
      declaredFacts: {
        readDeclaredFacts: async () => {
          throw new Error("facts store unavailable");
        },
      },
    });
    await expect(source.load(NOW)).rejects.toBeInstanceOf(
      EarlyAccessCatalogSourceError,
    );
  });

  it("tells a broken catalog apart from an empty one", async () => {
    const empty = await new ProductControlCatalogSource({
      catalog: fakeReader([]),
    }).load(NOW);
    expect(empty.rows).toEqual([]);
    await expect(
      new ProductControlCatalogSource({
        catalog: failingReader(new Error("connection refused")),
      }).load(NOW),
    ).rejects.toThrow();
  });
});

describe("EmptyEarlyAccessCatalogSource", () => {
  it("answers with an empty catalog at the given instant", async () => {
    const projection = await new EmptyEarlyAccessCatalogSource().load(NOW);
    expect(projection).toEqual({
      evaluatedAt: EVALUATED_AT,
      rows: [],
      productsWithoutVariants: [],
    });
  });

  it("refuses an unusable evaluation instant, exactly as the live source does", async () => {
    await expect(
      new EmptyEarlyAccessCatalogSource().load(new Date(Number.NaN)),
    ).rejects.toBeInstanceOf(EarlyAccessCatalogError);
  });
});

describe("createProductionEarlyAccessCatalogSource", () => {
  it("wires the real Product Control reader rather than a stub", () => {
    // The production reader is built on the Supabase repository, so with no
    // Supabase configuration it refuses at construction. That refusal is the
    // proof the factory reaches the real reader; a stub would build silently.
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      expect(() => createProductionEarlyAccessCatalogSource()).toThrow(
        /Supabase admin not configured/,
      );
    } finally {
      if (url !== undefined) process.env.SUPABASE_URL = url;
      if (key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    }
  });
});

describe("the record the adapter builds", () => {
  it("passes the Product Control record through untouched", async () => {
    const detail = product();
    let seen: EarlyAccessProductRecord | null = null;
    const projection = await new ProductControlCatalogSource({
      catalog: fakeReader([detail]),
      declaredFacts: {
        readDeclaredFacts: async (input) => {
          seen = {
            product: input.products[0],
            audience: null,
            currency: "USD",
            variantFacts: [],
          };
          return [];
        },
      },
    }).load(NOW);
    expect(projection.rows[0].displayName).toBe(detail.displayName);
    expect(projection.rows[0].description).toBe(
      detail.content.shortDescription,
    );
    expect(seen).not.toBeNull();
  });

  it("gives every variant its own facts entry", async () => {
    const second = variant({
      id: "var-ea-src-0001b",
      sku: "EA-SRC-0001B",
      label: "Second presentation",
    });
    const projection = await new ProductControlCatalogSource({
      catalog: fakeReader([
        product({ variants: [variant(), second], variantCount: 2 }),
      ]),
      declaredFacts: factsReader([readyDeclaredFacts()]),
    }).load(NOW);
    expect(projection.rows).toHaveLength(2);
    const declared = projection.rows.find((row) => row.variantId === VARIANT_ID);
    const undeclared = projection.rows.find(
      (row) => row.variantId === second.id,
    );
    // The declared unit clears; the unit nobody declared facts for holds, which
    // is the whole point of giving every variant an explicit entry.
    expect(declared?.purchasable).toBe(true);
    expect(undeclared?.purchasable).toBe(false);
    // The audience is declared once for the product, so it holds for both units.
    // Everything per-variant is missing for the second one, and it blocks.
    expect(undeclared?.blockers).toEqual(
      UNSOURCED_BLOCKERS.filter((code) => code !== "AUDIENCE_NOT_PERMITTED"),
    );
  });
});

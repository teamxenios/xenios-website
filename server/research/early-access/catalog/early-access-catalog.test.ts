import { describe, expect, it } from "vitest";
import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import { recordedVariantStrengthDisputes } from "../../products-diagnostics/variant-strength-dispute";
import type {
  EarlyAccessProductRecord,
  EarlyAccessVariantFacts,
} from "./eligibility";
import {
  EARLY_ACCESS_FORBIDDEN_DESCRIPTION_TERMS,
  EARLY_ACCESS_WITHHELD_DESCRIPTION,
  EarlyAccessCatalogError,
  carriesForbiddenDescriptionTerm,
  earlyAccessDescription,
  earlyAccessRowKey,
  projectEarlyAccessCatalog,
  summarizeEarlyAccessEligibility,
  type EarlyAccessCatalogRow,
} from "./early-access-catalog";

const NOW = new Date("2026-08-04T12:00:00.000Z");
const EVALUATED_AT = NOW.toISOString();

const PRODUCT_ID = "prod-ea-0001";
const VARIANT_ID = "var-ea-0001";
const NEUTRAL_SKU = "EA-TEST-0001";

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
    id: "price-ea-0001",
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    audience: "private_early_access",
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

function product(overrides: Partial<AdminProductDetail> = {}): AdminProductDetail {
  return {
    id: PRODUCT_ID,
    productCode: "EA0001",
    slug: "early-access-test-item",
    displayName: "Early Access Test Item",
    canonicalName: "Early Access Test Item",
    aliases: [],
    lane: "research_material",
    category: "Research materials",
    classification: "Research catalog item",
    status: "published",
    active: true,
    visibility: "members_only",
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

function facts(
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
      mediaId: "media-ea-0001",
      state: "approved",
      approvedBy: "operations",
      altText: "Product image",
    },
    ...overrides,
  };
}

function satisfied(
  overrides: Partial<EarlyAccessProductRecord> = {},
): EarlyAccessProductRecord {
  return {
    product: product(),
    audience: {
      audience: "private_early_access",
      state: "authorized",
      sourceVersion: "member-v1",
      evaluatedAt: EVALUATED_AT,
    },
    currency: "USD",
    variantFacts: [facts()],
    ...overrides,
  };
}

function projectOne(record: EarlyAccessProductRecord): EarlyAccessCatalogRow {
  const projection = projectEarlyAccessCatalog({ products: [record], now: NOW });
  expect(projection.rows).toHaveLength(1);
  return projection.rows[0];
}

describe("projectEarlyAccessCatalog", () => {
  it("carries the canonical product, the exact variant, and the display facts", () => {
    const row = projectOne(satisfied());
    expect(row).toEqual({
      productId: PRODUCT_ID,
      slug: "early-access-test-item",
      displayName: "Early Access Test Item",
      canonicalName: "Early Access Test Item",
      variantId: VARIANT_ID,
      sku: NEUTRAL_SKU,
      strength: "10 mg",
      presentation: "Single-use vial",
      priceCents: 24_900,
      currency: "USD",
      audience: "private_early_access",
      availability: "available",
      offerState: "APPROVAL_REQUIRED_PURCHASE",
      description: "A research catalog item held for internal review.",
      imageState: "approved",
      quantityLimit: 3,
      supplierReady: true,
      fulfillmentOwner: "xenios",
      disputeStatus: { identity: "cleared", strength: "cleared" },
      purchasable: true,
      blockers: [],
    });
  });

  it("reports the evaluation instant it was given and reads no clock", () => {
    expect(
      projectEarlyAccessCatalog({ products: [satisfied()], now: NOW }).evaluatedAt,
    ).toBe(EVALUATED_AT);
  });

  it("refuses to project without a usable evaluation instant", () => {
    expect(() =>
      projectEarlyAccessCatalog({ products: [], now: new Date(Number.NaN) }),
    ).toThrow(EarlyAccessCatalogError);
  });

  describe("money", () => {
    it("never emits a zero price", () => {
      const row = projectOne(
        satisfied({ product: product({ prices: [price({ amountCents: 0 })] }) }),
      );
      expect(row.priceCents).toBeNull();
      expect(row.purchasable).toBe(false);
      expect(row.blockers).toContain("PRICE_NOT_APPROVED");
    });

    it("emits null rather than a negative or unsafe amount", () => {
      for (const amountCents of [-1, Number.NaN, Number.MAX_SAFE_INTEGER]) {
        const row = projectOne(
          satisfied({ product: product({ prices: [price({ amountCents })] }) }),
        );
        expect(row.priceCents).toBeNull();
        expect(row.purchasable).toBe(false);
      }
    });

    it("emits null for a price nobody approved, and holds the row", () => {
      const row = projectOne(
        satisfied({ product: product({ prices: [price({ approvedBy: null })] }) }),
      );
      expect(row.priceCents).toBeNull();
      expect(row.currency).toBe("");
      expect(row.blockers).toContain("PRICE_NOT_APPROVED");
    });

    it("emits no amount when the offer mode does not permit one", () => {
      for (const offerState of [
        "REQUEST_ACCESS_ONLY",
        "DISPLAY_ONLY",
        "UNAVAILABLE",
      ] as const) {
        const row = projectOne(
          satisfied({ variantFacts: [facts({ offerState })] }),
        );
        expect(row.offerState).toBe(offerState);
        expect(row.priceCents).toBeNull();
        expect(row.currency).toBe("");
        expect(row.purchasable).toBe(false);
      }
    });

    it("takes no price argument, so a caller-supplied amount can never enter", () => {
      expect(projectEarlyAccessCatalog.length).toBe(1);
      const rogue = {
        ...satisfied({ product: product({ prices: [] }) }),
        priceCents: 9_900,
        amountCents: 9_900,
        unitPriceCents: 9_900,
      } as unknown as EarlyAccessProductRecord;
      const row = projectOne(rogue);
      expect(row.priceCents).toBeNull();
      expect(row.blockers).toContain("PRICE_NOT_APPROVED");
    });
  });

  describe("images", () => {
    it("emits approved only for an approved asset bound to the exact variant", () => {
      expect(projectOne(satisfied()).imageState).toBe("approved");
    });

    it("emits none when no exact-variant asset exists", () => {
      expect(projectOne(satisfied({ variantFacts: [facts({ image: null })] })).imageState).toBe(
        "none",
      );
    });

    it("emits none for an asset bound to a different variant", () => {
      const row = projectOne(
        satisfied({
          variantFacts: [
            facts({
              image: {
                variantId: "var-ea-9999",
                mediaId: "media-ea-0001",
                state: "approved",
                approvedBy: "operations",
                altText: "Product image",
              },
            }),
          ],
        }),
      );
      expect(row.imageState).toBe("none");
    });

    it("emits pending for an asset that is not approved, unapproved by a person, or unlabelled", () => {
      for (const override of [
        { state: "uploaded" as const },
        { state: "in_review" as const },
        { state: "rejected" as const },
        { approvedBy: null },
        { approvedBy: "   " },
        { altText: "  " },
        { mediaId: "" },
      ]) {
        const row = projectOne(
          satisfied({
            variantFacts: [
              facts({
                image: {
                  variantId: VARIANT_ID,
                  mediaId: "media-ea-0001",
                  state: "approved",
                  approvedBy: "operations",
                  altText: "Product image",
                  ...override,
                },
              }),
            ],
          }),
        );
        expect(row.imageState).toBe("pending");
      }
    });

    it("never promotes product-level Product Control media to an exact-variant asset", () => {
      // AdminProductMedia carries no variant binding, so an approved product
      // image cannot make a variant row claim an approved asset.
      const row = projectOne(
        satisfied({
          product: product({
            media: [
              {
                id: "media-product-0001",
                productId: PRODUCT_ID,
                kind: "primary_image",
                state: "approved",
                storageKey: `${PRODUCT_ID}/media-product-0001/image.png`,
                filename: "image.png",
                contentType: "image/png",
                sizeBytes: 1024,
                altText: "Product image",
                sortOrder: 0,
                approvedBy: "operations",
                createdAt: "2026-07-01T00:00:00.000Z",
                updatedAt: "2026-07-01T00:00:00.000Z",
              },
            ],
          }),
          variantFacts: [facts({ image: null })],
        }),
      );
      expect(row.imageState).toBe("none");
    });
  });

  describe("descriptions", () => {
    it("never carries dosage, reconstitution, injection, or administration language", () => {
      const unsafe = [
        "Typical dose is one vial.",
        "Standard dosage guidance included.",
        "Titrate at 2 mg/kg for the protocol.",
        "Inject once weekly.",
        "Injection guidance is included in the insert.",
        "Reconstitute with bacteriostatic water before use.",
        "Administer under supervision.",
        "Administration notes are enclosed.",
        "Provides 500 IU per millilitre.",
        "For subcutaneous use.",
        "For intramuscular use.",
        "IU  per  unit, spaced out.",
        "Dilute to 2 m g / k g.",
      ];
      const products = unsafe.map((shortDescription, index) =>
        satisfied({
          product: product({
            id: `prod-desc-${index}`,
            slug: `desc-${index}`,
            productCode: `DESC${index}`,
            displayName: `Description case ${index}`,
            content: { ...product().content, shortDescription },
            variants: [variant({ id: `var-desc-${index}`, productId: `prod-desc-${index}`, sku: `EA-DESC-${index}` })],
            prices: [],
          }),
          variantFacts: [],
        }),
      );
      const projection = projectEarlyAccessCatalog({ products, now: NOW });
      expect(projection.rows).toHaveLength(unsafe.length);
      for (const row of projection.rows) {
        const lowered = row.description.toLowerCase();
        for (const term of EARLY_ACCESS_FORBIDDEN_DESCRIPTION_TERMS) {
          expect(lowered).not.toContain(term);
        }
        expect(row.description).toBe(EARLY_ACCESS_WITHHELD_DESCRIPTION);
      }
    });

    it("holds every projected description to the same screen, including the safe ones", () => {
      const projection = projectEarlyAccessCatalog({
        products: [satisfied()],
        now: NOW,
      });
      for (const row of projection.rows) {
        const lowered = row.description.toLowerCase();
        for (const term of EARLY_ACCESS_FORBIDDEN_DESCRIPTION_TERMS) {
          expect(lowered).not.toContain(term);
        }
      }
    });

    it("never emits a blank description", () => {
      for (const shortDescription of [null, "", "   "]) {
        expect(
          earlyAccessDescription(
            product({ content: { ...product().content, shortDescription } }),
          ),
        ).toBe(EARLY_ACCESS_WITHHELD_DESCRIPTION);
      }
    });

    it("screens through whitespace tricks", () => {
      expect(carriesForbiddenDescriptionTerm("i n j e c t")).toBe(true);
      expect(carriesForbiddenDescriptionTerm("A calm research catalog entry.")).toBe(
        false,
      );
    });

    it("keeps a safe description verbatim", () => {
      expect(projectOne(satisfied()).description).toBe(
        "A research catalog item held for internal review.",
      );
    });
  });

  describe("held rows", () => {
    it("returns a held row rather than dropping it", () => {
      const row = projectOne(satisfied({ variantFacts: [] }));
      expect(row.purchasable).toBe(false);
      expect(row.blockers).toEqual([
        "SUPPLIER_NOT_ASSIGNED",
        "FULFILLMENT_UNAVAILABLE",
        "QUANTITY_LIMIT_MISSING",
        "DOCUMENTATION_NOT_SATISFIED",
        "IDENTITY_DISPUTE_UNRESOLVED",
        "STRENGTH_DISPUTE_UNRESOLVED",
        "OFFER_STATE_NOT_PURCHASABLE",
      ]);
      expect(row.supplierReady).toBe(false);
      expect(row.availability).toBe("unavailable");
      expect(row.quantityLimit).toBeNull();
      expect(row.imageState).toBe("none");
      expect(row.disputeStatus).toEqual({ identity: "unknown", strength: "unknown" });
    });

    it("holds both rows when two records claim one identity", () => {
      const twin = satisfied({
        product: product({ variants: [variant({ id: "var-ea-0002" })] }),
        variantFacts: [facts({ variantId: "var-ea-0002" })],
      });
      const projection = projectEarlyAccessCatalog({
        products: [satisfied(), twin],
        now: NOW,
      });
      expect(projection.rows).toHaveLength(2);
      for (const row of projection.rows) {
        expect(row.purchasable).toBe(false);
        expect(row.blockers).toContain("IDENTITY_NOT_CONFIRMED");
      }
    });

    it("holds a unit the signed supplier master contests", () => {
      const contested = recordedVariantStrengthDisputes()[0];
      const row = projectOne(
        satisfied({
          product: product({ variants: [variant({ sku: contested.sku })] }),
        }),
      );
      expect(row.disputeStatus.strength).toBe("open");
      expect(row.blockers).toContain("STRENGTH_DISPUTE_UNRESOLVED");
      expect(row.purchasable).toBe(false);
    });

    it("reports a product that holds no variant instead of hiding it", () => {
      const projection = projectEarlyAccessCatalog({
        products: [satisfied({ product: product({ variants: [], prices: [] }) })],
        now: NOW,
      });
      expect(projection.rows).toEqual([]);
      expect(projection.productsWithoutVariants).toEqual([PRODUCT_ID]);
    });
  });

  it("sorts by display name, then sku, then variant", () => {
    const second = satisfied({
      product: product({
        id: "prod-ea-0002",
        productCode: "EA0002",
        slug: "alpha-item",
        displayName: "Alpha Item",
        variants: [
          variant({ id: "var-ea-0002", productId: "prod-ea-0002", sku: "EA-TEST-0002" }),
        ],
        prices: [],
      }),
      variantFacts: [],
    });
    const projection = projectEarlyAccessCatalog({
      products: [satisfied(), second],
      now: NOW,
    });
    expect(projection.rows.map((row) => row.displayName)).toEqual([
      "Alpha Item",
      "Early Access Test Item",
    ]);
  });
});

describe("summarizeEarlyAccessEligibility", () => {
  it("splits eligible from held and reports the blocker for every row", () => {
    const held = satisfied({
      product: product({
        id: "prod-ea-0003",
        productCode: "EA0003",
        slug: "held-item",
        displayName: "Held Item",
        variants: [
          variant({ id: "var-ea-0003", productId: "prod-ea-0003", sku: "EA-TEST-0003" }),
        ],
        prices: [],
      }),
      variantFacts: [facts({ variantId: "var-ea-0003" })],
    });
    const projection = projectEarlyAccessCatalog({
      products: [satisfied(), held],
      now: NOW,
    });
    const census = summarizeEarlyAccessEligibility(projection.rows);

    expect(census.eligibleRows).toHaveLength(1);
    expect(census.eligibleRows[0].productId).toBe(PRODUCT_ID);
    expect(census.heldRows).toHaveLength(1);
    expect(census.heldRows[0].productId).toBe("prod-ea-0003");

    expect(census.blockersByRow[earlyAccessRowKey(census.eligibleRows[0])]).toEqual(
      [],
    );
    // The facts on this record are declared against another variant, so they do
    // not describe this unit and none of them counts.
    expect(census.blockersByRow[earlyAccessRowKey(census.heldRows[0])]).toEqual([
      "PRICE_NOT_APPROVED",
      "SUPPLIER_NOT_ASSIGNED",
      "FULFILLMENT_UNAVAILABLE",
      "QUANTITY_LIMIT_MISSING",
      "DOCUMENTATION_NOT_SATISFIED",
    ]);
  });

  it("counts agree with the rows they came from", () => {
    const projection = projectEarlyAccessCatalog({
      products: [satisfied(), satisfied({ variantFacts: [] })],
      now: NOW,
    });
    const census = summarizeEarlyAccessEligibility(projection.rows);
    expect(census.eligibleRows.length + census.heldRows.length).toBe(
      projection.rows.length,
    );
  });

  it("merges blockers when two rows collide on one key", () => {
    const row = (blockers: EarlyAccessCatalogRow["blockers"]): EarlyAccessCatalogRow => ({
      ...projectOne(satisfied({ variantFacts: [] })),
      blockers,
      purchasable: false,
    });
    const census = summarizeEarlyAccessEligibility([
      row(["PRICE_NOT_APPROVED"]),
      row(["SUPPLIER_NOT_ASSIGNED"]),
    ]);
    const key = earlyAccessRowKey(census.heldRows[0]);
    expect(census.blockersByRow[key]).toEqual([
      "PRICE_NOT_APPROVED",
      "SUPPLIER_NOT_ASSIGNED",
    ]);
  });

  it("reports nothing eligible for an empty projection", () => {
    const census = summarizeEarlyAccessEligibility([]);
    expect(census).toEqual({ eligibleRows: [], heldRows: [], blockersByRow: {} });
  });
});

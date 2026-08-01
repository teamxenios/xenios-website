import { describe, expect, it, vi } from "vitest";
import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import {
  CatalogPricingProductSource,
  createAuthoritativePriceResolver,
} from "../pricing/authoritative-price-resolver";
import type {
  VariantIdentity,
  VariantLookupBySku,
} from "../pricing/cart-price-binding";
import { createCatalogVariantLookupBySku } from "../catalog/variant-sku-lookup";
import { recordedVariantStrengthDisputes } from "../products-diagnostics/variant-strength-dispute";
import type { ProductCatalogReader } from "../catalog/product-control-reader";
import {
  assertNoZeroOrNegativeCharge,
  createProductControlMoneyAuthority,
  denialForRefusal,
  isChargeableAmountCents,
  PRICE_AUTHORITY_FLAG,
  priceAuthorityEnabled,
  type MoneyPriceRefusalReason,
} from "./price-authority";

const AT = "2026-07-28T12:00:00.000Z";
const ASOF = new Date(AT);
const SKU = "SKU-A";

function variant(
  overrides: Partial<AdminProductVariant> = {},
): AdminProductVariant {
  return {
    id: "variant-a",
    productId: "product-a",
    sku: SKU,
    catalogNumber: null,
    label: "10 mg",
    strength: "10 mg",
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
    ...overrides,
  };
}

function price(overrides: Partial<AdminProductPrice> = {}): AdminProductPrice {
  return {
    id: "price-a",
    productId: "product-a",
    variantId: "variant-a",
    audience: "member",
    amountCents: 14900,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00.000Z",
    expiresAt: null,
    status: "active",
    approvalNote: "Approved by counsel",
    version: 2,
    createdBy: "admin-a",
    approvedBy: "admin-b",
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function detail(overrides: Partial<AdminProductDetail> = {}): AdminProductDetail {
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
    variants: [variant()],
    prices: [price()],
    media: [],
    history: [],
    ...overrides,
  };
}

function reader(catalog: AdminProductDetail[]): ProductCatalogReader {
  return { readCatalog: vi.fn(async () => catalog) };
}

/**
 * The REAL chain: the SKU lookup and the authoritative resolver over one
 * Product Control catalog. Nothing is faked between the seam and the
 * canonical resolver, so these tests drive the production decision path.
 */
function authorityOver(
  catalog: AdminProductDetail[],
  overrides: { audience?: "retail" | "member"; currency?: string; maxQuantity?: number } = {},
) {
  const catalogReader = reader(catalog);
  return createProductControlMoneyAuthority({
    variants: createCatalogVariantLookupBySku(catalogReader),
    priceResolver: createAuthoritativePriceResolver(
      new CatalogPricingProductSource(catalogReader),
    ),
    audience: {
      audience: overrides.audience ?? "member",
      sourceVersion: "research_member_session_v1",
    },
    currency: overrides.currency ?? "USD",
    ...(overrides.maxQuantity === undefined
      ? {}
      : { maxQuantity: overrides.maxQuantity }),
  });
}

async function priceOne(
  catalog: AdminProductDetail[],
  quantity = 2,
  overrides: Parameters<typeof authorityOver>[1] = {},
) {
  const map = await authorityOver(catalog, overrides).priceLines(
    [{ sku: SKU, quantity }],
    ASOF,
  );
  const decided = map.get(SKU);
  if (decided === undefined) throw new Error("expected a decision for the SKU");
  return decided;
}

// ---------------------------------------------------------------------------

describe("the flag", () => {
  it("is off by default and on only for the exact string true", () => {
    expect(PRICE_AUTHORITY_FLAG).toBe("RESEARCH_PRICE_AUTHORITY_ENABLED");
    expect(priceAuthorityEnabled({})).toBe(false);
    expect(priceAuthorityEnabled({ [PRICE_AUTHORITY_FLAG]: "true" })).toBe(true);
    for (const value of ["TRUE", "True", "1", "yes", "on", " true", "true "]) {
      expect(priceAuthorityEnabled({ [PRICE_AUTHORITY_FLAG]: value })).toBe(false);
    }
  });
});

describe("the zero floor", () => {
  it("accepts only a positive safe integer number of cents", () => {
    for (const value of [1, 14900, Number.MAX_SAFE_INTEGER]) {
      expect(isChargeableAmountCents(value)).toBe(true);
    }
    for (const value of [
      0,
      -1,
      -14900,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      "14900",
      null,
      undefined,
    ]) {
      expect(isChargeableAmountCents(value)).toBe(false);
    }
  });

  it("treats null as the honest no-price state and every non-positive number as a defect", () => {
    expect(assertNoZeroOrNegativeCharge(null)).toBe(true);
    expect(assertNoZeroOrNegativeCharge(14900)).toBe(true);
    expect(assertNoZeroOrNegativeCharge(0)).toBe(false);
    expect(assertNoZeroOrNegativeCharge(-1)).toBe(false);
  });
});

describe("the authority prices an exact identity", () => {
  it("returns the Product Control amount, the line total, and the full lineage", async () => {
    const decided = await priceOne([detail()], 2);
    expect(decided).toEqual({
      state: "priced",
      unitPriceCents: 14900,
      lineTotalCents: 29800,
      lineage: {
        productId: "product-a",
        variantId: "variant-a",
        priceId: "price-a",
        priceVersion: 2,
        audience: "member",
        currency: "USD",
        effectiveAt: "2026-07-01T00:00:00.000Z",
        expiresAt: null,
        pricedAt: AT,
      },
    });
  });

  it("leaks no supplier cost, margin, approver, or approval note", async () => {
    const decided = await priceOne([detail()]);
    const serialized = JSON.stringify(decided);
    for (const secret of [
      "Approved by counsel",
      "admin-a",
      "admin-b",
      "approvalNote",
      "approvedBy",
      "createdBy",
      "cost",
      "margin",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("prices every line of one batch at one instant, and resolves a SKU once", async () => {
    const catalogReader = reader([
      detail(),
      detail({
        id: "product-b",
        slug: "product-b",
        displayName: "Product B",
        variants: [variant({ id: "variant-b", productId: "product-b", sku: "SKU-B" })],
        prices: [
          price({ id: "price-b", productId: "product-b", variantId: "variant-b", amountCents: 5000 }),
        ],
      }),
    ]);
    const authority = createProductControlMoneyAuthority({
      variants: createCatalogVariantLookupBySku(catalogReader),
      priceResolver: createAuthoritativePriceResolver(
        new CatalogPricingProductSource(catalogReader),
      ),
      audience: { audience: "member", sourceVersion: "research_member_session_v1" },
      currency: "USD",
    });
    const map = await authority.priceLines(
      [
        { sku: SKU, quantity: 1 },
        { sku: "SKU-B", quantity: 3 },
        { sku: SKU, quantity: 99 },
      ],
      ASOF,
    );
    expect(map.size).toBe(2);
    const a = map.get(SKU);
    const b = map.get("SKU-B");
    expect(a?.state === "priced" && a.lineTotalCents).toBe(14900);
    expect(b?.state === "priced" && b.lineTotalCents).toBe(15000);
    expect(a?.state === "priced" && a.lineage.pricedAt).toBe(
      b?.state === "priced" ? b.lineage.pricedAt : "different",
    );
  });
});

describe("every existing failure state survives the seam", () => {
  const cases: Array<[string, AdminProductDetail[], MoneyPriceRefusalReason]> = [
    ["sku_unknown (the P0 defect)", [detail({ variants: [], prices: [] })], "sku_unknown"],
    ["price_missing", [detail({ prices: [] })], "price_missing"],
    [
      "price_ambiguous",
      [detail({ prices: [price(), price({ id: "price-b" })] })],
      "price_ambiguous",
    ],
    ["price_inactive", [detail({ prices: [price({ status: "retired" })] })], "price_inactive"],
    [
      "price_unapproved",
      [detail({ prices: [price({ approvedBy: null })] })],
      "price_unapproved",
    ],
    [
      "price_not_effective (surfaced as price_future)",
      [detail({ prices: [price({ effectiveAt: "2027-01-01T00:00:00.000Z" })] })],
      "price_future",
    ],
    [
      "price_expired",
      [
        detail({
          prices: [
            price({
              effectiveAt: "2026-01-01T00:00:00.000Z",
              expiresAt: "2026-02-01T00:00:00.000Z",
            }),
          ],
        }),
      ],
      "price_expired",
    ],
    [
      "wrong_audience",
      [detail({ prices: [price({ audience: "wholesale" })] })],
      "wrong_audience",
    ],
    [
      "wrong_currency",
      [detail({ prices: [price({ currency: "EUR" })] })],
      "wrong_currency",
    ],
    ["product_inactive", [detail({ active: false })], "product_inactive"],
    [
      "variant_inactive",
      [detail({ variants: [variant({ active: false })] })],
      "variant_inactive",
    ],
    [
      "variant_unapproved",
      [detail({ variants: [variant({ status: "draft" })] })],
      "variant_unapproved",
    ],
    [
      "member_ineligible",
      [detail({ variants: [variant({ memberEligible: false })] })],
      "member_ineligible",
    ],
  ];

  for (const [name, catalog, reason] of cases) {
    it(`refuses with ${name} and never produces a number`, async () => {
      const decided = await priceOne(catalog);
      expect(decided).toEqual({ state: "refused", reason });
    });
  }

  it("refuses every RECORDED contested strength, so the PR #205 guard now governs the charge too", async () => {
    // The disputes are real recorded catalog facts, not a fixture. Before this
    // seam existed the guard governed only what a member was SHOWN; a disputed
    // SKU could still be charged through facts.priceCents. Drive each one.
    const disputes = recordedVariantStrengthDisputes();
    expect(disputes.length).toBeGreaterThan(0);

    for (const dispute of disputes) {
      const contested = detail({
        variants: [variant({ sku: dispute.sku })],
        prices: [price()],
      });
      const map = await authorityOver([contested]).priceLines(
        [{ sku: dispute.sku, quantity: 1 }],
        ASOF,
      );
      // The canonical resolver decides variant_strength_disputed and returns
      // no row. The authoritative facade's classifier does not know about
      // disputes, so it reports the authority's silence as price_missing: the
      // LABEL is collapsed, the OUTCOME is not. A contested unit is refused,
      // and a refusal never produces a number.
      expect(map.get(dispute.sku)).toEqual({
        state: "refused",
        reason: "price_missing",
      });
      expect(denialForRefusal("price_missing")).toBe("unconfirmed_supplier_facts");
    }
  });

  it("refuses an out-of-policy quantity without consulting the catalog", async () => {
    const catalogReader = reader([detail()]);
    const authority = createProductControlMoneyAuthority({
      variants: createCatalogVariantLookupBySku(catalogReader),
      priceResolver: createAuthoritativePriceResolver(
        new CatalogPricingProductSource(catalogReader),
      ),
      audience: { audience: "member", sourceVersion: "research_member_session_v1" },
      currency: "USD",
      maxQuantity: 5,
    });
    for (const quantity of [0, -1, 1.5, 6, Number.NaN]) {
      const map = await authority.priceLines([{ sku: SKU, quantity }], ASOF);
      expect(map.get(SKU)).toEqual({ state: "refused", reason: "quantity_invalid" });
    }
    expect(catalogReader.readCatalog).not.toHaveBeenCalled();
  });

  it("refuses a non-positive Product Control amount rather than charging it", async () => {
    for (const amountCents of [0, -1, -14900]) {
      const decided = await priceOne([detail({ prices: [price({ amountCents })] })]);
      expect(decided.state).toBe("refused");
      expect(JSON.stringify(decided)).not.toContain("unitPriceCents");
    }
  });

  it("refuses an audience the server could not brand at this instant", async () => {
    const catalogReader = reader([detail()]);
    const authority = createProductControlMoneyAuthority({
      variants: createCatalogVariantLookupBySku(catalogReader),
      priceResolver: createAuthoritativePriceResolver(
        new CatalogPricingProductSource(catalogReader),
      ),
      audience: { audience: "member", sourceVersion: "   " },
      currency: "USD",
    });
    const map = await authority.priceLines([{ sku: SKU, quantity: 1 }], ASOF);
    expect(map.get(SKU)).toEqual({ state: "refused", reason: "audience_unauthorized" });
    expect(catalogReader.readCatalog).not.toHaveBeenCalled();
  });

  it("refuses a line total that would leave exact integer cents", async () => {
    const identity: VariantIdentity = {
      productId: "product-a",
      variantId: "variant-a",
      sku: SKU,
      displayName: "Product A",
    };
    const variants: VariantLookupBySku = {
      findVariantBySku: async () => identity,
    };
    const authority = createProductControlMoneyAuthority({
      variants,
      priceResolver: {
        resolveApprovedResearchPrice: async () => ({
          state: "available",
          price: {
            priceId: "price-a",
            productId: "product-a",
            variantId: "variant-a",
            audience: "member",
            amountCents: Number.MAX_SAFE_INTEGER,
            currency: "USD",
            effectiveAt: "2026-07-01T00:00:00.000Z",
            expiresAt: null,
            version: 2,
          },
        }),
      },
      audience: { audience: "member", sourceVersion: "research_member_session_v1" },
      currency: "USD",
    });
    const map = await authority.priceLines([{ sku: SKU, quantity: 1000 }], ASOF);
    expect(map.get(SKU)).toEqual({ state: "refused", reason: "line_total_overflow" });
  });
});

describe("refusals reach a member as blocking denials", () => {
  it("maps every refusal in the closed union to a code that blocks the line", () => {
    const reasons: MoneyPriceRefusalReason[] = [
      "sku_unknown",
      "audience_unauthorized",
      "invalid_instant",
      "price_missing",
      "price_ambiguous",
      "price_inactive",
      "price_unapproved",
      "price_future",
      "price_expired",
      "wrong_audience",
      "wrong_currency",
      "product_inactive",
      "variant_unapproved",
      "variant_inactive",
      "member_ineligible",
      "quantity_invalid",
      "line_total_overflow",
    ];
    const blocking = new Set([
      "product_not_found",
      "product_not_purchasable",
      "unconfirmed_supplier_facts",
      "quantity_invalid",
    ]);
    for (const reason of reasons) {
      expect(blocking.has(denialForRefusal(reason))).toBe(true);
    }
    // The defect's own reason is the most specific one a member can act on.
    expect(denialForRefusal("sku_unknown")).toBe("product_not_found");
  });
});

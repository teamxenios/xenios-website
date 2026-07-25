import { describe, expect, it } from "vitest";
import {
  notConfirmed,
  type CatalogProduct,
  type ProductLane,
} from "@shared/research/catalog";
import { PRODUCT_FAMILIES, PRODUCT_PAGE_SECTIONS } from "./model";
import {
  buildProductMaster,
  familyForCatalogProduct,
  searchProductMaster,
  summarizeFamilies,
  truthStateForCatalogProduct,
} from "./product-master";

function catalogProduct(
  overrides: Partial<CatalogProduct> & Pick<CatalogProduct, "sku" | "slug" | "displayName">,
): CatalogProduct {
  return {
    sku: overrides.sku,
    slug: overrides.slug,
    displayName: overrides.displayName,
    lane: "research_material",
    laneDecision: "decided",
    nameAliases: [],
    availability: "documentation_review",
    commerceApproval: "blocked_pending_written_approval",
    fulfillmentOwner: "mitch",
    facts: {
      composition: notConfirmed(),
      strength: notConfirmed(),
      format: notConfirmed(),
      priceCents: notConfirmed(),
      shelfLife: notConfirmed(),
      storage: notConfirmed(),
      coa: notConfirmed(),
    },
    guideState: "guide_in_development",
    qualityDocumentState: "missing",
    storageDataState: "missing",
    shippingProfileState: "missing",
    goalMappings: [],
    relatedGuideSlugs: [],
    prohibitedClaims: [],
    subscriptionEligible: false,
    lastReviewed: "2026-07-25",
    openSupplierQuestions: [],
    ...overrides,
  };
}

describe("Website 3 product master", () => {
  it("keeps product, variant, lot, certificate, media, content, and commerce separate", () => {
    const source = [
      catalogProduct({ sku: "P001", slug: "alpha", displayName: "Alpha Research Vial" }),
    ];
    const master = buildProductMaster(source, "2026-07-25T12:00:00.000Z", []);

    expect(Object.keys(master).sort()).toEqual(
      ["products", "variants", "lots", "certificates", "media", "content", "commerce"].sort(),
    );
    expect(master.products).toHaveLength(1);
    expect(master.variants).toHaveLength(1);
    expect(master.lots).toEqual([]);
    expect(master.certificates).toEqual([]);
    expect(master.media).toEqual([]);
    expect(master.content).toHaveLength(PRODUCT_PAGE_SECTIONS.length);
    expect(master.products[0]).not.toHaveProperty("priceCents");
    expect(master.products[0]).not.toHaveProperty("lots");
    expect(master.variants[0]).not.toHaveProperty("commerce");
  });

  it.each([
    ["supplement", "supplements"],
    ["quantum", "quantum"],
    ["future_clinical", "clinician_guided_care"],
    ["non_product_program", "programs"],
  ] as Array<[ProductLane, string]>)("maps %s to the %s family", (lane, expected) => {
    expect(
      familyForCatalogProduct(
        catalogProduct({ sku: "X", slug: "x", displayName: "X", lane }),
      ),
    ).toBe(expected);
  });

  it("separates blends from single research vials", () => {
    expect(
      familyForCatalogProduct(
        catalogProduct({ sku: "B", slug: "alpha-blend", displayName: "Alpha Blend" }),
      ),
    ).toBe("blends");
    expect(
      familyForCatalogProduct(
        catalogProduct({ sku: "V", slug: "alpha-vial", displayName: "Alpha Research Vial" }),
      ),
    ).toBe("research_vials");
  });

  it("never promotes unconfirmed price or review states to Available", () => {
    const source = catalogProduct({ sku: "P001", slug: "alpha", displayName: "Alpha" });
    const master = buildProductMaster([source], "2026-07-25T12:00:00.000Z", []);
    expect(truthStateForCatalogProduct(source)).toBe("under_review");
    expect(master.commerce[0]).toMatchObject({
      priceCents: null,
      purchasable: false,
      inventoryVisible: false,
    });
  });

  it("uses the canonical commerce decision instead of catalog approval alone", () => {
    const source = catalogProduct({
      sku: "P001",
      slug: "alpha",
      displayName: "Alpha",
      availability: "in_stock",
      commerceApproval: "approved",
    });
    const disabled = buildProductMaster(
      [source],
      "2026-07-25T12:00:00.000Z",
      [{ sku: "P001", purchasable: false, priceCents: 4900 }],
    );
    expect(disabled.commerce[0]).toMatchObject({
      truthState: "available",
      priceCents: 4900,
      purchasable: false,
    });
    expect(disabled.commerce[0].checkoutMessage).not.toBeNull();

    const enabled = buildProductMaster(
      [source],
      "2026-07-25T12:00:00.000Z",
      [{ sku: "P001", purchasable: true, priceCents: 4900 }],
    );
    expect(enabled.commerce[0]).toMatchObject({
      truthState: "available",
      priceCents: 4900,
      purchasable: true,
    });
  });

  it("publishes all requested family filters, including empty families, without fake products", () => {
    const master = buildProductMaster(
      [catalogProduct({ sku: "P001", slug: "alpha", displayName: "Alpha" })],
      "2026-07-25T12:00:00.000Z",
      [],
    );
    const summaries = summarizeFamilies(master);
    expect(summaries.map((entry) => entry.family)).toEqual(["all_products", ...PRODUCT_FAMILIES]);
    expect(summaries.find((entry) => entry.family === "diagnostics")?.productCount).toBe(0);
  });

  it("searches aliases and filters by family", () => {
    const master = buildProductMaster(
      [
        catalogProduct({
          sku: "P001",
          slug: "epitalon-10mg",
          displayName: "Epitalon Research Vial",
          nameAliases: ["Epithalon"],
        }),
        catalogProduct({
          sku: "P002",
          slug: "daily-foundation",
          displayName: "Daily Foundation",
          lane: "supplement",
        }),
      ],
      "2026-07-25T12:00:00.000Z",
      [],
    );
    expect(searchProductMaster(master, "epithalon").map((product) => product.slug)).toEqual([
      "epitalon-10mg",
    ]);
    expect(searchProductMaster(master, "", "supplements").map((product) => product.slug)).toEqual([
      "daily-foundation",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  allVariantsWithProduct,
  PEPTIDE_CATALOG,
} from "@shared/research/catalog/peptide-catalog";
import { canAddToCart } from "@shared/research/early-access-hardening";
import {
  PEPTIDE_ROADMAP_DISPLAY_LABELS,
  PEPTIDE_ROADMAP_DISPLAY_STATUSES,
} from "@shared/research/early-access-roadmap";
import type { EarlyAccessStorefrontUnit } from "../release/storefront-view";
import {
  PEPTIDE_ROADMAP_AUDIT,
  PEPTIDE_ROADMAP_ROWS,
} from "./peptide-roadmap-data";
import {
  buildPeptideRoadmapMappingReport,
  buildPeptideRoadmapProjection,
  PeptideRoadmapOverrideError,
  publicRoadmapPayloadIsClean,
  validateThisWeekOverrides,
} from "./peptide-roadmap";

function liveUnit(
  sku: string,
  overrides: Partial<EarlyAccessStorefrontUnit> = {},
): EarlyAccessStorefrontUnit {
  return {
    productId: "PC-PRODUCT",
    variantId: `PC-${sku}`,
    slug: "product",
    displayName: "Live Product Control name",
    canonicalName: "Live Product Control name",
    sku,
    strength: "10 mg",
    presentation: "Single vial",
    description: "",
    imageState: "none",
    quantityLimit: null,
    state: "request_access",
    priceCents: null,
    currency: "",
    basis: null,
    releaseId: null,
    productVersion: null,
    productControlBlockers: [],
    waivedBlockers: [],
    hold: null,
    availability: "AVAILABILITY_CONFIRMATION_REQUIRED",
    purchasable: false,
    ...overrides,
  };
}

function canonicalProductControlUnits(): readonly EarlyAccessStorefrontUnit[] {
  return allVariantsWithProduct(PEPTIDE_CATALOG).map(({ product, variant }) =>
    liveUnit(variant.sku, {
      productId: product.internalProductCode,
      variantId: variant.sku,
      displayName: product.displayName,
      canonicalName: product.canonicalName,
      strength: variant.strength,
    }),
  );
}

const MONDAY = new Date("2026-08-03T12:00:00.000Z");

function thisWeekOverride(catalogId: string) {
  return {
    catalogId,
    stage: "this_week",
    availableOn: "2026-08-05",
    ownerActor: "catalog-owner@example.test",
    evidenceRef: "EA-CATALOG-CHANGE-42",
    version: 1,
    recordedAt: "2026-08-03T12:30:00.000Z",
  } as const;
}

describe("peptide roadmap source", () => {
  it("pins the eight required customer-facing display states", () => {
    expect(
      PEPTIDE_ROADMAP_DISPLAY_STATUSES.map(
        (status) => PEPTIDE_ROADMAP_DISPLAY_LABELS[status],
      ),
    ).toEqual([
      "Available now",
      "Available this week",
      "Temporarily unavailable",
      "Approval required",
      "Request access",
      "Planned",
      "Care pathway only",
      "Unavailable",
    ]);
  });

  it("preserves the audited 143/70/73/0/57/0 inventory", () => {
    expect(PEPTIDE_ROADMAP_ROWS).toHaveLength(143);
    expect(new Set(PEPTIDE_ROADMAP_ROWS.map((row) => row.catalogId)).size).toBe(143);
    expect(PEPTIDE_ROADMAP_ROWS.filter((row) => row.liveSku !== null)).toHaveLength(70);
    expect(PEPTIDE_ROADMAP_AUDIT).toEqual({
      roadmapVariants: 143,
      exactProductControlMatches: 70,
      unmapped: 73,
      ambiguous: 0,
      aminoPlanningVariants: 57,
      aminoLiveProductControlMatches: 0,
    });
  });

  it("keeps all 57 Amino variants planning-only with no live join key", () => {
    const amino = PEPTIDE_ROADMAP_ROWS.filter((row) => row.catalogId.startsWith("XAC-"));
    expect(amino).toHaveLength(57);
    expect(
      amino.every(
        (row) =>
          row.sourceAvailability === "Planning / supplier quote needed" &&
          row.liveSku === null,
      ),
    ).toBe(true);
  });

  it("contains no commerce-sensitive fields", () => {
    expect(publicRoadmapPayloadIsClean(PEPTIDE_ROADMAP_ROWS)).toBe(true);
    expect(JSON.stringify(PEPTIDE_ROADMAP_ROWS)).not.toMatch(
      /wholesale|marginCents|supplierId|supplierSku|internalNotes?/i,
    );
  });
});

describe("exact Product Control mapping", () => {
  it("reproduces the audited 70 exact and 73 unmapped results with zero ambiguity", () => {
    const report = buildPeptideRoadmapMappingReport({
      liveUnits: canonicalProductControlUnits(),
    });
    expect(report.roadmapVariants).toBe(143);
    expect(report.exact).toBe(70);
    expect(report.unmapped).toBe(73);
    expect(report.ambiguous).toBe(0);
    expect(report.aminoPlanningVariants).toBe(57);
    expect(report.aminoExact).toBe(0);
  });

  it("fails closed when Product Control contains a duplicate SKU", () => {
    const sku = PEPTIDE_ROADMAP_ROWS.find((row) => row.liveSku !== null)!.liveSku!;
    const report = buildPeptideRoadmapMappingReport({
      liveUnits: [liveUnit(sku), liveUnit(sku, { productId: "OTHER" })],
    });
    const row = report.rows.find((candidate) => candidate.catalogId === sku);
    expect(row?.state).toBe("ambiguous");
    expect(row?.productId).toBeNull();

    const card = buildPeptideRoadmapProjection({
      liveUnits: [liveUnit(sku), liveUnit(sku, { productId: "OTHER" })],
      now: MONDAY,
    }).cards.find((candidate) => candidate.catalogId === sku)!;
    expect(card.addToCart).toBeNull();
    expect(card.priceDisplay).toBeNull();
    expect(canAddToCart(card)).toBe(false);
  });
});

describe("Product Control-only commerce authority", () => {
  const exactRow = PEPTIDE_ROADMAP_ROWS.find((row) => row.liveSku !== null)!;

  it("takes IDs and price only from an exact live purchasable unit", () => {
    const unit = liveUnit(exactRow.liveSku!, {
      productId: "LIVE-PRODUCT-ID",
      variantId: "LIVE-VARIANT-ID",
      state: "purchasable",
      priceCents: 12_345,
      currency: "USD",
      availability: "AVAILABLE",
      purchasable: true,
      basis: "product_control",
    });
    const card = buildPeptideRoadmapProjection({ liveUnits: [unit], now: MONDAY })
      .cards.find((candidate) => candidate.catalogId === exactRow.catalogId)!;

    expect(card.liveCommerce).toBe("purchasable");
    expect(card.displayStatus).toBe("available_now");
    expect(card.addToCart).toEqual({
      productId: "LIVE-PRODUCT-ID",
      variantId: "LIVE-VARIANT-ID",
      unitPriceCents: 12_345,
      currency: "USD",
    });
    expect(card.priceDisplay).toBe("$123.45");
    expect(canAddToCart(card)).toBe(true);
  });

  it("never shows a price or Add for a live held unit", () => {
    const unit = liveUnit(exactRow.liveSku!, {
      state: "held",
      priceCents: 12_345,
      currency: "USD",
      availability: "TEMPORARILY_HELD",
      purchasable: false,
    });
    const card = buildPeptideRoadmapProjection({ liveUnits: [unit], now: MONDAY })
      .cards.find((candidate) => candidate.catalogId === exactRow.catalogId)!;
    expect(card.liveCommerce).toBe("held");
    expect(card.displayStatus).toBe("temporarily_unavailable");
    expect(card.addToCart).toBeNull();
    expect(card.priceDisplay).toBeNull();
    expect(canAddToCart(card)).toBe(false);
  });

  it("cannot mint authority from a roadmap-only this-week status", () => {
    const row = PEPTIDE_ROADMAP_ROWS.find((candidate) => candidate.liveSku === null)!;
    const card = buildPeptideRoadmapProjection({
      liveUnits: [],
      overrides: [thisWeekOverride(row.catalogId)],
      now: MONDAY,
    }).cards.find((candidate) => candidate.catalogId === row.catalogId)!;
    expect(card.roadmapStage).toBe("this_week");
    expect(card.displayStatus).toBe("available_this_week");
    expect(card.liveCommerce).toBe("unavailable");
    expect(card.addToCart).toBeNull();
    expect(card.priceDisplay).toBeNull();
    expect(canAddToCart(card)).toBe(false);
  });

  it("does not join by a matching name or strength", () => {
    const roadmapOnly = PEPTIDE_ROADMAP_ROWS.find((row) => row.liveSku === null)!;
    const unit = liveUnit("UNRELATED-SKU", {
      displayName: roadmapOnly.displayName,
      strength: roadmapOnly.strength,
      state: "purchasable",
      priceCents: 9_900,
      currency: "USD",
      availability: "AVAILABLE",
      purchasable: true,
    });
    const card = buildPeptideRoadmapProjection({ liveUnits: [unit], now: MONDAY })
      .cards.find((candidate) => candidate.catalogId === roadmapOnly.catalogId)!;
    expect(card.addToCart).toBeNull();
    expect(card.priceDisplay).toBeNull();
  });
});

describe("this-week override validation", () => {
  const catalogId = PEPTIDE_ROADMAP_ROWS[0].catalogId;

  it("accepts a fully attributable future date in the current week", () => {
    const accepted = validateThisWeekOverrides({
      overrides: [thisWeekOverride(catalogId)],
      now: MONDAY,
    });
    expect(accepted.get(catalogId)).toEqual(thisWeekOverride(catalogId));
  });

  it.each([
    ["unknown catalog", { ...thisWeekOverride("UNKNOWN") }],
    ["missing owner", { ...thisWeekOverride(catalogId), ownerActor: "" }],
    ["missing evidence", { ...thisWeekOverride(catalogId), evidenceRef: "" }],
    ["invalid version", { ...thisWeekOverride(catalogId), version: 0 }],
    ["invented date", { ...thisWeekOverride(catalogId), availableOn: "soon" }],
    ["outside current week", { ...thisWeekOverride(catalogId), availableOn: "2026-08-10" }],
    ["not future", { ...thisWeekOverride(catalogId), availableOn: "2026-08-03" }],
    ["invalid audit instant", { ...thisWeekOverride(catalogId), recordedAt: "today" }],
  ])("rejects %s", (_label, override) => {
    expect(() => validateThisWeekOverrides({ overrides: [override], now: MONDAY })).toThrow(
      PeptideRoadmapOverrideError,
    );
  });

  it("rejects duplicate overrides", () => {
    expect(() =>
      validateThisWeekOverrides({
        overrides: [thisWeekOverride(catalogId), thisWeekOverride(catalogId)],
        now: MONDAY,
      }),
    ).toThrow(/duplicate/);
  });
});

describe("public payload guard", () => {
  it("accepts the explicit public projection", () => {
    const projection = buildPeptideRoadmapProjection({ liveUnits: [], now: MONDAY });
    expect(publicRoadmapPayloadIsClean(projection)).toBe(true);
  });

  it("rejects forbidden fields at any depth", () => {
    expect(publicRoadmapPayloadIsClean({ nested: { supplierSku: "secret" } })).toBe(false);
    expect(publicRoadmapPayloadIsClean([{ marginCents: 1 }])).toBe(false);
    expect(publicRoadmapPayloadIsClean({ internalNotes: ["secret"] })).toBe(false);
  });
});

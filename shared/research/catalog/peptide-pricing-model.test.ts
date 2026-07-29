import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allVariantsWithProduct, PEPTIDE_CATALOG } from "./peptide-catalog";
import {
  canActivatePricing,
  PEPTIDE_PRICING_GATES,
  pricingGatesBySeverity,
  withGatesCleared,
} from "./peptide-pricing-gates";
import {
  expansionTargetFromMarketReference,
  findPriceTarget,
  FOUNDER_PRICING_POLICY,
  IMMEDIATE_FOUNDER_INPUTS,
  joinToCatalog,
  MARKET_EVIDENCE_SUMMARY,
  MATERIAL_IDENTITY_CONFLICT_COUNT,
  memberPriceCentsForDisplay,
  OVERRIDE_TARGET_COUNT,
  PEPTIDE_PRICE_TARGET_COUNT,
  PEPTIDE_PRICE_TARGETS,
  PEPTIDE_PRICING_CONFIDENCES,
  PEPTIDE_PRICING_WORKBOOK,
  priceAppliesToRecordedPresentation,
  PRICED_VARIANT_COUNT,
  pricedTargets,
  priceTargetsForTier,
  PRICING_DOCTRINE,
  recommendedMemberPriceTargets,
  resolvePriceStatus,
  SOURCE_DASH_SCAN,
  SUB_CENT_ROUNDING_LEDGER,
  targetsWithMaterialIdentityConflict,
  UNPRICED_VARIANT_COUNT,
  unpricedTargets,
} from "./peptide-pricing-model";

// Written as escapes on purpose. This directory forbids both characters in every
// file, so a test that carried a literal one would be the violation it exists to catch.
const EM_DASH = "\u2014";
const EN_DASH = "\u2013";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

/**
 * The workbook's fifteen recommended member prices, transcribed a second time
 * straight from its "Market Benchmarks" and "Current 15 Pricing" sheets, in sheet
 * order:
 *
 *   [variant SKU, product code, market low, median, P75, recommended, confidence,
 *    identity conflict]
 *
 * Every assertion about the fifteen resolves back to this table, so an edit to the
 * module cannot pass by changing a value and its test together. The medians and
 * P75s are the cent-rounded values; SUB_CENT_ROUNDING_LEDGER carries the seven
 * exact sheet values that did not land on a whole cent.
 */
const CURRENT_FIFTEEN: ReadonlyArray<
  [string, string, number, number, number, number, string, string]
> = [
  [
    "R360-BPC157_TB500-15MG_15MG-VIAL",
    "PEP-001",
    4400,
    10000,
    10375,
    10900,
    "High",
    "STRENGTH",
  ],
  [
    "R360-BPC157_TB500_GHKCU-10MG_10MG_50MG-VIAL",
    "PEP-002",
    9900,
    13000,
    18750,
    14900,
    "High",
    "COMPONENT ORDER ONLY",
  ],
  [
    "R360-TB500_BPC157_GHKCU_KPV-5MG_5MG_10MG_5MG-VIAL",
    "PEP-003",
    10500,
    15100,
    16974,
    19900,
    "High",
    "STRENGTH",
  ],
  [
    "R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL",
    "PEP-004",
    15000,
    18500,
    20000,
    18900,
    "Low",
    "NONE",
  ],
  ["R360-CJC1295_IPAMORELIN-5MG_5MG-VIAL", "PEP-005", 3999, 8000, 10000, 10900, "High", "NONE"],
  ["R360-PT141-10MG-VIAL", "PEP-006", 3000, 4500, 5500, 6900, "High", "NONE"],
  ["R360-TESAMORELIN-10MG-VIAL", "PEP-007", 3800, 5500, 6500, 7900, "Medium", "STRENGTH"],
  ["R360-GONADORELIN-5MG-VIAL", "PEP-008", 2888, 3750, 4000, 4900, "High", "STRENGTH"],
  ["R360-NAD-500MG-VIAL", "PEP-009", 1999, 4500, 4800, 5900, "High", "STRENGTH"],
  ["R360-MOTSC-10MG-VIAL", "PEP-010", 4900, 5500, 5874, 6900, "Medium", "STRENGTH"],
  ["R360-EPITHALON-10MG-VIAL", "PEP-011", 2500, 4500, 5500, 5900, "Medium", "STRENGTH"],
  ["R360-SS31-10MG-VIAL", "PEP-012", 7500, 9950, 11300, 10900, "Low", "STRENGTH"],
  [
    "R360-SLUPP332-250MCGX100-CAP",
    "PEP-013",
    10099,
    12200,
    13425,
    12900,
    "Low",
    "STRENGTH + PACK COUNT",
  ],
  ["R360-DIHEXA-10MGX60-CAP", "PEP-014", 3900, 14000, 14400, 14900, "Medium", "PACK COUNT"],
  [
    "R360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL",
    "PEP-015",
    11000,
    13950,
    15550,
    14900,
    "Low",
    "STRENGTH",
  ],
];

/** The seven market statistics the sheet holds at sub-cent precision. */
const SUB_CENT_TRANSCRIPTION: ReadonlyArray<[string, string, string, number]> = [
  ["P001", "marketMedianCents", "99.995", 10000],
  ["P002", "marketMedianCents", "129.995", 13000],
  ["P003", "marketMedianCents", "150.995", 15100],
  ["P003", "marketP75Cents", "169.7425", 16974],
  ["P005", "marketP75Cents", "99.995", 10000],
  ["P010", "marketMedianCents", "54.995000000000005", 5500],
  ["P010", "marketP75Cents", "58.7425", 5874],
];

describe("provenance", () => {
  it("records the exact workbook it was imported from", () => {
    expect(PEPTIDE_PRICING_WORKBOOK.fileName).toBe(
      "XENIOS_PEPTIDE_MASTER_PRICING_MODEL_2026-07-29.xlsx",
    );
    expect(PEPTIDE_PRICING_WORKBOOK.sha256).toBe(
      "f11742ae7801bcf465a5cf1a68af5ebdfab5dee9b6fba60aa9468e880161d519",
    );
    expect(PEPTIDE_PRICING_WORKBOOK.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(PEPTIDE_PRICING_WORKBOOK.sheets).toHaveLength(11);
    expect(PEPTIDE_PRICING_WORKBOOK.upstreamSources).toContain(
      "XENIOS_MITCH_CODE_EXTRACTED_CATALOG.json",
    );
  });

  it("states what the market evidence is and is not", () => {
    expect(MARKET_EVIDENCE_SUMMARY.sitesReviewed).toBe(50);
    expect(MARKET_EVIDENCE_SUMMARY.priceObservations).toBe(97);
    expect(MARKET_EVIDENCE_SUMMARY.caveat).toContain("not legal or quality endorsements");
  });

  it("records that the source needed no dash normalisation", () => {
    expect(SOURCE_DASH_SCAN.emDashOccurrences).toBe(0);
    expect(SOURCE_DASH_SCAN.enDashOccurrences).toBe(0);
    expect(SOURCE_DASH_SCAN.fieldsNormalised).toEqual([]);
  });

  it("carries the founder's doctrine and open inputs verbatim", () => {
    expect(PRICING_DOCTRINE).toHaveLength(8);
    expect(PRICING_DOCTRINE[1]).toContain("Do not use a fake struck-through MSRP");
    expect(PRICING_DOCTRINE[7]).toContain("never compare mismatched mg or pack counts");
    expect(IMMEDIATE_FOUNDER_INPUTS).toHaveLength(5);
    expect(IMMEDIATE_FOUNDER_INPUTS[2]).toContain("0 of 65");
  });
});

describe("the join to the implemented catalog", () => {
  it("matches every price row to a catalog variant and back, with nothing unmatched", () => {
    const join = joinToCatalog();
    expect(join.matchedSkus).toHaveLength(PEPTIDE_PRICE_TARGET_COUNT);
    expect(join.skusMissingFromCatalog).toEqual([]);
    expect(join.skusMissingFromModel).toEqual([]);
    expect(join.fieldMismatches).toEqual([]);
  });

  it("prices exactly the variants the catalog holds, no more and no fewer", () => {
    const catalogSkus = allVariantsWithProduct(PEPTIDE_CATALOG).map((row) => row.variant.sku);
    expect(catalogSkus).toHaveLength(PEPTIDE_PRICE_TARGET_COUNT);
    expect(new Set(PEPTIDE_PRICE_TARGETS.map((target) => target.variantSku))).toEqual(
      new Set(catalogSkus),
    );
  });

  it("holds one row per SKU", () => {
    expect(PEPTIDE_PRICE_TARGETS).toHaveLength(PEPTIDE_PRICE_TARGET_COUNT);
    expect(new Set(PEPTIDE_PRICE_TARGETS.map((target) => target.variantSku)).size).toBe(
      PEPTIDE_PRICE_TARGET_COUNT,
    );
  });

  it("agrees with the catalog on tier counts", () => {
    expect(priceTargetsForTier("workbook")).toHaveLength(21);
    expect(priceTargetsForTier("expansion")).toHaveLength(33);
    expect(priceTargetsForTier("regulatory_hold")).toHaveLength(16);
  });

  it("returns null for an unknown SKU rather than guessing a price", () => {
    expect(findPriceTarget("R360-NOT-A-REAL-SKU")).toBeNull();
  });
});

describe("the fifteen recommended member prices", () => {
  it("transcribes each one exactly as the workbook states it", () => {
    expect(recommendedMemberPriceTargets()).toHaveLength(OVERRIDE_TARGET_COUNT);
    expect(recommendedMemberPriceTargets().map((target) => target.variantSku)).toEqual(
      CURRENT_FIFTEEN.map(([sku]) => sku),
    );
    for (const [sku, code, low, median, p75, target, confidence, conflict] of CURRENT_FIFTEEN) {
      const row = findPriceTarget(sku);
      expect(row, sku).not.toBeNull();
      expect(row!.workbookProductCode, sku).toBe(code);
      expect(row!.marketLowCents, sku).toBe(low);
      expect(row!.marketMedianCents, sku).toBe(median);
      expect(row!.marketP75Cents, sku).toBe(p75);
      expect(row!.overrideTargetCents, sku).toBe(target);
      expect(row!.draftTargetCents, sku).toBe(target);
      expect(row!.confidence, sku).toBe(confidence);
      expect(row!.identityConflict, sku).toBe(conflict);
    }
  });

  it("carries the market evidence and the priced presentation on all fifteen, and nowhere else", () => {
    const fifteen = new Set(CURRENT_FIFTEEN.map(([sku]) => sku));
    for (const row of PEPTIDE_PRICE_TARGETS) {
      const expected = fifteen.has(row.variantSku);
      expect(row.marketMedianCents !== null, row.variantSku).toBe(expected);
      expect(row.observationCount !== null, row.variantSku).toBe(expected);
      expect(row.comparableBasis !== null, row.variantSku).toBe(expected);
      expect(row.method !== null, row.variantSku).toBe(expected);
      expect(row.pricedPresentation !== null, row.variantSku).toBe(expected);
      expect(row.pricingRationale !== null, row.variantSku).toBe(expected);
      expect(row.targetVsMedian !== null, row.variantSku).toBe(expected);
    }
  });

  it("rests every median on a stated number of observations, never on none", () => {
    for (const row of recommendedMemberPriceTargets()) {
      expect(row.observationCount, row.variantSku).toBeGreaterThan(0);
      expect(row.marketLowCents!, row.variantSku).toBeLessThanOrEqual(row.marketMedianCents!);
      expect(row.marketMedianCents!, row.variantSku).toBeLessThanOrEqual(row.marketP75Cents!);
    }
  });

  it("derives the premium over the median from the two numbers it reports", () => {
    for (const row of recommendedMemberPriceTargets()) {
      const derived = row.draftTargetCents! / row.marketMedianCents! - 1;
      expect(Math.abs(row.targetVsMedian! - derived), row.variantSku).toBeLessThan(0.0002);
    }
  });

  it("prices eleven of the fifteen for a materially different presentation", () => {
    const conflicted = targetsWithMaterialIdentityConflict();
    expect(conflicted).toHaveLength(MATERIAL_IDENTITY_CONFLICT_COUNT);
    for (const row of conflicted) {
      expect(row.overrideTargetCents, row.variantSku).not.toBeNull();
      expect(priceAppliesToRecordedPresentation(row), row.variantSku).toBe(false);
      expect(row.pricedPresentation, row.variantSku).not.toBeNull();
    }
    const clean = PEPTIDE_PRICE_TARGETS.filter(priceAppliesToRecordedPresentation);
    expect(clean).toHaveLength(PEPTIDE_PRICE_TARGET_COUNT - MATERIAL_IDENTITY_CONFLICT_COUNT);
  });

  it("holds the 15 mg blend price against a 5 mg presentation, and says so", () => {
    const row = findPriceTarget("R360-BPC157_TB500-15MG_15MG-VIAL")!;
    expect(row.draftTargetCents).toBe(10900);
    expect(row.pricedPresentation).toContain("5 mg BPC-157 / 5 mg TB-500");
    expect(priceAppliesToRecordedPresentation(row)).toBe(false);
  });
});

describe("the numbers, and what is absent", () => {
  it("prices 54 variants and leaves 16 without a price", () => {
    expect(pricedTargets()).toHaveLength(PRICED_VARIANT_COUNT);
    expect(unpricedTargets()).toHaveLength(UNPRICED_VARIANT_COUNT);
    expect(PRICED_VARIANT_COUNT + UNPRICED_VARIANT_COUNT).toBe(PEPTIDE_PRICE_TARGET_COUNT);
  });

  it("leaves every regulatory-hold variant blank and unavailable, and only those", () => {
    for (const row of unpricedTargets()) {
      expect(row.tier, row.variantSku).toBe("regulatory_hold");
      expect(row.draftTargetCents, row.variantSku).toBeNull();
      expect(row.overrideTargetCents, row.variantSku).toBeNull();
      expect(row.priceStatus, row.variantSku).toBe("NO_PRICE_REGULATORY_HOLD");
      expect(row.workbookActivationStatus, row.variantSku).toBe("UNAVAILABLE");
    }
    for (const row of priceTargetsForTier("regulatory_hold")) {
      expect(row.draftTargetCents, row.variantSku).toBeNull();
    }
    for (const row of pricedTargets()) {
      expect(row.workbookActivationStatus, row.variantSku).toBe("DRAFT / REQUEST ACCESS");
    }
  });

  it("never uses zero as a placeholder for a missing price", () => {
    for (const row of PEPTIDE_PRICE_TARGETS) {
      for (const field of [
        "marketReferenceCents",
        "overrideTargetCents",
        "draftTargetCents",
        "marketLowCents",
        "marketMedianCents",
        "marketP75Cents",
      ] as const) {
        const value = row[field];
        if (value === null) continue;
        expect(value, `${row.variantSku} ${field}`).toBeGreaterThan(0);
        expect(Number.isSafeInteger(value), `${row.variantSku} ${field}`).toBe(true);
      }
    }
  });

  it("holds every price at or above the founder's minimum member price", () => {
    for (const row of pricedTargets()) {
      expect(row.draftTargetCents!, row.variantSku).toBeGreaterThanOrEqual(
        FOUNDER_PRICING_POLICY.minimumMemberPriceCents,
      );
    }
  });

  it("puts the founder's own fifteen on the x9 ladder and the formula targets on the $5 ladder", () => {
    for (const row of PEPTIDE_PRICE_TARGETS) {
      if (row.overrideTargetCents !== null) {
        expect(row.overrideTargetCents % 1000, row.variantSku).toBe(900);
        continue;
      }
      if (row.draftTargetCents === null) continue;
      expect(row.draftTargetCents % FOUNDER_PRICING_POLICY.roundingStepCents, row.variantSku).toBe(
        0,
      );
    }
  });

  it("reproduces all 39 formula-derived targets from the market reference", () => {
    const formulaRows = PEPTIDE_PRICE_TARGETS.filter(
      (row) => row.overrideTargetCents === null && row.draftTargetCents !== null,
    );
    expect(formulaRows).toHaveLength(39);
    for (const row of formulaRows) {
      expect(row.marketReferenceCents, row.variantSku).not.toBeNull();
      expect(expansionTargetFromMarketReference(row.marketReferenceCents!), row.variantSku).toBe(
        row.draftTargetCents,
      );
    }
  });

  it("uses only the closed confidence vocabulary, and mostly a single reference", () => {
    for (const row of PEPTIDE_PRICE_TARGETS) {
      expect(PEPTIDE_PRICING_CONFIDENCES, row.variantSku).toContain(row.confidence);
    }
    expect(
      PEPTIDE_PRICE_TARGETS.filter((row) => row.confidence === "Single reference"),
    ).toHaveLength(55);
  });

  it("records the seven sub-cent roundings with their exact sheet values", () => {
    expect(SUB_CENT_ROUNDING_LEDGER).toHaveLength(SUB_CENT_TRANSCRIPTION.length);
    SUB_CENT_TRANSCRIPTION.forEach(([code, field, sheetValue, stored], index) => {
      const entry = SUB_CENT_ROUNDING_LEDGER[index];
      expect(entry.workbookProductCode).toBe(code);
      expect(entry.field).toBe(field);
      expect(entry.sheetValueUsd).toBe(sheetValue);
      expect(entry.storedCents).toBe(stored);
      expect(Math.round(Number(sheetValue) * 100)).toBe(stored);
      const row = PEPTIDE_PRICE_TARGETS.find(
        (candidate) => candidate.workbookProductCode === `PEP-${code.slice(1)}`,
      );
      expect(row, code).toBeDefined();
      expect(row![entry.field]).toBe(stored);
    });
  });
});

describe("expansionTargetFromMarketReference", () => {
  it("applies the 15% uplift then rounds up to the $5 ladder", () => {
    expect(expansionTargetFromMarketReference(8799)).toBe(10500);
    expect(expansionTargetFromMarketReference(9999)).toBe(11500);
    expect(expansionTargetFromMarketReference(19999)).toBe(23000);
  });

  it("holds a cheap reference at the minimum member price, rounded to the ladder", () => {
    expect(expansionTargetFromMarketReference(3499)).toBe(5000);
    expect(expansionTargetFromMarketReference(100)).toBe(5000);
  });

  it("refuses a zero, a negative, and a fractional cent", () => {
    expect(() => expansionTargetFromMarketReference(0)).toThrow(RangeError);
    expect(() => expansionTargetFromMarketReference(-100)).toThrow(RangeError);
    expect(() => expansionTargetFromMarketReference(10.5)).toThrow(RangeError);
  });
});

describe("no price may be active while a gate blocks", () => {
  it("imports every price as a founder draft target, never as an active price", () => {
    for (const row of pricedTargets()) {
      expect(row.priceStatus, row.variantSku).toBe("FOUNDER_APPROVED_DRAFT_TARGET");
    }
    for (const row of PEPTIDE_PRICE_TARGETS) {
      expect(row.priceStatus, row.variantSku).not.toBe("ACTIVE_MEMBER_PRICE");
      expect(row.effectiveDate, row.variantSku).toBeNull();
      expect(row.currency, row.variantSku).toBe("USD");
      expect(row.audience, row.variantSku).toBe("member");
    }
  });

  it("resolves no row to an active price against the real gate record", () => {
    const activation = canActivatePricing();
    expect(activation.allowed).toBe(false);
    for (const row of PEPTIDE_PRICE_TARGETS) {
      const status = resolvePriceStatus({
        tier: row.tier,
        draftTargetCents: row.draftTargetCents,
        activation,
      });
      expect(status, row.variantSku).not.toBe("ACTIVE_MEMBER_PRICE");
      expect(status, row.variantSku).toBe(row.priceStatus);
    }
  });

  it("hands back no displayable member price for any variant today", () => {
    for (const row of PEPTIDE_PRICE_TARGETS) {
      expect(memberPriceCentsForDisplay(row), row.variantSku).toBeNull();
    }
  });

  it("blocks by default when a caller forgets to pass a gate verdict", () => {
    const row = findPriceTarget("R360-PT141-10MG-VIAL")!;
    expect(resolvePriceStatus({ tier: row.tier, draftTargetCents: row.draftTargetCents })).toBe(
      "FOUNDER_APPROVED_DRAFT_TARGET",
    );
    expect(memberPriceCentsForDisplay(row)).toBeNull();
  });

  it("keeps every price a draft while any single critical gate is still failing", () => {
    for (const critical of pricingGatesBySeverity("CRITICAL")) {
      const others = PEPTIDE_PRICING_GATES.map((gate) => gate.id).filter(
        (id) => id !== critical.id,
      );
      const activation = canActivatePricing(withGatesCleared(others));
      expect(activation.allowed, critical.id).toBe(false);
      for (const row of pricedTargets()) {
        expect(
          resolvePriceStatus({
            tier: row.tier,
            draftTargetCents: row.draftTargetCents,
            activation,
          }),
          `${row.variantSku} while ${critical.id} fails`,
        ).toBe("FOUNDER_APPROVED_DRAFT_TARGET");
        expect(memberPriceCentsForDisplay(row, activation), row.variantSku).toBeNull();
      }
    }
  });

  it("would activate a priced variant only once every gate is cleared, and never a held one", () => {
    const activation = canActivatePricing(
      withGatesCleared(PEPTIDE_PRICING_GATES.map((gate) => gate.id)),
    );
    expect(activation.allowed).toBe(true);

    const priced = findPriceTarget("R360-PT141-10MG-VIAL")!;
    expect(
      resolvePriceStatus({
        tier: priced.tier,
        draftTargetCents: priced.draftTargetCents,
        activation,
      }),
    ).toBe("ACTIVE_MEMBER_PRICE");
    expect(memberPriceCentsForDisplay(priced, activation)).toBe(6900);

    for (const held of priceTargetsForTier("regulatory_hold")) {
      expect(
        resolvePriceStatus({
          tier: held.tier,
          draftTargetCents: held.draftTargetCents,
          activation,
        }),
        held.variantSku,
      ).toBe("NO_PRICE_REGULATORY_HOLD");
      expect(memberPriceCentsForDisplay(held, activation), held.variantSku).toBeNull();
    }
  });

  it("never turns an absent price into a number, even with every gate cleared", () => {
    const activation = canActivatePricing(
      withGatesCleared(PEPTIDE_PRICING_GATES.map((gate) => gate.id)),
    );
    expect(
      resolvePriceStatus({ tier: "expansion", draftTargetCents: null, activation }),
    ).toBe("NO_PRICE_ON_RECORD");
  });
});

describe("house style", () => {
  it("stores no em or en dash in any field of any row", () => {
    const everyString = JSON.stringify(PEPTIDE_PRICE_TARGETS);
    expect(everyString).not.toContain(EM_DASH);
    expect(everyString).not.toContain(EN_DASH);
  });

  it("keeps no em or en dash anywhere in this directory", () => {
    for (const entry of readdirSync(HERE)) {
      if (!entry.endsWith(".ts")) continue;
      const source = readFileSync(path.join(HERE, entry), "utf8");
      expect(source.includes(EM_DASH), `${entry} contains an em dash`).toBe(false);
      expect(source.includes(EN_DASH), `${entry} contains an en dash`).toBe(false);
    }
  });
});

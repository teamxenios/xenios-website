/**
 * The customer-safe boundary for the V3 import lane.
 *
 * Two failures are pinned here, and they are the two that would matter most if
 * this lane ever shipped a surface:
 *
 * 1. LEAKAGE. Wholesale cost, cost status wording, supplier name, margin, and
 *    the workbook's internal planning sell price must never reach a customer or
 *    partner payload. The projection type already excludes them, so this proves
 *    the runtime value matches the type: every projection is serialized and
 *    scanned for each internal value, by string and by number.
 *
 * 2. A PLANNING MULTIPLIER BECOMING A PRICE. The workbook carries 8x, 9x and
 *    10x low-cost scenarios. Those are admin planning analyses. No multiple of
 *    a wholesale cost, and no planning sell value, may ever appear as a
 *    customer price, whatever the readiness state.
 *
 * The sentinel values below are deliberately distinctive so a scan cannot pass
 * by coincidence.
 */

import { describe, expect, it } from "vitest";

import {
  V3_PRICE_UNAVAILABLE_MESSAGE,
  V3_READINESS_STATES,
  isPurchasableReadinessState,
  projectV3CustomerOffer,
  type V3ApprovedCustomerPrice,
  type V3SourceRecord,
} from "@shared/research/v3-import";
import { importV3Master, type V3ImportedOffer } from "./import";
import {
  V3_SHEET_IMAGE_MANIFEST,
  V3_SHEET_OFFER_INDEX,
  V3_SHEET_PEPTIDE_MASTER,
  V3_SHEET_PRICE_BOOK,
  type V3Cell,
} from "./workbook";

// Distinctive sentinels. None of these may appear in a customer payload.
const WHOLESALE_DOLLARS = 137.31;
const WHOLESALE_CENTS = 13731;
const PLANNING_SELL_DOLLARS = 913.77;
const PLANNING_SELL_CENTS = 91377;
const SUPPLIER = "Rajeev Confidential Supplier Holdings";
const WHOLESALE_STATUS = "Known - Raw box cost / 10 confidential";
const BASIS = "internal margin analysis, 10x low-cost scenario";

/** The multipliers the workbook models. Admin planning only. */
const PLANNING_MULTIPLIERS = [8, 9, 10];

const APPROVED: V3ApprovedCustomerPrice = {
  amountCents: 44900,
  currency: "USD",
  approvedBy: "Samuel Boadu",
  approvedAt: "2026-08-01T00:00:00Z",
  effectiveDate: "2026-08-01",
};

function sheetOf(name: string, header: readonly string[], data: V3Cell[][]) {
  return {
    name,
    rows: [["title"], ["subtitle"], Array.from(header), ...data] as V3Cell[][],
  };
}

function loadedWorkbook() {
  return {
    offerIndex: sheetOf(
      V3_SHEET_OFFER_INDEX,
      [
        "Category",
        "ID / SKU",
        "Product / Service",
        "Variant / Format",
        "Partner / Internal Price",
        "Suggested Client Price",
        "Access / Status",
        "Brand / Rail",
      ],
      [
        [
          "Supplements",
          "SUP-9",
          "Sentinel Supplement",
          "60 capsules",
          WHOLESALE_DOLLARS,
          PLANNING_SELL_DOLLARS,
          "Planning",
          "Sentinel Brand",
        ],
      ],
    ),
    priceBook: sheetOf(
      V3_SHEET_PRICE_BOOK,
      [
        "Category",
        "Subcategory / Brand",
        "ID / SKU",
        "Product / Service",
        "Variant / Format",
        "Primary Supplier / Delivery Owner",
        "Wholesale / Delivery Cost",
        "Wholesale Status",
        "Recommended Sell Price",
        "Access / Offer State",
        "Explanation / Commercial Basis",
        "Gross Profit",
        "Gross Margin %",
      ],
      [
        [
          "Supplements",
          "Sentinel Brand",
          "SUP-9",
          "Sentinel Supplement",
          "60 capsules",
          SUPPLIER,
          WHOLESALE_DOLLARS,
          WHOLESALE_STATUS,
          PLANNING_SELL_DOLLARS,
          null,
          BASIS,
          776.46,
          0.85,
        ],
      ],
    ),
    imageManifest: sheetOf(
      V3_SHEET_IMAGE_MANIFEST,
      ["Image ID", "Category", "SKU", "Product / Service", "Variant", "File Path", "Status"],
      [["IMG-1", "Supplements", "SUP-9", "Sentinel Supplement", "60 capsules", "assets/s.webp", "Approved"]],
    ),
    peptideMaster: sheetOf(
      V3_SHEET_PEPTIDE_MASTER,
      ["Product Code", "Variant SKU", "Strength"],
      [],
    ),
  };
}

function importedOffer(): V3ImportedOffer {
  const result = importV3Master(loadedWorkbook(), {
    documentation: () => ({ coaState: "attached", lotState: "attached" }),
  });
  expect(result.offers).toHaveLength(1);
  return result.offers[0];
}

/** Every string and number a customer payload must never contain. */
function forbiddenValues(record: V3SourceRecord): Array<string | number> {
  const values: Array<string | number> = [
    SUPPLIER,
    WHOLESALE_STATUS,
    BASIS,
    WHOLESALE_DOLLARS,
    WHOLESALE_CENTS,
    PLANNING_SELL_DOLLARS,
    PLANNING_SELL_CENTS,
    776.46,
    77646,
  ];
  if (record.cost.supplierName !== null) values.push(record.cost.supplierName);
  values.push(record.cost.statusText);
  if (record.cost.wholesaleAmountCents !== null) {
    values.push(record.cost.wholesaleAmountCents);
  }
  if (record.planningPrice.proposedAmountCents !== null) {
    values.push(record.planningPrice.proposedAmountCents);
  }
  if (record.planningPrice.basisText !== null) {
    values.push(record.planningPrice.basisText);
  }
  for (const multiplier of PLANNING_MULTIPLIERS) {
    values.push(WHOLESALE_CENTS * multiplier);
    values.push(Math.round(WHOLESALE_DOLLARS * multiplier * 100));
    values.push(WHOLESALE_DOLLARS * multiplier);
  }
  return values;
}

function assertNoLeak(payload: unknown, record: V3SourceRecord): void {
  const serialized = JSON.stringify(payload);
  expect(serialized).toBeTypeOf("string");
  for (const value of forbiddenValues(record)) {
    expect(serialized).not.toContain(String(value));
  }
  // Field names too: an internal shape must not arrive under any key.
  for (const key of [
    "cost",
    "wholesale",
    "wholesaleAmountCents",
    "supplier",
    "supplierName",
    "margin",
    "grossProfit",
    "planningPrice",
    "proposedAmountCents",
    "statusText",
    "basisText",
    "accessStatusText",
    "approvedBy",
  ]) {
    expect(serialized).not.toContain(`"${key}"`);
  }
}

describe("the source record still carries the internal analysis", () => {
  it("keeps cost, supplier, and the planning proposal for admin use", () => {
    // If this ever stops being true the leakage tests below become vacuous, so
    // it is asserted first: the values really are present to leak.
    const { record } = importedOffer();
    expect(record.cost.wholesaleAmountCents).toBe(WHOLESALE_CENTS);
    expect(record.cost.supplierName).toBe(SUPPLIER);
    expect(record.cost.statusText).toBe(WHOLESALE_STATUS);
    expect(record.planningPrice.proposedAmountCents).toBe(PLANNING_SELL_CENTS);
    expect(record.planningPrice.basisText).toBe(BASIS);
  });
});

describe("no internal value reaches a customer projection", () => {
  it("leaks nothing in any readiness state, with or without an approval", () => {
    const offer = importedOffer();
    for (const state of V3_READINESS_STATES) {
      for (const approval of [null, APPROVED]) {
        const projection = projectV3CustomerOffer(
          offer.record,
          { state, blockingReasons: [] },
          approval,
        );
        assertNoLeak(projection, offer.record);
      }
    }
  });

  it("exposes only the agreed customer fields", () => {
    const offer = importedOffer();
    const projection = projectV3CustomerOffer(
      offer.record,
      { state: "active_public", blockingReasons: [] },
      APPROVED,
    );
    expect(Object.keys(projection).sort()).toEqual([
      "category",
      "offerId",
      "price",
      "productName",
      "readiness",
      "variantLabel",
      "variantSku",
    ]);
    expect(Object.keys(projection.price).sort()).toEqual([
      "amountCents",
      "currency",
      "state",
    ]);
  });

  it("leaks nothing across every row of a mixed import", () => {
    const workbook = loadedWorkbook();
    const result = importV3Master(workbook);
    for (const offer of result.offers) {
      for (const state of V3_READINESS_STATES) {
        assertNoLeak(
          projectV3CustomerOffer(offer.record, { state, blockingReasons: [] }, null),
          offer.record,
        );
      }
    }
  });
});

describe("no planning multiplier can become a customer price", () => {
  it("shows no price at all for a row whose only numbers are internal", () => {
    const offer = importedOffer();
    // The row has a sourced cost and a planning sell value. Import approves
    // nothing, so the customer sees the unavailable message and no number.
    const projection = projectV3CustomerOffer(
      offer.record,
      offer.readiness,
      null,
    );
    expect(projection.price).toEqual({
      state: "not_available",
      message: V3_PRICE_UNAVAILABLE_MESSAGE,
    });
    expect(isPurchasableReadinessState(offer.readiness.state)).toBe(false);
  });

  it("never renders wholesale times 8, 9, or 10", () => {
    const offer = importedOffer();
    for (const state of V3_READINESS_STATES) {
      const projection = projectV3CustomerOffer(
        offer.record,
        { state, blockingReasons: [] },
        APPROVED,
      );
      const serialized = JSON.stringify(projection);
      for (const multiplier of PLANNING_MULTIPLIERS) {
        expect(serialized).not.toContain(String(WHOLESALE_CENTS * multiplier));
      }
    }
  });

  it("renders the approved amount and nothing derived from cost", () => {
    const offer = importedOffer();
    const projection = projectV3CustomerOffer(
      offer.record,
      { state: "active_public", blockingReasons: [] },
      APPROVED,
    );
    expect(projection.price).toEqual({
      state: "priced",
      amountCents: APPROVED.amountCents,
      currency: "USD",
    });
    // The approved amount is not any multiple of the cost, so a passing render
    // cannot be a multiplier that happens to match.
    for (const multiplier of PLANNING_MULTIPLIERS) {
      expect(APPROVED.amountCents).not.toBe(WHOLESALE_CENTS * multiplier);
    }
  });

  it("never renders $0 for a row with no approval", () => {
    const offer = importedOffer();
    for (const state of V3_READINESS_STATES) {
      const serialized = JSON.stringify(
        projectV3CustomerOffer(offer.record, { state, blockingReasons: [] }, null),
      );
      expect(serialized).not.toContain('"amountCents"');
      expect(serialized).toContain(V3_PRICE_UNAVAILABLE_MESSAGE);
    }
  });
});

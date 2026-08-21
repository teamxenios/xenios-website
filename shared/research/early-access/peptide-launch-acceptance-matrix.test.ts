// The exhaustive peptide launch acceptance matrix.
//
// This is the acceptance layer over two other lanes, and it deliberately owns
// no production code: the reconciliation MECHANISM lives in
// server/research/master-offerings/catalog-reconciliation.ts, the pathway
// DECISION lives in shared/research/early-access/customer-pathway.ts, and this
// file proves that the REAL committed workbook export, run through those rules,
// produces exactly the launch the founder authorized:
//
//   141 peptide source rows
//   -> 139 unique peptide variants   (two duplicate pairs collapse)
//   -> 111 directly orderable RUO variants
//   ->   1 formulation-blocked variant (CJC-1295 WITH DAC + Ipamorelin),
//         visible and priced, offered as Request Order - NOT hidden
//   ->  27 unique classification-pending variants
//
// WHY THIS EXISTS SEPARATELY. catalog-reconciliation.test.ts proves the
// mechanism against SYNTHETIC rows, which is the right way to test a mechanism
// and cannot tell anyone whether the actual catalogue is correct. Every number
// below is computed from the committed CSV, so a workbook re-export that
// changes the shape of the launch fails here instead of surprising a customer.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  earlyAccessCustomerPathway,
  pathwayEntersPayment,
  pathwayEntersRequest,
  type EarlyAccessCustomerPathway,
} from "./customer-pathway";
import type { AssistedOrderWorkflowMode } from "../assisted-order/contract";

// ---------------------------------------------------------------------------
// The committed source of truth
// ---------------------------------------------------------------------------

const CSV_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../docs/research-launch/XENIOS_RETAIL_ONLY_MASTER_CATALOG_426_VARIANTS.csv",
);

const PEPTIDE_FAMILY = "Research Peptides & Materials";
const RUO_CHANNEL = "RUO Research";
const PENDING_CHANNEL = "Supplier Catalog / Classification Pending";

/** The variant whose component split is unresolved, so it may not be sold. */
const FORMULATION_HOLD_GROUP_ID = "GRP-0422";

const DOUBLE_QUOTE = String.fromCharCode(34);

type Row = Record<string, string>;

/** A real CSV reader: quoted fields and embedded commas included. */
function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === DOUBLE_QUOTE) {
        if (text[i + 1] === DOUBLE_QUOTE) {
          field += DOUBLE_QUOTE;
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === DOUBLE_QUOTE) inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const populated = rows.filter((r) => r.some((value) => value !== ""));
  const header = populated[0];
  return populated
    .slice(1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const allRows = parseCsv(readFileSync(CSV_PATH, "utf8").replace(/^﻿/, ""));
const peptides = allRows.filter((r) => r.Family === PEPTIDE_FAMILY);

/**
 * Canonical variant identity.
 *
 * The workbook states the same variant two ways — `HEXARELIN 5 mg` from the
 * research sheet and `Hexarelin (5mg)` from the supplier sheet — so an exact
 * string comparison reports 141 distinct variants and silently lists the same
 * peptide twice in the storefront. Uppercase, drop parentheses, put a space
 * between a number and its unit, collapse whitespace.
 */
export function canonicalVariantKey(specification: string): string {
  return specification
    .toUpperCase()
    .replace(/[()]/g, " ")
    .replace(/(\d)\s*(MG|MCG|IU|ML|G)\b/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function groupByCanonicalKey(rows: readonly Row[]): Map<string, Row[]> {
  const byKey = new Map<string, Row[]>();
  for (const row of rows) {
    const key = canonicalVariantKey(row["Normalized Specification"]);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }
  return byKey;
}

const byCanonicalKey = groupByCanonicalKey(peptides);
const duplicateGroups = [...byCanonicalKey.entries()].filter(
  ([, rows]) => rows.length > 1,
);

const retailPriceOf = (row: Row): number => Number(row["Current Retail Price"]);
const isPriced = (row: Row): boolean =>
  row["Current Retail Price"] !== "" && retailPriceOf(row) > 0;

/**
 * The canonical row for a variant: the RUO statement wins over the pending
 * supplier statement, because a confirmed classification outranks an
 * unfinished one. Where only a pending row exists, that row IS the variant.
 */
function canonicalRow(rows: readonly Row[]): Row {
  return rows.find((r) => r.Channel === RUO_CHANNEL) ?? rows[0];
}

const canonicalVariants = [...byCanonicalKey.values()].map(canonicalRow);

// ---------------------------------------------------------------------------
// The acceptance oracle: workbook facts -> pathway input
// ---------------------------------------------------------------------------

function workflowModeFor(row: Row): AssistedOrderWorkflowMode {
  // The one variant the founder placed on hold: real, priced, RUO-classified,
  // and NOT directly sellable, because the component split is unresolved. It
  // must be held UPSTREAM of the pathway rules; classification and price alone
  // would otherwise make it directly purchasable.
  //
  // The founder's 2026-08-21 decision is that this row stays VISIBLE, keeps its
  // RETAIL PRICE, and offers REQUEST ORDER — deliberately NOT "Temporarily
  // Unavailable", which would hide a product that is real and orderable through
  // review. So it maps to the mode that yields the assisted-order pathway.
  //
  // GAP WORTH CLOSING (s7 / lead): customer-pathway.ts has no distinct concept
  // of a COMMERCE/FORMULATION hold. `availability_review` exists but answers
  // "temporarily_held", which is the wrong customer outcome here, so the hold
  // has to borrow `request_activation` — a mode that otherwise means
  // "classification pending". The customer sees the right thing; the reason
  // recorded against it is imprecise. A `commerce_hold` mode resolving to
  // assisted_order would say what is actually true.
  if (row["Group ID"] === FORMULATION_HOLD_GROUP_ID) return "request_activation";
  if (row.Channel === PENDING_CHANNEL) return "request_activation";
  return "direct_order_request";
}

function pathwayFor(row: Row): EarlyAccessCustomerPathway {
  return earlyAccessCustomerPathway({
    workflowMode: workflowModeFor(row),
    researchUseOnly: row.Channel === RUO_CHANNEL,
    hasApprovedRetailPrice: isPriced(row),
    family: "research_peptides_materials",
  });
}

// ---------------------------------------------------------------------------

describe("peptide launch: the source workbook", () => {
  it("carries the 426-variant export with 141 peptide rows", () => {
    expect(allRows).toHaveLength(426);
    expect(peptides).toHaveLength(141);
  });

  it("splits the peptide rows 112 confirmed RUO / 29 classification pending", () => {
    const channels = new Map<string, number>();
    for (const row of peptides) {
      channels.set(row.Channel, (channels.get(row.Channel) ?? 0) + 1);
    }
    expect(Object.fromEntries(channels)).toEqual({
      [RUO_CHANNEL]: 112,
      [PENDING_CHANNEL]: 29,
    });
  });

  it("prices every confirmed RUO peptide row", () => {
    const unpriced = peptides
      .filter((r) => r.Channel === RUO_CHANNEL && !isPriced(r))
      .map((r) => r["Group ID"]);
    expect(unpriced).toEqual([]);
  });

  it("exposes retail only — no wholesale, cost, margin or benchmark column", () => {
    const forbidden = /wholesale|cost|margin|markup|benchmark|supplier price|multiplier/i;
    const leaked = Object.keys(allRows[0]).filter((column) => forbidden.test(column));
    expect(leaked).toEqual([]);
  });
});

describe("peptide launch: duplicate reconciliation", () => {
  it("collapses 141 source rows into 139 unique variants", () => {
    expect(byCanonicalKey.size).toBe(139);
    expect(canonicalVariants).toHaveLength(139);
  });

  it("finds exactly the two duplicate pairs the founder named", () => {
    expect(duplicateGroups.map(([key]) => key).sort()).toEqual([
      "HEXARELIN 5 MG",
      "OXYTOCIN 10 MG",
    ]);
    for (const [, rows] of duplicateGroups) {
      // Each pair is one confirmed row and one pending row — which is why the
      // pending twin disappears rather than the variant being listed twice.
      expect(rows.map((r) => r.Channel).sort()).toEqual([
        RUO_CHANNEL,
        PENDING_CHANNEL,
      ]);
    }
  });

  it("keeps the confirmed RUO row as canonical for each collapsed pair", () => {
    const keptIds = duplicateGroups.map(([, rows]) => canonicalRow(rows)["Group ID"]);
    expect(keptIds.sort()).toEqual(["GRP-0425", "GRP-0426"]);
    const droppedIds = duplicateGroups
      .flatMap(([, rows]) => rows)
      .filter((r) => r.Channel === PENDING_CHANNEL)
      .map((r) => r["Group ID"]);
    expect(droppedIds.sort()).toEqual(["GRP-0402", "GRP-0407"]);
  });

  // OPEN FOUNDER DECISION, asserted so it stays visible rather than being
  // quietly resolved by whichever row a dedupe happens to keep. Both collapsed
  // pairs state DIFFERENT retail prices, so collapsing them necessarily picks a
  // price the customer will be charged. This test records the conflict; when
  // the founder adjudicates, the prices converge and this test says so.
  it("records that both collapsed pairs still disagree about retail price", () => {
    const conflicts = duplicateGroups.map(([key, rows]) => ({
      variant: key,
      prices: rows.map((r) => `${r["Group ID"]}=${r["Price Display"]}`).sort(),
    }));
    expect(conflicts).toEqual([
      { variant: "HEXARELIN 5 MG", prices: ["GRP-0402=$62.50", "GRP-0426=$49.00"] },
      { variant: "OXYTOCIN 10 MG", prices: ["GRP-0407=$107.50", "GRP-0425=$59.00"] },
    ]);
  });
});

describe("peptide launch: the customer pathway for every canonical variant", () => {
  const pathways = canonicalVariants.map((row) => ({
    groupId: row["Group ID"],
    key: canonicalVariantKey(row["Normalized Specification"]),
    pathway: pathwayFor(row),
  }));

  it("resolves 111 directly orderable and 28 request-only, nothing hidden", () => {
    const counts = new Map<EarlyAccessCustomerPathway, number>();
    for (const { pathway } of pathways) {
      counts.set(pathway, (counts.get(pathway) ?? 0) + 1);
    }
    // 27 classification-pending + the 1 formulation-held combo. Nothing
    // resolves to temporarily_held or not_available: every canonical peptide
    // variant is visible and has a real way for a customer to proceed.
    expect(Object.fromEntries(counts)).toEqual({
      buy_now: 111,
      assisted_order: 28,
    });
    expect(pathways).toHaveLength(139);
  });

  it("offers the CJC-1295 WITH DAC + Ipamorelin combo as Request Order, not as unavailable", () => {
    const held = pathways.find((p) => p.groupId === FORMULATION_HOLD_GROUP_ID)!;
    expect(held.key).toContain("WITH DAC");
    expect(held.key).toContain("SPLIT PENDING");
    // Visible, priced, and requestable — the founder's 2026-08-21 decision.
    expect(held.pathway).toBe("assisted_order");
    expect(pathwayEntersPayment(held.pathway)).toBe(false);
    expect(pathwayEntersRequest(held.pathway)).toBe(true);
    const row = canonicalVariants.find(
      (r) => r["Group ID"] === FORMULATION_HOLD_GROUP_ID,
    )!;
    expect(isPriced(row)).toBe(true);
    expect(row["Price Display"]).toBe("$99.00");
  });

  it("keeps every STANDALONE with-DAC variant on its own merits, not swept into the hold", () => {
    // The hold is one combination product, not the with-DAC family. 2 mg and
    // 5 mg are confirmed RUO and priced, so they are directly orderable; the
    // 10 mg row is classification pending, so it is Request Order.
    const withDac = canonicalVariants.filter(
      (r) =>
        /WITH DAC/.test(canonicalVariantKey(r["Normalized Specification"])) &&
        r["Group ID"] !== FORMULATION_HOLD_GROUP_ID,
    );
    const byId = Object.fromEntries(
      withDac.map((r) => [r["Group ID"], pathwayFor(r)]),
    );
    expect(byId).toEqual({
      "GRP-0272": "buy_now", // CJC-1295 WITH DAC 2 mg, RUO, $100.00
      "GRP-0273": "buy_now", // CJC-1295 WITH DAC 5 mg, RUO, $187.50
      "GRP-0394": "assisted_order", // WITH DAC 10 mg, classification pending
    });
  });

  it("never lets a classification-pending variant reach the payment journey", () => {
    const pending = canonicalVariants.filter((r) => r.Channel === PENDING_CHANNEL);
    expect(pending).toHaveLength(27);
    for (const row of pending) {
      const pathway = pathwayFor(row);
      expect(pathwayEntersPayment(pathway)).toBe(false);
      expect(pathwayEntersRequest(pathway)).toBe(true);
    }
  });

  it("lets every directly orderable variant, and only those, reach payment", () => {
    const payable = pathways.filter((p) => pathwayEntersPayment(p.pathway));
    expect(payable).toHaveLength(111);
    for (const { groupId } of payable) {
      const row = canonicalVariants.find((r) => r["Group ID"] === groupId)!;
      // Every payable variant is a confirmed, priced, unheld research peptide.
      expect(row.Channel).toBe(RUO_CHANNEL);
      expect(isPriced(row)).toBe(true);
      expect(row["Group ID"]).not.toBe(FORMULATION_HOLD_GROUP_ID);
    }
  });

  it("keeps every non-peptide family out of the peptide direct-purchase set", () => {
    const nonPeptide = allRows.filter((r) => r.Family !== PEPTIDE_FAMILY);
    expect(nonPeptide).toHaveLength(285);
    // Capsules in particular are priced and research-labelled, and are still
    // not part of this expansion.
    const capsules = nonPeptide.filter((r) => r.Family === "Research Capsules");
    expect(capsules).toHaveLength(16);
    for (const row of capsules) {
      const pathway = earlyAccessCustomerPathway({
        workflowMode: "direct_order_request",
        researchUseOnly: true,
        hasApprovedRetailPrice: isPriced(row),
        family: "research_capsules",
      });
      expect(pathway).toBe("assisted_order");
      expect(pathwayEntersPayment(pathway)).toBe(false);
    }
  });
});

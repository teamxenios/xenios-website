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

/**
 * The founder's REVIEWED reconciliation. The workbook is source evidence and
 * stays whole; this file records which canonical customer products those rows
 * add up to. Asserting the workbook against it is what turns this matrix into a
 * drift detector: if a re-export changes a price or a channel the reviewed
 * decision does not expect, that is caught here rather than in a customer's
 * basket.
 */
const RECONCILIATION_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../config/research/master-catalog-reconciliation-20260821.json",
);

type ReviewedMerge = {
  id: string;
  keeps: string;
  supersedes: string[];
  canonical: { specification: string; channel: string; retailPriceCents: number };
  why?: string[];
};
type ReviewedHold = {
  sourceRow: string;
  specification: string;
  retailPriceCents: number;
  customerResult: {
    visible: boolean;
    retailPriceShown: boolean;
    directPurchase: boolean;
    pathway: string;
  };
};

const reviewed = JSON.parse(readFileSync(RECONCILIATION_PATH, "utf8")) as {
  sourceWorkbook: { sourceRows: number };
  merges: ReviewedMerge[];
  commerceHolds: ReviewedHold[];
};

const centsOf = (row: Row): number => Math.round(retailPriceOf(row) * 100);
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

  // WHICH TWIN SURVIVES IS DISPUTED, SO THIS ASSERTS THE INVARIANT, NOT A PRICE.
  //
  // An earlier version of this file hardcoded $49.00 and $59.00. That was a
  // mistake: it picked a side in a live disagreement. The reviewed config and
  // production's 2026-08-19 adjudication say the RUO row wins ($49.00/$59.00);
  // the founder has separately been reported as selecting $62.50/$107.50, the
  // pending twins' prices. Until that is reconciled, a test that names a number
  // is a test that will either be wrong or quietly make the decision.
  //
  // What is NOT in dispute, and is the failure mode this pair actually invites:
  // price and classification are ONE choice. The cheaper row in each pair IS the
  // RUO row, so taking one row's price with the other row's classification would
  // invent a variant that exists in neither sheet - a product priced as
  // confirmed-RUO but classified pending, or the reverse. This asserts that the
  // surviving row is internally coherent, whichever row the founder picks.
  // (Invariant proposed by claude-fable-s7; it survives either answer.)
  it("takes the surviving row's price and classification from the SAME source row", () => {
    for (const [key, rows] of duplicateGroups) {
      const kept = canonicalRow(rows);
      const sameRow = rows.find(
        (r) =>
          r["Price Display"] === kept["Price Display"] &&
          r.Channel === kept.Channel &&
          r["Group ID"] === kept["Group ID"],
      );
      expect(sameRow, `${key}: price and channel must come from one row`).toBeDefined();
      // And the retired twin's price is never silently borrowed.
      const retired = rows.find((r) => r["Group ID"] !== kept["Group ID"])!;
      expect(kept["Price Display"]).not.toBe(retired["Price Display"]);
    }
  });

  it("never counts a classification-pending survivor as directly orderable", () => {
    for (const [, rows] of duplicateGroups) {
      const kept = canonicalRow(rows);
      if (kept.Channel === PENDING_CHANNEL) {
        expect(pathwayFor(kept)).toBe("assisted_order");
        expect(pathwayEntersPayment(pathwayFor(kept))).toBe(false);
      }
    }
  });

  it("records the disputed pair as data, so the decision is visible not buried", () => {
    // Deliberately reports both candidates without endorsing either.
    const disputed = duplicateGroups.map(([key, rows]) => ({
      variant: key,
      candidates: rows
        .map((r) => `${r["Group ID"]}:${r.Channel === RUO_CHANNEL ? "RUO" : "pending"}:${r["Price Display"]}`)
        .sort(),
    }));
    expect(disputed).toEqual([
      {
        variant: "HEXARELIN 5 MG",
        candidates: ["GRP-0402:pending:$62.50", "GRP-0426:RUO:$49.00"],
      },
      {
        variant: "OXYTOCIN 10 MG",
        candidates: ["GRP-0407:pending:$107.50", "GRP-0425:RUO:$59.00"],
      },
    ]);
  });

  it("shows the founder's targets follow from keeping the RUO row", () => {
    // Stated as arithmetic, not as an instruction. If the founder's answer is
    // the pending twin, the authorized counts become 109/29 and THIS is the
    // test that says so out loud rather than the storefront discovering it.
    const HELD = 1;
    const arrangement = (keepRuo: boolean) => {
      const uniqueRuo = keepRuo ? 112 : 112 - duplicateGroups.length;
      const uniquePending = keepRuo ? 29 - duplicateGroups.length : 29;
      return { direct: uniqueRuo - HELD, pending: uniquePending };
    };
    expect(arrangement(true)).toEqual({ direct: 111, pending: 27 });
    expect(arrangement(false)).toEqual({ direct: 109, pending: 29 });
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
    // Identified by Group ID, never by a word in the product name: the
    // reviewed canonical specification strips the "(SPLIT PENDING)" marker, so
    // a marker-based assertion would pass today and mean nothing after the
    // catalog is regenerated. (Caught by claude-fable-s7, who hit it first.)
    expect(held.groupId).toBe(reviewed.commerceHolds[0].sourceRow);
    expect(held.key).toContain("WITH DAC");
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

describe("peptide launch: the workbook agrees with the reviewed reconciliation", () => {
  it("reconciles against the same 426-row workbook this matrix parses", () => {
    expect(reviewed.sourceWorkbook.sourceRows).toBe(allRows.length);
  });

  it("declares a merge for exactly the duplicate pairs the workbook still contains", () => {
    const declared = reviewed.merges
      .map((m) => [m.keeps, ...m.supersedes].sort().join("+"))
      .sort();
    const detected = duplicateGroups
      .map(([, rows]) => rows.map((r) => r["Group ID"]).sort().join("+"))
      .sort();
    expect(declared).toEqual(detected);
  });

  it("keeps the row the reviewed decision keeps, at the price it records", () => {
    for (const merge of reviewed.merges) {
      const group = duplicateGroups.find(([, rows]) =>
        rows.some((r) => r["Group ID"] === merge.keeps),
      );
      expect(group, `no duplicate group for ${merge.id}`).toBeDefined();
      const kept = canonicalRow(group![1]);
      expect(kept["Group ID"]).toBe(merge.keeps);
      expect(kept.Channel).toBe(merge.canonical.channel);
      // THE MONEY ASSERTION, override-aware.
      //
      // The REVIEWED CONFIG is the price authority, not the workbook. On
      // 2026-08-21 the founder repriced these two ($62.50 / $107.50),
      // superseding the $49.00 / $59.00 that production had adjudicated on
      // 2026-08-19, and required that the override be recorded WITH PROVENANCE
      // rather than by quietly editing the merge record so it reads as though
      // the workbook always said so.
      //
      // So a config price that differs from the workbook is legitimate - but
      // only when the record SAYS WHY. A silent divergence is the thing this
      // catches: it is indistinguishable from a re-export drifting, and the
      // next reconciler cannot tell an intended override from a mistake.
      const workbookCents = centsOf(kept);
      const authorityCents = merge.canonical.retailPriceCents;
      if (workbookCents !== authorityCents) {
        const why = (merge.why ?? []).join(" ").toLowerCase();
        expect(
          /override|supersede|repric|founder/.test(why),
          `${merge.id}: config says ${authorityCents} but the workbook says ` +
            `${workbookCents}, and the record does not say why. An override is ` +
            `legitimate; an unexplained one is not.`,
        ).toBe(true);
      }
    }
  });

  it("retires the superseded twin rather than letting it reach a customer", () => {
    const superseded = reviewed.merges.flatMap((m) => m.supersedes);
    const shown = canonicalVariants.map((r) => r["Group ID"]);
    for (const groupId of superseded) {
      expect(shown).not.toContain(groupId);
      // It stays in the workbook as provenance, which is the point of merging
      // rather than deleting.
      expect(allRows.map((r) => r["Group ID"])).toContain(groupId);
    }
  });

  it("gives the held row the customer result the reviewed decision specifies", () => {
    for (const hold of reviewed.commerceHolds) {
      const row = canonicalVariants.find((r) => r["Group ID"] === hold.sourceRow);
      expect(row, `held row ${hold.sourceRow} is not a canonical variant`).toBeDefined();
      expect(centsOf(row!)).toBe(hold.retailPriceCents);
      expect(isPriced(row!)).toBe(hold.retailPriceShown ?? true);
      const pathway = pathwayFor(row!);
      expect(pathway).toBe(hold.customerResult.pathway);
      expect(pathwayEntersPayment(pathway)).toBe(hold.customerResult.directPurchase);
    }
  });
});

describe("founder rule: commerce never reads display copy", () => {
  // 2026-08-21. "No commerce decision may depend on customer-facing product
  // names, specifications, descriptions, notices, or string matching. Commerce
  // decisions must use structured canonical facts only."
  //
  // This is not hypothetical. An earlier version of this very file asserted the
  // GRP-0422 hold by matching "(SPLIT PENDING)" in the specification, and an
  // earlier resolver implementation MATCHED ON IT to apply the hold. The
  // reviewed canonical specification strips that marker, so both would have
  // gone quietly wrong the moment the catalog was regenerated - the assertion
  // by passing meaninglessly, the resolver by silently ceasing to hold a
  // product the founder blocked. Caught by claude-fable-s7.

  /** Rewrite every customer-facing string on a row, keeping structure intact. */
  function withDisplayCopyScrambled(row: Row): Row {
    return {
      ...row,
      Product: "ZZZ Renamed Product",
      "Normalized Specification": "ZZZ RENAMED 999 MG",
      "Dosage Form": "ZZZ Renamed Form",
      "Planned Catalog Status": "ZZZ renamed status",
      "Price Display": "$0.00",
    };
  }

  it("holds GRP-0422 even when every display string on the row is rewritten", () => {
    const held = canonicalVariants.find(
      (r) => r["Group ID"] === FORMULATION_HOLD_GROUP_ID,
    )!;
    const scrambled = withDisplayCopyScrambled(held);
    // The hold is keyed on the structured identity, so the pathway is unchanged
    // even though nothing a customer would read survives.
    expect(pathwayFor(scrambled)).toBe(pathwayFor(held));
    expect(pathwayFor(scrambled)).toBe("assisted_order");
    expect(pathwayEntersPayment(pathwayFor(scrambled))).toBe(false);
  });

  it("does not start selling a held product because its name lost a marker", () => {
    // The specific regression: strip the "(SPLIT PENDING)" marker the way a
    // catalog regeneration does, and confirm the hold survives.
    const held = canonicalVariants.find(
      (r) => r["Group ID"] === FORMULATION_HOLD_GROUP_ID,
    )!;
    const demarked: Row = {
      ...held,
      "Normalized Specification": "CJC-1295 WITH DAC + IPAMORELIN 5 mg total",
    };
    expect(canonicalVariantKey(demarked["Normalized Specification"])).not.toContain(
      "SPLIT PENDING",
    );
    expect(pathwayFor(demarked)).toBe("assisted_order");
    expect(pathwayEntersPayment(pathwayFor(demarked))).toBe(false);
  });

  it("routes every canonical variant identically when display copy is scrambled", () => {
    // Whole-catalogue version: no row's commerce outcome may move because its
    // customer-facing text changed.
    for (const row of canonicalVariants) {
      expect(
        pathwayFor(withDisplayCopyScrambled(row)),
        `${row["Group ID"]} changed pathway when only display copy changed`,
      ).toBe(pathwayFor(row));
    }
  });

  it("decides the pathway from structured facts alone", () => {
    // The oracle this matrix uses reads Group ID, Channel and price - never a
    // product name or description. Stated as a test so a future edit that
    // reaches for a string has to break it deliberately.
    const structuralKeys = ["Group ID", "Channel", "Current Retail Price"];
    const held = canonicalVariants.find(
      (r) => r["Group ID"] === FORMULATION_HOLD_GROUP_ID,
    )!;
    const structuralOnly = Object.fromEntries(
      structuralKeys.map((k) => [k, held[k]]),
    ) as Row;
    expect(pathwayFor(structuralOnly)).toBe(pathwayFor(held));
  });
});

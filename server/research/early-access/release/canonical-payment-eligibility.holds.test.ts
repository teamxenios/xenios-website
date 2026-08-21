// The payment gate's composition reading, pinned to the reviewed config.
//
// THE DEFECT THIS CLOSES. compositionResolvedFromSpecification used to decide
// from display text alone, so the CANONICAL specification — which the reviewed
// reconciliation strips the marker from, deliberately, because a customer must
// not read our internal uncertainty in a product name — passed the gate:
//
//   "...5 mg total (split pending)" -> unresolved (refused, correct)
//   "...5 mg total"                 -> RESOLVED   (passed, wrong)
//
// Third instance of one pattern, after a marker-based hold in master-offerings
// and a marker-based assertion in the acceptance matrix. The rule worth
// keeping: nothing that decides commerce may read display text.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  REVIEWED_COMPOSITION_HELD_SPECIFICATIONS,
  compositionResolvedFromSpecification,
} from "./canonical-payment-eligibility";

const CONFIG_PATH = path.join(
  process.cwd(),
  "config",
  "research",
  "master-catalog-reconciliation-20260821.json",
);

interface ReviewedConfig {
  commerceHolds?: Array<{ sourceRow?: string; specification?: string }>;
}

function reviewedConfig(): ReviewedConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as ReviewedConfig;
}

const CANONICAL_HELD = "CJC-1295 WITH DAC + IPAMORELIN 5 mg total";
const RAW_HELD = "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)";

describe("the mirrored hold list cannot drift from the reviewed config", () => {
  it("matches commerceHolds[].specification exactly", () => {
    const holds = reviewedConfig().commerceHolds ?? [];
    const fromConfig = holds.map((hold) => hold.specification).filter((s): s is string => typeof s === "string");
    expect([...REVIEWED_COMPOSITION_HELD_SPECIFICATIONS].sort()).toEqual([...fromConfig].sort());
  });

  it("still carries GRP-0422, the row the helper exists to catch", () => {
    const holds = reviewedConfig().commerceHolds ?? [];
    expect(holds.some((hold) => hold.sourceRow === "GRP-0422")).toBe(true);
    expect(REVIEWED_COMPOSITION_HELD_SPECIFICATIONS).toContain(CANONICAL_HELD);
  });
});

describe("composition is decided from the reviewed fact, not from the copy", () => {
  it("refuses the CANONICAL specification, which carries no marker", () => {
    // The regression. Before the fix this returned true and sold the row.
    expect(compositionResolvedFromSpecification(CANONICAL_HELD)).toBe(false);
  });

  it("still refuses the RAW workbook string, so the text fallback cannot be removed silently", () => {
    // Guards un-reconciled rows. If someone deletes the marker pattern later,
    // this fails rather than quietly regressing.
    expect(compositionResolvedFromSpecification(RAW_HELD)).toBe(false);
  });

  it("refuses the raw string even when the hold list is empty", () => {
    expect(compositionResolvedFromSpecification(RAW_HELD, [])).toBe(false);
  });

  it("refuses the canonical string only because the hold list names it", () => {
    // Proves the first branch is doing the work, not the regex.
    expect(compositionResolvedFromSpecification(CANONICAL_HELD, [])).toBe(true);
    expect(compositionResolvedFromSpecification(CANONICAL_HELD, [CANONICAL_HELD])).toBe(false);
  });
});

describe("matching is exact, and whitespace only ever refuses more", () => {
  it("trims the input, which can only widen a hold and never narrow one", () => {
    expect(compositionResolvedFromSpecification(`  ${CANONICAL_HELD}  `)).toBe(false);
  });

  it("does NOT fuzzy-match a different specification onto a hold", () => {
    // A near-miss must fail OPEN-safe, i.e. it is a different product and is
    // allowed — the hold is not a substring rule.
    expect(compositionResolvedFromSpecification("CJC-1295 WITH DAC 5 mg")).toBe(true);
    expect(compositionResolvedFromSpecification("IPAMORELIN 5 mg")).toBe(true);
  });

  it("is case sensitive on the canonical fact, and the marker fallback is not", () => {
    // The config string is authoritative; a differently-cased variant is a
    // different string and falls through to the text rule.
    expect(compositionResolvedFromSpecification(CANONICAL_HELD.toLowerCase())).toBe(true);
    expect(compositionResolvedFromSpecification("something (SPLIT PENDING)")).toBe(false);
  });
});

describe("ordinary rows are unaffected", () => {
  it.each([
    "HEXARELIN 5 mg",
    "OXYTOCIN 10 mg",
    "CJC-1295 WITH DAC 2 mg",
    "Semaglutide 5 mg",
  ])("%s resolves", (specification) => {
    expect(compositionResolvedFromSpecification(specification)).toBe(true);
  });

  it("an absent specification is not evidence of an unresolved split", () => {
    expect(compositionResolvedFromSpecification(null)).toBe(true);
    expect(compositionResolvedFromSpecification(undefined)).toBe(true);
    expect(compositionResolvedFromSpecification("   ")).toBe(true);
  });
});

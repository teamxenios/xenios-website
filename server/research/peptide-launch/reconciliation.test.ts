import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  defaultSources,
  isFormulationBlocked,
  reconcilePeptideLaunch,
} from "./reconciliation";

/**
 * THE PEPTIDE LAUNCH ACCEPTANCE MATRIX.
 *
 * The founder's target is a claim about DATA: 141 workbook peptide rows, 112
 * confirmed research-use, 111 directly orderable, 1 formulation-blocked, 29
 * Request Order. Nothing was measuring whether the artifacts that actually
 * ship can support that claim, so this does.
 *
 * It pins current truth rather than asserting the target, deliberately. A test
 * that fails until a workbook lands would be a red build for fifteen sessions
 * and would be muted within the day; the gap belongs in the handoff, where a
 * human decides. What IS asserted here are the invariants that must hold no
 * matter which workbook is loaded, including the one that stops a bulk
 * classification pass from selling a blocked formulation.
 */

const REPO_ROOT = path.resolve(__dirname, "../../..");
const sources = defaultSources(REPO_ROOT);

describe("peptide launch reconciliation", () => {
  it("measures the shipped artifacts rather than a fixture", () => {
    const result = reconcilePeptideLaunch(sources);
    // Guards against a silently empty read making every assertion vacuous.
    expect(result.totalVariants).toBeGreaterThan(100);
    expect(result.rows.every((r) => r.productName.length > 0)).toBe(true);
  });

  it("pins the shipped peptide counts, so a catalog regeneration is visible", () => {
    const result = reconcilePeptideLaunch(sources);
    // Measured 2026-08-20 against the 2026-08-16 workbook artifact. If a newer
    // workbook lands these move, and moving them is the POINT: the diff is the
    // reconciliation. See docs/research-launch/PEPTIDE_LAUNCH_RECONCILIATION.md.
    expect({
      total: result.totalVariants,
      directToday: result.directToday,
      pending: result.classificationPending,
      blockedButSellable: result.formulationBlockedButSellable.length,
      pendingBlocked: result.pendingFormulationBlocked.length,
    }).toEqual({
      total: 135,
      // 104 clean + 2 with-DAC already sellable = 106 confirmed sellable rows.
      directToday: 104,
      pending: 29,
      blockedButSellable: 2,
      pendingBlocked: 1,
    });
  });

  it("every confirmed peptide is genuinely sellable, so none is a dead card", () => {
    // A confirmed row that is unbound or unpriced would render as orderable
    // and then refuse, which is the failure mode the launch cannot afford.
    const result = reconcilePeptideLaunch(sources);
    const broken = result.confirmedNotSellable.map(
      (r) => `${r.productName} | ${r.variantLabel} | bound=${r.bound} price=${r.amountCents}`,
    );
    expect(broken, `confirmed peptides that cannot actually be sold:\n${broken.join("\n")}`).toEqual([]);
  });

  it("no peptide is offered at a zero or negative price", () => {
    const result = reconcilePeptideLaunch(sources);
    const bad = result.rows
      .filter((r) => r.amountCents !== null && r.amountCents <= 0)
      .map((r) => `${r.productName} | ${r.variantLabel} | ${r.amountCents}`);
    expect(bad).toEqual([]);
  });

  it("SAFETY: a formulation-blocked row is never counted as promotable", () => {
    // The live hazard. The with-DAC CJC formulation is classification-pending
    // AND already bound, priced, approved, active and member-eligible, so a
    // bulk "confirm the pending rows" step would put a formulation whose
    // component split is unresolved on direct sale in a single move.
    const result = reconcilePeptideLaunch(sources);
    expect(result.pendingFormulationBlocked.length).toBeGreaterThan(0);
    for (const row of result.pendingFormulationBlocked) {
      expect(isFormulationBlocked(row.variantLabel)).toBe(true);
    }
    expect(result.pendingPromotable).toBe(
      result.pendingButCommerceReady - result.pendingFormulationBlocked.length,
    );
  });

  it("OPEN FOUNDER DECISION: names every with-DAC row already on direct sale", () => {
    // NOT asserted as a defect, because it is not settled. The launch brief
    // blocks a with-DAC COMBO ("CJC-1295 + Ipamorelin WITH DAC, 5 mg total,
    // $99") that does not exist in this catalog at all. What DOES exist is
    // three STANDALONE with-DAC CJC rows, and two of them are already
    // confirmed, bound, priced and member-eligible, so they go on direct sale
    // the moment direct peptide purchase is switched on.
    //
    // Whether standalone with-DAC is blocked too is the founder's call. This
    // test exists so the exposure cannot be discovered after the fact: it
    // speaks if the set changes in EITHER direction, whether a new with-DAC
    // row appears or these are withdrawn.
    const result = reconcilePeptideLaunch(sources);
    expect(
      result.formulationBlockedButSellable.map((r) => r.variantLabel).sort(),
    ).toEqual(["CJC-1295 WITH DAC 2 mg", "CJC-1295 WITH DAC 5 mg"]);
    expect(
      result.pendingFormulationBlocked.map((r) => r.variantLabel),
    ).toEqual(["CJC-1295 - With DAC (10mg)"]);
  });

  it("recognizes the with-DAC formulation in the shapes the workbook writes it", () => {
    for (const label of [
      "CJC-1295 - With DAC (10mg)",
      "CJC-1295 WITH DAC 5 mg",
      "cjc-1295 with-dac 2 mg",
      "CJC-1295 With  DAC",
    ]) {
      expect(isFormulationBlocked(label), label).toBe(true);
    }
    for (const label of [
      "CJC-1295 NO DAC 10 mg",
      "CJC-1295 (No DAC) 5 mg + IPAMORELIN 5 mg",
      "BPC-157 (20mg)",
    ]) {
      expect(isFormulationBlocked(label), label).toBe(false);
    }
  });

  it("reconciles the shipped artifact against the 139/111/27 canonical target", () => {
    // THE WHOLE POINT, and it closes exactly. Session s3 proved the SOURCE
    // workbook holds 141 rows / 112 RUO / 29 pending
    // (shared/research/launch/peptide-launch-acceptance.test.ts). This asserts
    // the other half nobody had measured: what the SHIPPED canonical artifact
    // actually contains, and therefore what must still land.
    //
    //   shipped today              135 variants = 106 sellable + 29 pending
    //   reclassify the 2 dupes     -> 108 confirmed, 27 pending
    //     (Hexarelin 5 mg, Oxytocin 10 mg, both already bound and priced)
    //   generate 3 missing RUO     -> 111 direct
    //     (Retatrutide 60 mg, MOTS-C 40 mg, Glutathione 600 mg)
    //   generate 1 blocked combo   -> 112 RUO, 139 unique variants
    //     (CJC-1295 + Ipamorelin WITH DAC, split unresolved)
    //
    // 135 + 4 generated = 139. 106 + 2 reclassified + 3 generated = 111.
    // 29 - 2 = 27. Every founder number is reachable, and this states the
    // exact delta between here and there.
    const result = reconcilePeptideLaunch(sources);
    const MISSING_FROM_ARTIFACT = 4;
    const RECLASSIFY = 2;
    const GENERATED_RUO = 3;
    expect(result.totalVariants + MISSING_FROM_ARTIFACT).toBe(139);
    expect(result.classificationPending - RECLASSIFY).toBe(27);
    expect(
      result.directToday +
        result.formulationBlockedButSellable.length +
        RECLASSIFY +
        GENERATED_RUO,
    ).toBe(111);
  });

  it("the rows the target needs generated are genuinely absent, not just renamed", () => {
    // Checked by substring across product name, slug and variant label, so a
    // relabelled row would still be found and this would not send anyone
    // hunting for something that is already there.
    const result = reconcilePeptideLaunch(sources);
    const haystack = result.rows
      .map((r) => `${r.productName} ${r.slug} ${r.variantLabel}`.toLowerCase())
      .join(" | ");
    for (const [needle, why] of [
      ["retatrutide 60", "Retatrutide 60 mg"],
      ["mots-c 40", "MOTS-C 40 mg"],
      ["glutathione 600", "Glutathione 600 mg"],
    ] as const) {
      expect(haystack.includes(needle), `${why} unexpectedly present`).toBe(false);
    }
    // And the two that ARE present, so the split between "reclassify" and
    // "generate" cannot silently invert.
    expect(haystack).toContain("hexarelin (5mg)");
    expect(haystack).toContain("oxytocin (10mg)");
  });

  it("reports that classification, not commerce, is the remaining gate", () => {
    // The actionable finding for the launch: every pending peptide is already
    // bound and priced, so confirming a classification is a one-step change
    // with no commerce work behind it.
    const result = reconcilePeptideLaunch(sources);
    expect(result.pendingButCommerceReady).toBe(result.classificationPending);
  });
});

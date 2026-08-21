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
      // All 106 confirmed sellable rows are direct. The two standalone
      // CJC WITH DAC rows are among them, by founder decision 2026-08-21.
      directToday: 106,
      pending: 29,
      blockedButSellable: 0,
      pendingBlocked: 0,
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

  it("SAFETY: the held combination is never counted as promotable", () => {
    const result = reconcilePeptideLaunch(sources);
    expect(result.pendingPromotable).toBe(
      result.pendingButCommerceReady - result.pendingFormulationBlocked.length,
    );
  });

  it("holds ONLY the CJC + Ipamorelin combination, never standalone with-DAC", () => {
    // Founder decision 2026-08-21, and the correction to this module's first
    // version, which matched the with-DAC substring alone and would therefore
    // have withheld two products the founder has ruled DIRECT. The instruction
    // was explicit: do not broaden this hold.
    for (const held of [
      "CJC-1295 + Ipamorelin WITH DAC 5 mg total",
      "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)",
      "cjc-1295 with-dac + ipamorelin",
    ]) {
      expect(isFormulationBlocked(held), held).toBe(true);
    }
    for (const direct of [
      "CJC-1295 WITH DAC 2 mg",
      "CJC-1295 WITH DAC 5 mg",
      "CJC-1295 - With DAC (10mg)",
      "CJC-1295 NO DAC 10 mg",
      "CJC-1295 (No DAC) 5 mg + IPAMORELIN 5 mg",
      "BPC-157 (20mg)",
    ]) {
      expect(isFormulationBlocked(direct), direct).toBe(false);
    }
    // The hold binds to the SKU too, so it survives any relabelling once the
    // row is generated into the catalog.
    expect(isFormulationBlocked("anything at all", "GRP-0422")).toBe(true);
    expect(isFormulationBlocked("anything at all", "GEN-GRP-0001")).toBe(false);
  });

  it("the two standalone with-DAC rows are DIRECT, and the 10 mg is Request Order", () => {
    // The founder's three-way split, asserted against the shipped artifact so
    // a catalog change that moved any of them would be caught.
    const result = reconcilePeptideLaunch(sources);
    const find = (label: string) =>
      result.rows.find((r) => r.variantLabel === label);
    for (const label of ["CJC-1295 WITH DAC 2 mg", "CJC-1295 WITH DAC 5 mg"]) {
      const row = find(label);
      expect(row, `${label} missing from the artifact`).toBeDefined();
      expect(row!.classificationPending, label).toBe(false);
      expect(row!.sellable, label).toBe(true);
      expect(row!.formulationBlocked, label).toBe(false);
    }
    const tenMg = find("CJC-1295 - With DAC (10mg)");
    expect(tenMg).toBeDefined();
    expect(tenMg!.classificationPending).toBe(true);
    expect(tenMg!.formulationBlocked).toBe(false);
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
    expect(result.directToday + RECLASSIFY + GENERATED_RUO).toBe(111);
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

/**
 * The held-education lookup and the registered rows, in the suite hosted CI runs.
 * The same cases as scripts/acceptance/held-education.node-test.mjs, which CI does not run,
 * plus the registered rows themselves against the real hold file.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createHeldEducationLookup as lookup, heldEducationDigest as digest, heldEducationReceiptSha256 as receipt,
  type HeldEducationGrant,
} from "./held-education";
import { heldEducationRegistrations } from "./held-education-registrations";
import { inquiryReviewStateFor } from "./inquiry-review-states";

const c = { datasetSha256: "5".repeat(64), family: "clinical_formulations_503a", offeringId: "mo_0a", sourceVariantId: "mov_0a" };
const h = { staffReviewCode: "offering_decision", customerMessage: "This is a synthetic hold notice.", neutralSpecification: null };
const grant = {
  ...c, holdCode: h.staffReviewCode, holdMessage: h.customerMessage, summary: "Synthetic education only.",
  overview: "Technical overview for this synthetic case. See the cautions.", purpose: "Synthetic purpose sentence.",
  cautions: "Synthetic first caution.\n\nSynthetic second caution.",
  contentReviewReceiptSha256: receipt("synthetic content review 1"),
  displayDecisionReceiptSha256: receipt("synthetic display decision 2"),
};
type Raw = Record<string, unknown>;
const pin = (r: Raw) => ({ ...r, digest: digest(r as Omit<HeldEducationGrant, "digest">) }) as unknown as HeldEducationGrant;
const exercise = (raw: HeldEducationGrant[] = [pin(grant)], ctx: Raw = c, hold: Raw | null = h) =>
  lookup(raw)(ctx as never, hold as never);

describe("held education lookup", () => {
  it("gives nothing for an empty registry or no current hold", () => {
    expect(exercise([])).toBeUndefined();
    expect(exercise([pin(grant)], c, null)).toBeUndefined();
  });

  it("returns the four education fields verbatim, frozen, without a receipt or a change to the hold", () => {
    const got = exercise();
    expect(got).toEqual({ summary: grant.summary, overview: grant.overview, purpose: grant.purpose, cautions: grant.cautions });
    expect(Object.isFrozen(got)).toBe(true);
    expect(h.staffReviewCode).toBe("offering_decision");
    expect(JSON.stringify(got)).not.toContain(grant.contentReviewReceiptSha256);
  });

  it("requires purpose and cautions", () => {
    for (const field of ["purpose", "cautions"] as const) {
      const { [field]: _omitted, ...rest } = grant;
      expect(exercise([pin(rest)]), field + " absent").toBeUndefined();
      expect(exercise([pin({ ...grant, [field]: "" })]), field + " empty").toBeUndefined();
      expect(exercise([pin({ ...grant, [field]: " padded " })]), field + " untrimmed").toBeUndefined();
    }
  });

  it("invalidates the row when any bound field, the dataset or the hold notice changes", () => {
    const r = pin(grant) as unknown as Record<string, string>;
    for (const field of ["summary", "overview", "purpose", "cautions", "datasetSha256", "family", "offeringId", "sourceVariantId",
      "contentReviewReceiptSha256", "displayDecisionReceiptSha256", "holdCode", "holdMessage", "digest"]) {
      expect(exercise([{ ...r, [field]: r[field] + "0" } as unknown as HeldEducationGrant]), field).toBeUndefined();
    }
    expect(exercise([pin(grant)], { ...c, datasetSha256: "b".repeat(64) })).toBeUndefined();
    expect(exercise([pin(grant)], c, { ...h, customerMessage: "A revised notice." })).toBeUndefined();
  });

  it("allows only risk and offering holds on clinical 503A, with no neutral specification", () => {
    for (const code of ["identity_unconfirmed", "label_or_source_needed", "strength_or_formulation_unconfirmed", "wording_decision",
      "category_display_decision", "description_pending", "unknown"]) {
      expect(exercise([pin({ ...grant, holdCode: code })], c, { ...h, staffReviewCode: code }), code).toBeUndefined();
    }
    expect(exercise([pin(grant)], c, { ...h, neutralSpecification: "Strength unconfirmed." })).toBeUndefined();
    expect(exercise([pin({ ...grant, family: "supplements" })], { ...c, family: "supplements" })).toBeUndefined();
    expect(exercise([pin({ ...grant, holdCode: "risk_review" })], c, { ...h, staffReviewCode: "risk_review" })).toBeDefined();
  });

  it("fails closed for a duplicated pair only, and refuses ambiguous, absent or plain-text receipts", () => {
    const g = pin(grant);
    const fn = lookup([g, g, pin({ ...grant, sourceVariantId: "mov_0b" })]);
    expect(fn(c as never, h as never)).toBeUndefined();
    expect(fn({ ...c, sourceVariantId: "mov_0b" } as never, h as never)).toBeDefined();
    for (const bad of [
      { displayDecisionReceiptSha256: grant.contentReviewReceiptSha256 }, { contentReviewReceiptSha256: "" },
      { displayDecisionReceiptSha256: "approved" }, { contentReviewReceiptSha256: "KAN-98/165" },
      { overview: " " }, { summary: "x\u0001" }, { cautions: "x\u0007" },
    ]) {
      expect(exercise([pin({ ...grant, ...bad })]), JSON.stringify(bad)).toBeUndefined();
    }
  });
});

describe("registered held education rows", () => {
  it("carry no plain ticket reference", () => {
    const text = readFileSync(resolve("server/research/master-offerings/held-education-registrations.ts"), "utf8");
    expect(text).not.toMatch(/\b[A-Z][A-Z0-9]+-\d+\/\d+\b/);
    // Control: the same pattern finds a planted reference.
    expect(text.replace("export const", "// KAN-1/2\nexport const")).toMatch(/\b[A-Z][A-Z0-9]+-\d+\/\d+\b/);
  });

  it("are each shown by the real lookup beside the hold they were cut for, once per variant", () => {
    const ids = heldEducationRegistrations.map((row) => row.sourceVariantId);
    expect(new Set(ids).size).toBe(ids.length);
    const show = lookup(heldEducationRegistrations);
    for (const row of heldEducationRegistrations) {
      expect(row.contentReviewReceiptSha256, row.sourceVariantId).not.toBe(row.displayDecisionReceiptSha256);
      const hold = inquiryReviewStateFor(row.offeringId, row.sourceVariantId);
      expect(hold, row.sourceVariantId).not.toBeNull();
      const shown = show({ datasetSha256: row.datasetSha256, family: row.family,
        offeringId: row.offeringId, sourceVariantId: row.sourceVariantId }, hold!);
      expect(shown, row.sourceVariantId).toEqual({
        summary: row.summary, overview: row.overview, purpose: row.purpose, cautions: row.cautions,
      });
    }
  });
});

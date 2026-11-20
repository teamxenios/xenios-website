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
  heldBrowseEducationDigest as browseDigest,
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

describe("separately reviewed held browse education (synthetic decisions only)", () => {
  const short = "Synthetic short education. Synthetic limitation remains visible.";
  const fullCopy = (r: HeldEducationGrant) => ({
    summary: r.summary, overview: r.overview, purpose: r.purpose, cautions: r.cautions,
  });
  const withBrowse = (legacy: HeldEducationGrant = pin(grant)): HeldEducationGrant => {
    const browse = { summary: short,
      contentReviewReceiptSha256: receipt("synthetic browse content review 3"),
      displayDecisionReceiptSha256: receipt("synthetic browse display decision 4") };
    return { ...legacy, browse: { ...browse, digest: browseDigest(legacy, browse) } };
  };
  const rebindBrowse = (r: HeldEducationGrant, change: Record<string, string>): HeldEducationGrant => {
    const browse = { ...r.browse!, ...change };
    return { ...r, browse: { ...browse, digest: browseDigest(r, browse) } };
  };

  it("adds only complete browse text after valid legacy education and distinct new decisions, without leaking receipts", () => {
    const r = withBrowse();
    const got = exercise([r]);
    expect(got).toEqual({ ...fullCopy(r), browseSummary: short });
    expect(Object.isFrozen(got)).toBe(true);
    expect(digest(r)).toBe(r.digest);
    expect(h).toEqual({ staffReviewCode: "offering_decision", customerMessage: grant.holdMessage, neutralSpecification: null });
    for (const secret of [r.contentReviewReceiptSha256, r.displayDecisionReceiptSha256,
      r.browse!.contentReviewReceiptSha256, r.browse!.displayDecisionReceiptSha256, r.browse!.digest, r.digest]) {
      expect(JSON.stringify(got)).not.toContain(secret);
    }
    expect(got).not.toHaveProperty("browse");
    expect(got).not.toHaveProperty("holdCode");
  });

  it("omits malformed optional evidence and recycled receipts while preserving the exact valid legacy copy", () => {
    const r = withBrowse();
    for (const browse of [null, false, "approved", [], {}, { ...r.browse, extra: "unreviewed" },
      { ...r.browse, digest: undefined }, { ...r.browse, summary: 12 }]) {
      expect(exercise([{ ...r, browse } as unknown as HeldEducationGrant]), JSON.stringify(browse)).toEqual(fullCopy(r));
    }
    for (const summary of ["", " padded ", "x".repeat(481), "Synthetic\u0000text", "Synthetic\ntext", "Synthetic\u0085text"]) {
      expect(exercise([rebindBrowse(r, { summary })]), JSON.stringify(summary)).toEqual(fullCopy(r));
    }
    for (const field of ["contentReviewReceiptSha256", "displayDecisionReceiptSha256"]) {
      for (const value of ["", "approved", "a".repeat(63), "A".repeat(64), r.contentReviewReceiptSha256, r.displayDecisionReceiptSha256]) {
        expect(exercise([rebindBrowse(r, { [field]: value })]), field + ":" + value).toEqual(fullCopy(r));
      }
    }
    expect(exercise([rebindBrowse(r, { displayDecisionReceiptSha256: r.browse!.contentReviewReceiptSha256 })])).toEqual(fullCopy(r));
    const throwing = { ...r.browse };
    Object.defineProperty(throwing, "summary", { enumerable: true, get() { throw Error("Synthetic malformed optional input"); } });
    expect(exercise([{ ...r, browse: throwing } as unknown as HeldEducationGrant])).toEqual(fullCopy(r));
  });

  it("refuses changed browse words or either decision with a stale digest, but accepts their properly rebound control", () => {
    const r = withBrowse();
    for (const field of ["summary", "contentReviewReceiptSha256", "displayDecisionReceiptSha256", "digest"] as const) {
      const browse = { ...r.browse!, [field]: r.browse![field] + "0" };
      expect(exercise([{ ...r, browse }]), field).toEqual(fullCopy(r));
    }
    const changed = "Reworded synthetic education. Synthetic limitation remains visible.";
    expect(exercise([rebindBrowse(r, { summary: changed })])?.browseSummary).toBe(changed);
  });

  it("requires a new browse chain after independently valid legacy words, dataset, notice or review decisions change", () => {
    const source = withBrowse();
    for (const field of ["summary", "overview", "purpose", "cautions"] as const) {
      const legacy = pin({ ...grant, [field]: grant[field] + " Revised synthetic text." });
      expect(exercise([{ ...legacy, browse: source.browse }]), field).toEqual(fullCopy(legacy));
    }
    for (const field of ["contentReviewReceiptSha256", "displayDecisionReceiptSha256"]) {
      const legacy = pin({ ...grant, [field]: receipt("synthetic revised legacy " + field) });
      expect(exercise([{ ...legacy, browse: source.browse }]), field).toEqual(fullCopy(legacy));
    }
    const dataset = "b".repeat(64);
    const onNewDataset = pin({ ...grant, datasetSha256: dataset });
    expect(exercise([{ ...onNewDataset, browse: source.browse }], { ...c, datasetSha256: dataset })).toEqual(fullCopy(onNewDataset));
    const notice = "A revised synthetic hold notice.";
    const onNewNotice = pin({ ...grant, holdMessage: notice });
    expect(exercise([{ ...onNewNotice, browse: source.browse }], c, { ...h, customerMessage: notice })).toEqual(fullCopy(onNewNotice));
  });

  it("prevents borrowing another variant's browse decision while preserving its independently valid full education", () => {
    const donor = withBrowse();
    const receiver = pin({ ...grant, offeringId: "mo_0b", sourceVariantId: "mov_0b" });
    const ctx = { ...c, offeringId: receiver.offeringId, sourceVariantId: receiver.sourceVariantId };
    expect(exercise([{ ...receiver, browse: donor.browse }], ctx)).toEqual(fullCopy(receiver));
    expect(exercise([withBrowse(receiver)], ctx)?.browseSummary).toBe(short);
    expect(exercise([donor])?.browseSummary).toBe(short);
  });

  it("never uses an otherwise qualified browse grant to override any legacy hold or dataset refusal", () => {
    const row = withBrowse();
    expect(exercise([row], c, null)).toBeUndefined();
    expect(exercise([row], c, { ...h, neutralSpecification: "Synthetic strength unconfirmed." })).toBeUndefined();
    expect(exercise([row], { ...c, datasetSha256: "b".repeat(64) })).toBeUndefined();
    const research = withBrowse(pin({ ...grant, family: "research_peptides_materials" }));
    expect(exercise([research], { ...c, family: research.family })).toBeUndefined();
    for (const code of ["identity_unconfirmed", "label_or_source_needed", "strength_or_formulation_unconfirmed",
      "wording_decision", "category_display_decision", "description_pending"]) {
      const unsupported = withBrowse(pin({ ...grant, holdCode: code }));
      expect(exercise([unsupported], c, { ...h, staffReviewCode: code }), code).toBeUndefined();
    }
    const corruptLegacy = { ...row, summary: "Unbound changed legacy summary." };
    const reboundBrowse = rebindBrowse(corruptLegacy, { summary: short });
    expect(exercise([reboundBrowse])).toBeUndefined();
  });

  it("snapshots nested browse evidence so later source mutations cannot rewrite the registered text", () => {
    const original = withBrowse();
    const mutable = { ...original, browse: { ...original.browse! } };
    const show = lookup([mutable]);
    const before = show(c as never, h as never);
    mutable.browse.summary = "A later synthetic mutation with a recomputed digest.";
    mutable.browse.digest = browseDigest(mutable, mutable.browse);
    mutable.summary = "A later synthetic mutation to full text.";
    expect(show(c as never, h as never)).toEqual(before);
    expect(show(c as never, h as never)?.browseSummary).toBe(short);
    expect(show(c as never, h as never)?.summary).toBe(grant.summary);
  });

  it("preserves the historical v2 hash and uses the separate ordered browse-domain vector", () => {
    // Constants independently authored with SHA256 over the synthetic JSON arrays, not the source functions.
    const r = withBrowse();
    expect(r.digest).toBe("ef00c2e5530ed238ec5d02a65c507ba9a3a5ebed7230cc1e87e2249641550a56");
    expect(digest(r)).toBe(r.digest);
    expect(r.browse!.digest).toBe("503611920ac423a5c563f8fd4911b081b5eb733dfce250a3612abb3e17e61258");
    expect(r.browse!.digest).not.toBe(r.digest);
  });
});

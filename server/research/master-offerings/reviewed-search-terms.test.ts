import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import contentBatch from "./data/reviewed-public-content.json";
import {
  REVIEWED_SEARCH_TERMS, loadReviewedSearchTerms, matchesReviewedSearchTerm, normalizeSearchTerm,
} from "./reviewed-search-terms";

const DATASET = contentBatch.datasetSha256;
const A = { offeringId: "mo_0a", sourceVariantId: "mov_0a" };
const B = { offeringId: "mo_0b", sourceVariantId: "mov_0b" };
const record = (overrides: Record<string, unknown> = {}) => ({
  id: "r1", kind: "identity_alias", terms: ["Copper Peptide"], targets: [A, B],
  evidence: [{ source: "synthetic", revision: "1" }], reviewExpiresAt: "2100-01-01T00:00:00Z", ...overrides,
});
const table = (records: unknown[] = [record()], overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1, revision: "test", datasetSha256: DATASET, records, ...overrides,
});
const NOW = Date.parse("2026-11-18T21:00:00Z");
const at = (ms: number) => () => ms;

describe("reviewed search terms: table contract", () => {
  it.each([
    ["not an object", null],
    ["an extra top-level key", { ...table(), note: "x" }],
    ["another schema version", table(undefined, { schemaVersion: 2 })],
    ["a dataset digest that is not sha256 hex", table(undefined, { datasetSha256: "ABC" })],
    ["an extra record key", table([{ ...record(), benefit: "healing" }])],
    ["a kind other than identity_alias", table([record({ kind: "information" })])],
    ["an unparseable expiry", table([record({ reviewExpiresAt: "soon" })])],
    ["no evidence", table([record({ evidence: [] })])],
    ["no terms", table([record({ terms: [] })])],
    ["a term with a control character", table([record({ terms: ["copper\tpeptide"] })])],
    ["a term over 120 characters", table([record({ terms: ["x".repeat(121)] })])],
    ["no targets", table([record({ targets: [] })])],
    ["a target that is not a source identity", table([record({ targets: [{ offeringId: "GEN-GRP-0248", sourceVariantId: "mov_0a" }] })])],
    ["a target with an extra key", table([record({ targets: [{ ...A, family: "research_peptides_materials" }] })])],
    ["the same target twice", table([record({ targets: [A, A] })])],
    ["the same record id twice", table([record(), record({ terms: ["other"] })])],
    ["the same term in two records", table([record(), record({ id: "r2", terms: ["copper  PEPTIDE"] })])],
  ])("refuses a table with %s", (_label, value) => {
    expect(() => loadReviewedSearchTerms(value, DATASET)).toThrow(/^reviewed-search-terms: /);
  });

  it("is inert when bound to other dataset bytes", () => {
    const terms = loadReviewedSearchTerms(table(undefined, { datasetSha256: "0".repeat(64) }), DATASET);
    expect(terms.entriesFor(A.offeringId, A.sourceVariantId)).toBeUndefined();
  });

  it("gives each exact target its terms, and nothing else", () => {
    const terms = loadReviewedSearchTerms(table(), DATASET);
    expect(terms.entriesFor(A.offeringId, A.sourceVariantId)?.map((entry) => entry.term)).toEqual(["copper peptide"]);
    expect(terms.entriesFor(A.offeringId, B.sourceVariantId)).toBeUndefined();
    expect(terms.entriesFor("mo_0c", "mov_0c")).toBeUndefined();
  });
});

describe("reviewed search terms: matching", () => {
  const entries = loadReviewedSearchTerms(table(), DATASET).entriesFor(A.offeringId, A.sourceVariantId);

  it.each(["copper peptide", "Copper Peptide", "  COPPER   peptide ", "ｃｏｐｐｅｒ ｐｅｐｔｉｄｅ"])("matches the whole query %j", (query) => {
    expect(matchesReviewedSearchTerm(entries, query, at(NOW))).toBe(true);
  });

  it.each(["peptide", "copper", "copper peptides", "copper peptide 50 mg", "copper-peptide", ""])("does not match %j", (query) => {
    expect(matchesReviewedSearchTerm(entries, query, at(NOW))).toBe(false);
  });

  it("enforces expiry on every lookup, exclusive at the instant", () => {
    const expiring = loadReviewedSearchTerms(table([record({ reviewExpiresAt: "2026-11-18T21:00:00Z" })]), DATASET)
      .entriesFor(A.offeringId, A.sourceVariantId);
    expect(matchesReviewedSearchTerm(expiring, "copper peptide", at(NOW - 1))).toBe(true);
    expect(matchesReviewedSearchTerm(expiring, "copper peptide", at(NOW))).toBe(false);
    expect(matchesReviewedSearchTerm(expiring, "copper peptide", at(Number.NaN))).toBe(false);
  });

  it("does not read the clock for a row without terms", () => {
    let reads = 0;
    expect(matchesReviewedSearchTerm(undefined, "copper peptide", () => { reads += 1; return NOW; })).toBe(false);
    expect(reads).toBe(0);
  });

  it("normalizes terms and queries the same way", () => {
    expect(normalizeSearchTerm("  Vitamin B12 ")).toBe("vitamin b12");
  });
});

describe("the committed table", () => {
  it("is bound to the reviewed dataset digest", () => {
    const committed = JSON.parse(readFileSync(resolve("server/research/master-offerings/data/reviewed-search-terms.json"), "utf8"));
    expect(committed.datasetSha256).toBe(DATASET);
  });

  it("is the reviewed bytes: changing it changes this digest and needs a review", () => {
    const bytes = readFileSync(resolve("server/research/master-offerings/data/reviewed-search-terms.json"), "utf8").replaceAll("\r\n", "\n");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("e4bf8f3aba7263ca792b00274019dd3b831a08d601f28543d3dcb03e5c197e80");
    // r0 is empty: infrastructure only. No reviewed term is live, and benefit search is not built.
    expect(REVIEWED_SEARCH_TERMS.revision).toBe("reviewed-search-terms-r0-empty");
  });
});

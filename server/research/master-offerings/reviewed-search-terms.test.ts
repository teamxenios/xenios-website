import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import contentBatch from "./data/reviewed-public-content.json";
import {
  REVIEWED_SEARCH_TERMS, loadReviewedSearchTerms, matchesReviewedSearchTerm, normalizeSearchTerm, searchTermIdentityKey,
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

  it("refuses a table naming a target that is not in the bound dataset", () => {
    const known = new Set([searchTermIdentityKey(A.offeringId, A.sourceVariantId)]);
    expect(() => loadReviewedSearchTerms(table(), DATASET, known)).toThrow(/target not in the dataset/);
    expect(() => loadReviewedSearchTerms(table([record({ targets: [A] })]), DATASET, known)).not.toThrow();
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
  const read = (path: string) => readFileSync(resolve(path), "utf8").replaceAll("\r\n", "\n");
  const tableText = read("server/research/master-offerings/data/reviewed-search-terms.json");
  const committed = JSON.parse(tableText);
  const datasetText = read("server/research/master-offerings/data/member-safe-master-offerings.generated.json");
  const dataset = JSON.parse(datasetText) as {
    products: { id: string; displayName: string; variants: { id: string; label: string }[] }[];
  };
  const rowByKey = new Map(dataset.products.flatMap((product) => product.variants.map((variant) =>
    [searchTermIdentityKey(product.id, variant.id), `${product.displayName} ${variant.label}`] as const)));

  it("is bound to the digest of the dataset file actually committed beside it", () => {
    // A dataset change fails here, in the same change, and forces the table's re-review.
    expect(createHash("sha256").update(datasetText).digest("hex")).toBe(committed.datasetSha256);
    expect(committed.datasetSha256).toBe(DATASET);
  });

  it("names only identities that are in that dataset", () => {
    expect(() => loadReviewedSearchTerms(committed, DATASET, new Set(rowByKey.keys()))).not.toThrow();
  });

  it("is the reviewed bytes: changing it changes this digest and needs a review", () => {
    expect(createHash("sha256").update(tableText).digest("hex")).toBe("952eb50592e41eeeaf99e5ce717d65edf1b8b5e21407840ac50966a0eb9d37d9");
    expect(REVIEWED_SEARCH_TERMS.revision).toBe("reviewed-search-terms-r4");
    // r4 holds identity names only. It is not topic or benefit search.
    expect(committed.records.map((record: { id: string; terms: string[] }) => [record.id, record.terms])).toEqual([
      ["copper-peptide-ghk-cu", ["copper peptide"]], ["vitamin-b12", ["vitamin b12"]], ["fish-oil", ["fish oil"]],
      ["vitamin-c", ["vitamin c"]], ["turmeric", ["turmeric"]],
    ]);
  });

  it("keeps CLAUDE-3's amendments: no GLP-1 row under vitamin b12, no non-GHK-Cu row under copper peptide", () => {
    const names = (id: string) => committed.records.find((record: { id: string }) => record.id === id).targets
      .map((target: { offeringId: string; sourceVariantId: string }) => rowByKey.get(searchTermIdentityKey(target.offeringId, target.sourceVariantId))!);
    for (const name of names("vitamin-b12")) {
      expect(/semaglutide|tirzepatide/i.test(name)).toBe(false);
      expect(/cobalamin|\bb[\s-]?12\b/i.test(name)).toBe(true);
    }
    // A multivitamin or B-complex row is not a vitamin B12 listing.
    for (const name of names("vitamin-b12")) expect(/multi|b[\s-]?complex/i.test(name)).toBe(false);
    for (const name of names("copper-peptide-ghk-cu")) expect(/ghk[\s-]?cu|ghkcu/i.test(name) && !/no copper/i.test(name)).toBe(true);
    // Fish oil names three omega rows; the vegan omega is algal oil, not fish oil.
    expect(names("fish-oil")).toHaveLength(3);
    for (const name of names("fish-oil")) expect(/omega/i.test(name) && !/vegan/i.test(name)).toBe(true);
    // Vitamin C names the three ascorbic acid rows, not rows that only contain vitamin C.
    expect(names("vitamin-c")).toHaveLength(3);
    for (const name of names("vitamin-c")) expect(/ascorbic acid/i.test(name) && !/collagen|multi|rejuvenate/i.test(name)).toBe(true);
    // Turmeric names the turmeric root extract capsule, not the research curcumin compound.
    expect(names("turmeric")).toEqual(["Pure Encapsulations Curcumin 60 capsules"]);
  });
});

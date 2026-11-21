/**
 * Reviewed search terms through the real quote-request picker: real generated catalog, real
 * reviewed-dataset registration, real holds; synthetic Early Access viewer. Most cases use a
 * synthetic probe term that no listing contains, so every extra row is the table's doing.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isResearchFormUnconfirmed } from "../../../client/src/research/product-media/reviewed-form-holds";
import type { AssistedOrderViewer } from "../assisted-order/ports";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import committedTable from "./data/reviewed-search-terms.json";
import contentBatch from "./data/reviewed-public-content.json";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import { inquiryReviewStateFor } from "./inquiry-review-states";
import { REVIEWED_SEARCH_TERMS, loadReviewedSearchTerms, type ReviewedSearchTerms } from "./reviewed-search-terms";
import { MasterOfferingCatalogService } from "./service";

const reader = new GeneratedMasterOfferingCatalogReader(
  resolve("server/research/master-offerings/data/member-safe-master-offerings.generated.json"),
);
const offerings = new MasterOfferingCatalogService(reader, async () => ({ binding: null, selection: null }));
const viewer: AssistedOrderViewer = {
  actorType: "early_access_session", memberId: null, normalizedEmail: null,
  earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-session",
  capabilities: new Set(["assisted_orders:submit"]),
};
const DATASET = contentBatch.datasetSha256;
const NOW = Date.parse("2026-11-18T21:00:00Z");
const catalogWith = (terms: ReviewedSearchTerms, now = NOW) => createRequestIntentCatalog({
  serviceFor: () => offerings, bindingFor: () => null, offeringVariantFor: () => null, catalogVersion: "synthetic",
}, undefined, () => now, terms);
const EMPTY = loadReviewedSearchTerms({ schemaVersion: 1, revision: "empty", datasetSha256: DATASET, records: [] }, DATASET);

const PROBE = "zz reviewed term probe";
// Research GHK-Cu rows with no hold of any kind: GHK-Cu (75mg) and GLOW.
const UNHELD = [
  { offeringId: "mo_d1a6493665b6ba628c2a", sourceVariantId: "mov_361af70608afc9c98ec0" },
  { offeringId: "mo_69c6615ef3e615e76088", sourceVariantId: "mov_5e74aacac728cfcbd11f" },
] as const;
// Research GHK-Cu 100 mg and 50 mg: no inquiry hold, but their form is held.
const FORM_HELD = [
  { offeringId: "mo_b06b77a95d5dd5bf8cd7", sourceVariantId: "mov_35b19a790d7a247210c9" },
  { offeringId: "mo_fb02f804912e868b0a10", sourceVariantId: "mov_4522e672752616ff992d" },
] as const;
// Inquiry-held rows: clinical GHK-CU 10MG/ML and Methylcobalamin 5MG/ML (10ML).
const HELD = [
  { offeringId: "mo_8ca205c9a3396be1b6a7", sourceVariantId: "mov_605189187511069b1df9" },
  { offeringId: "mo_c0112c450a6e71d64e87", sourceVariantId: "mov_ecb762819fd1adedf67b" },
] as const;
// A well-formed identity that is not in the catalog.
const ABSENT = { offeringId: "mo_000000000000000000ff", sourceVariantId: "mov_000000000000000000ff" };

const probeTable = (overrides: Record<string, unknown> = {}, terms: readonly string[] = [PROBE]) => ({
  schemaVersion: 1, revision: "probe", datasetSha256: DATASET,
  records: [{
    id: "probe", kind: "identity_alias", terms, targets: [...UNHELD, ...FORM_HELD, ...HELD, ABSENT],
    evidence: [{ source: "synthetic", revision: "1" }], reviewExpiresAt: "2100-01-01T00:00:00Z", ...overrides,
  }],
});
const probe = loadReviewedSearchTerms(probeTable(), DATASET);
const unheldIds = UNHELD.map((target) => target.sourceVariantId).sort();
const idsOf = (page: { items: readonly { sourceSelection: { variantId: string } }[] }) =>
  page.items.map((item) => item.sourceSelection.variantId).sort();

describe("reviewed search terms in the quote-request picker", () => {
  it("uses fixtures whose holds are what this file says", () => {
    for (const target of UNHELD) {
      expect(inquiryReviewStateFor(target.offeringId, target.sourceVariantId)).toBeNull();
      expect(isResearchFormUnconfirmed(target.sourceVariantId, target.offeringId)).toBe(false);
    }
    for (const target of FORM_HELD) {
      expect(inquiryReviewStateFor(target.offeringId, target.sourceVariantId)).toBeNull();
      expect(isResearchFormUnconfirmed(target.sourceVariantId, target.offeringId)).toBe(true);
    }
    for (const target of HELD) expect(inquiryReviewStateFor(target.offeringId, target.sourceVariantId)).not.toBeNull();
  });

  it("finds nothing for the probe without a reviewed term: no listing contains it", async () => {
    expect((await catalogWith(EMPTY).list(viewer, { search: PROBE, pageSize: 100 })).total).toBe(0);
  });

  it("adds exactly the unheld, visible targets; form-held, held and absent targets add nothing", async () => {
    const page = await catalogWith(probe).list(viewer, { search: PROBE, pageSize: 100 });
    expect(idsOf(page)).toEqual(unheldIds);
    expect(page.total).toBe(UNHELD.length);
    // The term is search only: it is not in what the picker returns.
    expect(JSON.stringify(page.items)).not.toContain(PROBE);
  });

  it("counts reviewed matches before paging", async () => {
    const catalog = catalogWith(probe);
    const first = await catalog.list(viewer, { search: PROBE, pageSize: 1, page: 1 });
    const second = await catalog.list(viewer, { search: PROBE, pageSize: 1, page: 2 });
    expect([first.total, second.total]).toEqual([2, 2]);
    expect([first.items.length, second.items.length]).toEqual([1, 1]);
    expect([...idsOf(first), ...idsOf(second)].sort()).toEqual(unheldIds);
  });

  it("keeps the family filter", async () => {
    const catalog = catalogWith(probe);
    expect((await catalog.list(viewer, { search: PROBE, family: "clinical_formulations_503a", pageSize: 100 })).total).toBe(0);
    expect(idsOf(await catalog.list(viewer, { search: PROBE, family: "research_peptides_materials", pageSize: 100 }))).toEqual(unheldIds);
  });

  it("matches only the whole query", async () => {
    const catalog = catalogWith(probe);
    expect((await catalog.list(viewer, { search: "zz reviewed", pageSize: 100 })).total).toBe(0);
    expect(idsOf(await catalog.list(viewer, { search: "  ZZ  Reviewed term PROBE ", pageSize: 100 }))).toEqual(unheldIds);
  });

  it("adds nothing when the table is bound to other dataset bytes", async () => {
    const other = loadReviewedSearchTerms(probeTable(), "0".repeat(64));
    expect((await catalogWith(other).list(viewer, { search: PROBE, pageSize: 100 })).total).toBe(0);
  });

  it("stops matching once the review expires, on the next lookup", async () => {
    const expiring = loadReviewedSearchTerms(probeTable({ reviewExpiresAt: "2026-11-18T21:00:00Z" }), DATASET);
    expect((await catalogWith(expiring, NOW - 1).list(viewer, { search: PROBE, pageSize: 100 })).total).toBe(2);
    expect((await catalogWith(expiring, NOW).list(viewer, { search: PROBE, pageSize: 100 })).total).toBe(0);
  });

  it("leaves literal, alias and form search exactly as they were", async () => {
    const before = catalogWith(EMPTY);
    const after = catalogWith(probe);
    for (const search of ["GHK-Cu", "ghk-cu 50 mg", "Troche", "Topical Cream", "methylcobalamin", "liver support", "copper peptide"]) {
      const [a, b] = await Promise.all([before.list(viewer, { search, pageSize: 100 }), after.list(viewer, { search, pageSize: 100 })]);
      expect({ search, ids: idsOf(b), total: b.total }).toEqual({ search, ids: idsOf(a), total: a.total });
    }
  });

  it("adds reviewed rows to literal rows without duplicating either", async () => {
    // A reviewed term that is also literal text of held rows: they stay found by their words.
    const both = loadReviewedSearchTerms(probeTable({}, ["methylcobalamin"]), DATASET);
    const literal = await catalogWith(EMPTY).list(viewer, { search: "methylcobalamin", pageSize: 100 });
    const page = await catalogWith(both).list(viewer, { search: "methylcobalamin", pageSize: 100 });
    expect(literal.total).toBeGreaterThan(0);
    expect(idsOf(page)).toEqual([...idsOf(literal), ...unheldIds].sort());
    expect(new Set(idsOf(page)).size).toBe(page.total);
  });
});

describe("the committed table (r4) in the quote-request picker", () => {
  const targetsOf = (id: string) => committedTable.records.find((record) => record.id === id)!.targets;
  const unheldTargets = (id: string) => targetsOf(id)
    .filter((target) => inquiryReviewStateFor(target.offeringId, target.sourceVariantId) === null
      && !isResearchFormUnconfirmed(target.sourceVariantId, target.offeringId))
    .map((target) => target.sourceVariantId);

  const recordFor: Readonly<Record<string, string>> = { "copper peptide": "copper-peptide-ghk-cu", "vitamin b12": "vitamin-b12", "fish oil": "fish-oil",
    "vitamin c": "vitamin-c", turmeric: "turmeric" };
  it.each(["copper peptide", "vitamin b12", "fish oil", "vitamin c", "turmeric"])("%s adds only its unheld targets to the literal result", async (search) => {
    const id = recordFor[search];
    const literal = idsOf(await catalogWith(EMPTY).list(viewer, { search, pageSize: 100 }));
    const page = await catalogWith(REVIEWED_SEARCH_TERMS).list(viewer, { search, pageSize: 100 });
    const extra = idsOf(page).filter((variantId) => !literal.includes(variantId));
    expect(extra).toEqual(unheldTargets(id).filter((variantId) => !literal.includes(variantId)).sort());
  });

  // Vitamin D3: Pure Encapsulations and Momentous (capsules), and the 503A injection with no "c" at all.
  const D3 = ["mov_b20cdbdf66ca6e74ab58", "mov_35ef96f1f3cf918017cf", "mov_5247438c659e5c5a06e9"];
  const B_COMPLEX = "mov_f2e6a643b1e940ed8525";
  const LIVER_SUPPORT = "mov_b29938eebdaf1935c8cc";
  const idsFor = async (terms: ReviewedSearchTerms, query: string) => idsOf(await catalogWith(terms).list(viewer, { search: query, pageSize: 100 }));

  it("vitamin c finds only the reviewed ascorbic acid rows, and no row by a c inside another word", async () => {
    // No listed row names vitamin C, so literal search finds none: not a D3 row through "capsules".
    expect(await idsFor(EMPTY, "vitamin c")).toEqual([]);
    const found = await idsFor(REVIEWED_SEARCH_TERMS, "vitamin c");
    expect(found.length).toBeGreaterThan(0);
    expect(found).toEqual(unheldTargets("vitamin-c").sort());
    for (const id of D3) expect(found).not.toContain(id);
  });

  it("keeps every Vitamin D3 row for vitamin d, and finds vitamin e by its listed word only", async () => {
    const d = await idsFor(REVIEWED_SEARCH_TERMS, "vitamin d");
    expect(d).toEqual(expect.arrayContaining(D3));
    expect(d).not.toContain(B_COMPLEX);
    const e = await idsFor(REVIEWED_SEARCH_TERMS, "vitamin e");
    expect(e).toContain(LIVER_SUPPORT);
    for (const id of [...D3, B_COMPLEX]) expect(e).not.toContain(id);
  });

  it("still finds a letter that a hyphen joins to a word", async () => {
    expect(await idsFor(REVIEWED_SEARCH_TERMS, "vitamin b complex")).toContain(B_COMPLEX);
    // Lipo-C, 10 mL and 30 mL; not Lipo-B, whose only c is inside "cyanocobalamin".
    const lipoC = await idsFor(REVIEWED_SEARCH_TERMS, "lipo c");
    expect(lipoC).toEqual(expect.arrayContaining(["mov_c3a5f9fdcb1adfd3b4a8", "mov_e5b24db4e56bf2b69b37"]));
    for (const id of ["mov_92a9e34a7ee0402c096a", "mov_3f1723408696198377fc"]) expect(lipoC).not.toContain(id);
  });

  it("shows no row while a final single letter is typed, and the rows again at the next key", async () => {
    // "pure c" on the way to "pure curcumin": no listed word is "c", so nothing shows for one key.
    expect(await idsFor(REVIEWED_SEARCH_TERMS, "pure c")).toEqual([]);
    expect(await idsFor(REVIEWED_SEARCH_TERMS, "pure cu")).toContain("mov_c587f80ff2703f2c2e31");
    // Short words of two letters are unchanged: the unheld research GHK-Cu rows.
    expect(await idsFor(REVIEWED_SEARCH_TERMS, "ghk cu")).toEqual(expect.arrayContaining(unheldIds));
  });

  it("vitamin b12 opens no route to a GLP-1 product", async () => {
    const page = await catalogWith(REVIEWED_SEARCH_TERMS).list(viewer, { search: "vitamin b12", pageSize: 100 });
    for (const item of page.items) expect(/semaglutide|tirzepatide/i.test(item.productName)).toBe(false);
  });
});

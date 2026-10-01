import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateRetainedBindings } from "../../../scripts/research/build-master-offering-bindings";
import { normalizeMasterCatalog, type RawMasterCatalogRow } from "./normalize-catalog";
import { applyCatalogReconciliation } from "./catalog-reconciliation";
import { parsePinnedReconciliationAuthority } from "./reconciliation-authority";

// Synthetic catalog rows; only already-public historical Product Control pair
// identities are reused. This fixture never reads private .local intake or
// claims its synthetic rows authenticate a workbook or production database.
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const approved = read("config/research/master-catalog-reconciliation-20260821.json");
const currentAuthorityBytes = readFileSync("config/research/master-catalog-reconciliation-20260821.json");
const currentAuthority = parsePinnedReconciliationAuthority(currentAuthorityBytes.toString("utf8"));
const publicAuthority = read("server/research/master-offerings/data/master-offering-bindings.generated.json");
const historical = [...publicAuthority.bindings, ...(publicAuthority.supersededBindings ?? []).map((row: { binding: unknown }) => row.binding)];
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
function fixture() {
  const rows: RawMasterCatalogRow[] = Array.from({ length: 426 }, (_, i) => ({ sheetRow: i + 2,
    "Group ID": `GRP-${String(i + 1).padStart(4, "0")}`, "Family": "Research Peptides & Materials", "Channel": "RUO Research",
    "Product": `Synthetic item ${i + 1}`, "Normalized Specification": `Synthetic specification ${i + 1}${i === 79 ? "\u2014continuation" : ""}`, "Dosage Form": "" }));
  // Public source identity from the pinned held row, not private workbook data.
  rows[421].Product = "CJC-1295 + Ipamorelin";
  rows[421]["Normalized Specification"] = "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)";
  const normalized = rows.map((row) => normalizeMasterCatalog([row]).products[0]);
  const presentation = rows.map((row) => normalizeMasterCatalog([row], new Map(approved.commerceHolds.map((hold: { sourceRow: string; specification: string }) => [hold.sourceRow, hold.specification]))).products[0]);
  const product = (n: number, candidate = false) => { const p = candidate ? presentation[n - 1] : normalized[n - 1];return { ...p, variants: p.variants.map((v) => ({ ...v })) }; };
  const predecessorDataset = { schemaVersion: 1, sourceWorkbookSha256: "1be4f6720675fc6b90c172d52c19d2fb9a8d53f5beab6592ca96c701119c791d", sourceRowCount: 420,
    products: Array.from({ length: 420 }, (_, i) => product(i + 1)) };
  const candidate = { schemaVersion: 1, sourceWorkbookSha256: approved.sourceWorkbook.sha256, sourceRowCount: 424,
    workbookSourceRowCount: 426,
    reconciliation: { file: currentAuthority.file, sha256: currentAuthority.sha256, sourceRows: 426, canonicalRows: 424,
      commerceHeldRows: ["GRP-0422"], provenance: Object.fromEntries(applyCatalogReconciliation(rows, approved).provenance.sourceRowsByCanonical) },
    products: Array.from({ length: 426 }, (_, i) => i + 1).filter((n) => ![402, 407].includes(n)).map((n) => product(n, true)) };
  const reviewed = { schemaVersion: 1, generatedAt: "2026-08-15T08:10:01.390Z", sourceWorkbookSha256: predecessorDataset.sourceWorkbookSha256,
    productionReadBack: structuredClone(publicAuthority.productionReadBack), boundCount: 417, unboundCount: 3,
    bindings: historical.map((binding: { productControlSku: string; productId: string; variantId: string }) => {
      const n = Number(binding.productControlSku.slice(-4)), p = product(n);
      return { offeringId: p.id, offeringVariantId: p.variants[0].id, productControlSku: binding.productControlSku, productId: binding.productId, variantId: binding.variantId };
    }),
    unbound: [244, 364, 365].map((n) => { const p = product(n);return { offeringId: p.id, offeringVariantId: p.variants[0].id, reason: "Preserved synthetic exclusion" }; }),
  };
  const historicalReconciliation = structuredClone(approved);
  for (const hold of historicalReconciliation.commerceHolds) delete hold.catalogIdentity;
  return { intake: { schemaVersion: 1 as const, privateIntake: true as const,
      sources: { masterCatalog: { filename: "synthetic.xlsx", sha256: approved.sourceWorkbook.sha256 }, krisPricing: { filename: "", sha256: "" } }, masterRows: rows },
    candidate, predecessorDataset, reviewed, predecessorSourceSha: "1".repeat(40),
    predecessorBindingsBytes: bytes(reviewed), predecessorDatasetBytes: bytes(predecessorDataset), reconciliationBytes: bytes(historicalReconciliation),
    candidateReconciliationBytes: currentAuthorityBytes, generatedAt: "2026-10-01T00:00:00.000Z" };
}
describe("HL-11 stable retained binding generation", () => {
  it("retains 418 identities/415 exact pairs, holds six additions and archives both supersessions", () => {
    const f = fixture(), result = generateRetainedBindings(f);
    expect(result.boundCount).toBe(415);expect(result.unboundCount).toBe(9);
    expect(result.bindings.map((binding) => binding.offeringVariantId)).toEqual(
      f.reviewed.bindings.filter((binding) => !["GEN-GRP-0402", "GEN-GRP-0407"].includes(binding.productControlSku))
        .map((binding) => binding.offeringVariantId),
    );
    expect(result.retainedAuthority.retainedIdentities).toBe(418);expect(result.retainedAuthority.newIdentities).toBe(6);
    expect(result.retainedAuthority.historicalPairMd5).toBe("062a30f0d3d0a0571e78837b5b92d4f6");
    expect(result.retainedAuthority.retainedPairMd5).toBe("86fdd019d3153e75920090136579b184");
    expect(result.unbound.filter((row) => row.reasonCode === "binding_pending").map((row) => row.sourceGroupId).sort())
      .toEqual(["GRP-0421", "GRP-0422", "GRP-0423", "GRP-0424", "GRP-0425", "GRP-0426"]);
    expect(result.supersededBindings.map((row) => [row.sourceGroupId, row.supersededBySourceGroupId]))
      .toEqual([["GRP-0402", "GRP-0426"], ["GRP-0407", "GRP-0425"]]);
    for (const archived of result.supersededBindings) {
      expect(result.bindings.some((binding) => binding.variantId === archived.binding.variantId)).toBe(false);
      expect(result.unbound.some((row) => row.offeringVariantId === archived.successorOfferingVariantId)).toBe(true);
    }
    for (const binding of [...result.bindings, ...result.supersededBindings.map((row) => row.binding)]) {
      expect(Object.keys(binding).sort()).toEqual(["offeringId", "offeringVariantId", "productControlSku", "productId", "variantId"]);
    }
    expect(result.reconciliation.commerceHeldRows).toEqual(["GRP-0422"]);
  });
  it("uses stable keyed joins when private source rows and candidate rows reorder", () => {
    const f = fixture(), expected = generateRetainedBindings(f);
    f.intake.masterRows.reverse();f.candidate.products.reverse();
    expect(generateRetainedBindings(f)).toEqual(expected);
  });
  it("preserves dated production provenance and canonical predecessor checksums", () => {
    const f = fixture(), result = generateRetainedBindings(f);
    expect(result.productionReadBack).toEqual(f.reviewed.productionReadBack);
    expect(result.retainedAuthority.productionReadBackRefreshed).toBe(false);
    expect(result.retainedAuthority.predecessorBindingsCanonicalSha256).toBe(createHash("sha256").update(f.predecessorBindingsBytes).digest("hex"));
    expect(result.retainedAuthority.predecessorDatasetCanonicalSha256).toBe(createHash("sha256").update(f.predecessorDatasetBytes).digest("hex"));
    expect(result.retainedAuthority.predecessorReconciliationCanonicalSha256).toBe(createHash("sha256").update(f.reconciliationBytes).digest("hex"));
    expect(result.retainedAuthority.candidateReconciliationSha256).toBe(currentAuthority.sha256);
    expect(result.retainedAuthority.predecessorReconciliationCanonicalSha256).not.toBe(result.retainedAuthority.candidateReconciliationSha256);
    expect(result.bindings.every((binding) => f.reviewed.bindings.some((prior: unknown) => JSON.stringify(prior) === JSON.stringify(binding)))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("unitPriceCents");
  });
  it.each(["GEN-GRP-0001", "GEN-GRP-0402"])("refuses unexpected price fields in reviewed binding %s even with matching canonical bytes", (sku) => {
    const f = fixture();
    const binding = f.reviewed.bindings.find((entry) => entry.productControlSku === sku)!;
    Object.assign(binding, { unitPriceCents: 12345 });
    // Deliberately keep the supplied historical blob consistent. Refusal must
    // come from the identity-only contract, not the canonical-blob comparison.
    f.predecessorBindingsBytes = bytes(f.reviewed);
    expect(() => generateRetainedBindings(f)).toThrow(/exact identity-only binding keys/);
  });
  it("refuses incomplete reviewed binding keys even with matching canonical bytes", () => {
    const f = fixture();
    Reflect.deleteProperty(f.reviewed.bindings[0], "productId");
    f.predecessorBindingsBytes = bytes(f.reviewed);
    expect(() => generateRetainedBindings(f)).toThrow(/exact identity-only binding keys/);
  });
  it("refuses duplicated source/candidate rows and an orphan stable identity", () => {
    const duplicate = fixture();duplicate.intake.masterRows[1] = duplicate.intake.masterRows[0];
    expect(() => generateRetainedBindings(duplicate)).toThrow(/duplicate/);
    const candidate = fixture();candidate.candidate.products[1] = candidate.candidate.products[0];
    expect(() => generateRetainedBindings(candidate)).toThrow();
    const orphan = fixture();orphan.candidate.products[0].variants[0].id = "mov_unknown";
    expect(() => generateRetainedBindings(orphan)).toThrow(/orphan/);
  });
  it("refuses mismatched labels, workbook authority and unexplained binding mutations", () => {
    const label = fixture();label.candidate.products[0].variants[0].label = "Different item";
    expect(() => generateRetainedBindings(label)).toThrow(/fields mismatch/);
    const workbook = fixture();workbook.candidate.sourceWorkbookSha256 = "f".repeat(64);
    expect(() => generateRetainedBindings(workbook)).toThrow();
    const altered = fixture();altered.reviewed.bindings[0].variantId = altered.reviewed.bindings[1].variantId;
    expect(() => generateRetainedBindings(altered)).toThrow(/canonical blob/);
    // Even a structurally self-consistent supplied artifact cannot add an
    // unexplained duplicate UUID or orphan identity to retained authority.
    altered.predecessorBindingsBytes = bytes(altered.reviewed);
    expect(() => generateRetainedBindings(altered)).toThrow(/duplicate\/orphan/);
    const orphan = fixture();orphan.reviewed.bindings[0].offeringVariantId = "mov_unknown";orphan.predecessorBindingsBytes = bytes(orphan.reviewed);
    expect(() => generateRetainedBindings(orphan)).toThrow(/duplicate\/orphan/);
  });
  it("preserves raw identity while allowing only reviewed public em-dash punctuation", () => {
    const f = fixture(), presentation = f.candidate.products[79], identity = presentation.variants[0].id;
    presentation.variants[0].label = presentation.variants[0].label.replace(/\s*\u2014\s*/g, ": ");
    presentation.aliases = presentation.aliases.map((alias) => alias.replace(/\s*\u2014\s*/g, ": "));
    expect(generateRetainedBindings(f).bindings.some((binding) => binding.offeringVariantId === identity)).toBe(true);
    f.candidate.products[0].variants[0].label += "\u2014changed";
    expect(() => generateRetainedBindings(f)).toThrow(/fields mismatch/);
  });
  it("requires current candidate metadata and the exact reviewed cleaned held specification", () => {
    const metadata = fixture();metadata.candidate.reconciliation.sha256 = "f".repeat(64);
    expect(() => generateRetainedBindings(metadata)).toThrow();
    const f = fixture(), held = f.candidate.products.find((p) => p.id === approved.commerceHolds[0].catalogIdentity.offeringId)!;
    expect(held.variants[0].label).toBe(approved.commerceHolds[0].specification);
    expect(generateRetainedBindings(f).unbound.some((row) => row.offeringVariantId === approved.commerceHolds[0].catalogIdentity.offeringVariantId)).toBe(true);
    held.variants[0].label += " (split pending)";
    expect(() => generateRetainedBindings(f)).toThrow(/fields mismatch/);
  });
});

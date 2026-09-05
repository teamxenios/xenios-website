import { describe, expect, it } from "vitest";
import {
  readReconciliationReviewResponse, RECONCILIATION_FACT_KINDS,
  RECONCILIATION_SOURCE_SET_ID, RECONCILIATION_PACKAGE_SHA256,
  RECONCILIATION_MANIFEST_SHA256, RECONCILIATION_SOURCE_FILE_SHA256,
  RECONCILIATION_MAPPING_EXCEPTIONS, RECONCILIATION_FORMULATION_EXCEPTIONS,
} from "./revenue-launch";

function fixture() {
  const rows = Array.from({ length: 39 }, (_, index) => {
    const sourceId = `XRUO-${String(index + 1).padStart(3, "0")}`;
    return {
      sourceId, launchItemId: `LIVE-EXISTING-${sourceId.slice(-3)}`,
      sourcePointer: `/phaseAExistingDirectBuy/${index}`, sourceRowSha256: (index + 1).toString(16).padStart(64, "0"),
      productLabel: `Fixture ${index + 1}`, configurationLabel: "10 mg; confirmation required",
      issueKinds: [
        ...((RECONCILIATION_MAPPING_EXCEPTIONS as readonly string[]).includes(sourceId) ? ["identity_binding"] : []),
        ...((RECONCILIATION_FORMULATION_EXCEPTIONS as readonly string[]).includes(sourceId) ? ["formulation"] : []),
      ],
      exactIdentity: null, proposedIdentity: null,
      facts: Object.fromEntries(RECONCILIATION_FACT_KINDS.map((kind) => [kind, {
        state: "UNKNOWN", reason: "not_checked", observedAt: null, evidence: null,
      }])),
    };
  });
  return { status: "AVAILABLE", schemaVersion: 1, projectedAt: "2026-09-05T18:00:00Z",
    source: { sourceSetId: RECONCILIATION_SOURCE_SET_ID, packageSha256: RECONCILIATION_PACKAGE_SHA256,
      manifestSha256: RECONCILIATION_MANIFEST_SHA256, sourceFileSha256: RECONCILIATION_SOURCE_FILE_SHA256, scope: "phase_a" },
    coverage: { complete: true, expectedRows: 39, returnedRows: 39 }, rows };
}
describe("protected reconciliation wire reader", () => {
  it("accepts complete39row and exact10row exception scopes without promoting any fact", () => {
    const all = fixture(); expect(readReconciliationReviewResponse(all)).toEqual(all);
    const exceptions = fixture(); exceptions.rows = exceptions.rows.filter((row) => row.issueKinds.length);
    exceptions.source.scope = "phase_a_exceptions";
    exceptions.coverage.expectedRows = exceptions.coverage.returnedRows = 10;
    expect(exceptions.rows.reduce((count, row) => count + row.issueKinds.length, 0)).toBe(11);
    expect(readReconciliationReviewResponse(exceptions)).toEqual(exceptions);
  });
  it("refuses empty, truncated, duplicate and wrong-source success responses", () => {
    for (const change of [
      (v: ReturnType<typeof fixture>) => { v.rows = []; v.coverage.expectedRows = v.coverage.returnedRows = 0; },
      (v: ReturnType<typeof fixture>) => { v.rows.pop(); v.coverage.expectedRows = v.coverage.returnedRows = 38; },
      (v: ReturnType<typeof fixture>) => { v.rows[1] = v.rows[0]; },
      (v: ReturnType<typeof fixture>) => { v.source.sourceSetId = "wrong" as never; },
      (v: ReturnType<typeof fixture>) => { v.source.sourceFileSha256 = "b".repeat(64) as never; },
      (v: ReturnType<typeof fixture>) => { v.rows[13].issueKinds.pop(); },
      (v: ReturnType<typeof fixture>) => { v.rows[0].sourcePointer = "/phaseAExistingDirectBuy/1"; },
    ]) { const value = fixture(); change(value); expect(readReconciliationReviewResponse(value)).toBeNull(); }
  });
  it("refuses hidden private fields, unknown states, malformed timestamps and invented pending evidence", () => {
    for (const patch of [
      { state: "READY" }, { state: "PENDING", reason: "review_requested" },
      { state: "CONFIRMED", reason: "verified_fact" }, { observedAt: "2026-02-30T12:00:00Z" },
      { observedAt: "2026-09-05T18:00:01Z" }, { supplierContact: "private fixture" },
    ]) {
      const value = fixture(); Object.assign(value.rows[0].facts.supplier, patch);
      expect(readReconciliationReviewResponse(value)).toBeNull();
    }
    const value = fixture(); Object.assign(value.rows[0], { wholesaleCost: 1 });
    expect(readReconciliationReviewResponse(value)).toBeNull();
  });
  it("requires scoped confirmation, a reverified identity and safe links", () => {
    const value = fixture();
    const exact = { productId: "product-1", variantId: "variant-1", sku: "FIXTURE-1" };
    const evidence = { authority: "source_reconciliation", recordId: "XRUO-001", recordRevision: "a".repeat(64),
      observedAt: "2026-09-05T17:00:00Z", reviewedAt: null, reviewerLabel: null, expiresAt: null,
      href: "/admin/research/products/product-1" };
    Object.assign(value.rows[0], { exactIdentity: exact });
    Object.assign(value.rows[0].facts.identity_binding, { state: "CONFIRMED", reason: "exact_identity_reverified", observedAt: evidence.observedAt, evidence });
    expect(readReconciliationReviewResponse(value)).not.toBeNull();
    for (const href of ["https://external.invalid", "//external.invalid", "/admin/research/products/product-1?token=fixture", "/admin/research/products/product-2"]) {
      evidence.href = href; expect(readReconciliationReviewResponse(value)).toBeNull();
    }
    evidence.href = "/admin/research/products/product-1";
    Object.assign(evidence, { expiresAt: value.projectedAt });
    expect(readReconciliationReviewResponse(value)).toBeNull();
    Object.assign(value.rows[0], { exactIdentity: null });
    expect(readReconciliationReviewResponse(value)).toBeNull();
  });
  it("keeps unavailable distinct from successful empty data", () => {
    const value = { status: "UNAVAILABLE", schemaVersion: 1, reason: "source_invalid" };
    expect(readReconciliationReviewResponse(value)).toEqual(value);
    expect(readReconciliationReviewResponse({ ...value, rows: [] })).toBeNull();
    expect(readReconciliationReviewResponse({ ...value, error: "raw upstream fixture" })).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { RECONCILIATION_REVIEW_PATH } from "@shared/research/revenue-launch";
import { getReconciliationReview, reconciliationReviewResponseValid } from "./reconciliation-review";

afterEach(() => vi.unstubAllGlobals());

const sha = "a".repeat(64);
const evidence = {
  authority: "source_reconciliation",
  recordId: "evidence-1",
  recordRevision: "revision-1",
  observedAt: "2026-09-05T12:00:00.000Z",
  reviewedAt: null,
  reviewerLabel: null,
  expiresAt: null,
  href: null,
};

function available() {
  const fact = { state: "UNKNOWN", reason: "no_current_evidence", observedAt: "2026-09-05T12:00:00.000Z", evidence };
  return {
    status: "AVAILABLE",
    schemaVersion: 1,
    projectedAt: "2026-09-05T12:01:00.000Z",
    source: { sourceSetId: "seth-phase-a", packageSha256: sha, manifestSha256: sha, sourceFileSha256: sha, scope: "phase_a_exceptions" },
    coverage: { complete: true, expectedRows: 1, returnedRows: 1 },
    rows: [{
      sourceId: "source-1", launchItemId: "launch-1", sourcePointer: "/rows/0", sourceRowSha256: sha,
      productLabel: "Seth specimen", configurationLabel: "Source configuration is an assumption.", issueKinds: ["formulation"],
      exactIdentity: null, proposedIdentity: null,
      facts: { identity_binding: fact, formulation: fact, unit_of_sale: fact, supplier: fact },
    }],
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("reconciliation review adapter", () => {
  it("reads the protected endpoint with the admin bearer token and validates the projection", async () => {
    const fetchMock = vi.fn(async () => json(available()));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getReconciliationReview("admin-token");

    expect(result.kind).toBe("ok");
    expect(fetchMock).toHaveBeenCalledWith(RECONCILIATION_REVIEW_PATH, expect.objectContaining({
      method: "GET", cache: "no-store", credentials: "same-origin",
      headers: expect.objectContaining({ Authorization: "Bearer admin-token" }),
    }));
  });

  it("fails closed when coverage, identity, or evidence is malformed", async () => {
    const malformed = available();
    malformed.coverage.returnedRows = 0;
    expect(reconciliationReviewResponseValid(malformed)).toBe(false);
    malformed.coverage.returnedRows = 1;
    malformed.rows[0].sourceRowSha256 = "not-a-sha";
    expect(reconciliationReviewResponseValid(malformed)).toBe(false);
  });

  it("fails closed when a fact state is paired with the wrong fact authority", () => {
    const malformed = available();
    malformed.rows[0].facts.unit_of_sale = {
      state: "CONFIRMED",
      reason: "exact_identity_reverified",
      observedAt: "2026-09-05T12:00:00.000Z",
      evidence,
    };
    expect(reconciliationReviewResponseValid(malformed)).toBe(false);

    const supplierAuthority = available();
    supplierAuthority.rows[0].facts.supplier = {
      state: "CONFIRMED",
      reason: "verified_fact",
      observedAt: "2026-09-05T12:00:00.000Z",
      evidence: { ...evidence, authority: "required_input" },
    };
    expect(reconciliationReviewResponseValid(supplierAuthority)).toBe(false);
  });

  it("fails closed when identity evidence says confirmed without an exact identity", () => {
    const malformed = available();
    malformed.rows[0].facts.identity_binding = {
      state: "CONFIRMED",
      reason: "exact_identity_reverified",
      observedAt: "2026-09-05T12:00:00.000Z",
      evidence,
    };
    expect(reconciliationReviewResponseValid(malformed)).toBe(false);
  });

  it("accepts only the exact product evidence link for a confirmed identity", () => {
    const valid = available();
    valid.rows[0].exactIdentity = { productId: "prod-1", variantId: "variant-1", sku: "SKU-1" };
    valid.rows[0].facts.identity_binding = {
      state: "CONFIRMED",
      reason: "exact_identity_reverified",
      observedAt: "2026-09-05T12:00:00.000Z",
      evidence: { ...evidence, href: "/admin/research/products/prod-1" },
    };
    expect(reconciliationReviewResponseValid(valid)).toBe(true);

    valid.rows[0].facts.identity_binding.evidence = { ...evidence, href: "/admin/research/products/other" };
    expect(reconciliationReviewResponseValid(valid)).toBe(false);
  });

  it("rejects evidence observed after the projection or already expired at projection time", () => {
    const future = available();
    future.rows[0].facts.unit_of_sale.evidence = { ...evidence, observedAt: "2026-09-05T12:02:00.000Z" };
    expect(reconciliationReviewResponseValid(future)).toBe(false);

    const expired = available();
    expired.rows[0].exactIdentity = { productId: "prod-1", variantId: "variant-1", sku: "SKU-1" };
    expired.rows[0].facts.identity_binding = {
      state: "CONFIRMED",
      reason: "exact_identity_reverified",
      observedAt: "2026-09-05T12:00:00.000Z",
      evidence: { ...evidence, href: "/admin/research/products/prod-1", expiresAt: "2026-09-05T12:00:30.000Z" },
    };
    expect(reconciliationReviewResponseValid(expired)).toBe(false);
  });

  it.each([401, 403, 404, 503, 500])("preserves the honest API boundary for HTTP %d", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: false, code: "unavailable" }, status)));
    const result = await getReconciliationReview("admin-token");
    expect(["unauthorized", "denied", "unavailable", "error"]).toContain(result.kind);
  });
});

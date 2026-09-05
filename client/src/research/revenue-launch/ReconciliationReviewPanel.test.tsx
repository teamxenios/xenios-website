// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReconciliationReviewContent, type AvailableReconciliationReview } from "./ReconciliationReviewPanel";

const sha = "b".repeat(64);
const review: AvailableReconciliationReview = {
  status: "AVAILABLE", schemaVersion: 1, projectedAt: "2026-09-05T12:01:00.000Z",
  source: { sourceSetId: "seth-phase-a", packageSha256: sha, manifestSha256: sha, sourceFileSha256: sha, scope: "phase_a_exceptions" },
  coverage: { complete: true, expectedRows: 1, returnedRows: 1 },
  rows: [{
    sourceId: "source-1", launchItemId: "launch-1", sourcePointer: "/rows/0", sourceRowSha256: sha,
    productLabel: "Seth specimen", configurationLabel: "Source assumption — formulation requires confirmation.", issueKinds: ["formulation"],
    exactIdentity: null, proposedIdentity: null,
    facts: {
      identity_binding: { state: "UNKNOWN", reason: "missing_binding", observedAt: null, evidence: null },
      formulation: { state: "PENDING", reason: "review_requested", observedAt: "2026-09-05T12:00:00.000Z", evidence: {
        authority: "required_input", recordId: "review-1", recordRevision: "rev-1", observedAt: "2026-09-05T12:00:00.000Z", reviewedAt: null, reviewerLabel: null, expiresAt: null, href: null,
      } },
      unit_of_sale: { state: "CONFIRMED", reason: "exact_identity_reverified", observedAt: "2026-09-05T12:00:00.000Z", evidence: {
        authority: "source_reconciliation", recordId: "unit-1", recordRevision: "rev-1", observedAt: "2026-09-05T12:00:00.000Z", reviewedAt: "2026-09-05T12:00:00.000Z", reviewerLabel: "reviewer", expiresAt: null, href: null,
      } },
      supplier: { state: "UNKNOWN", reason: "no_current_evidence", observedAt: "2026-09-05T12:00:00.000Z", evidence: null },
    },
  }],
};

describe("reconciliation review presentation", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("renders server states and preserves the non-authority boundary", async () => {
    await act(async () => root.render(<StrictMode><ReconciliationReviewContent review={review} /></StrictMode>));
    expect(host.textContent).toContain("Source reconciliation review");
    expect(host.textContent).toContain("Pending");
    expect(host.textContent).toContain("Confirmed");
    expect(host.textContent).toContain("Unknown");
    expect(host.textContent).toContain("do not approve a price");
    expect(host.textContent).not.toContain("Buy now");
    expect(host.querySelector("button, input, select, form")).toBeNull();
  });
});

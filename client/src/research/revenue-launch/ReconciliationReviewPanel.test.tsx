// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReconciliationReviewContent, type AvailableReconciliationReview } from "./ReconciliationReviewPanel";

const SOURCE_PATH = "config/research/revenue-launch/seth-source-reconciliation-20260905.json";
const SOURCE_SHA256 = "7e338d041a1889b6c3dbf25e474d5b0440cc8f72e70dc8e5119a175137094d93";

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
    expect(host.textContent).toContain("Source assumption, formulation requires confirmation.");
    expect(host.textContent).not.toContain("—");
    expect(host.querySelector("button, input, select, form")).toBeNull();
  });

  it("renders every runtime-fed Phase B configuration without changing the immutable source", async () => {
    const bytes = readFileSync(SOURCE_PATH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(SOURCE_SHA256);
    const source = JSON.parse(bytes.toString("utf8")) as {
      phaseB: Array<{
        sourceId: string;
        launchItemId: string;
        sourcePointer: string;
        sourceRowSha256: string;
        sourceProduct: string;
        sourceConfiguration: string;
      }>;
    };
    expect(source.phaseB.filter((row) => row.sourceConfiguration.includes("—"))).toHaveLength(23);
    const phaseBReview: AvailableReconciliationReview = {
      ...review,
      coverage: { complete: true, expectedRows: source.phaseB.length, returnedRows: source.phaseB.length },
      rows: source.phaseB.map((row) => ({
        sourceId: row.sourceId,
        launchItemId: row.launchItemId,
        sourcePointer: row.sourcePointer,
        sourceRowSha256: row.sourceRowSha256,
        productLabel: row.sourceProduct,
        configurationLabel: row.sourceConfiguration,
        issueKinds: [],
        exactIdentity: null,
        proposedIdentity: null,
        facts: review.rows[0]!.facts,
      })),
    };
    await act(async () => root.render(<StrictMode><ReconciliationReviewContent review={phaseBReview} /></StrictMode>));
    expect(host.textContent).toContain("Capsule, 100 mg");
    expect(host.textContent).toContain("Troche, 300 mcg");
    expect(host.textContent).toContain("Topical, 30mL");
    expect(host.textContent).not.toContain("—");
  });
});

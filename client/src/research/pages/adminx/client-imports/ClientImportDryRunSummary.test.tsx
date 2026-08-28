// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { ImportDryRunReportDto } from "@shared/research/client-import/contract";
import { ClientImportDryRunSummaryView } from "./ClientImportDryRunSummary";

const report: ImportDryRunReportDto = {
  batchId: "batch-synthetic-test",  sourceType: "partner_client_import" as const,
  dryRun: true,
  totalRows: 24,
  rejectedRows: 2,
  rejectionCounts: { blank_name: 1, name_too_long: 1, product_too_long: 0, malformed_row: 0 },
  processedRows: 22,
  uniquePeople: 18,
  duplicateNameRows: 3,
  multiInterestPeople: 6,
  missingContact: 18,
  mappedInterestMentions: 21,
  distinctInterestKeys: 5,
  unmappedInterests: [{ ref: "ab12cd34ef56", occurrences: 1 }],
  ambiguousBlendStrings: [{ ref: "0011aabbccdd", occurrences: 2 }],
  consentStatusCounts: { pending: 18, granted: 0, declined: 0 },
  accountStatusCounts: { not_invited: 18, invitation_approved: 0, invited: 0, active: 0 },
  invitationEligible: 0,
  exceptions: [{ kind: "ambiguous_blend", ref: "0011aabbccdd", occurrences: 2 }],
  interestBreakdown: [{ interestKey: "example-a", mentions: 8 }],
};

describe("client import dry-run summary", () => {
  it("shows aggregate review state without identity rows or send actions", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <ClientImportDryRunSummaryView
        report={report}
        attribution={{ sourcePartner: "Synthetic advisory source", relationshipOwner: "Assigned lead" }}
        disposition={{ approved: 0, blocked: 18, skipped: 0 }}
      />,
    ));
    expect(container.textContent).toContain("Dry run · no sends");
    expect(container.textContent).toContain("Source rows24");
    expect(container.textContent).toContain("Rejected rows2");
    expect(container.textContent).toContain("Missing contact18");
    // Only the non-reversible reference is painted — never raw product text.
    expect(container.textContent).toContain("0011aabbccdd");
    expect(container.textContent).toContain("Invitation eligible0");
    expect(container.textContent).toContain("Approved0");
    expect(container.textContent).toContain("Blocked18");
    expect(container.textContent).not.toContain("@");
    expect(container.querySelector("input, textarea, button")).toBeNull();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    await act(async () => root.unmount());
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });
});


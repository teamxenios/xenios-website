import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperationsCommandCenter } from "./OperationsCommandCenter";

describe("OperationsCommandCenter", () => {
  it("renders truthful empty operations without fake metrics", () => {
    const html = renderToStaticMarkup(<OperationsCommandCenter summary={null} />);
    expect(html).toContain("ready for verified records");
    expect(html).not.toContain("$");
    expect(html).not.toContain("sample");
  });

  it("renders operational counts without customer PII", () => {
    const html = renderToStaticMarkup(
      <OperationsCommandCenter
        summary={{
          supplierCounts: { active: 2 },
          fulfillmentCounts: { packed: 1 },
          affiliateCounts: { active: 3 },
          professionalCounts: { discovery: 4 },
          exceptionCount: 1,
          payableCommissionCents: 2500,
          currency: "USD",
          generatedAt: "2026-07-28T12:00:00.000Z",
        }}
      />,
    );
    expect(html).toContain("USD 25.00");
    expect(html).toContain("packed");
    expect(html).not.toContain("email");
    expect(html).not.toContain("member");
    expect(html).not.toContain("customer@example");
  });

  it("names missing payable evidence instead of inventing money", () => {
    const html = renderToStaticMarkup(
      <OperationsCommandCenter
        summary={{
          supplierCounts: {},
          fulfillmentCounts: {},
          affiliateCounts: {},
          professionalCounts: {},
          exceptionCount: 0,
          payableCommissionCents: 0,
          currency: null,
          generatedAt: "2026-07-28T12:00:00.000Z",
        }}
      />,
    );
    expect(html).toContain("VERIFIED PAYABLE DATA REQUIRED");
  });
});

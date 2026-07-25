import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { DemandQueue, ProductRequestCallout } from "./ProductRequestExperience";

beforeAll(() => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: new URL("https://xeniostechnology.com/research/member/products"),
  });
});

describe("product request experience", () => {
  it("links to the existing form with source attribution and complete safety copy", () => {
    const html = renderToStaticMarkup(
      <ProductRequestCallout source="diagnostics" productName="Example" />,
    );
    expect(html).toContain("source=diagnostics");
    expect(html).toContain("product=Example");
    expect(html).toContain("never fetches it");
    expect(html).toContain("does not create a product, inventory, order, payment");
  });

  it("shows an admin aggregate without requester information", () => {
    const html = renderToStaticMarkup(
      <DemandQueue
        rows={[
          {
            candidateId: "candidate_1",
            normalizedCandidate: "example product",
            brand: "Example Brand",
            category: "supplement",
            uniqueMembers: 2,
            totalRequests: 3,
            firstRequestAt: "2026-07-20T12:00:00.000Z",
            latestRequestAt: "2026-07-25T12:00:00.000Z",
            urgency: "high",
            status: "under_review",
          },
        ]}
      />,
    );
    expect(html).toContain("2 members / 3 requests");
    expect(html).not.toContain("memberId");
    expect(html).not.toContain("requester");
  });
});


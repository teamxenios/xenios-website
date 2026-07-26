import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRODUCT_REQUEST_ENTRY_POINTS,
  aggregateProductDemand,
  productRequestHref,
  toExistingProductRequest,
  toMemberDemandSummary,
  type ProductDemandSignal,
  type Website3ProductRequestForm,
} from "./product-request-integration";

const baseForm: Website3ProductRequestForm = {
  productName: "Example Product",
  category: "supplement",
  description: "A sufficiently detailed product description.",
  httpsLink: "https://example.com/products/example#section",
  desiredFormat: "Capsule",
  desiredSize: "60 count",
  quantity: "2",
  frequency: "monthly",
  timing: "within_30_days",
  notes: "Please review.",
  contactConsent: true,
  attributionSource: "supplements",
  idempotencyKey: "request-key-123456",
};

afterEach(() => vi.restoreAllMocks());

describe("product-request integration", () => {
  it("publishes every required entry point with attribution", () => {
    expect(PRODUCT_REQUEST_ENTRY_POINTS).toEqual([
      "empty_search",
      "products",
      "blends",
      "supplements",
      "programs",
      "quantum",
      "diagnostics",
      "glp_cards",
      "support",
    ]);
    expect(productRequestHref("empty_search", "Alpha")).toContain(
      "source=empty_search",
    );
    expect(productRequestHref("empty_search", "Alpha")).toContain("product=Alpha");
  });

  it("maps the exact Website 3 form into the existing authoritative request system", () => {
    const result = toExistingProductRequest(baseForm);
    expect(result).toMatchObject({
      ok: true,
      request: {
        productName: "Example Product",
        category: "supplement",
        productUrl: "https://example.com/products/example",
        desiredPresentation: "Format: Capsule\nSize: 60 count",
        desiredQuantity: "2",
        expectedPurchaseFrequency: "monthly",
        interestTiming: "within_30_days",
        contactConsent: true,
      },
      attributionSource: "supplements",
    });
  });

  it("rejects unsafe URLs and never fetches a submitted URL", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(
      toExistingProductRequest({
        ...baseForm,
        httpsLink: "http://127.0.0.1/private",
      }),
    ).toMatchObject({ ok: false, field: "httpsLink" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("private demand aggregation", () => {
  const rows: ProductDemandSignal[] = [
    {
      requestId: "request_1",
      memberId: "member_private_1",
      productName: "Example Product",
      brand: "Example Brand",
      category: "supplement",
      requestedAt: "2026-07-20T12:00:00.000Z",
      timing: "within_30_days",
      frequency: "monthly",
      attributionSource: "supplements",
      affiliateSource: "affiliate-a",
      professionalSource: null,
      cohort: "founders",
    },
    {
      requestId: "request_2",
      memberId: "member_private_2",
      productName: "example   product",
      brand: "Example Brand",
      category: "supplement",
      requestedAt: "2026-07-25T12:00:00.000Z",
      timing: "asap",
      frequency: "occasionally",
      attributionSource: "support",
      affiliateSource: null,
      professionalSource: "clinic-a",
      cohort: "founders",
    },
  ];

  it("tracks the complete candidate demand queue", () => {
    const [candidate] = aggregateProductDemand(rows);
    expect(candidate).toMatchObject({
      normalizedCandidate: "example product",
      brand: "Example Brand",
      category: "supplement",
      uniqueMembers: 2,
      totalRequests: 2,
      firstRequestAt: "2026-07-20T12:00:00.000Z",
      latestRequestAt: "2026-07-25T12:00:00.000Z",
      urgency: "high",
      frequency: { monthly: 1, occasionally: 1 },
      affiliateSources: ["affiliate-a"],
      professionalSources: ["clinic-a"],
      cohorts: ["founders"],
      status: "new",
    });
    expect(candidate.requestIds).toEqual(["request_1", "request_2"]);
  });

  it("never exposes requester information to member summaries", () => {
    const summary = toMemberDemandSummary(aggregateProductDemand(rows)[0]);
    const json = JSON.stringify(summary);
    expect(json).not.toContain("member_private");
    expect(json).not.toContain("request_1");
    expect(json).not.toContain("affiliate-a");
    expect(Object.keys(summary).sort()).toEqual(
      ["normalizedCandidate", "category", "uniqueMembers", "totalRequests", "status"].sort(),
    );
  });
});


import { describe, expect, it, vi } from "vitest";

import { catalogPriceFields } from "../../../shared/research/early-access/quote-only";
import { createAssistedOrderRouteTable, type AssistedOrderHttpRequest } from "./http";
import type { AssistedOrderService } from "./service";

/**
 * Quote-only at the assisted-order customer boundary. The service still
 * prices on the server (eligibility, staff records, issued quotes); with
 * `quoteOnly` wired, the customer catalog, the new-request receipt and the
 * status view carry no catalog price or estimate. Admin routes are untouched.
 */

const ITEM = {
  productId: "prod-synthetic", variantId: "var-synthetic", productName: "Synthetic Peptide",
  specification: "10 mg", minimumQuantity: 1, maximumQuantity: 5, quantityIncrement: 1,
  unitPriceCents: 4_900, currency: "USD", workflowMode: "direct_order_request",
  actionLabel: "Add to order request", catalogVersion: "catalog-v1", priceVersion: "price-v1",
};
const LINE = {
  lineId: "line-1", productId: "prod-synthetic", variantId: "var-synthetic", productName: "Synthetic Peptide",
  quantity: 2, unitPriceCents: 4_900, lineEstimateCents: 9_800, currency: "USD", priceVersion: "price-v1",
};
const RECEIPT = {
  requestId: "req-1", publicReference: "XAO-SYNTHETIC", statusToken: "tok", status: "submitted",
  createdAt: "2026-11-09T00:00:00.000Z", estimatedTotalCents: 9_800, currency: "USD", lines: [LINE], nextSteps: [],
};
const STATUS = { ...RECEIPT, updatedAt: RECEIPT.createdAt, timeline: [], documents: [], actionRequired: null };

function table(options?: { quoteOnly?: boolean }) {
  const service = {
    catalog: vi.fn(async () => ({ items: [ITEM], page: 1, pageSize: 24, total: 1 })),
    submit: vi.fn(async () => RECEIPT),
    status: vi.fn(async () => STATUS),
  } as unknown as AssistedOrderService;
  const resolver = { resolve: async () => ({ actorType: "early_access_session" }) } as any;
  const routes = options === undefined
    ? createAssistedOrderRouteTable(service, resolver, null)
    : createAssistedOrderRouteTable(service, resolver, null, options);
  return (method: string, path: string, params: Record<string, string> = {}) => {
    const route = routes.find((candidate) => candidate.method === method && candidate.path === path);
    if (!route) throw new Error(`no route ${method} ${path}`);
    const request: AssistedOrderHttpRequest = { method, path, headers: {}, query: {}, params, body: {} };
    return route.handler(request);
  };
}

const CATALOG = "/api/research/early-access/assisted-orders/catalog";
const SUBMIT = "/api/research/early-access/assisted-orders";
const STATUS_PATH = "/api/research/early-access/assisted-orders/:publicReference";

describe("assisted-order customer routes, quote-only", () => {
  it("serve the catalog, the receipt and the status with no catalog price", async () => {
    const call = table({ quoteOnly: true });
    const catalog = await call("GET", CATALOG);
    const receipt = await call("POST", SUBMIT);
    const status = await call("GET", STATUS_PATH, { publicReference: "XAO-SYNTHETIC" });
    for (const response of [catalog, receipt, status]) {
      expect(response.status).toBeLessThan(300);
      expect(catalogPriceFields(response.body)).toEqual([]);
    }
    expect((catalog.body as any).items[0]).toMatchObject({
      variantId: "var-synthetic", specification: "10 mg", maximumQuantity: 5,
      workflowMode: "direct_order_request", actionLabel: "Request a quote", unitPriceCents: null,
    });
    expect((receipt.body as any)).toMatchObject({ publicReference: "XAO-SYNTHETIC", estimatedTotalCents: null });
    expect((receipt.body as any).lines[0]).toMatchObject({ quantity: 2, unitPriceCents: null, lineEstimateCents: null });
  });

  it("are unchanged without the option", async () => {
    for (const call of [table(), table({ quoteOnly: false })]) {
      const catalog = await call("GET", CATALOG);
      expect((catalog.body as any).items[0].unitPriceCents).toBe(4_900);
      const receipt = await call("POST", SUBMIT);
      expect((receipt.body as any).estimatedTotalCents).toBe(9_800);
    }
  });
});

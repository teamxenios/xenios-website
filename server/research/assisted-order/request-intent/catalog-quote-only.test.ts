import { describe, expect, it, vi } from "vitest";

import { catalogPriceFields } from "../../../../shared/research/early-access/quote-only";
import type { AssistedOrderViewer } from "../ports";
import { RequestIntentService, type RequestIntentDependencies } from "./service";

/**
 * Quote-only on the request-intent catalog. With `quoteOnly` wired, the list
 * carries no catalog price; selection facts are unchanged. Without it, the
 * catalog is exactly as before.
 */

const PAGE = Object.freeze({
  items: [{
    productId: "prod-synthetic", variantId: "var-synthetic", productName: "Synthetic Peptide",
    specification: "10 mg", minimumQuantity: 1, maximumQuantity: 5, quantityIncrement: 1,
    unitPriceCents: 4_900, currency: "USD", workflowMode: "direct_order_request",
    actionLabel: "Add to order request", catalogVersion: "catalog-v1", priceVersion: "price-v1",
    selectableForReview: true, clinicalReviewRequired: false,
  }],
  page: 1, pageSize: 24, total: 1,
});

const viewer = {
  actorType: "early_access_session", memberId: null, earlyAccessSessionHash: "sess-synthetic",
  earlyAccessCustomerRef: "cust-synthetic", normalizedEmail: null,
  capabilities: new Set(["assisted_orders:submit"]) as any,
} as AssistedOrderViewer;

function service(overrides: Record<string, unknown> = {}) {
  const deps = {
    catalog: { list: vi.fn(async () => PAGE), resolveMany: vi.fn() },
    hasher: { hash: (v: string) => `h:${v}`, stableHash: (v: unknown) => `s:${JSON.stringify(v)}` },
    ...overrides,
  } as unknown as RequestIntentDependencies;
  return new RequestIntentService(deps);
}

describe("the request-intent catalog, quote-only", () => {
  it("lists with no catalog price when quoteOnly is wired", async () => {
    const page: any = await service({ quoteOnly: true }).list(viewer, {} as any);
    expect(catalogPriceFields(page)).toEqual([]);
    expect(page.items[0]).toMatchObject({
      variantId: "var-synthetic", specification: "10 mg", selectableForReview: true,
      unitPriceCents: null, priceVersion: null, actionLabel: "Request a quote",
    });
    expect(page.total).toBe(1);
  });

  it("is unchanged without it", async () => {
    const page: any = await service().list(viewer, {} as any);
    expect(page.items[0].unitPriceCents).toBe(4_900);
  });
});

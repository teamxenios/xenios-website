// Quote-only Early Access: the customer projection carries no catalog price,
// while every fact a customer needs to choose (strength, quantity bounds,
// identity, workflow) is unchanged. Synthetic values only.

import { describe, expect, it } from "vitest";
import {
  EARLY_ACCESS_QUOTE_LABEL,
  catalogPriceFields,
  quoteOnlyCatalogItem,
  quoteOnlyCatalogPage,
  quoteOnlyRequestView,
  quoteOnlyStorefrontUnit,
} from "./quote-only";

const ITEM = Object.freeze({
  productId: "prod-synthetic",
  variantId: "var-synthetic",
  productName: "Synthetic Peptide",
  specification: "10 mg",
  minimumQuantity: 1,
  maximumQuantity: 5,
  quantityIncrement: 1,
  unitPriceCents: 4_900,
  currency: "USD",
  workflowMode: "direct_order_request",
  actionLabel: "Add to order request",
  catalogVersion: "catalog-v1",
  priceVersion: "price-v1",
});

describe("catalogPriceFields", () => {
  it("finds numeric catalog prices at any depth and ignores everything else", () => {
    expect(catalogPriceFields({ a: { unitPriceCents: 1 }, list: [{ priceCents: 2 }], estimatedTotalCents: 3 }))
      .toEqual(["a.unitPriceCents", "list.0.priceCents", "estimatedTotalCents"]);
    expect(catalogPriceFields({ unitPriceCents: null, priceCents: null, strength: "10 mg", quantity: 3 })).toEqual([]);
    expect(catalogPriceFields({ price: { amountCents: 100 } })).toEqual(["price.amountCents"]);
  });
});

describe("quoteOnlyCatalogItem", () => {
  it("removes the price and its version and keeps every other fact", () => {
    const quoted = quoteOnlyCatalogItem(ITEM);
    expect(quoted.unitPriceCents).toBeNull();
    expect(quoted.priceVersion).toBeNull();
    expect(catalogPriceFields(quoted)).toEqual([]);
    const { unitPriceCents: _a, priceVersion: _b, actionLabel: _c, ...rest } = quoted;
    const { unitPriceCents: _d, priceVersion: _e, actionLabel: _f, ...before } = ITEM;
    expect(rest).toEqual(before);
  });

  it("labels selectable items Request a quote, and leaves clinical and held labels alone", () => {
    expect(quoteOnlyCatalogItem(ITEM).actionLabel).toBe(EARLY_ACCESS_QUOTE_LABEL);
    expect(quoteOnlyCatalogItem({ ...ITEM, workflowMode: "request_pricing", actionLabel: "Request pricing" }).actionLabel)
      .toBe(EARLY_ACCESS_QUOTE_LABEL);
    expect(quoteOnlyCatalogItem({ ...ITEM, workflowMode: "provider_request", actionLabel: "Request provider review" }).actionLabel)
      .toBe("Request provider review");
    expect(quoteOnlyCatalogItem({ ...ITEM, workflowMode: "availability_review", actionLabel: "Request availability" }).actionLabel)
      .toBe("Request availability");
  });

  it("does not change the workflow, so eligibility decided on the server stands", () => {
    expect(quoteOnlyCatalogItem(ITEM).workflowMode).toBe("direct_order_request");
  });

  it("never writes a zero, and never mutates its input", () => {
    const quoted = quoteOnlyCatalogItem(ITEM);
    expect(Object.values(quoted)).not.toContain(0);
    expect(ITEM.unitPriceCents).toBe(4_900);
  });

  it("is a no-op on an item that is already priceless", () => {
    const priceless = { ...ITEM, unitPriceCents: null, priceVersion: null };
    expect(quoteOnlyCatalogItem(priceless).unitPriceCents).toBeNull();
  });
});

describe("quoteOnlyCatalogPage", () => {
  it("strips every item and keeps paging facts", () => {
    const page = { items: [ITEM, { ...ITEM, variantId: "var-2" }], page: 1, pageSize: 24, total: 2 };
    const quoted = quoteOnlyCatalogPage(page);
    expect(catalogPriceFields(quoted)).toEqual([]);
    expect(quoted.items.map((item) => item.variantId)).toEqual(["var-synthetic", "var-2"]);
    expect({ page: quoted.page, pageSize: quoted.pageSize, total: quoted.total }).toEqual({ page: 1, pageSize: 24, total: 2 });
  });
});

describe("quoteOnlyRequestView", () => {
  it("removes catalog-derived estimates from a receipt or status, and keeps quantities and references", () => {
    const view = {
      publicReference: "XAO-SYNTHETIC",
      estimatedTotalCents: 9_800,
      currency: "USD",
      lines: [{ lineId: "l1", productName: "Synthetic Peptide", quantity: 2, unitPriceCents: 4_900, lineEstimateCents: 9_800, priceVersion: "price-v1" }],
    };
    const quoted = quoteOnlyRequestView(view);
    expect(catalogPriceFields(quoted)).toEqual([]);
    expect(quoted.estimatedTotalCents).toBeNull();
    expect(quoted.publicReference).toBe("XAO-SYNTHETIC");
    expect(quoted.lines[0]).toMatchObject({ lineId: "l1", quantity: 2, unitPriceCents: null, lineEstimateCents: null });
    expect(view.estimatedTotalCents).toBe(9_800);
  });
});

describe("quoteOnlyStorefrontUnit", () => {
  it("marks a unit as quote-only and carries no price", () => {
    const unit = { variantId: "var-synthetic", strength: "10 mg", quantityLimit: 3, priceCents: 24_900, currency: "USD", availability: "AVAILABLE" };
    const quoted = quoteOnlyStorefrontUnit(unit);
    expect(quoted).toMatchObject({ variantId: "var-synthetic", strength: "10 mg", quantityLimit: 3, priceCents: null, pricing: "quote" });
    expect(catalogPriceFields(quoted)).toEqual([]);
  });

  it("marks a held unit too, so a client never infers quote-only from a missing price", () => {
    const held = quoteOnlyStorefrontUnit({ variantId: "v", priceCents: null, availability: "TEMPORARILY_HELD" });
    expect(held.pricing).toBe("quote");
  });
});

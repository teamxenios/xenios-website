import { describe, expect, it } from "vitest";
import {
  masterOfferingCatalogUrl,
  masterOfferingDetailUrl,
  purchaseQuantityControl,
} from "./integration-packet";

const EVALUATED_AT = "2026-08-11T18:00:00.000Z";

const ADD_TO_CART = {
  kind: "add_to_cart" as const,
  label: "Add to Cart" as const,
  productId: "product",
  variantId: "variant",
  sku: "SKU-1",
  amount: { amountCents: 1000, currency: "USD" },
  evaluatedAt: EVALUATED_AT,
};

const CAPABILITY = {
  source: "accepted_quantity_policy" as const,
  productId: "product",
  variantId: "variant",
  sku: "SKU-1",
  evaluatedAt: EVALUATED_AT,
  minimum: 1,
  maximum: 50,
  aggregateMaximum: 50,
  sourceVersion: "quantity-v1",
};

describe("member-safe master offering UI integration packet", () => {
  it("composes the list and detail API without changing member routes", () => {
    expect(
      masterOfferingCatalogUrl({
        q: "NAD+",
        families: ["blends"],
        states: ["request_access"],
        page: 2,
        pageSize: 24,
      }),
    ).toBe(
      "/api/research/catalog-display/v2/catalog?q=NAD%2B&families=blends&states=request_access&page=2&pageSize=24",
    );
    expect(masterOfferingDetailUrl("research_vials", "bpc-157")).toBe(
      "/api/research/catalog-display/v2/products/research_vials/bpc-157",
    );
  });

  it("never shows a purchase quantity control for planning/request CTAs", () => {
    expect(
      purchaseQuantityControl(
        {
          kind: "request_access",
          label: "Request Access",
          href: "/research/member/product-requests/new",
        },
        CAPABILITY,
      ),
    ).toEqual({ visible: false });
  });

  it("keeps quantity hidden until the accepted exact-variant policy is injected", () => {
    expect(purchaseQuantityControl(ADD_TO_CART, null)).toEqual({
      visible: false,
    });
    expect(purchaseQuantityControl(ADD_TO_CART, CAPABILITY)).toEqual({
      visible: true,
      minimum: 1,
      maximum: 50,
      aggregateMaximum: 50,
      sourceVersion: "quantity-v1",
    });
  });

  it("fails closed without throwing for mismatched or malformed capabilities", () => {
    const refused = [
      undefined,
      {},
      { ...CAPABILITY, productId: "other-product" },
      { ...CAPABILITY, variantId: "other-variant" },
      { ...CAPABILITY, sku: "SKU-2" },
      { ...CAPABILITY, sku: undefined },
      { ...CAPABILITY, evaluatedAt: "2026-08-11T18:00:01.000Z" },
      { ...CAPABILITY, evaluatedAt: undefined },
      { ...CAPABILITY, productId: "" },
      { ...CAPABILITY, variantId: "   " },
      { ...CAPABILITY, sku: "" },
      { ...CAPABILITY, evaluatedAt: "not-an-instant" },
      { ...CAPABILITY, source: "presentation_guess" },
      { ...CAPABILITY, minimum: Number.NaN },
      { ...CAPABILITY, minimum: 0 },
      { ...CAPABILITY, maximum: 0 },
      { ...CAPABILITY, aggregateMaximum: 49 },
      { ...CAPABILITY, sourceVersion: null },
      { ...CAPABILITY, sourceVersion: "   " },
    ];

    for (const capability of refused) {
      expect(() =>
        purchaseQuantityControl(ADD_TO_CART, capability as never),
      ).not.toThrow();
      expect(
        purchaseQuantityControl(ADD_TO_CART, capability as never),
      ).toEqual({ visible: false });
    }
  });

  it("fails closed on malformed browser action identity before enabling quantity", () => {
    const refused = [
      { ...ADD_TO_CART, productId: "" },
      { ...ADD_TO_CART, variantId: undefined },
      { ...ADD_TO_CART, sku: "" },
      { ...ADD_TO_CART, sku: " SKU-1" },
      { ...ADD_TO_CART, sku: undefined },
      { ...ADD_TO_CART, evaluatedAt: "not-an-instant" },
      { ...ADD_TO_CART, evaluatedAt: "2026-02-30T18:00:00.000Z" },
      { ...ADD_TO_CART, evaluatedAt: undefined },
      { ...ADD_TO_CART, amount: null },
      { ...ADD_TO_CART, amount: { amountCents: 0, currency: "USD" } },
      { ...ADD_TO_CART, amount: { amountCents: 1.5, currency: "USD" } },
      { ...ADD_TO_CART, amount: { amountCents: 1000, currency: "" } },
      { ...ADD_TO_CART, label: "Buy now" },
      { ...ADD_TO_CART, kind: "add-to-cart" },
    ];

    for (const action of refused) {
      expect(() =>
        purchaseQuantityControl(action as never, CAPABILITY),
      ).not.toThrow();
      expect(purchaseQuantityControl(action as never, CAPABILITY)).toEqual({
        visible: false,
      });
    }

    expect(
      purchaseQuantityControl({ ...ADD_TO_CART, sku: "SKU-2" }, CAPABILITY),
    ).toEqual({ visible: false });
    expect(
      purchaseQuantityControl(
        { ...ADD_TO_CART, evaluatedAt: "2026-08-11T18:00:01.000Z" },
        CAPABILITY,
      ),
    ).toEqual({ visible: false });
  });
});

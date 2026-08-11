import { describe, expect, it } from "vitest";
import {
  masterOfferingCatalogUrl,
  masterOfferingDetailUrl,
  purchaseQuantityControl,
} from "./integration-packet";

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
        {
          source: "accepted_quantity_policy",
          productId: "product",
          variantId: "variant",
          minimum: 1,
          maximum: 20,
          aggregateMaximum: 20,
          sourceVersion: "quantity-v1",
        },
      ),
    ).toEqual({ visible: false });
  });

  it("keeps quantity hidden until the accepted exact-variant policy is injected", () => {
    const action = {
      kind: "add_to_cart" as const,
      label: "Add to Cart" as const,
      productId: "product",
      variantId: "variant",
      amount: { amountCents: 1000, currency: "USD" },
      evaluatedAt: "2026-08-11T18:00:00.000Z",
    };
    expect(purchaseQuantityControl(action, null)).toEqual({ visible: false });
    expect(
      purchaseQuantityControl(action, {
        source: "accepted_quantity_policy",
        productId: "product",
        variantId: "variant",
        minimum: 1,
        maximum: 20,
        aggregateMaximum: 20,
        sourceVersion: "quantity-v1",
      }),
    ).toEqual({
      visible: true,
      minimum: 1,
      maximum: 20,
      aggregateMaximum: 20,
      sourceVersion: "quantity-v1",
    });
  });
});

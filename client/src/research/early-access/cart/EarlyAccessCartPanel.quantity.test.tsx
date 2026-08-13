import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EarlyAccessCartPanel, type CartDisplayProduct } from "./EarlyAccessCartPanel";

const CART = Object.freeze({
  version: 1 as const,
  items: Object.freeze([{ productId: "prod-q50", variantId: "var-q50", quantity: 1 }]),
});

function product(quantityLimit: number): CartDisplayProduct {
  return {
    productId: "prod-q50",
    variantId: "var-q50",
    name: "Q50 Research Material",
    strength: "10 mg",
    unitPriceCents: 1_000,
    currency: "USD",
    availability: "AVAILABLE",
    quantityLimit,
  };
}

function render(quantityLimit: number): string {
  return renderToStaticMarkup(
    <EarlyAccessCartPanel
      cart={CART}
      products={[product(quantityLimit)]}
      onUpdate={() => {}}
      onRemove={() => {}}
      onContinueShopping={() => {}}
      onContinue={() => {}}
    />,
  );
}

describe("Early Access cart panel quantity authority", () => {
  it("offers every normal quantity through Q50", () => {
    const html = render(50);
    expect(html.match(/<option/g)).toHaveLength(50);
    for (const quantity of [1, 20, 21, 49, 50]) {
      expect(html).toMatch(
        new RegExp(`<option value="${quantity}"(?: selected="")?>${quantity}</option>`),
      );
    }
    expect(html).not.toContain('<option value="51">51</option>');
  });

  it("preserves a narrower Product Control limit", () => {
    const html = render(20);
    expect(html.match(/<option/g)).toHaveLength(20);
    expect(html).toContain('<option value="20">20</option>');
    expect(html).not.toContain('<option value="21">21</option>');
  });
});

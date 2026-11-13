// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toCardProduct } from "./earlyAccessCatalogView";
import { EarlyAccessProductCard, type EarlyAccessCardProduct } from "./EarlyAccessProductCard";
import { EarlyAccessCatalogSection } from "./EarlyAccessCatalogSection";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Quote-only Early Access on the Featured shelf. A unit the server marks
// `pricing: "quote"` is shown with "Request a quote" and no amount, and its
// selection goes to the request flow, never the pay-now checkout. A priced
// unit is unchanged. Synthetic values only.

const ROW = {
  productId: "prod-synthetic",
  variantId: "var-synthetic",
  displayName: "Synthetic Peptide",
  strength: "10 mg",
  currency: "USD",
  description: "A synthetic description.",
  availability: "AVAILABLE",
  purchasable: true,
  quantityLimit: 3,
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});
function render(element: ReactElement): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(element));
  return host;
}
const byId = (el: ParentNode, id: string) => el.querySelector(`[data-testid="${id}"]`);

describe("toCardProduct, quote-only", () => {
  it("keeps a quote unit without a price instead of dropping it", () => {
    const product = toCardProduct({ ...ROW, priceCents: null, pricing: "quote" } as any);
    expect(product).toMatchObject({ variantId: "var-synthetic", strength: "10 mg", unitPriceCents: null, quoteOnly: true, quantityLimit: 3 });
  });

  it("never shows an amount on a quote unit, even if one arrives", () => {
    const product = toCardProduct({ ...ROW, priceCents: 4_900, pricing: "quote" } as any);
    expect(product?.unitPriceCents).toBeNull();
    expect(product?.quoteOnly).toBe(true);
  });

  it("still drops a sellable row with no price and no quote marker", () => {
    expect(toCardProduct({ ...ROW, priceCents: null } as any)).toBeNull();
  });

  it("leaves a priced row as it was", () => {
    const product = toCardProduct({ ...ROW, priceCents: 4_900 } as any);
    expect(product?.unitPriceCents).toBe(4_900);
    expect(product?.quoteOnly ?? false).toBe(false);
  });
});

const QUOTE: EarlyAccessCardProduct = {
  productId: "prod-synthetic", variantId: "var-synthetic", name: "Synthetic Peptide", strength: "10 mg",
  unitPriceCents: null, currency: "USD", description: "", availability: "AVAILABLE", quantityLimit: 3, quoteOnly: true,
};

describe("EarlyAccessProductCard, quote-only", () => {
  it("says Request a quote, shows no amount, and offers Request a quote as its action", () => {
    const el = render(<EarlyAccessProductCard product={QUOTE} quantity={1} onQuantityChange={() => {}} onSelect={() => {}} testId="card" />);
    expect(byId(el, "card-quote")?.textContent).toBe("Request a quote");
    expect(byId(el, "card-no-price")).toBeNull();
    expect(byId(el, "card-unit-price")).toBeNull();
    expect(byId(el, "card-action")?.textContent).toBe("Request a quote");
    expect(el.textContent).not.toMatch(/\$|savings|per unit/i);
  });
});

describe("EarlyAccessCatalogSection, quote-only", () => {
  it("sends a quote selection to the request flow at any quantity, never to checkout", async () => {
    const onReview = vi.fn();
    const onOrderRequest = vi.fn();
    const load = vi.fn(async () => ({ kind: "ok" as const, products: [QUOTE], dropped: 0, received: 1 }));
    const el = render(
      <EarlyAccessCatalogSection fulfillmentTargetCopy="Synthetic fulfillment copy." load={load}
        reviewEnabled onReview={onReview} onOrderRequest={onOrderRequest} testId="shelf" />,
    );
    await act(async () => { await Promise.resolve(); });
    act(() => (byId(el, "shelf") as HTMLElement).querySelector<HTMLButtonElement>('[data-testid$="-action"]')!.click());
    const review = byId(el, "shelf-selection-review") as HTMLButtonElement;
    expect(review.textContent).toContain("Request a quote");
    act(() => review.click());
    expect(onOrderRequest).toHaveBeenCalledWith({ product: QUOTE, quantity: 1 });
    expect(onReview).not.toHaveBeenCalled();
    expect(el.textContent).not.toMatch(/Research Bundle pricing|savings/i);
  });
});

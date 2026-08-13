// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EarlyAccessCardProduct } from "../EarlyAccessProductCard";
import {
  EarlyAccessCartCatalogue,
  type EarlyAccessManualQuantityRequest,
} from "./EarlyAccessCartCatalogue";
import type { BrowserCartItem } from "./cartStore";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const PRODUCT: EarlyAccessCardProduct = {
  productId: "PEX-001",
  variantId: "VAR-BPC5",
  name: "BPC-157 Research Material",
  strength: "5 mg",
  unitPriceCents: 3_350,
  currency: "USD",
  description: "Lyophilised vial for research use.",
  availability: "AVAILABLE",
  quantityLimit: 50,
};

/** The same product, but with a genuine Product Control ceiling below the band. */
const LIMITED: EarlyAccessCardProduct = { ...PRODUCT, quantityLimit: 12 };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function renderCatalogue(
  onPut: (item: BrowserCartItem) => void,
  onManual: (request: EarlyAccessManualQuantityRequest) => void,
  product: EarlyAccessCardProduct = PRODUCT,
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <EarlyAccessCartCatalogue
        products={[product]}
        cart={{ version: 1, items: [] }}
        onPut={onPut}
        onRemove={() => {}}
        onOpenCart={() => {}}
        onRequestManualReview={onManual}
      />,
    );
  });
  return host;
}

function typeQuantity(container: HTMLElement, value: string): void {
  const input = container.querySelector<HTMLInputElement>('input[type="number"]');
  if (input === null) throw new Error("quantity input missing");
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

function action(container: HTMLElement): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
    /add to cart|limit \d+ per order/i.test(candidate.textContent ?? ""),
  );
  if (button === undefined) throw new Error("catalogue action missing");
  return button;
}

describe("F-013 cart catalogue routing, 1 through 50", () => {
  it("adds 20 to the direct cart when all server authority permits it", () => {
    const onPut = vi.fn();
    const onManual = vi.fn();
    const view = renderCatalogue(onPut, onManual);
    typeQuantity(view, "20");
    expect(action(view).textContent).toContain("Add to cart");
    act(() => action(view).click());
    expect(onPut).toHaveBeenCalledWith({
      productId: "PEX-001",
      variantId: "VAR-BPC5",
      quantity: 20,
    });
    expect(onManual).not.toHaveBeenCalled();
  });

  it("adds 21 to the direct cart, indistinguishably from 20", () => {
    // The founder's requirement in one test: 21 must look exactly as ordinary
    // as 20. Under F-012 this same interaction produced a different BUTTON, a
    // different handler and a different destination. Now the only difference
    // between the two cases is the number.
    const onPut = vi.fn();
    const onManual = vi.fn();
    const view = renderCatalogue(onPut, onManual);
    typeQuantity(view, "21");
    expect(action(view).textContent).toContain("Add to cart");
    act(() => action(view).click());
    expect(onPut).toHaveBeenCalledWith({
      productId: "PEX-001",
      variantId: "VAR-BPC5",
      quantity: 21,
    });
    expect(onManual).not.toHaveBeenCalled();
  });

  it("adds 50 to the direct cart", () => {
    const onPut = vi.fn();
    const onManual = vi.fn();
    const view = renderCatalogue(onPut, onManual);
    typeQuantity(view, "50");
    expect(action(view).textContent).toContain("Add to cart");
    act(() => action(view).click());
    expect(onPut).toHaveBeenCalledWith({
      productId: "PEX-001",
      variantId: "VAR-BPC5",
      quantity: 50,
    });
    expect(onManual).not.toHaveBeenCalled();
  });

  it("never routes any quantity in the band to a manual review branch", () => {
    // The negative control at the UI layer. It fails if anyone reintroduces a
    // quantity-based review affordance anywhere inside 1..50.
    for (const quantity of ["1", "20", "21", "35", "49", "50"]) {
      const onPut = vi.fn();
      const onManual = vi.fn();
      const view = renderCatalogue(onPut, onManual);
      typeQuantity(view, quantity);
      expect(view.textContent ?? "").not.toMatch(/manual review/i);
      act(() => action(view).click());
      expect(onManual, `quantity ${quantity} must not route to review`).not.toHaveBeenCalled();
      expect(onPut).toHaveBeenCalledTimes(1);
      act(() => root?.unmount());
      host?.remove();
      root = null;
      host = null;
    }
  });

  it("refuses past a real Product Control ceiling by NAMING it, not by queueing", () => {
    // A per-product ceiling is a surviving non-quantity restriction. The buyer
    // is told the real limit instead of being dropped into a review queue, and
    // the direct-cart insert is never called.
    const onPut = vi.fn();
    const onManual = vi.fn();
    const view = renderCatalogue(onPut, onManual, LIMITED);
    typeQuantity(view, "30");
    expect(action(view).textContent).toContain("Limit 12 per order");
    act(() => action(view).click());
    expect(onPut).not.toHaveBeenCalled();
    expect(onManual).not.toHaveBeenCalled();
  });
});

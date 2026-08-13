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
  quantityLimit: 20,
};

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
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <EarlyAccessCartCatalogue
        products={[PRODUCT]}
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
    /add to cart|request manual review/i.test(candidate.textContent ?? ""),
  );
  if (button === undefined) throw new Error("catalogue action missing");
  return button;
}

describe("F-012 cart catalogue routing", () => {
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

  it("routes 21 to manual review and never calls the direct-cart insert", () => {
    const onPut = vi.fn();
    const onManual = vi.fn();
    const view = renderCatalogue(onPut, onManual);
    typeQuantity(view, "21");
    expect(action(view).textContent).toContain("Request manual review");
    act(() => action(view).click());
    expect(onManual).toHaveBeenCalledWith({
      productId: "PEX-001",
      variantId: "VAR-BPC5",
      requestedQuantity: 21,
    });
    expect(onPut).not.toHaveBeenCalled();
  });

  it("accepts a request for 50 only on the manual branch", () => {
    const onPut = vi.fn();
    const onManual = vi.fn();
    const view = renderCatalogue(onPut, onManual);
    typeQuantity(view, "50");
    act(() => action(view).click());
    expect(onManual).toHaveBeenCalledWith({
      productId: "PEX-001",
      variantId: "VAR-BPC5",
      requestedQuantity: 50,
    });
    expect(onPut).not.toHaveBeenCalled();
  });
});

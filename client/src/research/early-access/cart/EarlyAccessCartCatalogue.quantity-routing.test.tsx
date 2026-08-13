// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EarlyAccessCardProduct } from "../EarlyAccessProductCard";
import {
  EarlyAccessCartCatalogue,
  type EarlyAccessOrderRequest,
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
  onRequest: (request: EarlyAccessOrderRequest) => void,
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
        onRequestOrder={onRequest}
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
    /add to cart|request this order/i.test(candidate.textContent ?? ""),
  );
  if (button === undefined) throw new Error("catalogue action missing");
  return button;
}

describe("F-012 cart catalogue routing", () => {
  it("adds 20 to the direct cart when all server authority permits it", () => {
    const onPut = vi.fn();
    const onRequest = vi.fn();
    const view = renderCatalogue(onPut, onRequest);
    typeQuantity(view, "20");
    expect(action(view).textContent).toContain("Add to cart");
    act(() => action(view).click());
    expect(onPut).toHaveBeenCalledWith({
      productId: "PEX-001",
      variantId: "VAR-BPC5",
      quantity: 20,
    });
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("routes 21 to the direct cart under the founder 1..50 authority", () => {
    const onPut = vi.fn();
    const onRequest = vi.fn();
    const view = renderCatalogue(onPut, onRequest);
    typeQuantity(view, "21");
    expect(action(view).textContent).toContain("Add to cart");
    act(() => action(view).click());
    expect(onPut).toHaveBeenCalledWith({
      productId: "PEX-001",
      variantId: "VAR-BPC5",
      quantity: 21,
    });
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("adds 50 to the direct cart under matching product authority", () => {
    const onPut = vi.fn();
    const onRequest = vi.fn();
    const view = renderCatalogue(onPut, onRequest);
    typeQuantity(view, "50");
    act(() => action(view).click());
    expect(onPut).toHaveBeenCalledWith({
      productId: "PEX-001",
      variantId: "VAR-BPC5",
      quantity: 50,
    });
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("uses the order-request path for an explicit lower release ceiling", () => {
    const onPut = vi.fn();
    const onRequest = vi.fn();
    const limited = { ...PRODUCT, quantityLimit: 20 };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(
      <EarlyAccessCartCatalogue products={[limited]} cart={{ version: 1, items: [] }}
        onPut={onPut} onRemove={() => {}} onOpenCart={() => {}} onRequestOrder={onRequest} />,
    ));
    typeQuantity(host, "21");
    expect(action(host).textContent).toContain("Request this order");
    act(() => action(host!).click());
    expect(onRequest).toHaveBeenCalledWith({ productId: "PEX-001", variantId: "VAR-BPC5", requestedQuantity: 21 });
    expect(onPut).not.toHaveBeenCalled();
  });
});

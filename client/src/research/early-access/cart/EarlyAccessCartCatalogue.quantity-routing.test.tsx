// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EarlyAccessCardProduct } from "../EarlyAccessProductCard";
import {
  EarlyAccessCartCatalogue,
  type EarlyAccessOrderRequest,
} from "./EarlyAccessCartCatalogue";
import type { BrowserCartItem } from "./cartStore";
import { ASSISTED_ORDER_CTA_PATH } from "../../assisted-order/AssistedOrderCta";
import { resetAssistedOrderConfigCache } from "../../assisted-order/api";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const PRODUCT: EarlyAccessCardProduct = {
  productId: "PEX-001",
  variantId: "VAR-BPC5",
  name: "BPC-157 Research Material",
  category: "Specialty research materials",
  strength: "5 mg",
  unitPriceCents: 3_350,
  currency: "USD",
  description: "Lyophilised vial for research use.",
  availability: "AVAILABLE",
  quantityLimit: 50,
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function configResponse(enabled: boolean): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ enabled }),
  } as Response;
}

async function settleConfig(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  resetAssistedOrderConfigCache();
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

function renderStatefulCatalogue({
  product,
  initialItems,
  onPut = () => {},
  onRemove = () => {},
  onOpenCart = () => {},
  onRequest = () => {},
}: Readonly<{
  product: EarlyAccessCardProduct;
  initialItems: readonly BrowserCartItem[];
  onPut?: (item: BrowserCartItem) => void;
  onRemove?: (productId: string, variantId: string) => void;
  onOpenCart?: () => void;
  onRequest?: (request: EarlyAccessOrderRequest) => void;
}>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  function Harness() {
    const [cart, setCart] = useState({
      version: 1 as const,
      items: initialItems,
    });
    return (
      <EarlyAccessCartCatalogue
        products={[product]}
        cart={cart}
        onPut={(item) => {
          onPut(item);
          setCart((current) => ({
            version: 1,
            items: [
              ...current.items.filter(
                (candidate) =>
                  candidate.productId !== item.productId ||
                  candidate.variantId !== item.variantId,
              ),
              item,
            ],
          }));
        }}
        onRemove={(productId, variantId) => {
          onRemove(productId, variantId);
          setCart((current) => ({
            version: 1,
            items: current.items.filter(
              (item) => item.productId !== productId || item.variantId !== variantId,
            ),
          }));
        }}
        onOpenCart={onOpenCart}
        onRequestOrder={onRequest}
      />
    );
  }

  act(() => root?.render(<Harness />));
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

function action(container: HTMLElement): HTMLElement {
  const button = Array.from(container.querySelectorAll<HTMLElement>("button, a")).find((candidate) =>
    /add to cart|open assisted ordering/i.test(candidate.textContent ?? ""),
  );
  if (button === undefined) throw new Error("catalogue action missing");
  return button;
}

describe("F-012 cart catalogue routing", () => {
  it("shows category and includes it in cart-catalogue search", () => {
    const view = renderCatalogue(vi.fn(), vi.fn());
    expect(
      view.querySelector("[data-testid='cart-catalogue-category-VAR-BPC5']")?.textContent,
    ).toBe("Specialty research materials");

    const search = view.querySelector<HTMLInputElement>("#early-access-cart-search");
    if (search === null) throw new Error("catalogue search missing");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(search, "specialty");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view.textContent).toContain("BPC-157 Research Material");
    expect(view.textContent).not.toContain("No products match this search");
  });

  it("omits a malformed category without changing the direct-cart action", () => {
    const onPut = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(
      <EarlyAccessCartCatalogue
        products={[{ ...PRODUCT, category: { internal: true } as unknown as string }]}
        cart={{ version: 1, items: [] }}
        onPut={onPut}
        onRemove={() => {}}
        onOpenCart={() => {}}
        onRequestOrder={() => {}}
      />,
    ));

    expect(host.querySelector("[data-testid='cart-catalogue-category-VAR-BPC5']")).toBeNull();
    expect(action(host).textContent).toContain("Add to cart");
    act(() => action(host!).click());
    expect(onPut).toHaveBeenCalledWith({
      productId: "PEX-001",
      variantId: "VAR-BPC5",
      quantity: 1,
    });
  });

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

  it("uses the exact assisted-order path for an explicit lower release ceiling when enabled", async () => {
    const fetchStub = vi.fn(async () => configResponse(true));
    vi.stubGlobal("fetch", fetchStub);
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
    await settleConfig();
    expect(action(host).textContent).toContain("Open assisted ordering");
    expect(host.textContent).not.toContain("Request this order");
    const link = action(host) as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(ASSISTED_ORDER_CTA_PATH);
    expect(link.getAttribute("href")).not.toContain("?");
    expect(host.textContent).toContain(
      "Reselect the product, exact variant, and quantity in the assisted-order form.",
    );
    expect(onRequest).not.toHaveBeenCalled();
    expect(onPut).not.toHaveBeenCalled();
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("removes a persisted line above the current server limit before direct checkout", async () => {
    const fetchStub = vi.fn(async () => configResponse(true));
    vi.stubGlobal("fetch", fetchStub);
    const onPut = vi.fn();
    const onRemove = vi.fn();
    const onOpenCart = vi.fn();
    const onRequest = vi.fn();
    const limited = { ...PRODUCT, quantityLimit: 20 };
    const view = renderStatefulCatalogue({
      product: limited,
      initialItems: [
        { productId: PRODUCT.productId, variantId: PRODUCT.variantId, quantity: 21 },
      ],
      onPut,
      onRemove,
      onOpenCart,
      onRequest,
    });
    await settleConfig();

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(PRODUCT.productId, PRODUCT.variantId);
    expect(onPut).not.toHaveBeenCalled();
    expect(onRequest).not.toHaveBeenCalled();
    expect(view.textContent).toContain("0 products · 0 units");
    expect(view.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("21");
    expect(
      view.querySelector(
        "[data-testid='cart-catalogue-VAR-BPC5-removed-from-direct-cart']",
      )?.textContent,
    ).toContain("removed from the direct cart");
    expect(view.textContent).toContain("No order request was sent");
    const link = view.querySelector<HTMLAnchorElement>(
      `a[href='${ASSISTED_ORDER_CTA_PATH}']`,
    );
    expect(link?.textContent).toContain("Open assisted ordering");
    expect(link?.getAttribute("href")).toBe(ASSISTED_ORDER_CTA_PATH);
    expect(link?.getAttribute("href")).not.toContain("?");
    expect(view.textContent).toContain(
      "Reselect the product, exact variant, and quantity in the assisted-order form.",
    );
    const viewCart = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("View cart"),
    );
    expect(viewCart?.disabled).toBe(true);
    expect(onOpenCart).not.toHaveBeenCalled();
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("lets an in-cart quantity cross the direct limit and moves it to assisted guidance", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => configResponse(true)));
    const onPut = vi.fn();
    const onRemove = vi.fn();
    const onRequest = vi.fn();
    const limited = { ...PRODUCT, quantityLimit: 20 };
    const view = renderStatefulCatalogue({
      product: limited,
      initialItems: [
        { productId: PRODUCT.productId, variantId: PRODUCT.variantId, quantity: 20 },
      ],
      onPut,
      onRemove,
      onRequest,
    });
    const input = view.querySelector<HTMLInputElement>('input[type="number"]');
    expect(Number(input?.max)).toBeGreaterThan(20);
    expect(onRemove).not.toHaveBeenCalled();

    typeQuantity(view, "21");
    await settleConfig();

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(PRODUCT.productId, PRODUCT.variantId);
    expect(onPut).not.toHaveBeenCalled();
    expect(onRequest).not.toHaveBeenCalled();
    expect(view.textContent).toContain("0 products · 0 units");
    expect(view.querySelector(`a[href='${ASSISTED_ORDER_CTA_PATH}']`)).not.toBeNull();
    expect(view.textContent).toContain("nothing was transferred to assisted ordering");
    expect(view.textContent).not.toContain("Request this order");

    typeQuantity(view, "22");
    expect(view.textContent).toContain("removed from the direct cart");
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("shows a truthful unavailable/support state and no assisted-order link when disabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => configResponse(false)));
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
    await settleConfig();

    expect(host.querySelector(`a[href='${ASSISTED_ORDER_CTA_PATH}']`)).toBeNull();
    expect(host.textContent).toContain("Assisted ordering is temporarily unavailable");
    expect(host.querySelector("a[href='/research/support']")?.textContent).toContain(
      "Contact support",
    );
    expect(onRequest).not.toHaveBeenCalled();
    expect(onPut).not.toHaveBeenCalled();
  });

  it("shows no route while the capability request is unresolved", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const limited = { ...PRODUCT, quantityLimit: 20 };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(
      <EarlyAccessCartCatalogue products={[limited]} cart={{ version: 1, items: [] }}
        onPut={() => {}} onRemove={() => {}} onOpenCart={() => {}} onRequestOrder={() => {}} />,
    ));
    typeQuantity(host, "21");

    expect(host.querySelector(`a[href='${ASSISTED_ORDER_CTA_PATH}']`)).toBeNull();
    expect(host.textContent).toContain("Checking assisted-order availability");
  });
});

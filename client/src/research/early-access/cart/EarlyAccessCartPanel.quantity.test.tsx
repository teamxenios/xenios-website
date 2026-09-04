// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EarlyAccessCartPanel, type CartDisplayProduct } from "./EarlyAccessCartPanel";
import { ASSISTED_ORDER_CTA_PATH } from "../../assisted-order/AssistedOrderCta";
import { resetAssistedOrderConfigCache } from "../../assisted-order/api";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const CART = Object.freeze({
  version: 1 as const,
  items: Object.freeze([{ productId: "prod-q50", variantId: "var-q50", quantity: 1 }]),
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

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

function configResponse(enabled: boolean): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ enabled }),
  } as Response;
}

function renderInteractive(quantityLimit: number, quantity: number) {
  const onUpdate = vi.fn();
  const onRemove = vi.fn();
  const onContinue = vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root?.render(
    <EarlyAccessCartPanel
      cart={{
        version: 1,
        items: [{ productId: "prod-q50", variantId: "var-q50", quantity }],
      }}
      products={[product(quantityLimit)]}
      onUpdate={onUpdate}
      onRemove={onRemove}
      onContinueShopping={() => {}}
      onContinue={onContinue}
    />,
  ));
  return { host, onUpdate, onRemove, onContinue };
}

async function settleConfig(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
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

  it("fails a restored over-limit row closed and offers only the canonical assisted door", async () => {
    const fetchStub = vi.fn(async () => configResponse(true));
    vi.stubGlobal("fetch", fetchStub);
    const view = renderInteractive(20, 21);
    await settleConfig();

    const continueButton = Array.from(view.host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Continue to shipping"),
    );
    expect(continueButton?.disabled).toBe(true);
    act(() => continueButton?.click());
    expect(view.onContinue).not.toHaveBeenCalled();

    const warning = view.host.querySelector(
      "[data-testid='early-access-cart-line-var-q50-over-limit']",
    );
    expect(warning?.textContent).toContain("Saved quantity 21");
    expect(warning?.textContent).toContain("cannot continue to shipping");

    const assistedLink = view.host.querySelector<HTMLAnchorElement>(
      `a[href='${ASSISTED_ORDER_CTA_PATH}']`,
    );
    expect(assistedLink?.textContent).toContain("Open assisted ordering");
    expect(assistedLink?.getAttribute("href")).toBe(ASSISTED_ORDER_CTA_PATH);
    expect(assistedLink?.getAttribute("href")).not.toContain("?");
    expect(view.host.textContent).toContain("This selection cannot be transferred");
    expect(view.host.textContent).toContain(
      "Reselect the product, exact variant, and quantity in the assisted-order form.",
    );

    const quantitySelect = view.host.querySelector<HTMLSelectElement>("#cart-qty-var-q50");
    expect(quantitySelect?.value).toBe("21");
    expect(quantitySelect?.querySelector<HTMLOptionElement>('option[value="21"]')?.disabled)
      .toBe(true);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value",
      )?.set;
      setter?.call(quantitySelect, "20");
      quantitySelect?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(view.onUpdate).toHaveBeenCalledWith({
      productId: "prod-q50",
      variantId: "var-q50",
      quantity: 20,
    });

    const removeButton = Array.from(view.host.querySelectorAll("button")).find(
      (button) => button.textContent === "Remove",
    );
    act(() => removeButton?.click());
    expect(view.onRemove).toHaveBeenCalledWith({
      productId: "prod-q50",
      variantId: "var-q50",
      quantity: 21,
    });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: "disabled",
      fetcher: () => Promise.resolve(configResponse(false)),
      copy: "Assisted ordering is temporarily unavailable",
    },
    {
      label: "unreachable",
      fetcher: () => Promise.reject(new TypeError("offline")),
      copy: "We could not confirm assisted-order availability",
    },
  ])("keeps an over-limit row blocked when the assisted door is $label", async ({ fetcher, copy }) => {
    vi.stubGlobal("fetch", vi.fn(fetcher));
    const view = renderInteractive(20, 21);
    await settleConfig();

    expect(view.host.querySelector(`a[href='${ASSISTED_ORDER_CTA_PATH}']`)).toBeNull();
    expect(view.host.textContent).toContain(copy);
    expect(view.host.querySelector("a[href='/research/support']")?.textContent).toContain(
      "Contact support",
    );
    const continueButton = Array.from(view.host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Continue to shipping"),
    );
    expect(continueButton?.disabled).toBe(true);
    expect(view.onContinue).not.toHaveBeenCalled();
    expect(view.host.textContent).not.toContain("Request this order");
  });
});

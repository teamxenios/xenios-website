// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BuyerCatalogVariant, BuyerOrderRequestInput } from "@shared/research/buyer-commerce";
import { BuyerCommerceBridge, buyerSubmissionAttempt } from "./BuyerCommerceBridge";

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  while (roots.length) act(() => roots.pop()!.unmount());
  document.body.replaceChildren();
});

function variant(id: string, directQuantityLimit = 50): BuyerCatalogVariant {
  return {
    offeringId: `p-${id}`,
    variantId: `v-${id}`,
    sku: `SKU-${id}`,
    slug: `product-${id}`,
    productName: `Product ${id}`,
    category: "research_vial",
    currency: "USD",
    displayState: "AVAILABLE",
    directPurchaseAuthorized: true,
    directQuantityLimit,
    directAuthorityBasis: "product_control",
    carePathway: false,
  };
}

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("buyer commerce submission attempts", () => {
  it("reuses the idempotency key for the same intent after an uncertain response", () => {
    const makeKey = vi.fn()
      .mockReturnValueOnce("xbr_0123456789abcdefghijkl")
      .mockReturnValueOnce("xbr_abcdefghijkl0123456789");
    const first = buyerSubmissionAttempt(null, '{"quantity":1}', makeKey);
    const retry = buyerSubmissionAttempt(first, '{"quantity":1}', makeKey);
    const changed = buyerSubmissionAttempt(retry, '{"quantity":2}', makeKey);

    expect(retry).toBe(first);
    expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(makeKey).toHaveBeenCalledTimes(2);
  });

  it("supports no-account multi-variant requests with ordinary quantity 21", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const submitted: BuyerOrderRequestInput[] = [];
    act(() => root.render(
      <BuyerCommerceBridge
        variants={[variant("ONE", 5), variant("TWO")]}
        makeIdempotencyKey={() => "xbr_0123456789abcdefghijkl"}
        onSubmit={(request) => { submitted.push(request); }}
      />,
    ));
    expect(host.textContent).toContain("No account required");
    expect(host.textContent).toContain("claim later");
    expect(host.textContent).toContain("Direct checkout currently covers up to 5");

    const addButtons = Array.from(host.querySelectorAll("button"))
      .filter((button) => button.textContent === "Add to request");
    act(() => addButtons[0]!.click());
    const secondQuantity = host.querySelector<HTMLInputElement>(
      '[aria-label="Quantity for Product TWO SKU-TWO"]',
    )!;
    act(() => setValue(secondQuantity, "21"));
    act(() => addButtons[1]!.click());

    const values: Record<string, string> = {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ADA@EXAMPLE.COM",
      line1: "1 Research Way",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
    };
    for (const [name, value] of Object.entries(values)) {
      setValue(host.querySelector<HTMLInputElement>(`[name="${name}"]`)!, value);
    }
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.identity.email).toBe("ada@example.com");
    expect(submitted[0]?.lines).toEqual([
      { offeringId: "p-ONE", variantId: "v-ONE", requestedQuantity: 1 },
      { offeringId: "p-TWO", variantId: "v-TWO", requestedQuantity: 21 },
    ]);
  });
});

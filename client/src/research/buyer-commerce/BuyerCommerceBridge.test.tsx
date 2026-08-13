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

function variant(
  id: string,
  directQuantityLimit: number | null = 50,
  category = "research_vial",
): BuyerCatalogVariant {
  return {
    offeringId: `p-${id}`,
    variantId: `v-${id}`,
    sku: `SKU-${id}`,
    slug: `product-${id}`,
    productName: `Product ${id}`,
    category,
    displayPriceCents: 4_500,
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
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Buyer request received.");
    expect(submitted[0]?.identity.email).toBe("ada@example.com");
    expect(submitted[0]?.lines).toEqual([
      { offeringId: "p-ONE", variantId: "v-ONE", requestedQuantity: 1 },
      { offeringId: "p-TWO", variantId: "v-TWO", requestedQuantity: 21 },
    ]);
  });

  it("shows the durable request reference and server-owned next step", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(
      <BuyerCommerceBridge
        variants={[variant("ONE")]}
        makeIdempotencyKey={() => "xbr_0123456789abcdefghijkl"}
        onSubmit={async (request) => ({
          requestRef: "XBR-DURABLE-001",
          customerRef: "eac_0123456789abcdef0123456789abcdef",
          status: "request_received",
          replayed: false,
          lines: [{
            ...request.lines[0]!,
            sku: "SKU-ONE",
            productName: "Product ONE",
            disposition: "direct_cart_eligible",
            currency: "USD",
            directQuantityLimit: 50,
          }],
          createdAt: "2026-08-13T06:00:00.000Z",
          nextStep: "Continue with the canonical cart.",
        })}
      />,
    ));
    const add = Array.from(host.querySelectorAll("button"))
      .find((button) => button.textContent === "Add to request")!;
    act(() => add.click());
    const values: Record<string, string> = {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
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

    expect(host.querySelector('[role="status"]')?.textContent).toContain("XBR-DURABLE-001");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("canonical cart");
  });

  it("bounds the initial catalog DOM, paginates, filters, and fails authority display closed", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const variants = Array.from({ length: 1_181 }, (_, index) =>
      variant(String(index + 1).padStart(4, "0"), 50, index % 2 ? "peptide" : "supplement"),
    );
    variants[0] = {
      ...variants[0]!,
      directPurchaseAuthorized: true,
      directQuantityLimit: null,
    };
    act(() => root.render(
      <BuyerCommerceBridge variants={variants} onSubmit={() => {}} />,
    ));

    expect(host.querySelectorAll("article")).toHaveLength(24);
    expect(host.textContent).toContain("1181 exact variants · page 1 of 50");
    expect(host.textContent).not.toContain("up to null");
    expect(host.textContent).toContain("Product 0001");
    expect(host.textContent).not.toContain("Product 1181");

    const next = Array.from(host.querySelectorAll("button"))
      .find((button) => button.textContent === "Next products")!;
    act(() => next.click());
    expect(host.textContent).toContain("page 2 of 50");
    expect(host.querySelectorAll("article")).toHaveLength(24);

    const search = host.querySelector<HTMLInputElement>('[aria-label="Search catalog"]')!;
    act(() => setValue(search, "SKU-1181"));
    expect(host.textContent).toContain("1 exact variants · page 1 of 1");
    expect(host.querySelectorAll("article")).toHaveLength(1);
    expect(host.textContent).toContain("Product 1181");

    act(() => setValue(search, ""));
    const category = host.querySelector<HTMLSelectElement>(
      '[aria-label="Filter catalog by category"]',
    )!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")!.set!;
    act(() => {
      setter.call(category, "peptide");
      category.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.textContent).toContain("590 exact variants · page 1 of 25");
    expect(host.querySelectorAll("article")).toHaveLength(24);
  });

  it("does not advertise malformed direct authority from the display projection", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const malformed = [
      variant("NULL", null),
      { ...variant("FRACTIONAL", 1.5), displayPriceCents: 4_500 },
      { ...variant("NO-PRICE", 5), displayPriceCents: undefined },
      { ...variant("ZERO-PRICE", 5), displayPriceCents: 0 },
      { ...variant("NO-BASIS", 5), directAuthorityBasis: null },
    ];
    act(() => root.render(
      <BuyerCommerceBridge variants={malformed} onSubmit={() => {}} />,
    ));

    expect(host.textContent).not.toContain("Direct checkout currently covers up to");
    expect(host.textContent?.match(/existing order-request path/g)).toHaveLength(5);
  });
});

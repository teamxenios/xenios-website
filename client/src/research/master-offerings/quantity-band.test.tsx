// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type {
  MasterOfferingDetailView,
  MasterOfferingVariantView,
} from "@shared/research/master-offerings/contract";
import { MasterOfferingDetail } from "./MasterOfferingDetail";
import {
  purchaseQuantityControl,
  type AcceptedExactVariantQuantityCapability,
} from "./integration-packet";

/**
 * The founder quantity decision: 1 through 50 is the normal band, and there is
 * no review threshold anywhere inside it. These tests pin two separate claims.
 *
 * First, this lane carries no ceiling of its own, so it follows the authority
 * to 50 without a code change and would follow it anywhere else too.
 *
 * Second, and more important, quantity is not an input to action resolution
 * anywhere in the catalog. The lane could not create a quantity-based review
 * threshold even by accident, because the action is already decided before a
 * quantity exists.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, unmount: () => act(() => root.unmount()) };
}

function typeQuantity(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('[data-testid="mo-quantity"]');
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!input) throw new Error("no quantity control rendered");
  setter?.call(input, value);
  act(() => input.dispatchEvent(new Event("input", { bubbles: true })));
}

const BAND_1_50: AcceptedExactVariantQuantityCapability = {
  source: "accepted_quantity_policy",
  productId: "pc_product_1",
  variantId: "pc_variant_1",
  minimum: 1,
  maximum: 50,
  aggregateMaximum: 50,
  sourceVersion: "quantity-1-50",
};

const ADD_TO_CART = {
  kind: "add_to_cart",
  label: "Add to Cart",
  productId: "pc_product_1",
  variantId: "pc_variant_1",
  sku: "XEN-BPC-10",
  amount: { amountCents: 9900, currency: "USD" },
  evaluatedAt: "2026-08-13T12:00:00.000Z",
} as const;

function purchasableVariant(
  overrides: Partial<MasterOfferingVariantView> = {},
): MasterOfferingVariantView {
  return {
    id: "mov_a",
    label: "5 mg vial",
    displayState: "available_now",
    displayLabel: "Available Now",
    price: {
      state: "priced",
      basis: "exact_listed_unit",
      amountCents: 9900,
      currency: "USD",
      display: "$99.00",
      priceId: "price_1",
      priceVersion: 1,
      effectiveAt: "2026-08-01T00:00:00.000Z",
      expiresAt: null,
    },
    action: ADD_TO_CART,
    ...overrides,
  };
}

function detail(): MasterOfferingDetailView {
  const variants = [purchasableVariant()];
  return {
    id: "mo_1",
    slug: "research-vials-bpc-157",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    family: "research_vials",
    familyLabel: "Research Vials",
    category: "Peptides & Research",
    subcategory: null,
    brand: null,
    displayState: "available_now",
    displayLabel: "Available Now",
    stateExplanation: "Available now.",
    copyState: "approved",
    variantCount: 1,
    overview: null,
    disclosures: [],
    priceSummary: {
      state: "single",
      variantCount: 1,
      pricedVariantCount: 1,
      currency: "USD",
      fromCents: 9900,
      toCents: 9900,
      display: "$99.00",
    },
    variants,
  };
}

describe("quantity 1 through 50", () => {
  it("carries no ceiling of its own and follows the authority to 50", () => {
    expect(purchaseQuantityControl(ADD_TO_CART, BAND_1_50)).toEqual({
      visible: true,
      minimum: 1,
      maximum: 50,
      aggregateMaximum: 50,
      sourceVersion: "quantity-1-50",
    });
    // And it would follow the authority anywhere else. Nothing in this lane
    // knows the number 20 or the number 50.
    expect(
      purchaseQuantityControl(ADD_TO_CART, {
        ...BAND_1_50,
        maximum: 137,
        aggregateMaximum: 137,
      }),
    ).toMatchObject({ visible: true, maximum: 137 });
  });

  it("renders a selector spanning the whole band", () => {
    const { host, unmount } = render(
      <MasterOfferingDetail product={detail()} capabilityFor={() => BAND_1_50} />,
    );
    const input = host.querySelector<HTMLInputElement>(
      '[data-testid="mo-quantity"]',
    );
    expect(input?.getAttribute("min")).toBe("1");
    expect(input?.getAttribute("max")).toBe("50");
    unmount();
  });

  it("accepts every quantity in the band without changing the action", () => {
    const onAddToCart = vi.fn();
    const { host, unmount } = render(
      <MasterOfferingDetail
        product={detail()}
        capabilityFor={() => BAND_1_50}
        onAddToCart={onAddToCart}
      />,
    );
    for (const quantity of [1, 2, 19, 20, 21, 25, 49, 50]) {
      typeQuantity(host, String(quantity));
      const cta = host.querySelector<HTMLButtonElement>('[data-testid="mo-cta"]');
      // The label and the action never change with quantity. Twenty-one is not
      // a different kind of purchase from twenty.
      expect(cta?.textContent).toBe("Add to Cart");
      expect(cta?.disabled).toBe(false);
      expect(host.querySelector('[data-testid="mo-quantity-band-note"]')).toBeNull();
      act(() => cta?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(onAddToCart).toHaveBeenLastCalledWith(ADD_TO_CART, quantity);
    }
    expect(onAddToCart).toHaveBeenCalledTimes(8);
    unmount();
  });

  it("never turns a quantity above twenty into a request or a review", () => {
    const { host, unmount } = render(
      <MasterOfferingDetail product={detail()} capabilityFor={() => BAND_1_50} />,
    );
    for (const quantity of [21, 30, 50]) {
      typeQuantity(host, String(quantity));
      const text = host.textContent ?? "";
      expect(text).not.toContain("Request");
      expect(text).not.toContain("review");
      expect(text).not.toContain("Review");
      expect(host.querySelectorAll('[data-testid="mo-cta"]')).toHaveLength(1);
    }
    unmount();
  });

  it("refuses past the band rather than clamping into it", () => {
    const onAddToCart = vi.fn();
    const { host, unmount } = render(
      <MasterOfferingDetail
        product={detail()}
        capabilityFor={() => BAND_1_50}
        onAddToCart={onAddToCart}
      />,
    );
    typeQuantity(host, "51");
    const cta = host.querySelector<HTMLButtonElement>('[data-testid="mo-cta"]');
    expect(cta?.disabled).toBe(true);
    expect(
      host.querySelector('[data-testid="mo-quantity-band-note"]')?.textContent,
    ).toBe("Choose between 1 and 50.");
    act(() => cta?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAddToCart).not.toHaveBeenCalled();
    // Refused, not rewritten. The field still shows what the buyer asked for.
    expect(
      host.querySelector<HTMLInputElement>('[data-testid="mo-quantity"]')?.value,
    ).toBe("51");
    unmount();
  });

  it("refuses blank and fractional input without coercing either value", () => {
    const onAddToCart = vi.fn();
    const { host, unmount } = render(
      <MasterOfferingDetail
        product={detail()}
        capabilityFor={() => BAND_1_50}
        onAddToCart={onAddToCart}
      />,
    );
    for (const value of ["", "1.5"]) {
      typeQuantity(host, value);
      const input = host.querySelector<HTMLInputElement>(
        '[data-testid="mo-quantity"]',
      );
      const cta = host.querySelector<HTMLButtonElement>('[data-testid="mo-cta"]');
      expect(input?.value).toBe(value);
      expect(input?.getAttribute("aria-invalid")).toBe("true");
      expect(cta?.disabled).toBe(true);
      act(() => cta?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    }
    expect(onAddToCart).not.toHaveBeenCalled();
    unmount();
  });

  it("shows no quantity control at all on a request path", () => {
    const requestOnly = detail();
    const product: MasterOfferingDetailView = {
      ...requestOnly,
      variants: [
        purchasableVariant({
          action: {
            kind: "request_early_access_purchase",
            label: "Request Early Access Purchase",
            href: "/research/member/product-requests/new?source=products",
          },
        }),
      ],
    };
    const { host, unmount } = render(
      <MasterOfferingDetail product={product} capabilityFor={() => BAND_1_50} />,
    );
    // A manual request carries no quantity commitment, at any band.
    expect(host.querySelector('[data-testid="mo-quantity"]')).toBeNull();
    unmount();
  });
});

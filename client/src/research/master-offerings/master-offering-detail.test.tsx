// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type {
  MasterOfferingDetailView,
  MasterOfferingVariantView,
} from "@shared/research/master-offerings/contract";
import { MASTER_OFFERING_PRICE_ON_REQUEST } from "@shared/research/master-offerings/pricing-contract";
import { MasterOfferingDetail } from "./MasterOfferingDetail";
import type { AcceptedExactVariantQuantityCapability } from "./integration-packet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, unmount: () => act(() => root.unmount()) };
}

function click(element: Element | null | undefined) {
  act(() => element?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

const PRICED = {
  state: "priced",
  amountCents: 9900,
  currency: "USD",
  display: "$99.00",
  basis: "exact_listed_unit",
  priceId: "price_1",
  priceVersion: 1,
  effectiveAt: "2026-08-01T00:00:00.000Z",
  expiresAt: null,
} as const;

function variant(
  overrides: Partial<MasterOfferingVariantView> = {},
): MasterOfferingVariantView {
  return {
    id: "mov_a",
    label: "5 mg vial",
    displayState: "available_now",
    displayLabel: "Available Now",
    price: PRICED,
    action: {
      kind: "request_access",
      label: "Request Access",
      href: "/research/member/product-requests/new?source=products",
    },
    ...overrides,
  };
}

function detail(
  overrides: Partial<MasterOfferingDetailView> = {},
): MasterOfferingDetailView {
  const variants = overrides.variants ?? [variant()];
  return {
    id: "mo_1",
    slug: "research-vials-bpc-157",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    family: "research_vials",
    familyLabel: "Research Vials",
    category: "Peptides & Research",
    subcategory: "Single peptide",
    brand: null,
    displayState: "available_now",
    displayLabel: "Available Now",
    stateExplanation: "Available to request now.",
    copyState: "approved",
    variantCount: variants.length,
    overview: null,
    disclosures: ["Product Control remains the purchase authority."],
    priceSummary: {
      state: "single",
      variantCount: variants.length,
      pricedVariantCount: 1,
      currency: "USD",
      fromCents: 9900,
      toCents: 9900,
      display: "$99.00",
    },
    ...overrides,
    variants,
  };
}

const CAPABILITY: AcceptedExactVariantQuantityCapability = {
  source: "accepted_quantity_policy",
  productId: "pc_product_1",
  variantId: "pc_variant_1",
  minimum: 1,
  maximum: 50,
  aggregateMaximum: 50,
  sourceVersion: "quantity-50",
};

const ADD_TO_CART = {
  kind: "add_to_cart",
  label: "Add to Cart",
  productId: "pc_product_1",
  variantId: "pc_variant_1",
  sku: "XEN-BPC-10",
  amount: { amountCents: 9900, currency: "USD" },
  evaluatedAt: "2026-08-12T12:00:00.000Z",
} as const;

describe("master offering detail", () => {
  it("renders one h1 and exactly one CTA for the selected variant", () => {
    const { host, unmount } = render(
      <MasterOfferingDetail
        product={detail({
          variants: [
            variant(),
            variant({ id: "mov_b", label: "10 mg vial" }),
            variant({ id: "mov_c", label: "20 mg vial" }),
          ],
        })}
      />,
    );
    expect(host.querySelectorAll("h1")).toHaveLength(1);
    expect(host.querySelectorAll('[data-testid="mo-cta"]')).toHaveLength(1);
    expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(3);
    unmount();
  });

  it("gives the variant selector and the CTA names that carry product and variant", () => {
    const { host, unmount } = render(
      <MasterOfferingDetail product={detail()} />,
    );
    expect(
      host.querySelector('input[type="radio"]')?.getAttribute("aria-label"),
    ).toBe("5 mg vial, BPC-157, Available Now");
    expect(
      host.querySelector('[data-testid="mo-cta"]')?.getAttribute("aria-label"),
    ).toBe("Request Access, BPC-157, 5 mg vial");
    unmount();
  });

  it("shows no Add to Cart and no quantity on a planning or request fixture", () => {
    const planning = detail({
      displayState: "planned",
      displayLabel: "Planned",
      variants: [
        variant({
          displayState: "planned",
          displayLabel: "Planned",
          price: MASTER_OFFERING_PRICE_ON_REQUEST,
          action: {
            kind: "get_updates",
            label: "Get Updates",
            href: "/research/member/product-requests/new?source=products",
          },
        }),
      ],
    });
    const { host, unmount } = render(
      <MasterOfferingDetail
        product={planning}
        capabilityFor={() => CAPABILITY}
      />,
    );
    expect(host.textContent).not.toContain("Add to Cart");
    expect(host.querySelector('[data-testid="mo-quantity"]')).toBeNull();
    expect(
      host.querySelector('[data-testid="mo-selected-price"]')?.textContent,
    ).toBe("Price on request");
    unmount();
  });

  it("shows the quantity control only when the capability matches the exact identity", () => {
    const purchasable = detail({
      variants: [variant({ action: ADD_TO_CART })],
    });

    const without = render(<MasterOfferingDetail product={purchasable} />);
    expect(without.host.querySelector('[data-testid="mo-quantity"]')).toBeNull();
    expect(without.host.querySelector('[data-testid="mo-cta"]')?.textContent).toBe(
      "Add to Cart",
    );
    without.unmount();

    const mismatched = render(
      <MasterOfferingDetail
        product={purchasable}
        capabilityFor={() => ({ ...CAPABILITY, variantId: "pc_variant_other" })}
      />,
    );
    expect(
      mismatched.host.querySelector('[data-testid="mo-quantity"]'),
    ).toBeNull();
    mismatched.unmount();

    const matched = render(
      <MasterOfferingDetail
        product={purchasable}
        capabilityFor={() => CAPABILITY}
      />,
    );
    const quantity = matched.host.querySelector<HTMLInputElement>(
      '[data-testid="mo-quantity"]',
    );
    expect(quantity?.getAttribute("min")).toBe("1");
    expect(quantity?.getAttribute("max")).toBe("50");
    expect(quantity?.value).toBe("1");
    matched.unmount();
  });

  it("hands the server action and the chosen quantity back untouched", () => {
    const onAddToCart = vi.fn();
    const { host, unmount } = render(
      <MasterOfferingDetail
        product={detail({ variants: [variant({ action: ADD_TO_CART })] })}
        capabilityFor={() => CAPABILITY}
        onAddToCart={onAddToCart}
      />,
    );
    click(host.querySelector('[data-testid="mo-cta"]'));
    expect(onAddToCart).toHaveBeenCalledWith(ADD_TO_CART, 1);
    unmount();
  });

  it("resets the quantity when the selected variant changes", () => {
    const purchasable = detail({
      variants: [
        variant({ action: ADD_TO_CART }),
        variant({
          id: "mov_b",
          label: "10 mg vial",
          action: { ...ADD_TO_CART, variantId: "pc_variant_2" },
        }),
      ],
    });
    const { host, unmount } = render(
      <MasterOfferingDetail
        product={purchasable}
        capabilityFor={(entry) =>
          entry.id === "mov_a"
            ? CAPABILITY
            : { ...CAPABILITY, variantId: "pc_variant_2", minimum: 2 }
        }
      />,
    );
    const quantity = () =>
      host.querySelector<HTMLInputElement>('[data-testid="mo-quantity"]');
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    const input = quantity();
    if (input) {
      setter?.call(input, "7");
      act(() => input.dispatchEvent(new Event("input", { bubbles: true })));
    }
    expect(quantity()?.value).toBe("7");

    // Click the radio and let jsdom toggle `checked` itself. Assigning
    // `checked` directly desyncs React's value tracker and the change is
    // swallowed, which would make this test pass for the wrong reason.
    click(host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]);
    // The second variant's own minimum, not the seven the buyer typed for the
    // first one.
    expect(quantity()?.value).toBe("2");
    unmount();
  });

  it("states plainly that there is nothing to do when the action is none", () => {
    const { host, unmount } = render(
      <MasterOfferingDetail
        product={detail({
          variants: [
            variant({
              displayState: "unavailable",
              displayLabel: "Unavailable",
              price: MASTER_OFFERING_PRICE_ON_REQUEST,
              action: { kind: "none", label: null, href: null },
            }),
          ],
        })}
      />,
    );
    expect(host.querySelector('[data-testid="mo-cta"]')).toBeNull();
    expect(host.querySelector('[data-testid="mo-no-action"]')).not.toBeNull();
    unmount();
  });

  it("renders every disclosure the server sent", () => {
    const { host, unmount } = render(
      <MasterOfferingDetail
        product={detail({
          disclosures: ["First disclosure.", "Second disclosure."],
        })}
      />,
    );
    const items = Array.from(host.querySelectorAll("li")).map(
      (node) => node.textContent,
    );
    expect(items).toContain("First disclosure.");
    expect(items).toContain("Second disclosure.");
    unmount();
  });

  it("never invents a CTA the server did not send", () => {
    const { host, unmount } = render(
      <MasterOfferingDetail
        product={detail({
          variants: [
            variant({
              action: {
                kind: "request_early_access_purchase",
                label: "Request Early Access Purchase",
                href: "/research/member/product-requests/new?source=products",
              },
            }),
          ],
        })}
      />,
    );
    const cta = host.querySelector('[data-testid="mo-cta"]');
    expect(cta?.textContent).toBe("Request Early Access Purchase");
    expect(cta?.tagName).toBe("A");
    expect(host.querySelectorAll('[data-testid="mo-cta"]')).toHaveLength(1);
    unmount();
  });
});

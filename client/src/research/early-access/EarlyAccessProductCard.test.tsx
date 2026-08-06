// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EarlyAccessProductCard,
  type EarlyAccessAvailabilityState,
  type EarlyAccessCardProduct,
} from "./EarlyAccessProductCard";

/** The canonical fulfillment sentence. It must NOT appear on a card any more. */
const FULFILLMENT =
  "Current fulfillment target: within 72 hours after payment verification and product availability confirmation. Tracking will be provided when the shipment is released.";

let container: HTMLElement | null = null;
let root: Root | null = null;

function render(element: ReactElement): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

function product(overrides: Partial<EarlyAccessCardProduct> = {}): EarlyAccessCardProduct {
  return {
    productId: "prod-clean",
    variantId: "var-10mg",
    name: "Clean Unit",
    strength: "10 mg",
    unitPriceCents: 5_600,
    currency: "USD",
    description: "Lyophilised vial for research use.",
    availability: "AVAILABLE",
    ...overrides,
  };
}

function card(
  overrides: Partial<EarlyAccessCardProduct> = {},
  quantity: 1 | 2 | 3 = 1,
  extra: Partial<Parameters<typeof EarlyAccessProductCard>[0]> = {},
) {
  return render(
    <EarlyAccessProductCard
      product={product(overrides)}
      quantity={quantity}
      onQuantityChange={() => {}}
      onSelect={() => {}}
      {...extra}
    />,
  );
}

function action(el: HTMLElement): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>("[data-testid='early-access-product-card-action']");
}

describe("early access product card", () => {
  it("shows the single unit price and no computed total anywhere", () => {
    // THE RULE THIS FILE EXISTS FOR. The server computes every total. If the card
    // ever multiplies, these numbers appear and the customer is shown a figure
    // they will not be charged.
    const el = card({}, 3);
    const text = el.textContent ?? "";

    expect(text).toContain("$56.00");
    expect(text).toContain("per unit");

    // 5,600 x 3 = 16,800, less 20% = 13,440. None of it may appear.
    expect(text).not.toContain("168.00");
    expect(text).not.toContain("134.40");
    expect(text).not.toContain("$16,800");
    expect(text).not.toContain("$13,440");
  });

  it("never shows supplier, margin, inventory or dispute information", () => {
    const el = card();
    const text = (el.textContent ?? "").toLowerCase();
    for (const forbidden of [
      "supplier",
      "wholesale",
      "cost",
      "margin",
      "in stock",
      "units left",
      "inventory",
      "dispute",
    ]) {
      expect(text, `card leaked "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("no longer repeats the fulfillment sentence per card", () => {
    // The sentence is real and canonical, and it is rendered ONCE at catalogue
    // level by the section. Twenty-two repetitions of it were most of the wall
    // the compact redesign removes.
    const el = card();
    expect(el.textContent).not.toContain(FULFILLMENT);
    expect(el.textContent).not.toContain("Current fulfillment target");
  });

  it("names the bundle offer when three units are chosen, without computing anything", () => {
    const el = card({}, 3);
    expect(el.textContent).toContain("Research Bundle, 20% savings");
    // The offer's NAME, never a figure derived from it.
    expect(el.textContent).not.toContain("134.40");

    const single = card({}, 1);
    expect(single.textContent).not.toContain("Research Bundle");
  });

  it.each([
    ["AVAILABLE", "Available to order", "Add", false],
    [
      "AVAILABILITY_CONFIRMATION_REQUIRED",
      "Availability confirmed by our team before payment",
      "Request availability",
      false,
    ],
    ["TEMPORARILY_HELD", "Temporarily unavailable", "", true],
  ] as ReadonlyArray<[EarlyAccessAvailabilityState, string, string, boolean]>)(
    "renders %s as visible, with its own copy and action",
    (availability, copy, actionLabel, heldWithNoControls) => {
      const el = card({ availability });
      // Visible in every state. A row is never hidden because inventory
      // automation is missing; the customer is told the truth instead.
      expect(el.querySelector("[data-testid='early-access-product-card']")).not.toBeNull();
      expect(el.textContent).toContain(copy);
      const button = action(el);
      if (heldWithNoControls) {
        // A held row carries NO action control. Absent rather than disabled,
        // so the accessibility tree offers nothing to reach for.
        expect(button).toBeNull();
      } else {
        expect(button?.textContent).toBe(actionLabel);
        expect(button?.disabled).toBe(false);
      }
    },
  );

  it("reports a quantity step without acting on it", () => {
    const onQuantityChange = vi.fn();
    const onSelect = vi.fn();
    const el = render(
      <EarlyAccessProductCard
        product={product()}
        quantity={1}
        onQuantityChange={onQuantityChange}
        onSelect={onSelect}
      />,
    );

    const increase = el.querySelector<HTMLButtonElement>(
      "[data-testid='early-access-product-card-quantity-increase']",
    );
    expect(increase).not.toBeNull();
    act(() => {
      increase?.click();
    });

    expect(onQuantityChange).toHaveBeenCalledWith(2);
    // Choosing a quantity is not ordering. The card never submits.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("cannot step the quantity below the minimum or above the maximum", () => {
    const onQuantityChange = vi.fn();
    const atMin = render(
      <EarlyAccessProductCard
        product={product()}
        quantity={1}
        onQuantityChange={onQuantityChange}
        onSelect={() => {}}
      />,
    );
    const decrease = atMin.querySelector<HTMLButtonElement>(
      "[data-testid='early-access-product-card-quantity-decrease']",
    );
    expect(decrease?.disabled).toBe(true);
    act(() => {
      decrease?.click();
    });
    expect(onQuantityChange).not.toHaveBeenCalled();

    const atMax = render(
      <EarlyAccessProductCard
        product={product()}
        quantity={3}
        onQuantityChange={onQuantityChange}
        onSelect={() => {}}
      />,
    );
    const increase = atMax.querySelector<HTMLButtonElement>(
      "[data-testid='early-access-product-card-quantity-increase']",
    );
    expect(increase?.disabled).toBe(true);
    act(() => {
      increase?.click();
    });
    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  it("adds at the chosen quantity and removes when already selected", () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();

    const unselected = render(
      <EarlyAccessProductCard
        product={product()}
        quantity={2}
        onQuantityChange={() => {}}
        onSelect={onSelect}
        onRemove={onRemove}
        selected={false}
      />,
    );
    act(() => {
      action(unselected)?.click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();

    const selected = render(
      <EarlyAccessProductCard
        product={product()}
        quantity={2}
        onQuantityChange={() => {}}
        onSelect={onSelect}
        onRemove={onRemove}
        selected
      />,
    );
    // While selected there is no second Add to double-submit; the one action
    // is Remove, and the state is announced.
    expect(action(selected)).toBeNull();
    expect(selected.textContent).toContain("Added to your order.");
    const remove = selected.querySelector<HTMLButtonElement>(
      "[data-testid='early-access-product-card-remove']",
    );
    expect(remove).not.toBeNull();
    act(() => {
      remove?.click();
    });
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders NO quantity control on a held product", () => {
    // Absent, not disabled. A disabled control is still in the DOM and the
    // accessibility tree, still announces itself, and can be re-enabled from
    // devtools. Absence is the only state that cannot be misread.
    const el = card({ availability: "TEMPORARILY_HELD" });
    expect(el.querySelectorAll("button")).toHaveLength(0);
    expect(el.querySelectorAll("input")).toHaveLength(0);
    expect(el.querySelector("[data-testid='early-access-product-card-quantity']")).toBeNull();
  });

  it("keeps the quantity control on a sellable product", () => {
    // Guards the guard: a change that removed the control everywhere would
    // pass the assertion above while breaking the whole catalogue.
    const el = card({ availability: "AVAILABLE" });
    expect(el.querySelector("[data-testid='early-access-product-card-quantity']")).not.toBeNull();
  });

  it("renders no photography and no empty media placeholder either", () => {
    // No image is safer than a wrong one, and the old aspect-square placeholder
    // was a card-sized blank that made 22 cards read as 22 screens.
    const el = card();
    expect(el.querySelectorAll("img")).toHaveLength(0);
    expect(el.querySelector("[data-testid='early-access-product-card-media']")).toBeNull();
    expect(el.querySelector("[class*='aspect-square']")).toBeNull();
  });
});

describe("the description is the server's, or it is nothing", () => {
  it("renders a server-supplied description verbatim", () => {
    const el = card({ description: "Product information for this item is still being confirmed." });
    expect(
      el.querySelector("[data-testid='early-access-product-card-description']")?.textContent,
    ).toBe("Product information for this item is still being confirmed.");
  });

  it("renders nothing in the description's place when the server sent none", () => {
    // No inferred blurb, no research claim, no copy derived from the product's
    // name. The absence of information renders as absence.
    const el = card({ description: "" });
    expect(el.querySelector("[data-testid='early-access-product-card-description']")).toBeNull();
    expect(el.textContent).not.toContain("Research focus");
  });

  it("does not infer a description from the product name", () => {
    const el = card({ name: "BPC-157", description: "" });
    // The name appears exactly where the name belongs and nowhere else as
    // prose: one heading, plus the accessible labels on the controls.
    const paragraphs = Array.from(el.querySelectorAll("p")).map((p) => p.textContent ?? "");
    for (const text of paragraphs) {
      expect(text, `paragraph invented copy about the product: "${text}"`).not.toContain("BPC-157");
    }
  });
});

describe("a founder-held row, which is how Cagrilintide arrives", () => {
  const held = {
    productId: "PEX-028",
    variantId: "PEX-028-10MG",
    name: "Cagrilintide",
    strength: "10 mg",
    unitPriceCents: null,
    currency: "USD",
    description: "Lyophilised vial for research use.",
    availability: "TEMPORARILY_HELD",
  } as const;

  function heldCard() {
    return render(
      <EarlyAccessProductCard
        product={held}
        quantity={null}
        onQuantityChange={() => {}}
        onSelect={() => {}}
      />,
    );
  }

  it("renders the card, because a hidden product is worse than an unavailable one", () => {
    const el = heldCard();
    expect(el.querySelector("[data-testid='early-access-product-card']")).not.toBeNull();
    expect(el.textContent).toContain("Cagrilintide");
    expect(el.textContent).toContain("10 mg");
  });

  it("shows NO price and no placeholder that could be read as one", () => {
    // RM's words: if the UI shows a price on this row, that IS the defect. A
    // price beside an unavailable unit reads as an offer the customer would be
    // entitled to expect.
    const el = heldCard();
    expect(el.querySelector("[data-testid='early-access-product-card-unit-price']")).toBeNull();
    expect(el.textContent).not.toContain("$");
    expect(el.textContent).not.toContain("per unit");
    expect(el.textContent).toContain("Temporarily unavailable");
    expect(el.textContent).toContain("Not available to order");
  });

  it("offers NO purchase action at all, present or otherwise", () => {
    const el = heldCard();
    // No action control, no quantity control, and no bundle invitation: an
    // offer to order three units of something nobody may order is an offer
    // we could not honour.
    expect(
      el.querySelector("[data-testid='early-access-product-card-action']"),
    ).toBeNull();
    expect(el.querySelectorAll("button")).toHaveLength(0);
    expect(el.querySelectorAll("input")).toHaveLength(0);
    expect(el.textContent).not.toContain("Research Bundle");
  });

  it("leaks no internal blocker text to the customer", () => {
    const el = heldCard();
    const text = (el.textContent ?? "").toUpperCase();
    expect(text).not.toContain("NO_FOUNDER_RELEASE");
    expect(text).not.toContain("BLOCKER");
    expect(text).not.toContain("PRODUCT CONTROL");
  });
});

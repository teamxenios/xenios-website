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

/** The canonical sentence, passed in exactly as the server states it. */
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

function card(overrides: Partial<EarlyAccessCardProduct> = {}, quantity: 1 | 2 | 3 = 1) {
  return render(
    <EarlyAccessProductCard
      product={product(overrides)}
      quantity={quantity}
      onQuantityChange={() => {}}
      onSelect={() => {}}
      fulfillmentTargetCopy={FULFILLMENT}
    />,
  );
}

describe("early access product card", () => {
  it("shows the single unit price and no computed total anywhere", () => {
    // THE RULE THIS FILE EXISTS FOR. The server computes every total. If the card
    // ever multiplies, these numbers appear and the customer is shown a figure
    // they will not be charged.
    const el = card({}, 3);
    const text = el.textContent ?? "";

    expect(text).toContain("$56.00 per unit");

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

  it("renders the fulfillment target exactly as supplied, never a paraphrase", () => {
    const el = card();
    expect(el.textContent).toContain(FULFILLMENT);
    // It is a target. The card must not turn it into a promise.
    const text = (el.textContent ?? "").toLowerCase();
    expect(text).not.toContain("guarantee");
    expect(text).not.toContain("will arrive");
    expect(text).not.toContain("delivered by");
  });

  it("names the bundle offer on the quantity option itself", () => {
    const el = card();
    expect(el.textContent).toContain("3-Unit Research Bundle — 20% savings");
  });

  it.each([
    ["AVAILABLE", "Available to order", "Select", false],
    [
      "AVAILABILITY_CONFIRMATION_REQUIRED",
      "Availability confirmed by our team before payment",
      "Request availability",
      false,
    ],
    ["TEMPORARILY_HELD", "Temporarily unavailable", "Unavailable", true],
  ] as ReadonlyArray<[EarlyAccessAvailabilityState, string, string, boolean]>)(
    "renders %s as visible, with its own copy and action",
    (availability, copy, action, heldWithNoControls) => {
      const el = card({ availability });
      // Visible in every state. A row is never hidden because inventory
      // automation is missing; the customer is told the truth instead.
      expect(el.querySelector("[data-testid='early-access-product-card']")).not.toBeNull();
      expect(el.textContent).toContain(copy);
      const button = el.querySelector<HTMLButtonElement>(
        "[data-testid='early-access-product-card-action']",
      );
      if (heldWithNoControls) {
        // A held row carries NO action control. Absent rather than disabled,
        // so the accessibility tree offers nothing to reach for.
        expect(button).toBeNull();
      } else {
        expect(button?.textContent).toBe(action);
        expect(button?.disabled).toBe(false);
      }
    },
  );

  it("tells a confirmation-required customer before they choose, not after", () => {
    // The whole point of surfacing this state: they learn payment is gated on a
    // human confirmation while they are still deciding.
    const el = card({ availability: "AVAILABILITY_CONFIRMATION_REQUIRED" });
    expect(
      el.querySelector("[data-testid='early-access-product-card-availability-detail']"),
    ).not.toBeNull();
    expect(el.textContent).toContain("before any payment instructions are shown");
  });

  it("does not offer that detail when the product is simply available", () => {
    const el = card({ availability: "AVAILABLE" });
    expect(
      el.querySelector("[data-testid='early-access-product-card-availability-detail']"),
    ).toBeNull();
  });

  it("reports a quantity choice without acting on it", () => {
    const onQuantityChange = vi.fn();
    const onSelect = vi.fn();
    const el = render(
      <EarlyAccessProductCard
        product={product()}
        quantity={1}
        onQuantityChange={onQuantityChange}
        onSelect={onSelect}
        fulfillmentTargetCopy={FULFILLMENT}
      />,
    );

    const three = el.querySelector<HTMLInputElement>("input[value='3']");
    expect(three).not.toBeNull();
    act(() => {
      three?.click();
    });

    expect(onQuantityChange).toHaveBeenCalledWith(3);
    // Choosing a quantity is not ordering. The card never submits.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders NO quantity control on a held product", () => {
    // Absent, not disabled. A disabled control is still in the DOM and the
    // accessibility tree, still announces itself, and can be re-enabled from
    // devtools. Absence is the only state that cannot be misread.
    const el = card({ availability: "TEMPORARILY_HELD" });
    expect(el.querySelectorAll("input[type='radio']")).toHaveLength(0);
    expect(el.querySelector("[data-testid='early-access-product-card-quantity']")).toBeNull();
  });

  it("keeps the quantity control on a sellable product", () => {
    // Guards the guard: a change that removed the control everywhere would
    // pass the assertion above while breaking the whole catalogue.
    const el = card({ availability: "AVAILABLE" });
    expect(
      el.querySelectorAll("input[type='radio']").length,
    ).toBeGreaterThan(0);
  });

  it("shows one placeholder and no product photography", () => {
    // No image is safer than a wrong one: a vial photograph at the wrong
    // strength misrepresents the product.
    const el = card();
    expect(el.querySelectorAll("img")).toHaveLength(0);
    const media = el.querySelector("[data-testid='early-access-product-card-media']");
    expect(media).not.toBeNull();
    expect(media?.getAttribute("aria-hidden")).toBe("true");
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
        fulfillmentTargetCopy={FULFILLMENT}
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
    expect(
      el.querySelector("[data-testid='early-access-product-card-savings']"),
    ).toBeNull();
  });

  it("leaks no internal blocker text to the customer", () => {
    const el = heldCard();
    const text = (el.textContent ?? "").toUpperCase();
    expect(text).not.toContain("NO_FOUNDER_RELEASE");
    expect(text).not.toContain("BLOCKER");
    expect(text).not.toContain("PRODUCT CONTROL");
  });
});

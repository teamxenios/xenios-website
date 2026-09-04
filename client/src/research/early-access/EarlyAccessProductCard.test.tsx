// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EarlyAccessProductCard,
  type EarlyAccessAvailabilityState,
  type EarlyAccessCardProduct,
} from "./EarlyAccessProductCard";
import { ASSISTED_ORDER_CTA_PATH } from "../assisted-order/AssistedOrderCta";
import { resetAssistedOrderConfigCache } from "../assisted-order/api";

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
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function product(overrides: Partial<EarlyAccessCardProduct> = {}): EarlyAccessCardProduct {
  return {
    productId: "prod-clean",
    variantId: "var-10mg",
    name: "Clean Unit",
    category: "Research materials",
    strength: "10 mg",
    unitPriceCents: 5_600,
    currency: "USD",
    description: "Lyophilised vial for research use.",
    availability: "AVAILABLE",
    quantityLimit: 20,
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
    />,
  );
}

describe("early access product card", () => {
  it("shows the canonical category as display copy", () => {
    const el = card({ category: "Specialty research materials" });
    expect(
      el.querySelector("[data-testid='early-access-product-card-category']")?.textContent,
    ).toBe("Specialty research materials");
  });

  it.each([undefined, null, 17, { private: true }, "  ", "Research\nmaterials"])(
    "omits malformed category %s without changing the offer",
    (category) => {
      const el = card({ category: category as unknown as string });
      expect(
        el.querySelector("[data-testid='early-access-product-card-category']"),
      ).toBeNull();
      expect(el.textContent).toContain("$56.00 per unit");
      expect(el.textContent).toContain("Available to order");
      expect(el.textContent).toContain("Select");
    },
  );

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

  it("does NOT repeat the fulfillment sentence, which now appears once per catalogue", () => {
    // It used to render on every card, so a 22-product shelf said it 22 times.
    // The sentence is unchanged and still server-supplied; it moved up to the
    // catalogue section. The card asserting its ABSENCE is what keeps it from
    // silently coming back.
    const el = card();
    expect(el.textContent).not.toContain(FULFILLMENT);
    const text = (el.textContent ?? "").toLowerCase();
    expect(text).not.toContain("guarantee");
    expect(text).not.toContain("will arrive");
    expect(text).not.toContain("delivered by");
  });

  it("names the bundle offer in one readable full-width line, not inside a narrow option", () => {
    // It used to be the LABEL of the third option, which put a nine-word
    // phrase in a one-third-width column of a card in a multi-column grid and
    // wrapped it one character per line on a real desktop. The offer is a
    // fact about the round, not about option three, so it is stated once
    // underneath with the whole card to wrap in. Still no money computed:
    // "20% savings" is the offer's name.
    const el = card();
    expect(el.textContent).toContain("3 units is the Research Bundle, 20% savings");
    expect(el.textContent).not.toContain("3-Unit Research Bundle");
    expect(el.textContent).not.toMatch(/\$\s*\d+\.\d{2}\s*(saved|off|discount)/i);
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
      />,
    );

    // The stepper reports the new quantity, and reports it as a number.
    const increment = el.querySelector<HTMLButtonElement>(
      "[data-testid$='-quantity-increment']",
    );
    expect(increment).not.toBeNull();
    act(() => {
      increment?.click();
    });

    expect(onQuantityChange).toHaveBeenCalledWith(2);
    // Choosing a quantity is not ordering. The card never submits.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders NO quantity control on a held product", () => {
    // Absent, not disabled. A disabled control is still in the DOM and the
    // accessibility tree, still announces itself, and can be re-enabled from
    // devtools. Absence is the only state that cannot be misread.
    const el = card({ availability: "TEMPORARILY_HELD" });
    expect(el.querySelectorAll("input[type='number']")).toHaveLength(0);
    expect(el.querySelector("[data-testid='early-access-product-card-quantity']")).toBeNull();
  });

  it("keeps the quantity control on a sellable product", () => {
    // Guards the guard: a change that removed the control everywhere would
    // pass the assertion above while breaking the whole catalogue.
    const el = card({ availability: "AVAILABLE" });
    const input = el.querySelector<HTMLInputElement>("input[type='number']");
    expect(input).not.toBeNull();
    // And it offers the round's whole band, not a narrower one.
    expect(input?.getAttribute("min")).toBe("1");
    expect(input?.getAttribute("max")).toBe("50");
  });

  it("links an above-limit quantity to the canonical assisted-order route only when enabled", async () => {
    const fetchStub = vi.fn(async () => configResponse(true));
    vi.stubGlobal("fetch", fetchStub);
    const onQuantityChange = vi.fn();
    const el = render(
      <EarlyAccessProductCard
        product={product({ quantityLimit: 20 })}
        quantity={21}
        onQuantityChange={onQuantityChange}
        onSelect={() => {}}
      />,
    );
    await settleConfig();
    const input = el.querySelector<HTMLInputElement>("input[type='number']");
    expect(input?.max).toBe("50");
    expect(el.textContent).toContain("assisted order requests support 1–100 units per exact variant");
    expect(el.textContent).toContain("Featured checkout is currently limited to 50 units");
    expect(el.textContent).toContain("Open assisted ordering");
    expect(el.textContent).not.toContain("Request this order");
    expect(el.textContent).toContain(
      "Reselect the product, exact variant, and quantity in the assisted-order form.",
    );
    expect(el.textContent).not.toMatch(/manual review/i);
    expect(onQuantityChange).not.toHaveBeenCalled();
    const link = el.querySelector<HTMLAnchorElement>(
      "[data-testid='early-access-product-card-action']",
    );
    expect(link?.getAttribute("href")).toBe(ASSISTED_ORDER_CTA_PATH);
    expect(link?.getAttribute("href")).not.toContain("?");
    expect(link?.className).toContain("w-full");
    expect(
      el.querySelector("[data-testid='early-access-product-card-assisted-order']")
        ?.className,
    ).toContain("min-w-0");
    expect(
      el.querySelector("[data-testid='early-access-product-card-assisted-order-reselect']")
        ?.className,
    ).toContain("break-words");
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("removes a direct-checkout selection when its quantity moves into assisted ordering", () => {
    const onQuantityChange = vi.fn();
    const onSelect = vi.fn();
    const el = render(
      <EarlyAccessProductCard
        product={product({ quantityLimit: 20 })}
        quantity={20}
        selected
        onQuantityChange={onQuantityChange}
        onSelect={onSelect}
      />,
    );
    const input = el.querySelector<HTMLInputElement>("input[type='number']");
    if (input === null) throw new Error("quantity input missing");

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "21");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onQuantityChange).toHaveBeenCalledWith(21);
  });

  it("offers no assisted-order link when the capability is disabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => configResponse(false)));
    const el = render(
      <EarlyAccessProductCard
        product={product({ quantityLimit: 20 })}
        quantity={21}
        onQuantityChange={() => {}}
        onSelect={() => {}}
      />,
    );
    await settleConfig();

    expect(el.querySelector(`a[href='${ASSISTED_ORDER_CTA_PATH}']`)).toBeNull();
    expect(el.textContent).toContain("Assisted ordering is temporarily unavailable");
    expect(el.textContent).toContain(
      "Nothing was added to your cart or sent as an order request",
    );
    expect(el.querySelector("a[href='/research/support']")?.textContent).toContain(
      "Contact support",
    );
  });

  it("does not offer a link while capability is still being checked", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const el = render(
      <EarlyAccessProductCard
        product={product({ quantityLimit: 20 })}
        quantity={21}
        onQuantityChange={() => {}}
        onSelect={() => {}}
      />,
    );

    expect(el.querySelector(`a[href='${ASSISTED_ORDER_CTA_PATH}']`)).toBeNull();
    expect(el.textContent).toContain("Checking assisted-order availability");
  });

  it("fails closed to support when the capability check cannot be completed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network unavailable");
    }));
    const el = render(
      <EarlyAccessProductCard
        product={product({ quantityLimit: 20 })}
        quantity={21}
        onQuantityChange={() => {}}
        onSelect={() => {}}
      />,
    );
    await settleConfig();

    expect(el.querySelector(`a[href='${ASSISTED_ORDER_CTA_PATH}']`)).toBeNull();
    expect(el.textContent).toContain("We could not confirm assisted-order availability");
    expect(el.querySelector("a[href='/research/support']")).not.toBeNull();
  });

  it("shows no product photography, and no longer reserves a square for it", () => {
    // No image is safer than a wrong one: a vial photograph at the wrong
    // strength misrepresents the product. That rule is unchanged and is the
    // half of this test that matters.
    const el = card();
    expect(el.querySelectorAll("img")).toHaveLength(0);
    expect(el.querySelectorAll("picture")).toHaveLength(0);
    expect(el.querySelectorAll("svg")).toHaveLength(0);
    // The empty aspect-square placeholder is gone. It displayed nothing and was
    // the largest single contributor to card height, which is what pushed a
    // 22-product catalogue past the fold. Asserting its ABSENCE keeps a
    // decorative box from creeping back in.
    expect(
      el.querySelector("[data-testid='early-access-product-card-media']"),
    ).toBeNull();
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
    quantityLimit: null,
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

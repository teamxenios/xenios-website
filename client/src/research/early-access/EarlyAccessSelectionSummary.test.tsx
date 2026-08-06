// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EarlyAccessSelectionSummary,
  type EarlyAccessSelectionLine,
} from "./EarlyAccessSelectionSummary";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

function line(overrides: Partial<EarlyAccessSelectionLine> = {}): EarlyAccessSelectionLine {
  return {
    variantId: "var-1",
    name: "BPC-157",
    strength: "5 mg",
    quantity: 1,
    unitPriceCents: 3_350,
    currency: "USD",
    ...overrides,
  };
}

describe("the selection summary", () => {
  it("says plainly when nothing is selected, and offers no dead Review button", () => {
    const el = render(<EarlyAccessSelectionSummary lines={[]} onReview={() => {}} />);
    expect(
      el.querySelector("[data-testid='early-access-selection-summary-empty']"),
    ).not.toBeNull();
    expect(el.textContent).toContain("Nothing has been ordered or charged");
    expect(
      el.querySelector("[data-testid='early-access-selection-summary-review']"),
    ).toBeNull();
  });

  it("counts products and units from the selection", () => {
    const el = render(
      <EarlyAccessSelectionSummary
        lines={[line(), line({ variantId: "var-2", name: "NAD+", strength: "1,000 mg", quantity: 2, unitPriceCents: 10_075 })]}
        onReview={() => {}}
      />,
    );
    const count = el.querySelector("[data-testid='early-access-selection-summary-count']");
    expect(count?.textContent).toContain("2 products");
    expect(count?.textContent).toContain("3 units");
  });

  it("derives the estimated subtotal from server unit prices only, and says what it is", () => {
    // 1 x 3,350 + 2 x 10,075 = 23,500 cents. Every input is a server-approved
    // unit price already shown on a card; the label says estimate, before
    // savings, confirmed at review.
    const el = render(
      <EarlyAccessSelectionSummary
        lines={[line(), line({ variantId: "var-2", quantity: 2, unitPriceCents: 10_075 })]}
        onReview={() => {}}
      />,
    );
    expect(
      el.querySelector("[data-testid='early-access-selection-summary-subtotal']")?.textContent,
    ).toBe("$235.00");
    expect(el.textContent).toContain("Estimated subtotal");
    expect(el.textContent).toContain("Before bundle savings");
    expect(el.textContent).toContain("confirmed by Xenios at review");
    expect(el.textContent).toContain("Nothing is ordered or charged");
  });

  it("refuses to sum across mixed currencies rather than inventing a figure", () => {
    const el = render(
      <EarlyAccessSelectionSummary
        lines={[line(), line({ variantId: "var-2", currency: "EUR" })]}
        onReview={() => {}}
      />,
    );
    expect(
      el.querySelector("[data-testid='early-access-selection-summary-subtotal']")?.textContent,
    ).toBe("Confirmed at review");
  });

  it("offers one Review order action and reports the press", () => {
    const onReview = vi.fn();
    const el = render(<EarlyAccessSelectionSummary lines={[line()]} onReview={onReview} />);
    const review = el.querySelector<HTMLButtonElement>(
      "[data-testid='early-access-selection-summary-review']",
    );
    expect(review).not.toBeNull();
    expect(review?.tagName).toBe("BUTTON");
    expect(review?.getAttribute("tabindex")).toBeNull();
    act(() => {
      review?.click();
    });
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("never claims to be the charged amount and never shows a discount figure", () => {
    const el = render(
      <EarlyAccessSelectionSummary
        lines={[line({ quantity: 3, unitPriceCents: 5_600 })]}
        onReview={() => {}}
      />,
    );
    const text = (el.textContent ?? "").toLowerCase();
    // 3 x 5,600 = 16,800; less the bundle 20% would be 13,440. The estimate
    // states the pre-savings sum and NEVER the discounted figure, which is the
    // server's to compute.
    expect(el.textContent).toContain("$168.00");
    expect(el.textContent).not.toContain("134.40");
    expect(text).not.toContain("total due");
    expect(text).not.toContain("you will be charged");
  });
});

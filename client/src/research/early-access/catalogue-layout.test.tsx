// @vitest-environment jsdom
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EarlyAccessCatalogGrid } from "./EarlyAccessCatalogGrid";
import { toCardProducts, type EarlyAccessCatalogRowView } from "./earlyAccessCatalogView";

/**
 * THE LAYOUT REGRESSION THE FOUNDER CAUGHT IN PRODUCTION.
 *
 * A quantity label was wrapping one character per line on a 1440px desktop.
 * The cause was structural rather than cosmetic: the card's quantity control
 * asked for three columns with `sm:grid-cols-3`, and a Tailwind breakpoint
 * measures the VIEWPORT, never the CARD. On a wide screen the rule was
 * satisfied while the card itself was ~300px, so each option got ~85px and
 * the text had nowhere to go.
 *
 * WHAT THESE TESTS CAN AND CANNOT DO. jsdom performs no layout: every
 * getBoundingClientRect here would return zeros, so a test in this file
 * cannot measure a wrap. What it CAN do is pin the structural facts that
 * caused the wrap, so the defect cannot return silently. The measurements
 * live in the handoff and came from a real browser against this build:
 *
 *   1920px  3 per row, 419px cards, no collapsed text, no overflow
 *   1440px  3 per row, 395px cards, bundle note 309px over 2 lines
 *   1024px  2 per row, 434px cards
 *    390px  1 per row, 342px cards, three 44x40 chips, CTA full width,
 *           document scrollWidth === clientWidth (no horizontal overflow)
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

function row(index: number, held = false): EarlyAccessCatalogRowView {
  return {
    productId: `prod-${index}`,
    variantId: `var-${index}`,
    displayName: `Unit ${index}`,
    strength: "10 mg",
    priceCents: held ? null : 5_600,
    currency: "USD",
    description: "A concise factual research description for this compound.",
    availability: held ? "TEMPORARILY_HELD" : "AVAILABLE",
    purchasable: !held,
    quantityLimit: held ? null : 50,
  };
}

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

function grid(count = 6): HTMLElement {
  const { products, dropped } = toCardProducts(
    Array.from({ length: count }, (_, index) => row(index, index % 5 === 4)),
  );
  return render(
    <EarlyAccessCatalogGrid
      products={products}
      dropped={dropped}
      quantities={{}}
      onQuantityChange={() => {}}
      onSelect={() => {}}
    />,
  );
}

describe("the catalogue gives each card usable width", () => {
  it("steps 1 -> 2 -> 3 columns and never asks for a fourth", () => {
    // A fourth column at xl took roughly a quarter of every card's width,
    // which is what squeezed the quantity control. Three is the ceiling.
    const el = grid();
    const className =
      el.querySelector("[data-testid='early-access-catalog']")?.className ?? "";
    expect(className).toContain("sm:grid-cols-2");
    expect(className).toContain("xl:grid-cols-3");
    expect(className).not.toContain("grid-cols-4");
    expect(className).toContain("min-w-0");
  });

  it("keeps every card and its contents shrinkable, so nothing forces sideways scrolling", () => {
    // `min-w-0` is what lets a grid child be narrower than its longest word.
    // Without it a single long compound name widens the whole row and the
    // page scrolls sideways on a phone.
    const el = grid();
    expect(el.querySelector("[data-testid='early-access-catalog']")?.className).toContain(
      "min-w-0",
    );
    for (const card of Array.from(el.querySelectorAll("article"))) {
      expect(card.className).toContain("min-w-0");
    }
  });

  it("gives no card a fixed height, a fixed width, or a hidden overflow", () => {
    // The prohibited escape hatches: they hide a broken layout rather than
    // fixing it, and each one loses content at some width.
    const sources = [
      "EarlyAccessProductCard.tsx",
      "EarlyAccessCatalogGrid.tsx",
      "EarlyAccessQuantitySelector.tsx",
    ].map((file) => readFileSync(path.join(HERE, file), "utf8"));
    for (const source of sources) {
      expect(source).not.toMatch(/overflow-hidden|overflow-x-auto|overflow-x-scroll/);
      expect(source).not.toMatch(/\bh-\[\d+px\]|\bw-\[\d+px\]|\bmax-h-\[\d+px\]/);
      expect(source).not.toMatch(/tracking-\[-?\d/);
      expect(source).not.toMatch(/text-\[\d+px\]/);
      expect(source).not.toMatch(/truncate\b/);
    }
  });
});

describe("the quantity control fits the card it lives in", () => {
  it("renders one fixed-size stepper with real tap targets", () => {
    // The control is a stepper rather than a row of chips because the round
    // now offers twenty quantities and twenty chips would reintroduce, by a
    // different route, the height-and-wrapping failure the chips were built to
    // fix. What must still hold is the rule that caused it: no nested column
    // grid inside a narrow card, ever again.
    const el = grid();
    const card = el.querySelector("[data-testid='early-access-catalog-card-var-0']");
    const stepper = card?.querySelector("[data-testid$='-quantity-stepper']");
    expect(stepper?.className).toContain("flex");
    expect(stepper?.className).not.toContain("grid-cols");

    const controls = Array.from(
      card?.querySelectorAll<HTMLElement>(
        "[data-testid$='-quantity-decrement'],[data-testid$='-quantity-increment']",
      ) ?? [],
    );
    expect(controls).toHaveLength(2);
    for (const control of controls) {
      expect(Number.parseInt(control.style.minWidth, 10)).toBeGreaterThanOrEqual(44);
      expect(Number.parseInt(control.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    }

    const input = card?.querySelector<HTMLInputElement>("[data-testid$='-quantity-input']");
    expect(input?.getAttribute("max")).toBe("50");
    expect(Number.parseInt(String(input?.style.minHeight), 10)).toBeGreaterThanOrEqual(44);
  });

  it("states the bundle offer once, full width, as a sentence", () => {
    const el = grid();
    const card = el.querySelector("[data-testid='early-access-catalog-card-var-0']");
    const note = card?.querySelector("fieldset p");
    expect(note?.textContent).toContain("3 units is the Research Bundle, 20% savings");
    // Not a nine-word phrase crammed into a one-third-width option.
    expect(card?.textContent).not.toContain("3-Unit Research Bundle");
  });

  it("shows the server's whole description, clipping none of it away", () => {
    // It was `line-clamp-2`, which cut the Research Use Only sentence off the
    // bottom of every card. A positioning statement the customer cannot see
    // is not positioning.
    const el = grid();
    const description = el.querySelector(
      "[data-testid='early-access-catalog-card-var-0-description']",
    );
    expect(description?.textContent).toBe(
      "A concise factual research description for this compound.",
    );
    expect(description?.className).not.toContain("line-clamp");
    expect(description?.className).not.toContain("truncate");
    expect(description?.className).toContain("break-words");

    const card = readFileSync(path.join(HERE, "EarlyAccessProductCard.tsx"), "utf8");
    expect(card).not.toContain("line-clamp");
  });

  it("gives a held card no quantity control at all", () => {
    const el = grid();
    const held = el.querySelector("[data-testid='early-access-catalog-card-var-4']");
    expect(held?.getAttribute("data-availability")).toBe("TEMPORARILY_HELD");
    expect(held?.querySelectorAll("input")).toHaveLength(0);
    expect(held?.querySelectorAll("button")).toHaveLength(0);
    expect(held?.textContent).not.toContain("$");
  });
});

describe("the layout repair introduced no client money arithmetic", () => {
  it("computes nothing from price and quantity anywhere in the card stack", () => {
    const sources = [
      "EarlyAccessProductCard.tsx",
      "EarlyAccessCatalogGrid.tsx",
      "EarlyAccessQuantitySelector.tsx",
      "EarlyAccessCatalogSection.tsx",
    ].map((file) => ({ file, text: readFileSync(path.join(HERE, file), "utf8") }));
    for (const { file, text } of sources) {
      // No multiplication or summation involving a price or a quantity.
      expect(text, `${file} multiplies`).not.toMatch(
        /(unitPriceCents|priceCents|quantity)\s*\*|\*\s*(unitPriceCents|priceCents|quantity)/,
      );
      expect(text, `${file} reduces to a total`).not.toMatch(
        /\.reduce\([^)]*(?:price|total|cents)/i,
      );
      expect(text, `${file} names a client-side total`).not.toMatch(
        /\b(subtotalCents|payableTotalCents|discountCents)\s*=/,
      );
    }
  });

  it("renders exactly one money figure per available card: the server's unit price", () => {
    const el = grid();
    const card = el.querySelector("[data-testid='early-access-catalog-card-var-0']");
    const amounts = (card?.textContent ?? "").match(/\$[\d,]+\.\d{2}/g) ?? [];
    expect(amounts).toEqual(["$56.00"]);
    expect(card?.textContent).toContain("per unit");
  });
});

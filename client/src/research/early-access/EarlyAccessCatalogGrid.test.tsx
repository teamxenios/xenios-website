// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EarlyAccessCatalogGrid } from "./EarlyAccessCatalogGrid";
import { toCardProducts, type EarlyAccessCatalogRowView } from "./earlyAccessCatalogView";

const FULFILLMENT =
  "Current fulfillment target: within 72 hours after payment verification and product availability confirmation. Tracking will be provided when the shipment is released.";

/** The 22 approved rows, exactly as the founder priced them. */
const APPROVED: ReadonlyArray<readonly [string, string, number]> = [
  ["AOD-9604", "5 mg", 5_600],
  ["BPC-157", "5 mg", 3_350],
  ["BPC-157", "10 mg", 4_750],
  ["Cagrilintide", "10 mg", 14_000],
  ["DSIP", "10 mg", 7_000],
  ["GHK-Cu", "50 mg", 2_250],
  ["GHK-Cu", "100 mg", 4_200],
  ["Hexarelin", "10 mg", 8_400],
  ["Ipamorelin", "10 mg", 4_750],
  ["Kisspeptin", "10 mg", 7_000],
  ["KPV", "10 mg", 5_050],
  ["L-Glutathione", "500 mg", 4_475],
  ["MOTS-c", "10 mg", 4_475],
  ["NAD+", "500 mg", 7_000],
  ["NAD+", "1,000 mg", 10_075],
  ["Oxytocin", "5 mg", 4_475],
  ["PT-141", "10 mg", 3_925],
  ["Selank", "10 mg", 5_325],
  ["Semax", "10 mg", 5_325],
  ["Sermorelin", "5 mg", 5_050],
  ["Tesamorelin", "10 mg", 10_650],
  ["Thymosin Alpha 1", "10 mg", 10_650],
];

/** Held per the founder's list: disputes and nonwaivable blockers. */
const HELD = new Set(["Cagrilintide 10 mg", "MOTS-c 10 mg", "NAD+ 500 mg"]);

function approvedRows(): EarlyAccessCatalogRowView[] {
  return APPROVED.map(([name, strength, priceCents], index) => {
    const held = HELD.has(`${name} ${strength}`);
    return {
      productId: `prod-${index}`,
      variantId: `var-${index}`,
      displayName: name,
      strength,
      priceCents,
      currency: "USD",
      description: "Lyophilised vial for research use.",
      availability: "available",
      purchasable: !held,
      blockers: held ? ["nonwaivable_hold"] : [],
      supplierReady: true,
    };
  });
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

function grid(rows: EarlyAccessCatalogRowView[], onSelect = vi.fn()) {
  const { products, dropped } = toCardProducts(rows);
  const el = render(
    <EarlyAccessCatalogGrid
      products={products}
      dropped={dropped}
      quantities={{}}
      onQuantityChange={() => {}}
      onSelect={onSelect}
      fulfillmentTargetCopy={FULFILLMENT}
    />,
  );
  return { el, products, dropped, onSelect };
}

describe("early access catalogue grid", () => {
  it("renders all 22 approved rows, including the held ones", () => {
    // The visible count is NOT the purchasable count. A customer who was told
    // about a product and cannot find it assumes the site is broken.
    const { el, dropped } = grid(approvedRows());
    expect(dropped).toBe(0);
    expect(el.querySelectorAll("article")).toHaveLength(22);
    expect(
      el.querySelector("[data-testid='early-access-catalog']")?.getAttribute("data-row-count"),
    ).toBe("22");
  });

  it("shows every approved product name and strength pair", () => {
    const { el } = grid(approvedRows());
    const text = el.textContent ?? "";
    for (const [name, strength] of APPROVED) {
      expect(text, `missing ${name} ${strength}`).toContain(name);
      expect(text).toContain(strength);
    }
  });

  it("marks the held rows held and leaves the rest orderable", () => {
    const { el } = grid(approvedRows());
    const held = el.querySelectorAll("[data-availability='TEMPORARILY_HELD']");
    const available = el.querySelectorAll("[data-availability='AVAILABLE']");
    expect(held).toHaveLength(HELD.size);
    expect(available).toHaveLength(22 - HELD.size);
  });

  it("disables the action on a held row and leaves it enabled elsewhere", () => {
    const { el } = grid(approvedRows());
    const heldCard = el.querySelector("[data-availability='TEMPORARILY_HELD']");
    const heldButton = heldCard?.querySelector("button");
    expect(heldButton?.disabled).toBe(true);

    const availableCard = el.querySelector("[data-availability='AVAILABLE']");
    expect(availableCard?.querySelector("button")?.disabled).toBe(false);
  });

  it("shows the single unit price and never a computed bundle total", () => {
    const { el } = grid(approvedRows());
    const text = el.textContent ?? "";
    expect(text).toContain("$56.00 per unit");
    expect(text).toContain("$140.00 per unit");
    // 14,000 x 3 = 42,000, less 20% = 33,600. Neither may appear.
    expect(text).not.toContain("420.00");
    expect(text).not.toContain("336.00");
  });

  it("surfaces dropped rows rather than quietly shortening the catalogue", () => {
    // This is exactly how 22 becomes 21 without anyone noticing.
    const rows = approvedRows();
    rows[4] = { ...rows[4], priceCents: 0 };
    const { el, products, dropped } = grid(rows);
    expect(products).toHaveLength(21);
    expect(dropped).toBe(1);
    expect(el.querySelector("[data-testid='early-access-catalog-dropped']")?.textContent).toContain(
      "1 product is",
    );
  });

  it("states an empty catalogue plainly instead of dressing it up", () => {
    const { el } = grid([]);
    const empty = el.querySelector("[data-testid='early-access-catalog-empty']");
    expect(empty).not.toBeNull();
    const text = (empty?.textContent ?? "").toLowerCase();
    expect(text).toContain("nothing has been charged");
    expect(text).not.toContain("coming soon");
  });

  it("reports a selection with the product that was chosen", () => {
    const onSelect = vi.fn();
    const { el } = grid(approvedRows(), onSelect);
    const first = el.querySelector<HTMLButtonElement>(
      "[data-availability='AVAILABLE'] button",
    );
    act(() => {
      first?.click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ name: "AOD-9604", unitPriceCents: 5_600 });
  });

  it("leaks no supplier, cost, margin, inventory or dispute wording anywhere", () => {
    const { el } = grid(approvedRows());
    const text = (el.textContent ?? "").toLowerCase();
    for (const forbidden of ["supplier", "wholesale", "margin", "in stock", "inventory", "dispute"]) {
      expect(text, `catalogue leaked "${forbidden}"`).not.toContain(forbidden);
    }
  });
});

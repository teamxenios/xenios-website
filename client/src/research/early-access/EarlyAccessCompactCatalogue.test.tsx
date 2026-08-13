// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { EarlyAccessCatalogSection } from "./EarlyAccessCatalogSection";
import type { EarlyAccessCardProduct } from "./EarlyAccessProductCard";
import type { EarlyAccessCatalogLoad } from "../adapters/earlyAccessCatalog";

/**
 * The compact catalogue, tested against the SHAPE PRODUCTION SERVES.
 *
 * The fixture is 22 units, 18 available and 4 held, because that is what the
 * live catalogue returns today. The four held units are the three strength
 * disputes plus founder-held Cagrilintide, and NAD+ 1000 mg carries the real
 * 10075. Numbers that match production are what make a count assertion mean
 * something: a fixture of three tidy rows would pass every test here and prove
 * nothing about the page a customer opens.
 *
 * Nothing in this file asserts a layout measurement. It asserts what is
 * PRESENT and ABSENT, which is what survives a design change.
 */

const FULFILLMENT =
  "Current fulfillment target: within 72 hours after payment verification and product availability confirmation.";

function unit(
  overrides: Partial<EarlyAccessCardProduct> & { variantId: string },
): EarlyAccessCardProduct {
  return {
    productId: `P-${overrides.variantId}`,
    name: `Product ${overrides.variantId}`,
    strength: "10 mg",
    unitPriceCents: 5000,
    currency: "USD",
    description: "Product information for this item is still being confirmed.",
    availability: "AVAILABLE",
    quantityLimit: 50,
    ...overrides,
  };
}

/** 18 available + 4 held = the live 22. */
function openingSet(): EarlyAccessCardProduct[] {
  const available: EarlyAccessCardProduct[] = [];
  for (let i = 1; i <= 17; i += 1) {
    available.push(unit({ variantId: `AVAIL-${i}` }));
  }
  available.push(
    unit({
      variantId: "R360-NAD-1000MG-VIAL",
      name: "NAD+ Research Material",
      strength: "1000 mg",
      unitPriceCents: 10_075,
    }),
  );

  const held: EarlyAccessCardProduct[] = [
    unit({
      variantId: "R360-CAGRILINTIDE-10MG-VIAL",
      name: "Cagrilintide",
      unitPriceCents: null,
      availability: "TEMPORARILY_HELD",
    }),
    unit({ variantId: "R360-TESAMORELIN-10MG-VIAL", unitPriceCents: null, availability: "TEMPORARILY_HELD" }),
    // Same product as the 1000 mg, different strength: in production both are
    // PEP-009 NAD+, and only the 500 mg carries the strength dispute. Search
    // must therefore return both when the customer types the product name.
    unit({
      variantId: "R360-NAD-500MG-VIAL",
      name: "NAD+ Research Material",
      strength: "500 mg",
      unitPriceCents: null,
      availability: "TEMPORARILY_HELD",
    }),
    unit({ variantId: "R360-MOTSC-10MG-VIAL", unitPriceCents: null, availability: "TEMPORARILY_HELD" }),
  ];

  return [...available, ...held];
}

function okLoad(products = openingSet()): EarlyAccessCatalogLoad {
  return { kind: "ok", products, dropped: 0, received: products.length };
}

async function mount(load: () => Promise<EarlyAccessCatalogLoad>) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<EarlyAccessCatalogSection fulfillmentTargetCopy={FULFILLMENT} load={load} />);
  });
  return host;
}

const q = (host: HTMLElement, id: string) =>
  host.querySelector(`[data-testid='early-access-catalog-section-${id}']`);

// `article` scopes this to CARDS. Every child of a card inherits the card's
// testid as a prefix, so a bare prefix selector counts the whole subtree.
const cards = (host: HTMLElement) =>
  host.querySelectorAll("article[data-testid^='early-access-catalog-card-']");

function click(el: Element | null) {
  act(() => {
    (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function type(el: Element | null, value: string) {
  const input = el as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("the compact catalogue serves the live opening set", () => {
  it("renders all 22 units the server sent", async () => {
    const host = await mount(async () => okLoad());
    expect(cards(host)).toHaveLength(22);
  });

  it("counts 22 / 18 / 4 on the filters, from the server state alone", async () => {
    const host = await mount(async () => okLoad());
    expect(q(host, "filter-all")?.textContent).toContain("22");
    expect(q(host, "filter-available")?.textContent).toContain("18");
    expect(q(host, "filter-held")?.textContent).toContain("4");
  });

  it("shows the fulfillment sentence EXACTLY ONCE for the whole catalogue", async () => {
    // It used to render per card, so 22 products said it 22 times.
    const host = await mount(async () => okLoad());
    const occurrences = (host.textContent ?? "").split(FULFILLMENT).length - 1;
    expect(occurrences).toBe(1);
  });
});

describe("filters read the server's availability and never recompute it", () => {
  it("Available shows the 18 the server marked purchasable", async () => {
    const host = await mount(async () => okLoad());
    click(q(host, "filter-available"));
    expect(cards(host)).toHaveLength(18);
  });

  it("Held shows the 4, including founder-held Cagrilintide", async () => {
    const host = await mount(async () => okLoad());
    click(q(host, "filter-held"));
    expect(cards(host)).toHaveLength(4);
    expect(host.textContent).toContain("Cagrilintide");
  });

  it("treats a unit the server held as held even if it carries a price", async () => {
    // The proof there is no second eligibility rule here. A held unit with a
    // price is a contradiction the SERVER owns; the browser must not "correct"
    // it into something purchasable.
    const contradictory = openingSet().map((product) =>
      product.variantId === "R360-CAGRILINTIDE-10MG-VIAL"
        ? { ...product, unitPriceCents: 9_900 }
        : product,
    );
    const host = await mount(async () => okLoad(contradictory));
    click(q(host, "filter-available"));
    expect(cards(host)).toHaveLength(18);
    expect(host.textContent).not.toContain("Cagrilintide");
  });
});

describe("search runs over what the server already sent", () => {
  it("filters the rendered units", async () => {
    const host = await mount(async () => okLoad());
    type(q(host, "search"), "NAD+");
    expect(cards(host)).toHaveLength(2); // 1000 mg available, 500 mg held
  });

  it("does NOT refetch the catalogue while typing", async () => {
    const load = vi.fn(async () => okLoad());
    const host = await mount(load);
    expect(load).toHaveBeenCalledTimes(1);
    type(q(host, "search"), "NAD");
    type(q(host, "search"), "NAD+ 1000");
    // A search box that re-queried would let keystrokes shape a server request.
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("says so explicitly when nothing matches, rather than showing a bare grid", async () => {
    const host = await mount(async () => okLoad());
    type(q(host, "search"), "zzzz-no-such-product");
    expect(cards(host)).toHaveLength(0);
    expect(q(host, "no-matches")?.textContent).toContain("No products match this search.");
  });
});

describe("a held card offers nothing to buy", () => {
  const held = (host: HTMLElement) =>
    host.querySelector(
      "[data-testid='early-access-catalog-card-R360-CAGRILINTIDE-10MG-VIAL']",
    ) as HTMLElement;

  it("shows no price", async () => {
    const host = await mount(async () => okLoad());
    const el = held(host);
    expect(el.querySelector("[data-testid$='-unit-price']")).toBeNull();
    expect(el.textContent).not.toMatch(/\$\d/);
  });

  it("shows no quantity control", async () => {
    const host = await mount(async () => okLoad());
    expect(held(host).querySelector("[data-testid$='-quantity']")).toBeNull();
  });

  it("shows no purchase action, not even a disabled one", async () => {
    const host = await mount(async () => okLoad());
    expect(held(host).querySelector("[data-testid$='-action']")).toBeNull();
    expect(held(host).querySelectorAll("button")).toHaveLength(0);
  });
});

describe("an available card sells only what the server priced", () => {
  const nad = (host: HTMLElement) =>
    host.querySelector(
      "[data-testid='early-access-catalog-card-R360-NAD-1000MG-VIAL']",
    ) as HTMLElement;

  it("shows NAD+ 1000 mg at the server's 10075", async () => {
    const host = await mount(async () => okLoad());
    expect(nad(host).textContent).toContain("$100.75");
  });

  it("can be selected and removed, and the bar counts it", async () => {
    const host = await mount(async () => okLoad());
    expect(q(host, "selection")).toBeNull();

    click(nad(host).querySelector("[data-testid$='-action']"));
    expect(q(host, "selection")?.getAttribute("data-selected-count")).toBe("1");

    click(nad(host).querySelector("[data-testid$='-action']"));
    expect(q(host, "selection")).toBeNull();
  });

  it("the selection bar states a COUNT and never a computed total", async () => {
    // The browser does not multiply a price by a quantity, so it shows no
    // money at all here. The order summary renders the server's figures.
    const host = await mount(async () => okLoad());
    click(nad(host).querySelector("[data-testid$='-action']"));
    const bar = q(host, "selection") as HTMLElement;
    expect(bar.textContent).toContain("1 product selected");
    expect(bar.textContent).not.toMatch(/\$\d/);
  });
});

describe("product descriptions stay the server's", () => {
  it("renders exactly what the server sent", async () => {
    const host = await mount(async () => okLoad());
    expect(host.textContent).toContain(
      "Product information for this item is still being confirmed.",
    );
  });

  it("renders NOTHING when the server sent an empty description", async () => {
    // The failure this guards is a helpful-looking authored fallback. An
    // unknown must stay unknown: the client states no product fact the server
    // did not.
    const blank = openingSet().map((product) => ({ ...product, description: "" }));
    const host = await mount(async () => okLoad(blank));
    expect(host.querySelector("[data-testid$='-description']")).toBeNull();
    // Scoped to the CARD, because the quantity selector legitimately says
    // "vial" and the fulfillment sentence is server-supplied. What must not
    // appear is an authored sentence standing in for a description.
    const card = host.querySelector("article[data-testid^='early-access-catalog-card-']");
    expect(card?.querySelector("[data-testid$='-description']")).toBeNull();
    expect(card?.textContent ?? "").not.toContain("still being confirmed");
  });
});

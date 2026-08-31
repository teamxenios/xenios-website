// @vitest-environment jsdom
// The catalog grid's four honest states, rendered through real React, plus the
// two display invariants that matter most on a card: a peptide never shows a
// number, and no amount anywhere can render as zero.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { DisplayProductCard } from "@shared/research/catalog-display/contract";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { CatalogGrid } from "./CatalogGrid";
import {
  CATALOG_EMPTY_COPY,
  CATALOG_ERROR_COPY,
  CATALOG_LOADING_COPY,
  PEPTIDE_PRICE_PENDING_COPY,
} from "./labels";
import { PRICE_UNAVAILABLE_COPY } from "../pricing/format";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(node: ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container!;
}

function peptideCard(overrides: Partial<DisplayProductCard> = {}): DisplayProductCard {
  return {
    lane: "peptide",
    slug: "bpc-157-tb-500-15-15",
    displayName: "BPC-157 + TB-500 Research Blend",
    canonicalName: "BPC-157 and TB-500",
    category: "Blend",
    brand: null,
    collections: [],
    availability: "APPROVAL_REQUIRED_PURCHASE",
    price: null,
    variantCount: 2,
    positioning: "The recovery pairing members ask for by name.",
    ...overrides,
  };
}

function supplementCard(overrides: Partial<DisplayProductCard> = {}): DisplayProductCard {
  return {
    lane: "supplement",
    slug: "longevity-essentials-nad-plus",
    displayName: "Longevity Essentials NAD+",
    canonicalName: "Longevity Essentials NAD+",
    category: "longevity",
    brand: "Fixture Supplier 3",
    collections: ["mitochondrial-longevity"],
    availability: "APPROVAL_REQUIRED_PURCHASE",
    price: { amountCents: 8900, currency: "USD" },
    variantCount: 0,
    positioning: null,
    ...overrides,
  };
}

describe("CatalogGrid states", () => {
  it("renders a status region while loading, with no product and no number", () => {
    const dom = render(<CatalogGrid loading />);
    const status = dom.querySelector('[data-testid="catalog-grid-loading"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute("role")).toBe("status");
    expect(dom.textContent).toContain(CATALOG_LOADING_COPY);
    expect(dom.querySelector('[data-testid="catalog-grid-list"]')).toBeNull();
    expect(dom.textContent).not.toMatch(/\$\d/);
  });

  it("renders an alert on error, never a raw error string", () => {
    const dom = render(<CatalogGrid error />);
    const alert = dom.querySelector('[data-testid="catalog-grid-error"]');
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toBe(CATALOG_ERROR_COPY);
    expect(dom.querySelector('[data-testid="catalog-grid-list"]')).toBeNull();
  });

  it("explains an empty catalog instead of showing nothing", () => {
    const dom = render(<CatalogGrid products={[]} />);
    expect(dom.querySelector('[data-testid="catalog-grid-empty"]')?.textContent).toBe(
      CATALOG_EMPTY_COPY,
    );
  });

  it("renders a labelled section and a real list of cards", () => {
    const dom = render(<CatalogGrid products={[peptideCard(), supplementCard()]} />);
    const section = dom.querySelector('[data-testid="catalog-grid"]');
    const headingId = section?.getAttribute("aria-labelledby");
    expect(headingId).toBeTruthy();
    expect(dom.querySelector(`#${headingId}`)?.textContent).toBe("Research catalog");
    const list = dom.querySelector('[data-testid="catalog-grid-list"]');
    expect(list?.tagName).toBe("UL");
    expect(list?.querySelectorAll("li")).toHaveLength(2);
    expect(dom.querySelectorAll("h3")).toHaveLength(2);
  });

  it("names the breadth so a viewer knows which set they are on", () => {
    const wide = render(<CatalogGrid products={[supplementCard()]} breadth="full" />);
    expect(wide.querySelector('[data-testid="catalog-grid-breadth"]')?.textContent).toContain(
      "full catalog",
    );
    act(() => root!.unmount());
    root = null;
    container?.remove();

    const narrow = render(<CatalogGrid products={[supplementCard()]} breadth="standard" />);
    expect(narrow.querySelector('[data-testid="catalog-grid-breadth"]')?.textContent).toContain(
      "available to your account",
    );
  });
});

describe("CatalogGrid truthfulness", () => {
  it("shows the offer mode label in words, not by colour alone", () => {
    const dom = render(
      <CatalogGrid
        products={[
          peptideCard({ availability: "REQUEST_ACCESS_ONLY" }),
          supplementCard({ slug: "s2", availability: "APPROVAL_REQUIRED_PURCHASE" }),
        ]}
      />,
    );
    const badges = Array.from(dom.querySelectorAll('[data-testid$="-availability-text"]')).map(
      (node) => node.textContent,
    );
    expect(badges).toEqual(["Request access", "Available by approval"]);
    // The accessible prefix is present, so the words are never a bare fragment.
    expect(dom.textContent).toContain("Availability: ");
  });

  it("says why a peptide has no amount, and shows no number for it", () => {
    const dom = render(<CatalogGrid products={[peptideCard()]} />);
    const card = dom.querySelector(
      '[data-testid="catalog-grid-card-peptide-bpc-157-tb-500-15-15"]',
    );
    expect(card?.textContent).toContain(PEPTIDE_PRICE_PENDING_COPY);
    expect(card?.textContent).not.toMatch(/\$\d/);
  });

  it("shows a founder approved supplement amount, formatted exactly", () => {
    const dom = render(<CatalogGrid products={[supplementCard()]} />);
    const value = dom.querySelector(
      '[data-testid="catalog-grid-card-supplement-longevity-essentials-nad-plus-amount-value"]',
    );
    expect(value?.textContent).toBe("$89.00");
    expect(value?.getAttribute("aria-label")).toBe("Price: $89.00 for members");
  });

  it("renders the unavailable copy rather than a zero, for every impossible amount", () => {
    for (const amountCents of [0, -100, 12.5, Number.NaN]) {
      const dom = render(
        <CatalogGrid
          products={[supplementCard({ price: { amountCents, currency: "USD" } as never })]}
        />,
      );
      expect(dom.textContent, String(amountCents)).toContain(PRICE_UNAVAILABLE_COPY);
      expect(dom.textContent, String(amountCents)).not.toContain("$0.00");
      expect(dom.textContent, String(amountCents)).not.toMatch(/\$-/);
      act(() => root!.unmount());
      container?.remove();
      root = null;
      container = null;
    }
  });

  it("shows no amount where the record carries none", () => {
    const dom = render(<CatalogGrid products={[supplementCard({ price: null })]} />);
    expect(dom.textContent).toContain(PRICE_UNAVAILABLE_COPY);
    expect(dom.textContent).not.toMatch(/\$\d/);
  });

  it("gives every card action an accessible name that includes its product", () => {
    const selected: string[] = [];
    const dom = render(
      <CatalogGrid
        products={[peptideCard(), supplementCard()]}
        onSelect={(product) => selected.push(product.slug)}
      />,
    );
    const buttons = Array.from(dom.querySelectorAll("button"));
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe("View BPC-157 + TB-500 Research Blend");
    expect(buttons[0].getAttribute("type")).toBe("button");
    act(() => {
      buttons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(selected).toEqual(["bpc-157-tb-500-15-15"]);
  });

  it("omits the action entirely when there is nowhere to go", () => {
    const dom = render(<CatalogGrid products={[peptideCard()]} />);
    expect(dom.querySelectorAll("button")).toHaveLength(0);
  });

  it("sets no absolute width anywhere, so it survives a 320px viewport", () => {
    // Fractional and character based widths (w-2/3, max-w-[68ch]) are fluid and
    // are fine. A pixel width or a fixed spacing scale width is not: those are
    // what break a narrow viewport and a large zoom.
    // min-w-0 is the opposite of a fixed width: it is what lets a grid child
    // shrink instead of overflowing. A decorative aria-hidden mark may carry a
    // fixed size, because it holds no meaning to lose.
    const absolute = /^(w|min-w|max-w)-(\d+(\.\d+)?|\[[^\]]*(px|rem|vw)\])$/;
    const dom = render(<CatalogGrid products={[peptideCard(), supplementCard()]} />);
    const offenders: string[] = [];
    for (const node of Array.from(dom.querySelectorAll<HTMLElement>("*"))) {
      if (node.getAttribute("aria-hidden") === "true") continue;
      const classes = node.getAttribute("class");
      if (!classes) continue;
      for (const token of classes.split(/\s+/)) {
        if (token === "min-w-0") continue;
        if (absolute.test(token)) offenders.push(token);
      }
    }
    expect(offenders).toEqual([]);
  });
});

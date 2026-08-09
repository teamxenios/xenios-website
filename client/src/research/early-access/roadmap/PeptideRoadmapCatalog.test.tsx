// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PeptideRoadmapCard } from "@shared/research/early-access-roadmap";
import { PeptideRoadmapCatalog } from "./PeptideRoadmapCatalog";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
  act(() => root!.render(node));
  return container;
}

function card(overrides: Partial<PeptideRoadmapCard> = {}): PeptideRoadmapCard {
  return {
    catalogId: "ROADMAP-1",
    displayName: "BPC-157 Research Material",
    strength: "10 mg",
    family: "Research peptide / material",
    format: "Vial",
    roadmapStage: "coming_soon",
    liveCommerce: "unavailable",
    displayStatus: "request_access",
    addToCart: null,
    priceDisplay: null,
    ...overrides,
  };
}

describe("PeptideRoadmapCatalog", () => {
  it("renders truthful loading, error, and empty states", () => {
    expect(render(<PeptideRoadmapCatalog loading />).textContent).toContain("Loading");
    act(() => root!.render(<PeptideRoadmapCatalog error />));
    expect(container!.textContent).toContain("No purchase controls are shown");
    act(() => root!.render(<PeptideRoadmapCatalog cards={[]} />));
    expect(container!.textContent).toContain("being prepared");
  });

  it("never renders Add or a price for roadmap-only cards", () => {
    const dom = render(
      <PeptideRoadmapCatalog
        cards={[
          card({
            roadmapStage: "this_week",
            displayStatus: "available_this_week",
          }),
        ]}
      />,
    );
    expect(dom.textContent).toContain("Available this week");
    expect(dom.textContent).toContain("No live price or purchase action");
    expect(dom.querySelector("button")).toBeNull();
  });

  it("passes only the live authority to Add to cart", () => {
    const onAdd = vi.fn();
    const live = card({
      liveCommerce: "purchasable",
      displayStatus: "available_now",
      addToCart: {
        productId: "LIVE-PRODUCT",
        variantId: "LIVE-VARIANT",
        unitPriceCents: 12_345,
        currency: "USD",
      },
      priceDisplay: "$123.45",
    });
    const dom = render(<PeptideRoadmapCatalog cards={[live]} onAdd={onAdd} />);
    const button = dom.querySelector("button")!;
    expect(button.textContent).toBe("Add to cart");
    expect(dom.textContent).toContain("$123.45");
    act(() => button.click());
    expect(onAdd).toHaveBeenCalledWith(live.addToCart, live);
  });

  it("searches and filters without changing card authority", () => {
    const dom = render(
      <PeptideRoadmapCatalog
        cards={[
          card(),
          card({
            catalogId: "ROADMAP-2",
            displayName: "NAD+ Research Material",
            strength: "500 mg",
            displayStatus: "planned",
            roadmapStage: "planned",
          }),
        ]}
      />,
    );
    const input = dom.querySelector("input[type=search]") as HTMLInputElement;
    const setInputValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      setInputValue.call(input, "nad");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(dom.textContent).toContain("NAD+");
    expect(dom.textContent).not.toContain("BPC-157");

    act(() => {
      setInputValue.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const select = dom.querySelector("select") as HTMLSelectElement;
    act(() => {
      select.value = "planned";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(dom.textContent).toContain("NAD+");
    expect(dom.textContent).not.toContain("BPC-157");
  });

  it("renders in bounded pages for the 143-variant catalog", () => {
    const dom = render(
      <PeptideRoadmapCatalog
        pageSize={1}
        cards={[card(), card({ catalogId: "ROADMAP-2", displayName: "Second" })]}
      />,
    );
    expect(dom.querySelectorAll("article")).toHaveLength(1);
    const more = Array.from(dom.querySelectorAll("button")).find(
      (button) => button.textContent === "Load more variants",
    )!;
    act(() => more.click());
    expect(dom.querySelectorAll("article")).toHaveLength(2);
  });
});

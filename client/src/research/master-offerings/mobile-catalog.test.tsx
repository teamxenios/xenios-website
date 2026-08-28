// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { FullCatalogPage } from "./FullCatalogPage";
import { ACTIONS, ADD_TO_CART, card, click, page, render, setViewportWidth, variant } from "./catalog-test-fixtures";

/**
 * The catalog on a phone.
 *
 * jsdom lays nothing out, so these tests hold the STRUCTURE a 375px viewport
 * depends on: the filter fields collapse behind a toggle that says what it
 * hides, every filter that is active is visible as a chip even while the
 * fields are collapsed, every interactive target carries the 44px floor, and
 * no long token is allowed to widen a row. The measured browser procedure
 * lives in docs/research/CATALOG_CLIENT_STATE.md; this is the guard on it.
 */

const LONG = "BPC157TB500ExtendedReleaseCompoundedResearchBlendMultiDoseVial";

const FACETS = {
  families: [{ value: "research_vials" as const, label: "Research Vials", count: 1 }],
  states: [],
  categories: [{ value: "peptides-research", label: "Peptides & Research", count: 1 }],
};

describe("mobile catalog", () => {
  it("collapses the filter fields behind a labelled toggle, and the toggle states the active count", () => {
    setViewportWidth(375);
    const { host, unmount } = render(
      <FullCatalogPage
        query={{ families: ["research_vials"], categories: ["peptides-research"] }}
        page={page({ facets: FACETS })}
        onQueryChange={vi.fn()}
      />,
    );
    const toggle = host.querySelector<HTMLButtonElement>('[data-testid="mo-filter-toggle"]');
    const fields = host.querySelector("#mo-catalog-filter-fields");
    expect(toggle?.getAttribute("aria-controls")).toBe("mo-catalog-filter-fields");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.textContent).toBe("Show filters (2 active)");
    expect(fields?.className).toContain("hidden");
    expect(fields?.className).toContain("md:grid");
    expect(toggle?.className).toContain("md:hidden");
    expect(toggle?.className).toContain("min-h-[44px]");

    click(toggle);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(toggle?.textContent).toBe("Hide filters");
    expect(fields?.className).not.toContain("hidden");

    click(toggle);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.textContent).toBe("Show filters (2 active)");
    unmount();
  });

  it("keeps active filters visible as chips while the fields are collapsed, and a chip removes exactly its filter", () => {
    setViewportWidth(375);
    const onQueryChange = vi.fn();
    const { host, unmount } = render(
      <FullCatalogPage
        query={{ q: "bpc", states: ["request_access"], page: 2 }}
        page={page({ facets: FACETS })}
        onQueryChange={onQueryChange}
      />,
    );
    expect(host.querySelector("#mo-catalog-filter-fields")?.className).toContain("hidden");
    const chips = host.querySelector('[data-testid="mo-active-filters"]');
    expect(chips).not.toBeNull();
    expect(chips?.className).toContain("flex-wrap");
    for (const chip of Array.from(chips?.querySelectorAll("button") ?? [])) {
      expect(chip.className).toContain("min-h-[44px]");
      expect(chip.className).toContain("break-words");
    }
    click(host.querySelector('[data-testid="mo-active-filter-state"]'));
    expect(onQueryChange).toHaveBeenCalledWith({ q: "bpc" });
    unmount();
  });

  it("the toggle reads plainly when nothing is active", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={page()} onQueryChange={vi.fn()} />,
    );
    expect(host.querySelector('[data-testid="mo-filter-toggle"]')?.textContent).toBe("Show filters");
    unmount();
  });

  it("gives every touch target the 44px floor, including the refine select, the chips, and the no-results action", () => {
    const products = [
      card({ id: "a", slug: "a", variants: [variant({ id: "v1", action: ADD_TO_CART })] }),
      card({ id: "b", slug: "b", displayState: "care_pathway", variants: [variant({ id: "v2", displayState: "care_pathway", action: ACTIONS.explore_care })] }),
    ];
    const { host, unmount } = render(
      <FullCatalogPage query={{ q: "x" }} page={page({ products, facets: FACETS })} onQueryChange={vi.fn()} />,
    );
    const targets = host.querySelectorAll("button, a, select, input");
    expect(targets.length).toBeGreaterThan(8);
    for (const target of Array.from(targets)) {
      if (target.classList.contains("sr-only")) continue;
      expect(target.className, target.outerHTML.slice(0, 120)).toContain("min-h-[44px]");
    }
    unmount();

    const noResults = render(
      <FullCatalogPage query={{ q: "zzz" }} page={page({ products: [], total: 0 })} onQueryChange={vi.fn()} />,
    );
    expect(noResults.host.querySelector('[data-testid="mo-no-results-clear"]')?.className).toContain("min-h-[44px]");
    noResults.unmount();
  });

  it("lets a long product name, variant label, and chip wrap instead of widening the page", () => {
    const { host, unmount } = render(
      <FullCatalogPage
        query={{ q: LONG }}
        page={page({ products: [card({ displayName: LONG, variants: [variant({ label: LONG })] })] })}
        onQueryChange={vi.fn()}
      />,
    );
    const chip = host.querySelector('[data-testid="mo-active-filter-q"]');
    expect(chip?.className).toContain("max-w-full");
    expect(chip?.className).toContain("break-words");
    const card_ = host.querySelector('[data-testid="mo-card"]');
    expect(card_?.className).toContain("min-w-0");
    const title = host.querySelector('[data-testid="mo-card-link"]');
    expect(title?.textContent).toBe(LONG);
    expect(title?.parentElement?.className).toContain("break-words");
    const row = host.querySelector('[data-testid="mo-variant-row"]');
    expect(row?.className).toContain("min-w-0");
    expect(host.querySelector('[data-testid="mo-card-list"]')?.className).toContain("min-w-0");
    unmount();
  });

  it("stacks the grid to one column below md and never fixes a width", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={page()} onQueryChange={vi.fn()} />,
    );
    const list = host.querySelector('[data-testid="mo-card-list"]');
    expect(list?.className).toMatch(/\bgrid\b/);
    expect(list?.className).toContain("md:grid-cols-2");
    // Column counts only behind a breakpoint prefix: below md it is one column.
    expect(list?.className).not.toMatch(/(^|\s)grid-cols-[2-9]\b/);
    expect(host.innerHTML).not.toMatch(/width:\s*\d+px/);
    unmount();
  });
});

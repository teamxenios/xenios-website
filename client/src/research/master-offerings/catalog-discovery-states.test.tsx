// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { MasterOfferingCatalogListResponse } from "@shared/research/master-offerings/contract";
import type { ApiResult } from "../lib/api";
import { FullCatalogPage } from "./FullCatalogPage";
import { MasterOfferingCatalogSurface } from "./MasterOfferingCatalogSurface";
import { activeCatalogFilters } from "./CatalogActiveFilters";
import type { CatalogHistory } from "./useCatalogQueryState";
import {
  ACTIONS,
  ADD_TO_CART,
  card,
  click,
  page,
  render,
  select,
  type,
  variant,
} from "./catalog-test-fixtures";

/**
 * Discovery: filters, search, chips, refinement, and every state the results
 * area can be in. Each state must be visibly different from the others, and
 * none of them may read as "we sell nothing" when the truth is "the request
 * failed" or "your filters are narrow".
 */

const FACETS = {
  families: [
    { value: "research_vials" as const, label: "Research Vials", count: 3 },
    { value: "supplements" as const, label: "Supplements", count: 1 },
  ],
  states: [{ value: "request_access" as const, label: "Request Access", count: 4 }],
  categories: [{ value: "peptides-research", label: "Peptides & Research", count: 4 }],
};

function memoryHistory(initial = ""): CatalogHistory & { entries: string[] } {
  const entries = [initial];
  const listeners = new Set<() => void>();
  return {
    entries,
    search: () => entries[entries.length - 1] ?? "",
    push: (search) => entries.push(search),
    replace: (search) => {
      entries[entries.length - 1] = search;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function ok(data: MasterOfferingCatalogListResponse["catalog"]): ApiResult<MasterOfferingCatalogListResponse> {
  return { kind: "ok", data: { ok: true, audience: "member", launchScope: "all_members", catalog: data } };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("discovery filters and search", () => {
  it("search, family, category, listing state and sort each produce exactly one closed query change", () => {
    vi.useFakeTimers();
    try {
      const onQueryChange = vi.fn();
      const onSearchChange = vi.fn();
      const { host, unmount } = render(
        <FullCatalogPage
          query={{}}
          page={page({ facets: FACETS })}
          onQueryChange={onQueryChange}
          onSearchChange={onSearchChange}
        />,
      );
      select(host.querySelector("#mo-catalog-family"), "supplements");
      expect(onQueryChange).toHaveBeenLastCalledWith({ families: ["supplements"] });
      select(host.querySelector("#mo-catalog-category"), "peptides-research");
      expect(onQueryChange).toHaveBeenLastCalledWith({ categories: ["peptides-research"] });
      select(host.querySelector("#mo-catalog-state"), "request_access");
      expect(onQueryChange).toHaveBeenLastCalledWith({ states: ["request_access"] });
      select(host.querySelector("#mo-catalog-sort"), "name_desc");
      expect(onQueryChange).toHaveBeenLastCalledWith({ sort: "name_desc" });
      // A value outside the closed vocabulary is dropped, never forwarded.
      select(host.querySelector("#mo-catalog-state"), "live");
      expect(onQueryChange).toHaveBeenLastCalledWith({});
      select(host.querySelector("#mo-catalog-category"), "not-a-facet");
      expect(onQueryChange).toHaveBeenLastCalledWith({});

      type(host.querySelector("#mo-catalog-search"), "  bpc  ");
      expect(onSearchChange).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(250));
      expect(onSearchChange).toHaveBeenCalledWith({ q: "bpc" });
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows one removable chip per active filter, and removing one keeps the others and drops paging", () => {
    const onQueryChange = vi.fn();
    const query = {
      q: "bpc",
      families: ["research_vials" as const],
      categories: ["peptides-research"],
      states: ["request_access" as const],
      sort: "name_asc" as const,
      page: 3,
    };
    const { host, unmount } = render(
      <FullCatalogPage query={query} page={page({ facets: FACETS })} onQueryChange={onQueryChange} />,
    );
    const chips = host.querySelector('[data-testid="mo-active-filters"]');
    expect(chips?.getAttribute("aria-label")).toBe("Active filters");
    const labels = Array.from(chips?.querySelectorAll("button") ?? []).map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Remove Search: bpc",
      "Remove Family: Research Vials",
      "Remove Category: Peptides & Research",
      "Remove Listing state: Request Access",
      "Remove Sort: Name A to Z",
    ]);
    click(host.querySelector('[data-testid="mo-active-filter-category"]'));
    expect(onQueryChange).toHaveBeenLastCalledWith({
      q: "bpc",
      families: ["research_vials"],
      states: ["request_access"],
      sort: "name_asc",
    });
    click(host.querySelector('[data-testid="mo-active-filter-q"]'));
    expect(onQueryChange).toHaveBeenLastCalledWith({
      families: ["research_vials"],
      categories: ["peptides-research"],
      states: ["request_access"],
      sort: "name_asc",
    });
    unmount();
  });

  it("names a category by its slug when the facet no longer lists it, rather than inventing a label", () => {
    const filters = activeCatalogFilters({ categories: ["gone-category"] }, FACETS);
    expect(filters.map((f) => f.label)).toEqual(["Category: gone-category"]);
    expect(activeCatalogFilters({ sort: "relevance" }, FACETS)).toEqual([]);
    expect(activeCatalogFilters({ page: 4 }, FACETS)).toEqual([]);
  });

  it("renders no chip row when nothing is active", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{ page: 2 }} page={page()} onQueryChange={vi.fn()} />,
    );
    expect(host.querySelector('[data-testid="mo-active-filters"]')).toBeNull();
    unmount();
  });
});

describe("discovery result states", () => {
  const buy = card({ id: "mo_buy", slug: "a", displayName: "Alpha", variants: [variant({ id: "v1", action: ADD_TO_CART })] });
  const care = card({ id: "mo_care", slug: "b", displayName: "Beta", displayState: "care_pathway", variants: [variant({ id: "v2", displayState: "care_pathway", action: ACTIONS.explore_care })] });
  const held = card({ id: "mo_held", slug: "c", displayName: "Gamma", displayState: "temporarily_unavailable", variants: [variant({ id: "v3", displayState: "temporarily_unavailable", action: ACTIONS.notify_me })] });

  it("distinguishes an empty catalog from no results for the filters", () => {
    const empty = render(
      <FullCatalogPage query={{}} page={page({ products: [], total: 0 })} onQueryChange={vi.fn()} />,
    );
    expect(empty.host.querySelector('[data-testid="mo-result-count"]')?.textContent).toBe("No offerings to show yet");
    expect(empty.host.textContent).toContain("There is nothing in the catalog to show yet.");
    expect(empty.host.textContent).not.toContain("Nothing matches these filters.");
    expect(empty.host.querySelector('[data-testid="mo-no-results-clear"]')).toBeNull();
    expect(empty.host.querySelector('[data-testid="mo-access-path-refine"]')).toBeNull();
    empty.unmount();

    const onQueryChange = vi.fn();
    const noResults = render(
      <FullCatalogPage
        query={{ q: "zzz", families: ["supplements"], pageSize: 48 }}
        page={page({ products: [], total: 0 })}
        onQueryChange={onQueryChange}
      />,
    );
    expect(noResults.host.querySelector('[data-testid="mo-result-count"]')?.textContent).toBe("No offerings match these filters");
    expect(noResults.host.textContent).toContain("Nothing matches these filters.");
    expect(noResults.host.textContent).not.toContain("nothing in the catalog");
    click(noResults.host.querySelector('[data-testid="mo-no-results-clear"]'));
    expect(onQueryChange).toHaveBeenCalledWith({ pageSize: 48 });
    noResults.unmount();
  });

  it("a non-default sort alone is not a filter: zero rows still reads as an empty catalog", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{ sort: "name_desc" }} page={page({ products: [], total: 0 })} onQueryChange={vi.fn()} />,
    );
    expect(host.textContent).toContain("There is nothing in the catalog to show yet.");
    unmount();
  });

  it("refines the page by next step with honest on-this-page counts, and clears back to the whole page", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={page({ products: [buy, care, held], total: 90, totalPages: 4 })} onQueryChange={vi.fn()} />,
    );
    const count = () => host.querySelector('[data-testid="mo-result-count"]')?.textContent;
    const cards = () => Array.from(host.querySelectorAll('[data-testid="mo-card"]')).map((c) => c.getAttribute("data-offering-id"));
    expect(count()).toBe("Showing 3 of 90 offerings");
    const refine = host.querySelector<HTMLSelectElement>("#mo-catalog-access-path");
    const options = Array.from(refine?.options ?? []).map((o) => o.textContent);
    expect(options).toEqual([
      "Any next step",
      "Buy Now (1 on this page)",
      "Explore Care (1 on this page)",
      "Temporarily held (1 on this page)",
    ]);
    select(refine, "CARE");
    expect(cards()).toEqual(["mo_care"]);
    expect(count()).toBe("Showing 1 of 3 on this page, 90 in the catalog");
    expect(host.textContent).toContain("Continues through Care");
    select(refine, "any");
    expect(cards()).toEqual(["mo_buy", "mo_care", "mo_held"]);
    expect(count()).toBe("Showing 3 of 90 offerings");
    unmount();
  });

  it("says plainly when the chosen next step is absent from a new page, and offers the way back", () => {
    const { host, rerender, unmount } = render(
      <FullCatalogPage query={{}} page={page({ products: [buy, care], total: 50, totalPages: 3 })} onQueryChange={vi.fn()} />,
    );
    select(host.querySelector("#mo-catalog-access-path"), "BUY_NOW");
    rerender(
      <FullCatalogPage query={{ page: 2 }} page={page({ page: 2, products: [care, held], total: 50, totalPages: 3 })} onQueryChange={vi.fn()} />,
    );
    expect(host.textContent).toContain("No card on this page has Buy Now as a next step.");
    expect(host.querySelector('[data-testid="mo-card-list"]')).toBeNull();
    // The select still shows what the member chose, so they know why the page is empty.
    expect(host.querySelector<HTMLSelectElement>("#mo-catalog-access-path")?.value).toBe("BUY_NOW");
    click(host.querySelector('[data-testid="mo-refine-clear"]'));
    expect(host.querySelectorAll('[data-testid="mo-card"]').length).toBe(2);
    unmount();
  });

  it("hides the refinement when a page has only one next step, so it never lists a path the page does not hold", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={page({ products: [care, care] })} onQueryChange={vi.fn()} />,
    );
    expect(host.querySelector('[data-testid="mo-access-path-refine"]')).toBeNull();
    expect(host.textContent).not.toContain("Buy Now");
    unmount();
  });

  it("loading shows the live loading sentence and no empty state", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={page({ products: [], total: 0 })} onQueryChange={vi.fn()} loading />,
    );
    expect(host.querySelector('[data-testid="mo-result-count"]')?.textContent).toBe("Loading the catalog");
    expect(host.textContent).not.toContain("nothing in the catalog");
    expect(host.textContent).not.toContain("Nothing matches");
    unmount();
  });

  it("surface: error is retryable, unavailable is not an empty catalog, restricted is neither", async () => {
    const fetchCatalog = vi
      .fn<() => Promise<ApiResult<MasterOfferingCatalogListResponse>>>()
      .mockResolvedValueOnce({ kind: "error", message: "boom" })
      .mockResolvedValueOnce(ok(page({ products: [buy] })));
    const { host, unmount } = render(
      <MasterOfferingCatalogSurface memberToken="t" history={memoryHistory()} fetchCatalog={fetchCatalog} />,
    );
    await settle();
    expect(host.textContent).toContain("The catalog could not be loaded.");
    expect(host.textContent).not.toContain("nothing in the catalog");
    expect(host.querySelector('[data-testid="mo-card"]')).toBeNull();
    click(host.querySelector('[data-testid="mo-retry"]'));
    await settle();
    expect(host.querySelectorAll('[data-testid="mo-card"]').length).toBe(1);
    unmount();

    const restricted = vi
      .fn<() => Promise<ApiResult<MasterOfferingCatalogListResponse>>>()
      .mockResolvedValue({ kind: "forbidden", code: "master_offerings_launch_restricted" });
    const r = render(
      <MasterOfferingCatalogSurface memberToken="t" history={memoryHistory()} fetchCatalog={restricted} />,
    );
    await settle();
    expect(r.host.textContent).toContain("not open to your account yet");
    expect(r.host.querySelector('[data-testid="mo-retry"]')).toBeNull();
    expect(r.host.textContent).not.toContain("nothing in the catalog");
    r.unmount();
  });

  it("surface: a filtered deep link that matches nothing reads as no results, not as an empty catalog", async () => {
    const fetchCatalog = vi
      .fn<() => Promise<ApiResult<MasterOfferingCatalogListResponse>>>()
      .mockResolvedValue(ok(page({ products: [], total: 0, facets: FACETS })));
    const { host, unmount } = render(
      <MasterOfferingCatalogSurface
        memberToken="t"
        history={memoryHistory("?q=zzz&families=supplements")}
        fetchCatalog={fetchCatalog}
      />,
    );
    await settle();
    expect(host.textContent).toContain("Nothing matches these filters.");
    expect(host.querySelector('[data-testid="mo-active-filter-q"]')?.textContent).toContain("Search: zzz");
    expect(host.querySelector('[data-testid="mo-active-filter-family"]')?.textContent).toContain("Family: Supplements");
    unmount();
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_MASTER_OFFERING_SORT,
  EMPTY_MASTER_OFFERING_FACETS,
} from "@shared/research/master-offerings/contract";
import type {
  MasterOfferingCardView,
  MasterOfferingCatalogPage,
} from "@shared/research/master-offerings/contract";
import { MASTER_OFFERING_PRICE_ON_REQUEST } from "@shared/research/master-offerings/pricing-contract";
import { FullCatalogPage } from "./FullCatalogPage";
import {
  catalogQueryToSearch,
  masterOfferingPriceListUrl,
  parseCatalogQueryFromSearch,
} from "./integration-packet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, unmount: () => act(() => root.unmount()) };
}

function card(
  overrides: Partial<MasterOfferingCardView> = {},
): MasterOfferingCardView {
  return {
    id: "mo_1",
    slug: "research-vials-bpc-157",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    family: "research_vials",
    familyLabel: "Research Vials",
    category: "Peptides & Research",
    subcategory: "Single peptide",
    brand: null,
    displayState: "available_now",
    displayLabel: "Available Now",
    stateExplanation: "Available to request now.",
    copyState: "approved",
    variantCount: 2,
    variants: [
      {
        id: "mov_a",
        label: "5 mg vial",
        displayState: "available_now",
        displayLabel: "Available Now",
        price: {
          state: "priced",
          basis: "exact_listed_unit",
          amountCents: 9900,
          currency: "USD",
          display: "$99.00",
          priceId: "price_1",
          priceVersion: 1,
          effectiveAt: "2026-08-01T00:00:00.000Z",
          expiresAt: null,
        },
        action: {
          kind: "request_access",
          label: "Request Access",
          href: "/research/member/product-requests/new",
        },
      },
      {
        id: "mov_b",
        label: "10 mg vial",
        displayState: "coming_soon",
        displayLabel: "Coming Soon",
        price: MASTER_OFFERING_PRICE_ON_REQUEST,
        action: {
          kind: "join_waitlist",
          label: "Join Waitlist",
          href: "/research/member/product-requests/new",
        },
      },
    ],
    priceSummary: {
      state: "single",
      variantCount: 2,
      pricedVariantCount: 1,
      currency: "USD",
      fromCents: 9900,
      toCents: 9900,
      display: "$99.00",
    },
    ...overrides,
  };
}

function page(
  overrides: Partial<MasterOfferingCatalogPage> = {},
): MasterOfferingCatalogPage {
  return {
    ok: true,
    page: 1,
    pageSize: 24,
    total: 1,
    totalPages: 1,
    sort: DEFAULT_MASTER_OFFERING_SORT,
    products: [card()],
    facets: EMPTY_MASTER_OFFERING_FACETS,
    ...overrides,
  };
}

describe("full catalog page", () => {
  it("renders one h1 and labelled discovery controls without adding a nested main", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={page()} onQueryChange={() => {}} />,
    );
    expect(host.querySelectorAll("h1")).toHaveLength(1);
    for (const id of [
      "mo-catalog-search",
      "mo-catalog-family",
      "mo-catalog-category",
      "mo-catalog-state",
      "mo-catalog-sort",
    ]) {
      const control = host.querySelector(`#${id}`);
      expect(control).not.toBeNull();
      expect(
        host.querySelector(`label[for="${id}"]`)?.textContent?.trim(),
      ).toBeTruthy();
    }
    // ResearchLayout owns the one page-level main landmark.
    expect(host.querySelector("main")).toBeNull();
    const mobileToggle = host.querySelector<HTMLButtonElement>(
      '[data-testid="mo-filter-toggle"]',
    );
    expect(mobileToggle?.getAttribute("aria-controls")).toBe(
      "mo-catalog-filter-fields",
    );
    expect(mobileToggle?.getAttribute("aria-expanded")).toBe("false");
    act(() => mobileToggle?.click());
    expect(mobileToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(host.textContent).toContain(
      "direct checkout, a request, Care, updates, or no current action",
    );
    expect(host.textContent).not.toContain(
      "Anything without direct checkout can still be requested",
    );
    unmount();
  });

  it("renders server-owned category facets with counts and resets paging on selection", () => {
    const onQueryChange = vi.fn();
    const { host, unmount } = render(
      <FullCatalogPage
        query={{ page: 2 }}
        page={page({
          facets: {
            families: [
              { value: "research_vials", label: "Research Vials", count: 12 },
            ],
            states: [
              { value: "available_now", label: "Available Now", count: 7 },
            ],
            categories: [
              { value: "peptides-research", label: "Peptides & Research", count: 9 },
            ],
          },
        })}
        onQueryChange={onQueryChange}
      />,
    );

    expect(
      host.querySelector<HTMLOptionElement>(
        '#mo-catalog-category option[value="peptides-research"]',
      )?.textContent,
    ).toBe("Peptides & Research (9)");
    expect(
      host.querySelector<HTMLOptionElement>(
        '#mo-catalog-family option[value="research_vials"]',
      )?.textContent,
    ).toBe("Research Vials (12)");

    const category = host.querySelector<HTMLSelectElement>("#mo-catalog-category");
    if (category) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value",
      )?.set;
      setter?.call(category, "peptides-research");
      act(() => category.dispatchEvent(new Event("change", { bubbles: true })));
    }
    expect(onQueryChange).toHaveBeenCalledWith({
      categories: ["peptides-research"],
    });
    unmount();
  });

  it("clears filters and a non-default sort in one explicit action", () => {
    const onQueryChange = vi.fn();
    const { host, unmount } = render(
      <FullCatalogPage
        query={{
          q: "bpc",
          categories: ["peptides-research"],
          sort: "name_desc",
          page: 2,
        }}
        page={page({
          sort: "name_desc",
          facets: {
            families: [],
            states: [],
            categories: [
              { value: "peptides-research", label: "Peptides & Research", count: 9 },
            ],
          },
        })}
        onQueryChange={onQueryChange}
      />,
    );
    expect(
      host.querySelector('[data-testid="mo-active-filter-count"]')?.textContent,
    ).toBe("2 active filters");
    const clear = host.querySelector<HTMLButtonElement>(
      '[data-testid="mo-clear-filters"]',
    );
    expect(clear?.disabled).toBe(false);
    act(() => clear?.click());
    expect(onQueryChange).toHaveBeenCalledWith({});
    unmount();
  });

  it("shows each strength with its state in words and its price", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={page()} onQueryChange={() => {}} />,
    );
    const rows = Array.from(
      host.querySelectorAll('[data-testid="mo-variant-row"]'),
    ).map((row) => row.textContent ?? "");
    expect(rows[0]).toContain("5 mg vial");
    expect(rows[0]).toContain("Available Now");
    expect(rows[0]).toContain("$99.00");
    expect(rows[1]).toContain("10 mg vial");
    expect(rows[1]).toContain("Price on request");
    unmount();
  });

  it("never renders a purchase action or a zero price on a non-purchasable card", () => {
    const { host, unmount } = render(
      <FullCatalogPage
        query={{}}
        page={page({
          products: [
            card({
              variants: [
                {
                  id: "mov_a",
                  label: "5 mg vial",
                  displayState: "planned",
                  displayLabel: "Planned",
                  price: MASTER_OFFERING_PRICE_ON_REQUEST,
                  action: {
                    kind: "get_updates",
                    label: "Get Updates",
                    href: "/research/member/product-requests/new",
                  },
                },
              ],
              priceSummary: {
                state: "none",
                variantCount: 1,
                pricedVariantCount: 0,
                currency: null,
                fromCents: null,
                toCents: null,
                display: "Price on request",
              },
            }),
          ],
        })}
        onQueryChange={() => {}}
      />,
    );
    // The card renders the server-resolved action and nothing stronger: a
    // planned variant gets its updates path, never a Buy button and never a
    // zero standing in for a missing price.
    expect(host.textContent).not.toContain("Add to Cart");
    expect(host.textContent).not.toContain("Buy Now");
    expect(host.textContent).not.toContain("$0.00");
    const card1 = host.querySelector('[data-testid="mo-card"]');
    expect(card1?.querySelector('[data-testid="mo-card-buy-now"]')).toBeNull();
    expect(
      card1?.querySelector('[data-testid="mo-card-action"]')?.textContent,
    ).toBe("Get Updates");
    expect(
      host.querySelector('[data-testid="mo-card-price"]')?.textContent,
    ).toBe("Price on request");
    unmount();
  });

  it("keeps Care, planned, notification-only, and no-action paths distinct", () => {
    const { host, unmount } = render(
      <FullCatalogPage
        query={{}}
        page={page({
          products: [
            card({
              variantCount: 4,
              variants: [
                {
                  id: "mov_care",
                  label: "Care option",
                  displayState: "care_pathway",
                  displayLabel: "Care Pathway",
                  price: MASTER_OFFERING_PRICE_ON_REQUEST,
                  action: {
                    kind: "explore_care",
                    label: "Explore Care",
                    href: "/research/member/metabolic-care",
                  },
                },
                {
                  id: "mov_planned",
                  label: "Planned option",
                  displayState: "planned",
                  displayLabel: "Planned",
                  price: MASTER_OFFERING_PRICE_ON_REQUEST,
                  action: {
                    kind: "get_updates",
                    label: "Get Updates",
                    href: "/research/member/product-updates",
                  },
                },
                {
                  id: "mov_notify",
                  label: "Notification option",
                  displayState: "coming_soon",
                  displayLabel: "Coming Soon",
                  price: MASTER_OFFERING_PRICE_ON_REQUEST,
                  action: {
                    kind: "notify_me",
                    label: "Notify Me",
                    href: "/research/member/product-updates",
                  },
                },
                {
                  id: "mov_none",
                  label: "Unavailable option",
                  displayState: "unavailable",
                  displayLabel: "Unavailable",
                  price: MASTER_OFFERING_PRICE_ON_REQUEST,
                  action: { kind: "none", label: null, href: null },
                },
              ],
            }),
          ],
        })}
        onQueryChange={() => {}}
      />,
    );
    const rows = Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid="mo-variant-row"]'),
    );
    expect(rows[0]?.querySelector('[data-testid="mo-card-action"]')?.textContent)
      .toBe("Explore Care");
    expect(rows[1]?.querySelector('[data-testid="mo-card-action"]')?.textContent)
      .toBe("Get Updates");
    expect(rows[2]?.querySelector('[data-testid="mo-card-action"]')?.textContent)
      .toBe("Notify Me");
    expect(rows[3]?.querySelector('[data-testid="mo-card-action"]')).toBeNull();
    expect(rows[3]?.querySelector('[data-testid="mo-card-no-action"]')?.textContent)
      .toBe("Not available");
    unmount();
  });

  it("renders Buy Now only for a server-resolved add_to_cart, linking the detail page", () => {
    const { host, unmount } = render(
      <FullCatalogPage
        query={{}}
        page={page({
          products: [
            card({
              variants: [
                {
                  id: "mov_a",
                  label: "5 mg vial",
                  displayState: "available_now",
                  displayLabel: "Available Now",
                  price: {
                    state: "priced",
                    basis: "exact_listed_unit",
                    amountCents: 9900,
                    currency: "USD",
                    display: "$99.00",
                    priceId: "price_1",
                    priceVersion: 1,
                    effectiveAt: "2026-08-01T00:00:00.000Z",
                    expiresAt: null,
                  },
                  action: {
                    kind: "add_to_cart",
                    label: "Add to Cart",
                    productId: "pc_product_1",
                    variantId: "pc_variant_1",
                    sku: "XEN-BPC-10",
                    amount: { amountCents: 9900, currency: "USD" },
                    evaluatedAt: "2026-08-13T12:00:00.000Z",
                  },
                },
                {
                  id: "mov_b",
                  label: "10 mg vial",
                  displayState: "available_now",
                  displayLabel: "Available Now",
                  price: MASTER_OFFERING_PRICE_ON_REQUEST,
                  action: {
                    kind: "request_access",
                    label: "Request Access",
                    href: "/research/member/product-requests/new",
                  },
                },
              ],
            }),
          ],
        })}
        onQueryChange={() => {}}
      />,
    );
    // Buy Now navigates to the exact-variant detail page, where the quantity
    // band and the cart handoff live. The card adds nothing directly.
    const buyNow = host.querySelectorAll('[data-testid="mo-card-buy-now"]');
    expect(buyNow).toHaveLength(1);
    expect(buyNow[0].textContent).toBe("Buy Now");
    expect(buyNow[0].getAttribute("href")).toBe(
      "/research/member/catalog/research_vials/research-vials-bpc-157",
    );
    // The unbound variant on the same card keeps its truthful request action.
    expect(
      host.querySelector('[data-testid="mo-card-action"]')?.textContent,
    ).toBe("Request Access");
    unmount();
  });

  it("announces the live result count without listing the whole catalog", () => {
    const { host, unmount } = render(
      <FullCatalogPage
        query={{}}
        page={page({ total: 1121, totalPages: 47, products: [card()] })}
        onQueryChange={() => {}}
      />,
    );
    const status = host.querySelector('[data-testid="mo-result-count"]');
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toBe("Showing 1 of 1121 offerings");
    expect(host.querySelectorAll('[data-testid="mo-card"]')).toHaveLength(1);
    unmount();
  });

  it("offers a filtered price list download in both formats", () => {
    const query = { q: "bpc", families: ["research_vials"] as const };
    const { host, unmount } = render(
      <FullCatalogPage query={query} page={page()} onQueryChange={() => {}} />,
    );
    // The export URL still carries the filters and no paging.
    expect(masterOfferingPriceListUrl(query, "csv")).toBe(
      "/api/research/catalog-display/v2/price-list?q=bpc&families=research_vials&format=csv",
    );
    expect(masterOfferingPriceListUrl(query, "json")).toContain("format=json");

    // But the control is a button, not a link. A link download is a browser
    // navigation, and a navigation cannot carry the bearer token the export
    // route requires, so an anchor here would save the refusal body as a file.
    for (const testId of ["mo-download-csv", "mo-download-json"]) {
      const control = host.querySelector(`[data-testid="${testId}"]`);
      expect(control?.tagName).toBe("BUTTON");
      expect(control?.getAttribute("href")).toBeNull();
      expect(control?.hasAttribute("download")).toBe(false);
    }
    unmount();
  });

  it("pages forward and debounces search into a replace-style callback", () => {
    vi.useFakeTimers();
    try {
      const onQueryChange = vi.fn();
      const onSearchChange = vi.fn();
      const { host, unmount } = render(
        <FullCatalogPage
          query={{ page: 2 }}
          page={page({ page: 2, totalPages: 3, total: 60 })}
          onQueryChange={onQueryChange}
          onSearchChange={onSearchChange}
        />,
      );
      expect(
        host.querySelector('[data-testid="mo-page-position"]')?.textContent,
      ).toBe("Page 2 of 3");
      const next = Array.from(host.querySelectorAll("button")).find(
        (button) => button.textContent === "Next page",
      );
      act(() => next?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(onQueryChange).toHaveBeenCalledWith({ page: 3 });

      const search = host.querySelector<HTMLInputElement>("#mo-catalog-search");
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(search, "bpc");
        act(() =>
          search.dispatchEvent(new Event("input", { bubbles: true })),
        );
      }
      expect(onSearchChange).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(249));
      expect(onSearchChange).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(onSearchChange).toHaveBeenCalledWith({ q: "bpc" });
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows an empty state rather than a blank grid", () => {
    const { host, unmount } = render(
      <FullCatalogPage
        query={{ q: "nothing" }}
        page={page({ total: 0, totalPages: 0, products: [] })}
        onQueryChange={() => {}}
      />,
    );
    expect(host.textContent).toContain("Nothing matches these filters.");
    expect(
      host.querySelector('[data-testid="mo-result-count"]')?.textContent,
    ).toBe("No offerings match these filters");
    unmount();
  });
});

describe("catalog url state", () => {
  it("round trips the closed filter vocabulary", () => {
    const query = {
      q: "bpc",
      families: ["research_vials"] as const,
      states: ["available_now"] as const,
      categories: ["peptides-research"],
      sort: "availability" as const,
      page: 3,
    };
    expect(parseCatalogQueryFromSearch(catalogQueryToSearch(query))).toEqual(
      query,
    );
  });

  it("drops anything outside the closed vocabulary", () => {
    expect(
      parseCatalogQueryFromSearch(
        "?families=not_a_family&states=purchasable&page=0&audience=admin",
      ),
    ).toEqual({});
  });

  it("keeps paging out of the price list url", () => {
    expect(masterOfferingPriceListUrl({ page: 4, q: "bpc" })).toBe(
      "/api/research/catalog-display/v2/price-list?q=bpc&format=csv",
    );
  });
});

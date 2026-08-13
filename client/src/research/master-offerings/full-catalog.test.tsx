// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
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
          amountCents: 9900,
          currency: "USD",
          display: "$99.00",
          priceId: "price_1",
          priceVersion: 1,
          effectiveAt: "2026-08-01T00:00:00.000Z",
          expiresAt: null,
        },
      },
      {
        id: "mov_b",
        label: "10 mg vial",
        displayState: "coming_soon",
        displayLabel: "Coming Soon",
        price: MASTER_OFFERING_PRICE_ON_REQUEST,
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
    products: [card()],
    ...overrides,
  };
}

describe("full catalog page", () => {
  it("renders one h1 and a labelled search, family, and availability control", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={page()} onQueryChange={() => {}} />,
    );
    expect(host.querySelectorAll("h1")).toHaveLength(1);
    for (const id of [
      "mo-catalog-search",
      "mo-catalog-family",
      "mo-catalog-state",
    ]) {
      const control = host.querySelector(`#${id}`);
      expect(control).not.toBeNull();
      expect(
        host.querySelector(`label[for="${id}"]`)?.textContent?.trim(),
      ).toBeTruthy();
    }
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

  it("never renders a purchase action or a zero price on a card", () => {
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
    expect(host.textContent).not.toContain("Add to Cart");
    expect(host.textContent).not.toContain("$0.00");
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(
      host.querySelector('[data-testid="mo-card-price"]')?.textContent,
    ).toBe("Price on request");
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
    const csv = host.querySelector('[data-testid="mo-download-csv"]');
    expect(csv?.getAttribute("href")).toBe(
      "/api/research/catalog-display/v2/price-list?q=bpc&families=research_vials&format=csv",
    );
    expect(
      host
        .querySelector('[data-testid="mo-download-json"]')
        ?.getAttribute("href"),
    ).toContain("format=json");
    unmount();
  });

  it("pages forward and resets the page when the search changes", () => {
    const onQueryChange = vi.fn();
    const { host, unmount } = render(
      <FullCatalogPage
        query={{ page: 2 }}
        page={page({ page: 2, totalPages: 3, total: 60 })}
        onQueryChange={onQueryChange}
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
    expect(onQueryChange).toHaveBeenLastCalledWith({ q: "bpc" });
    unmount();
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

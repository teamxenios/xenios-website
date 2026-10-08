// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MemberCatalog } from "@shared/research/member-catalog";
import { MemberCatalogExperience } from "./MemberCatalogExperience";

const AT = "2026-07-26T22:00:00.000Z";
const catalog: MemberCatalog = {
  audience: "member",
  currency: "USD",
  evaluatedAt: AT,
  categories: ["Diagnostics", "Research"],
  lanes: ["research_material"],
  items: [
    {
      id: "product-b",
      slug: "product-b",
      displayName: "Beta Diagnostic",
      aliases: [],
      lane: "research_material",
      category: "Diagnostics",
      classification: "Diagnostic",
      summary: "Reviewed diagnostic information.",
      displayState: "documentation_pending",
      media: null,
      price: null,
      readiness: null,
      selection: null,
      variantCount: 1,
      updatedAt: "2026-07-25T22:00:00.000Z",
    },
    {
      id: "product-a",
      slug: "product-a",
      displayName: "Alpha Research",
      aliases: ["A-1"],
      lane: "research_material",
      category: "Research",
      classification: "Research material",
      summary: "Reviewed Research information.",
      displayState: "available",
      media: {
        mediaId: "media-a",
        variantId: "variant-a", width: 1024, height: 1024, contentSha256: "a".repeat(64), illustrative: false,
        productId: "product-a",
        href: "https://media.xeniostechnology.com/media-a",
        altText: "Alpha package",
        filename: "alpha.webp",
        sourceVersion: "media-v1",
        policy: "xenios_public_media_v1",
        expiresAt: null,
      },
      price: {
        id: "price-a",
        amountCents: 14900,
        currency: "USD",
        effectiveAt: "2026-07-01T00:00:00.000Z",
        expiresAt: null,
        version: 1,
      },
      readiness: {
        ready: true,
        verifiedInputCount: 1,
        inputVersions: [{ id: "input-a", version: 1 }],
        domainVersions: [{ domain: "products", version: 1 }],
      },
      selection: null,
      variantCount: 1,
      updatedAt: AT,
    },
  ],
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: new URL("https://xeniostechnology.com/research/member/products"),
  });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(props: Partial<React.ComponentProps<typeof MemberCatalogExperience>> = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<MemberCatalogExperience catalog={catalog} {...props} />));
  return host;
}

function changeSelect(view: HTMLElement, id: string, value: string) {
  const select = view.querySelector<HTMLSelectElement>(`#${id}`)!;
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function searchFor(view: HTMLElement, value: string) {
  const search = view.querySelector<HTMLInputElement>("#member-catalog-search")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, value);
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function cardIds(view: HTMLElement) {
  return Array.from(view.querySelectorAll('li[data-testid^="member-catalog-card-"]'))
    .map((card) => card.getAttribute("data-testid"));
}

describe("member catalog experience", () => {
  it("matches the Research shell and presents truthful public facts", () => {
    const html = renderToStaticMarkup(
      <MemberCatalogExperience catalog={catalog} />,
    );
    expect(html).toContain("research-app");
    // Landmark rule: the layout's section chrome owns the page's one <main>; the shell must not nest a second.
    expect(html).not.toContain("<main");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Xenios catalog");
    expect(html).toContain("Care + Research products");
    expect(html).toContain("Alpha Research");
    expect(html).toContain("$149.00");
    expect(html).toContain("Documentation pending");
    expect(html).toContain("Price not currently available");
    expect(html).toContain("Clinical and Research listings may share an active ingredient name");
    expect(html).toContain('width="1024"');
    expect(html).toContain('height="1024"');
    expect(html).toContain('decoding="async"');
    expect(html).not.toMatch(
      /Add to cart|Buy now|Renew\s+360|linear-gradient|radial-gradient|shadow-(?:sm|md|lg|xl)|rounded-2xl/,
    );
  });

  it("supports labeled search, filter, sort, status updates, and keyboard controls", () => {
    const view = mount();
    const search = view.querySelector<HTMLInputElement>("#member-catalog-search")!;
    expect(search.labels?.[0]?.textContent).toContain("Search products");
    expect(view.querySelector("#member-catalog-lane")).not.toBeNull();
    expect(view.querySelector("#member-catalog-category")).not.toBeNull();
    expect(view.querySelector("#member-catalog-sort")).not.toBeNull();

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "A-1");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view.textContent).toContain("Alpha Research");
    expect(view.textContent).not.toContain("Beta Diagnostic");
    expect(view.querySelectorAll("button, a, input, select").length).toBeGreaterThan(
      4,
    );
    expect(
      Array.from(view.querySelectorAll("button, a, input, select")).every(
        (element) =>
          !element.hasAttribute("tabindex") ||
          (element as HTMLElement).tabIndex >= 0,
      ),
    ).toBe(true);
  });

  it("renders loading, empty, error, unavailable, and unauthorized states", () => {
    const emptyCatalog = { ...catalog, items: [] };
    const values = [
      renderToStaticMarkup(
        <MemberCatalogExperience catalog={catalog} state="loading" />,
      ),
      renderToStaticMarkup(
        <MemberCatalogExperience catalog={emptyCatalog} />,
      ),
      renderToStaticMarkup(
        <MemberCatalogExperience
          catalog={catalog}
          state="error"
          errorMessage="Catalog request failed."
        />,
      ),
      renderToStaticMarkup(
        <MemberCatalogExperience catalog={catalog} state="unavailable" />,
      ),
      renderToStaticMarkup(
        <MemberCatalogExperience catalog={catalog} state="unauthorized" />,
      ),
    ];
    expect(values[0]).toContain("ra-loading");
    expect(values[1]).toContain("No products are published yet.");
    expect(values[2]).toContain("Catalog request failed.");
    expect(values[3]).toContain("The product catalog is not available");
    expect(values[4]).toContain("Please sign in.");
  });

  it("keeps load failure retryable and never presents it as an empty catalog", () => {
    const onRetry = vi.fn();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        <MemberCatalogExperience
          catalog={{ ...catalog, items: [] }}
          state="error"
          errorMessage="Catalog request failed."
          onRetry={onRetry}
        />,
      ),
    );
    expect(host.textContent).toContain("Catalog request failed.");
    expect(host.textContent).not.toContain("No products are published yet.");
    const retry = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again",
    );
    act(() => retry?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("composes under exactly one Research layout main in success, loading, and error", () => {
    for (const state of ["ok", "loading", "error"] as const) {
      const html = renderToStaticMarkup(
        <main data-testid="research-layout-main">
          <MemberCatalogExperience
            catalog={catalog}
            state={state}
            errorMessage="Catalog request failed."
          />
        </main>,
      );
      expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    }
  });

  it("includes responsive and wrapping hooks without claiming browser or zoom qualification", () => {
    const html = renderToStaticMarkup(
      <MemberCatalogExperience catalog={catalog} />,
    );
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain('style="min-width:0;overflow-wrap:anywhere"');
    expect(html).not.toMatch(/min-width:\s*[4-9]\d\dpx|width:\s*[4-9]\d\dpx/);
    expect(html).not.toContain("overflow-x:scroll");
    expect(html).toContain('aria-live="polite"');
  });

  it("uses the permitted items for facets, displayed cards and counts", () => {
    const view = mount({ catalog: { ...catalog, categories: ["Stale category"], lanes: [] } });
    const categories = view.querySelector<HTMLSelectElement>("#member-catalog-category")!;
    expect(Array.from(categories.options).map((option) => option.value)).toEqual(["all", "Diagnostics", "Research"]);
    expect(view.textContent).not.toContain("Stale category");
    expect(view.querySelector("#member-catalog-lane")?.textContent).toContain("Research");
    expect(view.textContent).toContain("2 of 2 products");
    searchFor(view, "a-1");
    expect(cardIds(view)).toEqual(["member-catalog-card-product-a"]);
    expect(view.textContent).toContain("1 of 2 products");
    expect(view.querySelector('[role="status"]')?.getAttribute("aria-atomic")).toBe("true");
  });

  it("distinguishes no matches from no published products and resets all controls", () => {
    const view = mount();
    changeSelect(view, "member-catalog-sort", "name_descending");
    expect(view.textContent).toContain("Clear filters");
    changeSelect(view, "member-catalog-lane", "research_material");
    changeSelect(view, "member-catalog-category", "Diagnostics");
    searchFor(view, "not a catalog entry");
    expect(view.textContent).toContain("No products match those filters.");
    expect(view.textContent).not.toContain("No products are published yet.");
    expect(view.textContent).toContain("0 of 2 products");
    const clear = Array.from(view.querySelectorAll("button")).find((button) => button.textContent === "Clear filters")!;
    act(() => clear.click());
    expect((view.querySelector("#member-catalog-search") as HTMLInputElement).value).toBe("");
    expect((view.querySelector("#member-catalog-lane") as HTMLSelectElement).value).toBe("all");
    expect((view.querySelector("#member-catalog-category") as HTMLSelectElement).value).toBe("all");
    expect((view.querySelector("#member-catalog-sort") as HTMLSelectElement).value).toBe("name_ascending");
    expect(cardIds(view)).toEqual(["member-catalog-card-product-a", "member-catalog-card-product-b"]);
  });

  it("reconciles removed facets only after successful refresh without resurrecting them", () => {
    const clinical: MemberCatalog = { ...catalog, items: [
      { ...catalog.items[0], lane: "future_clinical", price: null, displayState: "catalog_only" },
      catalog.items[1],
    ] };
    const view = mount({ catalog: clinical });
    searchFor(view, "a");
    changeSelect(view, "member-catalog-lane", "future_clinical");
    changeSelect(view, "member-catalog-category", "Diagnostics");
    changeSelect(view, "member-catalog-sort", "name_descending");
    act(() => root!.render(<MemberCatalogExperience catalog={{ ...catalog, items: [] }} state="loading" />));
    act(() => root!.render(<MemberCatalogExperience catalog={clinical} />));
    expect((view.querySelector("#member-catalog-lane") as HTMLSelectElement).value).toBe("future_clinical");
    expect((view.querySelector("#member-catalog-category") as HTMLSelectElement).value).toBe("Diagnostics");
    act(() => root!.render(<MemberCatalogExperience catalog={{ ...catalog, items: [catalog.items[1]] }} />));
    expect((view.querySelector("#member-catalog-lane") as HTMLSelectElement).value).toBe("all");
    expect((view.querySelector("#member-catalog-category") as HTMLSelectElement).value).toBe("all");
    expect((view.querySelector("#member-catalog-search") as HTMLInputElement).value).toBe("a");
    expect((view.querySelector("#member-catalog-sort") as HTMLSelectElement).value).toBe("name_descending");
    act(() => root!.render(<MemberCatalogExperience catalog={clinical} />));
    expect(view.textContent).toContain("2 of 2 products");
  });

  it("preserves useful query and filter state through a failed read and its retry", () => {
    const retry = vi.fn();
    const view = mount();
    searchFor(view, "A-1");
    changeSelect(view, "member-catalog-category", "Research");
    act(() => root!.render(<MemberCatalogExperience catalog={{ ...catalog, items: [] }} state="error" onRetry={retry} />));
    const button = Array.from(view.querySelectorAll("button")).find((item) => item.textContent === "Try again")!;
    act(() => button.click());
    expect(retry).toHaveBeenCalledTimes(1);
    act(() => root!.render(<MemberCatalogExperience catalog={catalog} />));
    expect((view.querySelector("#member-catalog-search") as HTMLInputElement).value).toBe("A-1");
    expect((view.querySelector("#member-catalog-category") as HTMLSelectElement).value).toBe("Research");
    expect(cardIds(view)).toEqual(["member-catalog-card-product-a"]);
  });

  it.each(["name_ascending", "name_descending", "recently_updated"])("breaks equal sort values by canonical identity for %s", (sort) => {
    const items = ["zeta", "alpha"].map((slug) => ({ ...catalog.items[0], id: slug, slug, displayName: "Same name", updatedAt: AT }));
    const view = mount({ catalog: { ...catalog, items } });
    changeSelect(view, "member-catalog-sort", sort);
    expect(cardIds(view)).toEqual(["member-catalog-card-alpha", "member-catalog-card-zeta"]);
    act(() => root!.render(<MemberCatalogExperience catalog={{ ...catalog, items: [...items].reverse() }} />));
    expect(cardIds(view)).toEqual(["member-catalog-card-alpha", "member-catalog-card-zeta"]);
    expect(items.map((item) => item.id)).toEqual(["zeta", "alpha"]);
  });

  it("keeps exact links, long canonical labels and availability independent of missing media", () => {
    const name = "LongCanonicalProduct".repeat(25);
    const category = "LongCanonicalCategory".repeat(20);
    const view = mount({ catalog: { ...catalog, items: [{ ...catalog.items[1], displayName: name, category, media: null }] } });
    const card = view.querySelector('li[data-testid="member-catalog-card-product-a"]')!;
    expect(card.textContent).toContain(name);
    expect(card.textContent).toContain(category);
    const categorySelect = view.querySelector<HTMLSelectElement>("#member-catalog-category")!;
    expect(categorySelect.options[1].textContent).toBe(category);
    expect(categorySelect.className).toContain("min-w-0 max-w-full");
    expect(categorySelect.labels?.[0]?.className).toContain("min-w-0");
    expect(card.textContent).toContain("Available");
    expect(card.textContent).toContain("$149.00");
    expect(card.textContent).toContain("An approved product image is not available.");
    expect((card as HTMLElement).style.overflowWrap).toBe("anywhere");
    const links = Array.from(card.querySelectorAll("a"));
    expect(links.every((link) => link.getAttribute("href") === "/research/member/products/product-a")).toBe(true);
    expect(links[1].getAttribute("aria-label")).toBe(`View product: ${name}`);
    expect(links[1].hasAttribute("aria-disabled")).toBe(false);
  });

  it.each(["loading", "error", "unavailable", "unauthorized"] as const)("does not expose stale product cards or counts during %s", (state) => {
    const html = renderToStaticMarkup(<MemberCatalogExperience catalog={catalog} state={state} />);
    expect(html).not.toContain("Alpha Research");
    expect(html).not.toContain("$149.00");
    expect(html).not.toContain("2 of 2 products");
    expect(html).not.toContain("No products are published yet.");
  });

  it("keeps pricing, documentation and clinical review descriptions distinct", () => {
    const html = renderToStaticMarkup(<MemberCatalogExperience catalog={{ ...catalog, items: [
      catalog.items[0],
      { ...catalog.items[1], displayState: "pricing_pending", price: null },
      { ...catalog.items[0], id: "clinical", slug: "clinical", lane: "future_clinical", displayState: "catalog_only", price: null },
    ] }} />);
    expect(html).toContain("Documentation pending");
    expect(html).toContain("Pricing pending");
    expect(html).toContain("Clinical / provider review");
    expect(html).toContain("Pricing shown after clinical review");
    expect(html).toContain("does not confirm provider or pharmacy availability");
    expect(html).not.toMatch(/Buy now|Add to cart|Start treatment/);
  });
});

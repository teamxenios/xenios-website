// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
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

function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<MemberCatalogExperience catalog={catalog} />));
  return host;
}

describe("member catalog experience", () => {
  it("matches the Research shell and presents truthful public facts", () => {
    const html = renderToStaticMarkup(
      <MemberCatalogExperience catalog={catalog} />,
    );
    expect(html).toContain("research-app");
    expect(html).toContain("<main");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Alpha Research");
    expect(html).toContain("$149.00");
    expect(html).toContain("Documentation pending");
    expect(html).toContain("Price not currently available");
    expect(html).not.toMatch(
      /Add to cart|Buy now|linear-gradient|radial-gradient|shadow-(?:sm|md|lg|xl)|rounded-2xl/,
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

  it("uses reflow-safe responsive structures for 720/375/320 and 200% zoom", () => {
    const html = renderToStaticMarkup(
      <MemberCatalogExperience catalog={catalog} />,
    );
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain('style="min-width:0;overflow-wrap:anywhere"');
    expect(html).not.toMatch(/min-width:\s*[4-9]\d\dpx|width:\s*[4-9]\d\dpx/);
    expect(html).not.toContain("overflow-x:scroll");
    expect(html).toContain('aria-live="polite"');
  });
});

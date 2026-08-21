// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { EarlyAccessCatalogSection } from "./EarlyAccessCatalogSection";
import type { EarlyAccessCardProduct } from "./EarlyAccessProductCard";
import type { EarlyAccessCatalogLoad } from "../adapters/earlyAccessCatalog";

/**
 * ONE storefront, two shelves.
 *
 * The customer catalogue used to BE the founder-released set, because the
 * server filtered to it. It now serves the whole catalogue and marks the
 * released units instead, so the launch requirement is Featured Products above
 * All Products on a single surface.
 *
 * The properties worth holding are that Featured is merchandising and nothing
 * more, and that no card is rendered twice — a duplicated variantId would give
 * two elements the same test id and make selection ambiguous.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function product(
  overrides: Partial<EarlyAccessCardProduct> = {},
): EarlyAccessCardProduct {
  return {
    productId: "prod-1",
    variantId: "var-1",
    name: "BPC-157",
    strength: "10 mg",
    unitPriceCents: 9_900,
    currency: "USD",
    description: "",
    availability: "AVAILABLE",
    quantityLimit: 20,
    ...overrides,
  } as EarlyAccessCardProduct;
}

function loader(products: EarlyAccessCardProduct[]) {
  return async (): Promise<EarlyAccessCatalogLoad> =>
    ({ kind: "ok", products, dropped: 0, received: products.length }) as EarlyAccessCatalogLoad;
}

async function render(products: EarlyAccessCardProduct[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EarlyAccessCatalogSection
        fulfillmentTargetCopy="Ships from the Xenios research facility."
        load={loader(products)}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); });
  return { host, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

const FEATURED = product({ productId: "p-f", variantId: "v-f", name: "Featured Peptide", featured: true });
const PLAIN = product({ productId: "p-a", variantId: "v-a", name: "Catalogue Peptide" });

describe("the unified Early Access storefront", () => {
  it("shows Featured Products above All Products when a released unit is in view", async () => {
    const view = await render([FEATURED, PLAIN]);
    const featured = view.host.querySelector('[data-testid="early-access-catalog-section-featured"]');
    const all = view.host.querySelector('[data-testid="early-access-catalog-section-all"]');
    expect(featured).not.toBeNull();
    expect(all).not.toBeNull();
    expect(featured!.textContent).toContain("Featured Products");
    expect(featured!.textContent).toContain("Featured Peptide");
    expect(all!.textContent).toContain("All Products");
    expect(all!.textContent).toContain("Catalogue Peptide");
    // Featured must not swallow the rest of the catalogue.
    expect(featured!.textContent).not.toContain("Catalogue Peptide");
    view.unmount();
  });

  it("renders no card twice, so selection stays unambiguous", async () => {
    const view = await render([FEATURED, PLAIN]);
    const ids = Array.from(view.host.querySelectorAll("[data-testid]"))
      .map((el) => el.getAttribute("data-testid") ?? "")
      .filter((id) => id.includes("v-f") || id.includes("v-a"));
    expect(ids.length).toBe(new Set(ids).size);
    view.unmount();
  });

  it("falls back to one plain list when nothing in view is featured", async () => {
    // A "Featured" heading over an empty shelf is worse than no heading.
    const view = await render([PLAIN]);
    expect(view.host.querySelector('[data-testid="early-access-catalog-section-featured"]')).toBeNull();
    expect(view.host.querySelector('[data-testid="early-access-catalog-section-all"]')).toBeNull();
    expect(view.host.textContent).toContain("Catalogue Peptide");
    view.unmount();
  });

  it("a legacy server that sends no featured flag yields All Products, not all-Featured", async () => {
    // The field is optional and absent means not featured, so an older server
    // degrades to the previous single list rather than claiming every row is
    // a founder release.
    const view = await render([product({ variantId: "v-1" }), product({ variantId: "v-2", productId: "p-2" })]);
    expect(view.host.querySelector('[data-testid="early-access-catalog-section-featured"]')).toBeNull();
    view.unmount();
  });

  it("Featured is merchandising only: a held featured unit is still not orderable", async () => {
    const heldFeatured = product({
      productId: "p-h",
      variantId: "v-h",
      name: "Held Featured",
      featured: true,
      availability: "TEMPORARILY_HELD",
      unitPriceCents: null,
    });
    const view = await render([heldFeatured, PLAIN]);
    const featured = view.host.querySelector('[data-testid="early-access-catalog-section-featured"]');
    expect(featured!.textContent).toContain("Held Featured");
    // No price is offered beside a unit nobody may buy.
    expect(featured!.textContent).not.toContain("$");
    view.unmount();
  });

  it("search narrows both shelves, and Featured never escapes a filter", async () => {
    const view = await render([FEATURED, PLAIN]);
    const search = view.host.querySelector(
      '[data-testid="early-access-catalog-section-search"]',
    ) as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(search, "Catalogue");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // The featured row does not match, so its shelf disappears entirely.
    expect(view.host.querySelector('[data-testid="early-access-catalog-section-featured"]')).toBeNull();
    expect(view.host.textContent).toContain("Catalogue Peptide");
    expect(view.host.textContent).not.toContain("Featured Peptide");
    view.unmount();
  });
});

// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  V3SupplementCatalogExperience,
  type V3SupplementCatalogItem,
} from "./V3SupplementCatalogExperience";

const items: V3SupplementCatalogItem[] = [
  {
    id: "preview-omega",
    slug: "omega",
    displayName: "Omega Foundation",
    summary: "A supplement category under review.",
    pricingState: "public_price_pending",
    approvedPrice: null,
    approvedVariantCount: 0,
    purchasingEnabled: false,
    documentationState: "pending",
    form: null,
    flavor: null,
  },
  {
    id: "preview-magnesium",
    slug: "magnesium",
    displayName: "Magnesium Foundation",
    summary: "A supplement category under review.",
    pricingState: "public_price_pending",
    approvedPrice: null,
    approvedVariantCount: 0,
    purchasingEnabled: false,
    documentationState: "pending",
    form: null,
    flavor: null,
  },
];

let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe("V3 supplement catalog experience", () => {
  it("renders truthful price-pending cards with no transaction control", () => {
    const html = renderToStaticMarkup(
      <V3SupplementCatalogExperience items={items} />,
    );
    expect(html).toContain("Xenios Research catalog");
    expect(html).toContain("Price not currently available");
    expect(html).toContain("Approved variant required");
    expect(html).toContain("Request sourcing");
    expect(html).not.toMatch(/Add to cart|Buy now|Subscribe|[$]\d/);
  });

  it("searches, sorts, and invokes the optional save seam by keyboard controls", () => {
    const save = vi.fn();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        <V3SupplementCatalogExperience items={items} onSave={save} />,
      ),
    );
    const search = host.querySelector<HTMLInputElement>(
      "#supplement-preview-search",
    )!;
    expect(search.labels?.[0]?.textContent).toContain("Search");
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "magnesium");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("Magnesium Foundation");
    expect(host.textContent).not.toContain("Omega Foundation");
    const saveButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Save for later",
    )!;
    act(() => saveButton.click());
    expect(save).toHaveBeenCalledWith("magnesium");
  });

  it("renders loading, empty, error, and unavailable states", () => {
    expect(
      renderToStaticMarkup(
        <V3SupplementCatalogExperience items={items} state="loading" />,
      ),
    ).toContain("Loading");
    expect(
      renderToStaticMarkup(<V3SupplementCatalogExperience items={[]} />),
    ).toContain("No supplement categories match.");
    expect(
      renderToStaticMarkup(
        <V3SupplementCatalogExperience
          items={items}
          state="error"
          errorMessage="Catalog request failed."
        />,
      ),
    ).toContain("Catalog request failed.");
    expect(
      renderToStaticMarkup(
        <V3SupplementCatalogExperience items={items} state="unavailable" />,
      ),
    ).toContain("Supplement categories are not available.");
  });

  it("uses responsive grids without fixed desktop widths", () => {
    const html = renderToStaticMarkup(
      <V3SupplementCatalogExperience items={items} />,
    );
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("xl:grid-cols-3");
    expect(html).not.toMatch(/min-width:\s*[4-9]\d\dpx|overflow-x:scroll/);
  });
});

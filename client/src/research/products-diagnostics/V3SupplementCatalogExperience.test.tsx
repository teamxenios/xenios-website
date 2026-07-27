// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  V3SupplementCatalogExperience,
  type V3SupplementCatalogItem,
} from "./V3SupplementCatalogExperience";

const items: V3SupplementCatalogItem[] = [
  {
    id: "brand-a--formula-a",
    brand: "Brand A",
    displayName: "Formula A",
    category: "Daily foundations",
    publicState: "coming_soon",
    formatState: "pending_confirmation",
    sizeState: "pending_confirmation",
    flavorState: "pending_if_applicable",
    subscriptionState: "disabled",
    supplierState: "relationship_pending",
    pairingState: "review_pending",
    price: null,
    sku: null,
    primaryCta: "Notify me",
    secondaryCta: "Request sourcing",
  },
  {
    id: "brand-b--formula-b",
    brand: "Brand B",
    displayName: "Formula B",
    category: "Performance",
    publicState: "coming_soon",
    formatState: "pending_confirmation",
    sizeState: "pending_confirmation",
    flavorState: "pending_if_applicable",
    subscriptionState: "disabled",
    supplierState: "relationship_pending",
    pairingState: "review_pending",
    price: null,
    sku: null,
    primaryCta: "Notify me",
    secondaryCta: "Request sourcing",
  },
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("V3 supplement catalog experience", () => {
  it("renders final Xenios cards with truthful pending states", () => {
    const html = renderToStaticMarkup(
      <V3SupplementCatalogExperience items={items} />,
    );
    expect(html).toContain("Formula A");
    expect(html).toContain("Formula B");
    expect(html).toContain("Coming soon");
    expect(html).toContain("Pairing review pending");
    expect(html).toContain("Notify me");
    expect(html).not.toMatch(
      /\$\d|SKU-|Add to cart|Subscribe|wholesale|Northline|linear-gradient|rounded-2xl/,
    );
  });

  it("supports labeled search and an actionable empty state", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root!.render(<V3SupplementCatalogExperience items={items} />),
    );
    const search =
      host.querySelector<HTMLInputElement>("#v3-supplement-search")!;
    expect(search.labels?.[0]?.textContent).toContain("Search supplements");
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "no match");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("No formulas match those filters.");
    expect(host.textContent).not.toContain("Formula A");
  });

  it("is reflow-safe for 720/375/320 and 200 percent zoom", () => {
    const html = renderToStaticMarkup(
      <V3SupplementCatalogExperience items={items} />,
    );
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("lg:grid-cols-3");
    expect(html).toContain('style="min-width:0;overflow-wrap:anywhere"');
    expect(html).not.toMatch(/min-width:\s*[4-9]\d\dpx|overflow-x:scroll/);
  });
});

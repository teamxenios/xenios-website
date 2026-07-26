import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  PRODUCT_FAMILY_OPTIONS,
  ProductCatalogExperience,
  ProductComparePanel,
  ProductDetailExperience,
  type ProductCardView,
  type ProductDetailView,
} from "./ProductCatalogExperience";
import { PRODUCT_REQUEST_ENTRY_POINTS } from "@shared/research/product-request-sources";

const card: ProductCardView = {
  slug: "alpha",
  displayName: "Alpha Research Vial",
  family: "research_vials",
  familyLabel: "Research Vials",
  statusLabel: "Documentation pending",
  summary: "An exact product listing with truthful documentation status.",
  priceLabel: null,
  aliases: ["A-1"],
};

const detail: ProductDetailView = {
  ...card,
  templateClass: "research_material",
  specifications: [],
  researchInformation: [],
  storageAndHandling: null,
  shippingAndReturns: null,
  documentation: [{ label: "Certificate of Analysis", state: "Documentation pending" }],
  relatedProducts: [],
};

beforeAll(() => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: new URL("https://xeniostechnology.com/research/member/products"),
  });
});

describe("Website 3 product experience", () => {
  it("renders every requested product family without adding primary navigation tabs", () => {
    const html = renderToStaticMarkup(<ProductCatalogExperience products={[card]} />);
    for (const [, label] of PRODUCT_FAMILY_OPTIONS) expect(html).toContain(label);
    expect(html).toContain("Request a product");
    expect(html).not.toContain("Coming Soon tab");
  });

  it("renders a truthful card with one primary action and no invented price", () => {
    const html = renderToStaticMarkup(<ProductCatalogExperience products={[card]} />);
    expect(html).toContain("Documentation pending");
    expect(html).toContain("View product");
    expect(html).not.toContain("$0");
    expect(html).not.toContain("Add to cart");
  });

  it("renders all nine product-detail sections and the certificate limitation", () => {
    const html = renderToStaticMarkup(<ProductDetailExperience product={detail} />);
    for (const heading of [
      "Overview",
      "Specifications",
      "Certificate of Analysis",
      "Research Information",
      "Storage and Handling",
      "Shipping and Returns",
      "Documentation",
      "Related Products",
      "Request an Alternative",
    ]) {
      expect(html).toContain(heading);
    }
    expect(html).toContain(
      "A reported purity result does not establish sterility, safety, potency, or suitability for human use.",
    );
    expect(html).toContain("Specifications are pending documentation review.");
  });

  it("renders an exact-lot private certificate action only when the production adapter is wired", () => {
    const unavailable = renderToStaticMarkup(
      <ProductDetailExperience product={detail} />,
    );
    const wired = renderToStaticMarkup(
      <ProductDetailExperience
        product={detail}
        onCertificateRequest={async () => "https://signed.example/certificate"}
      />,
    );

    expect(unavailable).toContain(
      "An exact-lot certificate action is unavailable",
    );
    expect(wired).toContain("Exact lot code");
    expect(wired).toContain("Request certificate access");
    expect(wired).not.toContain("signed.example");
  });

  it("renders only product-request sources accepted by the shared contract", () => {
    const catalogHtml = renderToStaticMarkup(
      <ProductCatalogExperience products={[]} />,
    );
    const detailHtml = renderToStaticMarkup(
      <ProductDetailExperience product={detail} />,
    );
    const renderedSources = Array.from(
      `${catalogHtml}${detailHtml}`.matchAll(/source=([^&"]+)/g),
      (match) => decodeURIComponent(match[1]),
    );
    expect(renderedSources.length).toBeGreaterThanOrEqual(4);
    for (const source of renderedSources) {
      expect(PRODUCT_REQUEST_ENTRY_POINTS).toContain(source);
    }
    expect(new Set(renderedSources)).toEqual(new Set(["products"]));
  });

  it("uses the Research shell and shared state primitives without a second visual system", () => {
    const populated = renderToStaticMarkup(
      <ProductCatalogExperience products={[card]} />,
    );
    const empty = renderToStaticMarkup(
      <ProductCatalogExperience products={[]} />,
    );
    const unavailable = renderToStaticMarkup(
      <ProductCatalogExperience products={[]} state="unavailable" />,
    );
    const error = renderToStaticMarkup(
      <ProductCatalogExperience products={[]} state="error" errorMessage="Catalog request failed." />,
    );

    expect(populated).toContain("research-app");
    expect(populated).toContain("ra-pagehead");
    expect(populated).toContain("ra-filterbar");
    expect(populated).toContain("ra-tabs");
    expect(empty).toContain("ra-empty");
    expect(unavailable).toContain("The product catalog is not available right now.");
    expect(error).toContain("Catalog request failed.");

    for (const html of [populated, empty, unavailable, error]) {
      expect(html).not.toMatch(
        /linear-gradient|radial-gradient|rounded-\[2rem\]|rounded-2xl|shadow-(?:sm|md|lg|xl)|(?:slate|indigo|amber|emerald)-/,
      );
    }
  });

  it("supports family-specific pages and a truthful comparison surface", () => {
    const familyHtml = renderToStaticMarkup(
      <ProductCatalogExperience products={[card]} initialFamily="research_vials" />,
    );
    const compareHtml = renderToStaticMarkup(
      <ProductComparePanel
        products={[
          card,
          {
            ...card,
            slug: "beta",
            displayName: "Beta Research Vial",
            statusLabel: "Available",
            priceLabel: "$45.00",
          },
        ]}
        onClear={() => undefined}
      />,
    );
    expect(familyHtml).toContain('aria-selected="true" class="chip ra-chip-selected">Research vials');
    expect(compareHtml).toContain("2 products selected");
    expect(compareHtml).toContain("Pricing not confirmed");
    expect(compareHtml).toContain("$45.00");
    expect(compareHtml).not.toContain("Add to cart");
  });
});

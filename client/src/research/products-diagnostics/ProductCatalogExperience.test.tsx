import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  PRODUCT_FAMILY_OPTIONS,
  ProductCatalogExperience,
  ProductDetailExperience,
  type ProductCardView,
  type ProductDetailView,
} from "./ProductCatalogExperience";

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
    expect(html).toContain("View details");
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
});

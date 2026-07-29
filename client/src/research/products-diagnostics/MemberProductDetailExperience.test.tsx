// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { MemberProductDetail } from "@shared/research/member-catalog";
import {
  MEMBER_CATALOG_FUTURE_CLINICAL_CATEGORY,
  MEMBER_CATALOG_FUTURE_CLINICAL_CLASSIFICATION,
  MEMBER_CATALOG_NONTRANSACTIONAL_SUMMARY,
} from "@shared/research/member-catalog";
import { MemberProductDetailExperience } from "./MemberProductDetailExperience";

const AT = "2026-07-26T22:00:00.000Z";
const product: MemberProductDetail = {
  id: "product-a",
  slug: "product-a",
  displayName: "Alpha Research",
  canonicalName: "Alpha",
  aliases: ["A-1"],
  lane: "research_material",
  category: "Research",
  classification: "Research material",
  summary: "Reviewed summary.",
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
  selection: null,
  variantCount: 2,
  updatedAt: AT,
  audience: "member",
  currency: "USD",
  evaluatedAt: AT,
  overview: "Reviewed overview.",
  specifications: "Reviewed specifications.",
  researchInformation: "Reviewed Research information.",
  storageInformation: null,
  shippingInformation: "Shipping information.",
  returnInformation: "Return information.",
  disclaimers: "Research use only.",
  reviewDate: "2026-07-20",
  variants: [
    {
      id: "variant-a",
      productId: "product-a",
      sku: "SKU-A",
      label: "Standard",
      strength: "10 mg",
      size: null,
      format: "Vial",
      presentation: "Single unit",
      shippingClass: "standard",
      price: {
        id: "price-a",
        amountCents: 14900,
        currency: "USD",
        effectiveAt: "2026-07-01T00:00:00.000Z",
        expiresAt: null,
        version: 1,
      },
      availability: "available",
      lotCoaState: "verified",
      selection: null,
      selectionFailure: "inventory_unavailable",
    },
    {
      id: "variant-b",
      productId: "product-a",
      sku: "SKU-B",
      label: "Extended",
      strength: "20 mg",
      size: null,
      format: "Vial",
      presentation: "Single unit",
      shippingClass: "standard",
      price: {
        id: "price-b",
        amountCents: 19900,
        currency: "USD",
        effectiveAt: "2026-07-01T00:00:00.000Z",
        expiresAt: null,
        version: 1,
      },
      availability: "unavailable",
      lotCoaState: "required",
      selection: null,
      selectionFailure: "inventory_unavailable",
    },
  ],
  readiness: null,
  relatedProducts: [
    {
      id: "product-b",
      slug: "product-b",
      displayName: "Beta Research",
      aliases: [],
      lane: "research_material",
      category: "Research",
      classification: "Research material",
      summary: "Related product.",
      displayState: "unavailable",
      media: null,
      price: null,
      readiness: null,
      selection: null,
      variantCount: 1,
      updatedAt: AT,
    },
  ],
  researchOnlyBoundary: true,
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: new URL(
      "https://xeniostechnology.com/research/member/products/product-a",
    ),
  });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("member product detail experience", () => {
  it("renders one shell heading, safe media, variant/price, lot-COA, and Research boundary", () => {
    const html = renderToStaticMarkup(
      <MemberProductDetailExperience product={product} />,
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("<main");
    expect(html).toContain("Alpha Research");
    expect(html).toContain("https://media.xeniostechnology.com/media-a");
    expect(html).toContain("$149.00");
    expect(html).toContain("Exact-lot documentation verified");
    expect(html).toContain("This is Research catalog information.");
    expect(html).toContain("Request an alternative");
    expect(html).not.toMatch(/Add to cart|Buy now|private\/|storageKey/);
  });

  it("updates the displayed approved variant using a labeled keyboard control", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root!.render(<MemberProductDetailExperience product={product} />),
    );
    const selector =
      host.querySelector<HTMLSelectElement>("#member-product-variant")!;
    expect(selector.labels?.[0]?.textContent).toContain("Variant");
    act(() => {
      selector.value = "variant-b";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.textContent).toContain("$199.00");
    expect(host.textContent).toContain("Not currently available");
    expect(host.textContent).toContain("Exact-lot documentation required");
  });

  it("renders truthful pending, empty, error, and unavailable detail states", () => {
    const pending = renderToStaticMarkup(
      <MemberProductDetailExperience product={product} />,
    );
    const empty = renderToStaticMarkup(
      <MemberProductDetailExperience product={null} />,
    );
    const error = renderToStaticMarkup(
      <MemberProductDetailExperience
        product={product}
        state="error"
        errorMessage="Product request failed."
      />,
    );
    const unavailable = renderToStaticMarkup(
      <MemberProductDetailExperience product={product} state="unavailable" />,
    );
    expect(pending).toContain("Approved storage information is required.");
    expect(empty).toContain("Product not found.");
    expect(error).toContain("Product request failed.");
    expect(unavailable).toContain("This product is not available.");

    for (const state of [
      "loading",
      "error",
      "unavailable",
      "unauthorized",
    ] as const) {
      const html = renderToStaticMarkup(
        <MemberProductDetailExperience
          product={product}
          state={state}
          errorMessage="Catalog request failed."
        />,
      );
      expect(html).toContain("Product information");
      expect(html).not.toContain("Alpha Research");
      expect(html).not.toContain("Reviewed summary.");
      expect(html).not.toContain("Request an alternative");
      expect(html).not.toContain("media-a");
      expect(html).not.toContain("$149.00");
      expect(html).not.toContain(">Research<");
    }
  });

  it("keeps GLP entries non-transactional and free of treatment controls", () => {
    const glp: MemberProductDetail = {
      ...product,
      id: "glp-1",
      slug: "glp-1",
      displayName: "GLP-1 pathway",
      canonicalName: "GLP-1 pathway",
      aliases: [],
      lane: "future_clinical",
      category: MEMBER_CATALOG_FUTURE_CLINICAL_CATEGORY,
      classification: MEMBER_CATALOG_FUTURE_CLINICAL_CLASSIFICATION,
      summary: MEMBER_CATALOG_NONTRANSACTIONAL_SUMMARY,
      displayState: "catalog_only",
      price: null,
      selection: null,
      readiness: null,
      overview: null,
      specifications: null,
      researchInformation: null,
      storageInformation: null,
      shippingInformation: null,
      returnInformation: null,
      disclaimers: null,
      reviewDate: null,
      variants: [],
      variantCount: 0,
    };
    const html = renderToStaticMarkup(
      <MemberProductDetailExperience product={glp} />,
    );
    expect(html).toContain("Catalog information");
    expect(html).toContain("not prescribing");
    expect(html).not.toContain("$149.00");
    expect(html).not.toContain("SKU-A");
    expect(html).not.toContain("10 mg");
    expect(html).not.toMatch(/Start treatment|Choose dose|Book clinician|Add to cart/);
  });

  it("uses reflow-safe structures at desktop/720/375/320 and 200% zoom", () => {
    const html = renderToStaticMarkup(
      <MemberProductDetailExperience product={product} />,
    );
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).not.toMatch(/min-width:\s*[4-9]\d\dpx|width:\s*[4-9]\d\dpx/);
    expect(html).not.toContain("overflow-x:scroll");
  });
});

// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MemberCatalog, MemberProductDetail } from "@shared/research/member-catalog";
import { quoteOnlyMemberCatalog, quoteOnlyMemberProductDetail } from "@shared/research/member-catalog-quote-only";
import { adaptMemberCatalog, adaptMemberProductDetail } from "../adapters/memberCatalog";
import { MemberCatalogExperience } from "./MemberCatalogExperience";
import { MemberProductDetailExperience } from "./MemberProductDetailExperience";

/**
 * WHAT A MEMBER SEES UNDER QUOTE-ONLY, ON THE PAGES AS THEY ARE TODAY.
 *
 * No page file changes for quote-only. The server answer goes through the
 * real adapter and into the real pages, and the pages already have words for
 * the state it arrives in: "Catalog information" and "Price on request".
 * This file pins that, and pins that no amount is drawn. Synthetic values only.
 */

const AT = "2026-07-26T22:00:00.000Z";
const price = { id: "price-a", amountCents: 14900, currency: "USD", effectiveAt: "2026-07-01T00:00:00.000Z", expiresAt: null, version: 1 };
const media = {
  mediaId: "media-a", productId: "product-a", href: "https://media.xeniostechnology.com/media-a",
  altText: "Alpha package", filename: "alpha.webp", sourceVersion: "media-v1",
  policy: "xenios_public_media_v1", expiresAt: null,
};
const readiness = {
  ready: true, verifiedInputCount: 1,
  inputVersions: [{ id: "input-a", version: 1 }], domainVersions: [{ domain: "products", version: 1 }],
};
const selection = {
  productId: "product-a", variantId: "variant-a", sku: "SKU-A", audience: "member",
  audienceEligibility: { audience: "member", state: "authorized", sourceVersion: "member-v1", evaluatedAt: AT },
  price,
  media: { id: "media-a", kind: "primary_image", altText: "Alpha package" },
  canonicalReadiness: readiness,
  inventoryEligibility: { productId: "product-a", variantId: "variant-a", state: "eligible", sourceVersion: "inventory-v1", evaluatedAt: AT },
  evaluatedAt: AT,
};
const card = {
  id: "product-a", slug: "product-a", displayName: "Alpha Research", aliases: ["A-1"], lane: "research_material",
  category: "Research", classification: "Research material", summary: "Reviewed summary.",
  displayState: "available", media, price, readiness, selection, variantCount: 1, updatedAt: AT,
};
const CATALOG = {
  audience: "member", currency: "USD", evaluatedAt: AT, items: [card], categories: ["Research"], lanes: ["research_material"],
} as unknown as MemberCatalog;
const PRODUCT = {
  ...card, audience: "member", currency: "USD", evaluatedAt: AT, canonicalName: "Alpha",
  overview: "Reviewed overview.", specifications: "Reviewed specifications.", researchInformation: null,
  storageInformation: null, shippingInformation: null, returnInformation: null, disclaimers: "Research use only.",
  reviewDate: "2026-07-20",
  variants: [{
    id: "variant-a", productId: "product-a", sku: "SKU-A", label: "Standard", strength: "10 mg", size: null,
    format: "Vial", presentation: "Single unit", shippingClass: "standard", price,
    availability: "available", lotCoaState: "verified", selection, selectionFailure: null,
  }],
  relatedProducts: [], researchOnlyBoundary: true,
} as unknown as MemberProductDetail;

/** The server answer as the browser receives it: through JSON, then the real adapter. */
function received<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function catalogPage(catalog: MemberCatalog): string {
  const adapted = adaptMemberCatalog({ ok: true, catalog: received(catalog) });
  if (!adapted.ok) throw new Error("the adapter refused the catalog");
  return renderToStaticMarkup(<MemberCatalogExperience catalog={adapted.catalog} />);
}

function detailPage(product: MemberProductDetail): string {
  const adapted = adaptMemberProductDetail({ ok: true, product: received(product) });
  if (!adapted.ok) throw new Error("the adapter refused the product");
  return renderToStaticMarkup(<MemberProductDetailExperience product={adapted.product} />);
}

describe("the member catalog page", () => {
  it("draws the member price today", () => {
    const html = catalogPage(CATALOG);
    expect(html).toContain("Member price");
    expect(html).toContain("$149.00");
  });

  it("draws no amount under quote-only, and says the price is on request", () => {
    const html = catalogPage(quoteOnlyMemberCatalog(CATALOG));
    expect(html).not.toContain("$");
    expect(html).not.toContain("149");
    expect(html).not.toContain("Member price");
    expect(html).toContain("Price on request");
    expect(html).toContain("Catalog information");
    // The product is still there, with its name, summary and link.
    expect(html).toContain("Alpha Research");
    expect(html).toContain("Reviewed summary.");
    expect(html).toContain("/research/member/products/product-a");
  });
});

describe("the member product page", () => {
  it("draws the member price today", () => {
    const html = detailPage(PRODUCT);
    expect(html).toContain("Member price");
    expect(html).toContain("$149.00");
  });

  it("draws no amount under quote-only, and keeps the variant and its facts", () => {
    const html = detailPage(quoteOnlyMemberProductDetail(PRODUCT));
    expect(html).not.toContain("$");
    expect(html).not.toContain("149");
    expect(html).not.toContain("Member price");
    expect(html).toContain("Price on request");
    expect(html).toContain("Catalog information");
    expect(html).toContain("SKU-A");
    expect(html).toContain("Reviewed overview.");
  });
});

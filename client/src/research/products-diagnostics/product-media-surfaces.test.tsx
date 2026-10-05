// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { MemberCatalog, MemberProductDetail } from "@shared/research/member-catalog";
import { MemberCatalogExperience } from "./MemberCatalogExperience";
import { MemberProductDetailExperience } from "./MemberProductDetailExperience";
import { EarlyAccessProductCard, type EarlyAccessCardProduct } from "../early-access/EarlyAccessProductCard";
import { EarlyAccessOrderSummary } from "../early-access/EarlyAccessOrderSummary";

const media = { mediaId: "media-a", productId: "product-a", variantId: "variant-a",
  href: "https://media.xeniostechnology.com/product-a/media-a/a.webp", filename: "a.webp",
  altText: "Illustrative package", width: 1024, height: 1024, contentSha256: "a".repeat(64),
  sourceVersion: "review-1", policy: "xenios_public_media_v1" as const, expiresAt: null, illustrative: true };
const price = { id: "price-a", amountCents: 2500, currency: "USD", version: 1,
  effectiveAt: "2026-10-01T00:00:00.000Z", expiresAt: null };
const product: MemberProductDetail = {
  id: "product-a", slug: "alpha", displayName: "Alpha", canonicalName: "Alpha", aliases: [],
  lane: "research_material", category: "Research", classification: "Research material", summary: "Reviewed facts.",
  displayState: "unavailable", media, price, readiness: null, selection: null, variantCount: 1,
  updatedAt: "2026-10-01T00:00:00.000Z", audience: "member", currency: "USD", evaluatedAt: "2026-10-01T00:00:00.000Z",
  overview: null, specifications: null, researchInformation: null, storageInformation: null,
  shippingInformation: null, returnInformation: null, disclaimers: null, reviewDate: null,
  relatedProducts: [], researchOnlyBoundary: true,
  variants: [{ id: "variant-a", productId: "product-a", sku: "SKU-A", label: "Exact variant A",
    strength: null, size: null, format: null, presentation: null, shippingClass: null, price,
    availability: "unavailable", lotCoaState: "required", selection: null, selectionFailure: "inventory_unavailable" }],
};
function catalog(item: MemberProductDetail): MemberCatalog {
  return { audience: "member", currency: "USD", evaluatedAt: item.evaluatedAt,
    items: [item], categories: [item.category], lanes: [item.lane] };
}
function withoutPresentation(markup: string) {
  const host = document.createElement("div"); host.innerHTML = markup;
  host.querySelectorAll(".xenios-product-media, link[as=image]").forEach((element) => element.remove());
  return host.innerHTML;
}
describe("media stays outside customer action and price truth", () => {
  it("uses identical media ID and delivery hash on member card and detail", () => {
    for (const html of [renderToStaticMarkup(<MemberCatalogExperience catalog={catalog(product)} />),
      renderToStaticMarkup(<MemberProductDetailExperience product={product} />)]) {
      expect(html).toContain(`data-media-id="${media.mediaId}"`);
      expect(html).toContain(`data-content-sha256="${media.contentSha256}"`);
      expect(html).toContain(media.href);
    }
  });
  it.each(["available", "unavailable", "documentation_pending", "pricing_pending", "catalog_only"] as const)(
    "preserves all non-media markup in %s state", (displayState) => {
      const item = { ...product, displayState };
      for (const render of [
        (p: MemberProductDetail) => renderToStaticMarkup(<MemberCatalogExperience catalog={catalog(p)} />),
        (p: MemberProductDetail) => renderToStaticMarkup(<MemberProductDetailExperience product={p} />),
      ]) {
        const baseline = withoutPresentation(render(item));
        for (const alternative of [null, { ...media, contentSha256: "bad" }, { ...media, variantId: "other" }]) {
          expect(withoutPresentation(render({ ...item, media: alternative }))).toBe(baseline);
        }
      }
    });
  it.each(["AVAILABLE", "AVAILABILITY_CONFIRMATION_REQUIRED", "TEMPORARILY_HELD"] as const)(
    "reserves fallback on EA %s without accepting invented DTO imagery", (availability) => {
      const item: EarlyAccessCardProduct = { productId: "product-a", variantId: "variant-a", name: "Alpha",
        strength: "Exact variant A", description: "Reviewed facts.", currency: "USD", quantityLimit: 20,
        availability, unitPriceCents: availability === "TEMPORARILY_HELD" ? null : 2500 };
      const render = (p: EarlyAccessCardProduct) => renderToStaticMarkup(<EarlyAccessProductCard
        product={p} quantity={1} onQuantityChange={() => {}} onSelect={() => {}} />);
      const baseline = render(item);
      expect(baseline).toContain("An approved product image is not available.");
      expect(baseline).not.toContain("<img");
      const withUnapprovedMedia = { ...item, media };
      expect(render(withUnapprovedMedia)).toBe(baseline);
    });
  it("keeps summary/payment/status surfaces text-only", () => {
    const html = renderToStaticMarkup(<EarlyAccessOrderSummary summary={{
      lines: [{ id: "line-a", label: "Alpha", quantity: 1, unitPriceCents: 2500, lineTotalCents: 2500 }], totalCents: 2500,
    }} />);
    expect(html).not.toMatch(/<img|xenios-product-media/);
    for (const file of ["early-access/EarlyAccessOrderSummary.tsx", "early-access/cart/EarlyAccessCartReview.tsx",
      "early-access/cart/EarlyAccessCartPayment.tsx", "pages/member/Cart.tsx", "pages/member/Checkout.tsx",
      "assisted-order/AssistedOrderConfirmationPage.tsx", "assisted-order/AssistedOrderStatusPage.tsx"]) {
      expect(readFileSync(`client/src/research/${file}`, "utf8")).not.toMatch(/<img|ProductMedia/);
    }
    const assisted = readFileSync("client/src/research/assisted-order/AssistedOrderPage.tsx", "utf8");
    expect(assisted.match(/<ProductMedia/g)).toHaveLength(1);
    expect(assisted.indexOf("<ProductMedia")).toBeLessThan(assisted.indexOf("export function AssistedOrderPage"));
  });
});

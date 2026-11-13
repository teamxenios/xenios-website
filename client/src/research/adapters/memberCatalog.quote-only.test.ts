import { describe, expect, it } from "vitest";

import { catalogPriceFields } from "@shared/research/early-access/quote-only";
import type { MemberCatalog, MemberProductDetail } from "@shared/research/member-catalog";
import {
  MEMBER_QUOTE_ONLY_DISPLAY_STATE,
  MEMBER_QUOTE_ONLY_SELECTION_FAILURE,
  quoteOnlyMemberCatalog,
  quoteOnlyMemberProductDetail,
} from "@shared/research/member-catalog-quote-only";
import { adaptMemberCatalog, adaptMemberProductDetail } from "./memberCatalog";

/**
 * QUOTE-ONLY ON THE MEMBER CATALOG, AS THE BROWSER RECEIVES IT.
 *
 * Removing the member price is not enough by itself. This adapter refuses a
 * whole catalog when a product says "available" without a price and a
 * selection, and refuses a variant that has neither a selection nor a reason
 * for lacking one. A server that only nulled the price would therefore turn
 * the member catalog into an error page, on every client already deployed.
 *
 * So the quote-only projection moves each product to a state this adapter
 * already accepts, and this file proves it with the real adapter: the
 * projected payload is accepted, carries no price, and keeps everything a
 * member reads to choose a product. Synthetic values only.
 */

const AT = "2026-07-26T22:00:00.000Z";
const price = { id: "price-a", amountCents: 14900, currency: "USD", effectiveAt: "2026-07-01T00:00:00.123Z", expiresAt: null, version: 2 };
const media = {
  mediaId: "media-a", productId: "product-a", href: "https://media.xeniostechnology.com/media-a",
  altText: "Product A package", filename: "product-a.webp", sourceVersion: "media-v1",
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
  media: { id: "media-a", kind: "primary_image", altText: "Product A package" },
  canonicalReadiness: readiness,
  inventoryEligibility: { productId: "product-a", variantId: "variant-a", state: "eligible", sourceVersion: "inventory-v1", evaluatedAt: AT },
  evaluatedAt: AT,
};
/** A product a member can buy today: price, selection, "available". */
const available = {
  id: "product-a", slug: "product-a", displayName: "Product A", aliases: ["A-1"], lane: "research_material",
  category: "Research", classification: "Research material", summary: "Reviewed summary.",
  displayState: "available", media, price, readiness, selection, variantCount: 1, updatedAt: AT,
};
/** A product with a price on file that is not purchasable: no selection, a stated reason. */
const pending = {
  ...available, id: "product-b", slug: "product-b", displayName: "Product B",
  displayState: "documentation_pending", media: null, readiness: null, selection: null,
};
/** A clinical pathway entry, which never carried a price. */
const pathway = {
  id: "product-c", slug: "product-c", displayName: "Synthetic pathway", aliases: [], lane: "future_clinical",
  category: "Research pathways", classification: "Research catalog pathway",
  summary: "Research pathway information is being prepared. This catalog state does not offer prescribing, dosing, or treatment.",
  displayState: "catalog_only", media: null, price: null, readiness: null, selection: null, variantCount: 0, updatedAt: AT,
};
const catalog = {
  audience: "member", currency: "USD", evaluatedAt: AT,
  items: [available, pending, pathway], categories: ["Research", "Research pathways"], lanes: ["research_material", "future_clinical"],
} as unknown as MemberCatalog;
const detail = {
  ...available,
  audience: "member", currency: "USD", evaluatedAt: AT, canonicalName: "Product A",
  overview: "Reviewed overview.", specifications: "Reviewed specifications.", researchInformation: "Research information.",
  storageInformation: "Storage information.", shippingInformation: "Shipping information.",
  returnInformation: "Return information.", disclaimers: "Research use only.", reviewDate: "2026-07-20",
  variants: [
    {
      id: "variant-a", productId: "product-a", sku: "SKU-A", label: "Standard", strength: "10 mg", size: null,
      format: "Vial", presentation: "Single unit", shippingClass: "standard", price,
      availability: "available", lotCoaState: "verified", selection, selectionFailure: null,
    },
    {
      id: "variant-b", productId: "product-a", sku: "SKU-B", label: "Large", strength: "20 mg", size: null,
      format: "Vial", presentation: "Single unit", shippingClass: "standard", price: { ...price, id: "price-b", amountCents: 24900 },
      availability: "unavailable", lotCoaState: "required", selection: null, selectionFailure: "inventory_unavailable",
    },
  ],
  relatedProducts: [pending],
  researchOnlyBoundary: true,
} as unknown as MemberProductDetail;

describe("the fixtures are what this file says they are", () => {
  it("the priced catalog and detail are accepted by the adapter and do carry prices", () => {
    expect(adaptMemberCatalog({ ok: true, catalog }).ok).toBe(true);
    expect(adaptMemberProductDetail({ ok: true, product: detail }).ok).toBe(true);
    expect(catalogPriceFields(catalog).length).toBeGreaterThan(0);
    expect(catalogPriceFields(detail).length).toBeGreaterThan(0);
  });

  it("removing only the price and the selection is refused by the adapter", () => {
    const naive = { ...catalog, items: catalog.items.map((item) => ({ ...item, price: null, selection: null })) };
    expect(adaptMemberCatalog({ ok: true, catalog: naive })).toEqual({ ok: false, code: "invalid_projection" });
  });
});

describe("the quote-only member catalog", () => {
  const projected = quoteOnlyMemberCatalog(catalog);

  it("carries no price anywhere", () => {
    expect(catalogPriceFields(projected)).toEqual([]);
    for (const item of projected.items) {
      expect(item.price).toBeNull();
      expect(item.selection).toBeNull();
    }
  });

  it("is accepted by the adapter every deployed client runs", () => {
    const adapted = adaptMemberCatalog({ ok: true, catalog: projected });
    expect(adapted.ok).toBe(true);
    if (adapted.ok) expect(adapted.catalog.items).toHaveLength(3);
  });

  it("moves a purchasable product to the informational state, and leaves every other state alone", () => {
    const [first, second, third] = projected.items;
    expect(first?.displayState).toBe(MEMBER_QUOTE_ONLY_DISPLAY_STATE);
    expect(MEMBER_QUOTE_ONLY_DISPLAY_STATE).toBe("catalog_only");
    expect(second?.displayState).toBe("documentation_pending");
    expect(third?.displayState).toBe("catalog_only");
  });

  it("keeps what a member reads to choose a product", () => {
    const [first] = projected.items;
    expect(first).toMatchObject({
      id: "product-a", slug: "product-a", displayName: "Product A", aliases: ["A-1"], lane: "research_material",
      category: "Research", classification: "Research material", summary: "Reviewed summary.", variantCount: 1,
    });
    expect(first?.media).toEqual(media);
    expect(projected.categories).toEqual(catalog.categories);
    expect(projected.lanes).toEqual(catalog.lanes);
    expect(projected.evaluatedAt).toBe(AT);
  });

  it("does not change the catalog it was given", () => {
    expect(catalog.items[0]?.price?.amountCents).toBe(14900);
    expect(catalog.items[0]?.displayState).toBe("available");
  });
});

describe("the quote-only member product detail", () => {
  const projected = quoteOnlyMemberProductDetail(detail);

  it("carries no price on the product, its variants or its related products", () => {
    expect(catalogPriceFields(projected)).toEqual([]);
    expect(projected.price).toBeNull();
    expect(projected.selection).toBeNull();
    for (const variant of projected.variants) {
      expect(variant.price).toBeNull();
      expect(variant.selection).toBeNull();
    }
    for (const related of projected.relatedProducts) expect(related.price).toBeNull();
  });

  it("is accepted by the adapter every deployed client runs", () => {
    const adapted = adaptMemberProductDetail({ ok: true, product: projected });
    expect(adapted.ok).toBe(true);
  });

  it("gives a variant that lost its selection a reason, and keeps a reason that was already there", () => {
    const [first, second] = projected.variants;
    expect(first?.selectionFailure).toBe(MEMBER_QUOTE_ONLY_SELECTION_FAILURE);
    expect(MEMBER_QUOTE_ONLY_SELECTION_FAILURE).toBe("price_missing");
    expect(second?.selectionFailure).toBe("inventory_unavailable");
  });

  it("keeps the strength, format, stock and certificate facts of each variant", () => {
    expect(projected.variants[0]).toMatchObject({
      id: "variant-a", sku: "SKU-A", label: "Standard", strength: "10 mg", format: "Vial",
      presentation: "Single unit", availability: "available", lotCoaState: "verified",
    });
    expect(projected.displayState).toBe("catalog_only");
    expect(projected).toMatchObject({
      overview: "Reviewed overview.", specifications: "Reviewed specifications.",
      disclaimers: "Research use only.", researchOnlyBoundary: true,
    });
  });
});

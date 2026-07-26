import { describe, expect, it } from "vitest";
import {
  adaptMemberCatalog,
  adaptMemberProductDetail,
} from "./memberCatalog";

const AT = "2026-07-26T22:00:00.000Z";
const price = {
  id: "price-a",
  amountCents: 14900,
  currency: "USD",
  effectiveAt: "2026-07-01T00:00:00.123Z",
  expiresAt: null,
  version: 2,
};
const media = {
  mediaId: "media-a",
  productId: "product-a",
  href: "https://media.xeniostechnology.com/media-a",
  altText: "Product A package",
  sourceVersion: "media-v1",
};
const cardBase = {
  id: "product-a",
  slug: "product-a",
  displayName: "Product A",
  aliases: ["A-1"],
  lane: "research_material",
  category: "Research",
  classification: "Research material",
  summary: "Reviewed summary.",
  displayState: "available",
  media,
  price,
  readiness: {
    ready: true,
    verifiedInputCount: 1,
    inputVersions: [{ id: "input-a", version: 1 }],
    domainVersions: [{ domain: "products", version: 1 }],
  },
  selection: null,
  variantCount: 1,
  updatedAt: AT,
};
const selection = {
  productId: "product-a",
  variantId: "variant-a",
  sku: "SKU-A",
  audience: "member",
  audienceEligibility: {
    audience: "member",
    state: "authorized",
    sourceVersion: "member-v1",
    evaluatedAt: AT,
  },
  price,
  media: {
    id: "media-a",
    kind: "primary_image",
    altText: "Product A package",
  },
  canonicalReadiness: {
    ready: true,
    verifiedInputCount: 1,
    inputVersions: [{ id: "input-a", version: 1 }],
    domainVersions: [{ domain: "products", version: 1 }],
  },
  inventoryEligibility: {
    productId: "product-a",
    variantId: "variant-a",
    state: "eligible",
    sourceVersion: "inventory-v1",
    evaluatedAt: AT,
  },
  evaluatedAt: AT,
};
const card = {
  ...cardBase,
  selection,
};
const detail = {
  ...card,
  audience: "member",
  currency: "USD",
  evaluatedAt: AT,
  canonicalName: "Product A",
  overview: "Reviewed overview.",
  specifications: "Reviewed specifications.",
  researchInformation: "Research information.",
  storageInformation: "Storage information.",
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
      price,
      availability: "available",
      lotCoaState: "verified",
      selection,
      selectionFailure: null,
    },
  ],
  relatedProducts: [],
  researchOnlyBoundary: true,
};

describe("member catalog browser adapter", () => {
  it("accepts and reconstructs a normalized catalog projection", () => {
    expect(
      adaptMemberCatalog({
        ok: true,
        catalog: {
          audience: "member",
          currency: "USD",
          evaluatedAt: AT,
          items: [card],
          categories: ["Research"],
          lanes: ["research_material"],
        },
      }),
    ).toEqual({
      ok: true,
      catalog: {
        audience: "member",
        currency: "USD",
        evaluatedAt: AT,
        items: [card],
        categories: ["Research"],
        lanes: ["research_material"],
      },
    });
  });

  it("rejects private fields, unsafe media, duplicate identity, and raw timestamps", () => {
    const base = {
      ok: true,
      catalog: {
        audience: "member",
        currency: "USD",
        evaluatedAt: AT,
        items: [card],
        categories: ["Research"],
        lanes: ["research_material"],
      },
    };
    expect(
      adaptMemberCatalog({
        ...base,
        catalog: { ...base.catalog, privateStorageKey: "private/object" },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
    expect(
      adaptMemberCatalog({
        ...base,
        catalog: {
          ...base.catalog,
          items: [
            {
              ...card,
              media: { ...media, href: "http://private.local/object" },
            },
          ],
        },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
    expect(
      adaptMemberCatalog({
        ...base,
        catalog: { ...base.catalog, items: [card, card] },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
    expect(
      adaptMemberCatalog({
        ...base,
        catalog: { ...base.catalog, evaluatedAt: "2026-07-26T22:00:00+00:00" },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
    expect(
      adaptMemberCatalog({
        ...base,
        catalog: { ...base.catalog, currency: "EUR" },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
    expect(
      adaptMemberCatalog({
        ...base,
        catalog: {
          ...base.catalog,
          items: [
            {
              ...card,
              selection: {
                ...selection,
                price: { ...selection.price, amountCents: 1 },
              },
            },
          ],
        },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
  });

  it("accepts exact product detail and preserves the cart selection seam", () => {
    expect(adaptMemberProductDetail({ ok: true, product: detail })).toEqual({
      ok: true,
      product: detail,
    });
  });

  it("rejects cross-product variants, malformed readiness, and leaked inventory detail", () => {
    expect(
      adaptMemberProductDetail({
        ok: true,
        product: {
          ...detail,
          variants: [
            { ...detail.variants[0], productId: "product-b" },
          ],
        },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
    expect(
      adaptMemberProductDetail({
        ok: true,
        product: {
          ...detail,
          readiness: {
            ...detail.readiness,
            inputVersions: [{ id: "", version: 0 }],
          },
        },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
    expect(
      adaptMemberProductDetail({
        ok: true,
        product: {
          ...detail,
          variants: [
            {
              ...detail.variants[0],
              reason: "lot LOT-1 at warehouse 9",
            },
          ],
        },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
    expect(
      adaptMemberProductDetail({
        ok: true,
        product: {
          ...detail,
          variants: [
            {
              ...detail.variants[0],
              selection: {
                ...selection,
                audience: "professional",
              },
              selectionFailure: null,
            },
          ],
        },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
    expect(
      adaptMemberProductDetail({
        ok: true,
        product: {
          ...detail,
          price: {
            ...price,
            effectiveAt: "2026-07-27T00:00:00.000Z",
          },
        },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
    expect(
      adaptMemberProductDetail({
        ok: true,
        product: {
          ...detail,
          currency: "EUR",
        },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
    expect(
      adaptMemberProductDetail({
        ok: true,
        product: {
          ...detail,
          variants: [
            {
              ...detail.variants[0],
              selection: {
                ...selection,
                price: {
                  ...selection.price,
                  effectiveAt: "2026-07-01T00:00:00.000Z",
                },
              },
            },
          ],
        },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
  });

  it("preserves a truthful not-found result", () => {
    expect(adaptMemberProductDetail({ ok: false, code: "not_found" })).toEqual({
      ok: false,
      code: "not_found",
    });
  });
});

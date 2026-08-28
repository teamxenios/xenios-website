import { describe, expect, it } from "vitest";
import type {
  MasterOfferingAction,
  MasterOfferingCardView,
  MasterOfferingCatalogPage,
  MasterOfferingDetailView,
  MasterOfferingVariantSummary,
} from "@shared/research/master-offerings/contract";
import type { MasterOfferingPriceView } from "@shared/research/master-offerings/pricing-contract";
import {
  toPublicStorefrontCard,
  toPublicStorefrontDetail,
  toPublicStorefrontPage,
} from "./projection";
import {
  authorizePublicStorefrontCandidates,
  authorizePublicStorefrontDetail,
  findCurrentPublicStorefrontPublication,
  publicStorefrontCardCopyDigest,
  publicStorefrontDetailCopyDigest,
  type AuthorizedPublicStorefrontCard,
  type AuthorizedPublicStorefrontDetail,
  type PublicStorefrontPublicationRecord,
  type PublicStorefrontPublicationSnapshot,
} from "./publication";

const NOW = "2026-08-28T14:00:00.000Z";
const CATALOG_REVISION_ID = "catalog-projection-test";

const PRICED: MasterOfferingPriceView = {
  state: "priced",
  amountCents: 9900,
  currency: "USD",
  display: "$99.00",
  basis: "exact_listed_unit",
  priceId: "price_secret_1",
  priceVersion: 3,
  effectiveAt: "2026-08-01T00:00:00.000Z",
  expiresAt: null,
};

const ADD_TO_CART: MasterOfferingAction = {
  kind: "add_to_cart",
  label: "Add to Cart",
  productId: "pc_secret_product",
  variantId: "pc_secret_variant",
  sku: "XEN-SECRET-SKU",
  amount: { amountCents: 9900, currency: "USD" },
  evaluatedAt: "2026-08-28T13:59:00.000Z",
} as MasterOfferingAction;

function summary(
  overrides: Partial<MasterOfferingVariantSummary> = {},
): MasterOfferingVariantSummary {
  return {
    id: "mov_v1",
    label: "10 mg vial",
    displayState: "available_now",
    displayLabel: "Available now",
    price: { state: "on_request" },
    action: { kind: "request_access", label: "Request Access", href: "/research/apply" },
    ...overrides,
  };
}

function card(
  variants: readonly MasterOfferingVariantSummary[],
): MasterOfferingCardView {
  return {
    id: "mo_p1",
    slug: "research-vials-bpc-157",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    family: "research_vials",
    familyLabel: "Research Vials",
    category: "Peptides & Research",
    subcategory: "Single peptide",
    brand: null,
    displayState: "available_now",
    displayLabel: "Available now",
    stateExplanation: "Test state explanation.",
    copyState: "approved",
    variantCount: variants.length,
    variants,
    priceSummary: {
      state: "single",
      variantCount: variants.length,
      pricedVariantCount: 1,
      currency: "USD",
      fromCents: 9900,
      toCents: 9900,
      display: "$99.00",
    },
  };
}

function recordFor(
  product: MasterOfferingCardView,
  detailCopyDigest = "0".repeat(64),
): PublicStorefrontPublicationRecord {
  return {
    offeringId: product.id,
    family: product.family,
    slug: product.slug,
    state: "published",
    publicationRevisionId: `publication-${product.id}`,
    copyRevisionId: `copy-${product.id}`,
    cardCopyDigest: publicStorefrontCardCopyDigest(product),
    detailCopyDigest,
    publishedAt: "2026-08-28T13:58:00.000Z",
    effectiveAt: "2026-08-28T13:59:00.000Z",
    expiresAt: null,
    revokedAt: null,
    supersededAt: null,
  };
}

function snapshot(
  records: readonly PublicStorefrontPublicationRecord[],
): PublicStorefrontPublicationSnapshot {
  return {
    schemaVersion: 1,
    authorityRevisionId: "authority-projection-test",
    catalogRevisionId: CATALOG_REVISION_ID,
    readAt: NOW,
    validUntil: "2026-08-28T14:00:10.000Z",
    records,
  };
}

function publishedCard(
  product: MasterOfferingCardView,
): AuthorizedPublicStorefrontCard {
  const publication = snapshot([recordFor(product)]);
  const authorized = authorizePublicStorefrontCandidates(publication, {
    schemaVersion: 1,
    catalogRevisionId: CATALOG_REVISION_ID,
    products: [product],
  });
  expect(authorized).not.toBeNull();
  return (authorized as readonly AuthorizedPublicStorefrontCard[])[0];
}

function publishedDetail(
  product: MasterOfferingDetailView,
): AuthorizedPublicStorefrontDetail {
  const record = recordFor(product, publicStorefrontDetailCopyDigest(product));
  const publication = snapshot([record]);
  const current = findCurrentPublicStorefrontPublication(
    publication,
    product.family,
    product.slug,
  );
  expect(current).not.toBeNull();
  const authorized = authorizePublicStorefrontDetail(product, current!);
  expect(authorized).not.toBeNull();
  return authorized as AuthorizedPublicStorefrontDetail;
}

describe("public storefront projection", () => {
  it("translates every resolved action into the closed six-word vocabulary", () => {
    const projected = toPublicStorefrontCard(
      publishedCard(card([
        summary({ id: "v_buy", action: ADD_TO_CART, price: PRICED }),
        // A request-family action WITH an approved price is the assisted path.
        // The same action without one is a quote request, proven below.
        summary({ id: "v_req", price: PRICED }),
        summary({ id: "v_req_unpriced" }),
        summary({
          id: "v_quote",
          action: ADD_TO_CART,
          price: { state: "on_request" },
        }),
        summary({
          id: "v_held",
          action: { kind: "notify_me", label: "Notify Me", href: "/x" },
        }),
        summary({
          id: "v_care",
          action: { kind: "explore_care", label: "Explore Care", href: "/care" },
        }),
        summary({ id: "v_none", action: { kind: "none", label: null, href: null } }),
      ])),
    );
    expect(projected.variants.map((v) => [v.id, v.action])).toEqual([
      ["v_buy", "BUY_NOW"],
      ["v_req", "ASSISTED_ORDER"],
      ["v_req_unpriced", "REQUEST_QUOTE"],
      ["v_quote", "REQUEST_QUOTE"],
      ["v_held", "TEMPORARILY_HELD"],
      ["v_care", "CARE"],
      ["v_none", "NOT_AVAILABLE"],
    ]);
    // The card CTA is the strongest variant action, never wider.
    expect(projected.action).toBe("BUY_NOW");
  });

  it("card action fails closed to NOT_AVAILABLE when nothing is actionable", () => {
    const projected = toPublicStorefrontCard(
      publishedCard(
        card([summary({ action: { kind: "none", label: null, href: null } })]),
      ),
    );
    expect(projected.action).toBe("NOT_AVAILABLE");
    // A no-action product still renders as an honest card, never a gap.
    expect(projected.variants).toHaveLength(1);
  });

  it("passes a server-supplied price through reduced, and nothing else", () => {
    const projected = toPublicStorefrontCard(
      publishedCard(card([summary({ action: ADD_TO_CART, price: PRICED })])),
    );
    expect(projected.variants[0].price).toEqual({
      state: "priced",
      amountCents: 9900,
      currency: "USD",
      display: "$99.00",
    });
  });

  it("degrades a malformed upstream amount to on-request, never zero", () => {
    const projected = toPublicStorefrontCard(
      publishedCard(card([
        summary({
          price: { ...PRICED, amountCents: 0 } as MasterOfferingPriceView,
        }),
      ])),
    );
    expect(projected.variants[0].price).toEqual({ state: "on_request" });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('"amountCents":0');
  });

  it("leaks no member-surface identity, provenance, or hrefs", () => {
    const page: MasterOfferingCatalogPage = {
      ok: true,
      page: 2,
      pageSize: 24,
      total: 30,
      totalPages: 2,
      sort: "relevance",
      products: [
        card([
          summary({ action: ADD_TO_CART, price: PRICED }),
          summary({ id: "v2" }),
        ]),
      ],
      facets: {
        families: [{ value: "research_vials", label: "Research Vials", count: 1 }],
        states: [{ value: "available_now", label: "Available now", count: 1 }],
        categories: [{ value: "peptides-research", label: "Peptides & Research", count: 1 }],
      },
    };
    const projected = toPublicStorefrontPage({
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: page.totalPages,
      sort: page.sort,
      products: page.products.map(publishedCard),
      facets: {
        families: page.facets.families,
        categories: page.facets.categories,
      },
    });
    const serialized = JSON.stringify(projected);
    for (const secret of [
      "sku",
      "XEN-SECRET-SKU",
      "pc_secret_product",
      "pc_secret_variant",
      "priceId",
      "priceVersion",
      "href",
      "copyState",
      "canonicalName",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    // The display-state facet is a member filter; the public surface gets
    // families and categories only.
    expect(Object.keys(projected.facets).sort()).toEqual([
      "categories",
      "families",
    ]);
    expect(projected.page).toBe(2);
    expect(projected.total).toBe(30);
    expect(projected.products[0].priceSummary).toBe("$99.00");
  });

  it("detail carries overview and disclosures and nothing extra", () => {
    const projected = toPublicStorefrontDetail(
      publishedDetail({
        ...card([summary()]),
        overview: "An overview.",
        disclosures: ["Research use only."],
      }),
    );
    expect(projected.overview).toBe("An overview.");
    expect(projected.disclosures).toEqual(["Research use only."]);
  });
});

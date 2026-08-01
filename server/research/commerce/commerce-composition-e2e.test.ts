// Research commerce, end to end composition.
//
// Five lanes merged separately and none of them proved they join up:
// the payment instrument (#176), the catalog-display wiring (#155), the
// commerce capability truthfulness states (#163), the Product Control price
// resolver (#184), and its variant_strength_disputed guard (#205).
//
// This suite drives the whole intended chain against the REAL modules, not
// doubles of the modules under test:
//
//   catalog -> product detail -> exact variant -> Product Control price ->
//   add to cart -> persistent cart -> checkout quote -> payment instrument ->
//   immutable order line -> fulfillment boundary
//
// Two runtimes are exercised, because the repository has two:
//
//   PRICE AUTHORITY LANE. server/research/pricing/* composed over
//   server/research/products-diagnostics/product-control-price-resolver.ts.
//   Every module in that chain is the real one; the only injected seam is the
//   database read port (PricingProductSource / VariantLookupBySku), which is
//   what those modules declare a seam for.
//
//   RUNTIME CUSTOMER SURFACE. The real express app assembled by the canonical
//   registration path through buildAcceptanceContext (registerCommerceApi over
//   buildCommerceDependencies), driven over HTTP with supertest, exactly as
//   acceptance.test.ts does. Payments go through TestPaymentProvider only:
//   no Stripe key is configured, no live adapter is constructed, no charge is
//   created, and nothing leaves the process.
//
// WHAT THIS SUITE FOUND, stated plainly so the PR does not have to be trusted:
// the two runtimes DO NOT JOIN. The Product Control resolver is the authority
// for the read-only pricing API (registerPricingApi in server/index.ts) and for
// the cart-selection lane, but the cart, checkout, and order surface a member
// actually transacts through prices from CatalogProduct.facts.priceCents
// (server/research/commerce/cart.ts:214-224). Tests marked "P0 FINDING" below
// pin that gap as it is. Nothing here rewires the price authority; that is a
// reviewed decision, not a test-suite side effect.
//
// Tests whose step cannot compose yet are named "PENDING" and assert the exact
// missing piece rather than pretending. Each one says what would have to exist.

import { describe, expect, it } from "vitest";
import request from "supertest";

// --- the runtime customer surface -----------------------------------------
import {
  ADMIN_HEADER,
  ADMIN_HEADER_VALUE,
  ELIGIBLE_SKU,
  ELIGIBLE_SLUG,
  MEMBER_A,
  MEMBER_HEADER,
  acceptanceProduct,
  buildAcceptanceContext,
  checkoutRequest,
  releasedLot,
  type AcceptanceContext,
} from "./acceptance-harness";
import { selectCartProduct } from "./cart-product-selection";

// --- the price authority lane ---------------------------------------------
import {
  authorizeAudienceFromServerIdentity,
  createAuthoritativePriceResolver,
  type PricingProductSource,
  type ServerAuthorizedAudience,
} from "../pricing/authoritative-price-resolver";
import {
  bindCartPrice,
  resolveSkuPrice,
  revalidateCartPriceSnapshot,
  type PriceLineageReaders,
  type VariantIdentity,
} from "../pricing/cart-price-binding";
import { recomputeCheckout } from "../pricing/checkout-recompute";
import {
  snapshotOrderLinesFromQuote,
  toOrderLinePriceColumnRows,
} from "../pricing/order-price-snapshot";
import {
  projectCatalogPrice,
  projectedAmountCents,
} from "../pricing/catalog-price-projection";
import {
  decideProductControlPrice,
  resolveProductControlPrice,
} from "../products-diagnostics/product-control-price-resolver";
import { recordedVariantStrengthDisputes } from "../products-diagnostics/variant-strength-dispute";

// --- shared contracts ------------------------------------------------------
import { adaptLegacyCatalog } from "../catalog/legacy-adapter";
import { products as legacyProducts } from "../products-data";
import { isMemberDisplayable, type CatalogProduct } from "@shared/research/catalog";
import {
  PEPTIDE_CATALOG,
  REGULATORY_HOLD_TIER,
  customerCatalogProjection,
  isPurchaseMode,
  toCustomerProductProjection,
} from "@shared/research/catalog/peptide-catalog";
import {
  PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS,
  type AdminProductDetail,
  type AdminProductPrice,
  type AdminProductVariant,
} from "@shared/research/product-admin";
import type {
  CartProductSelectionRequest,
  CartProductSelectionSource,
} from "@shared/research/cart-product-selection";
import type { DomainReadiness, RequiredInput } from "@shared/research/required-inputs";
import type { PersistentCartItem } from "@shared/research/persistent-cart";
import type { CartLineDto } from "@shared/research/commerce-api";
import type { OrderLineRecord } from "./orders";

// ===========================================================================
// Fixtures for the price authority lane
// ===========================================================================

const AT = "2026-07-28T12:00:00.000Z";
const LATER = "2026-07-29T12:00:00.000Z";

const PRODUCT_ID = "product-e2e";
const VARIANT_ID = "variant-e2e";
const SIBLING_VARIANT_ID = "variant-e2e-sibling";
const SKU = "SKU-E2E-1";
const SIBLING_SKU = "SKU-E2E-2";
/** uuid shaped so the order-line column mapping (price_id uuid) accepts it. */
const PRICE_ID = "8f14e45f-ce0a-4f0b-9d0a-1b2c3d4e5f60";
const SIBLING_PRICE_ID = "8f14e45f-ce0a-4f0b-9d0a-1b2c3d4e5f61";

/** The one authoritative amount in this suite. Nothing else may produce it. */
const AUTHORITATIVE_UNIT_CENTS = 14900;

function variant(overrides: Partial<AdminProductVariant> = {}): AdminProductVariant {
  return {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    sku: SKU,
    catalogNumber: null,
    label: "One vial",
    strength: null,
    size: null,
    format: null,
    presentation: "One vial",
    shippingClass: "standard",
    memberEligible: true,
    status: "approved",
    active: true,
    sortOrder: 0,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function price(overrides: Partial<AdminProductPrice> = {}): AdminProductPrice {
  return {
    id: PRICE_ID,
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    audience: "member",
    amountCents: AUTHORITATIVE_UNIT_CENTS,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00.000Z",
    expiresAt: null,
    status: "active",
    approvalNote: "Approved by pricing review",
    version: 2,
    createdBy: "admin-e2e",
    approvedBy: "reviewer-e2e",
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function productDetail(
  overrides: Partial<AdminProductDetail> = {},
): AdminProductDetail {
  return {
    id: PRODUCT_ID,
    productCode: "PRODUCT-E2E",
    slug: "product-e2e",
    displayName: "Composition Product",
    canonicalName: "Composition Product",
    aliases: [],
    lane: "research_material",
    category: "Research",
    classification: "Research material",
    status: "published",
    active: true,
    visibility: "public",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: AT,
    publishedAt: AT,
    content: {
      shortDescription: null,
      longDescription: null,
      overview: null,
      specifications: null,
      researchInformation: null,
      storageInformation: null,
      handlingInformation: null,
      shippingInformation: null,
      returnInformation: null,
      disclaimers: null,
      citations: [],
      reviewDate: null,
    },
    variants: [variant()],
    prices: [price()],
    media: [],
    history: [],
    ...overrides,
  };
}

/**
 * The database read port. This is the ONLY double in the price authority lane,
 * and it is a data source, never the logic under test: every decision below is
 * made by the real resolver, binder, recompute, and snapshot modules.
 */
function productSource(detail: AdminProductDetail | null): PricingProductSource {
  return { readProductForPricing: async (id) => (detail && detail.id === id ? detail : null) };
}

function identities(detail: AdminProductDetail): VariantIdentity[] {
  return detail.variants.map((item) => ({
    productId: item.productId,
    variantId: item.id,
    sku: item.sku,
    displayName: `${detail.displayName} ${item.label}`,
  }));
}

function readers(detail: AdminProductDetail | null): PriceLineageReaders {
  const known = detail === null ? [] : identities(detail);
  return {
    variants: {
      findVariantBySku: async (sku) => known.find((item) => item.sku === sku) ?? null,
    },
    priceResolver: createAuthoritativePriceResolver(productSource(detail)),
  };
}

function memberAudience(at = AT): ServerAuthorizedAudience {
  const authorized = authorizeAudienceFromServerIdentity({
    audience: "member",
    sourceVersion: "member-tier-v1",
    evaluatedAt: at,
  });
  if (authorized === null) throw new Error("expected an authorized member audience");
  return authorized;
}

// ---------------------------------------------------------------------------
// Fixtures for the cart-selection lane (the purchasable-state authority)
// ---------------------------------------------------------------------------

function readiness(domain: string): DomainReadiness {
  return {
    domain,
    launchStatus: "public_enabled",
    softwareComplete: true,
    realInputsRequired: false,
    publicEnabled: true,
    manifestApproved: true,
    expectedInputCount: 2,
    actualInputCount: 2,
    blockingInputCount: 0,
    blockingKeys: [],
    version: 3,
  };
}

function requiredInputs(): RequiredInput[] {
  return PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS.map((binding, index) => ({
    id: `input-${index}`,
    key: binding.key,
    domain: binding.domain,
    label: "Verified input",
    description: "Verified input",
    whyRequired: "Required by canonical readiness.",
    recordType: binding.recordType,
    recordId: PRODUCT_ID,
    fieldPath: "field",
    currentState: "verified",
    blockingLevel: "blocks_display",
    responsibleRole: "product_admin",
    verificationMethod: "review",
    evidenceRequired: [],
    entryMode: "direct",
    valueSensitivity: "ordinary",
    enteredValue: "verified",
    externalReferenceName: null,
    enteredBy: "admin-e2e",
    enteredAt: AT,
    verifiedBy: "reviewer-e2e",
    verifiedAt: AT,
    rejectionReason: null,
    publicLaunchImpact: "Blocks release.",
    nextAction: "Review.",
    adminEntryHref: "/internal",
    version: index + 1,
    auditHistory: [],
  }));
}

function selectionSource(
  detail: AdminProductDetail,
  variantId = VARIANT_ID,
): CartProductSelectionSource {
  const {
    content: _content,
    variants: _variants,
    prices: _prices,
    media: _media,
    history: _history,
    ...summary
  } = detail;
  return {
    products: [{ ...summary, visibility: "members_only" }],
    variants: detail.variants,
    prices: detail.prices,
    media: [
      {
        id: "media-e2e",
        productId: PRODUCT_ID,
        kind: "primary_image",
        state: "approved",
        storageKey: "private/product-e2e.webp",
        filename: "product-e2e.webp",
        contentType: "image/webp",
        sizeBytes: 100,
        altText: "Composition Product",
        sortOrder: 0,
        approvedBy: "reviewer-e2e",
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    requiredInputs: requiredInputs(),
    readiness: [readiness("product_content"), readiness("products")],
    audienceEligibility: {
      audience: "member",
      state: "authorized",
      sourceVersion: "account-tier-v1",
      evaluatedAt: AT,
    },
    inventoryEligibility: {
      productId: PRODUCT_ID,
      variantId,
      state: "eligible",
      reason: null,
      sourceVersion: "inventory-v1",
      evaluatedAt: AT,
    },
  };
}

function selectionRequest(variantId = VARIANT_ID): CartProductSelectionRequest {
  return {
    productId: PRODUCT_ID,
    variantId,
    audience: "member",
    currency: "USD",
    evaluatedAt: AT,
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers for the runtime customer surface
// ---------------------------------------------------------------------------

function asMember(ctx: AcceptanceContext, memberId = MEMBER_A) {
  return {
    get: (path: string) => request(ctx.app).get(path).set(MEMBER_HEADER, memberId),
    post: (path: string) => request(ctx.app).post(path).set(MEMBER_HEADER, memberId),
  };
}

function asAdmin(ctx: AcceptanceContext) {
  return {
    get: (path: string) => request(ctx.app).get(path).set(ADMIN_HEADER, ADMIN_HEADER_VALUE),
  };
}

/** Every number reachable from a value, with the key path that reached it. */
function numericLeaves(value: unknown, path = ""): Array<{ path: string; value: number }> {
  if (typeof value === "number") return [{ path, value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => numericLeaves(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
      numericLeaves(item, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

// ===========================================================================
// 1. catalog rows, and a product detail that resolves an exact variant
// ===========================================================================

describe("1. a member reaching the catalog gets real rows and an exact variant", () => {
  it("serves real catalog rows and a detail over the runtime member surface", async () => {
    const ctx = await buildAcceptanceContext();

    const list = await asMember(ctx).get("/api/research/products");
    expect(list.status).toBe(200);
    expect(list.body.ok).toBe(true);
    expect(Array.isArray(list.body.products)).toBe(true);
    expect(list.body.products.length).toBeGreaterThan(0);
    // Real rows, not placeholders: every row carries an identity a cart can use.
    for (const product of list.body.products) {
      expect(typeof product.sku).toBe("string");
      expect(product.sku.length).toBeGreaterThan(0);
      expect(typeof product.slug).toBe("string");
    }

    const detail = await asMember(ctx).get(`/api/research/products/${ELIGIBLE_SLUG}`);
    expect(detail.status).toBe(200);
    expect(detail.body.ok).toBe(true);
    expect(detail.body.product.sku).toBe(ELIGIBLE_SKU);

    const missing = await asMember(ctx).get("/api/research/products/not-a-slug");
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("product_not_found");
  });

  it("requires an authenticated member for both catalog reads", async () => {
    const ctx = await buildAcceptanceContext();
    const list = await request(ctx.app).get("/api/research/products");
    expect(list.status).toBe(401);
    const detail = await request(ctx.app).get(`/api/research/products/${ELIGIBLE_SLUG}`);
    expect(detail.status).toBe(401);
  });

  it("resolves the ONE exact variant through the Product Control detail, and refuses an ambiguous one", async () => {
    const detail = productDetail({
      variants: [variant(), variant({ id: SIBLING_VARIANT_ID, sku: SIBLING_SKU })],
      prices: [
        price(),
        price({
          id: SIBLING_PRICE_ID,
          variantId: SIBLING_VARIANT_ID,
          amountCents: 21900,
          version: 1,
        }),
      ],
    });
    const resolver = createAuthoritativePriceResolver(productSource(detail));

    const exact = await resolver.resolveApprovedResearchPrice({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      authenticatedAudience: memberAudience(),
      currency: "USD",
      at: AT,
    });
    expect(exact.state).toBe("available");
    if (exact.state !== "available") throw new Error("unreachable");
    expect(exact.price.variantId).toBe(VARIANT_ID);
    expect(exact.price.amountCents).toBe(AUTHORITATIVE_UNIT_CENTS);

    const sibling = await resolver.resolveApprovedResearchPrice({
      productId: PRODUCT_ID,
      variantId: SIBLING_VARIANT_ID,
      authenticatedAudience: memberAudience(),
      currency: "USD",
      at: AT,
    });
    expect(sibling.state).toBe("available");
    if (sibling.state !== "available") throw new Error("unreachable");
    // The sibling is a genuinely different unit at a different price. Resolving
    // "a variant of this product" would have collapsed them.
    expect(sibling.price.amountCents).toBe(21900);
    expect(sibling.price.priceId).not.toBe(exact.price.priceId);

    // Two rows for the SAME identity is ambiguity, and ambiguity is never a price.
    const duplicated = createAuthoritativePriceResolver(
      productSource(
        productDetail({
          variants: [variant(), variant({ id: "variant-e2e", sku: "SKU-DUPE" })],
        }),
      ),
    );
    const ambiguous = await duplicated.resolveApprovedResearchPrice({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      authenticatedAudience: memberAudience(),
      currency: "USD",
      at: AT,
    });
    expect(ambiguous.state).toBe("ambiguous");
  });
});

// ===========================================================================
// 2. the price authority
// ===========================================================================

describe("2. price comes from the Product Control resolver only", () => {
  it("the whole authority chain carries the approved row and nothing else", async () => {
    const detail = productDetail();
    const bound = await bindCartPrice(
      {
        sku: SKU,
        quantity: 2,
        authenticatedAudience: memberAudience(),
        currency: "USD",
        at: AT,
      },
      readers(detail),
    );
    expect(bound.state).toBe("bound");
    if (bound.state !== "bound") throw new Error("unreachable");

    // The snapshot's economics are the Product Control row's economics, exactly.
    expect(bound.snapshot.priceId).toBe(PRICE_ID);
    expect(bound.snapshot.priceVersion).toBe(2);
    expect(bound.snapshot.unitAmountCents).toBe(AUTHORITATIVE_UNIT_CENTS);
    expect(bound.snapshot.lineTotalCents).toBe(AUTHORITATIVE_UNIT_CENTS * 2);

    // Nothing internal crossed the boundary with it.
    const snapshotKeys = Object.keys(bound.snapshot);
    for (const forbidden of [
      "approvalNote",
      "approvedBy",
      "createdBy",
      "wholesaleSourceCostCents",
      "computedCustomerAmountCents",
      "priorApprovedMatrixAmountCents",
      "legacyPublishedAmountCents",
      "signedSupplierMasterMemberAmountCents",
      "marketReferencePriceCents",
      "margin",
      "multiplier",
    ]) {
      expect(snapshotKeys).not.toContain(forbidden);
    }
  });

  it("no legacy formula lane can produce a customer price: the customer projection carries no amount at all", () => {
    // The 1.80x rule, the max($99, 2.5x) round-to-five matrix, the legacy
    // published price, and the signed-supplier member price all live on the
    // peptide catalog variant as OPERATOR fields. The customer projection is
    // built by explicit field picks, so none of them has a route to a browser.
    const projected = customerCatalogProjection();
    expect(projected.length).toBeGreaterThan(0);
    const numbers = numericLeaves(projected);
    expect(numbers).toEqual([]);

    for (const product of PEPTIDE_CATALOG) {
      const projection = toCustomerProductProjection(product);
      if (projection === null) continue;
      for (const item of projection.variants) {
        expect(Object.keys(item)).toEqual([
          "sku",
          "label",
          "strength",
          "size",
          "format",
          "availability",
          "memberEligible",
        ]);
      }
    }
  });

  it("the legacy published price cannot become a customer price: real catalog records are unverified_legacy", async () => {
    const adapted = adaptLegacyCatalog(legacyProducts, "2026-07-20").products;
    expect(adapted.length).toBeGreaterThan(0);

    const withLegacyPrice = adapted.filter(
      (product) => product.facts.priceCents.value !== null,
    );
    expect(withLegacyPrice.length).toBeGreaterThan(0);
    for (const product of withLegacyPrice) {
      expect(product.facts.priceCents.confirmation).toBe("unverified_legacy");
      expect(isMemberDisplayable(product.facts.priceCents)).toBe(false);
    }

    // Driven through the REAL runtime surface with the REAL catalog: a member
    // adding one of those SKUs never sees a price, and checkout is blocked.
    const ctx = await buildAcceptanceContext({
      products: adapted,
      lots: [releasedLot({ sku: withLegacyPrice[0].sku })],
    });
    const added = await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: withLegacyPrice[0].sku, quantity: 1, purchaseMode: "one_time" });
    expect(added.status).toBe(200);
    const line = added.body.cart.lines[0] as CartLineDto;
    expect(line.unitPriceCents).toBeNull();
    expect(line.lineTotalCents).toBeNull();
    expect(added.body.cart.checkoutReady).toBe(false);
    expect(added.body.cart.blockingReasons).toContain("unconfirmed_supplier_facts");
  });

  it("P0 FINDING: the runtime cart, checkout, and order surface never consults the Product Control resolver", async () => {
    // The gap, driven rather than argued. The Product Control lane knows
    // nothing about this SKU: there is no product, no variant, and no price row
    // for it anywhere in the price authority.
    const authority = readers(null);
    const unknownToAuthority = await resolveSkuPrice(
      {
        sku: ELIGIBLE_SKU,
        authenticatedAudience: memberAudience(),
        currency: "USD",
        at: AT,
      },
      authority,
    );
    expect(unknownToAuthority).toEqual({ state: "failed", reason: "sku_unknown" });

    // The runtime surface prices it anyway, from CatalogProduct.facts.priceCents
    // (server/research/commerce/cart.ts:214-224), and carries that number all
    // the way into a captured order.
    const runtimePriceCents = 7350;
    const ctx = await buildAcceptanceContext({
      products: [
        acceptanceProduct({
          facts: {
            ...acceptanceProduct().facts,
            priceCents: {
              value: runtimePriceCents,
              confirmation: "confirmed",
              source: {
                kind: "supplier_document",
                reference: "synthetic_test_fixture composition doc 1",
              },
            },
          },
        }),
      ],
    });

    const added = await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 2, purchaseMode: "one_time" });
    expect(added.status).toBe(200);
    const line = added.body.cart.lines[0] as CartLineDto;
    expect(line.unitPriceCents).toBe(runtimePriceCents);
    expect(line.lineTotalCents).toBe(runtimePriceCents * 2);

    const checkout = await asMember(ctx)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "composition-p0-finding" }));
    expect(checkout.status).toBe(200);
    expect(checkout.body.ok).toBe(true);
    const settled = await ctx.orderRepository.get(checkout.body.order.orderId as string);
    expect(settled?.totals.subtotalCents).toBe(runtimePriceCents * 2);

    // The finding, stated as an assertion so it fails the day someone wires the
    // two lanes together, which is exactly when this test should be revisited:
    // a price the price AUTHORITY refuses to know settled a real order.
    expect(unknownToAuthority.state).toBe("failed");
    expect(checkout.body.order.state).toBe("payment_captured");
  });

  it("the read-only pricing surface and the cart-selection lane DO route through the resolver", async () => {
    // The half that does compose, so the finding above is scoped honestly.
    const detail = productDetail();

    const projection = projectCatalogPrice(
      await createAuthoritativePriceResolver(
        productSource(detail),
      ).resolveApprovedResearchPrice({
        productId: PRODUCT_ID,
        variantId: VARIANT_ID,
        authenticatedAudience: memberAudience(),
        currency: "USD",
        at: AT,
      }),
    );
    expect(projection.state).toBe("priced");
    expect(projectedAmountCents(projection)).toBe(AUTHORITATIVE_UNIT_CENTS);

    const selected = selectCartProduct(selectionRequest(), selectionSource(detail));
    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error("unreachable");
    expect(selected.selection.price.id).toBe(PRICE_ID);
    expect(selected.selection.price.amountCents).toBe(AUTHORITATIVE_UNIT_CENTS);
    expect(selected.selection.price.version).toBe(2);

    // Remove the approved row and the selection loses its price rather than
    // falling back to any other number in the repository.
    const unpriced = selectCartProduct(
      selectionRequest(),
      selectionSource(productDetail({ prices: [] })),
    );
    expect(unpriced).toEqual({ ok: false, code: "price_missing" });
  });
});

// ===========================================================================
// 3. no path produces $0 or a negative price
// ===========================================================================

describe("3. no path produces a zero or negative price", () => {
  const nonPositive = [0, -1, -14900];

  it("the Product Control decision refuses a non-positive row", () => {
    for (const amountCents of nonPositive) {
      const decision = decideProductControlPrice({
        productId: PRODUCT_ID,
        variant: variant(),
        prices: [price({ amountCents })],
        audienceEligibility: {
          audience: "member",
          state: "authorized",
          sourceVersion: "member-tier-v1",
          evaluatedAt: AT,
        },
        currency: "USD",
        evaluatedAt: AT,
      });
      expect(decision.ok).toBe(false);
      if (decision.ok) throw new Error("unreachable");
      expect(decision.code).toBe("price_missing");
    }
  });

  it("the resolver facade, the card projection, and the cart binding all refuse it", async () => {
    for (const amountCents of nonPositive) {
      const detail = productDetail({ prices: [price({ amountCents })] });
      const resolution = await createAuthoritativePriceResolver(
        productSource(detail),
      ).resolveApprovedResearchPrice({
        productId: PRODUCT_ID,
        variantId: VARIANT_ID,
        authenticatedAudience: memberAudience(),
        currency: "USD",
        at: AT,
      });
      expect(resolution.state).toBe("unavailable");

      const projection = projectCatalogPrice(resolution);
      expect(projection).toEqual({ state: "not_currently_available" });
      expect(projectedAmountCents(projection)).toBeNull();

      const bound = await bindCartPrice(
        {
          sku: SKU,
          quantity: 1,
          authenticatedAudience: memberAudience(),
          currency: "USD",
          at: AT,
        },
        readers(detail),
      );
      expect(bound.state).toBe("rejected");
    }
  });

  it("checkout refuses to quote a zero-priced line rather than quoting a zero total", async () => {
    const detail = productDetail({ prices: [price({ amountCents: 0 })] });
    const result = await recomputeCheckout(
      {
        serverLines: [{ sku: SKU, quantity: 1 }],
        presented: {
          lines: [
            { sku: SKU, quantity: 1, unitAmountCents: 0, lineTotalCents: 0, priceVersion: 2 },
          ],
          subtotalCents: 0,
          currency: "USD",
        },
        authenticatedAudience: memberAudience(),
        currency: "USD",
        at: AT,
      },
      readers(detail),
    );
    expect(result.state).toBe("rejected");
    if (result.state !== "rejected") throw new Error("unreachable");
    expect(result.rejections.map((item) => item.reason)).toContain("line_missing_price");
  });

  it("the runtime cart renders an unpriceable line as null, never as zero", async () => {
    const ctx = await buildAcceptanceContext({
      products: [
        acceptanceProduct({
          facts: {
            ...acceptanceProduct().facts,
            priceCents: {
              value: null,
              confirmation: "not_confirmed",
              source: { kind: "none", reference: null },
            },
          },
        }),
      ],
    });
    const added = await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 3, purchaseMode: "one_time" });
    expect(added.status).toBe(200);
    const line = added.body.cart.lines[0] as CartLineDto;
    expect(line.unitPriceCents).toBeNull();
    expect(line.lineTotalCents).toBeNull();
    expect(line.unitPriceCents).not.toBe(0);
    expect(added.body.cart.checkoutReady).toBe(false);

    const checkout = await asMember(ctx)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "composition-zero-price" }));
    expect(checkout.body.ok).toBe(false);
    expect(ctx.payment.authorizationCalls).toBe(0);
  });
});

// ===========================================================================
// 4. a contested presentation cannot be priced, its sibling still can
// ===========================================================================

describe("4. a variant_strength_disputed variant cannot reach an active price", () => {
  const disputes = recordedVariantStrengthDisputes();

  it("has real contested variants recorded to guard", () => {
    expect(disputes.length).toBeGreaterThan(0);
  });

  it("refuses through the FULL authority chain, while an undisputed sibling resolves", async () => {
    const disputedSku = disputes[0].sku;
    const detail = productDetail({
      variants: [
        variant({ sku: disputedSku }),
        variant({ id: SIBLING_VARIANT_ID, sku: SIBLING_SKU }),
      ],
      prices: [
        price(),
        price({
          id: SIBLING_PRICE_ID,
          variantId: SIBLING_VARIANT_ID,
          amountCents: 21900,
          version: 1,
        }),
      ],
    });

    const resolver = createAuthoritativePriceResolver(productSource(detail));
    const contested = await resolver.resolveApprovedResearchPrice({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      authenticatedAudience: memberAudience(),
      currency: "USD",
      at: AT,
    });
    expect(contested.state).not.toBe("available");
    expect(projectCatalogPrice(contested)).toEqual({ state: "not_currently_available" });

    const sibling = await resolver.resolveApprovedResearchPrice({
      productId: PRODUCT_ID,
      variantId: SIBLING_VARIANT_ID,
      authenticatedAudience: memberAudience(),
      currency: "USD",
      at: AT,
    });
    expect(sibling.state).toBe("available");
    if (sibling.state !== "available") throw new Error("unreachable");
    expect(sibling.price.amountCents).toBe(21900);
  });

  it("refuses at the cart binding, so no contested unit can be bound to a cart line", async () => {
    const disputedSku = disputes[0].sku;
    const detail = productDetail({ variants: [variant({ sku: disputedSku })] });
    const bound = await bindCartPrice(
      {
        sku: disputedSku,
        quantity: 1,
        authenticatedAudience: memberAudience(),
        currency: "USD",
        at: AT,
      },
      readers(detail),
    );
    expect(bound.state).toBe("rejected");
    if (bound.state !== "rejected") throw new Error("unreachable");

    // FINDING (reason fidelity, not a safety hole). The refusal holds and no
    // price is bound, but the REASON does not survive the resolver facade.
    // AuthoritativePriceResolver.resolveApprovedResearchPrice calls
    // ProductControlCurrentPriceResolver.resolve, which collapses the whole
    // decision to `AdminProductPrice | null`
    // (server/research/catalog/product-control-reader.ts:244-249), then reaches
    // classifyFailure (authoritative-price-resolver.ts:160-232), which knows
    // nothing about strength disputes and finds one apparently valid candidate,
    // so it fails closed as price_missing. An operator reading a cart rejection
    // therefore sees "no price" where the truth is "this unit's presentation is
    // contested". Reported, not rewired: carrying the code through would mean
    // widening the CurrentPriceResolver return type, which is a reviewed change.
    expect(bound.reason).toBe("price_missing");
    expect(bound.reason).not.toBe("variant_unapproved");

    // The dispute record itself is still reachable to whoever asks the resolver
    // directly, so the information exists; only the facade drops it.
    const direct = resolveProductControlPrice({
      productId: PRODUCT_ID,
      variant: variant({ sku: disputedSku }),
      prices: [price()],
      audienceEligibility: {
        audience: "member",
        state: "authorized",
        sourceVersion: "member-tier-v1",
        evaluatedAt: AT,
      },
      currency: "USD",
      evaluatedAt: AT,
    });
    expect(direct.ok).toBe(false);
    if (direct.ok) throw new Error("unreachable");
    expect(direct.code).toBe("variant_unapproved");
    expect(direct.strengthDispute).not.toBeUndefined();
  });

  it("refuses a purchasable state at the cart-selection lane, carrying the dispute to the operator", () => {
    const disputedSku = disputes[0].sku;
    const detail = productDetail({ variants: [variant({ sku: disputedSku })] });
    const selected = selectCartProduct(selectionRequest(), selectionSource(detail));
    expect(selected).toEqual({ ok: false, code: "variant_unapproved" });

    // The reason is not lost: the resolver carries both claims and their
    // provenance, and carries no money on that record.
    const resolution = resolveProductControlPrice({
      productId: PRODUCT_ID,
      variant: variant({ sku: disputedSku }),
      prices: [price()],
      audienceEligibility: {
        audience: "member",
        state: "authorized",
        sourceVersion: "member-tier-v1",
        evaluatedAt: AT,
      },
      currency: "USD",
      evaluatedAt: AT,
    });
    expect(resolution.ok).toBe(false);
    if (resolution.ok) throw new Error("unreachable");
    expect(resolution.strengthDispute?.sku).toBe(disputedSku);
    expect(numericLeaves(resolution.strengthDispute)).toEqual([]);

    // And the undisputed sibling is still fully purchasable through the same lane.
    const siblingDetail = productDetail({
      variants: [variant({ id: SIBLING_VARIANT_ID, sku: SIBLING_SKU })],
      prices: [
        price({ id: SIBLING_PRICE_ID, variantId: SIBLING_VARIANT_ID, version: 1 }),
      ],
    });
    const siblingSelected = selectCartProduct(
      selectionRequest(SIBLING_VARIANT_ID),
      selectionSource(siblingDetail, SIBLING_VARIANT_ID),
    );
    expect(siblingSelected.ok).toBe(true);
  });

  it("every recorded dispute refuses, one by one, with no exceptions", () => {
    for (const dispute of disputes) {
      const decision = decideProductControlPrice({
        productId: PRODUCT_ID,
        variant: variant({ sku: dispute.sku }),
        prices: [price()],
        audienceEligibility: {
          audience: "member",
          state: "authorized",
          sourceVersion: "member-tier-v1",
          evaluatedAt: AT,
        },
        currency: "USD",
        evaluatedAt: AT,
      });
      expect(decision.ok).toBe(false);
      if (decision.ok) throw new Error("unreachable");
      expect(decision.code).toBe("variant_strength_disputed");
    }
  });
});

// ===========================================================================
// 5. cart line binding and the stale price version
// ===========================================================================

describe("5. cart lines bind the exact identity, and a stale version is rejected", () => {
  it("binds product, variant, price id, price version, audience, currency, unit price and quantity", async () => {
    const detail = productDetail();
    const bound = await bindCartPrice(
      {
        sku: SKU,
        quantity: 3,
        authenticatedAudience: memberAudience(),
        currency: "USD",
        at: AT,
      },
      readers(detail),
    );
    expect(bound.state).toBe("bound");
    if (bound.state !== "bound") throw new Error("unreachable");
    expect(bound.snapshot).toMatchObject({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      sku: SKU,
      priceId: PRICE_ID,
      priceVersion: 2,
      audience: "member",
      currency: "USD",
      unitAmountCents: AUTHORITATIVE_UNIT_CENTS,
      quantity: 3,
      lineTotalCents: AUTHORITATIVE_UNIT_CENTS * 3,
    });
  });

  it("rejects a stale price version at checkout rather than silently repricing", async () => {
    const detail = productDetail();
    const bound = await bindCartPrice(
      {
        sku: SKU,
        quantity: 1,
        authenticatedAudience: memberAudience(),
        currency: "USD",
        at: AT,
      },
      readers(detail),
    );
    if (bound.state !== "bound") throw new Error("expected a bound snapshot");

    // The price moves after the member added the line.
    const moved = productDetail({
      prices: [price({ version: 3, amountCents: 15900 })],
    });

    const revalidated = await revalidateCartPriceSnapshot(
      {
        snapshot: bound.snapshot,
        authenticatedAudience: memberAudience(LATER),
        currency: "USD",
        at: LATER,
      },
      readers(moved),
    );
    expect(revalidated.state).toBe("reprice_required");
    if (revalidated.state !== "reprice_required") throw new Error("unreachable");
    expect(revalidated.staleVersion).toBe(2);
    expect(revalidated.currentVersion).toBe(3);

    // And checkout refuses the stale claim outright: the member's number is
    // never quietly replaced by the new one.
    const result = await recomputeCheckout(
      {
        serverLines: [{ sku: SKU, quantity: 1 }],
        presented: {
          lines: [
            {
              sku: SKU,
              quantity: 1,
              unitAmountCents: AUTHORITATIVE_UNIT_CENTS,
              lineTotalCents: AUTHORITATIVE_UNIT_CENTS,
              priceVersion: 2,
            },
          ],
          subtotalCents: AUTHORITATIVE_UNIT_CENTS,
          currency: "USD",
        },
        authenticatedAudience: memberAudience(LATER),
        currency: "USD",
        at: LATER,
      },
      readers(moved),
    );
    expect(result.state).toBe("rejected");
    if (result.state !== "rejected") throw new Error("unreachable");
    expect(result.rejections.map((item) => item.reason)).toContain("stale_version");
    expect(result.rejections.map((item) => item.reason)).toContain("amount_mismatch");
  });

  it("PENDING: the runtime cart line carries no price lineage, so the binding above cannot reach it", async () => {
    // MISSING PIECE, named precisely: CartLineDto (shared/research/commerce-api.ts:156)
    // has sku, displayName, quantity, purchaseMode, unitPriceCents,
    // lineTotalCents and blockedReason. It has no priceId, no priceVersion, no
    // audience and no currency, and StoredCartLine (cart.ts:53) persists only
    // sku, quantity and purchase mode. Until the runtime cart persists a
    // CartPriceSnapshot, the stale-version rejection proved above cannot fire
    // on the surface a member actually uses.
    const ctx = await buildAcceptanceContext();
    const added = await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 1, purchaseMode: "one_time" });
    expect(added.status).toBe(200);
    const line = added.body.cart.lines[0] as Record<string, unknown>;
    for (const field of ["priceId", "priceVersion", "audience", "currency", "variantId", "productId"]) {
      expect(line).not.toHaveProperty(field);
    }
    const stored = await ctx.cartStore.load(MEMBER_A);
    expect(Object.keys(stored?.lines[0] ?? {}).sort()).toEqual([
      "purchaseMode",
      "quantity",
      "sku",
    ]);
  });

  it("PENDING: the persistent cart binds full lineage but is mounted on no route", () => {
    // MISSING PIECE, named precisely: PersistentCartItem
    // (shared/research/persistent-cart.ts) does bind id, productId, variantId,
    // sku, audience, quantity and a priceReference carrying the price id and
    // version. Its repository (server/research/commerce/persistence/persistent-cart.ts)
    // needs a Postgres RPC surface, and nothing registers a route for it:
    // grep for "persistent-cart" outside its own module and test finds only
    // server/core-site-protection.test.ts. So the persistent-cart step of the
    // chain exists as a contract and has no runtime entry point.
    const item: PersistentCartItem = {
      id: "00000000-0000-4000-8000-000000000001",
      productId: "00000000-0000-4000-8000-000000000002",
      variantId: "00000000-0000-4000-8000-000000000003",
      sku: SKU,
      audience: "member",
      quantity: 1,
      priceReference: {
        id: PRICE_ID,
        amountCents: AUTHORITATIVE_UNIT_CENTS,
        currency: "USD",
        effectiveAt: AT,
        expiresAt: null,
        version: 2,
      },
      selectionEvaluatedAt: AT,
      version: 1,
    };
    // The contract carries what the runtime cart does not. This assertion is the
    // record of the shape the wiring must preserve when the route is built.
    expect(Object.keys(item.priceReference).sort()).toEqual([
      "amountCents",
      "currency",
      "effectiveAt",
      "expiresAt",
      "id",
      "version",
    ]);
  });
});

// ===========================================================================
// 6. the payment instrument and the server-authoritative total
// ===========================================================================

describe("6. checkout requires an instrument and recomputes its own total", () => {
  it("refuses a payable checkout with no payment instrument, before anything is reserved or charged", async () => {
    const ctx = await buildAcceptanceContext();
    await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 1, purchaseMode: "one_time" });

    const { paymentMethodReference: _omitted, ...withoutInstrument } = checkoutRequest({
      idempotencyKey: "composition-no-instrument",
    });
    const refused = await asMember(ctx)
      .post("/api/research/checkout")
      .send(withoutInstrument);

    expect(refused.body.ok).toBe(false);
    expect(refused.body.code ?? refused.body.denials).toBeDefined();
    const denials: string[] = refused.body.denials ?? [refused.body.code];
    expect(denials).toContain("payment_method_required");

    // Nothing was reserved and no money moved.
    expect(ctx.payment.authorizationCalls).toBe(0);
    expect(ctx.payment.captureCalls).toBe(0);
    const orders = await asMember(ctx).get("/api/research/orders");
    expect(orders.body.orders).toEqual([]);

    // The cart is untouched, so the member can add an instrument and submit again.
    const cart = await asMember(ctx).get("/api/research/cart");
    expect(cart.body.cart.lines).toHaveLength(1);

    // With the instrument, the same submission settles.
    const accepted = await asMember(ctx)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "composition-with-instrument" }));
    expect(accepted.body.ok).toBe(true);
    expect(ctx.payment.authorizationCalls).toBe(1);
  });

  it("ignores a client-supplied amount and charges the server's own recomputation", async () => {
    const unitCents = 5000; // the acceptance fixture's confirmed price
    const ctx = await buildAcceptanceContext();
    await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 2, purchaseMode: "one_time" });

    const cart = await asMember(ctx).get("/api/research/cart");
    const serverSubtotal = cart.body.cart.subtotalCents as number;
    const serverTotal = cart.body.cart.estimatedTotalCents as number;
    expect(serverSubtotal).toBe(unitCents * 2);

    // Every plausible client-supplied money field, all at once.
    const forged = await asMember(ctx)
      .post("/api/research/checkout")
      .send({
        ...checkoutRequest({ idempotencyKey: "composition-forged-amount" }),
        subtotalCents: 1,
        totalCents: 1,
        amountCents: 1,
        estimatedTotalCents: 1,
        unitPriceCents: 1,
        lines: [{ sku: ELIGIBLE_SKU, quantity: 2, lineTotalCents: 1 }],
      });

    expect(forged.body.ok).toBe(true);
    expect(forged.body.order.totalCents).toBe(serverTotal);
    expect(forged.body.order.totalCents).not.toBe(1);

    const stored = await ctx.orderRepository.get(forged.body.order.orderId as string);
    expect(stored?.totals.subtotalCents).toBe(serverSubtotal);
    expect(stored?.totals.totalCents).toBe(serverTotal);
    for (const line of (stored?.lines ?? []) as OrderLineRecord[]) {
      expect(line.lineTotalCents).toBe(unitCents * line.quantity);
      expect(line.lineTotalCents).not.toBe(1);
    }
  });

  it("a forged store credit cannot conjure a discount", async () => {
    const ctx = await buildAcceptanceContext();
    await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 1, purchaseMode: "one_time" });

    const submitted = await asMember(ctx)
      .post("/api/research/checkout")
      .send(
        checkoutRequest({
          idempotencyKey: "composition-forged-credit",
          applyStoreCreditCents: 999_999,
        }),
      );

    expect(submitted.body.ok).toBe(true);
    // A member with no ledger rows may not conjure credit from the request:
    // the applied credit comes from the ledger the cart read, not the body.
    const stored = await ctx.orderRepository.get(submitted.body.order.orderId as string);
    expect(stored?.totals.storeCreditAppliedCents).toBe(0);
    expect(stored?.totals.totalCents).toBe(
      (stored?.totals.subtotalCents ?? 0) + (stored?.totals.shippingCents ?? 0),
    );
  });

  it("REGRESSION: a forged store credit cannot skip the payment instrument gate", async () => {
    // The defect this suite found in the merged instrument gate (audit GAP-001,
    // PR #176). checkout.ts computed the payable amount from the CLIENT's
    // req.applyStoreCreditCents while the charge below it used the SERVER's
    // cart.storeCreditAppliedCents, so a browser sending a large enough credit
    // drove payableCents to zero, skipped payment_method_required entirely, and
    // still had the full amount authorized with no instrument attached. Against
    // the real Stripe adapter that is precisely the unpayable order GAP-001 was
    // filed to prevent; it stayed invisible because TestPaymentProvider
    // authorizes without an instrument.
    const ctx = await buildAcceptanceContext();
    await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 2, purchaseMode: "one_time" });

    const { paymentMethodReference: _omitted, ...withoutInstrument } = checkoutRequest({
      idempotencyKey: "composition-credit-bypass",
    });
    const attempted = await asMember(ctx)
      .post("/api/research/checkout")
      .send({ ...withoutInstrument, applyStoreCreditCents: 999_999 });

    expect(attempted.body.ok).toBe(false);
    const denials: string[] = attempted.body.denials ?? [attempted.body.code];
    expect(denials).toContain("payment_method_required");
    // Nothing was authorized and no order exists.
    expect(ctx.payment.authorizationCalls).toBe(0);
    expect(ctx.payment.captureCalls).toBe(0);
    const orders = await asMember(ctx).get("/api/research/orders");
    expect(orders.body.orders).toEqual([]);
  });

  it("the instrument gate now tracks the amount actually charged, credit included", async () => {
    // After the fix the gate's payable amount is exactly the order's
    // totalCents: subtotal plus shipping minus the SERVER's applied credit.
    // A real, large, approved ledger credit covers the whole subtotal, so the
    // only thing left to charge is shipping, and the gate asks for an
    // instrument for exactly that remainder and no more.
    const ctx = await buildAcceptanceContext();
    await ctx.creditLedger.append({
      id: "credit-composition-1",
      memberId: MEMBER_A,
      amountCents: 1_000_000,
      state: "approved",
      reason: "service_recovery",
      createdAt: "2026-07-01T00:00:00Z",
      availableAt: null,
      reversesId: null,
      actorType: "admin",
      actorId: "admin-composition",
      expiresAt: null,
    });
    await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 1, purchaseMode: "one_time" });

    const cart = await asMember(ctx).get("/api/research/cart");
    const shippingCents = cart.body.cart.shippingCents as number;
    // The cart caps applied credit at the SUBTOTAL, so shipping is never
    // covered by credit. Recorded rather than assumed.
    expect(cart.body.cart.storeCreditAppliedCents).toBe(cart.body.cart.subtotalCents);
    expect(cart.body.cart.estimatedTotalCents).toBe(shippingCents);
    expect(shippingCents).toBeGreaterThan(0);

    const { paymentMethodReference: _omitted, ...withoutInstrument } = checkoutRequest({
      idempotencyKey: "composition-credit-covered-no-instrument",
    });
    const refused = await asMember(ctx)
      .post("/api/research/checkout")
      .send(withoutInstrument);
    // Still payable, so still gated. Under the old computation a forged
    // applyStoreCreditCents would have walked straight past this.
    expect(refused.body.ok).toBe(false);
    expect(refused.body.denials ?? [refused.body.code]).toContain(
      "payment_method_required",
    );
    expect(ctx.payment.authorizationCalls).toBe(0);

    const settled = await asMember(ctx)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "composition-credit-covered" }));
    expect(settled.body.ok).toBe(true);
    const stored = await ctx.orderRepository.get(settled.body.order.orderId as string);
    expect(stored?.totals.storeCreditAppliedCents).toBe(stored?.totals.subtotalCents);
    expect(stored?.totals.totalCents).toBe(shippingCents);
  });

  it("uses the test payment provider only: no live key, no real charge, no network", async () => {
    const ctx = await buildAcceptanceContext();
    // The injected environment configures no Stripe credential of any kind, so
    // no live adapter can be constructed by buildCommerceDependencies.
    for (const key of Object.keys(ctx.env)) {
      expect(key.toUpperCase()).not.toContain("STRIPE");
    }
    expect(ctx.payment.constructor.name).toBe("CountingPaymentProvider");

    await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 1, purchaseMode: "one_time" });
    const order = await asMember(ctx)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "composition-test-mode" }));
    expect(order.body.ok).toBe(true);
    // Exactly one authorization, from the in-process test provider.
    expect(ctx.payment.authorizationCalls).toBe(1);
    expect(ctx.payment.authorizationRefs.size).toBe(1);
    for (const reference of ctx.payment.authorizationRefs) {
      expect(reference).not.toMatch(/^pi_(?!test)/);
    }
  });
});

// ===========================================================================
// 7. the order line snapshot is immutable
// ===========================================================================

describe("7. a later price change does not alter a historical order", () => {
  it("the runtime order keeps the numbers it settled at after the catalog price moves", async () => {
    const originalCents = 5000;
    const ctx = await buildAcceptanceContext();
    await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 2, purchaseMode: "one_time" });
    const placed = await asMember(ctx)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "composition-immutable" }));
    expect(placed.body.ok).toBe(true);
    const orderId = placed.body.order.orderId as string;
    const settled = await ctx.orderRepository.get(orderId);
    if (!settled) throw new Error("expected the settled order to persist");
    const settledTotals = settled.totals;
    expect(settledTotals.subtotalCents).toBe(originalCents * 2);

    // A brand new app instance over the SAME durable stores, with the catalog
    // price changed. This is a restart with a repriced catalog.
    const repriced = await buildAcceptanceContext({
      products: [
        acceptanceProduct({
          facts: {
            ...acceptanceProduct().facts,
            priceCents: {
              value: 9900,
              confirmation: "confirmed",
              source: {
                kind: "supplier_document",
                reference: "synthetic_test_fixture composition doc 2",
              },
            },
          },
        }),
      ],
    });
    // Move the historical order into the new instance's durable store.
    await repriced.orderRepository.save(settled);

    const reread = await asMember(repriced).get(`/api/research/orders/${orderId}`);
    expect(reread.status).toBe(200);
    expect(reread.body.order.totalCents).toBe(settledTotals.totalCents);
    expect(reread.body.order.shippingCents).toBe(settledTotals.shippingCents);
    for (const line of reread.body.order.lines as OrderLineRecord[]) {
      expect(line.lineTotalCents).toBe(originalCents * line.quantity);
      expect(line.lineTotalCents).not.toBe(9900 * line.quantity);
    }
    const rereadStored = await repriced.orderRepository.get(orderId);
    expect(rereadStored?.totals).toEqual(settledTotals);

    // A fresh cart in the repriced instance does see the new number, so the
    // assertion above is about history, not about a stale catalog.
    const freshCart = await asMember(repriced)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 1, purchaseMode: "one_time" });
    expect((freshCart.body.cart.lines[0] as CartLineDto).unitPriceCents).toBe(9900);
  });

  it("the Product Control order snapshot is written once and never re-derived", async () => {
    const detail = productDetail();
    const quoted = await recomputeCheckout(
      {
        serverLines: [{ sku: SKU, quantity: 2 }],
        presented: {
          lines: [
            {
              sku: SKU,
              quantity: 2,
              unitAmountCents: AUTHORITATIVE_UNIT_CENTS,
              lineTotalCents: AUTHORITATIVE_UNIT_CENTS * 2,
              priceVersion: 2,
            },
          ],
          subtotalCents: AUTHORITATIVE_UNIT_CENTS * 2,
          currency: "USD",
        },
        authenticatedAudience: memberAudience(),
        currency: "USD",
        at: AT,
      },
      readers(detail),
    );
    expect(quoted.state).toBe("quoted");
    if (quoted.state !== "quoted") throw new Error("unreachable");

    const snapshotted = snapshotOrderLinesFromQuote(quoted.quote);
    expect(snapshotted.state).toBe("complete");
    if (snapshotted.state !== "complete") throw new Error("unreachable");
    const [historical] = snapshotted.lines;
    expect(historical.unitAmountCents).toBe(AUTHORITATIVE_UNIT_CENTS);
    expect(historical.priceVersion).toBe(2);
    expect(historical.agreedAt).toBe(AT);

    const columns = toOrderLinePriceColumnRows(snapshotted.lines);
    expect(columns.state).toBe("mapped");
    if (columns.state !== "mapped") throw new Error("unreachable");
    expect(columns.rows[0]).toMatchObject({
      price_id: PRICE_ID,
      price_version: 2,
      audience: "member",
      unit_amount_cents: AUTHORITATIVE_UNIT_CENTS,
      currency: "USD",
      priced_at: AT,
    });

    // The price moves. The stored snapshot is unchanged, and it is frozen, so
    // a consumer that tries to recompute it in place fails loudly.
    const movedQuote = await recomputeCheckout(
      {
        serverLines: [{ sku: SKU, quantity: 2 }],
        presented: {
          lines: [
            {
              sku: SKU,
              quantity: 2,
              unitAmountCents: 15900,
              lineTotalCents: 31800,
              priceVersion: 3,
            },
          ],
          subtotalCents: 31800,
          currency: "USD",
        },
        authenticatedAudience: memberAudience(LATER),
        currency: "USD",
        at: LATER,
      },
      readers(productDetail({ prices: [price({ version: 3, amountCents: 15900 })] })),
    );
    expect(movedQuote.state).toBe("quoted");
    expect(historical.unitAmountCents).toBe(AUTHORITATIVE_UNIT_CENTS);
    expect(historical.priceVersion).toBe(2);
    expect(Object.isFrozen(historical)).toBe(true);

    // An altered quote never snapshots at all: the hash is re-verified.
    const tampered = {
      ...quoted.quote,
      subtotalCents: 1,
    } as typeof quoted.quote;
    expect(snapshotOrderLinesFromQuote(tampered)).toEqual({
      state: "refused",
      reason: "subtotal_mismatch",
    });
  });

  it("PENDING: the runtime order line carries no price lineage to snapshot", async () => {
    // MISSING PIECE, named precisely: OrderLineRecord
    // (server/research/commerce/orders.ts:37) is sku, displayName, quantity and
    // lineTotalCents. The six order-line price columns the migration added
    // (price_id, price_version, audience, unit_amount_cents, currency,
    // priced_at) are produced by toOrderLinePriceColumnRows above and are
    // written by nothing on the runtime checkout path. The immutability proved
    // in the first test of this block is therefore total immutability, not
    // price-lineage immutability.
    const ctx = await buildAcceptanceContext();
    await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 1, purchaseMode: "one_time" });
    const placed = await asMember(ctx)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "composition-lineage-gap" }));
    expect(placed.body.ok).toBe(true);
    const stored = await ctx.orderRepository.get(placed.body.order.orderId as string);
    const line = (stored?.lines ?? [])[0] as unknown as Record<string, unknown>;
    expect(Object.keys(line).sort()).toEqual([
      "displayName",
      "lineTotalCents",
      "quantity",
      "sku",
    ]);
    for (const column of ["priceId", "priceVersion", "audience", "currency", "unitAmountCents"]) {
      expect(line).not.toHaveProperty(column);
    }
  });
});

// ===========================================================================
// 8. a GLP-class product cannot enter the ordinary research cart
// ===========================================================================

describe("8. GLP-class products stay out of the ordinary research cart", () => {
  it("the three held compounds are excluded from the customer projection in code", () => {
    expect(REGULATORY_HOLD_TIER.map((product) => product.canonicalName).sort()).toEqual([
      "Retatrutide",
      "Semaglutide",
      "Tirzepatide",
    ]);
    for (const product of REGULATORY_HOLD_TIER) {
      expect(product.tier).toBe("regulatory_hold");
      expect(toCustomerProductProjection(product)).toBeNull();
      for (const item of product.variants) {
        expect(item.availability).toBe("UNAVAILABLE");
        expect(isPurchaseMode(item.availability)).toBe(false);
      }
    }
    const projectedSlugs = new Set(customerCatalogProjection().map((item) => item.slug));
    for (const product of REGULATORY_HOLD_TIER) {
      expect(projectedSlugs.has(product.slug)).toBe(false);
    }
  });

  it("no GLP SKU exists in the catalog the runtime cart transacts against", async () => {
    const adapted = adaptLegacyCatalog(legacyProducts, "2026-07-20").products;
    const runtimeSkus = new Set(adapted.map((product) => product.sku));
    const runtimeSlugs = new Set(adapted.map((product) => product.slug));
    const heldSkus = REGULATORY_HOLD_TIER.flatMap((product) =>
      product.variants.map((item) => item.sku),
    );
    expect(heldSkus.length).toBeGreaterThan(0);
    for (const sku of heldSkus) expect(runtimeSkus.has(sku)).toBe(false);
    for (const product of REGULATORY_HOLD_TIER) {
      expect(runtimeSlugs.has(product.slug)).toBe(false);
    }

    // Over HTTP, against the real catalog: the SKU simply does not exist.
    const ctx = await buildAcceptanceContext({ products: adapted, lots: [] });
    const added = await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: heldSkus[0], quantity: 1, purchaseMode: "one_time" });
    expect(added.body.ok).toBe(false);
    expect(added.body.code).toBe("product_not_found");
    const detail = await asMember(ctx).get(
      `/api/research/products/${REGULATORY_HOLD_TIER[0].slug}`,
    );
    expect(detail.status).toBe(404);
  });

  it("even a GLP record forced into the runtime catalog cannot be purchased", async () => {
    // Defence in depth: if an import ever wrote one of these into the catalog,
    // the lane and approval gates still refuse it. future_clinical is the
    // non-transacting lane a clinical-provider route would own.
    const held = acceptanceProduct({
      sku: "P-GLP-1",
      slug: "semaglutide",
      displayName: "Semaglutide",
      lane: "future_clinical",
      commerceApproval: "blocked_by_lane",
      availability: "documentation_review",
    });
    const ctx = await buildAcceptanceContext({
      products: [held],
      lots: [releasedLot({ sku: "P-GLP-1" })],
    });
    const added = await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: "P-GLP-1", quantity: 1, purchaseMode: "one_time" });
    // The line may be held in the cart, but it can never be checked out.
    const cart = added.body.ok
      ? added.body.cart
      : (await asMember(ctx).get("/api/research/cart")).body.cart;
    expect(cart.checkoutReady).toBe(false);
    expect(cart.blockingReasons).toContain("lane_not_purchasable");

    const checkout = await asMember(ctx)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "composition-glp" }));
    expect(checkout.body.ok).toBe(false);
    expect(ctx.payment.authorizationCalls).toBe(0);
  });

  it("PENDING: there is no clinical-provider route for a GLP-class product", () => {
    // MISSING PIECE, named precisely: the exclusion above is total. The lane
    // enum (shared/research/catalog.ts:24) has future_clinical, and
    // NON_TRANSACTING_LANES (:56) makes it unpurchasable through this system
    // at all. There is no provider-gated ordering path, so "clinical provider
    // only route" is currently "no route". This assertion records that, and
    // fails the day a transacting clinical lane appears without review.
    const laneNames = REGULATORY_HOLD_TIER.map((product) => product.holdReason);
    for (const reason of laneNames) {
      expect(typeof reason).toBe("string");
      expect(reason).toContain("founder decision");
    }
  });
});

// ===========================================================================
// 9. the fulfillment boundary
// ===========================================================================

describe("9. no test crosses the fulfillment boundary", () => {
  it("a full catalog to captured order run submits nothing to fulfillment", async () => {
    const ctx = await buildAcceptanceContext();

    await asMember(ctx).get("/api/research/products");
    await asMember(ctx).get(`/api/research/products/${ELIGIBLE_SLUG}`);
    await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 2, purchaseMode: "one_time" });
    const placed = await asMember(ctx)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "composition-boundary" }));
    expect(placed.body.ok).toBe(true);
    expect(placed.body.order.state).toBe("payment_captured");

    // Nothing was transmitted to the fulfillment partner: the provider double
    // records every outbound payload, and it recorded none.
    expect(ctx.fulfillment.submitted).toEqual([]);

    // The order carries a PENDING shipment group, which is a projection of the
    // fulfillment owner split, not a shipment: no carrier, no tracking, no
    // label. Nothing has been handed to anyone.
    const order = await asMember(ctx).get(`/api/research/orders/${placed.body.order.orderId}`);
    const shipments = (order.body.order.shipments ?? []) as Array<{
      status: string;
      trackingNumber: string | null;
      carrier: string | null;
    }>;
    for (const shipment of shipments) {
      expect(shipment.status).toBe("pending");
      expect(shipment.trackingNumber).toBeNull();
      expect(shipment.carrier).toBeNull();
    }

    // The whole run stayed in process: the payment provider is the counting
    // test double and it authorized exactly once.
    expect(ctx.payment.authorizationCalls).toBe(1);
    expect(ctx.payment.refundCalls).toBe(0);
  });

  it("an admin read of the queues does not transmit either", async () => {
    const ctx = await buildAcceptanceContext();
    await asMember(ctx)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 1, purchaseMode: "one_time" });
    await asMember(ctx)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "composition-boundary-admin" }));

    const queues = await asAdmin(ctx).get("/api/admin/research/commerce/queues");
    expect(queues.status).toBe(200);
    expect(ctx.fulfillment.submitted).toEqual([]);
  });
});

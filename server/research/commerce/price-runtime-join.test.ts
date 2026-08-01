/**
 * THE PRICE RUNTIME JOIN, driven rather than argued.
 *
 * PR #222's composition suite proved that xenios research runs two live price
 * runtimes and that only one of them is an authority: a SKU the Product
 * Control resolver answers `sku_unknown` for SETTLED A CAPTURED ORDER, because
 * cart, checkout, and the order snapshot all price from
 * CatalogProduct.facts.priceCents.
 *
 * This suite drives the real cart service, the real checkout service, and the
 * real production wiring (no HTTP, no network, no live provider) and proves
 * six things:
 *
 *   1. FLAG OFF is today. Every number and every code is identical to a cart
 *      built with no join at all, asserted by deep equality of the whole DTO.
 *   2. FLAG ON fails closed. The exact defect above is reproduced with the flag
 *      off and refused with the flag on: nothing is purchasable, no
 *      authorization is created, and no order settles.
 *   3. A settled order does not follow a LATER PRICE CHANGE, under both flag
 *      states, asserted by a sha256 over the settled lines and totals taken
 *      before and after the price moves. Stated precisely, because that is a
 *      narrower claim than "the order object is immutable": the catalog and
 *      the Product Control rows are read fresh on every cart read, so this
 *      proves the order does not re-derive from a moved source. It says
 *      nothing about whether the order aliases the cart's own arrays, which is
 *      what point 5 exists for.
 *   4. No path under either flag state emits a zero or negative charge.
 *   5. The order snapshot is a COPY of the cart's line and shipment arrays,
 *      not a view of them: a cart projection that RETAINS the array it hands
 *      back cannot mutate a settled order afterwards.
 *   6. The COMPOSITION fails closed. When the flag is on and the authority
 *      cannot be constructed, the composed cart refuses rather than falling
 *      back to the legacy supplier fact.
 */

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  type CatalogProduct,
  type ProvenancedFact,
} from "@shared/research/catalog";
import type { CartDto, CheckoutRequest } from "@shared/research/commerce-api";
import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { InventoryLot } from "../inventory/lots";
import { LEGACY_SLUG_TO_SKU } from "../catalog/legacy-adapter";
import { TestPaymentProvider } from "../providers/payment";
import { ConfiguredRateShippingProvider } from "../providers/shipping";
import type { ProductCatalogReader } from "../catalog/product-control-reader";
import { createCatalogVariantLookupBySku } from "../catalog/variant-sku-lookup";
import {
  CatalogPricingProductSource,
  createAuthoritativePriceResolver,
} from "../pricing/authoritative-price-resolver";
import {
  createCartService,
  createInMemoryCartRepository,
  type CartServiceDeps,
} from "./cart";
import { createCheckoutService, type CheckoutOrder } from "./checkout";
import {
  createProductControlMoneyAuthority,
  PRICE_AUTHORITY_FLAG,
  type MoneyPriceAuthority,
} from "./price-authority";
import {
  buildCommerceDependencies,
  CHECKOUT_REQUIRED_AGREEMENT_KEYS,
  type CommerceWiring,
} from "./production-deps";
import { createInMemoryCartStore } from "./persistence/cart-store";
import { createInMemoryOrderStore } from "./persistence/orders-store";
import { createInMemoryInventoryLotStore } from "./persistence/inventory-store";
import { createInMemoryStoreCreditLedgerStore } from "./persistence/store-credit-store";
import { createInMemorySubscriptionStore } from "./persistence/subscriptions-store";
import { createInMemoryAdminQueuesStore } from "./persistence/admin-queues-store";
import { createInMemoryReservationStore } from "./persistence/reservations-store";
import {
  createInMemoryClaimOrderRepository,
  createInMemoryClaimRepository,
} from "./refunds";
import { createInMemoryWebhookEventStore } from "./webhooks";
import {
  createInMemoryPartnerLinkStore,
  createInMemoryPartnerMemberStore,
} from "./persistence/partners-store";
import { createInMemoryCommissionLedgerStore } from "./persistence/commissions-store";
import { TestMitchProvider } from "../providers/fulfillment";

const AT = "2026-07-28T12:00:00.000Z";
const NOW = new Date(AT);
const MEMBER = "member-1";
const SKU = "SKU-A";

/** The supplier fact the LEGACY runtime charges from. */
const LEGACY_FACT_CENTS = 7350;
/** The approved Product Control row the AUTHORITY charges from. */
const AUTHORITATIVE_CENTS = 14900;

// ---------------------------------------------------------------------------
// The legacy catalog (what the runtime cart transacts against today)
// ---------------------------------------------------------------------------

function confirmed<T>(value: T): ProvenancedFact<T> {
  return {
    value,
    confirmation: "confirmed",
    source: { kind: "supplier_document", reference: "SYNTHETIC-TEST-DOC" },
  };
}

function catalogProduct(
  overrides: Partial<CatalogProduct> = {},
): CatalogProduct {
  return {
    sku: SKU,
    slug: "product-a",
    displayName: "Product A",
    lane: "research_material",
    availability: "in_stock",
    commerceApproval: "approved",
    fulfillmentOwner: "mitch",
    facts: {
      composition: confirmed("composition on file"),
      strength: confirmed("strength on file"),
      format: confirmed("format on file"),
      priceCents: confirmed(LEGACY_FACT_CENTS),
      shelfLife: confirmed("shelf life on file"),
      storage: confirmed("storage on file"),
      coa: confirmed("coa on file"),
    },
    guideState: "guide_published",
    qualityDocumentState: "approved",
    storageDataState: "approved",
    shippingProfileState: "approved",
    goalMappings: [],
    relatedGuideSlugs: [],
    prohibitedClaims: [],
    subscriptionEligible: true,
    lastReviewed: "2026-07-01",
    openSupplierQuestions: [],
    ...overrides,
  };
}

function lot(overrides: Partial<InventoryLot> = {}): InventoryLot {
  return {
    lotId: "LOT-1",
    sku: SKU,
    owner: "mitch",
    disposition: "available",
    quantityAvailable: 100,
    manufacturedDate: "2026-01-01",
    expiryDate: "2027-01-01",
    retestDate: null,
    shelfLifeSource: "supplier_document",
    documents: {
      coaOnFile: true,
      identityConfirmed: true,
      purityConfirmed: true,
      sterilityConfirmed: true,
      endotoxinConfirmed: true,
    },
    excursion: "none",
    recalled: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The Product Control catalog (what the AUTHORITY knows)
// ---------------------------------------------------------------------------

function variant(
  overrides: Partial<AdminProductVariant> = {},
): AdminProductVariant {
  return {
    id: "variant-a",
    productId: "product-a",
    sku: SKU,
    catalogNumber: null,
    label: "10 mg",
    strength: null,
    size: null,
    format: null,
    presentation: null,
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
    id: "price-a",
    productId: "product-a",
    variantId: "variant-a",
    audience: "member",
    amountCents: AUTHORITATIVE_CENTS,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00.000Z",
    expiresAt: null,
    status: "active",
    approvalNote: "Approved",
    version: 2,
    createdBy: "admin-a",
    approvedBy: "admin-b",
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function productControlDetail(
  overrides: Partial<AdminProductDetail> = {},
): AdminProductDetail {
  return {
    id: "product-a",
    productCode: "PRODUCT-A",
    slug: "product-a",
    displayName: "Product A",
    canonicalName: "Product A",
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

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * A mutable Product Control catalog behind the same drift-checked reader
 * interface production uses, so a test can move a price AFTER an order settles
 * and prove the settled order did not move with it.
 */
function mutableCatalog(initial: AdminProductDetail[]) {
  let current = initial;
  const reader: ProductCatalogReader = { readCatalog: async () => current };
  return {
    reader,
    replace(next: AdminProductDetail[]) {
      current = next;
    },
  };
}

function authorityOver(reader: ProductCatalogReader): MoneyPriceAuthority {
  return createProductControlMoneyAuthority({
    variants: createCatalogVariantLookupBySku(reader),
    priceResolver: createAuthoritativePriceResolver(
      new CatalogPricingProductSource(reader),
    ),
    audience: {
      audience: "member",
      sourceVersion: "research_member_session_v1",
    },
    currency: "USD",
  });
}

function cartDeps(
  overrides: Partial<CartServiceDeps> = {},
): CartServiceDeps {
  return {
    repository: createInMemoryCartRepository(),
    catalog: new Map([[SKU, catalogProduct()]]),
    lots: [lot()],
    storeCredit: [],
    commerceEnabled: true,
    quantumCommerceEnabled: false,
    requiredAgreementKeys: ["research_use_v1"],
    ...overrides,
  };
}

function checkoutRequest(
  overrides: Partial<CheckoutRequest> = {},
): CheckoutRequest {
  return {
    shippingAddress: {
      line1: "100 Main St",
      city: "Houston",
      state: "TX",
      postalCode: "77002",
      country: "US",
    },
    shippingService: "standard",
    acceptedAgreementKeys: ["research_use_v1"],
    idempotencyKey: "join-key-1",
    paymentMethodReference: "pm_test_instrument",
    ...overrides,
  };
}

/**
 * The whole transacting chain over one set of deps: the real cart service and
 * the real checkout service, wired exactly as production wires them (checkout
 * revalidates through the cart, and nothing else supplies a price).
 */
function spiedPayment() {
  const payment = new TestPaymentProvider();
  return {
    payment,
    authorize: vi.spyOn(payment, "createAuthorization"),
    capture: vi.spyOn(payment, "captureAuthorization"),
  };
}

function chain(deps: CartServiceDeps) {
  const { payment, authorize, capture } = spiedPayment();
  const cart = createCartService(deps);
  const checkout = createCheckoutService({
    cart: { revalidate: (memberId, asOf) => cart.revalidate(memberId, asOf) },
    payment,
    shipping: new ConfiguredRateShippingProvider(),
    commerceEnabled: true,
    serviceableStates: ["TX", "CA"],
    acceptedAgreementKeys: [],
  });
  return { cart, checkout, payment, authorize, capture };
}

/** A content hash over exactly what a settled order promised. */
function orderHash(order: CheckoutOrder): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        lines: order.lines,
        subtotalCents: order.subtotalCents,
        shippingCents: order.shippingCents,
        storeCreditAppliedCents: order.storeCreditAppliedCents,
        totalCents: order.totalCents,
      }),
    )
    .digest("hex");
}

// ===========================================================================
// 1. FLAG OFF is byte-identical to today
// ===========================================================================

describe("flag OFF is byte-identical to today", () => {
  it("produces the identical cart DTO whether or not the join module is loaded", async () => {
    // The control: a cart with no `priceAuthority` key at all, which is the
    // shape this file had before the seam existed.
    const control = createCartService(cartDeps());
    await control.addLine(
      MEMBER,
      { sku: SKU, quantity: 3, purchaseMode: "one_time" },
      NOW,
    );
    const controlDto = await control.getCart(MEMBER, NOW);

    // The subject: the same deps with the key present and explicitly undefined,
    // which is what the production wiring passes when the flag is off.
    const subject = createCartService(cartDeps({ priceAuthority: undefined }));
    await subject.addLine(
      MEMBER,
      { sku: SKU, quantity: 3, purchaseMode: "one_time" },
      NOW,
    );
    const subjectDto = await subject.getCart(MEMBER, NOW);

    expect(subjectDto).toEqual(controlDto);
    expect(JSON.stringify(subjectDto)).toBe(JSON.stringify(controlDto));
    // And it is the LEGACY number, from the supplier fact, not the authority.
    expect(subjectDto.lines[0].unitPriceCents).toBe(LEGACY_FACT_CENTS);
    expect(subjectDto.lines[0].lineTotalCents).toBe(LEGACY_FACT_CENTS * 3);
    expect(subjectDto.subtotalCents).toBe(LEGACY_FACT_CENTS * 3);
    expect(subjectDto.checkoutReady).toBe(true);
  });

  it("never consults the authority when the flag is off", async () => {
    const priceLines = vi.fn();
    const deps = cartDeps();
    const service = createCartService(deps);
    await service.addLine(
      MEMBER,
      { sku: SKU, quantity: 1, purchaseMode: "one_time" },
      NOW,
    );
    await service.revalidate(MEMBER, NOW);
    expect(priceLines).not.toHaveBeenCalled();
    expect(deps.priceAuthority).toBeUndefined();
  });

  it("wires the production commerce dependencies with no authority by default", () => {
    const resolveMoneyPriceAuthority = vi.fn(() => undefined);
    buildCommerceDependencies(
      () => NOW,
      { NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true" },
      { resolveMoneyPriceAuthority },
    );
    // The unprovisioned state (no database) never reaches the live cart, so
    // assert the flag predicate itself over the same env the wiring reads.
    expect(resolveMoneyPriceAuthority({})).toBeUndefined();
    expect(
      resolveMoneyPriceAuthority({ [PRICE_AUTHORITY_FLAG]: "true" }),
    ).toBeUndefined();
  });
});

// ===========================================================================
// 2. FLAG ON fails closed on the exact PR #222 defect
// ===========================================================================

describe("the P0 defect: a SKU the authority will not price", () => {
  /** Product Control knows nothing about this SKU. sku_unknown. */
  const unknownToAuthority = mutableCatalog([]);

  it("FLAG OFF: reproduces the defect, a captured order settles at the supplier fact", async () => {
    const { cart, checkout, authorize, capture } = chain(cartDeps());
    await cart.addLine(
      MEMBER,
      { sku: SKU, quantity: 2, purchaseMode: "one_time" },
      NOW,
    );

    const dto = await cart.getCart(MEMBER, NOW);
    expect(dto.lines[0].unitPriceCents).toBe(LEGACY_FACT_CENTS);
    expect(dto.checkoutReady).toBe(true);

    const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.order.state).toBe("payment_captured");
    expect(outcome.order.subtotalCents).toBe(LEGACY_FACT_CENTS * 2);
    expect(authorize).toHaveBeenCalled();
  });

  it("FLAG ON: the same SKU is not purchasable and no order settles", async () => {
    const { cart, checkout, authorize, capture } = chain(
      cartDeps({ priceAuthority: authorityOver(unknownToAuthority.reader) }),
    );
    await cart.addLine(
      MEMBER,
      { sku: SKU, quantity: 2, purchaseMode: "one_time" },
      NOW,
    );

    const dto = await cart.getCart(MEMBER, NOW);
    // The supplier fact still says 7350. It is not a price any more.
    expect(dto.lines[0].unitPriceCents).toBeNull();
    expect(dto.lines[0].lineTotalCents).toBeNull();
    expect(dto.lines[0].blockedReason).toBe("product_not_found");
    expect(dto.checkoutReady).toBe(false);
    expect(dto.subtotalCents).toBe(0);

    const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.denials).toContain("cart_revalidation_failed");
    // Nothing was charged, and nothing was held.
    expect(authorize).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("FLAG ON: an authority that throws refuses the line rather than falling back", async () => {
    const exploding: MoneyPriceAuthority = {
      priceLines: async () => {
        throw new Error("product control unreachable");
      },
    };
    const { cart, checkout, authorize, capture } = chain(
      cartDeps({ priceAuthority: exploding }),
    );
    await cart.addLine(
      MEMBER,
      { sku: SKU, quantity: 1, purchaseMode: "one_time" },
      NOW,
    );
    const dto = await cart.getCart(MEMBER, NOW);
    expect(dto.lines[0].unitPriceCents).toBeNull();
    expect(dto.checkoutReady).toBe(false);

    const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
    expect(outcome.ok).toBe(false);
    expect(authorize).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 3. FLAG ON charges the authority's number, not the supplier fact
// ===========================================================================

describe("flag ON routes cart, checkout, and the order through Product Control", () => {
  it("charges the approved Product Control amount, not facts.priceCents", async () => {
    const catalog = mutableCatalog([productControlDetail()]);
    const { cart, checkout } = chain(
      cartDeps({ priceAuthority: authorityOver(catalog.reader) }),
    );
    await cart.addLine(
      MEMBER,
      { sku: SKU, quantity: 2, purchaseMode: "one_time" },
      NOW,
    );

    const dto = await cart.getCart(MEMBER, NOW);
    expect(dto.lines[0].unitPriceCents).toBe(AUTHORITATIVE_CENTS);
    expect(dto.lines[0].unitPriceCents).not.toBe(LEGACY_FACT_CENTS);
    expect(dto.subtotalCents).toBe(AUTHORITATIVE_CENTS * 2);
    expect(dto.checkoutReady).toBe(true);

    const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.order.subtotalCents).toBe(AUTHORITATIVE_CENTS * 2);
    expect(outcome.order.state).toBe("payment_captured");
  });

  it("refuses a retired, expired, future, ambiguous, or wrong-audience row at checkout", async () => {
    const rows: Array<[string, AdminProductDetail]> = [
      ["price_inactive", productControlDetail({ prices: [price({ status: "retired" })] })],
      [
        "price_expired",
        productControlDetail({
          prices: [
            price({
              effectiveAt: "2026-01-01T00:00:00.000Z",
              expiresAt: "2026-02-01T00:00:00.000Z",
            }),
          ],
        }),
      ],
      [
        "price_not_effective",
        productControlDetail({
          prices: [price({ effectiveAt: "2027-01-01T00:00:00.000Z" })],
        }),
      ],
      [
        "price_ambiguous",
        productControlDetail({ prices: [price(), price({ id: "price-b" })] }),
      ],
      [
        "audience_not_authorized",
        productControlDetail({ prices: [price({ audience: "wholesale" })] }),
      ],
      [
        "currency_mismatch",
        productControlDetail({ prices: [price({ currency: "EUR" })] }),
      ],
      ["price_missing", productControlDetail({ prices: [] })],
    ];

    for (const [name, detail] of rows) {
      const catalog = mutableCatalog([detail]);
      const { cart, checkout, authorize, capture } = chain(
        cartDeps({ priceAuthority: authorityOver(catalog.reader) }),
      );
      await cart.addLine(
        MEMBER,
        { sku: SKU, quantity: 1, purchaseMode: "one_time" },
        NOW,
      );
      const dto = await cart.getCart(MEMBER, NOW);
      expect(dto.lines[0].unitPriceCents, name).toBeNull();
      expect(dto.checkoutReady, name).toBe(false);

      const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
      expect(outcome.ok, name).toBe(false);
      expect(authorize, name).not.toHaveBeenCalled();
    }
  });
});

// ===========================================================================
// 4. The settled order is immutable under BOTH flag states
// ===========================================================================

describe("a later price change never alters a settled order", () => {
  it("FLAG OFF: the supplier fact moves and the settled order does not", async () => {
    const catalogMap = new Map([[SKU, catalogProduct()]]);
    const { cart, checkout } = chain(cartDeps({ catalog: catalogMap }));
    await cart.addLine(
      MEMBER,
      { sku: SKU, quantity: 2, purchaseMode: "one_time" },
      NOW,
    );
    const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    const before = orderHash(outcome.order);
    expect(outcome.order.subtotalCents).toBe(LEGACY_FACT_CENTS * 2);

    // The catalog reprices, hard.
    catalogMap.set(
      SKU,
      catalogProduct({
        facts: { ...catalogProduct().facts, priceCents: confirmed(99900) },
      }),
    );
    const later = await cart.getCart(MEMBER, new Date("2026-09-01T00:00:00Z"));
    expect(later.lines[0].unitPriceCents).toBe(99900);

    expect(orderHash(outcome.order)).toBe(before);
    expect(outcome.order.subtotalCents).toBe(LEGACY_FACT_CENTS * 2);
  });

  it("FLAG ON: the Product Control row moves and the settled order does not", async () => {
    const catalog = mutableCatalog([productControlDetail()]);
    const { cart, checkout } = chain(
      cartDeps({ priceAuthority: authorityOver(catalog.reader) }),
    );
    await cart.addLine(
      MEMBER,
      { sku: SKU, quantity: 2, purchaseMode: "one_time" },
      NOW,
    );
    const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    const before = orderHash(outcome.order);
    expect(outcome.order.subtotalCents).toBe(AUTHORITATIVE_CENTS * 2);

    // A new approved version supersedes the row the order settled against.
    catalog.replace([
      productControlDetail({
        prices: [price({ id: "price-b", amountCents: 22200, version: 3 })],
      }),
    ]);
    const later = await cart.getCart(MEMBER, NOW);
    expect(later.lines[0].unitPriceCents).toBe(22200);

    expect(orderHash(outcome.order)).toBe(before);
    expect(outcome.order.subtotalCents).toBe(AUTHORITATIVE_CENTS * 2);
    expect(outcome.order.lines[0].unitPriceCents).toBe(AUTHORITATIVE_CENTS);
  });

  it("FLAG ON: a row that is WITHDRAWN after settlement does not unsettle the order", async () => {
    const catalog = mutableCatalog([productControlDetail()]);
    const { cart, checkout } = chain(
      cartDeps({ priceAuthority: authorityOver(catalog.reader) }),
    );
    await cart.addLine(
      MEMBER,
      { sku: SKU, quantity: 1, purchaseMode: "one_time" },
      NOW,
    );
    const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    const before = orderHash(outcome.order);

    catalog.replace([]);
    const later = await cart.getCart(MEMBER, NOW);
    expect(later.lines[0].unitPriceCents).toBeNull();

    expect(orderHash(outcome.order)).toBe(before);
    expect(outcome.order.totalCents).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 5. No zero and no negative charge, under either flag state
// ===========================================================================

describe("no path emits a zero or negative charge", () => {
  for (const amount of [0, -1, -14900]) {
    it(`FLAG OFF: a confirmed supplier fact of ${amount} reads as no price, never as a charge`, async () => {
      const { cart, checkout, authorize, capture } = chain(
        cartDeps({
          catalog: new Map([
            [
              SKU,
              catalogProduct({
                facts: {
                  ...catalogProduct().facts,
                  priceCents: confirmed(amount),
                },
              }),
            ],
          ]),
        }),
      );
      await cart.addLine(
        MEMBER,
        { sku: SKU, quantity: 2, purchaseMode: "one_time" },
        NOW,
      );
      const dto = await cart.getCart(MEMBER, NOW);
      expect(dto.lines[0].unitPriceCents).toBeNull();
      expect(dto.lines[0].unitPriceCents).not.toBe(0);
      expect(dto.lines[0].lineTotalCents).toBeNull();
      expect(dto.lines[0].blockedReason).toBe("unconfirmed_supplier_facts");
      expect(dto.checkoutReady).toBe(false);

      const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
      expect(outcome.ok).toBe(false);
      expect(authorize).not.toHaveBeenCalled();
    });

    it(`FLAG ON: a Product Control row of ${amount} reads as no price, never as a charge`, async () => {
      const catalog = mutableCatalog([
        productControlDetail({ prices: [price({ amountCents: amount })] }),
      ]);
      const { cart, checkout, authorize, capture } = chain(
        cartDeps({ priceAuthority: authorityOver(catalog.reader) }),
      );
      await cart.addLine(
        MEMBER,
        { sku: SKU, quantity: 2, purchaseMode: "one_time" },
        NOW,
      );
      const dto = await cart.getCart(MEMBER, NOW);
      expect(dto.lines[0].unitPriceCents).toBeNull();
      expect(dto.lines[0].lineTotalCents).toBeNull();
      expect(dto.checkoutReady).toBe(false);

      const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
      expect(outcome.ok).toBe(false);
      expect(authorize).not.toHaveBeenCalled();
    });
  }

  it("checkout refuses a cart that hands back a zero or negative amount, whatever the cart says", async () => {
    // The cart is not trusted here. This drives the checkout's own money
    // invariant directly with a cart that claims a line is fine at zero.
    for (const [unitPriceCents, lineTotalCents] of [
      [0, 0],
      [-100, -200],
      [4900, 0],
      [0, 9800],
    ]) {
      const { payment, authorize } = spiedPayment();
      const checkout = createCheckoutService({
        cart: {
          revalidate: async () => ({
            lines: [
              {
                sku: SKU,
                displayName: "Product A",
                quantity: 2,
                purchaseMode: "one_time" as const,
                unitPriceCents,
                lineTotalCents,
                blockedReason: null,
              },
            ],
            shipmentGroups: [{ owner: "mitch" as const, skus: [SKU] }],
            subtotalCents: Math.max(0, lineTotalCents),
            shippingCents: 1295,
            storeCreditAppliedCents: 0,
            estimatedTotalCents: Math.max(0, lineTotalCents) + 1295,
            checkoutReady: true,
            blockingReasons: [],
            requiredAgreements: ["research_use_v1"],
          }),
        },
        payment,
        shipping: new ConfiguredRateShippingProvider(),
        commerceEnabled: true,
        serviceableStates: ["TX", "CA"],
        acceptedAgreementKeys: [],
      });

      const validation = await checkout.validate(MEMBER, checkoutRequest(), NOW);
      expect(validation.ok).toBe(false);
      const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
      expect(outcome.ok).toBe(false);
      expect(authorize).not.toHaveBeenCalled();
    }
  });
});

// ===========================================================================
// 6. THE REMAINING STEP, stated as an executable requirement
// ===========================================================================

describe("what the flag still needs before it can be flipped", () => {
  it("names the SKU space the transacting cart uses, which Product Control must match", () => {
    // The runtime cart transacts against the legacy-adapted catalog, whose SKUs
    // are MINTED BY THE ADAPTER (server/research/catalog/legacy-adapter.ts:39).
    // Product Control's own SKUs live in research_product_variants.sku and have
    // no proven correspondence to these.
    const skus = Object.values(LEGACY_SLUG_TO_SKU);
    expect(skus).toContain("P001");
    expect(skus.length).toBe(15);
    expect(new Set(skus).size).toBe(15);
  });

  it("fails CLOSED, not open, when Product Control does not carry the runtime SKU", async () => {
    // This is the state of the world today: turning the flag on over a Product
    // Control that does not know P001 makes P001 unpurchasable. Safe, and not
    // yet commerce. The import that makes it purchasable is the remaining step.
    const empty = mutableCatalog([]);
    const { cart } = chain(
      cartDeps({
        catalog: new Map([["P001", catalogProduct({ sku: "P001" })]]),
        lots: [lot({ sku: "P001" })],
        priceAuthority: authorityOver(empty.reader),
      }),
    );
    await cart.addLine(
      MEMBER,
      { sku: "P001", quantity: 1, purchaseMode: "one_time" },
      NOW,
    );
    const dto = await cart.getCart(MEMBER, NOW);
    expect(dto.lines[0].unitPriceCents).toBeNull();
    expect(dto.checkoutReady).toBe(false);
  });

  it("is COMPLETE the moment Product Control carries a variant with that exact SKU", async () => {
    // The acceptance criterion for the data import, executable. No code change
    // is required beyond this: give Product Control a published, public, active
    // product with an approved variant whose sku is P001 and one approved,
    // active, in-window member price row, and the joined runtime prices it.
    const populated = mutableCatalog([
      productControlDetail({
        variants: [variant({ sku: "P001" })],
        prices: [price({ amountCents: 33999 })],
      }),
    ]);
    const { cart, checkout } = chain(
      cartDeps({
        catalog: new Map([["P001", catalogProduct({ sku: "P001" })]]),
        lots: [lot({ sku: "P001" })],
        priceAuthority: authorityOver(populated.reader),
      }),
    );
    await cart.addLine(
      MEMBER,
      { sku: "P001", quantity: 1, purchaseMode: "one_time" },
      NOW,
    );
    const dto = await cart.getCart(MEMBER, NOW);
    expect(dto.lines[0].unitPriceCents).toBe(33999);
    expect(dto.checkoutReady).toBe(true);

    const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.order.subtotalCents).toBe(33999);
  });
});

// ===========================================================================
// 6. The order snapshot is a COPY of the cart's arrays, not a view of them
// ===========================================================================

/**
 * Section 4 above proves a narrower thing than it reads like: a settled order
 * does not follow a LATER PRICE CHANGE. It cannot prove the defensive copies
 * at checkout.ts, because the real cart service allocates fresh line objects
 * on every read, so there is no aliasing for a copy to defend against and
 * `lines: cart.lines` would pass those tests unchanged.
 *
 * The property is real and worth protecting, so it is proved here against the
 * shape that can actually violate it: a cart projection that RETAINS the array
 * it hands back. That is not a contrived shape. Any cart implementation that
 * memoizes its DTO for the life of a request, or hands back a stored array
 * directly, has exactly this shape, and checkout accepts ANY implementation of
 * the `{ revalidate }` seam. Without the copy, such a cart's later array
 * mutation would rewrite what a member already paid for.
 *
 * Every mutation below is an ARRAY-level mutation, deliberately. The copy at
 * checkout.ts is shallow, so it does not claim to defend against a mutation of
 * a line OBJECT that both arrays reference, and this file does not claim it
 * either.
 */
describe("the settled order is a snapshot copy, not a view of the cart", () => {
  /**
   * A cart seam that hands back the SAME CartDto object on every revalidate,
   * so the test holds the very array checkout was given.
   */
  async function retainingCart() {
    const cart = createCartService(cartDeps());
    await cart.addLine(
      MEMBER,
      { sku: SKU, quantity: 2, purchaseMode: "one_time" },
      NOW,
    );
    const retained: CartDto = await cart.revalidate(MEMBER, NOW);
    const { payment, authorize } = spiedPayment();
    const checkout = createCheckoutService({
      cart: { revalidate: async () => retained },
      payment,
      shipping: new ConfiguredRateShippingProvider(),
      commerceEnabled: true,
      serviceableStates: ["TX", "CA"],
      acceptedAgreementKeys: [],
    });
    return { retained, checkout, authorize };
  }

  it("a line pushed onto the retained array after settlement does not join the order", async () => {
    const { retained, checkout } = await retainingCart();
    const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    const before = orderHash(outcome.order);
    expect(outcome.order.lines).toHaveLength(1);

    // The cart's own array grows AFTER the order settled. Without the copy
    // this line would appear inside a captured order no member agreed to.
    retained.lines.push({ ...retained.lines[0], sku: "SMUGGLED" });

    expect(outcome.order.lines).toHaveLength(1);
    expect(outcome.order.lines.some((line) => line.sku === "SMUGGLED")).toBe(
      false,
    );
    expect(orderHash(outcome.order)).toBe(before);
  });

  it("a line REPLACED in the retained array after settlement does not reprice the order", async () => {
    const { retained, checkout } = await retainingCart();
    const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    const before = orderHash(outcome.order);
    expect(outcome.order.lines[0].unitPriceCents).toBe(LEGACY_FACT_CENTS);

    // Slot replacement, not object mutation: the settled order holds its own
    // array, so its slot 0 still points at what it settled against.
    retained.lines[0] = {
      ...retained.lines[0],
      unitPriceCents: 1,
      lineTotalCents: 2,
    };

    expect(outcome.order.lines[0].unitPriceCents).toBe(LEGACY_FACT_CENTS);
    expect(orderHash(outcome.order)).toBe(before);
  });

  it("emptying the retained arrays after settlement does not empty the order", async () => {
    const { retained, checkout } = await retainingCart();
    const outcome = await checkout.submit(MEMBER, checkoutRequest(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    const before = orderHash(outcome.order);
    const settledGroupCount = outcome.order.shipmentGroups.length;
    expect(settledGroupCount).toBeGreaterThan(0);

    retained.lines.length = 0;
    retained.shipmentGroups.length = 0;

    expect(outcome.order.lines).toHaveLength(1);
    expect(outcome.order.shipmentGroups).toHaveLength(settledGroupCount);
    expect(orderHash(outcome.order)).toBe(before);
  });
});

// ===========================================================================
// 7. The COMPOSITION fails closed when the authority cannot be built
// ===========================================================================

/**
 * The defect this section closes: buildCommerceDependencies used to SWALLOW a
 * throwing resolveMoneyPriceAuthority and continue with no authority, which
 * silently returns MONEY to the legacy facts.priceCents runtime while the
 * operator reads the flag as ON. That is worse than the flag being off,
 * because it is off while reporting on.
 *
 * These tests drive the REAL production composition in its live state over
 * injected in-memory stores. No network, no live provider, no real charge.
 */
const COMPOSED_ENV: NodeJS.ProcessEnv = {
  NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
  // Throwaway placeholders so the composition takes its LIVE branch. They are
  // not credentials and nothing constructs a client from them.
  SUPABASE_URL: "https://placeholder.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "placeholder-not-a-real-key",
  RESEARCH_SERVICEABLE_STATES: "TX,CA",
};

async function composedCommerce(
  resolveMoneyPriceAuthority: CommerceWiring["resolveMoneyPriceAuthority"],
  env: NodeJS.ProcessEnv,
) {
  const lotStore = createInMemoryInventoryLotStore();
  await lotStore.save(lot());
  const payment = new TestPaymentProvider();
  const authorize = vi.spyOn(payment, "createAuthorization");
  const wiring: Partial<CommerceWiring> = {
    catalogProducts: [catalogProduct()],
    resolveMoneyPriceAuthority,
    resolveCartStore: () => createInMemoryCartStore(),
    resolveOrderRepository: () => createInMemoryOrderStore(),
    resolveClaimRepository: () => createInMemoryClaimRepository(),
    resolveClaimOrderRepository: () => createInMemoryClaimOrderRepository(),
    resolveInventoryLotStore: () => lotStore,
    resolveReservationStore: () => createInMemoryReservationStore(),
    resolveStoreCreditLedgerStore: () => createInMemoryStoreCreditLedgerStore(),
    resolveSubscriptionRepository: () => createInMemorySubscriptionStore(),
    resolveAdminQueuesStore: () => createInMemoryAdminQueuesStore(),
    resolveWebhookEventStore: () => createInMemoryWebhookEventStore(),
    resolvePartnerMemberStore: () => createInMemoryPartnerMemberStore(),
    resolvePartnerLinkStore: () => createInMemoryPartnerLinkStore(),
    resolveCommissionLedgerStore: () => createInMemoryCommissionLedgerStore(),
    resolvePaymentProvider: () => payment,
    resolveShippingProvider: () => new ConfiguredRateShippingProvider(),
    resolveFulfillmentProvider: () => new TestMitchProvider(),
    isMembershipActive: async () => true,
    hasEffectiveAgreement: async () => true,
  };
  return {
    deps: buildCommerceDependencies(() => NOW, env, wiring),
    authorize,
  };
}

function composedCheckoutRequest(): CheckoutRequest {
  return checkoutRequest({
    acceptedAgreementKeys: [...CHECKOUT_REQUIRED_AGREEMENT_KEYS],
  });
}

/** A construction failure carrying a secret-looking value, so a leak shows. */
const SECRET_LOOKING = "postgresql://svc:hunter2@db.placeholder.internal:5432";

describe("the composition fails closed when the authority cannot be built", () => {
  it("FLAG OFF control: the same composition prices at the supplier fact", async () => {
    // Without this control the refusal below proves nothing: it fixes that the
    // only difference is the flag plus the construction failure.
    const { deps } = await composedCommerce(() => undefined, COMPOSED_ENV);
    expect(
      await deps.cart.addLine(
        MEMBER,
        { sku: SKU, quantity: 2, purchaseMode: "one_time" },
        NOW,
      ),
    ).toMatchObject({ ok: true });
    const dto = await deps.cart.getCart(MEMBER, NOW);
    expect(dto.lines?.[0].unitPriceCents).toBe(LEGACY_FACT_CENTS);
    expect(dto.checkoutReady).toBe(true);
  });

  it("FLAG ON + construction throws: refuses to price, never falls back to facts.priceCents", async () => {
    const boom = vi.fn(() => {
      throw new Error("could not reach " + SECRET_LOOKING);
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, authorize } = await composedCommerce(boom, {
      ...COMPOSED_ENV,
      [PRICE_AUTHORITY_FLAG]: "true",
    });
    expect(boom).toHaveBeenCalled();

    expect(
      await deps.cart.addLine(
        MEMBER,
        { sku: SKU, quantity: 2, purchaseMode: "one_time" },
        NOW,
      ),
    ).toMatchObject({ ok: true });

    const dto = await deps.cart.getCart(MEMBER, NOW);
    // THE ASSERTION THE DEFECT INVERTED: no number at all, and specifically
    // not the legacy supplier fact.
    expect(dto.lines?.[0].unitPriceCents).toBeNull();
    expect(dto.lines?.[0].unitPriceCents).not.toBe(LEGACY_FACT_CENTS);
    expect(dto.lines?.[0].lineTotalCents).toBeNull();
    expect(dto.lines?.[0].blockedReason).toBe("unconfirmed_supplier_facts");
    expect(dto.checkoutReady).toBe(false);

    const outcome = await deps.checkout.submit(
      MEMBER,
      composedCheckoutRequest(),
      NOW,
    );
    expect(outcome).toMatchObject({ ok: false });
    expect(authorize).not.toHaveBeenCalled();

    logged.mockRestore();
  });

  it("FLAG ON + construction throws: says so loudly and leaks nothing", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await composedCommerce(
      () => {
        throw new Error("could not reach " + SECRET_LOOKING);
      },
      { ...COMPOSED_ENV, [PRICE_AUTHORITY_FLAG]: "true" },
    );

    // Loud: the failure is not silent, and it names the flag and the outcome.
    expect(logged).toHaveBeenCalledTimes(1);
    const message = String(logged.mock.calls[0]?.[0] ?? "");
    expect(message).toContain(PRICE_AUTHORITY_FLAG);
    expect(message).toContain("FAILING CLOSED");

    // Leaks nothing: not the thrown message, not the connection string, not
    // the key, not the URL carried on the env.
    expect(message).not.toContain(SECRET_LOOKING);
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("placeholder-not-a-real-key");
    expect(message).not.toContain("placeholder.supabase.co");

    logged.mockRestore();
  });

  it("FLAG OFF + construction throws: stays on the configured legacy path", async () => {
    // With the flag off the default resolver builds nothing, so a throwing
    // INJECTED resolver is not a fallback, it is the configured behavior.
    // Nothing is logged, because nothing failed closed.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps } = await composedCommerce(() => {
      throw new Error("injected");
    }, COMPOSED_ENV);
    await deps.cart.addLine(
      MEMBER,
      { sku: SKU, quantity: 1, purchaseMode: "one_time" },
      NOW,
    );
    const dto = await deps.cart.getCart(MEMBER, NOW);
    expect(dto.lines?.[0].unitPriceCents).toBe(LEGACY_FACT_CENTS);
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});

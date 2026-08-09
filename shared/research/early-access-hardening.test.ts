import { describe, expect, it } from "vitest";

import {
  CATALOG_LIVE_COMMERCE_STATES,
  CATALOG_ROADMAP_STAGES,
  EARLY_ACCESS_ORDER_STAGES,
  EARLY_ACCESS_SHIP_BY_HOURS,
  canAddToCart,
  cartCustomerPayloadIsClean,
  customerPayloadIsClean,
  earlyAccessIsOverdue,
  earlyAccessShipByAt,
  isEarlyAccessOrderStage,
  type EarlyAccessCatalogCard,
  type EarlyAccessSubmissionCustomerView,
} from "./early-access-hardening";

// ---------------------------------------------------------------------------
// The contract's load-bearing invariants. Each test here corresponds to a
// specific P0 or P1 in the risk register, so a lane that breaks one gets a red
// test naming the hazard rather than a silent behavior change.
// ---------------------------------------------------------------------------

describe("order stage vocabulary", () => {
  it("does not carry overdue as a stage, because overdue is derived", () => {
    expect(EARLY_ACCESS_ORDER_STAGES).not.toContain("overdue");
  });

  it("separates a reserved checkout from a submitted order", () => {
    expect(EARLY_ACCESS_ORDER_STAGES).toContain("checkout_reserved");
    expect(EARLY_ACCESS_ORDER_STAGES).toContain("payment_review_required");
    expect(EARLY_ACCESS_ORDER_STAGES.indexOf("checkout_reserved")).toBeLessThan(
      EARLY_ACCESS_ORDER_STAGES.indexOf("payment_review_required"),
    );
  });

  it("refuses an unknown stage", () => {
    expect(isEarlyAccessOrderStage("submitted")).toBe(false);
    expect(isEarlyAccessOrderStage("checkout_reserved")).toBe(true);
  });
});

describe("customer payload cleanliness", () => {
  const clean: EarlyAccessSubmissionCustomerView = {
    state: "accepted_for_review",
    method: "zelle",
    methodLabel: "Zelle",
    filename: "receipt.pdf",
    acceptedAt: "2026-08-09T12:00:00.000Z",
    retryAllowed: false,
  };

  it("accepts the customer view", () => {
    expect(customerPayloadIsClean(clean)).toBe(true);
  });

  it("refuses a provider message id anywhere in the payload", () => {
    expect(customerPayloadIsClean({ ...clean, providerMessageId: "abc" })).toBe(false);
  });

  it("refuses an internal field NESTED inside a submission blob", () => {
    // This is the exact shape of the accelerator's leak: not a top-level
    // field, so a shallow check would have passed it.
    expect(
      customerPayloadIsClean({
        checkout: { cartCheckoutNumber: "EAC-1" },
        submission: { state: "accepted_for_review", internalRecipient: "x@y.z" },
      }),
    ).toBe(false);
  });

  it("refuses an internal field inside an array element", () => {
    expect(customerPayloadIsClean({ submissions: [clean, { submissionKey: "k" }] })).toBe(false);
  });

  it("terminates on a cyclic payload instead of hanging", () => {
    const cyclic: Record<string, unknown> = { state: "in_progress" };
    cyclic.self = cyclic;
    expect(customerPayloadIsClean(cyclic)).toBe(true);
  });
});

describe("the cart customer projection refuses supplier identity", () => {
  // This reproduces the shape the status route returns at the accepted base,
  // where fulfilment.childOrders are child-release records with supplier
  // fields inside. It is a real leak today, not an accelerator hazard.
  const statusShapedLikeToday = {
    checkout: {
      cartCheckoutNumber: "XEC-063A962A0053A65324F21E7F",
      children: [
        { orderNumber: "XEA-1", quantity: 1, supplierId: "sup_7", supplierSku: "S-119" },
      ],
    },
    fulfilment: {
      released: true,
      childOrders: [
        { orderNumber: "XEA-1", supplierId: "sup_7", supplierSku: "S-119", tracking: [] },
      ],
    },
  };

  it("refuses the status payload as it is shaped today", () => {
    expect(cartCustomerPayloadIsClean(statusShapedLikeToday)).toBe(false);
  });

  it("refuses supplier identity nested in a child release array", () => {
    expect(
      cartCustomerPayloadIsClean({
        fulfilment: { childOrders: [{ orderNumber: "XEA-1", supplierSku: "S-119" }] },
      }),
    ).toBe(false);
  });

  it("refuses an ownership handle the read route already knew to strip", () => {
    expect(cartCustomerPayloadIsClean({ checkout: { customerRef: "eac_abc" } })).toBe(false);
    expect(cartCustomerPayloadIsClean({ checkout: { intentHash: "deadbeef" } })).toBe(false);
  });

  it("accepts a projection carrying only what a customer may see", () => {
    expect(
      cartCustomerPayloadIsClean({
        checkout: {
          cartCheckoutNumber: "XEC-063A962A0053A65324F21E7F",
          children: [{ orderNumber: "XEA-1", quantity: 1, payableCents: 18_000 }],
        },
        fulfilment: {
          released: true,
          childOrders: [{ orderNumber: "XEA-1", shippedAt: null, tracking: [] }],
        },
      }),
    ).toBe(true);
  });

  it("keeps the two forbidden-key lists independent", () => {
    // A supplier field is not a submission leak, and a provider id is not a
    // supplier leak. Merging the lists would let one fix satisfy the other's
    // assertion.
    expect(customerPayloadIsClean({ supplierId: "sup_7" })).toBe(true);
    expect(cartCustomerPayloadIsClean({ providerMessageId: "abc" })).toBe(true);
  });
});

describe("ship-by arithmetic", () => {
  it("is exactly payment verification plus 72 hours", () => {
    expect(EARLY_ACCESS_SHIP_BY_HOURS).toBe(72);
    expect(earlyAccessShipByAt("2026-08-09T00:00:00.000Z")).toBe("2026-08-12T00:00:00.000Z");
  });

  it("crosses a DST boundary without moving, because it is UTC arithmetic", () => {
    // 2026-11-01 is a US DST transition. A local-time implementation would
    // return an hour that is off by one; UTC does not care.
    expect(earlyAccessShipByAt("2026-10-31T12:00:00.000Z")).toBe("2026-11-03T12:00:00.000Z");
  });

  it("returns null rather than a wrong date for a non-exact instant", () => {
    expect(earlyAccessShipByAt("2026-08-09")).toBeNull();
    expect(earlyAccessShipByAt("not a date")).toBeNull();
    expect(earlyAccessShipByAt("2026-08-09T00:00:00Z")).toBeNull();
  });
});

describe("overdue is derived, and a shipped order is never overdue", () => {
  it("is overdue when unshipped and past the commitment", () => {
    expect(
      earlyAccessIsOverdue({
        stage: "processing",
        shipByAt: "2026-08-09T00:00:00.000Z",
        nowIso: "2026-08-10T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("is not overdue once shipped, however late it was", () => {
    expect(
      earlyAccessIsOverdue({
        stage: "shipped",
        shipByAt: "2026-08-09T00:00:00.000Z",
        nowIso: "2026-09-10T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("is not overdue before payment is verified, when there is no commitment yet", () => {
    expect(
      earlyAccessIsOverdue({
        stage: "checkout_reserved",
        shipByAt: null,
        nowIso: "2026-08-10T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});

describe("roadmap stage can never authorize a purchase", () => {
  const planned: EarlyAccessCatalogCard = {
    catalogId: "roadmap-bpc-157-5mg",
    displayName: "BPC-157",
    strength: "5mg",
    roadmapStage: "this_week",
    liveCommerce: "unavailable",
    addToCart: null,
    priceDisplay: null,
  };

  it("keeps the two dimensions separate", () => {
    expect(CATALOG_ROADMAP_STAGES).not.toContain("purchasable");
    expect(CATALOG_LIVE_COMMERCE_STATES).toContain("purchasable");
  });

  it("refuses Add to Cart for a this-week roadmap row with no live unit", () => {
    expect(canAddToCart(planned)).toBe(false);
  });

  it("still refuses when the roadmap row claims a price", () => {
    expect(canAddToCart({ ...planned, priceDisplay: "$180.00" })).toBe(false);
  });

  it("refuses a purchasable state with no live unit attached", () => {
    expect(canAddToCart({ ...planned, liveCommerce: "purchasable" })).toBe(false);
  });

  it("allows Add to Cart only with a purchasable state AND a live unit", () => {
    expect(
      canAddToCart({
        ...planned,
        roadmapStage: "planned",
        liveCommerce: "purchasable",
        addToCart: {
          productId: "prod_live",
          variantId: "var_live",
          unitPriceCents: 18_000,
          currency: "USD",
        },
      }),
    ).toBe(true);
  });
});

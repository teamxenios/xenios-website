import { describe, expect, it } from "vitest";
import {
  notConfirmed,
  type CatalogProduct,
  type ProvenancedFact,
} from "@shared/research/catalog";
import { STANDARD_SHIPPING_CENTS } from "@shared/research/commerce";
import type { StoreCreditEntry } from "@shared/research/distribution";
import type { InventoryLot } from "../inventory/lots";
import {
  createCartService,
  createInMemoryCartRepository,
  MAX_LINE_QUANTITY,
  type CartServiceDeps,
} from "./cart";

const NOW = new Date("2026-07-20T00:00:00Z");
const MEMBER = "member-1";

function confirmed<T>(value: T): ProvenancedFact<T> {
  return {
    value,
    confirmation: "confirmed",
    source: { kind: "supplier_document", reference: "TEST-DOC" },
  };
}

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  const base: CatalogProduct = {
    sku: "P001",
    slug: "p001",
    displayName: "Product One",
    lane: "research_material",
    availability: "in_stock",
    commerceApproval: "approved",
    fulfillmentOwner: "mitch",
    facts: {
      composition: confirmed("composition on file"),
      strength: confirmed("strength on file"),
      format: confirmed("format on file"),
      priceCents: confirmed(9900),
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
  };
  return { ...base, ...overrides };
}

function lot(overrides: Partial<InventoryLot> = {}): InventoryLot {
  return {
    lotId: "LOT-1",
    sku: "P001",
    owner: "mitch",
    disposition: "available",
    quantityAvailable: 10,
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

function credit(overrides: Partial<StoreCreditEntry> = {}): StoreCreditEntry {
  return {
    id: "SC-1",
    memberId: MEMBER,
    amountCents: 1000,
    state: "approved",
    reason: "referral_referrer",
    createdAt: "2026-06-01T00:00:00Z",
    availableAt: "2026-06-15T00:00:00Z",
    ...overrides,
  };
}

function deps(overrides: Partial<CartServiceDeps> = {}): CartServiceDeps {
  const base: CartServiceDeps = {
    repository: createInMemoryCartRepository(),
    catalog: new Map([["P001", product()]]),
    lots: [lot()],
    storeCredit: [],
    commerceEnabled: true,
    quantumCommerceEnabled: false,
    requiredAgreementKeys: ["research_use_only"],
  };
  return { ...base, ...overrides };
}

describe("cart reads", () => {
  it("reports an empty cart as blocked rather than ready", () => {
    const service = createCartService(deps());
    const cart = service.getCart(MEMBER, NOW);

    expect(cart.lines).toEqual([]);
    expect(cart.checkoutReady).toBe(false);
    expect(cart.blockingReasons).toContain("cart_empty");
    expect(cart.subtotalCents).toBe(0);
    expect(cart.shippingCents).toBe(0);
  });

  it("computes totals from the catalog for a clean line", () => {
    const service = createCartService(deps());
    const added = service.addLine(MEMBER, { sku: "P001", quantity: 2, purchaseMode: "one_time" }, NOW);

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.lines[0].unitPriceCents).toBe(9900);
    expect(added.cart.lines[0].lineTotalCents).toBe(19800);
    expect(added.cart.lines[0].blockedReason).toBeNull();
    expect(added.cart.subtotalCents).toBe(19800);
    expect(added.cart.shippingCents).toBe(STANDARD_SHIPPING_CENTS);
    expect(added.cart.estimatedTotalCents).toBe(19800 + STANDARD_SHIPPING_CENTS);
    expect(added.cart.checkoutReady).toBe(true);
    expect(added.cart.requiredAgreements).toEqual(["research_use_only"]);
  });
});

describe("unconfirmed supplier facts", () => {
  it("never marks a cart with an unconfirmed price as checkout ready", () => {
    const unpriced = product({
      facts: { ...product().facts, priceCents: notConfirmed<number>() },
    });
    const service = createCartService(deps({ catalog: new Map([["P001", unpriced]]) }));

    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const line = added.cart.lines[0];
    expect(line.unitPriceCents).toBeNull();
    expect(line.lineTotalCents).toBeNull();
    expect(line.blockedReason).toBe("unconfirmed_supplier_facts");
    expect(added.cart.subtotalCents).toBe(0);
    expect(added.cart.checkoutReady).toBe(false);
    expect(added.cart.blockingReasons).toContain("unconfirmed_supplier_facts");
  });

  it("blocks a disputed price even when a value is present", () => {
    const disputed = product({
      facts: {
        ...product().facts,
        priceCents: {
          value: 9900,
          confirmation: "confirmed",
          source: { kind: "supplier_document" },
          conflictNote: "two supplier documents disagree",
        },
      },
    });
    const service = createCartService(deps({ catalog: new Map([["P001", disputed]]) }));

    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.lines[0].unitPriceCents).toBeNull();
    expect(added.cart.checkoutReady).toBe(false);
  });
});

describe("stock", () => {
  it("blocks a line whose only lot is expired", () => {
    const service = createCartService(deps({ lots: [lot({ expiryDate: "2026-01-01" })] }));

    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.lines[0].blockedReason).toBe("insufficient_stock");
    expect(added.cart.checkoutReady).toBe(false);
  });

  it("does not count a quarantined lot toward available stock", () => {
    const service = createCartService(
      deps({ lots: [lot({ disposition: "quarantined", quantityAvailable: 50 })] }),
    );

    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.lines[0].blockedReason).toBe("insufficient_stock");
  });

  it("blocks a lot with an unknown expiry", () => {
    const service = createCartService(deps({ lots: [lot({ expiryDate: null })] }));

    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.lines[0].blockedReason).toBe("insufficient_stock");
  });

  it("blocks when the requested quantity exceeds allocatable stock", () => {
    const service = createCartService(deps({ lots: [lot({ quantityAvailable: 3 })] }));

    const added = service.addLine(MEMBER, { sku: "P001", quantity: 4, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.lines[0].blockedReason).toBe("insufficient_stock");
  });
});

describe("revalidation", () => {
  it("flips a previously valid line to blocked once its lot expires", () => {
    const service = createCartService(deps({ lots: [lot({ expiryDate: "2026-08-01" })] }));

    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.checkoutReady).toBe(true);

    const later = service.revalidate(MEMBER, new Date("2026-09-01T00:00:00Z"));
    expect(later.lines[0].blockedReason).toBe("insufficient_stock");
    expect(later.checkoutReady).toBe(false);
  });

  it("flips a line to blocked when the product leaves purchasable availability", () => {
    const catalog = new Map([["P001", product()]]);
    const service = createCartService(deps({ catalog }));

    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.checkoutReady).toBe(true);

    catalog.set("P001", product({ availability: "out_of_stock" }));
    const revalidated = service.revalidate(MEMBER, NOW);
    expect(revalidated.lines[0].blockedReason).toBe("product_not_purchasable");
    expect(revalidated.checkoutReady).toBe(false);
  });
});

describe("store credit", () => {
  it("never applies more credit than the subtotal", () => {
    const service = createCartService(
      deps({ storeCredit: [credit({ amountCents: 500_000 })] }),
    );

    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.storeCreditAppliedCents).toBe(9900);
    expect(added.cart.estimatedTotalCents).toBe(STANDARD_SHIPPING_CENTS);
  });

  it("counts only approved entries", () => {
    const service = createCartService(
      deps({
        storeCredit: [
          credit({ id: "SC-1", amountCents: 1000, state: "approved" }),
          credit({ id: "SC-2", amountCents: 5000, state: "pending" }),
          credit({ id: "SC-3", amountCents: 5000, state: "held" }),
          credit({ id: "SC-4", amountCents: 5000, state: "reversed" }),
          credit({ id: "SC-5", amountCents: 5000, state: "fraud_flagged" }),
        ],
      }),
    );

    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.storeCreditAppliedCents).toBe(1000);
  });

  it("ignores another member's credit", () => {
    const service = createCartService(
      deps({ storeCredit: [credit({ memberId: "member-2", amountCents: 5000 })] }),
    );

    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.storeCreditAppliedCents).toBe(0);
  });

  it("never drives a total below zero on an unpriced cart", () => {
    const unpriced = product({ facts: { ...product().facts, priceCents: notConfirmed<number>() } });
    const service = createCartService(
      deps({
        catalog: new Map([["P001", unpriced]]),
        storeCredit: [credit({ amountCents: 50_000 })],
      }),
    );

    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.storeCreditAppliedCents).toBe(0);
    expect(added.cart.estimatedTotalCents).toBeGreaterThanOrEqual(0);
  });
});

describe("shipping", () => {
  it("charges shipping once across a two-owner split", () => {
    const catalog = new Map([
      ["P001", product()],
      ["P002", product({ sku: "P002", slug: "p002", displayName: "Product Two", fulfillmentOwner: "xenios" })],
    ]);
    const service = createCartService(
      deps({ catalog, lots: [lot(), lot({ lotId: "LOT-2", sku: "P002", owner: "xenios" })] }),
    );

    service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    const added = service.addLine(MEMBER, { sku: "P002", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    expect(added.cart.shipmentGroups).toHaveLength(2);
    expect(added.cart.shippingCents).toBe(STANDARD_SHIPPING_CENTS);
    expect(added.cart.estimatedTotalCents).toBe(19800 + STANDARD_SHIPPING_CENTS);
    expect(added.cart.checkoutReady).toBe(true);
  });
});

describe("add denials", () => {
  it("rejects zero, negative, and fractional quantities", () => {
    const service = createCartService(deps());
    for (const quantity of [0, -1, 1.5]) {
      const result = service.addLine(MEMBER, { sku: "P001", quantity, purchaseMode: "one_time" }, NOW);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("quantity_invalid");
    }
  });

  // Regression: `Number.isInteger` is true for 1e21, so a whole-number check alone let
  // a quantity through that drove the line total past Number.MAX_SAFE_INTEGER, where a
  // total stops being an exact count of cents.
  it("rejects a quantity large enough to leave exact integer cents", () => {
    const service = createCartService(deps());
    for (const quantity of [1e21, Number.MAX_SAFE_INTEGER, MAX_LINE_QUANTITY + 1]) {
      const result = service.addLine(MEMBER, { sku: "P001", quantity, purchaseMode: "one_time" }, NOW);
      expect(result.ok, `expected ${quantity} to be refused`).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("quantity_invalid");
    }
  });

  it("accepts a quantity at the ceiling", () => {
    const service = createCartService(
      deps({ lots: [lot({ quantityAvailable: MAX_LINE_QUANTITY })] }),
    );
    const result = service.addLine(
      MEMBER,
      { sku: "P001", quantity: MAX_LINE_QUANTITY, purchaseMode: "one_time" },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Number.isSafeInteger(result.cart.lines[0].lineTotalCents!)).toBe(true);
    expect(Number.isSafeInteger(result.cart.subtotalCents)).toBe(true);
  });

  // The bound is on the resulting line, so repeated adds cannot walk past it.
  it("rejects an add that would push an existing line over the ceiling", () => {
    const service = createCartService(
      deps({ lots: [lot({ quantityAvailable: MAX_LINE_QUANTITY })] }),
    );
    const first = service.addLine(
      MEMBER,
      { sku: "P001", quantity: MAX_LINE_QUANTITY, purchaseMode: "one_time" },
      NOW,
    );
    expect(first.ok).toBe(true);

    const second = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("quantity_invalid");

    // The refused add left the stored line untouched.
    expect(service.getCart(MEMBER, NOW).lines[0].quantity).toBe(MAX_LINE_QUANTITY);
  });

  it("rejects an update above the ceiling", () => {
    const service = createCartService(deps());
    service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);

    const result = service.updateLine(MEMBER, "P001", MAX_LINE_QUANTITY + 1, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("quantity_invalid");
  });

  it("rejects an unknown sku", () => {
    const service = createCartService(deps());
    const result = service.addLine(MEMBER, { sku: "NOPE", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("product_not_found");
  });

  it("rejects every add while product commerce is disabled", () => {
    const service = createCartService(deps({ commerceEnabled: false }));
    const result = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("commerce_disabled");
  });

  it("rejects a subscription with no frequency", () => {
    const service = createCartService(deps());
    const result = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "subscription" }, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("subscription_action_invalid");
  });

  it("rejects a subscription frequency outside the allowed set", () => {
    const service = createCartService(deps());
    const result = service.addLine(
      MEMBER,
      // A client could post any number, so the value is checked against the contract.
      { sku: "P001", quantity: 1, purchaseMode: "subscription", subscriptionFrequencyDays: 45 as 30 },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("subscription_action_invalid");
  });

  it("rejects a subscription on a product that is not subscription eligible", () => {
    const service = createCartService(
      deps({ catalog: new Map([["P001", product({ subscriptionEligible: false })]]) }),
    );
    const result = service.addLine(
      MEMBER,
      { sku: "P001", quantity: 1, purchaseMode: "subscription", subscriptionFrequencyDays: 30 },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("subscription_action_invalid");
  });

  it("accepts a valid subscription selection", () => {
    const service = createCartService(deps());
    const result = service.addLine(
      MEMBER,
      { sku: "P001", quantity: 1, purchaseMode: "subscription", subscriptionFrequencyDays: 60 },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cart.lines[0].purchaseMode).toBe("subscription");
    expect(result.cart.lines[0].subscriptionFrequencyDays).toBe(60);
    expect(result.cart.checkoutReady).toBe(true);
  });
});

describe("lane gating", () => {
  it("blocks a quantum line while quantum commerce is off", () => {
    const service = createCartService(
      deps({ catalog: new Map([["P001", product({ lane: "quantum" })]]) }),
    );
    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.lines[0].blockedReason).toBe("lane_not_purchasable");
    expect(added.cart.checkoutReady).toBe(false);
  });

  it("blocks a future clinical line even when every capability is on", () => {
    const service = createCartService(
      deps({
        catalog: new Map([["P001", product({ lane: "future_clinical" })]]),
        quantumCommerceEnabled: true,
      }),
    );
    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.lines[0].blockedReason).toBe("lane_not_purchasable");
  });

  it("blocks a product with no assigned fulfillment owner", () => {
    const service = createCartService(
      deps({ catalog: new Map([["P001", product({ fulfillmentOwner: "not_assigned" })]]) }),
    );
    const added = service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.cart.lines[0].blockedReason).toBe("product_not_purchasable");
    expect(added.cart.shipmentGroups).toEqual([]);
  });
});

describe("update and remove", () => {
  it("rejects an invalid update quantity", () => {
    const service = createCartService(deps());
    service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);

    const result = service.updateLine(MEMBER, "P001", 0, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("quantity_invalid");
  });

  it("rejects an update to a sku that is not in the cart", () => {
    const service = createCartService(deps());
    const result = service.updateLine(MEMBER, "P001", 2, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("product_not_found");
  });

  it("recomputes totals on update", () => {
    const service = createCartService(deps());
    service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);

    const result = service.updateLine(MEMBER, "P001", 3, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cart.lines[0].quantity).toBe(3);
    expect(result.cart.subtotalCents).toBe(29700);
  });

  it("removes a line and tolerates removing one that is absent", () => {
    const service = createCartService(deps());
    service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);

    const afterRemove = service.removeLine(MEMBER, "P001", NOW);
    expect(afterRemove.lines).toEqual([]);
    expect(afterRemove.blockingReasons).toContain("cart_empty");

    const again = service.removeLine(MEMBER, "P001", NOW);
    expect(again.lines).toEqual([]);
  });

  it("keeps carts separate per member", () => {
    const service = createCartService(deps());
    service.addLine(MEMBER, { sku: "P001", quantity: 1, purchaseMode: "one_time" }, NOW);

    expect(service.getCart("member-2", NOW).lines).toEqual([]);
    expect(service.getCart(MEMBER, NOW).lines).toHaveLength(1);
  });
});

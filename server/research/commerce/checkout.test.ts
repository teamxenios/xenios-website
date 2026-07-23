import { describe, expect, it, vi } from "vitest";
import type { CartDto, CheckoutRequest } from "@shared/research/commerce-api";
import { LARGE_ORDER_THRESHOLD_CENTS } from "@shared/research/commerce";
import type { InventoryLot } from "../inventory/lots";
import { DisabledPaymentProvider, TestPaymentProvider } from "../providers/payment";
import {
  ConfiguredRateShippingProvider,
  DisabledShippingProvider,
  type ShippingProvider,
} from "../providers/shipping";
import {
  createCheckoutService,
  createInventoryReservationSeam,
  type CheckoutDeps,
  type ReservationAuditEvent,
  type ReservationSeam,
} from "./checkout";
import {
  createInMemoryInventoryLotStore,
  type InventoryLotRepository,
} from "./persistence/inventory-store";
import { createInMemoryReservationStore } from "./persistence/reservations-store";
import {
  createInMemoryClaimOrderRepository,
  createInMemoryClaimRepository,
  createRefundService,
} from "./refunds";

const NOW = new Date("2026-07-20T00:00:00Z");

function cart(overrides: Partial<CartDto> = {}): CartDto {
  return {
    lines: [
      {
        sku: "P001",
        displayName: "Product One",
        quantity: 2,
        purchaseMode: "one_time",
        unitPriceCents: 9900,
        lineTotalCents: 19800,
        blockedReason: null,
      },
    ],
    shipmentGroups: [{ owner: "mitch", skus: ["P001"] }],
    subtotalCents: 19800,
    shippingCents: 1295,
    storeCreditAppliedCents: 0,
    estimatedTotalCents: 21095,
    checkoutReady: true,
    blockingReasons: [],
    requiredAgreements: ["research_use_v1"],
    ...overrides,
  };
}

function request(overrides: Partial<CheckoutRequest> = {}): CheckoutRequest {
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
    idempotencyKey: "key_1",
    ...overrides,
  };
}

function deps(overrides: Partial<CheckoutDeps> = {}): CheckoutDeps {
  return {
    cart: { revalidate: () => cart() },
    payment: new TestPaymentProvider(),
    shipping: new ConfiguredRateShippingProvider(),
    commerceEnabled: true,
    serviceableStates: ["TX", "CA"],
    acceptedAgreementKeys: ["research_use_v1"],
    ...overrides,
  };
}

describe("commerce disabled (the state today)", () => {
  it("denies and never touches the payment provider", async () => {
    const payment = new TestPaymentProvider();
    const authorize = vi.spyOn(payment, "createAuthorization");
    const capture = vi.spyOn(payment, "captureAuthorization");

    const service = createCheckoutService(deps({ commerceEnabled: false, payment }));
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.denials).toContain("commerce_disabled");
    expect(authorize).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("creates no order, so a second submit with the same key is still a denial", async () => {
    const service = createCheckoutService(deps({ commerceEnabled: false }));
    const first = await service.submit("mem_1", request(), NOW);
    const second = await service.submit("mem_1", request(), NOW);

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
  });
});

describe("gate accumulation", () => {
  it("reports every failure rather than stopping at the first", async () => {
    const service = createCheckoutService(
      deps({
        commerceEnabled: false,
        cart: {
          revalidate: async () =>
            cart({
              lines: [],
              checkoutReady: false,
              blockingReasons: ["insufficient_stock"],
            }),
        },
        shipping: new DisabledShippingProvider(),
        payment: new DisabledPaymentProvider(),
        serviceableStates: ["CA"],
      }),
    );

    const result = await service.validate(
      "mem_1",
      request({
        acceptedAgreementKeys: [],
        shippingAddress: {
          line1: "",
          city: "",
          state: "ZZZ",
          postalCode: "abc",
          country: "US",
        },
      }),
      NOW,
    );

    expect(result.ok).toBe(false);
    expect(result.denials).toEqual(
      expect.arrayContaining([
        "commerce_disabled",
        "cart_empty",
        "cart_revalidation_failed",
        "insufficient_stock",
        "agreement_required",
        "address_invalid",
        "state_not_serviceable",
        "shipping_unavailable",
        "payment_disabled",
      ]),
    );
  });

  it("does not report the same code twice", async () => {
    const service = createCheckoutService(
      deps({
        cart: {
          revalidate: async () =>
            cart({
              checkoutReady: false,
              blockingReasons: ["cart_revalidation_failed", "quantity_invalid"],
            }),
        },
      }),
    );

    const result = await service.validate("mem_1", request(), NOW);
    const occurrences = result.denials.filter((d) => d === "cart_revalidation_failed");
    expect(occurrences).toHaveLength(1);
  });

  it("denies a line with no confirmed price rather than treating it as free", async () => {
    const service = createCheckoutService(
      deps({
        cart: {
          revalidate: async () =>
            cart({
              lines: [
                {
                  sku: "P002",
                  displayName: "Product Two",
                  quantity: 1,
                  purchaseMode: "one_time",
                  unitPriceCents: null,
                  lineTotalCents: null,
                  blockedReason: null,
                },
              ],
            }),
        },
      }),
    );

    const result = await service.validate("mem_1", request(), NOW);
    expect(result.denials).toContain("unconfirmed_supplier_facts");
  });

  it("denies an unserviceable state even when the address is well formed", async () => {
    const service = createCheckoutService(deps({ serviceableStates: ["CA"] }));
    const result = await service.validate("mem_1", request(), NOW);

    expect(result.ok).toBe(false);
    expect(result.denials).toContain("state_not_serviceable");
    expect(result.denials).not.toContain("address_invalid");
  });

  it("denies when the required agreement version is not presented", async () => {
    const service = createCheckoutService(deps({ acceptedAgreementKeys: ["research_use_v2"] }));
    const result = await service.validate("mem_1", request(), NOW);
    expect(result.denials).toContain("agreement_required");
  });

  it("denies when the provider cannot quote the requested service", async () => {
    const service = createCheckoutService(deps());
    const result = await service.validate("mem_1", request({ shippingService: "next_day" }), NOW);
    expect(result.denials).toContain("shipping_unavailable");
  });

  it("passes every gate on a clean cart", async () => {
    const service = createCheckoutService(deps());
    const result = await service.validate("mem_1", request(), NOW);
    expect(result).toEqual({ ok: true, denials: [] });
  });
});

describe("submit", () => {
  it("reserves nothing and reads no client price when a gate fails", async () => {
    const revalidate = vi.fn(async () => cart({ checkoutReady: false, blockingReasons: ["insufficient_stock"] }));
    const payment = new TestPaymentProvider();
    const authorize = vi.spyOn(payment, "createAuthorization");
    const shipping = new ConfiguredRateShippingProvider();
    const buyLabel = vi.spyOn(shipping, "buyLabel");

    const service = createCheckoutService(deps({ cart: { revalidate }, payment, shipping }));
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(false);
    expect(authorize).not.toHaveBeenCalled();
    expect(buyLabel).not.toHaveBeenCalled();
  });

  it("computes the total server-side from the catalog cart", async () => {
    const service = createCheckoutService(deps());
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.order.subtotalCents).toBe(19800);
      expect(outcome.order.shippingCents).toBe(1295);
      expect(outcome.order.totalCents).toBe(21095);
    }
  });

  it("charges shipping once even when the order splits across owners", async () => {
    const service = createCheckoutService(
      deps({
        cart: {
          revalidate: async () =>
            cart({
              shipmentGroups: [
                { owner: "mitch", skus: ["P001"] },
                { owner: "xenios", skus: ["P002"] },
              ],
            }),
        },
      }),
    );

    const outcome = await service.submit("mem_1", request(), NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.order.shippingCents).toBe(1295);
  });

  it("reaches a paid state only with a provider reference", async () => {
    const service = createCheckoutService(deps());
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.order.state).toBe("payment_captured");
      expect(outcome.order.paymentReference).toBeTruthy();
      expect(outcome.order.captured).toBe(true);
    }
  });

  it("cancels rather than half-creating an order when authorization is refused", async () => {
    const payment = new TestPaymentProvider();
    vi.spyOn(payment, "createAuthorization").mockResolvedValue({
      ok: false,
      code: "REJECTED",
      message: "Card declined.",
      retryable: false,
    });

    const service = createCheckoutService(deps({ payment }));
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.denials).toContain("payment_failed");
  });
});

describe("large-order review", () => {
  const bigCart = cart({
    lines: [
      {
        sku: "P001",
        displayName: "Product One",
        quantity: 3,
        purchaseMode: "one_time",
        unitPriceCents: 40000,
        lineTotalCents: 120000,
        blockedReason: null,
      },
    ],
    subtotalCents: 120000,
    estimatedTotalCents: 121295,
  });

  it("holds the order in manual_review, authorized but never captured", async () => {
    const payment = new TestPaymentProvider();
    const capture = vi.spyOn(payment, "captureAuthorization");

    const service = createCheckoutService(deps({ payment, cart: { revalidate: () => bigCart } }));
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.order.totalCents).toBeGreaterThan(LARGE_ORDER_THRESHOLD_CENTS);
      expect(outcome.order.state).toBe("manual_review");
      expect(outcome.order.captured).toBe(false);
      expect(outcome.order.reviewTriggers).toContain("total_exceeds_threshold");
      expect(outcome.order.paymentReference).toBeTruthy();
    }
    expect(capture).not.toHaveBeenCalled();
  });

  it("does not authorize at all when the provider cannot defer capture", async () => {
    const payment = new TestPaymentProvider();
    Object.defineProperty(payment, "supportsDeferredCapture", { value: false });
    const authorize = vi.spyOn(payment, "createAuthorization");

    const service = createCheckoutService(deps({ payment, cart: { revalidate: () => bigCart } }));
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.order.state).toBe("manual_review");
      expect(outcome.order.paymentReference).toBeNull();
    }
    expect(authorize).not.toHaveBeenCalled();
  });

  it("holds an unusual quantity even below the money threshold", async () => {
    const service = createCheckoutService(
      deps({
        cart: {
          revalidate: async () =>
            cart({
              lines: [
                {
                  sku: "P001",
                  displayName: "Product One",
                  quantity: 40,
                  purchaseMode: "one_time",
                  unitPriceCents: 100,
                  lineTotalCents: 4000,
                  blockedReason: null,
                },
              ],
              subtotalCents: 4000,
              estimatedTotalCents: 5295,
            }),
        },
      }),
    );

    const outcome = await service.submit("mem_1", request(), NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.order.state).toBe("manual_review");
      expect(outcome.order.reviewTriggers).toContain("unusual_quantity");
    }
  });

  // Regression: review used to be assessed on the total AFTER store credit, so a
  // member could spend manufactured referral credit to drop an order under the
  // threshold and skip the human check entirely. Credit changes what is charged,
  // never whether the order is reviewed.
  it("reviews on the order value, so store credit cannot buy a way under the threshold", async () => {
    const service = createCheckoutService(
      deps({
        unusualQuantityThreshold: 100,
        cart: {
          revalidate: async () =>
            cart({
              lines: [
                {
                  sku: "P001",
                  displayName: "Product One",
                  quantity: 3,
                  purchaseMode: "one_time",
                  unitPriceCents: 40000,
                  lineTotalCents: 120000,
                  blockedReason: null,
                },
              ],
              subtotalCents: 120000,
              storeCreditAppliedCents: 30000,
              estimatedTotalCents: 91295,
            }),
        },
      }),
    );

    const outcome = await service.submit("mem_1", request(), NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // Charged net of the credit, but still held for review on the gross value.
      expect(outcome.order.totalCents).toBe(91295);
      expect(outcome.order.totalCents).toBeLessThan(LARGE_ORDER_THRESHOLD_CENTS);
      expect(outcome.order.reviewTriggers).toContain("total_exceeds_threshold");
      expect(outcome.order.state).toBe("manual_review");
      expect(outcome.order.captured).toBe(false);
    }
  });

  it("does not review an ordinary order merely because credit was applied", async () => {
    const service = createCheckoutService(
      deps({
        cart: { revalidate: () => cart({ storeCreditAppliedCents: 5000, estimatedTotalCents: 16095 }) },
      }),
    );

    const outcome = await service.submit("mem_1", request(), NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.order.reviewTriggers).toEqual([]);
      expect(outcome.order.totalCents).toBe(16095);
    }
  });

  it("holds a fraud-flagged member", async () => {
    const service = createCheckoutService(deps({ isFraudFlagged: () => true }));
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.order.state).toBe("manual_review");
      expect(outcome.order.reviewTriggers).toContain("fraud_rule");
    }
  });
});

describe("store credit is consumed, not reusable", () => {
  function spendRecorder() {
    const spends: Array<{ memberId: string; amountCents: number; orderId: string }> = [];
    return {
      spends,
      storeCredit: {
        async recordSpend(memberId: string, amountCents: number, orderId: string) {
          spends.push({ memberId, amountCents, orderId });
        },
      },
    };
  }

  it("records the applied credit against the order once the payment authorizes", async () => {
    const { spends, storeCredit } = spendRecorder();
    const service = createCheckoutService(
      deps({
        cart: { revalidate: () => cart({ storeCreditAppliedCents: 5000, estimatedTotalCents: 16095 }) },
        storeCredit,
      }),
    );

    const outcome = await service.submit("mem_1", request(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(spends).toEqual([{ memberId: "mem_1", amountCents: 5000, orderId: outcome.order.orderId }]);
  });

  it("records nothing when no credit was applied, and nothing when the authorization fails", async () => {
    const clean = spendRecorder();
    const noCredit = createCheckoutService(deps({ storeCredit: clean.storeCredit }));
    expect((await noCredit.submit("mem_1", request(), NOW)).ok).toBe(true);
    expect(clean.spends).toEqual([]);

    const failed = spendRecorder();
    const failing = createCheckoutService(
      deps({
        cart: { revalidate: () => cart({ storeCreditAppliedCents: 5000, estimatedTotalCents: 16095 }) },
        payment: new DisabledPaymentProvider(),
        storeCredit: failed.storeCredit,
      }),
    );
    const outcome = await failing.submit("mem_1", request(), NOW);
    expect(outcome.ok).toBe(false); // payment gate refuses; no order, no charge
    expect(failed.spends).toEqual([]); // and no credit consumed
  });

  it("does not double-record the spend on an idempotent duplicate submit", async () => {
    const { spends, storeCredit } = spendRecorder();
    const service = createCheckoutService(
      deps({
        cart: { revalidate: () => cart({ storeCreditAppliedCents: 5000, estimatedTotalCents: 16095 }) },
        storeCredit,
      }),
    );

    const first = await service.submit("mem_1", request(), NOW);
    const second = await service.submit("mem_1", request(), NOW);
    expect(first.ok && second.ok).toBe(true);
    expect(spends).toHaveLength(1);
  });

  it("records the spend for a review-held order too, since its authorization is net of credit", async () => {
    const { spends, storeCredit } = spendRecorder();
    const service = createCheckoutService(
      deps({
        cart: {
          revalidate: () =>
            cart({
              lines: [
                {
                  sku: "P001",
                  displayName: "Product One",
                  quantity: 10,
                  purchaseMode: "one_time",
                  unitPriceCents: 9900,
                  lineTotalCents: 99000,
                  blockedReason: null,
                },
              ],
              subtotalCents: 99000,
              storeCreditAppliedCents: 9000,
              estimatedTotalCents: 91295,
            }),
        },
        storeCredit,
      }),
    );

    const outcome = await service.submit("mem_1", request(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.order.state).toBe("manual_review");
    expect(spends).toEqual([{ memberId: "mem_1", amountCents: 9000, orderId: outcome.order.orderId }]);
  });
});

describe("idempotency", () => {
  it("returns the same order for a repeated key instead of creating a second", async () => {
    const payment = new TestPaymentProvider();
    const authorize = vi.spyOn(payment, "createAuthorization");
    const service = createCheckoutService(deps({ payment }));

    const first = await service.submit("mem_1", request(), NOW);
    const second = await service.submit("mem_1", request(), NOW);

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.order.orderId).toBe(first.order.orderId);
      expect(second.idempotent).toBe(true);
      expect(first.idempotent).toBe(false);
    }
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it("scopes the key per member so two members cannot collide", async () => {
    const service = createCheckoutService(deps());
    const first = await service.submit("mem_1", request(), NOW);
    const second = await service.submit("mem_2", request(), NOW);

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.order.orderId).not.toBe(first.order.orderId);
      expect(second.order.memberId).toBe("mem_2");
    }
  });

  it("creates a distinct order for a distinct key", async () => {
    const service = createCheckoutService(deps());
    const first = await service.submit("mem_1", request({ idempotencyKey: "key_1" }), NOW);
    const second = await service.submit("mem_1", request({ idempotencyKey: "key_2" }), NOW);

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.order.orderId).not.toBe(first.order.orderId);
    }
  });

  // Regression: the key used to be recorded only after `evaluate` had awaited, so two
  // overlapping submits both found the map empty and each created an order and an
  // authorization. A member who double-clicked Place Order was charged twice.
  it("creates one order and one authorization when the same key is submitted concurrently", async () => {
    const payment = new TestPaymentProvider();
    const authorize = vi.spyOn(payment, "createAuthorization");
    const service = createCheckoutService(deps({ payment }));

    const [first, second] = await Promise.all([
      service.submit("mem_1", request(), NOW),
      service.submit("mem_1", request(), NOW),
    ]);

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.order.orderId).toBe(first.order.orderId);
    }
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it("still separates concurrent submits from two members sharing one key", async () => {
    const service = createCheckoutService(deps());
    const [first, second] = await Promise.all([
      service.submit("mem_1", request(), NOW),
      service.submit("mem_2", request(), NOW),
    ]);

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.order.orderId).not.toBe(first.order.orderId);
    }
  });

  // A denial creates no order, so the key must not be poisoned by the refusal.
  it("re-evaluates a key whose concurrent submissions were all denied", async () => {
    let outOfStock = true;
    const service = createCheckoutService(
      deps({
        cart: {
          revalidate: async () =>
            outOfStock
              ? cart({ checkoutReady: false, blockingReasons: ["insufficient_stock"] })
              : cart(),
        },
      }),
    );

    const [first, second] = await Promise.all([
      service.submit("mem_1", request(), NOW),
      service.submit("mem_1", request(), NOW),
    ]);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);

    outOfStock = false;
    const retry = await service.submit("mem_1", request(), NOW);
    expect(retry.ok).toBe(true);
  });
});

describe("payment capability", () => {
  it("denies when the provider is disabled and never authorizes", async () => {
    const payment = new DisabledPaymentProvider();
    const authorize = vi.spyOn(payment, "createAuthorization");

    const service = createCheckoutService(deps({ payment }));
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.denials).toContain("payment_disabled");
    expect(authorize).not.toHaveBeenCalled();
  });

  it("treats a MISCONFIGURED provider as unusable rather than as an outage to retry", async () => {
    const payment = new TestPaymentProvider();
    vi.spyOn(payment, "retrieveStatus").mockResolvedValue({
      ok: false,
      code: "MISCONFIGURED",
      message: "Adapter not implemented.",
      retryable: false,
    });

    const service = createCheckoutService(deps({ payment }));
    const result = await service.validate("mem_1", request(), NOW);
    expect(result.denials).toContain("payment_disabled");
  });
});

describe("shipping capability", () => {
  it("denies when a quote cannot be produced", async () => {
    const shipping: ShippingProvider = new DisabledShippingProvider();
    const service = createCheckoutService(deps({ shipping }));
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.denials).toContain("shipping_unavailable");
  });
});

// ---------------------------------------------------------------------------
// Inventory reservation seam at checkout
// ---------------------------------------------------------------------------

/** A seam that counts every call, so a test can prove exactly what ran. */
function countingSeam(reserveOutcome?: { refusals: Array<"insufficient_stock" | "coa_missing" | "lot_expired" | "lot_recalled"> }) {
  const calls = { reserve: 0, release: 0, finalize: 0 };
  const released: string[][] = [];
  const finalized: string[][] = [];
  let seq = 0;
  const seam: ReservationSeam = {
    async reserve(_memberId, lines) {
      calls.reserve += 1;
      if (reserveOutcome) return { ok: false, refusals: reserveOutcome.refusals };
      return { ok: true, reservationIds: lines.map(() => `rsv_${++seq}`) };
    },
    async release(ids) {
      calls.release += 1;
      released.push([...ids]);
    },
    async finalize(ids) {
      calls.finalize += 1;
      finalized.push([...ids]);
    },
  };
  return { seam, calls, released, finalized };
}

describe("inventory reservation at checkout (counting seam)", () => {
  it("reserves once on a clean submit, carries the ids, and finalizes on capture", async () => {
    const { seam, calls, finalized } = countingSeam();
    const service = createCheckoutService(deps({ inventory: seam }));
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.order.state).toBe("payment_captured");
      expect(outcome.order.reservationIds).toEqual(["rsv_1"]);
    }
    expect(calls).toEqual({ reserve: 1, release: 0, finalize: 1 });
    expect(finalized).toEqual([["rsv_1"]]);
  });

  it("never reserves when a gate denies", async () => {
    const { seam, calls } = countingSeam();
    const service = createCheckoutService(deps({ inventory: seam, commerceEnabled: false }));
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(false);
    expect(calls.reserve).toBe(0);
  });

  it("denies insufficient_stock with the precise lot refusals when the seam refuses, charging nothing", async () => {
    const { seam } = countingSeam({ refusals: ["insufficient_stock", "lot_expired", "coa_missing"] });
    const payment = new TestPaymentProvider();
    const authorize = vi.spyOn(payment, "createAuthorization");
    const service = createCheckoutService(deps({ inventory: seam, payment }));

    const outcome = await service.submit("mem_1", request(), NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.denials).toContain("insufficient_stock");
      expect(outcome.reservationRefusals).toEqual([
        "insufficient_stock",
        "lot_expired",
        "coa_missing",
      ]);
    }
    expect(authorize).not.toHaveBeenCalled();
  });

  it("does not poison the idempotency key on a reservation refusal", async () => {
    let refuse = true;
    let seq = 0;
    const seam: ReservationSeam = {
      async reserve(_memberId, lines) {
        if (refuse) return { ok: false, refusals: ["insufficient_stock"] };
        return { ok: true, reservationIds: lines.map(() => `rsv_${++seq}`) };
      },
      async release() {},
      async finalize() {},
    };
    const service = createCheckoutService(deps({ inventory: seam }));

    expect((await service.submit("mem_1", request(), NOW)).ok).toBe(false);
    refuse = false; // stock arrived; the same key must evaluate fresh
    expect((await service.submit("mem_1", request(), NOW)).ok).toBe(true);
  });

  it("releases the hold when the payment authorization is refused", async () => {
    const { seam, calls, released } = countingSeam();
    const payment = new TestPaymentProvider();
    vi.spyOn(payment, "createAuthorization").mockResolvedValue({
      ok: false,
      code: "REJECTED",
      message: "Card declined.",
      retryable: false,
    });

    const service = createCheckoutService(deps({ inventory: seam, payment }));
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(false);
    expect(calls).toEqual({ reserve: 1, release: 1, finalize: 0 });
    expect(released).toEqual([["rsv_1"]]);
  });

  it("an idempotent replay returns the stored order before reserve is reached", async () => {
    const { seam, calls } = countingSeam();
    const service = createCheckoutService(deps({ inventory: seam }));

    const first = await service.submit("mem_1", request(), NOW);
    const second = await service.submit("mem_1", request(), NOW);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.idempotent).toBe(true);
      expect(second.order.reservationIds).toEqual(first.order.reservationIds);
    }
    expect(calls.reserve).toBe(1);
  });

  it("reserves once even when the same key is submitted concurrently", async () => {
    const { seam, calls } = countingSeam();
    const service = createCheckoutService(deps({ inventory: seam }));

    const [first, second] = await Promise.all([
      service.submit("mem_1", request(), NOW),
      service.submit("mem_1", request(), NOW),
    ]);
    expect(first.ok && second.ok).toBe(true);
    expect(calls.reserve).toBe(1);
  });

  it("keeps a review-held order's hold: no release, no finalize", async () => {
    const { seam, calls } = countingSeam();
    const service = createCheckoutService(
      deps({ inventory: seam, isFraudFlagged: () => true }),
    );
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.order.state).toBe("manual_review");
    expect(calls).toEqual({ reserve: 1, release: 0, finalize: 0 });
  });

  it("keeps the hold when the capture fails: the order waits, nothing finalized or released", async () => {
    const { seam, calls } = countingSeam();
    const payment = new TestPaymentProvider();
    vi.spyOn(payment, "captureAuthorization").mockResolvedValue({
      ok: false,
      code: "UNAVAILABLE",
      message: "Provider outage.",
      retryable: true,
    });

    const service = createCheckoutService(deps({ inventory: seam, payment }));
    const outcome = await service.submit("mem_1", request(), NOW);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.order.captured).toBe(false);
    expect(calls).toEqual({ reserve: 1, release: 0, finalize: 0 });
  });

  it("records reserved and finalized audit evidence carrying the order id", async () => {
    const events: ReservationAuditEvent[] = [];
    const { seam } = countingSeam();
    const service = createCheckoutService(
      deps({ inventory: seam, reservationAudit: { record: (e) => void events.push(e) } }),
    );

    const outcome = await service.submit("mem_1", request(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(events.map((e) => e.type)).toEqual(["reserved", "finalized"]);
    expect(events.every((e) => e.orderId === outcome.order.orderId)).toBe(true);
    expect(events.every((e) => e.memberId === "mem_1")).toBe(true);
    expect(events[0]!.reservationIds).toEqual(["rsv_1"]);
  });

  it("records a released event when the authorization is refused", async () => {
    const events: ReservationAuditEvent[] = [];
    const { seam } = countingSeam();
    const payment = new TestPaymentProvider();
    vi.spyOn(payment, "createAuthorization").mockResolvedValue({
      ok: false,
      code: "REJECTED",
      message: "Card declined.",
      retryable: false,
    });
    const service = createCheckoutService(
      deps({ inventory: seam, payment, reservationAudit: { record: (e) => void events.push(e) } }),
    );

    await service.submit("mem_1", request(), NOW);
    expect(events.map((e) => e.type)).toEqual(["reserved", "released"]);
  });
});

// ---------------------------------------------------------------------------
// The real seam: FEFO over persisted lots
// ---------------------------------------------------------------------------

const CLEAN_DOCS = {
  coaOnFile: true,
  identityConfirmed: true,
  purityConfirmed: true,
  sterilityConfirmed: null,
  endotoxinConfirmed: null,
} as const;

function invLot(overrides: Partial<InventoryLot> = {}): InventoryLot {
  return {
    lotId: "LOT-EARLY",
    sku: "P001",
    owner: "mitch",
    disposition: "available",
    quantityAvailable: 3,
    manufacturedDate: "2026-01-01",
    expiryDate: "2026-09-01",
    retestDate: null,
    shelfLifeSource: "coa",
    documents: { ...CLEAN_DOCS },
    excursion: "none",
    recalled: false,
    ...overrides,
  };
}

async function seededStores() {
  const lots = createInMemoryInventoryLotStore();
  await lots.save(invLot({ lotId: "LOT-EARLY", expiryDate: "2026-09-01", quantityAvailable: 3 }));
  await lots.save(invLot({ lotId: "LOT-LATE", expiryDate: "2027-01-01", quantityAvailable: 10 }));
  const reservations = createInMemoryReservationStore();
  return { lots, reservations };
}

function realSeam(
  lots: InventoryLotRepository,
  reservations: ReturnType<typeof createInMemoryReservationStore>,
) {
  let seq = 0;
  return createInventoryReservationSeam({
    lots,
    reservations,
    newReservationId: () => `rsv_${++seq}`,
    now: () => NOW,
  });
}

async function quantity(lots: InventoryLotRepository, lotId: string): Promise<number> {
  return (await lots.get(lotId))!.quantityAvailable;
}

describe("createInventoryReservationSeam", () => {
  it("allocates FEFO, splitting across lots, and decrements available stock", async () => {
    const { lots, reservations } = await seededStores();
    const seam = realSeam(lots, reservations);

    const outcome = await seam.reserve("mem_1", [{ sku: "P001", quantity: 5 }], NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.reservationIds).toEqual(["rsv_1"]);
    // Earliest expiry drained first, remainder from the later lot.
    expect(await quantity(lots, "LOT-EARLY")).toBe(0);
    expect(await quantity(lots, "LOT-LATE")).toBe(8);

    const stored = await reservations.get("rsv_1");
    expect(stored).not.toBeNull();
    expect(stored!.status).toBe("held");
    expect(stored!.lines).toEqual([
      { lotId: "LOT-EARLY", quantity: 3 },
      { lotId: "LOT-LATE", quantity: 2 },
    ]);
    // The hold carries the configured expiry (default 30 minutes past asOf).
    expect(stored!.expiresAt).toBe(new Date(NOW.getTime() + 30 * 60 * 1000).toISOString());
  });

  it("release restores every reserved unit exactly once (no leak, no double restore)", async () => {
    const { lots, reservations } = await seededStores();
    const seam = realSeam(lots, reservations);

    const outcome = await seam.reserve("mem_1", [{ sku: "P001", quantity: 5 }], NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    await seam.release(outcome.reservationIds);
    expect(await quantity(lots, "LOT-EARLY")).toBe(3);
    expect(await quantity(lots, "LOT-LATE")).toBe(10);
    expect((await reservations.get("rsv_1"))!.status).toBe("released");

    // A repeated release must not manufacture stock.
    await seam.release(outcome.reservationIds);
    expect(await quantity(lots, "LOT-EARLY")).toBe(3);
    expect(await quantity(lots, "LOT-LATE")).toBe(10);
  });

  it("finalize makes the decrement permanent and a later release restores nothing", async () => {
    const { lots, reservations } = await seededStores();
    const seam = realSeam(lots, reservations);

    const outcome = await seam.reserve("mem_1", [{ sku: "P001", quantity: 5 }], NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    await seam.finalize(outcome.reservationIds);
    const finalized = await reservations.get("rsv_1");
    expect(finalized!.status).toBe("finalized");
    expect(finalized!.finalizedAt).toBe(NOW.toISOString());
    // The settlement decrement happened at reserve time; finalize repeats nothing.
    expect(await quantity(lots, "LOT-EARLY")).toBe(0);
    expect(await quantity(lots, "LOT-LATE")).toBe(8);

    // Settled units never come back, and a settlement replay is absorbed.
    await seam.release(outcome.reservationIds);
    expect(await quantity(lots, "LOT-EARLY")).toBe(0);
    await seam.finalize(outcome.reservationIds);
    expect(await quantity(lots, "LOT-LATE")).toBe(8);
  });

  it("refuses to finalize a released reservation", async () => {
    const { lots, reservations } = await seededStores();
    const seam = realSeam(lots, reservations);
    const outcome = await seam.reserve("mem_1", [{ sku: "P001", quantity: 2 }], NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    await seam.release(outcome.reservationIds);
    await expect(seam.finalize(outcome.reservationIds)).rejects.toThrow(/released/);
  });

  it("refuses with the precise lot codes and persists nothing", async () => {
    const lots = createInMemoryInventoryLotStore();
    await lots.save(
      invLot({ lotId: "LOT-EXP", expiryDate: "2026-01-01", quantityAvailable: 5 }),
    );
    await lots.save(
      invLot({ lotId: "LOT-REC", disposition: "recalled", recalled: true, quantityAvailable: 5 }),
    );
    await lots.save(
      invLot({
        lotId: "LOT-NOCOA",
        documents: { ...CLEAN_DOCS, coaOnFile: false },
        quantityAvailable: 5,
      }),
    );
    await lots.save(invLot({ lotId: "LOT-CLEAN", quantityAvailable: 1 }));
    const reservations = createInMemoryReservationStore();
    const seam = realSeam(lots, reservations);

    const outcome = await seam.reserve("mem_1", [{ sku: "P001", quantity: 5 }], NOW);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.refusals).toEqual(
      expect.arrayContaining(["insufficient_stock", "lot_expired", "lot_recalled", "coa_missing"]),
    );
    // Nothing was decremented and nothing was stored.
    expect(await quantity(lots, "LOT-CLEAN")).toBe(1);
    expect(await quantity(lots, "LOT-EXP")).toBe(5);
    expect(await reservations.listByMember("mem_1")).toEqual([]);
  });

  it("reports insufficient_stock alone over an empty pool", async () => {
    const lots = createInMemoryInventoryLotStore();
    const reservations = createInMemoryReservationStore();
    const seam = realSeam(lots, reservations);
    const outcome = await seam.reserve("mem_1", [{ sku: "P001", quantity: 1 }], NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusals).toEqual(["insufficient_stock"]);
  });

  it("two lines of one sku cannot claim the same units, and one refused line refuses the whole hold", async () => {
    const { lots, reservations } = await seededStores(); // 13 units total
    const seam = realSeam(lots, reservations);

    const outcome = await seam.reserve(
      "mem_1",
      [
        { sku: "P001", quantity: 8 },
        { sku: "P001", quantity: 8 }, // only 5 remain in the working pool
      ],
      NOW,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusals).toContain("insufficient_stock");
    // The satisfiable first line must not have leaked a partial hold.
    expect(await quantity(lots, "LOT-EARLY")).toBe(3);
    expect(await quantity(lots, "LOT-LATE")).toBe(10);
    expect(await reservations.listByMember("mem_1")).toEqual([]);
  });

  it("compensates a mid-persist depletion race and reports it as insufficient stock", async () => {
    const { lots, reservations } = await seededStores();
    // A wrapper that lets LOT-EARLY reserve but refuses LOT-LATE, emulating a
    // concurrent checkout draining the lot between plan and persist.
    const racing: InventoryLotRepository = {
      listBySku: (sku) => lots.listBySku(sku),
      get: (lotId) => lots.get(lotId),
      save: (lot) => lots.save(lot),
      adjustQuantityAvailable: async (lotId, delta) => {
        if (lotId === "LOT-LATE" && delta < 0) {
          throw new Error("quantity adjustment for LOT-LATE would go negative: -2");
        }
        return lots.adjustQuantityAvailable(lotId, delta);
      },
    };
    const seam = createInventoryReservationSeam({
      lots: racing,
      reservations,
      newReservationId: () => "rsv_1",
      now: () => NOW,
    });

    const outcome = await seam.reserve("mem_1", [{ sku: "P001", quantity: 5 }], NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusals).toEqual(["insufficient_stock"]);
    // The applied LOT-EARLY decrement was compensated: no leak.
    expect(await quantity(lots, "LOT-EARLY")).toBe(3);
    expect(await reservations.get("rsv_1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// End to end: checkout through the real seam, and the refund boundary
// ---------------------------------------------------------------------------

describe("checkout through the real seam", () => {
  it("a captured checkout permanently consumes FEFO stock", async () => {
    const { lots, reservations } = await seededStores();
    const seam = realSeam(lots, reservations);
    const service = createCheckoutService(deps({ inventory: seam }));

    const outcome = await service.submit("mem_1", request(), NOW); // cart holds 2x P001
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.order.state).toBe("payment_captured");
    expect(await quantity(lots, "LOT-EARLY")).toBe(1); // earliest expiry first
    expect(await quantity(lots, "LOT-LATE")).toBe(10);
    expect((await reservations.get(outcome.order.reservationIds[0]!))!.status).toBe("finalized");
  });

  it("a failed checkout restores every unit (no leak through the checkout path)", async () => {
    const { lots, reservations } = await seededStores();
    const seam = realSeam(lots, reservations);
    const payment = new TestPaymentProvider();
    vi.spyOn(payment, "createAuthorization").mockResolvedValue({
      ok: false,
      code: "REJECTED",
      message: "Card declined.",
      retryable: false,
    });
    const service = createCheckoutService(deps({ inventory: seam, payment }));

    const outcome = await service.submit("mem_1", request(), NOW);
    expect(outcome.ok).toBe(false);
    expect(await quantity(lots, "LOT-EARLY")).toBe(3);
    expect(await quantity(lots, "LOT-LATE")).toBe(10);
    const held = await reservations.listByMember("mem_1");
    expect(held.map((r) => r.status)).toEqual(["released"]);
  });

  it("a refund never touches the seam: shipped inventory is not restored", async () => {
    const { lots, reservations } = await seededStores();
    const seam = realSeam(lots, reservations);
    const payment = new TestPaymentProvider();
    const service = createCheckoutService(deps({ inventory: seam, payment }));

    const outcome = await service.submit("mem_1", request(), NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(await quantity(lots, "LOT-EARLY")).toBe(1);

    // The refund flow runs over the captured order, with the SAME payment provider.
    const refunds = createRefundService({
      claims: createInMemoryClaimRepository(),
      orders: createInMemoryClaimOrderRepository([
        {
          orderId: outcome.order.orderId,
          memberId: "mem_1",
          state: "payment_captured",
          capturedAmountCents: outcome.order.totalCents,
          paymentReference: outcome.order.paymentReference,
          refundedCents: 0,
          lines: [{ sku: "P001", lotId: "LOT-EARLY" }],
        },
      ]),
      payment,
      commerceEnabled: true,
    });

    const claim = await refunds.submitClaim(
      "mem_1",
      {
        orderId: outcome.order.orderId,
        sku: "P001",
        reason: "damaged",
        detail: "Arrived damaged.",
        evidenceRefs: ["ev_1"],
      },
      NOW,
    );
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    expect((await refunds.reviewClaim(claim.claim.claimId, "admin_1", "approved", NOW)).ok).toBe(true);
    const resolved = await refunds.resolveWithRefund(
      claim.claim.claimId,
      "admin_1",
      outcome.order.totalCents,
      "refund_key_1",
      NOW,
    );
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.restockedUnits).toBe(0);

    // The money moved back, the units did not: the seam was never consulted.
    expect(await quantity(lots, "LOT-EARLY")).toBe(1);
    expect(await quantity(lots, "LOT-LATE")).toBe(10);
    expect((await reservations.get(outcome.order.reservationIds[0]!))!.status).toBe("finalized");
  });
});

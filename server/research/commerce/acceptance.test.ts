// Wave 24: the running-server acceptance suite.
//
// Every HTTP test drives a real express app assembled by the CANONICAL
// registration path (registerCommerceApi over buildCommerceDependencies, plus
// the same /api JSON 404 tail as server/index.ts) with supertest. State lives
// in the wiring table's in-memory stores; money moves only through the
// TestPaymentProvider; process.env is never mutated.
//
// Two acceptance items cannot be proven over HTTP because their surfaces are
// not registered on the app (reported as wiring gaps, not worked around by
// modifying owned-elsewhere files):
//   - webhooks: createWebhookHandler exists but no route mounts it, so replay
//     rejection is proven at the handler over the same canonical pieces;
//   - refund resolution: CommerceDependencies exposes claim submit/list only,
//     so the capture cap is proven through createRefundService composed over
//     the SAME wiring stores and payment provider the HTTP app uses.

import { describe, expect, it } from "vitest";
import request from "supertest";
import {
  ADMIN_HEADER,
  ADMIN_HEADER_VALUE,
  AS_OF,
  ELIGIBLE_SKU,
  ELIGIBLE_SLUG,
  INELIGIBLE_SKU,
  MEMBER_A,
  MEMBER_B,
  MEMBER_HEADER,
  buildAcceptanceContext,
  checkoutRequest,
  releasedLot,
  type AcceptanceContext,
} from "./acceptance-harness";
import { CHECKOUT_REQUIRED_AGREEMENT_KEYS } from "./production-deps";
import { createRefundService, type ClaimOrderView } from "./refunds";
import { createWebhookHandler, createInMemoryWebhookEventStore, type WebhookOrder } from "./webhooks";
import { createInMemoryWebhookOrderStore } from "./persistence/webhooks-store";
import { TestMitchProvider } from "../providers/fulfillment";
import { allocateFefo } from "../inventory/lots";
import type { SubscriptionRecord } from "./subscriptions";
import type { StoreCreditLedgerRecord } from "./persistence/store-credit-store";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function asMember(ctx: AcceptanceContext, memberId: string) {
  return {
    get: (path: string) => request(ctx.app).get(path).set(MEMBER_HEADER, memberId),
    post: (path: string) => request(ctx.app).post(path).set(MEMBER_HEADER, memberId),
    patch: (path: string) => request(ctx.app).patch(path).set(MEMBER_HEADER, memberId),
    del: (path: string) => request(ctx.app).delete(path).set(MEMBER_HEADER, memberId),
  };
}

async function addEligibleLine(
  ctx: AcceptanceContext,
  memberId: string,
  quantity: number,
): Promise<void> {
  const res = await asMember(ctx, memberId)
    .post("/api/research/cart/lines")
    .send({ sku: ELIGIBLE_SKU, quantity, purchaseMode: "one_time" });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
}

/** Places a captured order for the member over HTTP and returns its order id. */
async function placeOrder(
  ctx: AcceptanceContext,
  memberId: string,
  idempotencyKey: string,
): Promise<string> {
  await addEligibleLine(ctx, memberId, 2);
  const res = await asMember(ctx, memberId)
    .post("/api/research/checkout")
    .send(checkoutRequest({ idempotencyKey }));
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.order.state).toBe("payment_captured");
  return res.body.order.orderId as string;
}

function activeSubscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    subscriptionId: "sub_acceptance_1",
    memberId: MEMBER_A,
    sku: ELIGIBLE_SKU,
    quantity: 1,
    frequencyDays: 30,
    state: "active",
    nextRenewalAt: "2026-08-21T00:00:00.000Z",
    nextShipmentAt: "2026-08-21T00:00:00.000Z",
    paymentProviderReference: null,
    priceVersion: "v1",
    shippingAddressRef: null,
    createdAt: AS_OF.toISOString(),
    updatedAt: AS_OF.toISOString(),
    cancelledAt: null,
    ...overrides,
  };
}

function approvedCredit(memberId: string, amountCents: number): StoreCreditLedgerRecord {
  return {
    id: "credit_acceptance_1",
    memberId,
    amountCents,
    state: "approved",
    reason: "service_recovery",
    createdAt: "2026-07-01T00:00:00Z",
    availableAt: null,
    reversesId: null,
    actorType: "admin",
    actorId: "admin_acceptance",
    expiresAt: null,
  };
}

const SUBTOTAL_2X = 10000; // 2 x 5000 cents
const SHIPPING = 1295; // TestShippingProvider standard rate
const ORDER_TOTAL = SUBTOTAL_2X + SHIPPING;

// ---------------------------------------------------------------------------
// Guards and identity
// ---------------------------------------------------------------------------

describe("guards over the running app", () => {
  it("refuses an unauthenticated member request before any handler runs", async () => {
    const ctx = await buildAcceptanceContext();
    const res = await request(ctx.app).get("/api/research/cart");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ ok: false, code: "membership_inactive" });
  });

  it("refuses a non-admin on the admin queues route", async () => {
    const ctx = await buildAcceptanceContext();
    const res = await request(ctx.app)
      .get("/api/admin/research/commerce/queues")
      .set(MEMBER_HEADER, MEMBER_A);
    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });

  it("reports product commerce enabled to an authenticated member", async () => {
    const ctx = await buildAcceptanceContext();
    const res = await asMember(ctx, MEMBER_A).get("/api/research/capabilities");
    expect(res.status).toBe(200);
    expect(res.body.capabilities.product_commerce.enabled).toBe(true);
    expect(res.body.capabilities.quantum_commerce.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

describe("catalog over HTTP", () => {
  it("lists the fixture catalog with honest purchasability and pricing", async () => {
    const ctx = await buildAcceptanceContext();
    const res = await asMember(ctx, MEMBER_A).get("/api/research/products");
    expect(res.status).toBe(200);
    const bySku = new Map(
      (res.body.products as Array<{ sku: string; purchasable: boolean; priceCents: number | null }>).map(
        (p) => [p.sku, p],
      ),
    );
    expect(bySku.get(ELIGIBLE_SKU)?.purchasable).toBe(true);
    expect(bySku.get(ELIGIBLE_SKU)?.priceCents).toBe(5000);
    expect(bySku.get(INELIGIBLE_SKU)?.purchasable).toBe(false);
  });

  it("serves the product detail by slug and 404s an unknown slug", async () => {
    const ctx = await buildAcceptanceContext();
    const found = await asMember(ctx, MEMBER_A).get(`/api/research/products/${ELIGIBLE_SLUG}`);
    expect(found.status).toBe(200);
    expect(found.body.product.sku).toBe(ELIGIBLE_SKU);
    expect(found.body.product.confirmedFacts.composition).toBe("compound A");

    const missing = await asMember(ctx, MEMBER_A).get("/api/research/products/no-such-slug");
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("product_not_found");
  });
});

// ---------------------------------------------------------------------------
// Cart: persistence and validation
// ---------------------------------------------------------------------------

describe("persistent cart over HTTP", () => {
  it("adds, reloads across requests, updates, and removes a line", async () => {
    const ctx = await buildAcceptanceContext();
    const client = asMember(ctx, MEMBER_A);

    const added = await client
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 2, purchaseMode: "one_time" });
    expect(added.status).toBe(200);
    expect(added.body.cart.subtotalCents).toBe(SUBTOTAL_2X);
    expect(added.body.cart.checkoutReady).toBe(true);
    expect(added.body.cart.requiredAgreements).toEqual([...CHECKOUT_REQUIRED_AGREEMENT_KEYS]);

    // A fresh request (a fresh per-request cart service) sees the stored cart.
    const reloaded = await client.get("/api/research/cart");
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.cart.lines.map((l: { sku: string }) => l.sku)).toEqual([ELIGIBLE_SKU]);
    expect(reloaded.body.cart.lines[0].quantity).toBe(2);

    const updated = await client
      .patch(`/api/research/cart/lines/${ELIGIBLE_SKU}`)
      .send({ quantity: 3 });
    expect(updated.status).toBe(200);
    expect(updated.body.cart.subtotalCents).toBe(15000);

    const removed = await client.del(`/api/research/cart/lines/${ELIGIBLE_SKU}`);
    expect(removed.status).toBe(200);
    expect(removed.body.cart.lines).toEqual([]);
  });

  it("rejects an invalid quantity with the precise code", async () => {
    const ctx = await buildAcceptanceContext();
    const res = await asMember(ctx, MEMBER_A)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 0, purchaseMode: "one_time" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "quantity_invalid" });
  });

  it("rejects an unknown SKU with the precise code", async () => {
    const ctx = await buildAcceptanceContext();
    const res = await asMember(ctx, MEMBER_A)
      .post("/api/research/cart/lines")
      .send({ sku: "P999", quantity: 1, purchaseMode: "one_time" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: "product_not_found" });
  });

  it("admits an ineligible SKU as a blocked line carrying the precise code", async () => {
    const ctx = await buildAcceptanceContext();
    const res = await asMember(ctx, MEMBER_A)
      .post("/api/research/cart/lines")
      .send({ sku: INELIGIBLE_SKU, quantity: 1, purchaseMode: "one_time" });
    expect(res.status).toBe(200);
    expect(res.body.cart.lines[0].blockedReason).toBe("product_not_purchasable");
    expect(res.body.cart.checkoutReady).toBe(false);
    expect(res.body.cart.blockingReasons).toContain("product_not_purchasable");
  });
});

// ---------------------------------------------------------------------------
// Member isolation
// ---------------------------------------------------------------------------

describe("member isolation over HTTP", () => {
  it("keeps carts separate and ignores body-supplied member ids", async () => {
    const ctx = await buildAcceptanceContext();
    await addEligibleLine(ctx, MEMBER_A, 2);

    // B sees an empty cart, not A's.
    const bCart = await asMember(ctx, MEMBER_B).get("/api/research/cart");
    expect(bCart.body.cart.lines).toEqual([]);

    // B cannot mutate A's line: it is simply not in B's cart.
    const bPatch = await asMember(ctx, MEMBER_B)
      .patch(`/api/research/cart/lines/${ELIGIBLE_SKU}`)
      .send({ quantity: 9 });
    expect(bPatch.status).toBe(400);
    expect(bPatch.body.code).toBe("product_not_found");

    // A body-supplied member id is ignored: the write lands on the
    // authenticated subject (B), never on the named victim (A).
    const forged = await asMember(ctx, MEMBER_B)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 5, purchaseMode: "one_time", memberId: MEMBER_A });
    expect(forged.status).toBe(200);
    expect(forged.body.cart.lines[0].quantity).toBe(5);

    const aCart = await asMember(ctx, MEMBER_A).get("/api/research/cart");
    expect(aCart.body.cart.lines[0].quantity).toBe(2); // untouched
  });

  it("keeps orders separate: B sees neither A's list entry nor A's order", async () => {
    const ctx = await buildAcceptanceContext();
    const orderId = await placeOrder(ctx, MEMBER_A, "iso-key-1");

    const bList = await asMember(ctx, MEMBER_B).get("/api/research/orders");
    expect(bList.body.orders).toEqual([]);

    // Indistinguishable from a missing order, so probes learn nothing.
    const bGet = await asMember(ctx, MEMBER_B).get(`/api/research/orders/${orderId}`);
    expect(bGet.status).toBe(404);
    expect(bGet.body.code).toBe("order_not_found");
  });
});

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

describe("checkout over HTTP", () => {
  it("runs the happy path to a captured order visible in member history, with no operator data on the wire", async () => {
    const ctx = await buildAcceptanceContext();
    await addEligibleLine(ctx, MEMBER_A, 2);

    const placed = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "happy-key-1" }));
    expect(placed.status).toBe(200);
    expect(placed.body.ok).toBe(true);
    expect(placed.body.order.state).toBe("payment_captured");
    expect(placed.body.order.totalCents).toBe(ORDER_TOTAL);
    expect(placed.body.order.shipments).toEqual([
      { owner: "xenios", status: "pending", trackingNumber: null, carrier: null },
    ]);

    // The member-safe projection: nothing operator-grade crosses the wire.
    const wire = JSON.stringify(placed.body);
    expect("paymentReference" in placed.body.order).toBe(false);
    expect("reviewTriggers" in placed.body.order).toBe(false);
    expect("idempotencyKey" in placed.body.order).toBe(false);
    expect(wire).not.toContain("test_auth_");

    // The order is in the member's history, from the same durable repository.
    const orderId = placed.body.order.orderId as string;
    const list = await asMember(ctx, MEMBER_A).get("/api/research/orders");
    expect(list.body.orders.map((o: { orderId: string }) => o.orderId)).toEqual([orderId]);
    expect(JSON.stringify(list.body)).not.toContain("test_auth_");

    const detail = await asMember(ctx, MEMBER_A).get(`/api/research/orders/${orderId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.order.lines).toEqual([
      { sku: ELIGIBLE_SKU, displayName: "Acceptance Eligible Product", quantity: 2, lineTotalCents: SUBTOTAL_2X },
    ]);
    expect(JSON.stringify(detail.body)).not.toContain("test_auth_");

    // The durable record DOES carry the real provider reference and capture.
    const stored = await ctx.orderRepository.get(orderId);
    expect(stored?.providerReference).toMatch(/^test_auth_/);
    expect(stored?.capturedAmountCents).toBe(ORDER_TOTAL);
  });

  it("absorbs a duplicate checkout click: same order, exactly one authorization", async () => {
    const ctx = await buildAcceptanceContext();
    await addEligibleLine(ctx, MEMBER_A, 2);

    const first = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "dup-key-1" }));
    const second = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "dup-key-1" }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.order.orderId).toBe(first.body.order.orderId);
    expect(ctx.payment.authorizationCalls).toBe(1);

    // One order in history, not two.
    const list = await asMember(ctx, MEMBER_A).get("/api/research/orders");
    expect(list.body.orders.length).toBe(1);
  });

  it("refuses a checkout missing the required agreements and writes nothing", async () => {
    const ctx = await buildAcceptanceContext();
    await addEligibleLine(ctx, MEMBER_A, 2);

    const denied = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ acceptedAgreementKeys: [], idempotencyKey: "agr-key-1" }));
    expect(denied.status).toBe(400);
    expect(denied.body).toMatchObject({ ok: false, code: "agreement_required" });

    expect(ctx.payment.authorizationCalls).toBe(0);
    expect(await ctx.orderRepository.listAll()).toEqual([]);
  });

  it("refuses a cart holding an ineligible SKU and never reaches the provider", async () => {
    const ctx = await buildAcceptanceContext();
    await asMember(ctx, MEMBER_A)
      .post("/api/research/cart/lines")
      .send({ sku: INELIGIBLE_SKU, quantity: 1, purchaseMode: "one_time" });

    const denied = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "inelig-key-1" }));
    expect(denied.status).toBe(400);
    expect(denied.body.ok).toBe(false);
    // The wire carries the leading revalidation code; the precise per-line
    // code (product_not_purchasable) is asserted on the cart read above.
    expect(denied.body.code).toBe("cart_revalidation_failed");

    expect(ctx.payment.authorizationCalls).toBe(0);
    expect(await ctx.orderRepository.listAll()).toEqual([]);
  });

  it("refuses a non-serviceable state with the precise code", async () => {
    const ctx = await buildAcceptanceContext();
    await addEligibleLine(ctx, MEMBER_A, 1);

    const denied = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(
        checkoutRequest({
          shippingAddress: { line1: "9 Empire St", city: "New York", state: "NY", postalCode: "10001", country: "US" },
          idempotencyKey: "state-key-1",
        }),
      );
    expect(denied.status).toBe(400);
    expect(denied.body.code).toBe("state_not_serviceable");
    expect(await ctx.orderRepository.listAll()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FEFO and lot safety
// ---------------------------------------------------------------------------

describe("FEFO allocation over the wiring table's inventory store", () => {
  it("picks the earliest-expiry released lot first and refuses expired and recalled candidates", async () => {
    const ctx = await buildAcceptanceContext({
      lots: [
        releasedLot({ lotId: "TEST_LOT_ACC_LATE", expiryDate: "2027-06-30", quantityAvailable: 25 }),
        releasedLot({ lotId: "TEST_LOT_ACC_EARLY", expiryDate: "2026-12-31", quantityAvailable: 1 }),
        releasedLot({ lotId: "TEST_LOT_ACC_EXPIRED", expiryDate: "2026-01-01" }),
        releasedLot({ lotId: "TEST_LOT_ACC_RECALLED", recalled: true }),
      ],
    });

    // The same lots the HTTP cart path evaluates, through the same store seam.
    const lots = await ctx.lotStore.listBySku(ELIGIBLE_SKU);
    const allocation = allocateFefo(lots, ELIGIBLE_SKU, 2, AS_OF);
    expect(allocation.ok).toBe(true);
    if (allocation.ok) {
      // Earliest expiry drained first, then the next-expiring released lot.
      expect(allocation.lines).toEqual([
        { lotId: "TEST_LOT_ACC_EARLY", quantity: 1 },
        { lotId: "TEST_LOT_ACC_LATE", quantity: 1 },
      ]);
    }

    // Over-ask: the expired and recalled lots are named as refused, never counted.
    const overAsk = allocateFefo(lots, ELIGIBLE_SKU, 100, AS_OF);
    expect(overAsk.ok).toBe(false);
    if (!overAsk.ok) {
      expect(overAsk.allocatable).toBe(26);
      const refused = new Map(overAsk.rejected.map((r) => [r.lotId, r.blockReasons]));
      expect(refused.get("TEST_LOT_ACC_EXPIRED")).toContain("expired");
      expect(refused.get("TEST_LOT_ACC_RECALLED")).toContain("recalled");
    }

    // And the HTTP cart over these mixed lots is still checkout-ready for 2 units.
    await addEligibleLine(ctx, MEMBER_A, 2);
    const cart = await asMember(ctx, MEMBER_A).get("/api/research/cart");
    expect(cart.body.cart.checkoutReady).toBe(true);
  });

  it("refuses to sell when the only lot is expired", async () => {
    const ctx = await buildAcceptanceContext({
      lots: [releasedLot({ lotId: "TEST_LOT_ACC_EXPIRED_ONLY", expiryDate: "2026-01-01" })],
    });

    const added = await asMember(ctx, MEMBER_A)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 1, purchaseMode: "one_time" });
    expect(added.status).toBe(200);
    expect(added.body.cart.lines[0].blockedReason).toBe("insufficient_stock");
    expect(added.body.cart.checkoutReady).toBe(false);

    const denied = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "expired-key-1" }));
    expect(denied.status).toBe(400);
    expect(denied.body.code).toBe("cart_revalidation_failed");
    expect(ctx.payment.authorizationCalls).toBe(0);
    expect(await ctx.orderRepository.listAll()).toEqual([]);
  });

  it("refuses to sell when the only lot is recalled", async () => {
    const ctx = await buildAcceptanceContext({
      lots: [releasedLot({ lotId: "TEST_LOT_ACC_RECALLED_ONLY", recalled: true })],
    });

    const added = await asMember(ctx, MEMBER_A)
      .post("/api/research/cart/lines")
      .send({ sku: ELIGIBLE_SKU, quantity: 1, purchaseMode: "one_time" });
    expect(added.body.cart.lines[0].blockedReason).toBe("insufficient_stock");

    const denied = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "recalled-key-1" }));
    expect(denied.status).toBe(400);
    expect(await ctx.orderRepository.listAll()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Refund claims and the capture cap
// ---------------------------------------------------------------------------

describe("claims over HTTP and the refund capture cap", () => {
  it("submits a claim over HTTP and caps the refund at the captured amount", async () => {
    const ctx = await buildAcceptanceContext();
    const orderId = await placeOrder(ctx, MEMBER_A, "refund-order-key");
    const stored = await ctx.orderRepository.get(orderId);
    const captured = stored?.capturedAmountCents ?? 0;
    expect(captured).toBe(ORDER_TOTAL);

    // The claim-order view the refund lane reads, fed through the SAME wiring
    // store the HTTP app was composed over.
    const view: ClaimOrderView = {
      orderId,
      memberId: MEMBER_A,
      state: "payment_captured",
      capturedAmountCents: captured,
      paymentReference: stored?.providerReference ?? null,
      refundedCents: 0,
      lines: [{ sku: ELIGIBLE_SKU, lotId: null }],
    };
    await ctx.claimOrderRepository.save(view);

    // Another member cannot open a claim against this order.
    const foreign = await asMember(ctx, MEMBER_B)
      .post("/api/research/claims")
      .send({ orderId, sku: ELIGIBLE_SKU, reason: "damaged", detail: "not mine", evidenceRefs: [] });
    expect(foreign.status).toBe(400);
    expect(foreign.body.code).toBe("order_not_found");

    const submitted = await asMember(ctx, MEMBER_A)
      .post("/api/research/claims")
      .send({
        orderId,
        sku: ELIGIBLE_SKU,
        reason: "damaged",
        detail: "vial arrived cracked",
        evidenceRefs: ["evidence-acceptance-1"],
      });
    expect(submitted.status).toBe(200);
    const claimId = submitted.body.claim.claimId as string;
    expect(claimId).toBeTruthy();

    // Resolution is not on the HTTP surface (wiring gap, reported); the cap is
    // proven through the canonical service over the same stores and provider.
    const refunds = createRefundService({
      claims: ctx.claimRepository,
      orders: ctx.claimOrderRepository,
      payment: ctx.payment,
      commerceEnabled: true,
    });
    const approved = await refunds.reviewClaim(claimId, "admin_acceptance", "approved", AS_OF);
    expect(approved.ok).toBe(true);

    // One cent past the capture is refused before any provider call.
    const over = await refunds.resolveWithRefund(claimId, "admin_acceptance", captured + 1, "refund-over", AS_OF);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.codes).toContain("payment_failed");
    expect(ctx.payment.refundCalls).toBe(0);

    // Exactly the capture succeeds, once.
    const capped = await refunds.resolveWithRefund(claimId, "admin_acceptance", captured, "refund-capped", AS_OF);
    expect(capped.ok).toBe(true);
    if (capped.ok) expect(capped.claim.resolution).toBe("refund");
    expect(ctx.payment.refundCalls).toBe(1);

    // The member sees the resolved claim over HTTP, from the shared repository.
    const list = await asMember(ctx, MEMBER_A).get("/api/research/claims");
    expect(list.status).toBe(200);
    expect(list.body.claims).toHaveLength(1);
    expect(list.body.claims[0]).toMatchObject({ claimId, state: "resolved", resolution: "refund" });
  });
});

// ---------------------------------------------------------------------------
// Webhook replay (handler-level: no route mounts the handler; reported as a gap)
// ---------------------------------------------------------------------------

describe("webhook replay over the canonical handler and stores", () => {
  it("applies a payment event once and rejects the identical second delivery", async () => {
    const ctx = await buildAcceptanceContext();
    const orderStore = createInMemoryWebhookOrderStore([
      { orderId: "ord_wh_1", state: "approved", paymentReference: null, captured: false } satisfies WebhookOrder,
    ]);
    const handler = createWebhookHandler({
      store: createInMemoryWebhookEventStore(),
      payment: ctx.payment,
      fulfillment: new TestMitchProvider(),
      orders: orderStore,
      commerceEnabled: true,
    });

    const body = JSON.stringify({
      id: "evt_acceptance_1",
      type: "payment.captured",
      orderId: "ord_wh_1",
      providerReference: "test_auth_webhook_1",
    });

    const first = await handler.handlePayment(body, "test-signature", AS_OF);
    expect(first).toEqual({ ok: true, applied: true, eventId: "evt_acceptance_1" });
    const afterFirst = await orderStore.get("ord_wh_1");
    expect(afterFirst?.state).toBe("payment_captured");
    expect(afterFirst?.captured).toBe(true);

    // Second delivery of the same event: rejected (the provider's replay
    // protection fires first), and the order does not move again.
    const second = await handler.handlePayment(body, "test-signature", AS_OF);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("invalid_signature");
    const afterSecond = await orderStore.get("ord_wh_1");
    expect(afterSecond?.state).toBe("payment_captured");
    expect(afterSecond?.lastWebhookEventId).toBe("evt_acceptance_1");
  });

  it("absorbs a replayed fulfillment event through the event store (applied exactly once)", async () => {
    const ctx = await buildAcceptanceContext();
    const orderStore = createInMemoryWebhookOrderStore([
      { orderId: "ord_wh_2", state: "fulfilled", paymentReference: "test_auth_x", captured: true } satisfies WebhookOrder,
    ]);
    const handler = createWebhookHandler({
      store: createInMemoryWebhookEventStore(),
      payment: ctx.payment,
      fulfillment: new TestMitchProvider(),
      orders: orderStore,
      commerceEnabled: true,
    });

    const body = JSON.stringify({
      eventId: "evt_ff_acceptance_1",
      fulfillmentOrderId: "ord_wh_2",
      status: "delivered",
    });

    const first = await handler.handleFulfillment(body, "test-signature", AS_OF);
    expect(first).toEqual({ ok: true, applied: true, eventId: "evt_ff_acceptance_1" });
    expect((await orderStore.get("ord_wh_2"))?.state).toBe("delivered");

    // TestMitchProvider does not deduplicate, so this proves the EVENT STORE's
    // replay gate: acknowledged, applied false, state unchanged.
    const second = await handler.handleFulfillment(body, "test-signature", AS_OF);
    expect(second).toEqual({ ok: true, applied: false, eventId: "evt_ff_acceptance_1" });
    expect((await orderStore.get("ord_wh_2"))?.state).toBe("delivered");
  });
});

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

describe("subscriptions over HTTP", () => {
  it("lists, pauses, resumes, and cancels through the routes; cancelled is terminal", async () => {
    const ctx = await buildAcceptanceContext();
    // Creation is not on the HTTP surface (wiring gap, reported); the record
    // is seeded through the same wiring repository the app reads.
    await ctx.subscriptionStore.save(activeSubscription());
    const client = asMember(ctx, MEMBER_A);

    const listed = await client.get("/api/research/subscriptions");
    expect(listed.status).toBe(200);
    expect(listed.body.subscriptions).toHaveLength(1);
    expect(listed.body.subscriptions[0]).toMatchObject({
      subscriptionId: "sub_acceptance_1",
      sku: ELIGIBLE_SKU,
      state: "active",
    });
    // Operator data never crosses the wire.
    expect(JSON.stringify(listed.body)).not.toContain("priceVersion");

    const paused = await client
      .post("/api/research/subscriptions/sub_acceptance_1")
      .send({ action: "pause" });
    expect(paused.status).toBe(200);
    expect(paused.body.subscription.state).toBe("paused");

    const resumed = await client
      .post("/api/research/subscriptions/sub_acceptance_1")
      .send({ action: "resume" });
    expect(resumed.status).toBe(200);
    expect(resumed.body.subscription.state).toBe("active");
    expect(resumed.body.subscription.nextChargeAt).not.toBeNull();

    const cancelled = await client
      .post("/api/research/subscriptions/sub_acceptance_1")
      .send({ action: "cancel" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.subscription.state).toBe("cancelled");
    expect(cancelled.body.subscription.nextChargeAt).toBeNull();

    const afterTerminal = await client
      .post("/api/research/subscriptions/sub_acceptance_1")
      .send({ action: "pause" });
    expect(afterTerminal.status).toBe(400);
    expect(afterTerminal.body.code).toBe("subscription_action_invalid");
  });

  it("hides another member's subscription behind subscription_not_found", async () => {
    const ctx = await buildAcceptanceContext();
    await ctx.subscriptionStore.save(activeSubscription());

    const bList = await asMember(ctx, MEMBER_B).get("/api/research/subscriptions");
    expect(bList.body.subscriptions).toEqual([]);

    const bAction = await asMember(ctx, MEMBER_B)
      .post("/api/research/subscriptions/sub_acceptance_1")
      .send({ action: "pause" });
    expect(bAction.status).toBe(400);
    expect(bAction.body.code).toBe("subscription_not_found");
  });
});

// ---------------------------------------------------------------------------
// Store credit
// ---------------------------------------------------------------------------

describe("store credit over HTTP", () => {
  it("serves the ledger-backed balance with spendable computed", async () => {
    const ctx = await buildAcceptanceContext();
    await ctx.creditLedger.append(approvedCredit(MEMBER_A, 1500));

    const res = await asMember(ctx, MEMBER_A).get("/api/research/store-credit");
    expect(res.status).toBe(200);
    expect(res.body.storeCredit).toMatchObject({
      owner: MEMBER_A,
      balanceCents: 1500,
      spendableCents: 1500,
      pendingCents: 0,
    });
    expect(res.body.storeCredit.entries).toHaveLength(1);

    // Another member's read never sees this credit.
    const other = await asMember(ctx, MEMBER_B).get("/api/research/store-credit");
    expect(other.body.storeCredit.spendableCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Admin queues
// ---------------------------------------------------------------------------

describe("admin queues over HTTP", () => {
  it("serves the provisioned commerce queues view to an admin", async () => {
    const ctx = await buildAcceptanceContext();
    const res = await request(ctx.app)
      .get("/api/admin/research/commerce/queues")
      .set(ADMIN_HEADER, ADMIN_HEADER_VALUE);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.queues.provisioned).toBe(true);
    expect(Array.isArray(res.body.queues.queues)).toBe(true);
    expect(res.body.queues.queues.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The /api tail
// ---------------------------------------------------------------------------

describe("the /api JSON 404 tail", () => {
  it("answers an unknown /api path with JSON 404, authenticated or not", async () => {
    const ctx = await buildAcceptanceContext();

    const authed = await asMember(ctx, MEMBER_A).get("/api/research/no-such-surface");
    expect(authed.status).toBe(404);
    expect(authed.headers["content-type"]).toContain("application/json");
    expect(authed.body).toEqual({ message: "Not Found" });

    const anon = await request(ctx.app).post("/api/definitely/not/registered");
    expect(anon.status).toBe(404);
    expect(anon.body).toEqual({ message: "Not Found" });
  });
});

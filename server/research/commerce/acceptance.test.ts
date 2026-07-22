// The running-server acceptance suite: the FULL commerce flow over HTTP.
//
// Every HTTP test drives a real express app assembled by the CANONICAL
// registration path (registerCommerceApi over buildCommerceDependencies, plus
// the same rawBody-capturing json parser and /api JSON 404 tail as
// server/index.ts) with supertest. State lives in the wiring table's in-memory
// stores; money moves only through the TestPaymentProvider; process.env is
// never mutated (flags are true only inside the injected env object).
//
// Covered end to end over HTTP: catalog, persistent cart, shipping quote,
// checkout (immediate capture AND the large-order authorize-review-capture
// path) WITH the production-wired FEFO inventory reservation (persisted hold,
// lot decrement, settlement finalize), member order history, the ADMIN order
// lifecycle routes (approve / capture / cancel), the payment AND fulfillment
// webhook routes (raw body + signature, valid/invalid/replay, tracking landing
// on the member-visible shipment), claims intake, the ADMIN claim review and
// refund routes (provider proof, capped at capture), subscription create +
// pause/cancel, partner apply, the partner dashboard (commission balance with
// the payout hold visible), member and partner isolation on every route,
// cross-instance checkout idempotency over the durable order projection, the
// synthetic-composition guard, and the unknown-/api JSON 404.
//
// Wiring gaps CLOSED since the first acceptance wave (each was previously
// proven through the canonical service beside the app): checkout now composes
// the inventory reservation seam (CommerceWiring.resolveReservationStore),
// admin order approve/capture/cancel and the fulfillment status webhook are
// real routes, and a settled checkout idempotency key is answered from the
// durable order projection (findByIdempotencyKey) on a SECOND app instance,
// so a restart replay can no longer re-run settlement projection over an
// advanced record.
//
// Segments that still cannot run over this app's HTTP surface, each proven
// instead through the CANONICAL service composed over the SAME wiring stores
// the HTTP app uses (reported, never worked around by editing owned-elsewhere
// files):
//   - fulfillment SUBMISSION (the outbound Mitch transmission) and the
//     processing/fulfilled advances: system acts with no HTTP surface (only
//     approve / capture / cancel are admin decisions). The transmission runs
//     through the SAME TestMitchProvider instance the app's webhook handler
//     composition uses, so the delivered webhook that follows is the same
//     provider speaking on the same rail.
//   - partner lifecycle activation: partnerAdmin.review refuses with
//     capability_disabled (no durable gate-checked lifecycle path yet), proven
//     over HTTP; commission accrual is therefore proven twice: refused
//     honestly for the application-state partner, and accrued through the
//     canonical commission service (with the active-partner context the
//     lifecycle wave will supply) over the SAME wiring commission ledger the
//     HTTP dashboard reads. See production-deps partnerAdmin for the precise
//     reasons the denial stands (create+read-only durable linkage store; no
//     durable gate-checked partner repository to review through).
//   - membership application/approval and the $50/$25 flows: they live in
//     registerMembershipApi / registerMemberPlatformApi (the member-platform
//     lane, mounted by server/index.ts), which take no injectable wiring, so
//     they cannot mount canonically over these stores. That segment runs in
//     that lane's own suites (server/research/membership.test.ts,
//     server/research/member-platform.test.ts) and is deliberately excluded
//     here rather than half-mounted.
//   - residual, recorded: an admin capture writes its own key into the
//     record's last_idempotency_key, so a checkout-key replay AFTER an admin
//     capture relies on the durable store's separate checkout_idempotency_key
//     column (the in-memory twin models only the one key). On that narrow
//     path the replay could re-run the service; order ids are now globally
//     unique (checkout.ts mints uuids), so the worst case is a duplicate
//     UNCAPTURED row, never an overwrite of the advanced record and never a
//     second charge (the provider deduplicates the authorization key and
//     refuses a double capture).

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
  acceptanceEnv,
  buildAcceptanceContext,
  checkoutRequest,
  releasedLot,
  type AcceptanceContext,
} from "./acceptance-harness";
import { CHECKOUT_REQUIRED_AGREEMENT_KEYS } from "./production-deps";
import { SyntheticDataInProductionError } from "./production-guards";
import { createOrderService, type OrderRecord } from "./orders";
import type { ClaimOrderView } from "./refunds";
import { createWebhookHandler, createInMemoryWebhookEventStore, type WebhookOrder } from "./webhooks";
import { createInMemoryWebhookOrderStore } from "./persistence/webhooks-store";
import {
  MITCH_ALLOWED_PAYLOAD_KEYS,
  TestMitchProvider,
  type InternalFulfillmentRequest,
} from "../providers/fulfillment";
import {
  createAttributionService,
  createInMemoryAttributionRepository,
  type StoredLink,
} from "../partners/attribution";
import { createCommissionService } from "../partners/commissions";
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

function asAdmin(ctx: AcceptanceContext) {
  return {
    get: (path: string) => request(ctx.app).get(path).set(ADMIN_HEADER, ADMIN_HEADER_VALUE),
    post: (path: string) => request(ctx.app).post(path).set(ADMIN_HEADER, ADMIN_HEADER_VALUE),
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

/** Seeds the claim-order view the refund lane reads, from the stored order. */
async function seedClaimOrderView(ctx: AcceptanceContext, orderId: string): Promise<number> {
  const stored = await ctx.orderRepository.get(orderId);
  const captured = stored?.capturedAmountCents ?? 0;
  const view: ClaimOrderView = {
    orderId,
    memberId: stored?.memberId ?? MEMBER_A,
    state: "payment_captured",
    capturedAmountCents: captured,
    paymentReference: stored?.providerReference ?? null,
    refundedCents: 0,
    lines: [{ sku: ELIGIBLE_SKU, lotId: null }],
  };
  await ctx.claimOrderRepository.save(view);
  return captured;
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

/** An order row seeded straight into the wiring order repository. */
function seedableOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    orderId: "ord_seeded_1",
    memberId: MEMBER_A,
    state: "approved",
    lines: [
      { sku: ELIGIBLE_SKU, displayName: "Acceptance Eligible Product", quantity: 1, lineTotalCents: 5000 },
    ],
    totals: { subtotalCents: 5000, shippingCents: 1295, storeCreditAppliedCents: 0, totalCents: 6295 },
    providerReference: null,
    lastIdempotencyKey: null,
    reviewTriggers: [],
    createdAt: AS_OF.toISOString(),
    updatedAt: AS_OF.toISOString(),
    shipments: [{ owner: "xenios", status: "pending", trackingNumber: null, carrier: null }],
    ...overrides,
  };
}

const SUBTOTAL_2X = 10000; // 2 x 5000 cents
const SHIPPING = 1295; // TestShippingProvider standard rate
const ORDER_TOTAL = SUBTOTAL_2X + SHIPPING;

// The large-order fixture: quantity 21 trips BOTH review triggers (unit
// quantity above 10, and 21 x 5000 + shipping above the 100000-cent threshold).
const LARGE_QUANTITY = 21;
const LARGE_TOTAL = LARGE_QUANTITY * 5000 + SHIPPING;

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
// Member isolation (cart and orders)
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
// Shipping quotes (the member quote route)
// ---------------------------------------------------------------------------

describe("shipping quotes over HTTP", () => {
  it("quotes the member's own cart with the configured TTL", async () => {
    const ctx = await buildAcceptanceContext();
    await addEligibleLine(ctx, MEMBER_A, 2);

    const res = await asMember(ctx, MEMBER_A)
      .post("/api/research/shipping/quote")
      .send({
        destination: { line1: "1 Acceptance Way", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
        service: "standard",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.quote.service).toBe("standard");
    // The quote a member sees is the quote checkout charges.
    expect(res.body.quote.amountCents).toBe(SHIPPING);
    // 15 minutes past the injected clock, so a stale quote cannot be presented.
    expect(res.body.expiresAt).toBe("2026-07-22T00:15:00.000Z");

    // A temperature-controlled service quotes the carrier's cold-chain rate.
    const cold = await asMember(ctx, MEMBER_A)
      .post("/api/research/shipping/quote")
      .send({
        destination: { line1: "1 Acceptance Way", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
        service: "temperature_controlled",
      });
    expect(cold.status).toBe(200);
    expect(cold.body.quote.amountCents).toBe(6495);
  });

  it("refuses to quote another member's cart: B's empty cart answers cart_empty", async () => {
    const ctx = await buildAcceptanceContext();
    await addEligibleLine(ctx, MEMBER_A, 2);

    // The quote is derived from the AUTHENTICATED member's cart, so B cannot
    // obtain (or be billed from) a quote computed over A's goods.
    const res = await asMember(ctx, MEMBER_B)
      .post("/api/research/shipping/quote")
      .send({
        destination: { line1: "1 Acceptance Way", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
        service: "standard",
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("cart_empty");
  });

  it("refuses a structurally invalid address or unknown service with address_invalid", async () => {
    const ctx = await buildAcceptanceContext();
    await addEligibleLine(ctx, MEMBER_A, 1);

    const badState = await asMember(ctx, MEMBER_A)
      .post("/api/research/shipping/quote")
      .send({
        destination: { line1: "1 Way", city: "Austin", state: "Texas", postalCode: "78701", country: "US" },
        service: "standard",
      });
    expect(badState.status).toBe(400);
    expect(badState.body.code).toBe("address_invalid");

    const badService = await asMember(ctx, MEMBER_A)
      .post("/api/research/shipping/quote")
      .send({
        destination: { line1: "1 Way", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
        service: "drone",
      });
    expect(badService.status).toBe(400);
    expect(badService.body.code).toBe("address_invalid");
  });

  it("requires an authenticated member", async () => {
    const ctx = await buildAcceptanceContext();
    const res = await request(ctx.app).post("/api/research/shipping/quote").send({});
    expect(res.status).toBe(401);
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
// Checkout WITH reservation, entirely over HTTP: production-deps now composes
// the FEFO reservation seam over the wiring lot and reservation stores, so the
// running app's own checkout route reserves, decrements, and finalizes.
// ---------------------------------------------------------------------------

describe("checkout reservation over HTTP (the production-wired seam)", () => {
  it("reserves FEFO, persists the hold, decrements the lots, and finalizes on settlement", async () => {
    const ctx = await buildAcceptanceContext({
      lots: [
        releasedLot({ lotId: "TEST_LOT_ACC_LATE", expiryDate: "2027-06-30", quantityAvailable: 25 }),
        releasedLot({ lotId: "TEST_LOT_ACC_EARLY", expiryDate: "2026-12-31", quantityAvailable: 1 }),
      ],
    });
    await addEligibleLine(ctx, MEMBER_A, 2);

    const placed = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "rsv-key-1" }));
    expect(placed.status).toBe(200);
    expect(placed.body.ok).toBe(true);
    expect(placed.body.order.state).toBe("payment_captured");

    // The hold is PERSISTED in the wiring reservation store, and FEFO drained
    // the earliest-expiring released lot first, then the next.
    const held = await ctx.reservations.listByMember(MEMBER_A);
    expect(held).toHaveLength(1);
    const reservation = held[0];
    expect(reservation.memberId).toBe(MEMBER_A);
    expect(reservation.sku).toBe(ELIGIBLE_SKU);
    expect(reservation.quantity).toBe(2);
    expect(reservation.lines).toEqual([
      { lotId: "TEST_LOT_ACC_EARLY", quantity: 1 },
      { lotId: "TEST_LOT_ACC_LATE", quantity: 1 },
    ]);

    // Settlement made the reserve-time decrement permanent: the hold is
    // finalized and the lots the HTTP app reads carry the reduced quantities.
    expect(reservation.status).toBe("finalized");
    expect(reservation.finalizedAt).not.toBeNull();
    expect((await ctx.lotStore.get("TEST_LOT_ACC_EARLY"))!.quantityAvailable).toBe(0);
    expect((await ctx.lotStore.get("TEST_LOT_ACC_LATE"))!.quantityAvailable).toBe(24);
  });

  it("absorbs a duplicate checkout click: one reservation, one decrement, one authorization", async () => {
    const ctx = await buildAcceptanceContext({
      lots: [releasedLot({ lotId: "TEST_LOT_ACC_DUP", quantityAvailable: 10 })],
    });
    await addEligibleLine(ctx, MEMBER_A, 2);

    const first = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "rsv-dup-1" }));
    const second = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "rsv-dup-1" }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.order.orderId).toBe(first.body.order.orderId);

    // No double-reserve: one persisted hold, stock decremented exactly once,
    // and the provider saw exactly one authorization for the key.
    expect(await ctx.reservations.listByMember(MEMBER_A)).toHaveLength(1);
    expect((await ctx.lotStore.get("TEST_LOT_ACC_DUP"))!.quantityAvailable).toBe(8);
    expect(ctx.payment.authorizationCalls).toBe(1);
    expect(ctx.payment.captureSuccesses).toBe(1);
  });

  it("reserves nothing on a denied checkout", async () => {
    const ctx = await buildAcceptanceContext({
      lots: [releasedLot({ lotId: "TEST_LOT_ACC_DENY", quantityAvailable: 10 })],
    });
    await addEligibleLine(ctx, MEMBER_A, 2);

    const denied = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ acceptedAgreementKeys: [], idempotencyKey: "rsv-deny-1" }));
    expect(denied.status).toBe(400);

    // The gates run before the hold: no reservation exists and the shelf is untouched.
    expect(await ctx.reservations.listByMember(MEMBER_A)).toHaveLength(0);
    expect((await ctx.lotStore.get("TEST_LOT_ACC_DENY"))!.quantityAvailable).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Process-restart idempotency
// ---------------------------------------------------------------------------

describe("process-restart idempotency over the same wiring stores", () => {
  it("replaying a settled checkout key on a SECOND app instance returns the stored order and regresses nothing", async () => {
    const ctx1 = await buildAcceptanceContext();
    const orderId = await placeOrder(ctx1, MEMBER_A, "restart-key-1");
    expect(ctx1.payment.authorizationRefs.size).toBe(1);
    expect(ctx1.payment.captureSuccesses).toBe(1);

    // An operator advance lands on the durable record BEFORE the replay.
    // beginProcessing is a system act with no HTTP route, so it runs through
    // the canonical order service over the same wiring repository.
    const orders = createOrderService({
      repository: ctx1.orderRepository,
      payment: ctx1.payment,
      commerceEnabled: true,
    });
    expect((await orders.beginProcessing(orderId, "system", AS_OF)).ok).toBe(true);
    const advanced = await ctx1.orderRepository.get(orderId);
    expect(advanced?.state).toBe("processing");

    // A fresh buildCommerceDependencies over the SAME stores and providers:
    // the in-process checkout idempotency map is gone, exactly as after a
    // process restart. The composition's durable pre-check (the order
    // projection's findByIdempotencyKey) must answer the replay.
    const ctx2 = await buildAcceptanceContext({ reuseStoresFrom: ctx1 });
    const replayed = await asMember(ctx2, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "restart-key-1" }));
    expect(replayed.status).toBe(200);
    expect(replayed.body.ok).toBe(true);

    // Same order, still exactly one order row, and the replay reported the
    // record's CURRENT truth (the advanced state), not a re-projected
    // settlement.
    expect(replayed.body.order.orderId).toBe(orderId);
    expect(replayed.body.order.state).toBe("processing");
    expect(await ctx2.orderRepository.listAll()).toHaveLength(1);

    // MONEY invariants at the provider boundary: the replay never even
    // reached the provider (no new authorization call), so exactly one
    // distinct authorization and one capture exist for the key.
    expect(ctx2.payment.authorizationCalls).toBe(1);
    expect(ctx2.payment.authorizationRefs.size).toBe(1);
    expect(ctx2.payment.captureSuccesses).toBe(1);

    // And the durable record did not regress: the admin-advanced state, the
    // capture, and the provider reference all survive, and the row was not
    // re-saved (updatedAt unchanged).
    const stored = await ctx2.orderRepository.get(orderId);
    expect(stored?.state).toBe("processing");
    expect(stored?.capturedAmountCents).toBe(ORDER_TOTAL);
    expect(stored?.providerReference).toMatch(/^test_auth_/);
    expect(stored?.updatedAt).toBe(advanced!.updatedAt);
  });
});

// ---------------------------------------------------------------------------
// The large-order journey: test authorization -> manual review -> admin
// approve and capture over HTTP -> Mitch test transmission -> fulfillment
// webhook over HTTP -> tracking visible to the member
// ---------------------------------------------------------------------------

describe("the large-order journey to fulfillment", () => {
  function fulfillmentWebhookPost(ctx: AcceptanceContext, body: string) {
    return request(ctx.app)
      .post("/api/research/webhooks/fulfillment")
      .set("content-type", "application/json")
      .set("x-webhook-signature", "test-signature")
      .send(body);
  }

  it("holds for review, admin-approves and captures over HTTP, transmits a minimized Mitch payload, and the delivered webhook lands tracking the member sees", async () => {
    const ctx = await buildAcceptanceContext();
    await addEligibleLine(ctx, MEMBER_A, LARGE_QUANTITY);

    // 1. Checkout over HTTP: the review triggers hold the order. The test
    // provider supports deferred capture, so an AUTHORIZATION exists but no
    // money has been captured while Samuel has not decided.
    const placed = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "large-key-1" }));
    expect(placed.status).toBe(200);
    expect(placed.body.order.state).toBe("manual_review");
    expect(placed.body.order.totalCents).toBe(LARGE_TOTAL);
    expect("reviewTriggers" in placed.body.order).toBe(false);

    const orderId = placed.body.order.orderId as string;
    const held = await ctx.orderRepository.get(orderId);
    expect(held?.providerReference).toMatch(/^test_auth_/);
    expect(held?.authorizedAmountCents).toBe(LARGE_TOTAL);
    expect(held?.capturedAmountCents).toBeUndefined();
    expect(held?.reviewTriggers).toContain("total_exceeds_threshold");
    expect(held?.reviewTriggers).toContain("unusual_quantity");
    expect(ctx.payment.captureSuccesses).toBe(0);

    // The wired reservation seam held the stock for the review window: the
    // hold is persisted and the shelf decremented while Samuel decides.
    const holds = await ctx.reservations.listByMember(MEMBER_A);
    expect(holds).toHaveLength(1);
    expect(holds[0].status).toBe("held");
    expect((await ctx.lotStore.get("TEST_LOT_ACC_1"))!.quantityAvailable).toBe(25 - LARGE_QUANTITY);

    // 2. Admin review over HTTP. A non-admin is refused before any handler
    // runs; approve is attributed to the guard-derived admin; capture then
    // takes the money on provider proof, exactly once.
    const nonAdmin = await asMember(ctx, MEMBER_A).post(`/api/admin/research/orders/${orderId}/approve`);
    expect(nonAdmin.status).toBe(403);

    const approved = await asAdmin(ctx).post(`/api/admin/research/orders/${orderId}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.order.state).toBe("approved");
    expect(approved.body.order.approvedBy).toBe("admin");

    const captured = await asAdmin(ctx).post(`/api/admin/research/orders/${orderId}/capture`);
    expect(captured.status).toBe(200);
    expect(captured.body.order.state).toBe("payment_captured");
    expect(captured.body.order.capturedAmountCents).toBe(LARGE_TOTAL);
    expect(ctx.payment.captureSuccesses).toBe(1);

    // A repeated capture click is absorbed by the service's idempotency: no
    // second provider capture.
    const capturedAgain = await asAdmin(ctx).post(`/api/admin/research/orders/${orderId}/capture`);
    expect(capturedAgain.status).toBe(200);
    expect(ctx.payment.captureSuccesses).toBe(1);

    // The member sees the capture over HTTP, from the same repository.
    const afterCapture = await asMember(ctx, MEMBER_A).get(`/api/research/orders/${orderId}`);
    expect(afterCapture.body.order.state).toBe("payment_captured");

    // 3. Fulfillment. processing/fulfilled are system advances with no HTTP
    // surface, so the canonical order service runs them over the same wiring
    // repository. The Mitch TEST transmission then goes out through the SAME
    // provider instance the app's webhook composition uses, and the outbound
    // payload is DATA MINIMIZED by construction: the health fields on the
    // internal request never reach the partner.
    const orders = createOrderService({
      repository: ctx.orderRepository,
      payment: ctx.payment,
      commerceEnabled: true,
    });
    expect((await orders.beginProcessing(orderId, "system", AS_OF)).ok).toBe(true);

    const internal: InternalFulfillmentRequest = {
      fulfillmentOrderId: orderId,
      memberId: MEMBER_A,
      recipientName: "Acceptance Member",
      shippingAddress: { line1: "1 Acceptance Way", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
      recipientPhone: "+1-555-0100",
      carrierRequiresPhone: false,
      shippingService: "standard",
      handlingProfile: "ambient",
      lines: [{ sku: ELIGIBLE_SKU, quantity: LARGE_QUANTITY }],
      memberHealthGoals: ["synthetic_test_fixture goal"],
      internalNotes: "synthetic_test_fixture note",
      referralCode: "acc-referral-1",
    };
    const transmitted = await ctx.fulfillment.submit(internal);
    expect(transmitted.ok).toBe(true);
    if (!transmitted.ok) return;
    expect(transmitted.value).toEqual({ accepted: true, partnerReference: "test_ff_1" });

    const payload = ctx.fulfillment.submitted[0];
    const allowed = new Set<string>(MITCH_ALLOWED_PAYLOAD_KEYS);
    for (const key of Object.keys(payload)) expect(allowed.has(key)).toBe(true);
    const outbound = JSON.stringify(payload);
    expect(outbound).not.toContain("goal");
    expect(outbound).not.toContain("note");
    expect(outbound).not.toContain(MEMBER_A);
    // The phone rides only when the carrier service requires it.
    expect("recipientPhone" in payload).toBe(false);

    expect((await orders.markFulfilled(orderId, "system", AS_OF, transmitted.value.partnerReference)).ok).toBe(true);

    // 4. The partner's delivered webhook arrives over HTTP: raw body plus
    // signature, verified by the composed fulfillment provider, replay-guarded
    // by the durable event store, advancing the SAME order every surface reads.
    const deliveredBody = JSON.stringify({
      eventId: "evt_mitch_delivered_1",
      fulfillmentOrderId: orderId,
      status: "delivered",
      trackingNumber: "TEST00000001",
      carrier: "test-carrier",
    });
    const applied = await fulfillmentWebhookPost(ctx, deliveredBody);
    expect(applied.status).toBe(200);
    expect(applied.body).toEqual({ ok: true, applied: true, eventId: "evt_mitch_delivered_1" });

    // The member sees DELIVERED with the carrier's tracking on the shipment,
    // entirely over HTTP.
    const finalView = await asMember(ctx, MEMBER_A).get(`/api/research/orders/${orderId}`);
    expect(finalView.body.order.state).toBe("delivered");
    expect(finalView.body.order.shipments).toEqual([
      { owner: "xenios", status: "delivered", trackingNumber: "TEST00000001", carrier: "test-carrier" },
    ]);

    // A redelivery of the same event is absorbed by the durable event store.
    const replay = await fulfillmentWebhookPost(ctx, deliveredBody);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ ok: true, applied: false, eventId: "evt_mitch_delivered_1" });
    expect((await ctx.orderRepository.get(orderId))?.state).toBe("delivered");
  });

  it("refuses a forged or unsigned fulfillment webhook and applies nothing", async () => {
    const ctx = await buildAcceptanceContext();
    const orderId = await placeOrder(ctx, MEMBER_A, "ff-sig-key-1");
    const body = JSON.stringify({
      eventId: "evt_mitch_forged_1",
      fulfillmentOrderId: orderId,
      status: "delivered",
    });

    const unsigned = await request(ctx.app)
      .post("/api/research/webhooks/fulfillment")
      .set("content-type", "application/json")
      .send(body);
    expect(unsigned.status).toBe(400);
    expect(unsigned.body.code).toBe("invalid_signature");

    const forged = await request(ctx.app)
      .post("/api/research/webhooks/fulfillment")
      .set("content-type", "application/json")
      .set("x-webhook-signature", "forged-signature")
      .send(body);
    expect(forged.status).toBe(400);
    expect(forged.body.code).toBe("invalid_signature");

    expect((await ctx.orderRepository.get(orderId))?.state).toBe("payment_captured");
  });

  it("cancels a held order over HTTP, releasing the uncaptured authorization", async () => {
    const ctx = await buildAcceptanceContext();
    await addEligibleLine(ctx, MEMBER_A, LARGE_QUANTITY);
    const placed = await asMember(ctx, MEMBER_A)
      .post("/api/research/checkout")
      .send(checkoutRequest({ idempotencyKey: "large-cancel-1" }));
    const orderId = placed.body.order.orderId as string;
    expect(placed.body.order.state).toBe("manual_review");

    // The wire refuses a cancel without a reason before any handler runs.
    const noReason = await asAdmin(ctx).post(`/api/admin/research/orders/${orderId}/cancel`).send({});
    expect(noReason.status).toBe(400);

    const cancelled = await asAdmin(ctx)
      .post(`/api/admin/research/orders/${orderId}/cancel`)
      .send({ reason: "review declined" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.order.state).toBe("cancelled");
    expect(cancelled.body.order.cancellationReason).toBe("review declined");
    // The provider released the hold: nothing was captured, nothing stranded.
    expect(cancelled.body.order.authorizationReleaseFailed).toBe(false);
    expect(ctx.payment.captureSuccesses).toBe(0);

    // Terminal: a capture after cancellation is refused with the precise code.
    const late = await asAdmin(ctx).post(`/api/admin/research/orders/${orderId}/capture`);
    expect(late.status).toBe(400);
    expect(late.body.code).toBe("order_state_invalid");
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
// The payment webhook over HTTP (raw body + signature)
// ---------------------------------------------------------------------------

describe("the payment webhook route", () => {
  function webhookPost(ctx: AcceptanceContext, body: string, signature?: string) {
    let req = request(ctx.app)
      .post("/api/research/webhooks/payment")
      .set("content-type", "application/json");
    if (signature !== undefined) req = req.set("stripe-signature", signature);
    return req.send(body);
  }

  it("applies a valid signed capture event to the order every surface reads", async () => {
    const ctx = await buildAcceptanceContext();
    await ctx.orderRepository.save(seedableOrder({ orderId: "ord_wh_http_1" }));

    const body = JSON.stringify({
      id: "evt_http_1",
      type: "payment.captured",
      orderId: "ord_wh_http_1",
      providerReference: "test_auth_http_1",
    });
    const res = await webhookPost(ctx, body, "test-signature");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, applied: true, eventId: "evt_http_1" });

    const stored = await ctx.orderRepository.get("ord_wh_http_1");
    expect(stored?.state).toBe("payment_captured");
    expect(stored?.providerReference).toBe("test_auth_http_1");
    expect(stored?.lastIdempotencyKey).toBe("evt_http_1");

    // The webhook-advanced state is immediately the member's order status.
    const view = await asMember(ctx, MEMBER_A).get("/api/research/orders/ord_wh_http_1");
    expect(view.body.order.state).toBe("payment_captured");
  });

  it("rejects the identical second delivery and the order does not move again", async () => {
    const ctx = await buildAcceptanceContext();
    await ctx.orderRepository.save(seedableOrder({ orderId: "ord_wh_http_2" }));
    const body = JSON.stringify({
      id: "evt_http_replay_1",
      type: "payment.captured",
      orderId: "ord_wh_http_2",
      providerReference: "test_auth_http_2",
    });

    const first = await webhookPost(ctx, body, "test-signature");
    expect(first.status).toBe(200);
    expect(first.body.applied).toBe(true);

    // The provider's replay protection fires at verification, so the replayed
    // delivery is refused outright. (The durable event-store replay path,
    // which acknowledges with applied false, is proven at the handler below.)
    const second = await webhookPost(ctx, body, "test-signature");
    expect(second.status).toBe(400);
    expect(second.body).toEqual({ ok: false, code: "invalid_signature" });

    const stored = await ctx.orderRepository.get("ord_wh_http_2");
    expect(stored?.state).toBe("payment_captured");
    expect(stored?.lastIdempotencyKey).toBe("evt_http_replay_1");
  });

  it("refuses a missing or invalid signature and an unknown order, applying nothing", async () => {
    const ctx = await buildAcceptanceContext();
    await ctx.orderRepository.save(seedableOrder({ orderId: "ord_wh_http_3" }));
    const body = JSON.stringify({
      id: "evt_http_sig_1",
      type: "payment.captured",
      orderId: "ord_wh_http_3",
      providerReference: "test_auth_http_3",
    });

    const unsigned = await webhookPost(ctx, body);
    expect(unsigned.status).toBe(400);
    expect(unsigned.body.code).toBe("invalid_signature");

    const forged = await webhookPost(ctx, body, "forged-signature");
    expect(forged.status).toBe(400);
    expect(forged.body.code).toBe("invalid_signature");

    expect((await ctx.orderRepository.get("ord_wh_http_3"))?.state).toBe("approved");

    // A verified event naming an order that does not exist is refused.
    const unknown = await webhookPost(
      ctx,
      JSON.stringify({ id: "evt_http_unknown_1", type: "payment.captured", orderId: "ord_missing_1" }),
      "test-signature",
    );
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("unknown_order");
  });

  it("classifies a non-JSON body as malformed through the route-level raw parser", async () => {
    const ctx = await buildAcceptanceContext();
    // text/plain skips the app-level json parser, so the route's own raw
    // parser preserves the exact bytes for verification.
    const res = await request(ctx.app)
      .post("/api/research/webhooks/payment")
      .set("content-type", "text/plain")
      .set("stripe-signature", "test-signature")
      .send("this is not json");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ ok: false, code: "malformed" });
  });
});

// ---------------------------------------------------------------------------
// Webhook replay through the durable event store (handler-level: the test
// provider's own dedupe fires first over HTTP, so the store's absorb path is
// proven at the canonical handler over the same pieces)
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
// Claims and refunds: the member intake and the ADMIN HTTP resolution surface
// ---------------------------------------------------------------------------

describe("claims and the admin refund surface over HTTP", () => {
  it("runs intake, admin review, and a refund capped at the capture, entirely over the routes", async () => {
    const ctx = await buildAcceptanceContext();
    const orderId = await placeOrder(ctx, MEMBER_A, "refund-order-key");
    const captured = await seedClaimOrderView(ctx, orderId);
    expect(captured).toBe(ORDER_TOTAL);

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

    // The claim detail route: the owner reads it, a foreign member cannot
    // distinguish it from a missing claim.
    const detail = await asMember(ctx, MEMBER_A).get(`/api/research/claims/${claimId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.claim.claimId).toBe(claimId);
    const foreignDetail = await asMember(ctx, MEMBER_B).get(`/api/research/claims/${claimId}`);
    expect(foreignDetail.status).toBe(404);

    // Admin surfaces are behind the admin guard.
    const nonAdmin = await asMember(ctx, MEMBER_A)
      .post(`/api/admin/research/claims/${claimId}/review`)
      .send({ decision: "approved" });
    expect(nonAdmin.status).toBe(403);

    const openList = await asAdmin(ctx).get("/api/admin/research/claims");
    expect(openList.status).toBe(200);
    expect(openList.body.claims.map((c: { claimId: string }) => c.claimId)).toContain(claimId);

    const badDecision = await asAdmin(ctx)
      .post(`/api/admin/research/claims/${claimId}/review`)
      .send({ decision: "obliterate" });
    expect(badDecision.status).toBe(400);

    const approved = await asAdmin(ctx)
      .post(`/api/admin/research/claims/${claimId}/review`)
      .send({ decision: "approved" });
    expect(approved.status).toBe(200);
    expect(approved.body.claim.state).toBe("approved");

    // One cent past the capture is refused before any provider call.
    const over = await asAdmin(ctx)
      .post(`/api/admin/research/claims/${claimId}/refund`)
      .send({ amountCents: captured + 1, idempotencyKey: "refund-over-1" });
    expect(over.status).toBe(400);
    expect(over.body.code).toBe("payment_failed");
    expect(ctx.payment.refundCalls).toBe(0);

    // Exactly the capture succeeds, once, on provider proof.
    const capped = await asAdmin(ctx)
      .post(`/api/admin/research/claims/${claimId}/refund`)
      .send({ amountCents: captured, idempotencyKey: "refund-cap-1" });
    expect(capped.status).toBe(200);
    expect(capped.body.claim.state).toBe("resolved");
    expect(capped.body.claim.resolution).toBe("refund");
    expect(ctx.payment.refundCalls).toBe(1);

    // A replayed refund key is absorbed without a second provider call.
    const replayed = await asAdmin(ctx)
      .post(`/api/admin/research/claims/${claimId}/refund`)
      .send({ amountCents: captured, idempotencyKey: "refund-cap-1" });
    expect(replayed.status).toBe(200);
    expect(ctx.payment.refundCalls).toBe(1);

    // A SECOND refund under a fresh key cannot pay out again.
    const again = await asAdmin(ctx)
      .post(`/api/admin/research/claims/${claimId}/refund`)
      .send({ amountCents: captured, idempotencyKey: "refund-again-1" });
    expect(again.status).toBe(400);
    expect(ctx.payment.refundCalls).toBe(1);

    // The member sees the resolved claim over HTTP, from the shared repository.
    const list = await asMember(ctx, MEMBER_A).get("/api/research/claims");
    expect(list.status).toBe(200);
    expect(list.body.claims).toHaveLength(1);
    expect(list.body.claims[0]).toMatchObject({ claimId, state: "resolved", resolution: "refund" });
  });

  it("validates the refund wire shape at the boundary", async () => {
    const ctx = await buildAcceptanceContext();
    const noAmount = await asAdmin(ctx)
      .post("/api/admin/research/claims/clm_x/refund")
      .send({ idempotencyKey: "k1" });
    expect(noAmount.status).toBe(400);
    expect(noAmount.body.code).toBe("payment_failed");

    const noKey = await asAdmin(ctx)
      .post("/api/admin/research/claims/clm_x/refund")
      .send({ amountCents: 100 });
    expect(noKey.status).toBe(400);
    expect(ctx.payment.refundCalls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Subscriptions: creation, actions, isolation
// ---------------------------------------------------------------------------

describe("subscription creation over HTTP", () => {
  it("creates a PENDING subscription that never charges out of creation, then cancel is terminal", async () => {
    const ctx = await buildAcceptanceContext();
    const client = asMember(ctx, MEMBER_A);

    const created = await client
      .post("/api/research/subscriptions")
      .send({ sku: ELIGIBLE_SKU, quantity: 1, frequencyDays: 30, priceVersion: "v1" });
    expect(created.status).toBe(200);
    expect(created.body.subscription.state).toBe("pending");
    expect(created.body.subscription.nextChargeAt).toBeNull();
    // Operator data never crosses the wire, and no money moved.
    expect(JSON.stringify(created.body)).not.toContain("priceVersion");
    expect(ctx.payment.authorizationCalls).toBe(0);

    const subscriptionId = created.body.subscription.subscriptionId as string;

    // Pending cannot pause; it can be cancelled by the member, terminally.
    const paused = await client
      .post(`/api/research/subscriptions/${subscriptionId}`)
      .send({ action: "pause" });
    expect(paused.status).toBe(400);
    expect(paused.body.code).toBe("subscription_action_invalid");

    const cancelled = await client
      .post(`/api/research/subscriptions/${subscriptionId}`)
      .send({ action: "cancel" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.subscription.state).toBe("cancelled");

    const afterTerminal = await client
      .post(`/api/research/subscriptions/${subscriptionId}`)
      .send({ action: "resume" });
    expect(afterTerminal.status).toBe(400);
  });

  it("scopes creation to the authenticated subject and hides it from other members", async () => {
    const ctx = await buildAcceptanceContext();

    // A forged memberId in the body is ignored: the subscription lands on the
    // acting member (B), never on the named victim (A).
    const created = await asMember(ctx, MEMBER_B)
      .post("/api/research/subscriptions")
      .send({ sku: ELIGIBLE_SKU, quantity: 1, frequencyDays: 30, priceVersion: "v1", memberId: MEMBER_A });
    expect(created.status).toBe(200);
    const subscriptionId = created.body.subscription.subscriptionId as string;

    const aList = await asMember(ctx, MEMBER_A).get("/api/research/subscriptions");
    expect(aList.body.subscriptions).toEqual([]);
    const bList = await asMember(ctx, MEMBER_B).get("/api/research/subscriptions");
    expect(bList.body.subscriptions).toHaveLength(1);

    // A cannot act on B's subscription: it reads as missing.
    const aAction = await asMember(ctx, MEMBER_A)
      .post(`/api/research/subscriptions/${subscriptionId}`)
      .send({ action: "cancel" });
    expect(aAction.status).toBe(400);
    expect(aAction.body.code).toBe("subscription_not_found");
  });

  it("refuses precisely: unknown SKU, ineligible SKU, bad frequency, bad quantity", async () => {
    const ctx = await buildAcceptanceContext();
    const client = asMember(ctx, MEMBER_A);

    const unknown = await client
      .post("/api/research/subscriptions")
      .send({ sku: "P999", quantity: 1, frequencyDays: 30, priceVersion: "v1" });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("product_not_found");

    const ineligible = await client
      .post("/api/research/subscriptions")
      .send({ sku: INELIGIBLE_SKU, quantity: 1, frequencyDays: 30, priceVersion: "v1" });
    expect(ineligible.status).toBe(400);
    expect(ineligible.body.code).toBe("subscription_action_invalid");

    const badFrequency = await client
      .post("/api/research/subscriptions")
      .send({ sku: ELIGIBLE_SKU, quantity: 1, frequencyDays: 45, priceVersion: "v1" });
    expect(badFrequency.status).toBe(400);
    expect(badFrequency.body.code).toBe("subscription_action_invalid");

    const badQuantity = await client
      .post("/api/research/subscriptions")
      .send({ sku: ELIGIBLE_SKU, quantity: 0, frequencyDays: 30, priceVersion: "v1" });
    expect(badQuantity.status).toBe(400);
    expect(badQuantity.body.code).toBe("quantity_invalid");
  });
});

describe("subscription actions over HTTP", () => {
  it("lists, pauses, resumes, and cancels through the routes; cancelled is terminal", async () => {
    const ctx = await buildAcceptanceContext();
    // Activation (pending -> active) is a system/provider action with no
    // member-facing route, so the ACTIVE record is seeded through the same
    // wiring repository the app reads.
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
// The partner surface: apply, self views, links, attribution, commission
// ---------------------------------------------------------------------------

describe("the partner surface over HTTP", () => {
  const APPLY = {
    role: "affiliate",
    legalName: "Acceptance Labs LLC",
    contactEmail: "partner@acceptance.test",
  };

  it("applies as a member and reads the minimized self view; one partner per member", async () => {
    const ctx = await buildAcceptanceContext();

    const applied = await asMember(ctx, MEMBER_A).post("/api/research/partner/apply").send(APPLY);
    expect(applied.status).toBe(200);
    expect(applied.body.partner.state).toBe("application");
    expect(applied.body.partner.certifiedAt).toBeNull();
    expect(applied.body.partner.activatedAt).toBeNull();
    const partnerId = applied.body.partner.partnerId as string;
    expect(partnerId).toMatch(/^prt_/);

    // Legal name and contact email are write-only through this surface.
    const wire = JSON.stringify(applied.body);
    expect(wire).not.toContain("Acceptance Labs");
    expect(wire).not.toContain("partner@acceptance.test");

    const me = await asMember(ctx, MEMBER_A).get("/api/research/partner/me");
    expect(me.status).toBe(200);
    expect(me.body.partner.partnerId).toBe(partnerId);
    expect(JSON.stringify(me.body)).not.toContain("Acceptance Labs");

    // One member, one partner: the second application is refused.
    const again = await asMember(ctx, MEMBER_A).post("/api/research/partner/apply").send(APPLY);
    expect(again.status).toBe(400);
    expect(again.body.code).toBe("forbidden");

    // A malformed application never reaches the store.
    const badRole = await asMember(ctx, MEMBER_A)
      .post("/api/research/partner/apply")
      .send({ ...APPLY, role: "regional_director" });
    expect(badRole.status).toBe(400);
  });

  it("isolates partners by member and ignores a body-supplied member id", async () => {
    const ctx = await buildAcceptanceContext();
    const applied = await asMember(ctx, MEMBER_A).post("/api/research/partner/apply").send(APPLY);
    const aPartnerId = applied.body.partner.partnerId as string;

    // B has no partner: every partner read answers partner_not_found.
    for (const path of ["/api/research/partner/me", "/api/research/partner/dashboard", "/api/research/partner/links"]) {
      const res = await asMember(ctx, MEMBER_B).get(path);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("partner_not_found");
    }

    // A forged memberId in the body is ignored: B's application creates B's
    // OWN partner, and A's stays untouched.
    const forged = await asMember(ctx, MEMBER_B)
      .post("/api/research/partner/apply")
      .send({ ...APPLY, memberId: MEMBER_A });
    expect(forged.status).toBe(200);
    expect(forged.body.partner.partnerId).not.toBe(aPartnerId);
    const aLink = await ctx.partnerMemberStore.findByMemberId(MEMBER_A);
    expect(aLink?.partnerId).toBe(aPartnerId);
  });

  it("lists the partner's own referral links from the wiring link store", async () => {
    const ctx = await buildAcceptanceContext();
    const applied = await asMember(ctx, MEMBER_A).post("/api/research/partner/apply").send(APPLY);
    const partnerId = applied.body.partner.partnerId as string;
    await asMember(ctx, MEMBER_B).post("/api/research/partner/apply").send(APPLY);

    const link: StoredLink = {
      code: "acc-code-1",
      partnerId,
      channel: "signed_link",
      campaign: null,
      issuedAt: AS_OF.toISOString(),
    };
    await ctx.partnerLinkStore.saveLink(link);

    const links = await asMember(ctx, MEMBER_A).get("/api/research/partner/links");
    expect(links.status).toBe(200);
    expect(links.body.links).toEqual([
      {
        code: "acc-code-1",
        url: "https://xeniostechnology.com/r/acc-code-1",
        channel: "signed_link",
        campaign: null,
        qrSvgPath: null,
      },
    ]);

    // B's partner sees no links: reads are scoped by the RESOLVED partner.
    const bLinks = await asMember(ctx, MEMBER_B).get("/api/research/partner/links");
    expect(bLinks.status).toBe(200);
    expect(bLinks.body.links).toEqual([]);
  });

  it("attributes a referral, accrues commission, and shows the payout hold in the HTTP balance", async () => {
    const ctx = await buildAcceptanceContext();
    const applied = await asMember(ctx, MEMBER_A).post("/api/research/partner/apply").send(APPLY);
    const partnerId = applied.body.partner.partnerId as string;

    // Member B (the referred buyer) places a real captured order over HTTP.
    const orderId = await placeOrder(ctx, MEMBER_B, "attr-order-key");

    // Referral attribution through the canonical service: a signed link, a
    // touch by an OPAQUE subject key, and one winner per order.
    const attribution = createAttributionService({
      repository: createInMemoryAttributionRepository(),
      linkSecret: "acceptance-link-secret",
      linkBaseUrl: "https://xeniostechnology.com",
    });
    const link = attribution.issueLink(partnerId, "signed_link", null, AS_OF);
    expect(attribution.verifyCode(link.code)?.partnerId).toBe(partnerId);
    // A tampered code verifies to nothing.
    expect(attribution.verifyCode(`${link.code}x`)).toBeNull();

    const subject = attribution.deriveSubjectKey("visitor-acceptance-1");
    attribution.recordTouch(subject, partnerId, "signed_link", AS_OF);
    const winner = attribution.recordConversion(subject, orderId, AS_OF);
    expect(winner?.partnerId).toBe(partnerId);
    // A replayed conversion returns the SAME winner, never a second one.
    expect(attribution.recordConversion(subject, orderId, AS_OF)?.attributedAt).toBe(winner?.attributedAt);

    // Commission accrual through the canonical service over the SAME wiring
    // commission ledger the HTTP dashboard reads. Partner state is loaded from
    // the SAME wiring partner store the apply route wrote.
    let seq = 0;
    const commissions = createCommissionService({
      repository: ctx.commissionLedger,
      newId: () => `led_acc_${++seq}`,
      loadPartnerState: async (pid) => {
        const stored = await ctx.partnerMemberStore.findByMemberId(MEMBER_A);
        return stored && stored.partnerId === pid ? stored.state : null;
      },
    });
    const breakdown = {
      grossItemsCents: SUBTOTAL_2X,
      taxCents: 0,
      shippingCents: 0,
      discountsCents: 0,
      storeCreditAppliedCents: 0,
      refundedCents: 0,
      chargebackCents: 0,
      ineligibleCategoryCents: 0,
    };
    const rate = { role: "affiliate" as const, basisPoints: 1000 };

    // HONEST first: the stored partner is still in `application`, so accrual
    // is refused. Earning requires activation, which the lifecycle wave owns.
    const refused = await commissions.accrue(
      partnerId,
      orderId,
      breakdown,
      rate,
      { partnerState: "application", commissionsEnabled: true, laneCommissionEnabled: true },
      AS_OF,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.denials.map((d) => d.code)).toContain("partner_not_active");

    // With the ACTIVE context the lifecycle wave will supply, the accrual
    // lands: 10 percent of the eligible net revenue, idempotent per order.
    const accrued = await commissions.accrue(
      partnerId,
      orderId,
      breakdown,
      rate,
      { partnerState: "active", commissionsEnabled: true, laneCommissionEnabled: true },
      AS_OF,
    );
    expect(accrued.ok).toBe(true);
    if (!accrued.ok) return;
    expect(accrued.value.entry.amountCents).toBe(1000);
    expect(accrued.value.entry.state).toBe("pending");
    const replayedAccrual = await commissions.accrue(
      partnerId,
      orderId,
      breakdown,
      rate,
      { partnerState: "active", commissionsEnabled: true, laneCommissionEnabled: true },
      AS_OF,
    );
    expect(replayedAccrual.ok && replayedAccrual.value.replayed).toBe(true);

    // THE PAYOUT HOLD, visible in the partner's OWN HTTP balance: the accrued
    // value shows in the total while payable stays zero, and nothing about the
    // buyer or the order crosses the partner wire.
    const dashboard = await asMember(ctx, MEMBER_A).get("/api/research/partner/dashboard");
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.partner.conversionCount).toBe(1);
    expect(dashboard.body.partner.totalCommissionCents).toBe(1000);
    expect(dashboard.body.partner.payableCents).toBe(0);
    const partnerWire = JSON.stringify(dashboard.body);
    expect(partnerWire).not.toContain(orderId);
    expect(partnerWire).not.toContain(MEMBER_B);

    // The payout gate fails closed: the partner is not active, so the chain
    // cannot become payable, let alone paid.
    const payable = await commissions.markPayable(accrued.value.entry.id, AS_OF);
    expect(payable.ok).toBe(false);
    if (!payable.ok) expect(payable.denials.map((d) => d.code)).toContain("partner_not_payable");

    // An admin hold parks the value: held in the balance, still not payable.
    const held = await commissions.hold(accrued.value.entry.id, "admin_acceptance", "manual quality review", AS_OF);
    expect(held.ok).toBe(true);
    const balance = await commissions.balanceFor(partnerId);
    expect(balance.heldCents).toBe(1000);
    expect(balance.payableCents).toBe(0);
    const afterHold = await asMember(ctx, MEMBER_A).get("/api/research/partner/dashboard");
    expect(afterHold.body.partner.totalCommissionCents).toBe(1000);
    expect(afterHold.body.partner.payableCents).toBe(0);
  });

  it("refuses the admin partner lifecycle review precisely (surface registered, capability not provisioned)", async () => {
    const ctx = await buildAcceptanceContext();

    const nonAdmin = await asMember(ctx, MEMBER_A)
      .post("/api/admin/research/partners/prt_x/review")
      .send({ decision: "activate" });
    expect(nonAdmin.status).toBe(403);

    const badDecision = await asAdmin(ctx)
      .post("/api/admin/research/partners/prt_x/review")
      .send({ decision: "promote" });
    expect(badDecision.status).toBe(400);
    expect(badDecision.body.code).toBe("forbidden");

    const review = await asAdmin(ctx)
      .post("/api/admin/research/partners/prt_x/review")
      .send({ decision: "activate" });
    expect(review.status).toBe(400);
    expect(review.body.code).toBe("capability_disabled");
  });
});

// ---------------------------------------------------------------------------
// Money caps at the provider boundary
// ---------------------------------------------------------------------------

describe("the provider money caps", () => {
  it("refuses over-capture, double capture, and over-refund at the provider", async () => {
    const ctx = await buildAcceptanceContext();
    const auth = await ctx.payment.createAuthorization({
      amountCents: 500,
      currency: "usd",
      orderId: "ord_cap_1",
      memberId: MEMBER_A,
      idempotencyKey: "cap-key-1",
    });
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    const ref = auth.value.providerReference;

    const overCapture = await ctx.payment.captureAuthorization(ref, 501);
    expect(overCapture.ok).toBe(false);

    const captured = await ctx.payment.captureAuthorization(ref, 500);
    expect(captured.ok).toBe(true);

    const doubleCapture = await ctx.payment.captureAuthorization(ref, 500);
    expect(doubleCapture.ok).toBe(false);

    const overRefund = await ctx.payment.refund(ref, 501, "cap-refund-over");
    expect(overRefund.ok).toBe(false);

    const refunded = await ctx.payment.refund(ref, 500, "cap-refund-1");
    expect(refunded.ok).toBe(true);

    // Captured minus already-refunded is zero: nothing further can leave.
    const beyond = await ctx.payment.refund(ref, 1, "cap-refund-2");
    expect(beyond.ok).toBe(false);
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
    const res = await asAdmin(ctx).get("/api/admin/research/commerce/queues");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.queues.provisioned).toBe(true);
    expect(Array.isArray(res.body.queues.queues)).toBe(true);
    expect(res.body.queues.queues.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The synthetic-composition guard stays armed
// ---------------------------------------------------------------------------

describe("the synthetic-data composition guard", () => {
  it("refuses to compose over a synthetic configuration while the commerce flag is on", async () => {
    const before = process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED;

    // The commerce flag makes the INJECTED env production-like, and the
    // synthetic marker in a configuration value must refuse the whole
    // composition BEFORE any store or provider exists.
    await expect(
      buildAcceptanceContext({
        env: { ...acceptanceEnv(), SUPABASE_URL: "https://research.example.invalid" },
      }),
    ).rejects.toThrow(SyntheticDataInProductionError);
    await expect(
      buildAcceptanceContext({
        env: { ...acceptanceEnv(), SUPABASE_URL: "https://research.example.invalid" },
      }),
    ).rejects.toThrow(/example\.invalid/);

    // The flag lived only inside the injected env object; the process is untouched.
    expect(process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED).toBe(before);
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

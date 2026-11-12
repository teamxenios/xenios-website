import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../routes", () => ({
  requireSupabaseAdmin(_req: unknown, res: { status(code: number): { json(body: unknown): unknown } }) {
    res.status(401).json({ ok: false });
  },
}));

import { InMemoryEarlyAccessCommerceStore } from "./store";
import {
  CUSTOMER_ALPHA,
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  StubAgreementGate,
  StubIdentityDirectory,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  makeEarlyAccessApp,
} from "./route-fixtures";

// Quote-only at the direct-order door, over real HTTP.
//
// Under the quote-only release a customer browses with no catalog price and
// sends a request for a quote. The quote-only client never calls this door, but
// a stale tab or a direct call still could, and it would create an order and an
// invoice at a catalog price nobody is meant to be shown. So the SERVER refuses
// a NEW direct order. It refuses nothing else: an order placed before the
// cutover still replays, still reads back, and its invoice is still there.
// Synthetic values only.

const ORDERS = "/api/research/early-access/orders";

async function openSession(app: Express): Promise<string> {
  const unlocked = await request(app)
    .post("/api/research/early-access/unlock")
    .send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(unlocked.status).toBe(200);
  const header = unlocked.headers["set-cookie"];
  const raw = Array.isArray(header) ? header[0] : String(header ?? "");
  return raw.split(";")[0] ?? "";
}

/**
 * Two apps over ONE store, ledger and identity: the priced app stands for the
 * deployment before the cutover, the quote-only app for the one after it.
 */
async function beforeAndAfter(quoteOnlyOverride: Record<string, unknown> = { quoteOnly: true }) {
  const unit = cleanUnit();
  const shared = {
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    store: new InMemoryEarlyAccessCommerceStore(),
    identity: new StubIdentityDirectory().always(CUSTOMER_ALPHA),
  };
  const priced = makeEarlyAccessApp({ ...shared, quoteOnly: false });
  const quoteOnly = makeEarlyAccessApp({ ...shared, ...quoteOnlyOverride });
  return { priced: priced.app, quoteOnly: quoteOnly.app, store: shared.store };
}

function place(app: Express, cookie: string, body: Record<string, unknown> = {}) {
  return request(app).post(ORDERS).set("Cookie", cookie).send({ ...ORDER_BODY, ...body });
}

describe("the direct-order door under quote-only", () => {
  it("refuses a new order, definitively, and writes nothing", async () => {
    const { quoteOnly, store } = await beforeAndAfter();
    const cookie = await openSession(quoteOnly);

    const placed = await place(quoteOnly, cookie);

    // A code every existing client already treats as final, so a stale tab
    // ends its attempt instead of offering a retry that can never succeed.
    expect(placed.status).toBe(409);
    expect(placed.body).toMatchObject({ ok: false, code: "RELEASE_REQUIRED", quoteOnly: true });
    expect(placed.body.order).toBeUndefined();
    expect(JSON.stringify(placed.body)).not.toMatch(/cents|price|total|invoice/i);

    // Not the order, not the invoice, not the idempotency claim.
    expect(await store.placementByIdempotencyKey(ORDER_BODY.idempotencyKey)).toBeNull();
    expect(await store.placementByOrderNumber("XEA-0000000000000001")).toBeNull();
    expect((await store.awaitingReview()).length).toBe(0);
  });

  it("is the production default: with no option given, a new order is refused", async () => {
    const { quoteOnly, store } = await beforeAndAfter({ quoteOnly: undefined });
    const cookie = await openSession(quoteOnly);

    const placed = await place(quoteOnly, cookie);

    expect(placed.status).toBe(409);
    expect(placed.body).toMatchObject({ code: "RELEASE_REQUIRED", quoteOnly: true });
    expect(await store.placementByIdempotencyKey(ORDER_BODY.idempotencyKey)).toBeNull();
  });

  it("still places the order when the release is priced", async () => {
    const { priced } = await beforeAndAfter();
    const cookie = await openSession(priced);

    const placed = await place(priced, cookie);

    expect(placed.status).toBe(201);
    expect(placed.body.order.orderNumber).toMatch(/^XEA-/);
  });

  it("asks who the caller is, and for the agreement, before it says anything about quote-only", async () => {
    const unit = cleanUnit();
    const { app } = makeEarlyAccessApp({
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
      agreements: new StubAgreementGate(false),
      quoteOnly: true,
    });

    const anonymous = await request(app).post(ORDERS).send({ ...ORDER_BODY });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.code).toBe("SESSION_REQUIRED");
    expect(anonymous.body.quoteOnly).toBeUndefined();

    const cookie = await openSession(app);
    const unsigned = await place(app, cookie);
    expect(unsigned.status).toBe(403);
    expect(unsigned.body.code).toBe("AGREEMENT_REQUIRED");
    expect(unsigned.body.quoteOnly).toBeUndefined();
  });
});

describe("an order placed before the quote-only cutover", () => {
  async function placedBefore() {
    const apps = await beforeAndAfter();
    const first = await place(apps.priced, await openSession(apps.priced));
    expect(first.status).toBe(201);
    // After the cutover the customer unlocks again. A session is not an
    // identity: the route authorizes against the resolved customer, and both
    // apps resolve the same one.
    const cookie = await openSession(apps.quoteOnly);
    return { ...apps, cookie, orderNumber: first.body.order.orderNumber as string, first: first.body };
  }

  it("still replays under its own idempotency key: what was sold stays sold", async () => {
    const { quoteOnly, cookie, orderNumber, store } = await placedBefore();

    const again = await place(quoteOnly, cookie);

    expect(again.status).toBe(200);
    expect(again.body.replayed).toBe(true);
    expect(again.body.order.orderNumber).toBe(orderNumber);
    // Still exactly the one order: the replay wrote nothing new.
    expect(await store.placementByOrderNumber(orderNumber)).not.toBeNull();
    expect(await store.placementByOrderNumber("XEA-0000000000000002")).toBeNull();
  });

  it("still refuses its key reused for a different order, as a conflict and not as quote-only", async () => {
    const { quoteOnly, cookie } = await placedBefore();

    const conflicting = await place(quoteOnly, cookie, { quantity: 1 });

    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("still reads back, with its invoice and its amounts", async () => {
    const { quoteOnly, cookie, orderNumber } = await placedBefore();

    const order = await request(quoteOnly).get(`${ORDERS}/${orderNumber}`).set("Cookie", cookie);
    expect(order.status).toBe(200);
    expect(order.body.order.orderNumber).toBe(orderNumber);

    const invoice = await request(quoteOnly).get(`${ORDERS}/${orderNumber}/invoice`).set("Cookie", cookie);
    expect(invoice.status).toBe(200);
    expect(invoice.body.invoice.orderNumber).toBe(orderNumber);
    expect(invoice.body.invoice.payableTotalCents).toBe(47_760);
  });

  it("still takes its payment proof, and the proof is still not a payment", async () => {
    const { quoteOnly, cookie, orderNumber, store } = await placedBefore();

    const submitted = await request(quoteOnly)
      .post(`${ORDERS}/${orderNumber}/payment-proof`)
      .set("Cookie", cookie)
      .send({ filename: "transfer.png", contentType: "image/png", byteSize: 240_000, sha256: "a".repeat(64), method: "zelle" });

    expect(submitted.status).toBe(202);
    expect(submitted.body.payment).toEqual({ state: "under_review", paid: false, verified: false });
    expect(submitted.body.receipt).toBeNull();
    expect((await store.placementByOrderNumber(orderNumber))?.paymentState).toBe("under_review");
  });

  it("does not let a second, new order through beside it", async () => {
    const { quoteOnly, cookie, store } = await placedBefore();

    const another = await place(quoteOnly, cookie, { idempotencyKey: "ea-route-order-key-0002" });

    expect(another.status).toBe(409);
    expect(another.body).toMatchObject({ code: "RELEASE_REQUIRED", quoteOnly: true });
    expect(await store.placementByIdempotencyKey("ea-route-order-key-0002")).toBeNull();
  });
});

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// The same test admin guard the other operator-route suites use: it stamps
// the named human on the request exactly as the real Supabase guard does.
vi.mock("../../../routes", () => ({
  requireSupabaseAdmin(
    req: { headers: Record<string, unknown>; adminEmail?: unknown },
    res: { status(code: number): { json(body: unknown): unknown } },
    next: () => void,
  ) {
    const email = req.headers["x-test-admin"];
    if (typeof email !== "string" || email.length === 0) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }
    req.adminEmail = email;
    next();
  },
}));

import {
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  PROOF,
  StubAdminDirectory,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  makeEarlyAccessApp,
} from "./route-fixtures";
import type { InMemoryEarlyAccessCommerceStore } from "./store";

const ORDERS = "/api/research/early-access/orders";
const UNLOCK = "/api/research/early-access/unlock";
const PAYMENTS = "/api/admin/research/payments";
const FOUNDER = "founder@xenios.test";

/**
 * THE OVERPAYMENT DEAD END, closed.
 *
 * The likeliest customer payment error is paying the UNDISCOUNTED subtotal:
 * a three-unit bundle shows 59,700 and 47,760 on the same invoice, and the
 * customer reads the larger number off their own document. Their money is
 * real and already in the founder's account. Before these doors the order
 * could not advance, could not be refunded and could not be rejected.
 */

const ADMINS = new StubAdminDirectory({
  [FOUNDER]: { actorId: "founder.aaaa1111", role: "founder_admin" },
});

async function readyOrder() {
  const unit = cleanUnit();
  const harness = makeEarlyAccessApp({
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    admins: ADMINS,
  });
  const unlocked = await request(harness.app)
    .post(UNLOCK)
    .send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const raw = unlocked.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const cookie = cookies.map((entry) => entry.split(";")[0]).join("; ");

  const placed = await request(harness.app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
  expect(placed.status).toBe(201);
  const orderNumber = placed.body.order.orderNumber as string;
  await request(harness.app)
    .post(`${ORDERS}/${orderNumber}/payment-proof`)
    .set("Cookie", cookie)
    .send({ ...PROOF });

  return {
    app: harness.app,
    store: harness.store as InMemoryEarlyAccessCommerceStore,
    cookie,
    orderNumber,
    payableTotalCents: placed.body.order.money.payableTotalCents as number,
    subtotalCents: placed.body.order.money.subtotalCents as number,
  };
}

describe("the overpayment resolution door", () => {
  it("records the excess for the customer who paid the undiscounted subtotal, and settles nothing", async () => {
    const ready = await readyOrder();
    expect(ready.subtotalCents).toBeGreaterThan(ready.payableTotalCents);

    const recorded = await request(ready.app)
      .post(`${PAYMENTS}/${ready.orderNumber}/overpayment-exception`)
      .set("x-test-admin", FOUNDER)
      .send({
        receivedAmountCents: ready.subtotalCents,
        receivedCurrency: "USD",
        reason:
          "Customer paid the pre-discount subtotal shown on the invoice; excess to be refunded.",
      });

    expect(recorded.status).toBe(201);
    expect(recorded.body.exception.expectedAmountCents).toBe(ready.payableTotalCents);
    expect(recorded.body.exception.receivedAmountCents).toBe(ready.subtotalCents);
    expect(recorded.body.exception.excessCents).toBe(
      ready.subtotalCents - ready.payableTotalCents,
    );
    // Nothing settled: no receipt, no supplier order, no commission.
    expect(recorded.body.settled).toBe(false);
    expect(await ready.store.settlement(ready.orderNumber)).toBeNull();
  });

  it("refuses to record an overpayment for an amount that is not one", async () => {
    const ready = await readyOrder();
    const exact = await request(ready.app)
      .post(`${PAYMENTS}/${ready.orderNumber}/overpayment-exception`)
      .set("x-test-admin", FOUNDER)
      .send({
        receivedAmountCents: ready.payableTotalCents,
        receivedCurrency: "USD",
        reason: "Recording an exception for a payment that matched exactly.",
      });
    expect(exact.status).toBe(409);
    expect(exact.body.code).toBe("NOT_OVERPAID");
  });

  it("records one exception per arrival of money, and refuses the replay", async () => {
    const ready = await readyOrder();
    const body = {
      receivedAmountCents: ready.subtotalCents,
      receivedCurrency: "USD",
      reason: "Customer paid the pre-discount subtotal; excess to be refunded.",
    };
    expect(
      (
        await request(ready.app)
          .post(`${PAYMENTS}/${ready.orderNumber}/overpayment-exception`)
          .set("x-test-admin", FOUNDER)
          .send(body)
      ).status,
    ).toBe(201);
    const replay = await request(ready.app)
      .post(`${PAYMENTS}/${ready.orderNumber}/overpayment-exception`)
      .set("x-test-admin", FOUNDER)
      .send(body);
    expect(replay.status).toBe(409);
    expect(replay.body.code).toBe("EXCEPTION_ALREADY_RECORDED");
  });

  it("is refused without an admin credential", async () => {
    const ready = await readyOrder();
    const anonymous = await request(ready.app)
      .post(`${PAYMENTS}/${ready.orderNumber}/overpayment-exception`)
      .send({ receivedAmountCents: ready.subtotalCents, receivedCurrency: "USD", reason: "x" });
    expect(anonymous.status).toBe(401);
  });
});

describe("the refund record", () => {
  it("refuses a refund on an order no human ever verified", async () => {
    const ready = await readyOrder();
    const refunded = await request(ready.app)
      .post(`${PAYMENTS}/${ready.orderNumber}/refund`)
      .set("x-test-admin", FOUNDER)
      .send({ amountCents: 100, reason: "Refunding money nobody confirmed arrived." });
    expect(refunded.status).toBe(409);
    expect(refunded.body.code).toBe("NOT_VERIFIED");
  });

  it("is refused without an admin credential", async () => {
    const ready = await readyOrder();
    const anonymous = await request(ready.app)
      .post(`${PAYMENTS}/${ready.orderNumber}/refund`)
      .send({ amountCents: 100, reason: "x" });
    expect(anonymous.status).toBe(401);
  });
});

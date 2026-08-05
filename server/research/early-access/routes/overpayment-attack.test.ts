import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

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
  StubAdminDirectory,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  makeEarlyAccessApp,
} from "./route-fixtures";

/**
 * THE OVERPAYMENT DOOR, ATTACKED.
 *
 * The scenario this exists for is not exotic. On a three-unit bundle the
 * invoice shows 59,700 and 47,760 on the same page, so a customer who pays the
 * larger number is reading it off their own invoice. Under manual payment that
 * is the most likely money error there is, and it is the one Samuel reserved an
 * explicit founder decision for.
 *
 * SUCCESS IS ASSERTED FIRST, DELIBERATELY. A door tested only through its
 * refusals looks identical whether it works or is fundamentally miswired: a
 * refusal is a refusal either way. That exact gap hid a defect in this file's
 * sibling for an hour, so every describe below opens by proving the door opens.
 */

const ORDERS = "/api/research/early-access/orders";
const PAYMENTS = "/api/admin/research/payments";
const UNLOCK = "/api/research/early-access/unlock";
const FOUNDER = "founder@example.com";
const ADMINS = new StubAdminDirectory({
  [FOUNDER]: { actorId: "founder.aaaa1111", role: "founder_admin" },
});

const PROOF = Object.freeze({
  filename: "transfer.png",
  contentType: "image/png",
  byteSize: 240_000,
  sha256: "b".repeat(64),
  method: "zelle",
});

async function openSession(app: Express): Promise<string> {
  const unlocked = await request(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const raw = unlocked.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

/** A placed order, with proof submitted and nothing verified yet. */
async function awaitingReview() {
  const unit = cleanUnit();
  const harness = makeEarlyAccessApp({
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    admins: ADMINS,
  } as never);
  const cookie = await openSession(harness.app);

  const placed = await request(harness.app)
    .post(ORDERS)
    .set("Cookie", cookie)
    .send({ ...ORDER_BODY });
  expect(placed.status).toBe(201);

  const orderNumber = placed.body.order.orderNumber as string;
  const money = placed.body.order.money;

  await request(harness.app)
    .post(`${ORDERS}/${orderNumber}/payment-proof`)
    .set("Cookie", cookie)
    .send({ ...PROOF });

  return { app: harness.app, store: harness.store, orderNumber, money };
}

function exception(app: Express, orderNumber: string, body: Record<string, unknown>) {
  return request(app)
    .post(`${PAYMENTS}/${orderNumber}/overpayment-exception`)
    .set("x-test-admin", FOUNDER)
    .send(body);
}

const REASON = "Customer paid the pre-discount subtotal shown on the invoice.";

describe("the overpayment door opens for a real overpayment", () => {
  it("SUCCESS FIRST: records the exception when the customer paid the subtotal", async () => {
    // The exact founder scenario: 59,700 sent against 47,760 owed.
    const { app, orderNumber, money } = await awaitingReview();
    expect(money.subtotalCents).toBeGreaterThan(money.payableTotalCents);

    const response = await exception(app, orderNumber, {
      receivedAmountCents: money.subtotalCents,
      receivedCurrency: "USD",
      action: "record_overpayment_and_refund_difference",
      reason: REASON,
    });

    expect(response.status).toBeLessThan(300);
    // The excess is the server's arithmetic, never the operator's.
    const excess = money.subtotalCents - money.payableTotalCents;
    expect(JSON.stringify(response.body)).toContain(String(excess));
  });

  it("records the EXPECTED side from the order, not from the request", async () => {
    // An operator cannot state what the customer owed. If they could, the
    // excess would be whatever they typed.
    const { app, orderNumber, money } = await awaitingReview();
    const response = await exception(app, orderNumber, {
      receivedAmountCents: money.subtotalCents,
      receivedCurrency: "USD",
      action: "record_overpayment_and_refund_difference",
      reason: REASON,
      // All ignored: the expected side is the immutable snapshot.
      payableTotalCents: 1,
      expectedAmountCents: 1,
      excessCents: 999_999,
    });
    expect(response.status).toBeLessThan(300);
    expect(JSON.stringify(response.body)).not.toContain("999999");
  });
});

describe("the overpayment door refuses everything else", () => {
  it("refuses when the payment is NOT an overpayment", async () => {
    // Recording an overpayment that did not happen puts a false fact about a
    // customer's money into an append-only trail.
    const { app, orderNumber, money } = await awaitingReview();
    const response = await exception(app, orderNumber, {
      receivedAmountCents: money.payableTotalCents,
      receivedCurrency: "USD",
      action: "record_overpayment_and_refund_difference",
      reason: REASON,
    });
    expect(response.status).toBe(409);
    expect(response.body?.code).toBe("NOT_OVERPAID");
  });

  it("refuses an UNDERPAYMENT through the overpayment door", async () => {
    const { app, orderNumber, money } = await awaitingReview();
    const response = await exception(app, orderNumber, {
      receivedAmountCents: money.payableTotalCents - 100,
      receivedCurrency: "USD",
      action: "record_overpayment_and_refund_difference",
      reason: REASON,
    });
    expect(response.status).toBe(409);
    expect(response.body?.code).toBe("NOT_OVERPAID");
  });

  it("records ONE exception per arrival of money", async () => {
    const { app, orderNumber, money } = await awaitingReview();
    const body = {
      receivedAmountCents: money.subtotalCents,
      receivedCurrency: "USD",
      action: "record_overpayment_and_refund_difference",
      reason: REASON,
    };
    const first = await exception(app, orderNumber, body);
    expect(first.status).toBeLessThan(300);
    const second = await exception(app, orderNumber, body);
    expect(second.status).toBe(409);
    expect(second.body?.code).toBe("EXCEPTION_ALREADY_RECORDED");
  });

  it("refuses an unauthenticated caller", async () => {
    const { app, orderNumber, money } = await awaitingReview();
    const response = await request(app)
      .post(`${PAYMENTS}/${orderNumber}/overpayment-exception`)
      .send({
        receivedAmountCents: money.subtotalCents,
        receivedCurrency: "USD",
        action: "record_overpayment_and_refund_difference",
        reason: REASON,
      });
    expect(response.status).toBe(401);
  });

  it("refuses an unknown order without saying whether it exists", async () => {
    const { app, money } = await awaitingReview();
    const response = await exception(app, "XEA-ZZZZZZZZZZZZZZZZ", {
      receivedAmountCents: money.subtotalCents,
      receivedCurrency: "USD",
      action: "record_overpayment_and_refund_difference",
      reason: REASON,
    });
    expect(response.status).toBe(404);
    expect(response.body?.code).toBe("ORDER_NOT_FOUND");
  });
});

describe("recording an exception settles nothing", () => {
  it("creates no settlement, no receipt and no supplier order", async () => {
    // The whole point of the door is that it RECORDS a fact and parks the
    // order for a human. If it advanced the order it would be a second, quieter
    // way to mark money as received.
    const { app, store, orderNumber, money } = await awaitingReview();
    await exception(app, orderNumber, {
      receivedAmountCents: money.subtotalCents,
      receivedCurrency: "USD",
      action: "record_overpayment_and_refund_difference",
      reason: REASON,
    });

    expect(await store.settlement(orderNumber)).toBeNull();
    const dispatch = await store.dispatch(orderNumber);
    expect(dispatch?.events?.length ?? 0).toBe(0);
  });
});

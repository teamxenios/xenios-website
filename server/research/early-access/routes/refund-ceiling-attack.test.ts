import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// The existing admin guard, stood in for so this needs no Supabase JWT. It
// behaves the way the real one does at the only boundary that matters: it
// refuses, or it puts the verified admin email on the request.
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
 * THE REFUND CEILING, ATTACKED.
 *
 * The ceiling is the one number that stops xenios paying out more than a
 * customer actually sent. The route computes it correctly: verified amount less
 * everything already refunded. The question this file asks is whether the
 * ceiling survives two requests arriving at once, which on launch night means a
 * double click, a second tab, or a retry after a request appeared to hang.
 *
 * Refunds are an operator action, so this is not an external attack. It is the
 * failure mode of a tired human doing manual money operations at speed, which
 * is exactly what tonight is.
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

// What the admin OBSERVED. The expected amount is deliberately absent: the
// server reads it from the order's immutable money snapshot.
const CONFIRM = Object.freeze({
  idempotencyKey: "ea-confirm-key-000001",
  verifiedCurrency: "USD",
  receivedAt: "2026-08-04T12:00:00.000Z",
  externalTransactionId: "bank-txn-00001",
  method: "zelle",
  reason: "Zelle transfer received and matched against the payment reference.",
});

async function openSession(app: Express): Promise<string> {
  const unlocked = await request(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const raw = unlocked.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

/** Drive a real order all the way to a VERIFIED settlement. */
async function settledOrder() {
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
  const payable = placed.body.order.money.payableTotalCents as number;

  const submitted = await request(harness.app)
    .post(`${ORDERS}/${orderNumber}/payment-proof`)
    .set("Cookie", cookie)
    .send({ ...PROOF });
  expect(submitted.status).toBe(202);
  const chain = await harness.store.proofs(orderNumber);
  const reviewedProofRef = chain[chain.length - 1]?.record.storageRef ?? "";

  const confirmed = await request(harness.app)
    .post(`${PAYMENTS}/${orderNumber}/confirm`)
    .set("x-test-admin", FOUNDER)
    .send({ ...CONFIRM, reviewedProofRef, verifiedAmountCents: payable });
  expect(confirmed.status).toBeLessThan(300);

  return { app: harness.app, store: harness.store, orderNumber, payable };
}

function refund(app: Express, orderNumber: string, body: Record<string, unknown>) {
  return request(app)
    .post(`${PAYMENTS}/${orderNumber}/refund`)
    .set("x-test-admin", FOUNDER)
    .send(body);
}

async function refundedTotal(store: any, orderNumber: string): Promise<number> {
  const trail = await store.refunds(orderNumber);
  return trail.reduce(
    (sum: number, entry: any) => sum + Number(entry?.amountCents ?? 0),
    0,
  );
}

describe("the refund ceiling under a single operator", () => {
  it("records a refund up to the verified amount", async () => {
    const { app, store, orderNumber, payable } = await settledOrder();
    const response = await refund(app, orderNumber, {
      amountCents: payable,
      reason: "Customer returned the shipment unopened.",
    });
    expect(response.status).toBeLessThan(300);
    expect(await refundedTotal(store, orderNumber)).toBe(payable);
  });

  it("refuses a second refund that would exceed the verified amount", async () => {
    const { app, store, orderNumber, payable } = await settledOrder();
    await refund(app, orderNumber, {
      amountCents: payable,
      reason: "Full refund, first request.",
      refundId: "early-access-refund:manual:first-0001",
    });
    const second = await refund(app, orderNumber, {
      amountCents: payable,
      reason: "Second request for the same money.",
      refundId: "early-access-refund:manual:second-0002",
    });
    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(await refundedTotal(store, orderNumber)).toBe(payable);
  });

  it("refuses a refund on an order nobody has verified", async () => {
    // Refunding an unverified order would invent a payment that never arrived.
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
    const orderNumber = placed.body.order.orderNumber as string;

    const response = await refund(harness.app, orderNumber, {
      amountCents: 1_000,
      reason: "There is no verified money to reverse.",
    });
    expect(response.status).toBe(409);
    expect(response.body?.code).toBe("NOT_VERIFIED");
  });

  it("refuses an unauthenticated caller outright", async () => {
    const { app, orderNumber, payable } = await settledOrder();
    const response = await request(app)
      .post(`${PAYMENTS}/${orderNumber}/refund`)
      .send({ amountCents: payable, reason: "No admin credential at all." });
    expect(response.status).toBe(401);
  });
});

describe("ATTACK: two refunds arriving at once", () => {
  it("F7: concurrent refunds with distinct ids must not exceed the verified amount", async () => {
    // THE ATTACK. The route reads the trail, sums what has already been
    // refunded, checks the ceiling, then appends. There is no compare-and-swap
    // at the write: `appendRefund` deduplicates on refundId ONLY and ignores the
    // sequence the route computed. So two requests that both read an empty trail
    // both pass the ceiling and both land.
    //
    // The DEFAULT id is derived from the trail length, so two simultaneous
    // requests both compute the same id and the second is rejected as a
    // duplicate. That is protection by accident, and it disappears the moment
    // the ids differ, which the route permits because refundId is caller
    // supplied.
    //
    // Operator-side, not external: this is a double click, a second tab, or a
    // retry after a request appeared to hang.
    const { app, store, orderNumber, payable } = await settledOrder();

    const [a, b] = await Promise.all([
      refund(app, orderNumber, {
        amountCents: payable,
        reason: "First click.",
        refundId: "early-access-refund:manual:tab-one-0001",
      }),
      refund(app, orderNumber, {
        amountCents: payable,
        reason: "Second click, same money.",
        refundId: "early-access-refund:manual:tab-two-0002",
      }),
    ]);

    const total = await refundedTotal(store, orderNumber);
    const accepted = [a, b].filter((r) => r.status < 300).length;

    // Exactly one may be accepted, and the trail must never hold more money
    // than the customer actually sent.
    expect(accepted).toBe(1);
    expect(total).toBe(payable);

    // The loser must be refused BY NAME, but which name depends on the
    // interleaving and both are legitimate: the domain ceiling wins when the
    // first refund has already landed, the sequence guard wins when both read
    // the same trail. Pinning one code would make this test flaky by
    // construction, so assert it is one of exactly these two and nothing else.
    // MUTATION NOTE, established by running it: removing the sequence guard in
    // `appendRefund` does NOT fail this test, because the canonical refund id
    // makes both same-sequence requests derive the same id and the dedupe
    // rejects the second. This test therefore pins the PROPERTY (never more
    // money out than came in) rather than isolating one of the three layers
    // that enforce it: canonical id, dedupe, sequence guard, domain ceiling.
    // That is the right property to pin; it is not a substitute for the
    // lane's own targeted regression on the sequence guard.
    const loser = [a, b].find((r) => r.status >= 300);
    expect(loser).toBeDefined();
    const reason = String(
      loser?.body?.code ?? loser?.body?.detail?.code ?? "none",
    );
    expect(["REFUND_SEQUENCE_MOVED", "REFUND_INVALID", "refund_exceeds_verified_paid"]).toContain(
      reason,
    );
  });
});

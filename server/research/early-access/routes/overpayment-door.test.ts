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

/** The proof shape the upload route accepts, as the operator suites use it. */
const PROOF = Object.freeze({
  filename: "transfer.png",
  contentType: "image/png",
  byteSize: 240_000,
  sha256: "b".repeat(64),
  method: "zelle",
});

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
  const submitted = await request(harness.app)
    .post(`${ORDERS}/${orderNumber}/payment-proof`)
    .set("Cookie", cookie)
    .send({ ...PROOF });
  if (submitted.status !== 202) {
    throw new Error(`proof fixture failed: ${submitted.status} ${JSON.stringify(submitted.body)}`);
  }

  const chain = await (harness.store as InMemoryEarlyAccessCommerceStore).proofs(orderNumber);
  const reviewedProofRef = chain[chain.length - 1]?.record.storageRef ?? "";

  return {
    app: harness.app,
    store: harness.store as InMemoryEarlyAccessCommerceStore,
    cookie,
    orderNumber,
    reviewedProofRef,
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

describe("the refund ceiling holds under a double-click (Bug Hunter F7)", () => {
  /** Verify a payment so refunds become reachable at all. */
  async function verifiedOrder() {
    const ready = await readyOrder();
    const confirmed = await request(ready.app)
      .post(`${PAYMENTS}/${ready.orderNumber}/confirm`)
      .set("x-test-admin", FOUNDER)
      .send({
        idempotencyKey: "ea-confirm-f7-000001",
        verifiedAmountCents: ready.payableTotalCents,
        verifiedCurrency: "USD",
        receivedAt: "2026-08-05T01:00:00.000Z",
        externalTransactionId: "bank-txn-f7-0001",
        reviewedProofRef: ready.reviewedProofRef,
        method: "zelle",
        reason: "Zelle transfer received and matched against the payment reference.",
      });
    if (![200, 201].includes(confirmed.status)) {
      throw new Error(
        `confirm fixture failed: ${confirmed.status} ${JSON.stringify(confirmed.body)}`,
      );
    }
    return ready;
  }

  it("refuses the second of two concurrent full refunds with DISTINCT ids", async () => {
    const ready = await verifiedOrder();
    const full = {
      amountCents: ready.payableTotalCents,
      reason: "Customer cancelled after payment; refunding in full.",
    };

    // Fired concurrently. The refund id is now derived by the domain from
    // the trail position rather than accepted from the caller, so the
    // compare-and-swap at the write is what has to hold, not id luck.
    const [first, second] = await Promise.all([
      request(ready.app)
        .post(`${PAYMENTS}/${ready.orderNumber}/refund`)
        .set("x-test-admin", FOUNDER)
        .send({ ...full }),
      request(ready.app)
        .post(`${PAYMENTS}/${ready.orderNumber}/refund`)
        .set("x-test-admin", FOUNDER)
        .send({ ...full }),
    ]);

    // Exactly one wins. The loser is refused by one of the two guards that
    // both have to hold: the domain ceiling (verified minus already
    // refunded) or the compare-and-swap at the write when the trail grew
    // after the ceiling was computed. Either is correct; a second 201 is not.
    const created = [first, second].filter((res) => res.status === 201);
    const refused = [first, second].filter((res) => res.status !== 201);
    expect(created).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(["refund_exceeds_verified_paid", "REFUND_SEQUENCE_MOVED"]).toContain(
      refused[0]?.body.code,
    );

    // The money that left never exceeds the money that arrived.
    const trail = await ready.store.refunds(ready.orderNumber);
    const refunded = trail.reduce<number>(
      (sum, entry) => sum + Number((entry as { amountCents?: unknown }).amountCents ?? 0),
      0,
    );
    expect(trail).toHaveLength(1);
    expect(refunded).toBe(ready.payableTotalCents);
  });

  it("still refuses a sequential second refund that would breach the ceiling", async () => {
    const ready = await verifiedOrder();
    const first = await request(ready.app)
      .post(`${PAYMENTS}/${ready.orderNumber}/refund`)
      .set("x-test-admin", FOUNDER)
      .send({
        amountCents: ready.payableTotalCents,
        reason: "Customer cancelled after payment; refunding in full.",
      });
    expect(first.status).toBe(201);

    const second = await request(ready.app)
      .post(`${PAYMENTS}/${ready.orderNumber}/refund`)
      .set("x-test-admin", FOUNDER)
      .send({
        amountCents: 1,
        reason: "A second refund beyond what the customer ever paid.",
      });
    // The ceiling is the VERIFIED amount minus what was already refunded,
    // so a second refund of even one cent is refused by name.
    expect(second.status).toBe(422);
    expect(second.body.code).toBe("refund_exceeds_verified_paid");
  });
});

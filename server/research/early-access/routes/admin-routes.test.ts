import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// The EXISTING admin guard, stood in for so a route test needs no Supabase JWT.
// It behaves the way the real one does at the only boundary that matters here:
// it either refuses, or it puts the verified admin email on the request. The
// handlers read that and nothing else, so an audit row can never record a name
// the caller typed.
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
  REFERRAL,
  StubAdminDirectory,
  StubReferralResolver,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  makeEarlyAccessApp,
} from "./route-fixtures";
import type { InMemoryEarlyAccessCommerceStore } from "./store";

// The operator surface: the review queue, the one action that accepts money, and
// the supplier dispatch trail behind it.
//
// The properties under test are the ones that cost real money when they break:
// a confirmation produces every downstream fact EXACTLY ONCE even under two
// simultaneous presses, one arrival of money pays one order, and nothing reaches
// a supplier before a named human confirmed the payment.

const ORDERS = "/api/research/early-access/orders";
const PAYMENTS = "/api/admin/research/payments";
const SUPPLIER_ORDERS = "/api/admin/research/supplier-orders";

const FOUNDER = "founder@example.com";
const OPERATIONS = "operations@example.com";
const SUPPORT = "support@example.com";

const ADMINS = new StubAdminDirectory({
  [FOUNDER]: { actorId: "founder.aaaa1111", role: "founder_admin" },
  [OPERATIONS]: { actorId: "ops.bbbb2222", role: "operations_admin" },
});

const PROOF = Object.freeze({
  filename: "transfer.png",
  contentType: "image/png",
  byteSize: 240_000,
  sha256: "b".repeat(64),
  method: "zelle",
});

// What the admin OBSERVED. The expected amount is not here on purpose: the
// server reads it from the order's immutable money snapshot, so a request
// cannot state what the customer owed.
const CONFIRM = Object.freeze({
  idempotencyKey: "ea-confirm-key-000001",
  verifiedAmountCents: 47_760,
  verifiedCurrency: "USD",
  receivedAt: "2026-08-04T12:00:00.000Z",
  externalTransactionId: "bank-txn-00001",
  method: "zelle",
  reason: "Zelle transfer received and matched against the payment reference.",
});

type Ready = Readonly<{
  app: Express;
  store: InMemoryEarlyAccessCommerceStore;
  cookie: string;
  orderNumber: string;
  reviewedProofRef: string;
}>;

async function openSession(app: Express): Promise<string> {
  const unlocked = await request(app)
    .post("/api/research/early-access/unlock")
    .send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const header = unlocked.headers["set-cookie"];
  const raw = Array.isArray(header) ? header[0] : String(header ?? "");
  return raw.split(";")[0] ?? "";
}

/** An order placed, paid for by hand, and waiting for a human to confirm it. */
async function orderAwaitingReview(
  overrides: Record<string, unknown> = {},
  options: Readonly<{ withProof?: boolean; body?: Record<string, unknown> }> = {},
): Promise<Ready> {
  const unit = cleanUnit();
  const harness = makeEarlyAccessApp({
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    admins: ADMINS,
    ...overrides,
  });
  const cookie = await openSession(harness.app);
  const placed = await request(harness.app)
    .post(ORDERS)
    .set("Cookie", cookie)
    .send({ ...ORDER_BODY, ...(options.body ?? {}) });
  expect(placed.status).toBe(201);
  const orderNumber = placed.body.order.orderNumber as string;

  let reviewedProofRef = "";
  if (options.withProof !== false) {
    const submitted = await request(harness.app)
      .post(`${ORDERS}/${orderNumber}/payment-proof`)
      .set("Cookie", cookie)
      .send({ ...PROOF });
    expect(submitted.status).toBe(202);
    const chain = await harness.store.proofs(orderNumber);
    reviewedProofRef = chain[chain.length - 1]?.record.storageRef ?? "";
  }

  return Object.freeze({
    app: harness.app,
    store: harness.store as InMemoryEarlyAccessCommerceStore,
    cookie,
    orderNumber,
    reviewedProofRef,
  });
}

function confirm(
  ready: Ready,
  body: Record<string, unknown> = {},
  admin: string = FOUNDER,
) {
  return request(ready.app)
    .post(`${PAYMENTS}/${ready.orderNumber}/confirm`)
    .set("x-test-admin", admin)
    .send({ ...CONFIRM, reviewedProofRef: ready.reviewedProofRef, ...body });
}

describe("the admin guard sits in front of every operator route", () => {
  it.each([
    ["GET", PAYMENTS],
    ["POST", `${PAYMENTS}/XEA-0000000000000001/confirm`],
    ["GET", `${SUPPLIER_ORDERS}/XEA-0000000000000001`],
    ["POST", `${SUPPLIER_ORDERS}/XEA-0000000000000001`],
    ["POST", `${SUPPLIER_ORDERS}/XEA-0000000000000001/notification`],
    ["POST", `${SUPPLIER_ORDERS}/XEA-0000000000000001/acknowledgement`],
    ["POST", `${SUPPLIER_ORDERS}/XEA-0000000000000001/packing`],
    ["POST", `${SUPPLIER_ORDERS}/XEA-0000000000000001/tracking`],
    ["POST", `${SUPPLIER_ORDERS}/XEA-0000000000000001/shipped`],
  ])("%s %s is refused without an admin credential", async (method, path) => {
    const ready = await orderAwaitingReview();
    const res =
      method === "GET"
        ? await request(ready.app).get(path)
        : await request(ready.app).post(path).send({});
    expect(res.status).toBe(401);
  });

  it("an admin who is not a founder or operations admin may not accept money", async () => {
    const ready = await orderAwaitingReview();
    const refused = await confirm(ready, {}, SUPPORT);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("ACTOR_NOT_PERMITTED");
    expect(await ready.store.settlement(ready.orderNumber)).toBeNull();
  });

  it("an operations admin may", async () => {
    const ready = await orderAwaitingReview();
    const applied = await confirm(ready, {}, OPERATIONS);
    expect(applied.status).toBe(201);
    expect(applied.body.settlement.payment.verifiedByActorRole).toBe("operations_admin");
  });
});

describe("the review queue", () => {
  it("lists orders waiting on a human, with the proof that is CURRENT", async () => {
    const ready = await orderAwaitingReview();
    const queue = await request(ready.app).get(PAYMENTS).set("x-test-admin", FOUNDER);

    expect(queue.status).toBe(200);
    expect(queue.body.items).toHaveLength(1);
    const item = queue.body.items[0];
    expect(item.orderNumber).toBe(ready.orderNumber);
    expect(item.payableTotalCents).toBe(47_760);
    expect(item.currentProof.reviewedProofRef).toBe(ready.reviewedProofRef);
    expect(item.currentProof.sha256).toBe(PROOF.sha256);
  });

  it("carries no shipping address", async () => {
    const ready = await orderAwaitingReview();
    const queue = await request(ready.app).get(PAYMENTS).set("x-test-admin", FOUNDER);
    expect(JSON.stringify(queue.body)).not.toContain("1 Test Street");
  });

  it("drops an order once it has been confirmed", async () => {
    const ready = await orderAwaitingReview();
    await confirm(ready);
    const queue = await request(ready.app).get(PAYMENTS).set("x-test-admin", FOUNDER);
    expect(queue.body.items).toHaveLength(0);
  });
});

describe("confirm payment received and release order", () => {
  it("produces the verified payment, the receipt, the supplier order and the outbox row", async () => {
    const ready = await orderAwaitingReview();
    const applied = await confirm(ready);

    expect(applied.status).toBe(201);
    expect(applied.body.applied).toBe(true);
    const settlement = applied.body.settlement;
    expect(settlement.payment.state).toBe("payment_verified");
    expect(settlement.receipt.payableTotalCents).toBe(47_760);
    expect(settlement.ledgerEntry.amountCents).toBe(47_760);
    expect(settlement.ledgerEntry.externalTransactionId).toBe("bank-txn-00001");
    expect(settlement.supplierOrder.supplierSku).toBe("APEX-CLEAN-10");
    expect(settlement.outbox.kind).toBe("early_access_payment_confirmed");

    const placement = await ready.store.placementByOrderNumber(ready.orderNumber);
    expect(placement?.paymentState).toBe("payment_verified");
  });

  it("reports an overpayment as an overpayment rather than as bad input", async () => {
    const ready = await orderAwaitingReview();
    // 59,700 is the pre-discount subtotal: the classic wrong number, and exactly
    // what a screen showing the wrong field would offer. The customer owed
    // 47,760, so more money arrived than was owed.
    //
    // This test previously asserted 422 PAYABLE_TOTAL_INVALID, which encoded the
    // defect: it treated a real overpayment as a malformed request. That reading
    // loses the money. An overpayment needs a named human to record the excess
    // and choose how it is resolved, and it can never be auto-approved, so it
    // must survive as its own outcome all the way to the caller.
    const refused = await confirm(ready, { verifiedAmountCents: 59_700 });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("PAYMENT_OVERPAID");
    // Nothing settled: no receipt, no supplier order, no commission.
    expect(await ready.store.settlement(ready.orderNumber)).toBeNull();
  });

  it("reports an underpayment as an underpayment, and settles nothing", async () => {
    const ready = await orderAwaitingReview();
    const refused = await confirm(ready, { verifiedAmountCents: 40_000 });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("PAYMENT_UNDERPAID");
    expect(await ready.store.settlement(ready.orderNumber)).toBeNull();
  });

  it("refuses a decision made against a proof the customer already replaced", async () => {
    const ready = await orderAwaitingReview();
    const staleRef = ready.reviewedProofRef;
    await request(ready.app)
      .post(`${ORDERS}/${ready.orderNumber}/payment-proof`)
      .set("Cookie", ready.cookie)
      .send({ ...PROOF, filename: "clearer.png" });

    const refused = await confirm(ready, { reviewedProofRef: staleRef });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("PROOF_REF_STALE");
    expect(await ready.store.settlement(ready.orderNumber)).toBeNull();
  });

  it("refuses when there is no evidence at all", async () => {
    const ready = await orderAwaitingReview({}, { withProof: false });
    const refused = await confirm(ready, { reviewedProofRef: "eaproof.nothing" });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("PROOF_REQUIRED");
  });

  it("holds a commission exactly once when the order carried an attribution", async () => {
    const ready = await orderAwaitingReview({ referrals: new StubReferralResolver(REFERRAL) });
    const applied = await confirm(ready);

    expect(applied.status).toBe(201);
    expect(applied.body.settlement.commission).not.toBeNull();
    expect(applied.body.settlement.commission.state).toBe("held");
    expect(applied.body.settlement.commission.payout).toBe(false);
    // This is the deliberate change the previous pin existed to force, and it is
    // a correction rather than a drift. The affiliate was being credited on the
    // PRE-DISCOUNT subtotal (59,700 -> 5,970), paying commission on money the
    // customer never sent. MONEY_MODEL_DECISION.md makes the basis
    // `subtotalCents - discountCents`, and commission-event.ts implements it as
    // policy `xenios-subtotal-less-discount`: 59,700 - 11,940 = 47,760, ten
    // percent of which is 4,776. The number went DOWN because the old one was
    // wrong, so this assertion should never be "restored".
    expect(applied.body.settlement.commission.holdAmountCents).toBe(4_776);
  });

  it("records no commission when there is no attribution", async () => {
    const ready = await orderAwaitingReview();
    const applied = await confirm(ready);
    expect(applied.body.settlement.commission).toBeNull();
  });
});

describe("exactly once, under pressure", () => {
  it("two simultaneous confirmations converge on ONE settlement", async () => {
    const ready = await orderAwaitingReview();

    const [first, second] = await Promise.all([
      confirm(ready, { idempotencyKey: "ea-confirm-key-00000A", externalTransactionId: "bank-txn-A" }),
      confirm(ready, { idempotencyKey: "ea-confirm-key-00000B", externalTransactionId: "bank-txn-B" }),
    ]);

    // Exactly one applied; both callers see the same settlement.
    expect([first.body.applied, second.body.applied].sort()).toEqual([false, true]);
    expect(first.body.settlement.receipt.receiptId).toBe(second.body.settlement.receipt.receiptId);
    expect(first.body.settlement.supplierOrder.releaseId).toBe(
      second.body.settlement.supplierOrder.releaseId,
    );
    expect(first.body.settlement.ledgerEntry.entryId).toBe(second.body.settlement.ledgerEntry.entryId);

    const stored = await ready.store.settlement(ready.orderNumber);
    expect(stored?.receipt.receiptId).toBe(first.body.settlement.receipt.receiptId);
    // One approval on file, so one supplier order and one commission ever.
    expect(await ready.store.verifications(ready.orderNumber)).toHaveLength(1);
  });

  it("a second, later press writes nothing and reports the original", async () => {
    const ready = await orderAwaitingReview();
    const first = await confirm(ready);
    const again = await confirm(ready, {
      idempotencyKey: "ea-confirm-key-000002",
      externalTransactionId: "bank-txn-00002",
    });

    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.applied).toBe(false);
    expect(again.body.settlement.receipt.issuedAt).toBe(first.body.settlement.receipt.issuedAt);
    expect(again.body.settlement.ledgerEntry.externalTransactionId).toBe("bank-txn-00001");
  });

  it("a duplicate external transaction identifier must not pay two orders", async () => {
    const unit = cleanUnit();
    const harness = makeEarlyAccessApp({
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
      admins: ADMINS,
    });
    const cookie = await openSession(harness.app);

    const numbers: string[] = [];
    const refs: string[] = [];
    for (const key of ["ea-route-order-key-0001", "ea-route-order-key-0002"]) {
      const placed = await request(harness.app)
        .post(ORDERS)
        .set("Cookie", cookie)
        .send({ ...ORDER_BODY, idempotencyKey: key });
      const orderNumber = placed.body.order.orderNumber as string;
      numbers.push(orderNumber);
      await request(harness.app)
        .post(`${ORDERS}/${orderNumber}/payment-proof`)
        .set("Cookie", cookie)
        .send({ ...PROOF });
      const chain = await harness.store.proofs(orderNumber);
      refs.push(chain[chain.length - 1]?.record.storageRef ?? "");
    }

    const paid = await request(harness.app)
      .post(`${PAYMENTS}/${numbers[0]}/confirm`)
      .set("x-test-admin", FOUNDER)
      .send({ ...CONFIRM, reviewedProofRef: refs[0], externalTransactionId: "one-payment-only" });
    expect(paid.status).toBe(201);

    const reused = await request(harness.app)
      .post(`${PAYMENTS}/${numbers[1]}/confirm`)
      .set("x-test-admin", FOUNDER)
      .send({
        ...CONFIRM,
        idempotencyKey: "ea-confirm-key-000009",
        reviewedProofRef: refs[1],
        externalTransactionId: "one-payment-only",
      });

    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe("TRANSACTION_ALREADY_USED");
    expect(await harness.store.settlement(numbers[1] as string)).toBeNull();
    expect((await harness.store.placementByOrderNumber(numbers[1] as string))?.paymentState).toBe(
      "under_review",
    );
  });
});

describe("nothing reaches a supplier before a human confirmed the money", () => {
  it.each([
    ["read", "GET", ""],
    ["ensure", "POST", ""],
    ["notification", "POST", "/notification"],
    ["acknowledgement", "POST", "/acknowledgement"],
    ["packing", "POST", "/packing"],
    ["tracking", "POST", "/tracking"],
    ["shipped", "POST", "/shipped"],
  ])("the %s route refuses an unpaid order", async (_name, method, leaf) => {
    const ready = await orderAwaitingReview();
    const path = `${SUPPLIER_ORDERS}/${ready.orderNumber}${leaf}`;
    const res =
      method === "GET"
        ? await request(ready.app).get(path).set("x-test-admin", FOUNDER)
        : await request(ready.app).post(path).set("x-test-admin", FOUNDER).send({});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PAYMENT_NOT_VERIFIED");
    expect((await ready.store.dispatch(ready.orderNumber)).events).toHaveLength(0);
  });
});

describe("supplier release, dispatch and tracking", () => {
  async function settled(): Promise<Ready> {
    const ready = await orderAwaitingReview();
    const applied = await confirm(ready);
    expect(applied.status).toBe(201);
    return ready;
  }

  it("hands the operator a packet they can send by hand", async () => {
    const ready = await settled();
    const read = await request(ready.app)
      .get(`${SUPPLIER_ORDERS}/${ready.orderNumber}`)
      .set("x-test-admin", FOUNDER);

    expect(read.status).toBe(200);
    expect(read.body.packet.supplierSku).toBe("APEX-CLEAN-10");
    expect(read.body.packet.quantity).toBe(3);
    expect(read.body.packet.recipient.line1).toBe("1 Test Street");
    // The supplier needs a box delivered, and nothing else.
    expect(JSON.stringify(read.body.packet)).not.toMatch(/47760|59700|zelle|PARTNER/);
  });

  it("a retry returns the existing supplier order and never creates a second", async () => {
    const ready = await settled();
    const first = await request(ready.app)
      .post(`${SUPPLIER_ORDERS}/${ready.orderNumber}`)
      .set("x-test-admin", FOUNDER)
      .send({});
    const second = await request(ready.app)
      .post(`${SUPPLIER_ORDERS}/${ready.orderNumber}`)
      .set("x-test-admin", FOUNDER)
      .send({});

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.created).toBe(false);
    expect(first.body.supplierOrder.releaseId).toBe(second.body.supplierOrder.releaseId);
  });

  it("a FAILED dispatch is recorded and does not un-take the money", async () => {
    const ready = await settled();
    const failed = await request(ready.app)
      .post(`${SUPPLIER_ORDERS}/${ready.orderNumber}/notification`)
      .set("x-test-admin", FOUNDER)
      .send({ channel: "email", recipient: "orders@supplier.example", outcome: "failed" });

    expect(failed.status).toBe(201);
    expect(failed.body.paymentState).toBe("payment_verified");
    expect(failed.body.events[0].outcome).toBe("failed");

    const placement = await ready.store.placementByOrderNumber(ready.orderNumber);
    expect(placement?.paymentState).toBe("payment_verified");
    const settlement = await ready.store.settlement(ready.orderNumber);
    expect(settlement).not.toBeNull();
    expect(settlement?.supplierOrder.releaseId).toBeTruthy();
  });

  it("records the manual fallback: channel, recipient, timestamp and acknowledgement", async () => {
    const ready = await settled();
    await request(ready.app)
      .post(`${SUPPLIER_ORDERS}/${ready.orderNumber}/notification`)
      .set("x-test-admin", FOUNDER)
      .send({
        channel: "manual",
        recipient: "Apex operations desk",
        reference: "sent by hand from the founder inbox",
        outcome: "sent",
      });
    const acknowledged = await request(ready.app)
      .post(`${SUPPLIER_ORDERS}/${ready.orderNumber}/acknowledgement`)
      .set("x-test-admin", FOUNDER)
      .send({ reference: "APEX-ACK-4471", acknowledgedBy: "Dana at Apex" });
    const packed = await request(ready.app)
      .post(`${SUPPLIER_ORDERS}/${ready.orderNumber}/packing`)
      .set("x-test-admin", FOUNDER)
      .send({ reference: "carton 2 of 2" });

    expect(acknowledged.status).toBe(201);
    expect(packed.status).toBe(201);
    const events = packed.body.events;
    expect(events.map((event: { kind: string }) => event.kind)).toEqual([
      "notification_attempt",
      "acknowledgement",
      "packing",
    ]);
    expect(events[0].channel).toBe("manual");
    expect(events[0].recipient).toBe("Apex operations desk");
    expect(events[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(events[0].actorId).toBe("founder.aaaa1111");
  });

  it("tracking, then shipped, and shipping twice changes nothing", async () => {
    const ready = await settled();
    const tracked = await request(ready.app)
      .post(`${SUPPLIER_ORDERS}/${ready.orderNumber}/tracking`)
      .set("x-test-admin", FOUNDER)
      .send({ carrier: "UPS", trackingNumber: "1Z999AA10123456784" });
    expect(tracked.status).toBe(201);
    expect(tracked.body.tracking[0].trackingNumber).toBe("1Z999AA10123456784");

    const shipped = await request(ready.app)
      .post(`${SUPPLIER_ORDERS}/${ready.orderNumber}/shipped`)
      .set("x-test-admin", FOUNDER)
      .send({});
    expect(shipped.status).toBe(201);
    expect(shipped.body.shipped).toBe(true);
    // The commission was held once, at confirmation. Shipping does not hold a
    // second one.
    expect(shipped.body.fulfillment.commissionHold).toBeNull();

    const again = await request(ready.app)
      .post(`${SUPPLIER_ORDERS}/${ready.orderNumber}/shipped`)
      .set("x-test-admin", FOUNDER)
      .send({});
    expect(again.status).toBe(200);
    expect(again.body.shipped).toBe(false);
    expect(again.body.fulfillment.fulfilledAt).toBe(shipped.body.fulfillment.fulfilledAt);
  });

  it("refuses to ship before a tracking number exists", async () => {
    const ready = await settled();
    const shipped = await request(ready.app)
      .post(`${SUPPLIER_ORDERS}/${ready.orderNumber}/shipped`)
      .set("x-test-admin", FOUNDER)
      .send({});
    expect(shipped.status).toBe(409);
    expect(shipped.body.code).toBe("TRACKING_REQUIRED");
  });

  it("shows the customer the tracking without showing them the supplier", async () => {
    const ready = await settled();
    await request(ready.app)
      .post(`${SUPPLIER_ORDERS}/${ready.orderNumber}/tracking`)
      .set("x-test-admin", FOUNDER)
      .send({ carrier: "UPS", trackingNumber: "1Z999AA10123456784" });

    const read = await request(ready.app)
      .get(`${ORDERS}/${ready.orderNumber}`)
      .set("Cookie", ready.cookie);

    expect(read.status).toBe(200);
    expect(read.body.payment.paid).toBe(true);
    expect(read.body.receipt.payableTotalCents).toBe(47_760);
    expect(read.body.fulfilment.tracking[0].trackingNumber).toBe("1Z999AA10123456784");
    expect(JSON.stringify(read.body)).not.toContain("supplier-apex");
  });
});

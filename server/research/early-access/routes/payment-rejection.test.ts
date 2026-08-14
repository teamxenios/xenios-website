/**
 * The rejection half of the payment review, over real HTTP.
 *
 * The properties under test are the review's promises: a named admin can say
 * "I could not verify this" durably; saying it decides NOTHING about money
 * (no settlement, no receipt, no supplier release); the customer's recovery
 * path actually recovers (a fresh proof re-enters review, and a confirm then
 * settles normally); a replay answers the recorded decision; and a settled
 * order refuses, because rejecting verified money is a refund conversation.
 */
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
import type { EarlyAccessLegacyOrderNotifier } from "../notifications/legacy-order-notifier";
import type { InMemoryEarlyAccessCommerceStore } from "./store";

const ORDERS = "/api/research/early-access/orders";
const PAYMENTS = "/api/admin/research/payments";
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

const REJECT = Object.freeze({
  idempotencyKey: "ea-reject-key-000001",
  verifiedAmountCents: 47_760,
  verifiedCurrency: "USD",
  method: "zelle",
  reason: "The submitted screenshot shows no completed transfer to match.",
});

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
  rejectedMail: string[];
}>;

async function openSession(app: Express): Promise<string> {
  const unlocked = await request(app)
    .post("/api/research/early-access/unlock")
    .send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const header = unlocked.headers["set-cookie"];
  const raw = Array.isArray(header) ? header[0] : String(header ?? "");
  return raw.split(";")[0] ?? "";
}

async function orderAwaitingReview(): Promise<Ready> {
  const unit = cleanUnit();
  const rejectedMail: string[] = [];
  const notifier: EarlyAccessLegacyOrderNotifier = {
    orderPlaced: () => {},
    proofSubmitted: () => {},
    paymentVerified: () => {},
    paymentRejected: (_placement, reviewedProofId) => {
      rejectedMail.push(reviewedProofId);
    },
  };
  const harness = makeEarlyAccessApp({
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    admins: ADMINS,
    orderNotifications: notifier,
  });
  const cookie = await openSession(harness.app);
  const placed = await request(harness.app)
    .post(ORDERS)
    .set("Cookie", cookie)
    .send({ ...ORDER_BODY });
  expect(placed.status).toBe(201);
  const orderNumber = placed.body.order.orderNumber as string;

  const submitted = await request(harness.app)
    .post(`${ORDERS}/${orderNumber}/payment-proof`)
    .set("Cookie", cookie)
    .send({ ...PROOF });
  expect(submitted.status).toBe(202);
  const chain = await harness.store.proofs(orderNumber);
  const reviewedProofRef = chain[chain.length - 1]?.record.storageRef ?? "";

  return Object.freeze({
    app: harness.app,
    store: harness.store as InMemoryEarlyAccessCommerceStore,
    cookie,
    orderNumber,
    reviewedProofRef,
    rejectedMail,
  });
}

function reject(ready: Ready, body: Record<string, unknown> = {}, admin: string = FOUNDER) {
  return request(ready.app)
    .post(`${PAYMENTS}/${ready.orderNumber}/reject`)
    .set("x-test-admin", admin)
    .send({ ...REJECT, reviewedProofRef: ready.reviewedProofRef, ...body });
}

function confirm(ready: Ready, body: Record<string, unknown> = {}) {
  return request(ready.app)
    .post(`${PAYMENTS}/${ready.orderNumber}/confirm`)
    .set("x-test-admin", FOUNDER)
    .send({ ...CONFIRM, reviewedProofRef: ready.reviewedProofRef, ...body });
}

describe("reject a payment that could not be verified", () => {
  it("records the rejection, moves the order to payment_rejected, and settles nothing", async () => {
    const ready = await orderAwaitingReview();
    const applied = await reject(ready);

    expect(applied.status).toBe(201);
    expect(applied.body.applied).toBe(true);
    expect(applied.body.decision.decision).toBe("reject");

    const placement = await ready.store.placementByOrderNumber(ready.orderNumber);
    expect(placement?.paymentState).toBe("payment_rejected");
    expect(await ready.store.settlement(ready.orderNumber)).toBeNull();
    const decisions = await ready.store.verifications(ready.orderNumber);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.decision).toBe("reject");
  });

  it("mails needs-attention exactly once, keyed by the reviewed proof", async () => {
    const ready = await orderAwaitingReview();
    await reject(ready);
    expect(ready.rejectedMail).toHaveLength(1);
    // A replayed rejection answers the recorded decision and does not re-mail.
    const replay = await reject(ready);
    expect(replay.status).toBe(200);
    expect(replay.body.applied).toBe(false);
    expect(ready.rejectedMail).toHaveLength(1);
  });

  it("refuses to approve over the rejection while the rejected proof is still current", async () => {
    const ready = await orderAwaitingReview();
    await reject(ready);
    const refused = await confirm(ready);
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(await ready.store.settlement(ready.orderNumber)).toBeNull();
  });

  it("RECOVERY: a fresh proof re-enters review, and a confirm then settles normally", async () => {
    const ready = await orderAwaitingReview();
    await reject(ready);

    const resubmitted = await request(ready.app)
      .post(`${ORDERS}/${ready.orderNumber}/payment-proof`)
      .set("Cookie", ready.cookie)
      .send({ ...PROOF, filename: "clearer.png" });
    expect(resubmitted.status).toBe(202);

    const placement = await ready.store.placementByOrderNumber(ready.orderNumber);
    expect(placement?.paymentState).toBe("under_review");

    const chain = await ready.store.proofs(ready.orderNumber);
    const currentRef = chain[chain.length - 1]?.record.storageRef ?? "";
    const settled = await confirm(ready, {
      reviewedProofRef: currentRef,
      idempotencyKey: "ea-confirm-key-000002",
    });
    expect(settled.status).toBe(201);
    expect((await ready.store.placementByOrderNumber(ready.orderNumber))?.paymentState).toBe(
      "payment_verified",
    );
  });

  it("refuses to reject a settled order", async () => {
    const ready = await orderAwaitingReview();
    expect((await confirm(ready)).status).toBe(201);
    const refused = await reject(ready);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("VERIFICATION_INCONSISTENT");
  });

  it("refuses without a proof to review", async () => {
    const unit = cleanUnit();
    const harness = makeEarlyAccessApp({
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
      admins: ADMINS,
    });
    const cookie = await openSession(harness.app);
    const placed = await request(harness.app)
      .post(ORDERS)
      .set("Cookie", cookie)
      .send({ ...ORDER_BODY });
    const orderNumber = placed.body.order.orderNumber as string;
    const refused = await request(harness.app)
      .post(`${PAYMENTS}/${orderNumber}/reject`)
      .set("x-test-admin", FOUNDER)
      .send({ ...REJECT, reviewedProofRef: "eaproof.none" });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("PROOF_REQUIRED");
  });

  it("refuses an anonymous caller and an insufficient reason", async () => {
    const ready = await orderAwaitingReview();
    const anonymous = await request(ready.app)
      .post(`${PAYMENTS}/${ready.orderNumber}/reject`)
      .send({ ...REJECT, reviewedProofRef: ready.reviewedProofRef });
    expect(anonymous.status).toBe(401);
    const thin = await reject(ready, { reason: "bad" });
    expect(thin.status).toBe(400);
    expect(thin.body.code).toBe("REASON_INSUFFICIENT");
    expect(ready.rejectedMail).toHaveLength(0);
  });
});

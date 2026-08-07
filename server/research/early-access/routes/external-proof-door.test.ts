import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// The EXISTING admin guard, stood in for so a route test needs no Supabase JWT.
// Identical to the admin-routes test double: refuse, or stamp the verified
// admin email on the request. The handlers read that and nothing else.
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

/**
 * THE CONCIERGE PROOF DOOR.
 *
 * The pilot's payment proof arrives OFF PLATFORM, through the approved support
 * channel, because no self-service byte-upload path exists and a fake uploader
 * would be a lie. The settlement gate still (correctly) refuses to confirm a
 * payment with no proof row. This door is the bridge: a NAMED admin records
 * the received artifact's metadata and digest under their own identity, the
 * payment moves to under_review with paid still false, and only then can the
 * confirmation door settle it. Nothing here ever claims bytes reached
 * platform storage, and nothing here ever marks anything paid.
 */

const ORDERS = "/api/research/early-access/orders";
const PAYMENTS = "/api/admin/research/payments";

const FOUNDER = "founder@example.com";
const ADMINS = new StubAdminDirectory({
  [FOUNDER]: { actorId: "founder.aaaa1111", role: "founder_admin" },
});

const EXTERNAL_PROOF = Object.freeze({
  filename: "zelle-confirmation.png",
  contentType: "image/png",
  byteSize: 180_000,
  sha256: "c".repeat(64),
  method: "zelle",
  receivedVia: "Email from the purchaser to support@xeniostechnology.com",
});

type Ready = Readonly<{
  app: Express;
  store: InMemoryEarlyAccessCommerceStore;
  cookie: string;
  orderNumber: string;
}>;

async function readyOrder(): Promise<Ready> {
  const unit = cleanUnit();
  const { app, store } = makeEarlyAccessApp({
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    admins: ADMINS,
  });
  const unlocked = await request(app)
    .post("/api/research/early-access/unlock")
    .send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const raw = unlocked.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const cookie = cookies.map((entry) => entry.split(";")[0]).join("; ");

  const placed = await request(app).post(ORDERS).set("Cookie", cookie).send({ ...ORDER_BODY });
  expect(placed.status).toBe(201);
  return Object.freeze({ app, store, cookie, orderNumber: placed.body.order.orderNumber as string });
}

function externalProofPath(orderNumber: string): string {
  return `${PAYMENTS}/${orderNumber}/external-proof`;
}

describe("recording an externally received proof", () => {
  it("refuses a caller the guard did not verify, and an admin the directory does not know", async () => {
    const { app, orderNumber } = await readyOrder();

    const unauthenticated = await request(app)
      .post(externalProofPath(orderNumber))
      .send({ ...EXTERNAL_PROOF });
    expect(unauthenticated.status).toBe(401);

    const unknown = await request(app)
      .post(externalProofPath(orderNumber))
      .set("x-test-admin", "stranger@example.com")
      .send({ ...EXTERNAL_PROOF });
    expect(unknown.status).toBe(403);
    expect(unknown.body.code).toBe("ACTOR_NOT_PERMITTED");
  });

  it("records metadata under the admin's identity, says bytes are NOT on platform, and marks nothing paid", async () => {
    const { app, store, cookie, orderNumber } = await readyOrder();

    const recorded = await request(app)
      .post(externalProofPath(orderNumber))
      .set("x-test-admin", FOUNDER)
      .send({ ...EXTERNAL_PROOF });
    expect(recorded.status).toBe(202);
    expect(recorded.body.recorded).toBe(true);
    // THE HONESTY LINE. This response can never read as an upload.
    expect(recorded.body.storedOnPlatform).toBe(false);
    expect(recorded.body.payment).toEqual({ state: "under_review", paid: false, verified: false });
    expect(recorded.body.receipt).toBeNull();
    expect(recorded.body.supplierOrder).toBeNull();
    // Attributed to the named admin who vouched, never to the customer.
    expect(recorded.body.proof.uploadedBy).toBe("admin:founder.aaaa1111");

    // Nothing settled: the store has no settlement and the customer's own
    // status still says the order is not paid.
    expect(await store.settlement(orderNumber)).toBeNull();
    const status = await request(app).get(`${ORDERS}/${orderNumber}`).set("Cookie", cookie);
    expect(status.status).toBe(200);
    expect(status.body.payment.paid).toBe(false);
  });

  it("requires the provenance note, a valid digest, and a listed format", async () => {
    const { app, orderNumber } = await readyOrder();
    const post = (body: Record<string, unknown>) =>
      request(app)
        .post(externalProofPath(orderNumber))
        .set("x-test-admin", FOUNDER)
        .send(body);

    const noProvenance = await post({ ...EXTERNAL_PROOF, receivedVia: "  " });
    expect(noProvenance.status).toBe(400);
    expect(noProvenance.body.field).toBe("receivedVia");

    const badDigest = await post({ ...EXTERNAL_PROOF, sha256: "not-a-digest" });
    expect(badDigest.status).toBe(400);
    expect(badDigest.body.code).toBe("CHECKSUM_INVALID");

    const badFormat = await post({
      ...EXTERNAL_PROOF,
      filename: "confirmation.svg",
      contentType: "image/svg+xml",
    });
    expect(badFormat.status).toBe(415);
  });

  it("is exactly what lets the confirmation door settle: no proof, no settlement; this proof, settlement", async () => {
    const { app, store, cookie, orderNumber } = await readyOrder();
    const confirmBody = {
      idempotencyKey: "ea-confirm-key-000077",
      verifiedAmountCents: 47_760,
      verifiedCurrency: "USD",
      receivedAt: "2026-08-06T12:00:00.000Z",
      externalTransactionId: "bank-txn-77001",
      method: "zelle",
      reason: "Zelle transfer received and matched against the payment reference.",
    };

    // BEFORE any proof row exists, the settlement gate refuses.
    const early = await request(app)
      .post(`${PAYMENTS}/${orderNumber}/confirm`)
      .set("x-test-admin", FOUNDER)
      .send({ ...confirmBody, reviewedProofRef: "storage-ref-that-does-not-exist" });
    expect(early.status).toBe(409);

    const recorded = await request(app)
      .post(externalProofPath(orderNumber))
      .set("x-test-admin", FOUNDER)
      .send({ ...EXTERNAL_PROOF });
    expect(recorded.status).toBe(202);

    // The queue hands back the CURRENT proof's storage ref, which the admin
    // must echo, proving they decided against the proof that is current.
    const queue = await request(app).get(PAYMENTS).set("x-test-admin", FOUNDER);
    expect(queue.status).toBe(200);
    const item = (queue.body.items as Array<Record<string, any>>).find(
      (candidate) => candidate.orderNumber === orderNumber,
    );
    expect(item?.currentProof?.reviewedProofRef).toBeTruthy();

    const confirmed = await request(app)
      .post(`${PAYMENTS}/${orderNumber}/confirm`)
      .set("x-test-admin", FOUNDER)
      .send({ ...confirmBody, reviewedProofRef: item?.currentProof?.reviewedProofRef });
    // 201: a FRESH settlement. A second press would answer 200 with the same one.
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.ok).toBe(true);

    // Now, and only now, is the order settled.
    expect(await store.settlement(orderNumber)).not.toBeNull();
    const status = await request(app).get(`${ORDERS}/${orderNumber}`).set("Cookie", cookie);
    expect(status.body.payment.paid).toBe(true);
  });
});

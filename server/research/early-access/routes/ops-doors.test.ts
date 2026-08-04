import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";

import { registerPrivateEarlyAccessApi } from "../register";
import {
  createEarlyAccessSessionIdReader,
  type PrivateAccessRouteDependencies,
} from "../private-access-routes";
import { InMemoryPrivateAccessSessionRepository } from "../private-access-session-repository";
import {
  EARLY_ACCESS_TEST_CONFIG,
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  StubAgreementGate,
  StubReferralResolver,
  StubShippingPolicy,
  StubSupplierDirectory,
  SUPPLIER_ASSIGNMENT,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  sequentialOrderNumbers,
  sequentialProofIds,
} from "./route-fixtures";

const NOW_MS = Date.parse("2026-08-04T23:00:00.000Z");

/** An admin guard that stamps the named human, as the real one does. */
function testAdminGuard(req: Request, _res: Response, next: NextFunction): void {
  (req as unknown as { adminEmail: string }).adminEmail = "samuel@xenios.test";
  next();
}

async function harness() {
  const app = express();
  app.use(express.json());
  const unit = cleanUnit();
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    requireAdmin: testAdminGuard,
    agreements: new StubAgreementGate(true),
    suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
    orderNumber: sequentialOrderNumbers(),
    proofId: sequentialProofIds(),
    now: () => NOW_MS,
  });
  const readSessionId = createEarlyAccessSessionIdReader({
    config: EARLY_ACCESS_TEST_CONFIG,
    repository: new InMemoryPrivateAccessSessionRepository(),
    now: () => NOW_MS,
    randomToken: () => "unused",
  } as PrivateAccessRouteDependencies);
  return { app, readSessionId };
}

async function openSession(app: express.Express): Promise<string> {
  const unlocked = await request(app)
    .post("/api/research/early-access/unlock")
    .send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const raw = unlocked.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

describe("the manual operations doors, end to end through the real registration", () => {
  it("approve, request, deliver, verify, bind, and buy: the whole first-customer path", async () => {
    const { app } = await harness();

    // 1. The founder approves the customer through the admin door.
    const created = await request(app)
      .post("/api/admin/research/early-access/customers")
      .send({
        email: "first@example.invalid",
        legalName: "First Real Customer",
        phone: "+1 555 0100",
        reason: "Founding-cohort invitation",
      });
    expect(created.status).toBe(201);
    expect(created.body.customer.status).toBe("APPROVED");

    // 2. The customer opens a password session and asks for verification.
    const cookie = await openSession(app);
    const requested = await request(app)
      .post("/api/research/early-access/verification/request")
      .set("Cookie", cookie)
      .send({ email: "first@example.invalid" });
    expect(requested.status).toBe(202);

    // 3. The token is in the admin queue for MANUAL delivery, never in the
    //    customer-facing response.
    expect(JSON.stringify(requested.body)).not.toContain("vtok");
    const queue = await request(app).get(
      "/api/admin/research/early-access/verification-requests",
    );
    expect(queue.status).toBe(200);
    expect(queue.body.requests).toHaveLength(1);
    const token = queue.body.requests[0].token as string;

    // 4. Before verification: the customer exists, the session does not own
    //    them. Ordering refuses IDENTITY_REQUIRED.
    const early = await request(app)
      .post("/api/research/early-access/orders")
      .set("Cookie", cookie)
      .send(ORDER_BODY);
    expect(early.status).toBe(403);
    expect(early.body.code).toBe("IDENTITY_REQUIRED");

    // 5. The customer redeems the token with the SAME session and is bound.
    const verified = await request(app)
      .post("/api/research/early-access/verify")
      .set("Cookie", cookie)
      .send({ token });
    expect(verified.status).toBe(200);
    expect(verified.body.code).toBe("SESSION_BOUND");

    // 6. The bound, approved customer places the order.
    const placed = await request(app)
      .post("/api/research/early-access/orders")
      .set("Cookie", cookie)
      .send(ORDER_BODY);
    expect(placed.status).toBe(201);
    expect(placed.body.ok).toBe(true);
  });

  it("a stranger's session cannot redeem the customer's token", async () => {
    const { app } = await harness();
    await request(app).post("/api/admin/research/early-access/customers").send({
      email: "target@example.invalid",
      legalName: "Target Customer",
      phone: "+1 555 0101",
      reason: "Founding-cohort invitation",
    });
    const victim = await openSession(app);
    await request(app)
      .post("/api/research/early-access/verification/request")
      .set("Cookie", victim)
      .send({ email: "target@example.invalid" });
    const queue = await request(app).get(
      "/api/admin/research/early-access/verification-requests",
    );
    const token = queue.body.requests[0].token as string;

    // A DIFFERENT password session presents the stolen token: refused, and
    // the token survives for its rightful session.
    const attacker = await openSession(app);
    const stolen = await request(app)
      .post("/api/research/early-access/verify")
      .set("Cookie", attacker)
      .send({ token });
    expect(stolen.status).toBe(403);

    const rightful = await request(app)
      .post("/api/research/early-access/verify")
      .set("Cookie", victim)
      .send({ token });
    expect(rightful.status).toBe(200);
  });

  it("an unknown email answers 202 identically and mints nothing", async () => {
    const { app } = await harness();
    const cookie = await openSession(app);
    const requested = await request(app)
      .post("/api/research/early-access/verification/request")
      .set("Cookie", cookie)
      .send({ email: "nobody@example.invalid" });
    expect(requested.status).toBe(202);
    const queue = await request(app).get(
      "/api/admin/research/early-access/verification-requests",
    );
    expect(queue.body.requests).toHaveLength(0);
  });

  it("records a supplier confirmation and a hold through the admin doors, actor from the guard", async () => {
    const { app } = await harness();

    const confirmed = await request(app)
      .post("/api/admin/research/early-access/supplier-confirmations")
      .send({
        supplierOrg: "Apex Research Supply",
        supplierContact: "Mitch (recorded)",
        productId: "prod-clean",
        variantId: "var-10mg",
        sku: "CLEAN-10",
        supplierSku: "APX-CLN-10",
        strength: "10 mg",
        presentation: "lyophilised vial",
        maxQuantity: 12,
        fulfillmentLocation: "Houston TX",
        fulfillmentMethod: "courier_handoff",
        targetHandoffHours: 72,
        shippingRequirements: "Insulated mailer",
        coldChainState: "ambient_ok",
        documentationState: "supplier_states_coa_available",
        confirmedAt: "2026-08-04T22:00:00.000Z",
        expiresAt: "2026-08-05T22:00:00.000Z",
        evidenceRef: "telegram:supplier-thread/9001",
        // A body-supplied actor must NOT become the named human.
        confirmedBy: "system",
      });
    expect(confirmed.status).toBe(201);

    const held = await request(app)
      .post("/api/admin/research/early-access/holds")
      .send({
        kind: "REGULATORY_HOLD",
        productId: "prod-clean",
        variantId: "var-10mg",
        reason: "Counsel flagged pending review",
      });
    expect(held.status).toBe(201);

    const withdrawn = await request(app)
      .post("/api/admin/research/early-access/holds/withdraw")
      .send({ holdId: held.body.holdId });
    expect(withdrawn.status).toBe(200);
  });
});

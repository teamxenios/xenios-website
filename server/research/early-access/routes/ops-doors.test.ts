import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";

import { registerPrivateEarlyAccessApi } from "../register";
import {
  InMemoryEarlyAccessCustomerRepository,
  createEarlyAccessCustomer,
  transitionEarlyAccessCustomer,
} from "../identity/early-access-customer";
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

const ROSTER_EMAIL = "roster@example.invalid";

/**
 * The same app, plus ONE customer on the roster in a chosen status.
 *
 * The admin door creates and approves in a single act, so it cannot produce
 * an INVITED, SUSPENDED or REVOKED customer. The roster is therefore seeded
 * directly, which is also how a real deployment reaches those states: through
 * a transition recorded against an existing customer.
 */
async function harnessWithRoster(
  status: "INVITED" | "APPROVED" | "SUSPENDED" | "REVOKED",
) {
  const customers = new InMemoryEarlyAccessCustomerRepository();
  const created = createEarlyAccessCustomer({
    id: "cus_roster",
    email: ROSTER_EMAIL,
    legalName: "Roster Customer",
    phone: "+1 555 0144",
    now: "2026-08-04T12:00:00.000Z",
  });
  if (!created.ok) throw new Error("roster fixture invalid");

  let record = created.value;
  // INVITED is the created state, so it needs no transition. Every other
  // status is reached the way the domain reaches it, through APPROVED.
  for (const to of status === "INVITED" ? [] : (["APPROVED", status] as const)) {
    if (to === "APPROVED" && record.status === "APPROVED") continue;
    const moved = transitionEarlyAccessCustomer({
      customer: record,
      to,
      by: "Samuel Boadu",
      reason: `Roster fixture: ${to}`,
      now: "2026-08-04T12:30:00.000Z",
    });
    if (!moved.ok) throw new Error(`roster transition to ${to} refused`);
    record = moved.value;
  }
  expect(record.status).toBe(status);
  await customers.insert(record);

  const app = express();
  app.use(express.json());
  const unit = cleanUnit();
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    customers,
    requireAdmin: testAdminGuard,
    agreements: new StubAgreementGate(true),
    suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
    orderNumber: sequentialOrderNumbers(),
    proofId: sequentialProofIds(),
    now: () => NOW_MS,
  } as never);
  return { app, customers };
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

  it("mints NOTHING for an email that names a customer who is not APPROVED", async () => {
    // THE UNCOVERED BRANCH. The request route checks two things about the
    // email it was given: that it names a customer at all, and that the
    // customer is APPROVED. Only the first had a test, because the existing
    // one uses an address nobody holds, so the handler short-circuits before
    // the status is ever read. Deleting the approval check therefore minted a
    // real, session-bound verification token for a REVOKED or SUSPENDED
    // customer and the whole suite stayed green.
    //
    // A revoked customer is somebody whose access was deliberately withdrawn.
    // Minting them a link is the one mistake that hands access back.
    for (const status of ["INVITED", "SUSPENDED", "REVOKED"] as const) {
      const { app } = await harnessWithRoster(status);
      const cookie = await openSession(app);

      const requested = await request(app)
        .post("/api/research/early-access/verification/request")
        .set("Cookie", cookie)
        .send({ email: ROSTER_EMAIL });
      expect(requested.status).toBe(202);

      const queue = await request(app).get(
        "/api/admin/research/early-access/verification-requests",
      );
      expect(queue.body.requests, `a ${status} customer was sent a link`).toHaveLength(0);
    }
  });

  it("answers a non-approved email BYTE-IDENTICALLY to an unknown one", async () => {
    // The non-enumeration property, stated as a comparison rather than as two
    // separate 202s. If the two answers ever diverge, the endpoint becomes a
    // way to ask which addresses are on the roster and in what state.
    const { app } = await harnessWithRoster("REVOKED");
    const cookie = await openSession(app);

    const known = await request(app)
      .post("/api/research/early-access/verification/request")
      .set("Cookie", cookie)
      .send({ email: ROSTER_EMAIL });
    const unknown = await request(app)
      .post("/api/research/early-access/verification/request")
      .set("Cookie", cookie)
      .send({ email: "nobody@example.invalid" });

    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
  });

  it("mints for the SAME email once the customer is APPROVED", async () => {
    // The control. Without it every assertion above would also pass against a
    // route that had simply stopped minting for anybody.
    const { app } = await harnessWithRoster("APPROVED");
    const cookie = await openSession(app);

    const requested = await request(app)
      .post("/api/research/early-access/verification/request")
      .set("Cookie", cookie)
      .send({ email: ROSTER_EMAIL });
    expect(requested.status).toBe(202);

    const queue = await request(app).get(
      "/api/admin/research/early-access/verification-requests",
    );
    expect(queue.body.requests).toHaveLength(1);
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

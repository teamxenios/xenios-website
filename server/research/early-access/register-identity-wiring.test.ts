import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { registerPrivateEarlyAccessApi } from "./register";
import {
  createEarlyAccessSessionIdReader,
  type PrivateAccessRouteDependencies,
} from "./private-access-routes";
import { InMemoryPrivateAccessSessionRepository } from "./private-access-session-repository";
import {
  InMemoryEarlyAccessCustomerRepository,
  createEarlyAccessCustomer,
  transitionEarlyAccessCustomer,
} from "./identity/early-access-customer";
import { InMemorySessionBindingStore } from "./identity/identity-verification";
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
} from "./routes/route-fixtures";

const UNLOCK = "/api/research/early-access/unlock";
const ORDERS = "/api/research/early-access/orders";

const NOW_ISO = "2026-08-04T12:00:00.000Z";

/**
 * THE DEFAULT IDENTITY IS THE REAL DIRECTORY, WIRED THROUGH THE SESSION LANE.
 *
 * This file pins the one piece of glue the integration session owns: when no
 * `identity` is injected, `registerPrivateEarlyAccessApi` resolves customers
 * through `EarlyAccessCustomerDirectory`, keyed by the SAME hashed session id
 * `createEarlyAccessSessionIdReader` derives from the cookie. A binding
 * written under that id is found for the same cookie; a session that never
 * went through a verification door stays nobody, so the shared password alone
 * still buys no orders.
 */
describe("register.ts default identity wiring", () => {
  async function harness() {
    const customers = new InMemoryEarlyAccessCustomerRepository();
    const sessionBindings = new InMemorySessionBindingStore();

    const created = createEarlyAccessCustomer({
      id: "cus_wiring",
      email: "wiring@example.invalid",
      legalName: "Wiring Test Customer",
      phone: "+1 555 0199",
      now: NOW_ISO,
    });
    if (!created.ok) throw new Error("customer fixture invalid");
    const approved = transitionEarlyAccessCustomer({
      customer: created.value,
      to: "APPROVED",
      by: "Samuel Boadu",
      reason: "Identity wiring regression fixture",
      now: NOW_ISO,
    });
    if (!approved.ok) throw new Error("customer approval fixture invalid");
    await customers.insert(approved.value);

    const unit = cleanUnit();
    const app = express();
    app.use(express.json());
    registerPrivateEarlyAccessApi(app, {
      config: EARLY_ACCESS_TEST_CONFIG,
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
      customers,
      sessionBindings,
      agreements: new StubAgreementGate(true),
      suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
      shipping: new StubShippingPolicy(true),
      referrals: new StubReferralResolver(null),
      orderNumber: sequentialOrderNumbers(),
      proofId: sequentialProofIds(),
    });

    // The same derivation the registration hands the directory: config-driven
    // cookie port, hashed session handle. The repository below is unused by
    // the reader; it satisfies the dependency shape.
    const readSessionId = createEarlyAccessSessionIdReader({
      config: EARLY_ACCESS_TEST_CONFIG,
      repository: new InMemoryPrivateAccessSessionRepository(),
      now: () => Date.now(),
      randomToken: () => "unused",
    } as PrivateAccessRouteDependencies);

    return { app, customers, sessionBindings, readSessionId };
  }

  async function openSession(app: express.Express): Promise<string> {
    const unlocked = await request(app)
      .post(UNLOCK)
      .send({ password: EARLY_ACCESS_TEST_PASSWORD });
    expect(unlocked.status).toBe(200);
    const raw = unlocked.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    return cookies.map((entry) => entry.split(";")[0]).join("; ");
  }

  it("resolves a bound session to the approved customer through the default directory", async () => {
    const { app, sessionBindings, readSessionId } = await harness();
    const cookie = await openSession(app);

    // The verification door's write, keyed by the canonical hashed session id.
    const sessionId = readSessionId(cookie);
    expect(sessionId).not.toBeNull();
    expect(await sessionBindings.bind(sessionId as string, "cus_wiring")).toBe(true);

    const placed = await request(app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
    expect(placed.status).toBe(201);
    expect(placed.body.ok).toBe(true);
  });

  it("refuses IDENTITY_REQUIRED for a password-only session with no binding", async () => {
    const { app } = await harness();
    const cookie = await openSession(app);

    const placed = await request(app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
    expect(placed.status).toBe(403);
    expect(placed.body.code).toBe("IDENTITY_REQUIRED");
  });

  it("refuses a bound session whose customer is not approved to own orders", async () => {
    const { app, customers, sessionBindings, readSessionId } = await harness();

    const created = createEarlyAccessCustomer({
      id: "cus_suspended",
      email: "suspended@example.invalid",
      legalName: "Suspended Customer",
      phone: "+1 555 0198",
      now: NOW_ISO,
    });
    if (!created.ok) throw new Error("customer fixture invalid");
    await customers.insert(created.value);

    const cookie = await openSession(app);
    const sessionId = readSessionId(cookie);
    expect(sessionId).not.toBeNull();
    // Bound, but the customer never reached APPROVED, so the directory
    // resolves nobody and the roster's status stays authoritative.
    expect(await sessionBindings.bind(sessionId as string, "cus_suspended")).toBe(true);

    const placed = await request(app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
    expect(placed.status).toBe(403);
    expect(placed.body.code).toBe("IDENTITY_REQUIRED");
  });
});

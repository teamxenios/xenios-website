import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { registerPrivateEarlyAccessApi } from "../register";
import {
  createEarlyAccessSessionIdReader,
  type PrivateAccessRouteDependencies,
} from "../private-access-routes";
import { InMemoryPrivateAccessSessionRepository } from "../private-access-session-repository";
import {
  InMemoryEarlyAccessCustomerRepository,
  createEarlyAccessCustomer,
  transitionEarlyAccessCustomer,
} from "../identity/early-access-customer";
import {
  InMemorySessionBindingStore,
  type SessionBindingProvenance,
} from "../identity/identity-verification";
import type { EarlyAccessAgreementRecorder, EarlyAccessRecordOutcome } from "./agreement-routes";
import {
  EARLY_ACCESS_TEST_CONFIG,
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
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

/**
 * THE VERIFIED-LINK AUTHORIZATION GATE.
 *
 * The founder's decision, stated once: the shared Early Access password grants
 * PORTAL ACCESS ONLY. Prices, purchase controls, agreement acceptance, order
 * placement and the PRIVATE_EARLY_ACCESS audience all require an identity the
 * customer PROVED, which means a session bound by redeeming the signed
 * verification link and nothing else.
 *
 * Why an email-entry binding is not enough, in one sentence: the password is
 * shared across the whole invited cohort, so typing an address names a
 * customer without proving anyone is them, and everything downstream (the
 * ownership comparison, the agreement record, the shipment, the invoice, the
 * commission) would then be built on a claim nobody checked.
 *
 * These tests run against the REAL registration: real routes, real identity
 * directory, real session lane, real catalogue projection. The only thing
 * steered is the binding store, because the live verification door only ever
 * writes "verified_link" and an email-entry session has to be constructed
 * deliberately to be tested at all.
 */

const UNLOCK = "/api/research/early-access/unlock";
const LOGOUT = "/api/research/early-access/logout";
const CATALOG = "/api/research/early-access/catalog";
const ORDERS = "/api/research/early-access/orders";
const AGREEMENTS = "/api/research/early-access/agreements";
const ACCEPT = "/api/research/early-access/agreements/accept";

const NOW_ISO = "2026-08-05T12:00:00.000Z";
const CUSTOMER_ID = "cus_gate";
const REQUIRED = Object.freeze([Object.freeze({ kind: "early_access_terms", version: "v1" })]);

/** Records what it was asked to write, and accepts everything. */
class RecordingRecorder implements EarlyAccessAgreementRecorder {
  readonly rows: { customerRef: string; kind: string; version: string }[] = [];
  async record(input: {
    readonly customerRef: string;
    readonly kind: string;
    readonly version: string;
  }): Promise<EarlyAccessRecordOutcome> {
    this.rows.push({ customerRef: input.customerRef, kind: input.kind, version: input.version });
    return "recorded";
  }
}

/** The gate the order route consults. Steered so the agreement step is not
 *  what refuses an unverified caller: identity has to be. */
class AlwaysAgreed {
  async accepted(): Promise<boolean> {
    return true;
  }
}

async function harness() {
  const customers = new InMemoryEarlyAccessCustomerRepository();
  const sessionBindings = new InMemorySessionBindingStore();
  const agreementRecorder = new RecordingRecorder();

  const created = createEarlyAccessCustomer({
    id: CUSTOMER_ID,
    email: "gate@example.invalid",
    legalName: "Gate Test Customer",
    phone: "+1 555 0177",
    now: NOW_ISO,
  });
  if (!created.ok) throw new Error("customer fixture invalid");
  const approved = transitionEarlyAccessCustomer({
    customer: created.value,
    to: "APPROVED",
    by: "Samuel Boadu",
    reason: "Verified-link gate fixture",
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
    agreements: new AlwaysAgreed(),
    agreementRecorder,
    requiredAgreements: REQUIRED,
    suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
    orderNumber: sequentialOrderNumbers(),
    proofId: sequentialProofIds(),
  } as never);

  const readSessionId = createEarlyAccessSessionIdReader({
    config: EARLY_ACCESS_TEST_CONFIG,
    repository: new InMemoryPrivateAccessSessionRepository(),
    now: () => Date.now(),
    randomToken: () => "unused",
  } as PrivateAccessRouteDependencies);

  return { app, customers, sessionBindings, agreementRecorder, readSessionId, unit };
}

async function openSession(app: express.Express): Promise<string> {
  const unlocked = await request(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(unlocked.status).toBe(200);
  const raw = unlocked.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

/**
 * A session bound with a chosen provenance, through the SAME store the real
 * verification door writes to and the real directory reads from.
 */
async function bindSession(
  world: Awaited<ReturnType<typeof harness>>,
  cookie: string,
  boundBy: SessionBindingProvenance,
  customerId: string = CUSTOMER_ID,
): Promise<void> {
  const sessionId = world.readSessionId(cookie);
  expect(sessionId).not.toBeNull();
  expect(await world.sessionBindings.bind(sessionId as string, customerId, boundBy)).toBe(true);
}

/** The binding a store that predates the provenance column would produce. */
async function bindWithRawProvenance(
  world: Awaited<ReturnType<typeof harness>>,
  cookie: string,
  raw: unknown,
): Promise<void> {
  const sessionId = world.readSessionId(cookie);
  expect(sessionId).not.toBeNull();
  await world.sessionBindings.bind(sessionId as string, CUSTOMER_ID, raw as SessionBindingProvenance);
}

/**
 * WHERE THE CATALOGUE IS ASSERTED, AND WHY NOT HERE.
 *
 * This harness injects a fixture catalog source, and a fixture carries its own
 * audience: it never consults `EARLY_ACCESS_CUSTOMER_AUDIENCE_SOURCE`, so a
 * price assertion against it would pass whatever the gate does. The catalogue
 * half of this rule is therefore asserted in
 * `release/opening-set.mounted-route.test.ts`, against the real projection,
 * the real audience source and the real 22 canonical units.
 *
 * What IS real here is everything decided inside a route: the agreement read,
 * the agreement write, and order placement.
 */

let keyCounter = 0;
/** A fresh idempotency suffix, so a repeat probe is a new order, not a replay. */
function nextKey(): string {
  keyCounter += 1;
  return String(keyCounter).padStart(4, "0");
}

/** Whether this session may buy. The order route's own answer, not a proxy. */
async function canOrder(
  world: Awaited<ReturnType<typeof harness>>,
  cookie: string,
): Promise<boolean> {
  const placed = await request(world.app)
    .post(ORDERS)
    .set("Cookie", cookie)
    .send({ ...ORDER_BODY, idempotencyKey: ORDER_BODY.idempotencyKey + nextKey() });
  if (placed.status === 201) return true;
  expect(placed.status).toBe(403);
  expect(placed.body?.code).toBe("IDENTITY_REQUIRED");
  return false;
}

// ---------------------------------------------------------------------------
// STATE A and B: nothing that costs money, and nothing that commits anybody
// ---------------------------------------------------------------------------

describe("a password-only session, which is the whole invited cohort", () => {
  it("cannot accept the Research Use Policy, and records nothing", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);

    const accepted = await request(world.app)
      .post(ACCEPT)
      .set("Cookie", cookie)
      .send({ kind: "early_access_terms", version: "v1" });
    expect(accepted.status).toBe(403);
    expect(accepted.body?.code).toBe("IDENTITY_REQUIRED");
    expect(world.agreementRecorder.rows).toHaveLength(0);
  });

  it("cannot read an agreement standing, because it has no customer to read one for", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);
    const status = await request(world.app).get(AGREEMENTS).set("Cookie", cookie);
    expect(status.status).toBe(403);
    expect(status.body?.code).toBe("IDENTITY_REQUIRED");
  });

  it("cannot place an order", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);
    const placed = await request(world.app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
    expect(placed.status).toBe(403);
    expect(placed.body?.code).toBe("IDENTITY_REQUIRED");
  });
});

describe("a session bound by email entry, which proves nothing under a shared password", () => {
  it("cannot accept the Research Use Policy, and records nothing", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);
    await bindSession(world, cookie, "email_entry");

    const accepted = await request(world.app)
      .post(ACCEPT)
      .set("Cookie", cookie)
      .send({ kind: "early_access_terms", version: "v1" });
    expect(accepted.status).toBe(403);
    expect(accepted.body?.code).toBe("IDENTITY_REQUIRED");
    // The row matters more than the status code: an acceptance is append-only
    // and names a person, so a wrongly recorded one cannot be taken back.
    expect(world.agreementRecorder.rows).toHaveLength(0);
  });

  it("cannot read an agreement standing", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);
    await bindSession(world, cookie, "email_entry");
    const status = await request(world.app).get(AGREEMENTS).set("Cookie", cookie);
    expect(status.status).toBe(403);
    expect(status.body?.code).toBe("IDENTITY_REQUIRED");
  });

  it("cannot place an order", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);
    await bindSession(world, cookie, "email_entry");
    const placed = await request(world.app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
    expect(placed.status).toBe(403);
    expect(placed.body?.code).toBe("IDENTITY_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// Provenance that is missing, unknown, or merely asserted
// ---------------------------------------------------------------------------

describe("provenance that cannot be trusted fails closed", () => {
  it("treats an ABSENT provenance as unverified", async () => {
    // Exactly what a durable adapter written before the field existed
    // produces, and exactly what the production Supabase store produces
    // today. It must not read as verified.
    const world = await harness();
    const cookie = await openSession(world.app);
    await bindWithRawProvenance(world, cookie, undefined);

    expect(await canOrder(world, cookie)).toBe(false);
    const status = await request(world.app).get(AGREEMENTS).set("Cookie", cookie);
    expect(status.status).toBe(403);
  });

  it("treats an UNKNOWN provenance as unverified", async () => {
    const world = await harness();
    for (const raw of ["verified", "VERIFIED_LINK", "admin", "", null, 1, {}, true]) {
      const cookie = await openSession(world.app);
      await bindWithRawProvenance(world, cookie, raw);

      expect(await canOrder(world, cookie)).toBe(false);
      const status = await request(world.app).get(AGREEMENTS).set("Cookie", cookie);
      expect(status.status).toBe(403);
    }
  });

  it("treats a customerRef with no verified provenance as insufficient, on its own", async () => {
    // The precise defect this slice closes. The customer is real, APPROVED,
    // and correctly resolved; the reference is exactly the one a verified
    // session would carry. The ONLY difference is how the session was bound,
    // and that difference is now the whole answer.
    const world = await harness();

    const weak = await openSession(world.app);
    await bindSession(world, weak, "email_entry");
    const strong = await openSession(world.app);
    await bindSession(world, strong, "verified_link");

    expect(await canOrder(world, weak)).toBe(false);
    expect(await canOrder(world, strong)).toBe(true);
  });

  it("cannot be influenced by a customerRef in the request body", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);

    for (const body of [
      { ...ORDER_BODY, customerRef: CUSTOMER_ID },
      { ...ORDER_BODY, customerRef: CUSTOMER_ID, boundBy: "verified_link" },
      { ...ORDER_BODY, boundBy: "verified_link" },
    ]) {
      const placed = await request(world.app).post(ORDERS).set("Cookie", cookie).send(body);
      expect(placed.status).toBe(403);
      expect(placed.body?.code).toBe("IDENTITY_REQUIRED");
    }

    const accepted = await request(world.app)
      .post(ACCEPT)
      .set("Cookie", cookie)
      .send({ kind: "early_access_terms", version: "v1", customerRef: CUSTOMER_ID, boundBy: "verified_link" });
    expect(accepted.status).toBe(403);
    expect(world.agreementRecorder.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// STATE C: the verified customer
// ---------------------------------------------------------------------------

describe("a session bound by the signed verification link", () => {
  it("can read and record the agreement", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);
    await bindSession(world, cookie, "verified_link");

    const before = await request(world.app).get(AGREEMENTS).set("Cookie", cookie);
    expect(before.status).toBe(200);
    expect(before.body?.required).toEqual([{ kind: "early_access_terms", version: "v1" }]);

    const accepted = await request(world.app)
      .post(ACCEPT)
      .set("Cookie", cookie)
      .send({ kind: "early_access_terms", version: "v1" });
    expect(accepted.status).toBe(200);
    expect(world.agreementRecorder.rows).toHaveLength(1);
    // Recorded against the SESSION's customer, resolved from the binding.
    expect(world.agreementRecorder.rows[0].kind).toBe("early_access_terms");
  });

  it("can place an order once the agreement is on file", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);
    await bindSession(world, cookie, "verified_link");

    const placed = await request(world.app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
    expect(placed.status).toBe(201);
    expect(placed.body?.ok).toBe(true);
  });

  it("keeps its verified state across a refresh, because the SERVER remembers it", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);
    await bindSession(world, cookie, "verified_link");

    // Three independent reads on the same cookie, as a reload would make. The
    // browser is told nothing and keeps nothing; each answer is the server's.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const status = await request(world.app).get(AGREEMENTS).set("Cookie", cookie);
      expect(status.status).toBe(200);
      expect(await canOrder(world, cookie)).toBe(true);
    }
  });

  it("loses everything on sign-out, and a fresh unlock does not inherit it", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);
    await bindSession(world, cookie, "verified_link");
    expect(await canOrder(world, cookie)).toBe(true);

    const out = await request(world.app).post(LOGOUT).set("Cookie", cookie);
    expect(out.status).toBe(200);

    // The old cookie is dead: not merely unverified, unauthenticated. The
    // catalogue refuses it outright rather than serving an unpriced shelf.
    const after = await request(world.app).get(CATALOG).set("Cookie", cookie);
    expect(after.status).toBe(401);
    const placed = await request(world.app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
    expect(placed.status).toBe(401);

    // And the NEXT person to unlock on this browser starts unverified, rather
    // than inheriting the last person's identity.
    const next = await openSession(world.app);
    expect(await canOrder(world, next)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Upgrade, refusal, and the one direction that must never happen
// ---------------------------------------------------------------------------

describe("moving between provenances", () => {
  it("upgrades the SAME customer from email entry to verified", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);
    await bindSession(world, cookie, "email_entry");
    expect(await canOrder(world, cookie)).toBe(false);

    await bindSession(world, cookie, "verified_link");
    expect(await canOrder(world, cookie)).toBe(true);
  });

  it("refuses an upgrade that names a DIFFERENT customer", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);
    await bindSession(world, cookie, "email_entry");

    const sessionId = world.readSessionId(cookie);
    expect(
      await world.sessionBindings.bind(sessionId as string, "cus_someone_else", "verified_link"),
    ).toBe(false);
    // Still the original customer, still unverified.
    expect(await world.sessionBindings.binding(sessionId as string)).toEqual({
      customerId: CUSTOMER_ID,
      boundBy: "email_entry",
    });
    expect(await canOrder(world, cookie)).toBe(false);
  });

  it("never downgrades a verified binding back to email entry", async () => {
    const world = await harness();
    const cookie = await openSession(world.app);
    await bindSession(world, cookie, "verified_link");

    const sessionId = world.readSessionId(cookie);
    expect(
      await world.sessionBindings.bind(sessionId as string, CUSTOMER_ID, "email_entry"),
    ).toBe(false);
    expect(await world.sessionBindings.binding(sessionId as string)).toEqual({
      customerId: CUSTOMER_ID,
      boundBy: "verified_link",
    });
    expect(await canOrder(world, cookie)).toBe(true);
  });
});

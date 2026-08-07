import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { registerPrivateEarlyAccessApi } from "../register";
import { InMemoryPrivateAccessSessionRepository } from "../private-access-session-repository";
import type { EarlyAccessAgreementRecorder } from "./agreement-routes";
import {
  EARLY_ACCESS_TEST_CONFIG,
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  ORDER_CONTACT,
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
import { InMemoryEarlyAccessCommerceStore } from "./store";

/**
 * THE CODE-SESSION CHECKOUT, production-shaped.
 *
 * These tests run the REAL registration with `sessionIdentity: true` and NO
 * injected identity directory, which is exactly the production composition
 * when the kill switch is set. The identity every request acts under is the
 * one the server derives from the signed durable session, so what is proven
 * here is the pilot's actual authority chain:
 *
 *   correct code → durable signed session → derived opaque eac_ customerRef
 *   → agreement → order → invoice → status, with no verification token
 *   anywhere, and with two browsers unable to touch each other's records.
 */

const UNLOCK = "/api/research/early-access/unlock";
const ORDERS = "/api/research/early-access/orders";
const AGREEMENTS = "/api/research/early-access/agreements";

const EAC_SHAPE = /^eac_[a-f0-9]{32}$/;

/** A recorder and gate sharing one memory, so acceptance is per-customerRef. */
class RecordingAgreements implements EarlyAccessAgreementRecorder {
  private readonly byCustomer = new Set<string>();
  async record(input: { customerRef: string; kind: string; version: string }): Promise<"recorded" | "already_on_file"> {
    const key = `${input.customerRef}:${input.kind}:${input.version}`;
    if (this.byCustomer.has(key)) return "already_on_file";
    this.byCustomer.add(key);
    return "recorded";
  }
  gate(kind: string, version: string) {
    const store = this.byCustomer;
    return {
      async accepted(customerRef: string): Promise<boolean> {
        return store.has(`${customerRef}:${kind}:${version}`);
      },
    };
  }
}

type Harness = Readonly<{ app: Express; store: InMemoryEarlyAccessCommerceStore }>;

async function sessionCodeApp(
  overrides: Record<string, unknown> = {},
): Promise<Harness> {
  const app = express();
  app.use(express.json());
  const unit = cleanUnit();
  const store = new InMemoryEarlyAccessCommerceStore();
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    sessionIdentity: true,
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    orderNumber: sequentialOrderNumbers(),
    proofId: sequentialProofIds(),
    agreements: new StubAgreementGate(true),
    suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
    store,
    ...overrides,
  });
  return Object.freeze({ app, store });
}

async function unlock(app: Express): Promise<string> {
  const res = await request(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(res.status).toBe(200);
  const raw = res.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

describe("the code-session identity, through the real registration", () => {
  it("derives a distinct opaque eac_ identity per session, ignoring any body-supplied identity", async () => {
    const { app, store } = await sessionCodeApp();
    const cookieA = await unlock(app);
    const cookieB = await unlock(app);

    const placed = await request(app)
      .post(ORDERS)
      .set("Cookie", cookieA)
      // The forgery attempt: identity must come from the credential alone.
      .send({ ...ORDER_BODY, customerRef: "cust-attacker-0001", email: "attacker@example.com" });
    expect(placed.status).toBe(201);
    const orderNumber = placed.body.order.orderNumber as string;

    const stored = await store.placementByOrderNumber(orderNumber);
    expect(stored).not.toBeNull();
    expect(stored?.customerRef).toMatch(EAC_SHAPE);
    expect(stored?.customerRef).not.toBe("cust-attacker-0001");
    // Stamped with the session-code provenance, which the jsonb record
    // round-trips without any schema change.
    expect(stored?.bindingProvenance).toBe("session_code");
    // The contact travels on the order, for operations, and is echoed back
    // only on the purchaser's own view.
    expect(stored?.contact).toEqual(ORDER_CONTACT);
    expect(placed.body.order.contact).toEqual(ORDER_CONTACT);
    // The record stays OPAQUE about how the customer authenticated: no part
    // of the raw session credential is stored anywhere on the placement, and
    // the contact email never becomes an identity.
    const serialized = JSON.stringify(stored);
    for (const cookiePair of cookieA.split("; ")) {
      const credential = cookiePair.split("=")[1];
      if (credential && credential.length >= 8) {
        expect(serialized, "placement leaked the session credential").not.toContain(credential);
      }
    }
    expect(stored?.customerRef).not.toContain(ORDER_CONTACT.email);

    // Session B derives a DIFFERENT identity: same order under B's cookie is
    // not readable, and the refusal is indistinguishable from "no such order".
    const crossRead = await request(app)
      .get(`${ORDERS}/${orderNumber}`)
      .set("Cookie", cookieB);
    expect(crossRead.status).toBe(404);

    // A's own read works, with the contact present and the invoice attached.
    const ownRead = await request(app).get(`${ORDERS}/${orderNumber}`).set("Cookie", cookieA);
    expect(ownRead.status).toBe(200);
    expect(ownRead.body.order.contact).toEqual(ORDER_CONTACT);
  });

  it("keeps the same identity for the same live session across a process restart", async () => {
    // The durable pieces a redeploy keeps: the session repository and the
    // store. Everything else is rebuilt, exactly like a server restart.
    const repository = new InMemoryPrivateAccessSessionRepository();
    const store = new InMemoryEarlyAccessCommerceStore();
    const first = await sessionCodeApp({ repository, store });
    const cookie = await unlock(first.app);
    const placed = await request(first.app).post(ORDERS).set("Cookie", cookie).send({ ...ORDER_BODY });
    expect(placed.status).toBe(201);
    const orderNumber = placed.body.order.orderNumber as string;

    const second = await sessionCodeApp({ repository, store });
    const read = await request(second.app).get(`${ORDERS}/${orderNumber}`).set("Cookie", cookie);
    expect(read.status).toBe(200);
    expect(read.body.order.orderNumber).toBe(orderNumber);
  });

  it("refuses an unauthenticated caller outright", async () => {
    const { app } = await sessionCodeApp();
    const placed = await request(app).post(ORDERS).send({ ...ORDER_BODY });
    expect(placed.status).toBe(401);
    expect(placed.body.code).toBe("SESSION_REQUIRED");
  });

  it("keeps the legacy verified-link path in charge when the switch is off", async () => {
    // Same app, same store, same catalogue; the ONLY difference is the
    // switch. A bare unlocked session must not be a customer.
    const { app } = await sessionCodeApp({ sessionIdentity: undefined });
    const cookie = await unlock(app);
    const placed = await request(app).post(ORDERS).set("Cookie", cookie).send({ ...ORDER_BODY });
    expect(placed.status).toBe(403);
    expect(placed.body.code).toBe("IDENTITY_REQUIRED");
  });
});

describe("contact is a hard gate at placement", () => {
  it.each([
    ["absent", undefined],
    ["empty object", {}],
    ["bad email", { email: "not-an-email", phone: "+1 512 555 0100" }],
    ["bad phone", { email: "buyer@example.com", phone: "12" }],
  ])("refuses a placement whose contact is %s, durably writing nothing", async (_name, contact) => {
    const { app, store } = await sessionCodeApp();
    const cookie = await unlock(app);
    const body: Record<string, unknown> = { ...ORDER_BODY };
    if (contact === undefined) delete body.contact;
    else body.contact = contact;

    const placed = await request(app).post(ORDERS).set("Cookie", cookie).send(body);
    expect(placed.status).toBe(400);
    expect(placed.body.code).toBe("REQUEST_INVALID");
    expect(placed.body.field).toBe("contact");
    expect(await store.placementByIdempotencyKey(ORDER_BODY.idempotencyKey)).toBeNull();
  });

  it("contact is data, never authorization: it cannot substitute for a session", async () => {
    const { app } = await sessionCodeApp({ sessionIdentity: undefined });
    const cookie = await unlock(app);
    // Legacy mode, no bound identity: a fully valid contact changes nothing.
    const placed = await request(app).post(ORDERS).set("Cookie", cookie).send({ ...ORDER_BODY });
    expect(placed.status).toBe(403);
    expect(placed.body.code).toBe("IDENTITY_REQUIRED");
  });
});

describe("money and idempotency under the code-session identity", () => {
  it("answers one cent wrong with PRICE_CHANGED and writes nothing durable", async () => {
    const { app, store } = await sessionCodeApp();
    const cookie = await unlock(app);
    const placed = await request(app)
      .post(ORDERS)
      .set("Cookie", cookie)
      .send({ ...ORDER_BODY, expectedUnitPriceCents: ORDER_BODY.expectedUnitPriceCents - 1 });
    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("PRICE_CHANGED");
    expect(await store.placementByIdempotencyKey(ORDER_BODY.idempotencyKey)).toBeNull();
  });

  it("replays the same key for the same request, and refuses the same key for a changed one", async () => {
    const { app } = await sessionCodeApp();
    const cookie = await unlock(app);

    const first = await request(app).post(ORDERS).set("Cookie", cookie).send({ ...ORDER_BODY });
    expect(first.status).toBe(201);
    expect(first.body.replayed).toBe(false);

    const replay = await request(app).post(ORDERS).set("Cookie", cookie).send({ ...ORDER_BODY });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.order.orderNumber).toBe(first.body.order.orderNumber);

    const conflicted = await request(app)
      .post(ORDERS)
      .set("Cookie", cookie)
      .send({ ...ORDER_BODY, quantity: 1 });
    expect(conflicted.status).toBe(409);
    expect(conflicted.body.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("a second SESSION replaying the same key is a conflict, never a leak", async () => {
    const { app } = await sessionCodeApp();
    const cookieA = await unlock(app);
    const cookieB = await unlock(app);

    const first = await request(app).post(ORDERS).set("Cookie", cookieA).send({ ...ORDER_BODY });
    expect(first.status).toBe(201);

    // Same key, same body, DIFFERENT derived customer: not a replay.
    const stolen = await request(app).post(ORDERS).set("Cookie", cookieB).send({ ...ORDER_BODY });
    expect(stolen.status).toBe(409);
    expect(stolen.body.code).toBe("IDEMPOTENCY_CONFLICT");
  });
});

describe("agreement standing is per derived identity, with no verification token anywhere", () => {
  it("records A's acceptance for A alone, while B remains unaccepted", async () => {
    const agreements = new RecordingAgreements();
    const required = [{ kind: "early_access_terms", version: "v1" }] as const;
    const { app } = await sessionCodeApp({
      agreements: agreements.gate("early_access_terms", "v1"),
      agreementRecorder: agreements,
      requiredAgreements: required,
    });
    const cookieA = await unlock(app);
    const cookieB = await unlock(app);

    // No verification request, no token redemption, anywhere in this flow.
    const before = await request(app).get(AGREEMENTS).set("Cookie", cookieA);
    expect(before.status).toBe(200);
    expect(before.body.accepted).toBe(false);

    const accept = await request(app)
      .post(`${AGREEMENTS}/accept`)
      .set("Cookie", cookieA)
      .send({ kind: "early_access_terms", version: "v1" });
    expect(accept.status).toBe(200);
    expect(accept.body.ok).toBe(true);

    const afterA = await request(app).get(AGREEMENTS).set("Cookie", cookieA);
    expect(afterA.body.accepted).toBe(true);

    const afterB = await request(app).get(AGREEMENTS).set("Cookie", cookieB);
    expect(afterB.body.accepted).toBe(false);
  });
});

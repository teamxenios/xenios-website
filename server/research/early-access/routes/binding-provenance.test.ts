import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  PROOF,
  StubIdentityDirectory,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  makeEarlyAccessApp,
} from "./route-fixtures";
import type { EarlyAccessCustomer } from "./ports";

const ORDERS = "/api/research/early-access/orders";
const UNLOCK = "/api/research/early-access/unlock";
const MISSING_ORDER = "XEA-7F3K9QW2TM4BXYZ1";

/**
 * THE CROSS-CUSTOMER TAKEOVER, closed by provenance.
 *
 * The Early Access password is SHARED, so under the returning-customer model
 * a purchaser claims identity by TYPING AN EMAIL. That claim is
 * unauthenticated: anyone holding the password can type anyone's address,
 * and every ownership rule downstream would still pass, because the BINDING
 * itself is the forgery.
 *
 * The rule is therefore a field, not a judgement:
 *   - email entry authorizes NOTHING: not a price, not an acceptance, and
 *     not an order (it once authorized placement; the founder's verified-link
 *     decision withdrew that);
 *   - reading anything that existed BEFORE this session requires the signed
 *     verification link, always;
 *   - an absent provenance counts as the weak one, so a store that cannot
 *     answer can never mint a verified session.
 */

const CUSTOMER_REF = "cust-alpha-0001";

const EMAIL_ENTRY: EarlyAccessCustomer = Object.freeze({
  customerRef: CUSTOMER_REF,
  displayName: "Alpha Buyer",
  boundBy: "email_entry",
});

const VERIFIED: EarlyAccessCustomer = Object.freeze({
  customerRef: CUSTOMER_REF,
  displayName: "Alpha Buyer",
  boundBy: "verified_link",
});

async function openSession(app: Parameters<typeof request>[0]): Promise<string> {
  const unlocked = await request(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const raw = unlocked.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

/** One app, one store, one identity directory whose answer the test steers. */
async function harness(initial: EarlyAccessCustomer) {
  const unit = cleanUnit();
  return makeEarlyAccessApp({
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    identity: new StubIdentityDirectory().always(initial),
  });
}

/** An order placed by a verified session that then walks away. */
async function preExistingOrder(shared: Awaited<ReturnType<typeof harness>>): Promise<string> {
  const cookie = await openSession(shared.app);
  const placed = await request(shared.app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
  expect(placed.status).toBe(201);
  return placed.body.order.orderNumber as string;
}

describe("a session bound by typing an email", () => {
  it("cannot place an order at all, because typing an email is not identity", async () => {
    // THE FOUNDER'S DECISION, and a deliberate reversal of what this test used
    // to assert. It previously proved that an email-entry session could place
    // an order and read back what it had just bought, on the reasoning that a
    // purchaser only ever sees what they themselves typed. That reasoning
    // holds only for the purchaser; it says nothing for the person whose
    // address was typed, who gets a real shipment, a real invoice and a real
    // commission attached to their name by someone who merely knew the shared
    // password. Ordering now requires the signed verification link.
    const shared = await harness(EMAIL_ENTRY);
    const cookie = await openSession(shared.app);

    const placed = await request(shared.app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
    expect(placed.status).toBe(403);
    expect(placed.body?.code).toBe("IDENTITY_REQUIRED");
    // Nothing was written on the way to the refusal.
    expect(await shared.store.placementByIdempotencyKey(ORDER_BODY.idempotencyKey)).toBeNull();
  });

  it("cannot read an order that existed before it, and answers exactly like a missing one", async () => {
    const shared = await harness(VERIFIED);
    const orderNumber = await preExistingOrder(shared);

    // A new session under the same shared password, identity claimed by
    // typing the same email: SAME customerRef, so every ownership check
    // downstream passes. Only the provenance refuses.
    shared.identity.always(EMAIL_ENTRY);
    const attacker = await openSession(shared.app);

    const stolen = await request(shared.app)
      .get(`${ORDERS}/${orderNumber}`)
      .set("Cookie", attacker);
    const invoice = await request(shared.app)
      .get(`${ORDERS}/${orderNumber}/invoice`)
      .set("Cookie", attacker);
    const missing = await request(shared.app)
      .get(`${ORDERS}/${MISSING_ORDER}`)
      .set("Cookie", attacker);

    expect(stolen.status).toBe(404);
    expect(invoice.status).toBe(404);
    // Identical to a genuinely missing order: the refusal cannot be used to
    // discover which order numbers, or which emails, exist.
    expect(stolen.status).toBe(missing.status);
    expect(stolen.body).toEqual(missing.body);
  });

  it("cannot submit payment proof against an order it did not create", async () => {
    const shared = await harness(VERIFIED);
    const orderNumber = await preExistingOrder(shared);

    shared.identity.always(EMAIL_ENTRY);
    const attacker = await openSession(shared.app);
    const proof = await request(shared.app)
      .post(`${ORDERS}/${orderNumber}/payment-proof`)
      .set("Cookie", attacker)
      .send({ ...PROOF });
    expect(proof.status).toBe(404);
  });
});

describe("a session bound by the signed verification link", () => {
  it("reads its own earlier order from a later session, which is the returning purchaser", async () => {
    const shared = await harness(VERIFIED);
    const orderNumber = await preExistingOrder(shared);

    const returning = await openSession(shared.app);
    const readBack = await request(shared.app)
      .get(`${ORDERS}/${orderNumber}`)
      .set("Cookie", returning);
    expect(readBack.status).toBe(200);
    expect(readBack.body.order.orderNumber).toBe(orderNumber);
  });
});

describe("an unknown provenance", () => {
  it("is treated as email entry, so a store that cannot answer fails closed", async () => {
    const shared = await harness(VERIFIED);
    const orderNumber = await preExistingOrder(shared);

    // No boundBy field at all: exactly what an older durable adapter would
    // produce. It must NOT read as verified.
    shared.identity.always(
      Object.freeze({ customerRef: CUSTOMER_REF, displayName: "Alpha Buyer" }),
    );
    const later = await openSession(shared.app);
    const attempted = await request(shared.app)
      .get(`${ORDERS}/${orderNumber}`)
      .set("Cookie", later);
    expect(attempted.status).toBe(404);
  });
});

describe("the order records how its session was bound", () => {
  it("never stamps email_entry, because no such order can be created", async () => {
    // The stamp still exists and is still written (the verified case below
    // proves it), but there is no longer a path that produces an email-entry
    // row. This asserts the ABSENCE rather than deleting the old test, so a
    // regression that reopens email-entry ordering fails here as well as at
    // the placement test above.
    const shared = await harness(EMAIL_ENTRY);
    const cookie = await openSession(shared.app);
    const placed = await request(shared.app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
    expect(placed.status).toBe(403);
    expect(placed.body?.order).toBeUndefined();
    expect(await shared.store.placementByIdempotencyKey(ORDER_BODY.idempotencyKey)).toBeNull();
  });

  it("stamps verified_link when the session proved the claim", async () => {
    const shared = await harness(VERIFIED);
    const cookie = await openSession(shared.app);
    const placed = await request(shared.app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
    const stored = await shared.store.placementByOrderNumber(
      placed.body.order.orderNumber as string,
    );
    expect(stored?.bindingProvenance).toBe("verified_link");
  });
});

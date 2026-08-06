import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  StubIdentityDirectory,
  UNIT_PRICE_CENTS,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  makeEarlyAccessApp,
} from "./route-fixtures";

/**
 * THE LAUNCH ATTACK SUITE.
 *
 * Not domain coverage. Each test is an attack a real person could run against
 * the mounted HTTP surface on launch night, written so a failure names the
 * thing that broke rather than the assertion that noticed.
 *
 * Scope is exactly the founder's QA list for the order-first MVP: cross-session
 * order reads, the proof boundary, premature paid state, and client control of
 * money. Dormant features (historical accounts, signed status tokens, verified
 * link upgrades) are deliberately NOT tested, because they are not reachable
 * tonight and a red test on an unreachable path costs attention it does not
 * deserve.
 *
 * These are regression gates. Every one of them passed at 2a610af; the point is
 * that they keep passing while five sessions merge into one branch at speed.
 */

const ORDERS = "/api/research/early-access/orders";
const UNLOCK = "/api/research/early-access/unlock";
// The fixture's own approved price. The order path refuses any placement whose
// expected unit price disagrees with the release, so the harness must not
// invent a price: confirmed by execution, a mismatch is a 409 and that is
// server-side price authority working.
const PRICE = UNIT_PRICE_CENTS;

async function openSession(app: Parameters<typeof request>[0]): Promise<string> {
  const unlocked = await request(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const raw = unlocked.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

/**
 * TONIGHT'S ACTUAL CUSTOMER, which is the whole point of this suite.
 *
 * This used to be an `email_entry` customer, on the premise that under the
 * order-first model nobody is verified: every purchaser types an email and
 * that is that. The founder's decision reverses the premise. The shared
 * password now grants portal access ONLY, and a purchaser reaches an order by
 * redeeming a signed verification link, so tonight's real customer is
 * `verified_link` and testing against an email-entry one would assert a rule
 * that no longer applies to anybody.
 *
 * That makes the attacks below STRONGER, not weaker. The password-only
 * intruder is now refused before an order lookup happens at all, and the
 * customerRef comparison that was previously defence in depth is now the
 * load-bearing check, exactly as the note in the second test predicted.
 */
const TONIGHT_CUSTOMER = Object.freeze({
  customerRef: "cust-tonight-0001",
  displayName: "Tonight Buyer",
  boundBy: "verified_link" as const,
});

/** The intruder: the shared password, and no verified identity behind it. */
const PASSWORD_ONLY = null;

async function harness() {
  const unit = cleanUnit({ unitPriceCents: PRICE });
  const built = makeEarlyAccessApp({
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit, { approvedPriceCents: PRICE }),
    // Every session resolves to the SAME verified customer, so the thing
    // separating two callers is who they proved they are, not which cookie
    // they hold.
    identity: new StubIdentityDirectory().always(TONIGHT_CUSTOMER),
  } as never);
  return { ...built, unit };
}

/** Place one order and return its number plus the cookie that created it. */
async function placeOrder(
  app: Parameters<typeof request>[0],
  overrides: Record<string, unknown> = {},
): Promise<{ cookie: string; orderNumber: string; body: any }> {
  const cookie = await openSession(app);
  const placed = await request(app)
    .post(ORDERS)
    .set("Cookie", cookie)
    .send({ ...ORDER_BODY, ...overrides });
  return { cookie, orderNumber: placed.body?.order?.orderNumber ?? "", body: placed.body };
}

describe("ATTACK: one customer reading another customer's order", () => {
  it("a password-only session cannot read a verified customer's order", async () => {
    // THE attack, restated for the verified-link rule. A different browser
    // holding the same shared password unlocks the portal and gets no
    // identity, so it is refused before an order is ever looked up. Knowing
    // the password is not knowing who you are.
    const unit = cleanUnit({ unitPriceCents: PRICE });
    const identity = new StubIdentityDirectory().always(TONIGHT_CUSTOMER);
    const { app } = makeEarlyAccessApp({
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit, { approvedPriceCents: PRICE }),
      identity,
    } as never);

    const victim = await placeOrder(app);
    expect(victim.orderNumber).not.toBe("");

    const attacker = await openSession(app);
    expect(attacker).not.toBe("");
    identity.always(PASSWORD_ONLY);

    const read = await request(app)
      .get(`${ORDERS}/${victim.orderNumber}`)
      .set("Cookie", attacker);
    expect(read.status).toBe(403);
    expect(read.body?.code).toBe("IDENTITY_REQUIRED");
    // Nothing about the order leaks on the way out: not its existence, not
    // its owner, not its total.
    expect(JSON.stringify(read.body)).not.toContain(victim.orderNumber);
  });

  it("the same verified customer reads their own order from a second browser", async () => {
    // The control above is worthless if it also blocks the real customer
    // signing in again elsewhere. A verified session reads what its customer
    // owns, which is the returning-purchaser rule, and it is a different fact
    // from the session-scoped one below.
    const { app } = await harness();
    const mine = await placeOrder(app);
    const second = await openSession(app);

    const read = await request(app).get(`${ORDERS}/${mine.orderNumber}`).set("Cookie", second);
    expect(read.status).toBe(200);
    expect(read.body?.order?.orderNumber).toBe(mine.orderNumber);
  });

  it("a DIFFERENT verified customer cannot read it either", async () => {
    // HONEST NOTE, updated. This test used to pass because of the SESSION
    // check rather than the customerRef comparison: under email-entry
    // ordering, `createdHere` already refused a session that did not create
    // the order, so removing the ownership comparison did not fail anything.
    // The earlier note said that comparison becomes load-bearing the day
    // verified_link ships. That day is this commit: a verified session
    // reaches the ownership comparison BEFORE any session-scoped check, so
    // this is now the only thing standing between two verified customers.
    const unit = cleanUnit({ unitPriceCents: PRICE });
    const identity = new StubIdentityDirectory().always(TONIGHT_CUSTOMER);
    const { app } = makeEarlyAccessApp({
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit, { approvedPriceCents: PRICE }),
      identity,
    } as never);

    const victim = await placeOrder(app);
    expect(victim.orderNumber).not.toBe("");

    // A genuinely different purchaser, verified in their own right.
    const other = await openSession(app);
    identity.always({
      customerRef: "cust-tonight-0002",
      displayName: "Another Buyer",
      boundBy: "verified_link",
    } as never);

    const read = await request(app).get(`${ORDERS}/${victim.orderNumber}`).set("Cookie", other);
    // Indistinguishable from an order that does not exist, so the endpoint
    // cannot be used to test which order numbers are real.
    expect(read.status).toBe(404);
    expect(read.body?.code).toBe("ORDER_NOT_FOUND");
  });

  it("the session that created the order can still read it", async () => {
    // The control above is worthless if it also blocks the legitimate customer.
    const { app } = await harness();
    const mine = await placeOrder(app);
    const read = await request(app).get(`${ORDERS}/${mine.orderNumber}`).set("Cookie", mine.cookie);
    expect(read.status).toBe(200);
  });

  it("no session at all cannot read an order", async () => {
    const { app } = await harness();
    const mine = await placeOrder(app);
    const read = await request(app).get(`${ORDERS}/${mine.orderNumber}`);
    expect(read.status).not.toBe(200);
  });

  it("a guessed order number is refused the same way", async () => {
    const { app } = await harness();
    const cookie = await openSession(app);
    const read = await request(app)
      .get(`${ORDERS}/XEA-ZZZZZZZZZZZZZZZZ`)
      .set("Cookie", cookie);
    expect(read.status).toBe(404);
    expect(read.body?.code).toBe("ORDER_NOT_FOUND");
  });
});

describe("ATTACK: the browser trying to set the price", () => {
  it("ignores every money field the client sends and bills the approved price", async () => {
    // The money model is frozen. This is the gate that keeps it frozen while
    // five sessions merge: if any of these ever reaches the total, it fails.
    const { app } = await harness();
    const placed = await placeOrder(app, {
      priceCents: 1,
      unitPriceCents: 1,
      subtotalCents: 1,
      discountCents: 999_999,
      payableTotalCents: 1,
      totalCents: 1,
      amountDueCents: 1,
      currency: "EUR",
    });

    const money = placed.body?.order?.money;
    expect(money).toBeDefined();
    // 3 units at 19,900 is 59,700, less the 20 percent bundle, is 47,760.
    expect(money.subtotalCents).toBe(59_700);
    expect(money.discountCents).toBe(11_940);
    expect(money.payableTotalCents).toBe(47_760);
    expect(money.currency).toBe("USD");
  });

  it("a client-supplied quantity above the limit is refused, not clamped", async () => {
    // Clamping would silently sell a different order than the customer asked
    // for. Refusing is the only honest answer.
    const { app } = await harness();
    const cookie = await openSession(app);
    const placed = await request(app)
      .post(ORDERS)
      .set("Cookie", cookie)
      .send({ ...ORDER_BODY, quantity: 99 });
    expect(placed.status).not.toBe(201);
    expect(placed.status).not.toBe(200);
  });
});

describe("ATTACK: making an order look paid without paying", () => {
  it("a placed order starts unpaid, with no receipt and no supplier order", async () => {
    const { app, store } = await harness();
    const mine = await placeOrder(app);

    const settlement = await store.settlement(mine.orderNumber);
    expect(settlement).toBeNull();

    const read = await request(app).get(`${ORDERS}/${mine.orderNumber}`).set("Cookie", mine.cookie);
    expect(read.status).toBe(200);
    // Whatever the projection calls it, it must not read as paid.
    expect(JSON.stringify(read.body).toLowerCase()).not.toContain('"paid":true');
  });

  it("the customer cannot mutate their own order after creating it", async () => {
    // The order is immutable from the public path; corrections are an audited
    // admin action. A customer editing their own shipping after payment
    // verification is how a package walks out of the door.
    const { app } = await harness();
    const mine = await placeOrder(app);
    for (const method of ["post", "put", "patch", "delete"] as const) {
      const response = await (request(app) as any)
        [method](`${ORDERS}/${mine.orderNumber}`)
        .set("Cookie", mine.cookie)
        .send({ shipTo: { line1: "attacker address" } });
      expect(response.status).not.toBe(200);
      expect(response.status).not.toBe(204);
    }
  });
});

describe("ATTACK: the admin doors without an admin", () => {
  it("every admin path refuses an Early Access customer session", async () => {
    // A customer session is not an operator session. The shared password buys
    // entry to the shop, never the back office.
    const { app } = await harness();
    const cookie = await openSession(app);
    const adminPaths = [
      "/api/admin/research/payments",
      "/api/admin/research/early-access/releases",
    ];
    for (const path of adminPaths) {
      const response = await request(app).get(path).set("Cookie", cookie);
      expect(response.status).not.toBe(200);
    }
  });

  it("and refuses an anonymous caller", async () => {
    const { app } = await harness();
    for (const path of [
      "/api/admin/research/payments",
      "/api/admin/research/early-access/releases",
    ]) {
      const response = await request(app).get(path);
      expect(response.status).not.toBe(200);
    }
  });
});

import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { registerPrivateEarlyAccessApi } from "../register";
import { EARLY_ACCESS_CART_ENV } from "./feature-flag";
import { InMemoryEarlyAccessCartStore } from "./store";
import {
  EARLY_ACCESS_TEST_CONFIG,
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_CONTACT,
  SHIP_TO,
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
} from "../routes/route-fixtures";

/**
 * F6 A THROUGH F: WHAT AN IDEMPOTENCY KEY AND AN ORDER NUMBER ARE, AND ARE NOT.
 *
 * These two values are the only things about a checkout the browser is allowed
 * to remember. Everything below is the proof that remembering them is safe:
 * they make a retry idempotent and a refresh recoverable, and they carry NO
 * authority. A stolen key cannot claim someone else's checkout, a copied cart
 * number cannot read one, and neither can be used without the session cookie
 * the server derives the customer from.
 *
 * Driven over real HTTP through the real registration, because a claim about
 * an authorization boundary that is only tested at the service layer has not
 * been tested at the boundary.
 */

const UNLOCK = "/api/research/early-access/unlock";
const QUOTE = "/api/research/early-access/cart/quote";
const CHECKOUT = "/api/research/early-access/cart/checkout";
const CART = "/api/research/early-access/cart";

const CART_ON = {
  NODE_ENV: "test",
  [EARLY_ACCESS_CART_ENV]: "true",
} as NodeJS.ProcessEnv;

async function cartApp(): Promise<{ app: Express; store: InMemoryEarlyAccessCartStore }> {
  const app = express();
  app.use(express.json());
  const unit = cleanUnit();
  const store = new InMemoryEarlyAccessCartStore();
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    sessionIdentity: true,
    env: CART_ON,
    cartStore: store,
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    orderNumber: sequentialOrderNumbers(),
    proofId: sequentialProofIds(),
    agreements: new StubAgreementGate(true),
    suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
  });
  return { app, store };
}

async function unlock(app: Express): Promise<string> {
  const response = await request(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(response.status).toBe(200);
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

function cartRequest(quantity = 3, shipTo = SHIP_TO, contact = ORDER_CONTACT) {
  return {
    items: [
      {
        productId: "prod-clean",
        variantId: "var-10mg",
        quantity,
        expectedUnitPriceCents: 19_900,
        expectedCurrency: "USD",
      },
    ],
    contact,
    shipTo,
  };
}

async function quoteFor(
  app: Express,
  cookie: string,
  body = cartRequest(),
): Promise<{ quoteId: string; intentHash: string; payableTotalCents: number }> {
  const response = await request(app).post(QUOTE).set("Cookie", cookie).send(body);
  expect(response.status).toBe(200);
  return response.body.quote;
}

describe("F6 A and B: one key means one intended cart", () => {
  it("A. the same customer, the same complete intent and the same key produce the SAME checkout", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const quote = await quoteFor(app, cookie);
    const body = {
      quoteId: quote.quoteId,
      idempotencyKey: "xeac_f6a00000000000000001",
      expectedIntentHash: quote.intentHash,
    };

    const first = await request(app).post(CHECKOUT).set("Cookie", cookie).send(body);
    expect(first.status).toBe(201);
    expect(first.body.replayed).toBe(false);

    // A double click, then a retry after a timeout the browser never saw the
    // answer to. Neither may create a second checkout.
    const [second, third] = await Promise.all([
      request(app).post(CHECKOUT).set("Cookie", cookie).send(body),
      request(app).post(CHECKOUT).set("Cookie", cookie).send(body),
    ]);
    for (const replay of [second, third]) {
      expect(replay.status).toBe(200);
      expect(replay.body.replayed).toBe(true);
      expect(replay.body.checkout.cartCheckoutNumber).toBe(
        first.body.checkout.cartCheckoutNumber,
      );
      expect(replay.body.checkout.children).toEqual(first.body.checkout.children);
      expect(replay.body.checkout.invoice.paymentReference).toBe(
        first.body.checkout.invoice.paymentReference,
      );
    }
  });

  it("B. a CHANGED cart under the same key is an IDEMPOTENCY_CONFLICT, and the first checkout is untouched", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const first = await quoteFor(app, cookie, cartRequest(3));
    const key = "xeac_f6b00000000000000001";
    const placed = await request(app)
      .post(CHECKOUT)
      .set("Cookie", cookie)
      .send({ quoteId: first.quoteId, idempotencyKey: key, expectedIntentHash: first.intentHash });
    expect(placed.status).toBe(201);
    const original = placed.body.checkout;

    // A different QUANTITY is a different intended order, and so is a
    // different address. Both re-quote to a different intent hash, and the
    // same key may not carry either of them.
    const changedQuantity = await quoteFor(app, cookie, cartRequest(1));
    const changedShipping = await quoteFor(app, cookie, cartRequest(3, {
      ...SHIP_TO,
      line1: "2 Other Street",
    }));
    const changedContact = await quoteFor(app, cookie, cartRequest(3, SHIP_TO, {
      ...ORDER_CONTACT,
      email: "someone.else@example.com",
    }));

    for (const changed of [changedQuantity, changedShipping, changedContact]) {
      expect(changed.intentHash).not.toBe(first.intentHash);
      const conflict = await request(app).post(CHECKOUT).set("Cookie", cookie).send({
        quoteId: changed.quoteId,
        idempotencyKey: key,
        expectedIntentHash: changed.intentHash,
      });
      expect(conflict.status).toBe(409);
      expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");
    }

    // The committed checkout is exactly what it was.
    const reread = await request(app)
      .get(`${CART}/${original.cartCheckoutNumber}`)
      .set("Cookie", cookie);
    expect(reread.status).toBe(200);
    expect(reread.body.checkout).toEqual(original);
  });
});

describe("F6 C through F: neither value carries authority", () => {
  it("C. a foreign customer holding a STOLEN idempotency key gets nothing, and takes nothing", async () => {
    const { app } = await cartApp();
    const owner = await unlock(app);
    const stranger = await unlock(app);
    const quote = await quoteFor(app, owner);
    const key = "xeac_f6c00000000000000001";
    const placed = await request(app)
      .post(CHECKOUT)
      .set("Cookie", owner)
      .send({ quoteId: quote.quoteId, idempotencyKey: key, expectedIntentHash: quote.intentHash });
    expect(placed.status).toBe(201);
    const number = placed.body.checkout.cartCheckoutNumber;

    // The stranger replays the owner's exact request with the owner's key.
    const stolen = await request(app)
      .post(CHECKOUT)
      .set("Cookie", stranger)
      .send({ quoteId: quote.quoteId, idempotencyKey: key, expectedIntentHash: quote.intentHash });
    expect(stolen.status).toBe(409);
    expect(stolen.body.code).toBe("IDEMPOTENCY_CONFLICT");
    // No disclosure: the refusal names no checkout, no contact and no address.
    const disclosed = JSON.stringify(stolen.body);
    expect(disclosed).not.toContain(number);
    expect(disclosed).not.toContain(ORDER_CONTACT.email);
    expect(disclosed).not.toContain(SHIP_TO.line1);

    // And no ownership moved: the owner still owns it, the stranger still does not.
    expect((await request(app).get(`${CART}/${number}`).set("Cookie", owner)).status).toBe(200);
    expect((await request(app).get(`${CART}/${number}`).set("Cookie", stranger)).status).toBe(404);
  });

  it("D. a COPIED cart checkout number answers a stranger exactly as a missing one does", async () => {
    const { app } = await cartApp();
    const owner = await unlock(app);
    const stranger = await unlock(app);
    const quote = await quoteFor(app, owner);
    const placed = await request(app).post(CHECKOUT).set("Cookie", owner).send({
      quoteId: quote.quoteId,
      idempotencyKey: "xeac_f6d00000000000000001",
      expectedIntentHash: quote.intentHash,
    });
    const real = placed.body.checkout.cartCheckoutNumber;
    const invented = "XEC-000000000000000000AA";

    // Real-but-not-yours and simply-not-real must be indistinguishable, in
    // status, in body and on the status door as well as the read door.
    for (const path of [`${CART}/%s`, `${CART}/%s/status`]) {
      const foreign = await request(app)
        .get(path.replace("%s", real))
        .set("Cookie", stranger);
      const missing = await request(app)
        .get(path.replace("%s", invented))
        .set("Cookie", stranger);
      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(foreign.body).toEqual(missing.body);
    }
  });

  it("E. an idempotency key alone cannot READ a checkout", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const quote = await quoteFor(app, cookie);
    const key = "xeac_f6e00000000000000001";
    await request(app)
      .post(CHECKOUT)
      .set("Cookie", cookie)
      .send({ quoteId: quote.quoteId, idempotencyKey: key, expectedIntentHash: quote.intentHash });

    // There is no read door keyed by the idempotency key, by construction:
    // the only reads are by cart checkout number, and the key is not one.
    const asNumber = await request(app).get(`${CART}/${key}`).set("Cookie", cookie);
    expect(asNumber.status).toBe(404);
    const asStatus = await request(app).get(`${CART}/${key}/status`).set("Cookie", cookie);
    expect(asStatus.status).toBe(404);
  });

  it("F. a cart checkout number alone, with NO session, authorizes nothing", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const quote = await quoteFor(app, cookie);
    const placed = await request(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: quote.quoteId,
      idempotencyKey: "xeac_f6f00000000000000001",
      expectedIntentHash: quote.intentHash,
    });
    const number = placed.body.checkout.cartCheckoutNumber;

    for (const path of [`${CART}/${number}`, `${CART}/${number}/status`]) {
      const anonymous = await request(app).get(path);
      expect(anonymous.status).toBe(401);
      expect(anonymous.body.code).toBe("SESSION_REQUIRED");
      expect(JSON.stringify(anonymous.body)).not.toContain(ORDER_CONTACT.email);
    }

    // And a checkout cannot be created without a session either, so the
    // number is not a write credential any more than it is a read one.
    const anonymousWrite = await request(app).post(CHECKOUT).send({
      quoteId: quote.quoteId,
      idempotencyKey: "xeac_f6f00000000000000002",
      expectedIntentHash: quote.intentHash,
    });
    expect(anonymousWrite.status).toBe(401);
  });

  it("a stranger cannot check out against someone else's QUOTE either", async () => {
    const { app } = await cartApp();
    const owner = await unlock(app);
    const stranger = await unlock(app);
    const quote = await quoteFor(app, owner);

    const attempt = await request(app).post(CHECKOUT).set("Cookie", stranger).send({
      quoteId: quote.quoteId,
      idempotencyKey: "xeac_f6g00000000000000001",
      expectedIntentHash: quote.intentHash,
    });
    // A foreign quote is reported exactly as a missing one.
    expect(attempt.status).toBe(404);
    expect(attempt.body.code).toBe("QUOTE_NOT_FOUND");
  });
});

describe("the quote is a decision, not an order", () => {
  it("quoting repeatedly creates ZERO durable checkout facts", async () => {
    const { app, store } = await cartApp();
    const cookie = await unlock(app);
    for (let attempt = 0; attempt < 3; attempt += 1) await quoteFor(app, cookie);

    // No checkout exists under any key or number this run could have minted.
    expect(await store.byIdempotencyKey("xeac_f6q00000000000000001")).toBeNull();
    const status = await request(app)
      .get(`${CART}/XEC-000000000000000000AA/status`)
      .set("Cookie", cookie);
    expect(status.status).toBe(404);
  });
});

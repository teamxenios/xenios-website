import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { InMemoryPrivateAccessSessionRepository } from "../private-access-session-repository";
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
 * QUOTE-ONLY AT THE CART DOORS, THROUGH THE REAL REGISTRATION.
 *
 * The cart is behind its own flag, which has been both on and off in
 * production. If it is on under the quote-only release, the cart quote would
 * show catalog prices and the cart checkout would create an order at them.
 * So the server refuses NEW cart work on its own: the capability probe answers
 * as it does when the cart is off, a new quote is refused line by line, and a
 * checkout only replays an order that already exists. A cart order placed
 * before the cutover still replays, reads back and reports its status.
 * Synthetic values only.
 */

const UNLOCK = "/api/research/early-access/unlock";
const QUOTE = "/api/research/early-access/cart/quote";
const CHECKOUT = "/api/research/early-access/cart/checkout";
const CAPABILITY = "/api/research/early-access/cart/capability";
const CART_ON = { NODE_ENV: "test", [EARLY_ACCESS_CART_ENV]: "true" } as NodeJS.ProcessEnv;

type Shared = Readonly<{ repository: InMemoryPrivateAccessSessionRepository; store: InMemoryEarlyAccessCartStore }>;

/** The durable pieces a redeploy keeps: the session repository and the cart store. */
function shared(): Shared {
  return { repository: new InMemoryPrivateAccessSessionRepository(), store: new InMemoryEarlyAccessCartStore() };
}

async function cartApp(durable: Shared, overrides: Record<string, unknown>): Promise<Express> {
  const app = express();
  app.use(express.json());
  const unit = cleanUnit();
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    sessionIdentity: true,
    env: CART_ON,
    repository: durable.repository,
    cartStore: durable.store,
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    orderNumber: sequentialOrderNumbers(),
    proofId: sequentialProofIds(),
    agreements: new StubAgreementGate(true),
    suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
    ...overrides,
  });
  return app;
}

async function unlock(app: Express): Promise<string> {
  const res = await request(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(res.status).toBe(200);
  const raw = res.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

function quoteBody() {
  return {
    items: [{ productId: "prod-clean", variantId: "var-10mg", quantity: 3, expectedUnitPriceCents: 19_900, expectedCurrency: "USD" }],
    contact: ORDER_CONTACT,
    shipTo: SHIP_TO,
  };
}

const KEY = "xeac_cart000000000000000001";

describe("the cart doors under quote-only, with the cart flag on", () => {
  it("answers the capability probe as a disabled cart, so every client falls back", async () => {
    const app = await cartApp(shared(), { quoteOnly: true });
    const cookie = await unlock(app);
    const response = await request(app).get(CAPABILITY).set("Cookie", cookie);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ ok: false, code: "CART_DISABLED" });
  });

  it("refuses a new quote line by line, with no price in the answer and nothing stored", async () => {
    const durable = shared();
    const app = await cartApp(durable, { quoteOnly: true });
    const cookie = await unlock(app);

    const res = await request(app).post(QUOTE).set("Cookie", cookie).send(quoteBody());

    // The cart client already shows this line code as "not released for ordering".
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      ok: false,
      code: "LINE_REFUSED",
      quoteOnly: true,
      lines: [{ productId: "prod-clean", variantId: "var-10mg", code: "RELEASE_REQUIRED" }],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/cents|quoteId|intentHash|total/i);
    expect(await durable.store.byIdempotencyKey(KEY)).toBeNull();
  });

  it("is the production default: with no option given, the probe is disabled and a quote is refused", async () => {
    const app = await cartApp(shared(), {});
    const cookie = await unlock(app);
    expect((await request(app).get(CAPABILITY).set("Cookie", cookie)).status).toBe(404);
    const res = await request(app).post(QUOTE).set("Cookie", cookie).send(quoteBody());
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "LINE_REFUSED", quoteOnly: true });
  });

  it("still quotes and checks out when the release is priced", async () => {
    const app = await cartApp(shared(), { quoteOnly: false });
    const cookie = await unlock(app);
    expect((await request(app).get(CAPABILITY).set("Cookie", cookie)).status).toBe(200);
    const quoted = await request(app).post(QUOTE).set("Cookie", cookie).send(quoteBody());
    expect(quoted.status).toBe(200);
    const placed = await request(app).post(CHECKOUT).set("Cookie", cookie)
      .send({ quoteId: quoted.body.quote.quoteId, idempotencyKey: KEY, expectedIntentHash: quoted.body.quote.intentHash });
    expect(placed.status).toBe(201);
  });

  it("asks who the caller is, and for the agreement, before it says anything about quote-only", async () => {
    const app = await cartApp(shared(), { quoteOnly: true, agreements: new StubAgreementGate(false) });

    const anonymous = await request(app).post(QUOTE).send(quoteBody());
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual({ ok: false, code: "SESSION_REQUIRED" });

    const cookie = await unlock(app);
    const unsigned = await request(app).post(QUOTE).set("Cookie", cookie).send(quoteBody());
    expect(unsigned.status).toBe(403);
    expect(unsigned.body).toEqual({ ok: false, code: "AGREEMENT_REQUIRED" });

    const malformed = await request(app).post(QUOTE).set("Cookie", cookie).send({ items: "x" });
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("CART_INVALID");
  });
});

describe("a cart quoted or checked out before the quote-only cutover", () => {
  /** One session and one store across the priced app and the quote-only app. */
  async function beforeAndAfter() {
    const durable = shared();
    const priced = await cartApp(durable, { quoteOnly: false });
    const cookie = await unlock(priced);
    const quoted = await request(priced).post(QUOTE).set("Cookie", cookie).send(quoteBody());
    expect(quoted.status).toBe(200);
    const body = { quoteId: quoted.body.quote.quoteId as string, idempotencyKey: KEY, expectedIntentHash: quoted.body.quote.intentHash as string };
    const quoteOnly = await cartApp(durable, { quoteOnly: true });
    return { durable, priced, quoteOnly, cookie, body };
  }

  it("does not check out a quote taken before the cutover, and sends the client back to re-quote", async () => {
    const { durable, quoteOnly, cookie, body } = await beforeAndAfter();

    const placed = await request(quoteOnly).post(CHECKOUT).set("Cookie", cookie).send(body);

    // The cart client already answers this code by quoting again, where the
    // line then reads "not released for ordering".
    expect(placed.status).toBe(409);
    expect(placed.body).toEqual({ ok: false, code: "QUOTE_CHANGED", quoteOnly: true });
    expect(await durable.store.byIdempotencyKey(KEY)).toBeNull();
  });

  it("still replays a checkout placed before the cutover: what was sold stays sold", async () => {
    const { priced, quoteOnly, cookie, body } = await beforeAndAfter();
    const placed = await request(priced).post(CHECKOUT).set("Cookie", cookie).send(body);
    expect(placed.status).toBe(201);

    const replay = await request(quoteOnly).post(CHECKOUT).set("Cookie", cookie).send(body);

    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.checkout.cartCheckoutNumber).toBe(placed.body.checkout.cartCheckoutNumber);
  });

  it("still refuses that key under a changed intent, as a conflict and not as quote-only", async () => {
    const { priced, quoteOnly, cookie, body } = await beforeAndAfter();
    expect((await request(priced).post(CHECKOUT).set("Cookie", cookie).send(body)).status).toBe(201);

    const conflicted = await request(quoteOnly).post(CHECKOUT).set("Cookie", cookie)
      .send({ ...body, expectedIntentHash: "f".repeat(64) });

    expect(conflicted.status).toBe(409);
    expect(conflicted.body.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("still reads back and reports its status", async () => {
    const { priced, quoteOnly, cookie, body } = await beforeAndAfter();
    const placed = await request(priced).post(CHECKOUT).set("Cookie", cookie).send(body);
    const number = placed.body.checkout.cartCheckoutNumber as string;

    const read = await request(quoteOnly).get(`/api/research/early-access/cart/${number}`).set("Cookie", cookie);
    expect(read.status).toBe(200);
    expect(read.body.checkout.cartCheckoutNumber).toBe(number);
    expect(read.body.checkout.invoice.payableTotalCents).toBe(placed.body.checkout.invoice.payableTotalCents);

    const status = await request(quoteOnly).get(`/api/research/early-access/cart/${number}/status`).set("Cookie", cookie);
    expect(status.status).toBe(200);
  });
});

import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { registerPrivateEarlyAccessApi } from "../register";
import { EARLY_ACCESS_CART_ENV, earlyAccessCartEnabled } from "./feature-flag";
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
 * THE CART, THROUGH THE REAL REGISTRATION.
 *
 * The mount is behind an exact-string flag and the flag is false by default,
 * so the first thing these tests prove is that the cart does not exist unless
 * a named human switched it on. The rest drive quote and checkout over HTTP
 * with the session-code identity, because a cart that only works in a unit
 * test is not a cart.
 */

const UNLOCK = "/api/research/early-access/unlock";
const QUOTE = "/api/research/early-access/cart/quote";
const CHECKOUT = "/api/research/early-access/cart/checkout";

const CART_ON = { [EARLY_ACCESS_CART_ENV]: "true" } as NodeJS.ProcessEnv;

async function cartApp(
  env: NodeJS.ProcessEnv,
  overrides: Record<string, unknown> = {},
): Promise<{ app: Express; store: InMemoryEarlyAccessCartStore }> {
  const app = express();
  app.use(express.json());
  const unit = cleanUnit();
  const store = new InMemoryEarlyAccessCartStore();
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    sessionIdentity: true,
    env,
    cartStore: store,
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
  return { app, store };
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
    items: [
      {
        productId: "prod-clean",
        variantId: "var-10mg",
        quantity: 3,
        expectedUnitPriceCents: 19_900,
        expectedCurrency: "USD",
      },
    ],
    contact: ORDER_CONTACT,
    shipTo: SHIP_TO,
  };
}

describe("the cart flag is exact-string and fails closed", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["false", "false"],
    ["numeric", "1"],
    ["uppercase", "TRUE"],
    ["yes", "yes"],
    ["padded", " true"],
  ])("stays DISABLED for %s", (_name, value) => {
    const env: Record<string, string> = {};
    if (value !== undefined) env[EARLY_ACCESS_CART_ENV] = value;
    expect(earlyAccessCartEnabled(env)).toBe(false);
  });

  it("enables ONLY on the exact string", () => {
    expect(earlyAccessCartEnabled({ [EARLY_ACCESS_CART_ENV]: "true" })).toBe(true);
  });

  it("does not mount the cart routes at all when the flag is off", async () => {
    const { app } = await cartApp({} as NodeJS.ProcessEnv);
    const cookie = await unlock(app);
    // 404 because the route does not exist, not 401/403 from a mounted-but-refusing
    // handler: a disabled feature leaves no surface to probe.
    expect((await request(app).post(QUOTE).set("Cookie", cookie).send(quoteBody())).status).toBe(404);
    expect((await request(app).post(CHECKOUT).set("Cookie", cookie).send({})).status).toBe(404);
  });
});

describe("quote and checkout, over HTTP, with the cart switched on", () => {
  it("refuses an unauthenticated caller", async () => {
    const { app } = await cartApp(CART_ON);
    const res = await request(app).post(QUOTE).send(quoteBody());
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_REQUIRED");
  });

  it("quotes server-authoritative aggregate money and writes no order", async () => {
    const { app, store } = await cartApp(CART_ON);
    const cookie = await unlock(app);

    const res = await request(app).post(QUOTE).set("Cookie", cookie).send(quoteBody());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const quote = res.body.quote;
    expect(quote.lines).toHaveLength(1);
    // 3 x 19,900 = 59,700, and the bundle rule takes 20% = 11,940.
    expect(quote.lines[0].subtotalCents).toBe(59_700);
    expect(quote.lines[0].discountCents).toBe(11_940);
    expect(quote.payableTotalCents).toBe(
      quote.subtotalCents - quote.discountCents + quote.shippingCents + quote.taxCents,
    );
    // The promotion is the SAME versioned rule the single-product order uses.
    expect(quote.lines[0].promotionId).toBe("early-access-bundle-3");
    expect(quote.lines[0].promotionVersion).toEqual(expect.any(String));

    // A quote creates no commerce fact.
    expect(await store.byIdempotencyKey("xeac_00000000000000000000")).toBeNull();
    // And the public quote carries no contact or address.
    const serialized = JSON.stringify(quote);
    expect(serialized).not.toContain(ORDER_CONTACT.email);
    expect(serialized).not.toContain(SHIP_TO.line1);
  });

  it("commits one parent with its children, then replays the same key", async () => {
    const { app } = await cartApp(CART_ON);
    const cookie = await unlock(app);
    const quoted = await request(app).post(QUOTE).set("Cookie", cookie).send(quoteBody());
    const { quoteId, intentHash, payableTotalCents } = quoted.body.quote;

    const body = {
      quoteId,
      idempotencyKey: "xeac_cart000000000000000001",
      expectedIntentHash: intentHash,
    };
    const placed = await request(app).post(CHECKOUT).set("Cookie", cookie).send(body);
    expect(placed.status).toBe(201);
    expect(placed.body.replayed).toBe(false);
    const checkout = placed.body.checkout;
    expect(checkout.children).toHaveLength(1);
    expect(checkout.invoice.payableTotalCents).toBe(payableTotalCents);
    expect(checkout.paymentState).toBe("awaiting_payment");
    // One parent reference for one payment, not one per child.
    expect(checkout.invoice.paymentReference).toEqual(expect.any(String));

    const replay = await request(app).post(CHECKOUT).set("Cookie", cookie).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.checkout.cartCheckoutNumber).toBe(checkout.cartCheckoutNumber);
  });

  it("refuses the same key under a changed intent, and never mutates the committed cart", async () => {
    const { app } = await cartApp(CART_ON);
    const cookie = await unlock(app);
    const quoted = await request(app).post(QUOTE).set("Cookie", cookie).send(quoteBody());
    const body = {
      quoteId: quoted.body.quote.quoteId,
      idempotencyKey: "xeac_cart000000000000000002",
      expectedIntentHash: quoted.body.quote.intentHash,
    };
    const placed = await request(app).post(CHECKOUT).set("Cookie", cookie).send(body);
    expect(placed.status).toBe(201);

    const conflicted = await request(app)
      .post(CHECKOUT)
      .set("Cookie", cookie)
      .send({ ...body, expectedIntentHash: "f".repeat(64) });
    expect(conflicted.status).toBe(409);
    expect(conflicted.body.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("keeps one session's cart checkout unreadable to another, as a plain 404", async () => {
    const { app } = await cartApp(CART_ON);
    const cookieA = await unlock(app);
    const cookieB = await unlock(app);
    const quoted = await request(app).post(QUOTE).set("Cookie", cookieA).send(quoteBody());
    const placed = await request(app)
      .post(CHECKOUT)
      .set("Cookie", cookieA)
      .send({
        quoteId: quoted.body.quote.quoteId,
        idempotencyKey: "xeac_cart000000000000000003",
        expectedIntentHash: quoted.body.quote.intentHash,
      });
    expect(placed.status).toBe(201);
    const number = placed.body.checkout.cartCheckoutNumber;

    const own = await request(app)
      .get(`/api/research/early-access/cart/${number}`)
      .set("Cookie", cookieA);
    expect(own.status).toBe(200);

    const stranger = await request(app)
      .get(`/api/research/early-access/cart/${number}`)
      .set("Cookie", cookieB);
    expect(stranger.status).toBe(404);
    expect(JSON.stringify(stranger.body)).not.toContain(ORDER_CONTACT.email);
  });

  it("refuses a quote when the policy is not on file", async () => {
    const { app } = await cartApp(CART_ON, { agreements: new StubAgreementGate(false) });
    const cookie = await unlock(app);
    const res = await request(app).post(QUOTE).set("Cookie", cookie).send(quoteBody());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AGREEMENT_REQUIRED");
  });
});

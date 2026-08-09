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
 * THE DUPLICATE ORDER THAT THE FIRST REAL FOUNDER CHECKOUT CREATED.
 *
 * On 2026-08-09 one founder checkout produced TWO parent orders sixty seconds
 * apart, XEC-063A962A0053A65324F21E7F and XEC-E1703CC63BBE89E6839E24C1. Both
 * $103.50, same customer, same quote, byte-identical intent_hash, both
 * awaiting_payment. The idempotency keys differed, and dedupe keyed on nothing
 * else, so the server was correct by its own contract and wrong by every other
 * measure.
 *
 * The exact shape is reproduced below, over real HTTP through the real
 * registration, because an invariant that is only tested at the service layer
 * has not been tested where the customer meets it.
 *
 * These tests fail against the pre-fix build. That is the point of them.
 */

const UNLOCK = "/api/research/early-access/unlock";
const QUOTE = "/api/research/early-access/cart/quote";
const CHECKOUT = "/api/research/early-access/cart/checkout";

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

function cartRequest(quantity = 2) {
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
    contact: ORDER_CONTACT,
    shipTo: SHIP_TO,
  };
}

async function quoteFor(
  app: Express,
  cookie: string,
  body = cartRequest(),
): Promise<{ quoteId: string; intentHash: string }> {
  const response = await request(app).post(QUOTE).set("Cookie", cookie).send(body);
  expect(response.status).toBe(200);
  return response.body.quote;
}

/** Every parent checkout the store holds, which is the only count that matters. */
function placedCount(store: InMemoryEarlyAccessCartStore): number {
  return (store as unknown as { byNumber: Map<string, unknown> }).byNumber.size;
}

describe("the production incident: one quote can only be spent once", () => {
  it("a SECOND confirm with a FRESH idempotency key replays the first order instead of creating one", async () => {
    const { app, store } = await cartApp();
    const cookie = await unlock(app);
    const quote = await quoteFor(app, cookie);

    // Exactly the production shape: same customer, same quote, same intent,
    // two different keys, because the client cleared its key on success.
    const first = await request(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: quote.quoteId,
      idempotencyKey: "xeac_dup0000000000000000a1",
      expectedIntentHash: quote.intentHash,
    });
    expect(first.status).toBe(201);
    expect(first.body.replayed).toBe(false);

    const second = await request(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: quote.quoteId,
      idempotencyKey: "xeac_dup0000000000000000b2",
      expectedIntentHash: quote.intentHash,
    });

    expect(second.status).toBe(200);
    expect(second.body.ok).toBe(true);
    expect(second.body.replayed).toBe(true);
    expect(second.body.checkout.cartCheckoutNumber).toBe(first.body.checkout.cartCheckoutNumber);
    expect(placedCount(store)).toBe(1);
  });

  it("the replay carries ONE invoice and ONE payment reference, not a second of each", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const quote = await quoteFor(app, cookie);
    const body = (key: string) => ({
      quoteId: quote.quoteId,
      idempotencyKey: key,
      expectedIntentHash: quote.intentHash,
    });

    const first = await request(app).post(CHECKOUT).set("Cookie", cookie).send(body("xeac_inv000000000000000a1"));
    const second = await request(app).post(CHECKOUT).set("Cookie", cookie).send(body("xeac_inv000000000000000b2"));

    expect(second.body.checkout.invoice.invoiceNumber).toBe(
      first.body.checkout.invoice.invoiceNumber,
    );
    expect(second.body.checkout.invoice.paymentReference).toBe(
      first.body.checkout.invoice.paymentReference,
    );
    expect(second.body.checkout.invoice.payableTotalCents).toBe(
      first.body.checkout.invoice.payableTotalCents,
    );
  });

  it("SIX rapid confirms, every one with its own key, still leave exactly one order", async () => {
    const { app, store } = await cartApp();
    const cookie = await unlock(app);
    const quote = await quoteFor(app, cookie);

    const responses = await Promise.all(
      ["a1", "b2", "c3", "d4", "e5", "f6"].map((suffix) =>
        request(app).post(CHECKOUT).set("Cookie", cookie).send({
          quoteId: quote.quoteId,
          idempotencyKey: `xeac_race00000000000000${suffix}`,
          expectedIntentHash: quote.intentHash,
        }),
      ),
    );

    const created = responses.filter((response) => response.status === 201);
    const replayed = responses.filter((response) => response.status === 200);
    expect(created).toHaveLength(1);
    expect(replayed).toHaveLength(5);
    expect(placedCount(store)).toBe(1);

    // Every caller is told about the SAME order. A loser that got no answer, or
    // a different order number, would push the customer straight back into the
    // behaviour this fixes.
    const numbers = new Set(
      responses.map((response) => response.body.checkout?.cartCheckoutNumber),
    );
    expect(numbers.size).toBe(1);
    expect(numbers.has(undefined)).toBe(false);
  });

  it("the SAME key still replays, so the original idempotency contract is intact", async () => {
    const { app, store } = await cartApp();
    const cookie = await unlock(app);
    const quote = await quoteFor(app, cookie);
    const body = {
      quoteId: quote.quoteId,
      idempotencyKey: "xeac_same00000000000000a1",
      expectedIntentHash: quote.intentHash,
    };

    const first = await request(app).post(CHECKOUT).set("Cookie", cookie).send(body);
    const second = await request(app).post(CHECKOUT).set("Cookie", cookie).send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(placedCount(store)).toBe(1);
  });

  it("a genuinely NEW cart still places a second order, so the fix did not seize the shop", async () => {
    const { app, store } = await cartApp();
    const cookie = await unlock(app);

    const firstQuote = await quoteFor(app, cookie, cartRequest(2));
    const first = await request(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: firstQuote.quoteId,
      idempotencyKey: "xeac_new0000000000000000a1",
      expectedIntentHash: firstQuote.intentHash,
    });
    expect(first.status).toBe(201);

    // A different basket is a different quote, and must still be buyable.
    const secondQuote = await quoteFor(app, cookie, cartRequest(1));
    expect(secondQuote.quoteId).not.toBe(firstQuote.quoteId);
    const second = await request(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: secondQuote.quoteId,
      idempotencyKey: "xeac_new0000000000000000b2",
      expectedIntentHash: secondQuote.intentHash,
    });
    expect(second.status).toBe(201);
    expect(second.body.checkout.cartCheckoutNumber).not.toBe(
      first.body.checkout.cartCheckoutNumber,
    );
    expect(placedCount(store)).toBe(2);
  });

  it("a DIFFERENT customer cannot reach another customer's quote, replay or otherwise", async () => {
    const { app, store } = await cartApp();
    const buyer = await unlock(app);
    const stranger = await unlock(app);
    const quote = await quoteFor(app, buyer);

    const placed = await request(app).post(CHECKOUT).set("Cookie", buyer).send({
      quoteId: quote.quoteId,
      idempotencyKey: "xeac_own0000000000000000a1",
      expectedIntentHash: quote.intentHash,
    });
    expect(placed.status).toBe(201);

    const theft = await request(app).post(CHECKOUT).set("Cookie", stranger).send({
      quoteId: quote.quoteId,
      idempotencyKey: "xeac_own0000000000000000b2",
      expectedIntentHash: quote.intentHash,
    });

    // Refused, and refused WITHOUT handing over the order. A replay here would
    // have disclosed another customer's checkout number, invoice and payment
    // reference to whoever asked second.
    expect(theft.status).not.toBe(200);
    expect(theft.status).not.toBe(201);
    expect(theft.body.ok).toBe(false);
    expect(JSON.stringify(theft.body)).not.toContain(
      placed.body.checkout.cartCheckoutNumber,
    );
    expect(placedCount(store)).toBe(1);
  });

  it("a superseded checkout is not an active one, so it never blocks or answers a quote", async () => {
    const store = new InMemoryEarlyAccessCartStore();
    const app = express();
    app.use(express.json());
    const unit = cleanUnit();
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
    const cookie = await unlock(app);
    const quote = await quoteFor(app, cookie);
    const first = await request(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: quote.quoteId,
      idempotencyKey: "xeac_sup0000000000000000a1",
      expectedIntentHash: quote.intentHash,
    });
    expect(first.status).toBe(201);

    // Disposition it the way migration 61 does, then confirm the quote is free
    // again. A voided order must not lock its quote forever.
    const inner = store as unknown as { byNumber: Map<string, Record<string, unknown>> };
    const placed = inner.byNumber.get(first.body.checkout.cartCheckoutNumber)!;
    inner.byNumber.set(first.body.checkout.cartCheckoutNumber, {
      ...placed,
      disposition: "duplicate_superseded",
      supersededBy: "XEC-SOMETHINGELSE0000000000",
    });

    const again = await request(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: quote.quoteId,
      idempotencyKey: "xeac_sup0000000000000000b2",
      expectedIntentHash: quote.intentHash,
    });
    expect(again.status).toBe(201);
    expect(again.body.checkout.cartCheckoutNumber).not.toBe(
      first.body.checkout.cartCheckoutNumber,
    );
  });
});

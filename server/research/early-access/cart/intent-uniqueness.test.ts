import express, { type Express, type NextFunction, type Request, type Response } from "express";
import supertest from "supertest";
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
 * ONE CUSTOMER INTENT MUST PRODUCE ONE ORDER, EVEN ACROSS TWO QUOTES.
 *
 * M61 closed the incident it was written for: one quote could no longer mint
 * two active checkouts, because the browser cleared its attempt key while
 * leaving the quote live. Its own header records the shape of that bug and the
 * facts the database already held.
 *
 * It did not close the neighbouring case, and the neighbouring case is the one
 * a customer actually reaches by pressing back and re-quoting. `intentHash` is
 * derived in `quote-service.ts` from the customer, the contact, the destination
 * and the lines. It deliberately does NOT include the quote id, because it
 * exists to answer "is this the same purchase" rather than "is this the same
 * quote". So two quotes for an unchanged cart are two different `quoteId`s
 * carrying one identical `intentHash`.
 *
 * The commit path dedupes on `idempotency_key_hash`, then on `quote_id`. There
 * is no check on the intent alone, so the second quote is a clean miss on both
 * and commits a second active checkout: same customer, same cart, same money,
 * two orders.
 *
 * These tests are written to FAIL against the unrepaired code. That is the
 * point of committing them first: the failure is the defect, stated once, in a
 * form that cannot be argued with and cannot silently regress later.
 */

const UNLOCK = "/api/research/early-access/unlock";
const QUOTE = "/api/research/early-access/cart/quote";
const CHECKOUT = "/api/research/early-access/cart/checkout";

const CART_ON = { NODE_ENV: "test", [EARLY_ACCESS_CART_ENV]: "true" } as NodeJS.ProcessEnv;
const UNIT_PRICE = 19_900;

function adminGuard(email: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { adminEmail?: string }).adminEmail = email;
    next();
  };
}

async function cartApp(): Promise<{ app: Express; store: InMemoryEarlyAccessCartStore }> {
  const app = express();
  app.use(express.json());
  const unit = cleanUnit({ quantityLimit: 20 } as never);
  const ledger = await approvedLedgerFor(unit, { approvedQuantityLimit: 20 });
  const store = new InMemoryEarlyAccessCartStore();
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    sessionIdentity: true,
    env: CART_ON,
    cartStore: store,
    catalog: catalogOf([unit]),
    releases: ledger,
    orderNumber: sequentialOrderNumbers(),
    proofId: sequentialProofIds(),
    agreements: new StubAgreementGate(true),
    suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT) as never,
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
    requireAdmin: adminGuard("named.operator@xeniostechnology.com") as never,
    audit: { async record() {} } as never,
  });
  return { app, store };
}

async function unlock(app: Express): Promise<string> {
  const response = await supertest(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

const ITEMS = [
  {
    productId: "prod-clean",
    variantId: "var-10mg",
    quantity: 2,
    expectedUnitPriceCents: UNIT_PRICE,
    expectedCurrency: "USD" as const,
  },
];

async function freshQuote(app: Express, cookie: string) {
  const quoted = await supertest(app)
    .post(QUOTE)
    .set("Cookie", cookie)
    .send({ items: ITEMS, contact: ORDER_CONTACT, shipTo: SHIP_TO });
  expect(quoted.status).toBe(200);
  return quoted.body.quote as { quoteId: string; intentHash: string };
}

describe("one customer intent, two quotes", () => {
  it("re-quoting an unchanged cart produces a NEW quote id carrying the SAME intent", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);

    const first = await freshQuote(app, cookie);
    const second = await freshQuote(app, cookie);

    // This is the precondition the defect rests on, asserted so that if the
    // intent derivation ever changes, this file explains itself rather than
    // failing for a reason nobody can reconstruct.
    expect(second.quoteId).not.toBe(first.quoteId);
    expect(second.intentHash).toBe(first.intentHash);
  });

  it("does NOT create a second order for the same intent", async () => {
    const { app, store } = await cartApp();
    const cookie = await unlock(app);

    const first = await freshQuote(app, cookie);
    const placedFirst = await supertest(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: first.quoteId,
      idempotencyKey: "xeac_intent00000000000001",
      expectedIntentHash: first.intentHash,
    });
    expect(placedFirst.status).toBe(201);
    const firstNumber = placedFirst.body.checkout.cartCheckoutNumber as string;

    // The customer goes back, re-quotes the unchanged cart, and confirms again.
    // A new quote and a new attempt key: a clean miss on both existing guards.
    const second = await freshQuote(app, cookie);
    const placedSecond = await supertest(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: second.quoteId,
      idempotencyKey: "xeac_intent00000000000002",
      expectedIntentHash: second.intentHash,
    });

    // Either answer is acceptable to the customer: a replay of the order they
    // already have (200) or an explicit refusal. What is NOT acceptable is a
    // second distinct order, which is a second real financial obligation.
    if (placedSecond.status === 201) {
      expect(placedSecond.body.checkout.cartCheckoutNumber).toBe(firstNumber);
    } else {
      expect(placedSecond.status).not.toBe(201);
    }

    // The durable truth, read from the store rather than from the response:
    // exactly one active checkout for this customer's intent.
    const active = store
      .allCheckouts()
      .filter((checkout) => checkout.intentHash === first.intentHash);
    expect(active).toHaveLength(1);
    expect(active[0]?.cartCheckoutNumber).toBe(firstNumber);
  });

  it("a genuinely different cart is still allowed a second order", async () => {
    const { app, store } = await cartApp();
    const cookie = await unlock(app);

    const first = await freshQuote(app, cookie);
    const placedFirst = await supertest(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: first.quoteId,
      idempotencyKey: "xeac_intent00000000000003",
      expectedIntentHash: first.intentHash,
    });
    expect(placedFirst.status).toBe(201);

    // A different quantity is a different purchase, and must not be swallowed
    // by an over-broad intent guard. This is the test that stops the repair
    // from becoming "one order per customer, ever".
    const changed = await supertest(app)
      .post(QUOTE)
      .set("Cookie", cookie)
      .send({
        items: [{ ...ITEMS[0], quantity: 5 }],
        contact: ORDER_CONTACT,
        shipTo: SHIP_TO,
      });
    expect(changed.status).toBe(200);
    expect(changed.body.quote.intentHash).not.toBe(first.intentHash);

    const placedSecond = await supertest(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: changed.body.quote.quoteId,
      idempotencyKey: "xeac_intent00000000000004",
      expectedIntentHash: changed.body.quote.intentHash,
    });
    expect(placedSecond.status).toBe(201);
    expect(placedSecond.body.checkout.cartCheckoutNumber).not.toBe(
      placedFirst.body.checkout.cartCheckoutNumber,
    );
    expect(store.allCheckouts()).toHaveLength(2);
  });
});

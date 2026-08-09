import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_CART_FORBIDDEN_CUSTOMER_KEYS,
  cartCustomerPayloadIsClean,
} from "@shared/research/early-access-hardening";
import { registerPrivateEarlyAccessApi } from "../register";
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
import { EARLY_ACCESS_CART_ENV } from "./feature-flag";
import { InMemoryEarlyAccessCartStore } from "./store";
import {
  EARLY_ACCESS_CUSTOMER_QUOTE_CONTRACT_TOKENS,
  customerQuoteView,
} from "./customer-status";

/**
 * THE DEFECT THIS FILE EXISTS TO PREVENT.
 *
 * Defensive QA rejected a candidate because `POST /cart/quote` returned the
 * quote-service result straight down the wire, and every quote line carries the
 * supplier route the service resolved. So the FIRST surface a customer touches
 * disclosed `supplierId` and `supplierSku`, while checkout, read, status and
 * payment instructions had already been projected clean.
 *
 * The supplier route is not removed from the calculation: the STORED quote is
 * what `checkout-service.ts` reads to build each child order, so a quote without
 * it cannot be fulfilled. Only the customer response is projected. These tests
 * pin both halves, because a fix that quietly dropped the internal route would
 * pass a privacy test and break fulfilment.
 */

const QUOTE = "/api/research/early-access/cart/quote";
const CHECKOUT = "/api/research/early-access/cart/checkout";
const UNLOCK = "/api/research/early-access/unlock";

const CART_ON = {
  NODE_ENV: "test",
  [EARLY_ACCESS_CART_ENV]: "true",
} as NodeJS.ProcessEnv;

/** The exact strings the red-team probe observed on the rejected candidate. */
const OBSERVED_SUPPLIER_ID = SUPPLIER_ASSIGNMENT.supplierId;
const OBSERVED_SUPPLIER_SKU = SUPPLIER_ASSIGNMENT.supplierSku;

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

async function quoted(app: Express, cookie: string) {
  const response = await request(app).post(QUOTE).set("Cookie", cookie).send(quoteBody());
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  return response;
}

/** Every JSON path at any depth whose key is `key`. */
function pathsWithKey(node: unknown, key: string, at = "$"): string[] {
  if (node === null || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    return node.flatMap((entry, index) => pathsWithKey(entry, key, `${at}[${index}]`));
  }
  const found: string[] = [];
  for (const [name, value] of Object.entries(node as Record<string, unknown>)) {
    if (name === key) found.push(`${at}.${name}`);
    found.push(...pathsWithKey(value, key, `${at}.${name}`));
  }
  return found;
}

describe("POST /cart/quote discloses no supplier identity", () => {
  it("has no supplierId anywhere in the customer response", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const response = await quoted(app, cookie);
    expect(pathsWithKey(response.body, "supplierId")).toEqual([]);
    expect(response.body.quote.lines[0].supplierId).toBeUndefined();
  });

  it("has no supplierSku anywhere in the customer response", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const response = await quoted(app, cookie);
    expect(pathsWithKey(response.body, "supplierSku")).toEqual([]);
    expect(response.body.quote.lines[0].supplierSku).toBeUndefined();
  });

  it("does not carry the observed values under any other key either", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const response = await quoted(app, cookie);
    // A rename is not a fix. The serialized body must not contain the identifiers
    // at all, whatever they are called.
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(OBSERVED_SUPPLIER_ID);
    expect(serialized).not.toContain(OBSERVED_SUPPLIER_SKU);
  });

  it("carries no forbidden customer key in its lines, at any depth", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const response = await quoted(app, cookie);
    // The shared deep predicate, applied to the lines. It walks nested objects
    // and arrays, so an equivalent identifier nested inside a future sub-object
    // fails here rather than shipping.
    expect(cartCustomerPayloadIsClean(response.body.quote.lines)).toBe(true);
  });

  it("carries no forbidden top-level key except the two contract tokens", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const response = await quoted(app, cookie);
    const forbiddenPresent = Object.keys(response.body.quote).filter((key) =>
      (EARLY_ACCESS_CART_FORBIDDEN_CUSTOMER_KEYS as readonly string[]).includes(key),
    );
    expect(forbiddenPresent.sort()).toEqual(
      [...EARLY_ACCESS_CUSTOMER_QUOTE_CONTRACT_TOKENS].sort(),
    );
  });

  it("still returns everything the customer needs to see and to check out", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const response = await quoted(app, cookie);
    const quote = response.body.quote;

    // The contract token the checkout request REQUIRES. Stripping these would
    // make the cart unusable, which is why they are an explicit exception.
    expect(quote.quoteId).toEqual(expect.any(String));
    expect(quote.intentHash).toEqual(expect.any(String));

    const line = quote.lines[0];
    for (const field of [
      "productId",
      "variantId",
      "displayName",
      "strength",
      "sku",
      "quantity",
      "currency",
      "unitPriceCents",
      "subtotalCents",
      "discountCents",
      "payableCents",
    ]) {
      expect(line[field], `missing ${field}`).toBeDefined();
    }
    expect(line.promotionId).toBe("early-access-bundle-3");
    expect(quote.payableTotalCents).toBeGreaterThan(0);
  });

  it("the returned token actually completes a checkout, so the projection broke nothing", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const response = await quoted(app, cookie);

    const placed = await request(app)
      .post(CHECKOUT)
      .set("Cookie", cookie)
      .send({
        quoteId: response.body.quote.quoteId,
        idempotencyKey: "xeac_quoteprivacy000001",
        expectedIntentHash: response.body.quote.intentHash,
      });
    expect(placed.status).toBe(201);
  });
});

describe("the internal supplier authority is untouched", () => {
  it("the STORED quote still carries the supplier route the checkout reads", async () => {
    const { app, store } = await cartApp();
    const cookie = await unlock(app);
    const response = await quoted(app, cookie);

    // `publicQuote` is the stored quote's field name and is now a misnomer: it
    // is the INTERNAL quote, and the customer projection happens at the wire.
    // Left as it is deliberately, because renaming a persisted field is not
    // this change, but it is the reason the disclosure was easy to miss.
    const stored = await store.get(response.body.quote.quoteId);
    expect(stored).not.toBeNull();
    expect(stored?.publicQuote.lines[0].supplierId).toBe(OBSERVED_SUPPLIER_ID);
    expect(stored?.publicQuote.lines[0].supplierSku).toBe(OBSERVED_SUPPLIER_SKU);
  });

  it("the committed checkout still routes every child order to its supplier", async () => {
    const { app, store } = await cartApp();
    const cookie = await unlock(app);
    const response = await quoted(app, cookie);

    const placed = await request(app)
      .post(CHECKOUT)
      .set("Cookie", cookie)
      .send({
        quoteId: response.body.quote.quoteId,
        idempotencyKey: "xeac_quoteprivacy000002",
        expectedIntentHash: response.body.quote.intentHash,
      });
    expect(placed.status).toBe(201);

    // The customer response is clean...
    expect(placed.body.checkout.children[0].supplierId).toBeUndefined();
    expect(cartCustomerPayloadIsClean(placed.body)).toBe(true);

    // ...and the durable record fulfilment reads is not.
    const committed = await store.byCheckoutNumber(placed.body.checkout.cartCheckoutNumber);
    expect(committed?.children[0].supplierId).toBe(OBSERVED_SUPPLIER_ID);
    expect(committed?.children[0].supplierSku).toBe(OBSERVED_SUPPLIER_SKU);
  });
});

describe("the other customer surfaces stay clean", () => {
  it("the checkout response carries no forbidden key at any depth", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const response = await quoted(app, cookie);
    const placed = await request(app)
      .post(CHECKOUT)
      .set("Cookie", cookie)
      .send({
        quoteId: response.body.quote.quoteId,
        idempotencyKey: "xeac_quoteprivacy000003",
        expectedIntentHash: response.body.quote.intentHash,
      });
    expect(placed.status).toBe(201);
    expect(cartCustomerPayloadIsClean(placed.body.checkout)).toBe(true);
    expect(pathsWithKey(placed.body, "supplierId")).toEqual([]);
  });

  it("the status response carries no forbidden key at any depth", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const response = await quoted(app, cookie);
    const placed = await request(app)
      .post(CHECKOUT)
      .set("Cookie", cookie)
      .send({
        quoteId: response.body.quote.quoteId,
        idempotencyKey: "xeac_quoteprivacy000004",
        expectedIntentHash: response.body.quote.intentHash,
      });
    expect(placed.status).toBe(201);

    const status = await request(app)
      .get(
        `/api/research/early-access/cart/${placed.body.checkout.cartCheckoutNumber}/status`,
      )
      .set("Cookie", cookie);
    expect(status.status).toBe(200);
    expect(cartCustomerPayloadIsClean(status.body.status)).toBe(true);
    expect(pathsWithKey(status.body, "supplierId")).toEqual([]);
    expect(pathsWithKey(status.body, "supplierSku")).toEqual([]);
  });
});

describe("customerQuoteView, directly", () => {
  const line = Object.freeze({
    productId: "prod-clean",
    variantId: "var-10mg",
    displayName: "Clean Unit",
    strength: "10 mg",
    sku: "SKU-1",
    quantity: 1,
    supplierId: "supplier-secret",
    supplierSku: "wholesale-secret",
    currency: "USD" as const,
    unitPriceCents: 19_900,
    subtotalCents: 19_900,
    discountCents: 0,
    payableCents: 19_900,
    promotionId: null,
    promotionVersion: null,
    promotionLabel: null,
  });
  const quote = Object.freeze({
    quoteId: "xeaq_abcdefghijklmnop",
    currency: "USD" as const,
    lines: Object.freeze([line]),
    subtotalCents: 19_900,
    discountCents: 0,
    shippingCents: 0,
    taxCents: 0,
    payableTotalCents: 19_900,
    intentHash: "hash",
    quotedAt: "2026-08-09T00:00:00.000Z",
    expiresAt: "2026-08-09T01:00:00.000Z",
  });

  it("omits the supplier route and keeps the contract tokens", () => {
    const view = customerQuoteView(quote);
    expect(JSON.stringify(view)).not.toContain("secret");
    expect(view.quoteId).toBe("xeaq_abcdefghijklmnop");
    expect(view.intentHash).toBe("hash");
    expect(view.lines[0].displayName).toBe("Clean Unit");
  });

  // Built, not filtered: an added internal field is invisible until somebody
  // deliberately names it in the projection.
  it("drops a field nobody added to the projection", () => {
    const withExtra = { ...quote, lines: [{ ...line, supplierCostCents: 4200 }] };
    const view = customerQuoteView(withExtra as never);
    expect(JSON.stringify(view)).not.toContain("4200");
    expect(pathsWithKey(view, "supplierCostCents")).toEqual([]);
  });
});

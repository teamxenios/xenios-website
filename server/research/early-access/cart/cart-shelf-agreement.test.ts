import express, { type Express } from "express";
import supertest from "supertest";
import { describe, expect, it } from "vitest";

import { registerPrivateEarlyAccessApi } from "../register";
import { EARLY_ACCESS_CART_ENV } from "./feature-flag";
import { InMemoryEarlyAccessCartStore } from "./store";
import { ProductControlCatalogSource, resolveEarlyAccessSettlementCurrency } from "../catalog/product-control-source";
import { ProductControlDeclaredFactsReader } from "../catalog/declared-facts-source";
import {
  NO_RECORDED_LOTS_INVENTORY,
  canonicalReviewProducts,
} from "../release/first-release-canonical-source";
import { InMemoryEarlyAccessReleaseLedger } from "../release/founder-release";
import { seedFounderFirstRelease } from "../release/founder-first-release-seed";
import { RAW_PEPTIDES_EXPIRES_AT, seedRawPeptidesConfirmations } from "../release/founder-supply-seed";
import { InMemorySupplierConfirmationStore } from "../ops/supplier-confirmation";
import {
  EARLY_ACCESS_TEST_CONFIG,
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_CONTACT,
  SHIP_TO,
  StubAgreementGate,
  StubReferralResolver,
  StubShippingPolicy,
} from "../routes/route-fixtures";

/**
 * THE SHELF AND THE CART MUST AGREE, ON THE REAL CATALOGUE.
 *
 * Every other cart test builds its catalogue from a hand-made fixture row.
 * That proves the cart logic and proves nothing about the projection a
 * customer actually sees, which is assembled by the Product Control source
 * from the canonical review products, the supplier confirmations and the
 * founder release ledger, and then decorated for supplier consistency.
 *
 * This test drives the SAME projection the storefront is built from. The
 * property is the one a customer experiences directly: a unit the catalogue
 * endpoint reports as purchasable must be quotable by the cart. A shelf that
 * offers what the cart refuses is the defect this file exists to catch, and it
 * is the exact shape of the shelf/checkout disagreement the supplier source of
 * truth work was done to end.
 *
 * Written after a browser session on the preview harness answered a cart quote
 * with PRODUCT_HELD for two units the catalogue had just listed as available.
 */

const UNLOCK = "/api/research/early-access/unlock";
const CATALOG = "/api/research/early-access/catalog";
const QUOTE = "/api/research/early-access/cart/quote";

const CART_ON = { NODE_ENV: "test", [EARLY_ACCESS_CART_ENV]: "true" } as NodeJS.ProcessEnv;
// Fixture time is within the unchanged founder supply window, not today's clock.
const FIXTURE_NOW = Date.parse("2026-08-08T10:00:00.000Z");

/** Two DIFFERENT suppliers, both valid, so nothing is withdrawn for a missing route. */
const SUPPLIERS = {
  async forUnit(productId: string) {
    return productId === "PEX-001"
      ? { supplierId: "supplier-apex", supplierSku: `APEX-${productId}` }
      : { supplierId: "supplier-renew360", supplierSku: `R360-${productId}` };
  },
};

async function realCatalogueApp(
  options: Readonly<{ withSuppliers: boolean; now?: () => number }>,
): Promise<Express> {
  const confirmations = new InMemorySupplierConfirmationStore();
  const source = new ProductControlCatalogSource({
    catalog: { readCatalog: async () => canonicalReviewProducts() },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      currency: resolveEarlyAccessSettlementCurrency(),
      supplierConfirmations: confirmations,
    }),
  } as never);

  // Seed the original valid facts once. Expiry tests advance only request time.
  const now = FIXTURE_NOW;
  const context = { earlyAccessCustomer: { customerRef: "cus_shelf_agreement" } };
  const before = await source.load(new Date(now), context);
  await seedRawPeptidesConfirmations({ rows: before.rows as never, store: confirmations });
  const confirmed = await source.load(new Date(now), context);
  const ledger = new InMemoryEarlyAccessReleaseLedger();
  const releases = await seedFounderFirstRelease({ rows: confirmed.rows as never, ledger });

  const app = express();
  app.use(express.json());
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    now: options.now ?? (() => FIXTURE_NOW),
    sessionIdentity: true,
    env: CART_ON,
    cartStore: new InMemoryEarlyAccessCartStore(),
    catalog: source,
    releases: ledger,
    supplierConfirmations: confirmations,
    founderHeldUnits: releases.founderHeldUnits,
    agreements: new StubAgreementGate(true),
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
    ...(options.withSuppliers ? { suppliers: SUPPLIERS as never } : {}),
  });
  return app;
}

async function unlock(app: Express): Promise<string> {
  const response = await supertest(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(response.status).toBe(200);
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

type Unit = Readonly<{
  productId: string;
  variantId: string;
  purchasable: boolean;
  availability: string;
  priceCents: number | null;
}>;

async function shelf(app: Express, cookie: string): Promise<readonly Unit[]> {
  const response = await supertest(app).get(CATALOG).set("Cookie", cookie);
  expect(response.status).toBe(200);
  return response.body.units as readonly Unit[];
}

describe("the real catalogue and the cart answer the same question the same way", () => {
  it("every unit the shelf calls purchasable can be quoted by the cart", async () => {
    const app = await realCatalogueApp({ withSuppliers: true });
    const cookie = await unlock(app);
    const units = await shelf(app, cookie);
    const purchasable = units.filter((unit) => unit.purchasable);

    // The shelf must actually be selling something, or this proves nothing.
    expect(purchasable.length).toBeGreaterThan(0);

    const response = await supertest(app)
      .post(QUOTE)
      .set("Cookie", cookie)
      .send({
        items: purchasable.slice(0, 2).map((unit) => ({
          productId: unit.productId,
          variantId: unit.variantId,
          quantity: 1,
          expectedUnitPriceCents: unit.priceCents,
          expectedCurrency: "USD",
        })),
        contact: ORDER_CONTACT,
        shipTo: SHIP_TO,
      });

    // The failure this test exists for: a per-line PRODUCT_HELD refusal for a
    // unit the shelf just offered. Report which lines, so the disagreement is
    // named rather than inferred from a status code.
    if (response.status !== 200) {
      expect({
        status: response.status,
        code: response.body.code,
        refusedLines: response.body.lines,
        shelfSaid: purchasable.slice(0, 2),
      }).toEqual("a quote for units the shelf calls purchasable");
    }
    expect(response.status).toBe(200);
    expect(response.body.quote.lines).toHaveLength(2);
    expect(response.body.quote.payableTotalCents).toBeGreaterThan(0);
  });

  it("every unit the shelf calls HELD is refused by the cart, line by line", async () => {
    const app = await realCatalogueApp({ withSuppliers: true });
    const cookie = await unlock(app);
    const units = await shelf(app, cookie);
    const held = units.filter((unit) => !unit.purchasable);
    expect(held.length).toBeGreaterThan(0);

    const response = await supertest(app)
      .post(QUOTE)
      .set("Cookie", cookie)
      .send({
        items: held.slice(0, 1).map((unit) => ({
          productId: unit.productId,
          variantId: unit.variantId,
          quantity: 1,
          expectedUnitPriceCents: 1_000,
          expectedCurrency: "USD",
        })),
        contact: ORDER_CONTACT,
        shipTo: SHIP_TO,
      });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("LINE_REFUSED");
    expect(response.body.lines).toHaveLength(1);
    expect(response.body.lines[0].code).toBe("PRODUCT_HELD");
  });

  it("the shelf counts are the accepted opening set: 22 visible, 18 purchasable, 4 held", async () => {
    const app = await realCatalogueApp({ withSuppliers: true });
    const cookie = await unlock(app);
    const units = await shelf(app, cookie);
    expect(units).toHaveLength(22);
    expect(units.filter((unit) => unit.purchasable)).toHaveLength(18);
    expect(units.filter((unit) => !unit.purchasable)).toHaveLength(4);
    // And no held row carries a price, so nothing unavailable reads as an offer.
    for (const unit of units.filter((row) => !row.purchasable)) {
      expect(unit.priceCents).toBeNull();
    }
  });

  it.each([0, 1])("the valid-seeded shelf and cart both refuse supply at expiry + %i ms", async (offsetMs) => {
    let requestNow = FIXTURE_NOW;
    const app = await realCatalogueApp({ withSuppliers: true, now: () => requestNow });

    // The same seeded release still offers real units immediately before expiry.
    requestNow = Date.parse(RAW_PEPTIDES_EXPIRES_AT) - 1;
    const beforeCookie = await unlock(app);
    const before = await shelf(app, beforeCookie);
    const offered = before.filter((unit) => unit.purchasable && unit.priceCents !== null);
    expect(offered).toHaveLength(18);

    requestNow = Date.parse(RAW_PEPTIDES_EXPIRES_AT) + offsetMs;
    // Mint a fresh session at this instant, so a session refusal cannot mask expiry.
    const expiredCookie = await unlock(app);
    const after = await shelf(app, expiredCookie);
    expect(after).toHaveLength(before.length);
    expect(after.filter((unit) => unit.purchasable)).toHaveLength(0);
    expect(after.every((unit) => unit.priceCents === null)).toBe(true);

    const response = await supertest(app).post(QUOTE).set("Cookie", expiredCookie).send({
      items: offered.slice(0, 2).map((unit) => ({
        productId: unit.productId, variantId: unit.variantId, quantity: 1,
        expectedUnitPriceCents: unit.priceCents, expectedCurrency: "USD",
      })),
      contact: ORDER_CONTACT, shipTo: SHIP_TO,
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("LINE_REFUSED");
    expect(response.body.lines).toHaveLength(2);
    expect(response.body.lines.every((line: { code: string }) => line.code === "PRODUCT_HELD")).toBe(true);
    expect(response.body.quote).toBeUndefined();
  });
});

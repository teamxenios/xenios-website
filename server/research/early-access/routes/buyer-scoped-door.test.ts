import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { BuyerPriceSheet, BuyerScopedPricing } from "../commerce/buyer-scoped-pricing";
import {
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  UNIT_PRICE_CENTS,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  makeEarlyAccessApp,
} from "./route-fixtures";

/**
 * BOTTOM-RIGHT ATTACK SUITE for the buyer-scoped pricing DOOR (832a020).
 *
 * The service-level suites prove the money writer; these attacks arrive the
 * way a real adversary arrives: over HTTP, through the registered app, with
 * a shared-password session and a hand-crafted body. The property under
 * attack is price ISOLATION at the one place money is authorized:
 *
 *   - a customer WITHOUT an entitlement must never place at the partner
 *     amount, even when it echoes the partner amount exactly;
 *   - a customer WITH an entitlement pays exactly the partner amount, and
 *     can no longer place at the public amount it is not being shown;
 *   - a broken provider RESTORES the public price, never invents one;
 *   - a replay returns the order as sold, at the amount it was sold for.
 */

const ORDERS = "/api/research/early-access/orders";
const PARTNER_PRICE_CENTS = 8_756;

async function openSession(app: Express): Promise<string> {
  const unlocked = await request(app)
    .post("/api/research/early-access/unlock")
    .send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(unlocked.status).toBe(200);
  const header = unlocked.headers["set-cookie"];
  const raw = Array.isArray(header) ? header[0] : String(header ?? "");
  const cookie = raw.split(";")[0] ?? "";
  expect(cookie.length).toBeGreaterThan(0);
  return cookie;
}

function sheetFor(unit: { productId: string; variantId: string }): BuyerPriceSheet {
  return {
    profileKey: "KRIS_VOLUME_PARTNER",
    entitlementId: "ent-attack-fixture",
    priceFor: (productId, variantId) =>
      productId === unit.productId && variantId === unit.variantId
        ? { amountCents: PARTNER_PRICE_CENTS, currency: "USD" }
        : null,
  };
}

async function doorApp(pricing: BuyerScopedPricing | undefined) {
  const unit = cleanUnit();
  const harness = makeEarlyAccessApp({
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    ...(pricing === undefined ? {} : { buyerScopedPrices: pricing }),
  });
  return { unit, ...harness };
}

async function place(app: Express, cookie: string, body: Record<string, unknown> = {}) {
  return request(app).post(ORDERS).set("Cookie", cookie).send({ ...ORDER_BODY, ...body });
}

describe("buyer-scoped pricing at the door: isolation attacks", () => {
  it("ATTACK: a customer with no entitlement echoing the exact partner amount is refused with the LEDGER amount", async () => {
    const provider: BuyerScopedPricing = {
      forCustomer: vi.fn(async () => null),
    };
    const { app } = await doorApp(provider);
    const cookie = await openSession(app);

    const placed = await place(app, cookie, {
      expectedUnitPriceCents: PARTNER_PRICE_CENTS,
    });

    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("PRICE_CHANGED");
    expect(placed.body.unitPriceCents).toBe(UNIT_PRICE_CENTS);
    expect(provider.forCustomer).toHaveBeenCalled();
  });

  it("an entitled customer places at exactly the partner amount, and the money is written at it", async () => {
    const { unit } = await doorApp(undefined);
    const provider: BuyerScopedPricing = {
      forCustomer: async () => sheetFor(unit),
    };
    const { app } = await doorApp(provider);
    const cookie = await openSession(app);

    const placed = await place(app, cookie, {
      expectedUnitPriceCents: PARTNER_PRICE_CENTS,
    });

    expect(placed.status).toBe(201);
    expect(placed.body.order.money.unitPriceCents).toBe(PARTNER_PRICE_CENTS);
    expect(placed.body.order.money.currency).toBe("USD");
  });

  it("ATTACK: an entitled customer echoing the PUBLIC ledger amount is refused; equality is against the authorized amount, not a range", async () => {
    const { unit } = await doorApp(undefined);
    const provider: BuyerScopedPricing = {
      forCustomer: async () => sheetFor(unit),
    };
    const { app } = await doorApp(provider);
    const cookie = await openSession(app);

    const placed = await place(app, cookie, {
      expectedUnitPriceCents: UNIT_PRICE_CENTS,
    });

    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("PRICE_CHANGED");
    expect(placed.body.unitPriceCents).toBe(PARTNER_PRICE_CENTS);
  });

  it("a throwing provider RESTORES the public price: ledger placement succeeds, partner placement refuses", async () => {
    const provider: BuyerScopedPricing = {
      forCustomer: async () => {
        throw new Error("provider outage");
      },
    };
    const { app } = await doorApp(provider);
    const cookie = await openSession(app);

    const partner = await place(app, cookie, {
      expectedUnitPriceCents: PARTNER_PRICE_CENTS,
      idempotencyKey: `${ORDER_BODY.idempotencyKey}-p`,
    });
    expect(partner.status).toBe(409);
    expect(partner.body.code).toBe("PRICE_CHANGED");

    const ledger = await place(app, cookie);
    expect(ledger.status).toBe(201);
    expect(ledger.body.order.money.unitPriceCents).toBe(UNIT_PRICE_CENTS);
  });

  it("a replay returns the order AS SOLD at the partner amount, not as currently priced", async () => {
    const { unit } = await doorApp(undefined);
    let entitled = true;
    const provider: BuyerScopedPricing = {
      forCustomer: async () => (entitled ? sheetFor(unit) : null),
    };
    const { app } = await doorApp(provider);
    const cookie = await openSession(app);

    const placed = await place(app, cookie, {
      expectedUnitPriceCents: PARTNER_PRICE_CENTS,
    });
    expect(placed.status).toBe(201);

    // The entitlement disappears between placement and replay; the sold order
    // must not re-price.
    entitled = false;
    const replayed = await place(app, cookie, {
      expectedUnitPriceCents: PARTNER_PRICE_CENTS,
    });
    expect(replayed.status).toBe(200);
    expect(replayed.body.replayed).toBe(true);
    expect(replayed.body.order.money.unitPriceCents).toBe(PARTNER_PRICE_CENTS);
  });

  it("NEGATIVE CONTROL: with no provider configured, the door is byte-identical to the ledger behaviour", async () => {
    const { app } = await doorApp(undefined);
    const cookie = await openSession(app);

    const placed = await place(app, cookie);
    expect(placed.status).toBe(201);
    expect(placed.body.order.money.unitPriceCents).toBe(UNIT_PRICE_CENTS);

    const forged = await place(app, cookie, {
      expectedUnitPriceCents: PARTNER_PRICE_CENTS,
      idempotencyKey: `${ORDER_BODY.idempotencyKey}-f`,
    });
    expect(forged.status).toBe(409);
    expect(forged.body.code).toBe("PRICE_CHANGED");
    expect(forged.body.unitPriceCents).toBe(UNIT_PRICE_CENTS);
  });
});

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { registerPrivateEarlyAccessApi } from "../register";
import {
  createEarlyAccessSessionIdReader,
  type PrivateAccessRouteDependencies,
} from "../private-access-routes";
import { InMemoryPrivateAccessSessionRepository } from "../private-access-session-repository";
import {
  InMemoryEarlyAccessCustomerRepository,
  createEarlyAccessCustomer,
  transitionEarlyAccessCustomer,
} from "../identity/early-access-customer";
import { InMemorySessionBindingStore } from "../identity/identity-verification";
import {
  EARLY_ACCESS_TEST_CONFIG,
  EARLY_ACCESS_TEST_PASSWORD,
  StubAgreementGate,
  StubReferralResolver,
  StubShippingPolicy,
  StubSupplierDirectory,
  SUPPLIER_ASSIGNMENT,
  sequentialOrderNumbers,
  sequentialProofIds,
} from "../routes/route-fixtures";
import {
  NO_RECORDED_LOTS_INVENTORY,
  canonicalReviewProducts,
} from "./first-release-canonical-source";
import {
  ProductControlCatalogSource,
  resolveEarlyAccessSettlementCurrency,
} from "../catalog/product-control-source";
import { ProductControlDeclaredFactsReader } from "../catalog/declared-facts-source";
import { InMemoryEarlyAccessReleaseLedger } from "./founder-release";
import {
  FOUNDER_FIRST_RELEASE_PRICING,
  seedFounderFirstRelease,
} from "./founder-first-release-seed";
import { seedRawPeptidesConfirmations } from "./founder-supply-seed";
import { InMemorySupplierConfirmationStore } from "../ops/supplier-confirmation";
import { SHIP_TO } from "../routes/route-fixtures";

const CATALOG_PATH = "/api/research/early-access/catalog";
const ORDERS_PATH = "/api/research/early-access/orders";
const UNLOCK = "/api/research/early-access/unlock";
const NOW_MS = Date.parse("2026-08-04T22:30:00.000Z");
const NOW_ISO = new Date(NOW_MS).toISOString();

/**
 * THE LIVE 22-ROW PROOF, against the REAL registration and the REAL
 * projection pipeline: the production catalog adapter, declared-facts
 * reader, eligibility gate, storefront, session wall, and identity
 * directory. The only substitutions are the ones the canonical review
 * itself states: the founder-locked products stand in for the Product
 * Control read, and the no-recorded-lots inventory answer is the truthful
 * answer for this repository.
 *
 * The founder's decision names 22 units. The founder-locked catalog can
 * name 14 of them exactly; the other 8 are reported unresolved, never bent
 * to fit, because a price may not invent an identity.
 */
async function harness() {
  const source = new ProductControlCatalogSource({
    catalog: { readCatalog: async () => canonicalReviewProducts() },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      currency: resolveEarlyAccessSettlementCurrency(),
    }),
  } as never);

  // Seed under the SAME audience the customer will be served with, so every
  // release fingerprint is one the customer projection reproduces.
  const seedProjection = await source.load(new Date(NOW_MS), {
    earlyAccessCustomer: { customerRef: "cus_live22" },
  });
  const ledger = new InMemoryEarlyAccessReleaseLedger();
  const outcome = await seedFounderFirstRelease({
    rows: seedProjection.rows as never,
    ledger,
  });

  const customers = new InMemoryEarlyAccessCustomerRepository();
  const sessionBindings = new InMemorySessionBindingStore();
  const created = createEarlyAccessCustomer({
    id: "cus_live22",
    email: "live22@example.invalid",
    legalName: "Live Catalog Proof Customer",
    phone: "+1 555 0122",
    now: NOW_ISO,
  });
  if (!created.ok) throw new Error("customer fixture invalid");
  const approved = transitionEarlyAccessCustomer({
    customer: created.value,
    to: "APPROVED",
    by: "Samuel Boadu",
    reason: "Live 22-row proof",
    now: NOW_ISO,
  });
  if (!approved.ok) throw new Error("approval fixture invalid");
  await customers.insert(approved.value);

  const app = express();
  app.use(express.json());
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    catalog: source,
    releases: ledger,
    customers,
    sessionBindings,
    agreements: new StubAgreementGate(true),
    suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
    orderNumber: sequentialOrderNumbers(),
    proofId: sequentialProofIds(),
    now: () => NOW_MS,
  });

  const readSessionId = createEarlyAccessSessionIdReader({
    config: EARLY_ACCESS_TEST_CONFIG,
    repository: new InMemoryPrivateAccessSessionRepository(),
    now: () => NOW_MS,
    randomToken: () => "unused",
  } as PrivateAccessRouteDependencies);

  return { app, outcome, sessionBindings, readSessionId };
}

async function boundSession(harnessed: Awaited<ReturnType<typeof harness>>) {
  const unlocked = await request(harnessed.app)
    .post(UNLOCK)
    .send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(unlocked.status).toBe(200);
  const raw = unlocked.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const cookie = cookies.map((entry) => entry.split(";")[0]).join("; ");
  const sessionId = harnessed.readSessionId(cookie);
  expect(sessionId).not.toBeNull();
  expect(await harnessed.sessionBindings.bind(sessionId as string, "cus_live22")).toBe(true);
  return cookie;
}

describe("the founder first-release seed against the founder-locked catalog", () => {
  it("resolves all 22 units exactly, with nothing unresolved and nothing bent", async () => {
    // The eight identities the founder supplied on 2026-08-05 closed the last
    // gaps. This assertion is the guard that matters: EVERY founder row must
    // resolve to exactly one catalogued unit by name AND exact strength, and
    // `unresolved` must be empty. If a future catalog edit renames a product
    // or moves a strength, this fails rather than quietly selling 21.
    const { outcome } = await harness();
    expect(outcome.unresolved).toEqual([]);
    // 22 resolved; one is deliberately held by the founder and therefore
    // never released, so 21 carry a release and all 22 still render.
    expect(outcome.seeded).toHaveLength(21);
    expect(outcome.founderHeld.map((hold) => hold.name)).toEqual(["Cagrilintide"]);
    expect(outcome.founderHeld[0]?.reason).toBe(
      "FOUNDER COMMERCIAL RELEASE NOT YET APPROVED",
    );
    expect(outcome.founderHeld[0]?.recordedBy).toBe("Samuel Boadu");

    // Unique product/strength pairs, so two founder rows can never collapse
    // onto one catalogued unit.
    const pairs = new Set(outcome.seeded.map((entry) => entry.sku));
    expect(pairs.size).toBe(21);
  });
});

describe("GET /api/research/early-access/catalog, mounted and live", () => {
  it("returns every seeded row to a bound approved customer, priced and truthfully held", async () => {
    const harnessed = await harness();
    const cookie = await boundSession(harnessed);

    const answered = await request(harnessed.app).get(CATALOG_PATH).set("Cookie", cookie);
    expect(answered.status).toBe(200);
    expect(answered.body.ok).toBe(true);

    const units = answered.body.units as ReadonlyArray<Record<string, unknown>>;
    // The customer sees exactly the units the founder released: 14 today,
    // and 22 the day the 8 gaps gain founder-locked identities.
    expect(units).toHaveLength(harnessed.outcome.seeded.length);
    const pairs = new Set(units.map((unit) => `${unit.canonicalName}|${unit.strength}`));
    expect(pairs.size).toBe(units.length);

    // Price mismatches = 0: every row that shows an amount shows the
    // founder's amount for that exact unit.
    const bySku = new Map(
      harnessed.outcome.seeded.map((entry) => [entry.sku, entry.input.unitPriceCents]),
    );
    let priced = 0;
    for (const unit of units) {
      const expected = bySku.get(unit.sku as string);
      expect(expected).toBeDefined();
      if (unit.priceCents !== null) {
        expect(unit.priceCents).toBe(expected);
        priced += 1;
      }
      expect(["AVAILABLE", "AVAILABILITY_CONFIRMATION_REQUIRED", "TEMPORARILY_HELD"]).toContain(
        unit.availability,
      );
    }
    expect(priced).toBeGreaterThan(0);

    // The truthful split for this repository: no inventory lots and no
    // supplier confirmations recorded yet, so nothing is AVAILABLE; every
    // clean unit awaits its availability confirmation; disputed or held
    // units stay TEMPORARILY_HELD with no amount shown.
    const byState = {
      AVAILABLE: units.filter((unit) => unit.availability === "AVAILABLE").length,
      AVAILABILITY_CONFIRMATION_REQUIRED: units.filter(
        (unit) => unit.availability === "AVAILABILITY_CONFIRMATION_REQUIRED",
      ).length,
      TEMPORARILY_HELD: units.filter((unit) => unit.availability === "TEMPORARILY_HELD").length,
    };
    expect(byState.AVAILABLE).toBe(0);
    expect(
      byState.AVAILABILITY_CONFIRMATION_REQUIRED + byState.TEMPORARILY_HELD,
    ).toBe(units.length);
    for (const unit of units) {
      if (unit.availability === "TEMPORARILY_HELD") {
        expect(unit.priceCents).toBeNull();
      } else {
        expect(unit.priceCents).not.toBeNull();
      }
      expect(unit.purchasable).toBe(false);
    }

    // eslint-disable-next-line no-console
    console.log(
      "[live-22 proof] rows:",
      units.length,
      "split:",
      JSON.stringify(byState),
      "rows detail:",
      units
        .map(
          (unit) =>
            `${unit.displayName} ${unit.strength} ${unit.priceCents ?? "-"} ${unit.availability}`,
        )
        .join("; "),
    );
  });

  it("answers a password-only session with zero authorized rows, all held on audience", async () => {
    const harnessed = await harness();
    const unlocked = await request(harnessed.app)
      .post(UNLOCK)
      .send({ password: EARLY_ACCESS_TEST_PASSWORD });
    const raw = unlocked.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    const cookie = cookies.map((entry) => entry.split(";")[0]).join("; ");

    const answered = await request(harnessed.app).get(CATALOG_PATH).set("Cookie", cookie);
    expect(answered.status).toBe(200);
    const units = answered.body.units as ReadonlyArray<Record<string, unknown>>;
    // The wall admits the session; identity does not exist, so every row is
    // unauthorized: nothing purchasable, nothing priced.
    for (const unit of units) {
      expect(unit.purchasable).toBe(false);
      expect(unit.priceCents).toBeNull();
    }
    expect(answered.body.purchasableCount).toBe(0);
  });
});

describe("the pricing input stays verbatim", () => {
  it("carries all 22 rows and the 14 distinct pinned prices", () => {
    expect(FOUNDER_FIRST_RELEASE_PRICING).toHaveLength(22);
    const distinct = new Set(FOUNDER_FIRST_RELEASE_PRICING.map((row) => row.unitPriceCents));
    expect(distinct).toEqual(
      new Set([
        5_600, 3_350, 4_750, 14_000, 7_000, 2_250, 4_200, 8_400, 5_050, 4_475,
        10_075, 3_925, 5_325, 10_650,
      ]),
    );
  });
});

describe("with Raw Peptides supply confirmed: the finish line", () => {
  const LIVE_NOW_MS = Date.parse("2026-08-05T00:30:00.000Z");

  async function confirmedHarness() {
    const confirmations = new InMemorySupplierConfirmationStore();
    const source = new ProductControlCatalogSource({
      catalog: { readCatalog: async () => canonicalReviewProducts() },
      declaredFacts: new ProductControlDeclaredFactsReader({
        inventory: NO_RECORDED_LOTS_INVENTORY,
        currency: resolveEarlyAccessSettlementCurrency(),
        supplierConfirmations: confirmations,
      }),
    } as never);

    const context = { earlyAccessCustomer: { customerRef: "cus_live22" } };
    // 1. Record the founder's supply confirmations (identity-only resolution).
    const before = await source.load(new Date(LIVE_NOW_MS), context);
    const supply = await seedRawPeptidesConfirmations({
      rows: before.rows as never,
      store: confirmations,
    });
    // 2. Re-project: fulfillment is now confirmation-backed on every resolved
    //    unit, and THIS is the world the founder releases against.
    const confirmed = await source.load(new Date(LIVE_NOW_MS), context);
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    const releases = await seedFounderFirstRelease({
      rows: confirmed.rows as never,
      ledger,
    });

    const customers = new InMemoryEarlyAccessCustomerRepository();
    const sessionBindings = new InMemorySessionBindingStore();
    const created = createEarlyAccessCustomer({
      id: "cus_live22",
      email: "live22@example.invalid",
      legalName: "Live Catalog Proof Customer",
      phone: "+1 555 0122",
      now: new Date(LIVE_NOW_MS).toISOString(),
    });
    if (!created.ok) throw new Error("customer fixture invalid");
    const approved = transitionEarlyAccessCustomer({
      customer: created.value,
      to: "APPROVED",
      by: "Samuel Boadu",
      reason: "Live finish-line proof",
      now: new Date(LIVE_NOW_MS).toISOString(),
    });
    if (!approved.ok) throw new Error("approval fixture invalid");
    await customers.insert(approved.value);

    const app = express();
    app.use(express.json());
    registerPrivateEarlyAccessApi(app, {
      config: EARLY_ACCESS_TEST_CONFIG,
      catalog: source,
      releases: ledger,
      customers,
      sessionBindings,
      supplierConfirmations: confirmations,
      agreements: new StubAgreementGate(true),
      suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
      shipping: new StubShippingPolicy(true),
      referrals: new StubReferralResolver(null),
      orderNumber: sequentialOrderNumbers(),
      proofId: sequentialProofIds(),
      now: () => LIVE_NOW_MS,
    });
    const readSessionId = createEarlyAccessSessionIdReader({
      config: EARLY_ACCESS_TEST_CONFIG,
      repository: new InMemoryPrivateAccessSessionRepository(),
      now: () => LIVE_NOW_MS,
      randomToken: () => "unused",
    } as PrivateAccessRouteDependencies);
    return { app, supply, releases, sessionBindings, readSessionId };
  }

  it("sells: confirmed supply plus founder release makes real units AVAILABLE, and an order lands", async () => {
    const harnessed = await confirmedHarness();
    // Supply is confirmed for all 22 (operational preparation continues for a
    // founder-held unit); only 21 carry a founder release.
    expect(harnessed.supply.seeded).toHaveLength(22);
    expect(harnessed.releases.seeded).toHaveLength(21);

    const unlocked = await request(harnessed.app)
      .post(UNLOCK)
      .send({ password: EARLY_ACCESS_TEST_PASSWORD });
    const raw = unlocked.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    const cookie = cookies.map((entry) => entry.split(";")[0]).join("; ");
    const sessionId = harnessed.readSessionId(cookie);
    expect(await harnessed.sessionBindings.bind(sessionId as string, "cus_live22")).toBe(true);

    const answered = await request(harnessed.app).get(CATALOG_PATH).set("Cookie", cookie);
    expect(answered.status).toBe(200);
    const units = answered.body.units as ReadonlyArray<Record<string, unknown>>;
    // The founder-held unit is NOT released, so the customer catalog (scoped
    // to released units) shows 21. It stays fully visible in Product Control
    // and every internal surface.
    expect(units).toHaveLength(21);
    expect(units.some((unit) => unit.canonicalName === "Cagrilintide Research Material")).toBe(
      false,
    );

    const available = units.filter((unit) => unit.availability === "AVAILABLE");
    const held = units.filter((unit) => unit.availability === "TEMPORARILY_HELD");
    // Every founder row is visible. Units carrying a recorded dispute or hold
    // stay truthfully held rather than being forced available, and the two
    // counts must account for all 22 with nothing dropped.
    expect(available.length + held.length).toBe(21);
    expect(available.length).toBeGreaterThan(0);
    for (const unit of available) {
      expect(unit.purchasable).toBe(true);
      expect(unit.priceCents).not.toBeNull();
    }

    // Buy one: PT-141 10 mg at the founder's 3,925 cents.
    const pt141 = available.find((unit) => unit.sku === "R360-PT141-10MG-VIAL");
    expect(pt141).toBeDefined();
    expect(pt141?.priceCents).toBe(3_925);
    const placed = await request(harnessed.app)
      .post(ORDERS_PATH)
      .set("Cookie", cookie)
      .send({
        idempotencyKey: "ea-finish-line-order-0001",
        productId: pt141?.productId,
        variantId: pt141?.variantId,
        quantity: 3,
        expectedUnitPriceCents: 3_925,
        expectedCurrency: "USD",
        shipTo: SHIP_TO,
      });
    expect(placed.status).toBe(201);
    // Three units carry the 20 percent bundle: 11,775 less 2,355 is 9,420.
    expect(placed.body.order.money.subtotalCents).toBe(11_775);
    expect(placed.body.order.money.payableTotalCents).toBe(9_420);

    // eslint-disable-next-line no-console
    console.log(
      "[finish-line] available:",
      available.length,
      "held:",
      held.length,
      "order:",
      placed.body.order.orderNumber,
      "payable:",
      placed.body.order.money.payableTotalCents,
    );
  });
});

import express, { type Express } from "express";
import supertest from "supertest";
import { describe, expect, it } from "vitest";

import { registerPrivateEarlyAccessApi } from "../register";
import { EARLY_ACCESS_CART_ENV } from "./feature-flag";
import { InMemoryEarlyAccessCartStore } from "./store";
import {
  ProductControlCatalogSource,
  resolveEarlyAccessSettlementCurrency,
} from "../catalog/product-control-source";
import { ProductControlDeclaredFactsReader } from "../catalog/declared-facts-source";
import {
  NO_RECORDED_LOTS_INVENTORY,
  canonicalReviewProducts,
} from "../release/first-release-canonical-source";
import {
  InMemoryEarlyAccessReleaseLedger,
  earlyAccessReleaseVersion,
  isNonwaivableBlocker,
  EARLY_ACCESS_NONWAIVABLE_BLOCKERS,
} from "../release/founder-release";
import { seedFounderFirstRelease } from "../release/founder-first-release-seed";
import { seedRawPeptidesConfirmations } from "../release/founder-supply-seed";
import { InMemorySupplierConfirmationStore } from "../ops/supplier-confirmation";
import { decideSupplierAvailability } from "../ops/supplier-availability";
import { quoteEarlyAccessCart } from "./quote-service";
import type { EarlyAccessSupplierAssignment, EarlyAccessSupplierDirectory } from "../routes/ports";
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
 * M13: ONE SUPPLIER AUTHORITY, AND A NET THAT NOTICES WHEN IT STOPS BEING ASKED.
 *
 * The behaviour was already correct at the reviewed SHA. The REGRESSION NET was
 * not: an independent review disabled BOTH production supplier gates and the
 * entire Early Access server suite stayed green at 1491 passed, 0 failed. A
 * gate no test defends is a gate that will be removed by someone who has a good
 * reason and no way to find out they were wrong.
 *
 * The two gates that actually run in production are:
 *
 *   1. `SupplierConsistentCatalogSource` (ops/supplier-availability.ts), wrapped
 *      around the catalogue source at the composition root. It re-decides
 *      `purchasable` against the mounted directory and can only ever WITHDRAW.
 *   2. The supplier check in `quote-service.ts`, which refuses a cart line whose
 *      unit is not supplier-ready or whose route is missing or malformed.
 *
 * (`cart/supplier-consistency.ts` exports a third helper with the same shape.
 * It has no production call site, so disabling it alone changes nothing a
 * customer can see. These tests deliberately exercise the mounted path.)
 *
 * Everything below drives the REAL Product Control projection, the REAL founder
 * release ledger and the REAL registration over HTTP, with ONE supplier
 * directory instance shared by every door. The directory is genuinely
 * consulted, never bypassed: a fixture that answers "yes" to everything would
 * prove nothing, so a route can be revoked mid-test and the shelf must notice.
 */

const UNLOCK = "/api/research/early-access/unlock";
const CATALOG = "/api/research/early-access/catalog";
const QUOTE = "/api/research/early-access/cart/quote";
const CHECKOUT = "/api/research/early-access/cart/checkout";

const CART_ON = { NODE_ENV: "test", [EARLY_ACCESS_CART_ENV]: "true" } as NodeJS.ProcessEnv;

type Unit = Readonly<{
  productId: string;
  variantId: string;
  displayName: string;
  purchasable: boolean;
  availability: string;
  priceCents: number | null;
}>;

/**
 * The mounted supplier authority, under test control.
 *
 * `forUnit` is the real interface every door calls. `revoke`, `corrupt` and
 * `expire` change what it answers, which is the whole point: the shelf and the
 * cart must both follow it, and `calls` records who actually asked.
 */
class ControlledSupplierDirectory implements EarlyAccessSupplierDirectory {
  readonly calls: string[] = [];
  private readonly overrides = new Map<string, EarlyAccessSupplierAssignment | null>();
  /** Units whose confirmation has lapsed. A lapsed unit is simply not routable. */
  private readonly expired = new Set<string>();

  private key(productId: string, variantId: string): string {
    return `${productId}\u0000${variantId}`;
  }

  async forUnit(productId: string, variantId: string): Promise<EarlyAccessSupplierAssignment | null> {
    const key = this.key(productId, variantId);
    this.calls.push(key);
    // Expiry is answered exactly as the production directory answers it: the
    // RPC's `expires_at > now` filter simply does not return the row, so an
    // expired unit arrives downstream as a MISSING route and fails closed.
    if (this.expired.has(key)) return null;
    if (this.overrides.has(key)) return this.overrides.get(key) ?? null;
    return Object.freeze({ supplierId: "supplier-apex", supplierSku: `APEX-${productId}` });
  }

  revoke(productId: string, variantId: string): void {
    this.overrides.set(this.key(productId, variantId), null);
  }

  corrupt(
    productId: string,
    variantId: string,
    route: EarlyAccessSupplierAssignment,
  ): void {
    this.overrides.set(this.key(productId, variantId), route);
  }

  expire(productId: string, variantId: string): void {
    this.expired.add(this.key(productId, variantId));
  }

  asked(productId: string, variantId: string): number {
    return this.calls.filter((entry) => entry === this.key(productId, variantId)).length;
  }

  resetCalls(): void {
    this.calls.length = 0;
  }
}

async function realApp(): Promise<{
  app: Express;
  suppliers: ControlledSupplierDirectory;
  ledger: InMemoryEarlyAccessReleaseLedger;
  cartStore: InMemoryEarlyAccessCartStore;
}> {
  const confirmations = new InMemorySupplierConfirmationStore();
  const source = new ProductControlCatalogSource({
    catalog: { readCatalog: async () => canonicalReviewProducts() },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      currency: resolveEarlyAccessSettlementCurrency(),
      supplierConfirmations: confirmations,
    }),
  } as never);

  const now = Date.now();
  const context = { earlyAccessCustomer: { customerRef: "cus_supplier_authority" } };
  const before = await source.load(new Date(now), context);
  await seedRawPeptidesConfirmations({ rows: before.rows as never, store: confirmations });
  const confirmed = await source.load(new Date(now), context);
  const ledger = new InMemoryEarlyAccessReleaseLedger();
  const releases = await seedFounderFirstRelease({ rows: confirmed.rows as never, ledger });

  // ONE instance. register.ts hands the same object to the catalogue decorator,
  // the single-product order route, the cart quote and the cart checkout, so
  // "the same authority governs all of them" is a fact about the wiring rather
  // than a claim in a comment.
  const suppliers = new ControlledSupplierDirectory();

  const cartStore = new InMemoryEarlyAccessCartStore();
  const app = express();
  app.use(express.json());
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    sessionIdentity: true,
    env: CART_ON,
    cartStore,
    catalog: source,
    releases: ledger,
    supplierConfirmations: confirmations,
    founderHeldUnits: releases.founderHeldUnits,
    agreements: new StubAgreementGate(true),
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
    suppliers,
  });
  return { app, suppliers, ledger, cartStore };
}

async function unlock(app: Express): Promise<string> {
  const response = await supertest(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(response.status).toBe(200);
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

async function shelf(app: Express, cookie: string): Promise<readonly Unit[]> {
  const response = await supertest(app).get(CATALOG).set("Cookie", cookie);
  expect(response.status).toBe(200);
  return response.body.units as readonly Unit[];
}

function unitOn(units: readonly Unit[], productId: string): Unit {
  const found = units.find((unit) => unit.productId === productId);
  if (!found) throw new Error(`${productId} is not on the shelf at all`);
  return found;
}

async function quoteOne(app: Express, cookie: string, unit: Unit, quantity = 1) {
  return supertest(app)
    .post(QUOTE)
    .set("Cookie", cookie)
    .send({
      items: [
        {
          productId: unit.productId,
          variantId: unit.variantId,
          quantity,
          expectedUnitPriceCents: unit.priceCents ?? 1_000,
          expectedCurrency: "USD",
        },
      ],
      contact: ORDER_CONTACT,
      shipTo: SHIP_TO,
    });
}

/** Any unit the real shelf is currently selling. Never a hardcoded assumption. */
function firstPurchasable(units: readonly Unit[]): Unit {
  const found = units.find((unit) => unit.purchasable && unit.priceCents !== null);
  if (!found) throw new Error("the shelf is selling nothing, so these tests prove nothing");
  return found;
}

describe("G: a genuinely routed unit is sold, and the same unit can be quoted", () => {
  it("a routed unit is purchasable on the shelf and quotable in the cart", async () => {
    const { app, suppliers } = await realApp();
    const cookie = await unlock(app);
    const units = await shelf(app, cookie);
    const unit = firstPurchasable(units);

    expect(unit.purchasable).toBe(true);
    expect(unit.priceCents).toBeGreaterThan(0);

    const quoted = await quoteOne(app, cookie, unit);
    expect(quoted.status).toBe(200);
    expect(quoted.body.quote.lines).toHaveLength(1);
    // CORRECTED. This previously asserted that the CUSTOMER response carried
    // supplierId and supplierSku, which pinned a P0 privacy defect in place: who
    // fulfils an order is commercially sensitive and is none of the purchaser's
    // business (EARLY_ACCESS_CART_FORBIDDEN_CUSTOMER_KEYS). The property that
    // actually matters here is that the quote CONSULTED the supplier authority,
    // which the directory's own call counter proves without disclosing anything,
    // and the internal result still carries the route (proved directly in the
    // service-level suite below, and by the committed checkout in D).
    expect(quoted.body.quote.lines[0].supplierId).toBeUndefined();
    expect(quoted.body.quote.lines[0].supplierSku).toBeUndefined();
    expect(suppliers.asked(unit.productId, unit.variantId)).toBeGreaterThan(0);
  });

  it("AOD-9604 specifically, while it remains on the shelf as purchasable", async () => {
    const { app } = await realApp();
    const cookie = await unlock(app);
    const units = await shelf(app, cookie);
    const aod = units.find((unit) => unit.productId === "PEX-012");
    // Never forced. If the real facts change and AOD is no longer sold, the
    // claim under test is simply not available to make, and saying so is
    // more honest than pinning a product to a number.
    if (aod === undefined || !aod.purchasable) {
      expect(aod === undefined || aod.priceCents).toBeNull();
      return;
    }
    const quoted = await quoteOne(app, cookie, aod, 3);
    expect(quoted.status).toBe(200);
    expect(quoted.body.quote.lines[0].productId).toBe("PEX-012");
    expect(quoted.body.quote.payableTotalCents).toBeGreaterThan(0);
  });
});

describe("A and C: losing the supplier route withdraws the unit from every door", () => {
  it("the shelf holds it, prices it at nothing, and the cart refuses the line", async () => {
    const { app, suppliers } = await realApp();
    const cookie = await unlock(app);
    const before = await shelf(app, cookie);
    const unit = firstPurchasable(before);
    expect(unit.purchasable).toBe(true);

    // The supplier authority stops routing this exact unit. Nothing else changes:
    // the release still exists, the price is still approved, the projection is
    // untouched.
    suppliers.revoke(unit.productId, unit.variantId);

    const after = await shelf(app, cookie);
    const withdrawn = unitOn(after, unit.productId);
    expect(withdrawn.purchasable).toBe(false);
    expect(withdrawn.availability).toBe("TEMPORARILY_HELD");
    // No amount beside a unit nobody can ship: a price there reads as an offer.
    expect(withdrawn.priceCents).toBeNull();
    // And it stays VISIBLE rather than vanishing, which is the accepted
    // behaviour for a held unit.
    expect(after).toHaveLength(before.length);

    const quoted = await quoteOne(app, cookie, unit);
    expect(quoted.status).toBe(409);
    expect(quoted.body.code).toBe("LINE_REFUSED");
    expect(quoted.body.lines).toHaveLength(1);
    expect(quoted.body.lines[0].productId).toBe(unit.productId);
    // PRODUCT_HELD or SUPPLIER_UNAVAILABLE are both truthful here; what may
    // never happen is a quote.
    expect(["PRODUCT_HELD", "SUPPLIER_UNAVAILABLE"]).toContain(quoted.body.lines[0].code);
    expect(quoted.body.quote).toBeUndefined();
  });

  it("no quote means no checkout: an unroutable unit cannot become an order", async () => {
    const { app, suppliers } = await realApp();
    const cookie = await unlock(app);
    const unit = firstPurchasable(await shelf(app, cookie));
    suppliers.revoke(unit.productId, unit.variantId);

    const quoted = await quoteOne(app, cookie, unit);
    expect(quoted.status).toBe(409);
    expect(quoted.body.quote).toBeUndefined();

    // The only route to a checkout is a quote id the server issued, and it
    // issued none. A fabricated one is refused exactly as a missing one is.
    const attempted = await supertest(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: "xeaq_supplierauthority0001",
      idempotencyKey: "xeac_supplierauthority001",
      expectedIntentHash: "a".repeat(64),
    });
    expect(attempted.status).toBe(404);
    expect(attempted.body.code).toBe("QUOTE_NOT_FOUND");
    expect(attempted.body.checkout).toBeUndefined();
  });

  it("a cart of two lines refuses ONLY the unroutable one, and still creates nothing", async () => {
    const { app, suppliers } = await realApp();
    const cookie = await unlock(app);
    const units = await shelf(app, cookie);
    const sellable = units.filter((unit) => unit.purchasable && unit.priceCents !== null);
    expect(sellable.length).toBeGreaterThan(1);
    const [keep, lose] = sellable;

    suppliers.revoke(lose!.productId, lose!.variantId);

    const quoted = await supertest(app)
      .post(QUOTE)
      .set("Cookie", cookie)
      .send({
        items: [keep!, lose!].map((unit) => ({
          productId: unit.productId,
          variantId: unit.variantId,
          quantity: 1,
          expectedUnitPriceCents: unit.priceCents,
          expectedCurrency: "USD",
        })),
        contact: ORDER_CONTACT,
        shipTo: SHIP_TO,
      });

    expect(quoted.status).toBe(409);
    expect(quoted.body.code).toBe("LINE_REFUSED");
    // Line specific, so the customer is told WHICH line and why.
    expect(quoted.body.lines).toHaveLength(1);
    expect(quoted.body.lines[0].productId).toBe(lose!.productId);
    // A partly acceptable cart is not partly quoted.
    expect(quoted.body.quote).toBeUndefined();
  });
});

describe("B: catalogue, quote and checkout consult the SAME authority", () => {
  it("the catalogue asks the mounted directory, and so does the quote", async () => {
    const { app, suppliers, cartStore } = await realApp();
    const cookie = await unlock(app);

    suppliers.resetCalls();
    const units = await shelf(app, cookie);
    const shelfCalls = suppliers.calls.length;
    // The shelf really did consult it, rather than deciding on its own.
    expect(shelfCalls).toBeGreaterThan(0);

    const unit = firstPurchasable(units);
    suppliers.resetCalls();
    const quoted = await quoteOne(app, cookie, unit);
    expect(quoted.status).toBe(200);
    expect(suppliers.asked(unit.productId, unit.variantId)).toBeGreaterThan(0);

    // And the route the CHECKOUT will ship against is the one that directory
    // gave the quote, carried through onto the committed child order.
    const placed = await supertest(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: quoted.body.quote.quoteId,
      idempotencyKey: "xeac_supplierauthority002",
      expectedIntentHash: quoted.body.quote.intentHash,
    });
    expect(placed.status).toBe(201);
    expect(placed.body.checkout.children).toHaveLength(1);
    expect(placed.body.checkout.children[0].supplierId).toBeUndefined();
    expect(placed.body.checkout.children[0].supplierSku).toBeUndefined();
    const committed = await cartStore.byCheckoutNumber(placed.body.checkout.cartCheckoutNumber);
    expect(committed?.children[0].supplierId).toBe("supplier-apex");
    expect(committed?.children[0].supplierSku).toBe(`APEX-${unit.productId}`);
    // Never blank, and never invented to make the release group succeed.
    expect(committed?.children[0].supplierId).not.toBe("");
    expect(committed?.children[0].supplierSku).not.toBe("");
  });
});

describe("E: a malformed supplier identifier cannot manufacture a route", () => {
  it.each([
    ["a blank supplier id", { supplierId: "", supplierSku: "APEX-OK" }],
    ["a blank supplier sku", { supplierId: "supplier-apex", supplierSku: "" }],
    ["whitespace in the supplier id", { supplierId: "supplier apex", supplierSku: "APEX-OK" }],
    ["a newline in the supplier sku", { supplierId: "supplier-apex", supplierSku: "APEX\nOK" }],
    ["a control character", { supplierId: "supplier-apex", supplierSku: "APEX\u0000OK" }],
    ["an absurdly long identifier", { supplierId: "s".repeat(400), supplierSku: "APEX-OK" }],
  ])("%s withdraws the unit and refuses the line", async (_name, route) => {
    const { app, suppliers } = await realApp();
    const cookie = await unlock(app);
    const unit = firstPurchasable(await shelf(app, cookie));

    suppliers.corrupt(unit.productId, unit.variantId, route as EarlyAccessSupplierAssignment);

    const withdrawn = unitOn(await shelf(app, cookie), unit.productId);
    expect(withdrawn.purchasable).toBe(false);
    expect(withdrawn.priceCents).toBeNull();

    const quoted = await quoteOne(app, cookie, unit);
    expect(quoted.status).toBe(409);
    expect(quoted.body.quote).toBeUndefined();
  });

  it("the shared decision function agrees, so the two doors cannot drift", async () => {
    const directory = new ControlledSupplierDirectory();
    directory.corrupt("P", "V", { supplierId: "", supplierSku: "OK" } as EarlyAccessSupplierAssignment);
    await expect(decideSupplierAvailability(directory, "P", "V")).resolves.toMatchObject({
      available: false,
      reason: "SUPPLIER_ID_INVALID",
    });
    directory.corrupt("P2", "V2", { supplierId: "supplier-apex", supplierSku: "bad sku" } as EarlyAccessSupplierAssignment);
    await expect(decideSupplierAvailability(directory, "P2", "V2")).resolves.toMatchObject({
      available: false,
      reason: "SUPPLIER_SKU_INVALID",
    });
    directory.revoke("P3", "V3");
    await expect(decideSupplierAvailability(directory, "P3", "V3")).resolves.toMatchObject({
      available: false,
      reason: "ROUTE_MISSING",
    });
  });
});

describe("F: an expired supplier confirmation fails closed", () => {
  it("a lapsed confirmation withdraws the unit rather than selling it", async () => {
    const { app, suppliers } = await realApp();
    const cookie = await unlock(app);
    const unit = firstPurchasable(await shelf(app, cookie));

    // Exactly how production expiry arrives: the directory's `expires_at > now`
    // filter stops returning the row, so the unit reads as unroutable.
    suppliers.expire(unit.productId, unit.variantId);

    const withdrawn = unitOn(await shelf(app, cookie), unit.productId);
    expect(withdrawn.purchasable).toBe(false);
    expect(withdrawn.availability).toBe("TEMPORARILY_HELD");
    expect(withdrawn.priceCents).toBeNull();

    const quoted = await quoteOne(app, cookie, unit);
    expect(quoted.status).toBe(409);
    expect(quoted.body.quote).toBeUndefined();
  });

  it("every unit lapsing empties the shelf of offers rather than selling them all", async () => {
    const { app, suppliers } = await realApp();
    const cookie = await unlock(app);
    const before = await shelf(app, cookie);
    for (const unit of before) suppliers.expire(unit.productId, unit.variantId);

    const after = await shelf(app, cookie);
    expect(after.filter((unit) => unit.purchasable)).toHaveLength(0);
    expect(after.filter((unit) => unit.priceCents !== null)).toHaveLength(0);
    // Still visible and truthfully held, not silently vanished.
    expect(after).toHaveLength(before.length);
  });
});

describe("D: a founder release cannot waive the supplier requirement", () => {
  it("SUPPLIER_NOT_ASSIGNED is non-waivable, by declaration", () => {
    expect(isNonwaivableBlocker("SUPPLIER_NOT_ASSIGNED")).toBe(true);
    expect(isNonwaivableBlocker("FULFILLMENT_UNAVAILABLE")).toBe(true);
    expect(EARLY_ACCESS_NONWAIVABLE_BLOCKERS).toContain("SUPPLIER_NOT_ASSIGNED");
  });

  it("the ledger refuses a release that tries to waive it", async () => {
    const { ledger } = await realApp();
    const appended = await ledger.append({
      releaseId: "rel-supplier-waiver-attempt",
      productId: "PEX-001",
      variantId: "R360-BPC157-10MG-VIAL",
      productVersion: "f".repeat(64),
      status: "approved",
      approvedPriceCents: 4_750,
      currency: "USD",
      waivedBlockers: ["SUPPLIER_NOT_ASSIGNED"],
      approvedQuantityLimit: 3,
      expiresAt: null,
      actor: "Samuel Boadu",
      reason: "Attempting to bridge a supplier gap that may not be bridged.",
      recordedAt: new Date(Date.UTC(2026, 7, 1)).toISOString(),
    } as never);
    expect(appended.ok).toBe(false);
    if (!appended.ok) expect(appended.code).toBe("NONWAIVABLE_BLOCKER");
  });

  it("an APPROVED release and an approved PRICE still do not put an unroutable unit on the shelf", async () => {
    const { app, suppliers } = await realApp();
    const cookie = await unlock(app);
    const unit = firstPurchasable(await shelf(app, cookie));
    // This unit has a real, approved, founder-priced release right now: it was
    // just being sold. Removing only the supplier route must be enough.
    suppliers.revoke(unit.productId, unit.variantId);

    const withdrawn = unitOn(await shelf(app, cookie), unit.productId);
    expect(withdrawn.purchasable).toBe(false);
    expect(withdrawn.priceCents).toBeNull();

    // And the price the founder approved is not resurrected by asking for it.
    const quoted = await quoteOne(app, cookie, {
      ...unit,
      priceCents: unit.priceCents,
    });
    expect(quoted.status).toBe(409);
    expect(quoted.body.quote).toBeUndefined();
  });
});

/**
 * GATE 2, ON ITS OWN.
 *
 * The tests above drive the mounted composition, where the catalogue decorator
 * withdraws an unroutable unit BEFORE the quote is reached. That is correct,
 * and it also MASKS the second gate: disabling the quote-service supplier check
 * alone leaves every test above green, because the line is already refused as
 * PRODUCT_HELD. Measured, not assumed.
 *
 * So the second gate needs its own tests, exercising the real quote service
 * against a catalogue that still calls the unit sellable. That is not a
 * contrived state: it is exactly what a deployment with no supplier authority
 * mounted looks like (register.ts only wraps the catalogue when a directory is
 * supplied), and it is what a stale or cached projection looks like. Defence in
 * depth is only defence if the inner layer is tested with the outer one absent.
 */
describe("gate 2 in isolation: the quote refuses even when the shelf did not", () => {
  const customer = { customerRef: "eac_0123456789abcdef0123456789abcdef" };

  const sellableUnit = Object.freeze({
    productId: "PEX-001",
    variantId: "R360-BPC157-10MG-VIAL",
    displayName: "BPC-157 Research Material",
    strength: "10 mg",
    sku: "R360-BPC157-10MG-VIAL",
    purchasable: true,
    availability: "AVAILABLE",
    priceCents: 4_750,
    currency: "USD",
    quantityLimit: 3,
    supplierReady: true,
  });

  function quoteDeps(
    overrides: Readonly<{
      supplier?: EarlyAccessSupplierAssignment | null;
      supplierReady?: boolean;
    }> = {},
  ) {
    const unit = { ...sellableUnit, supplierReady: overrides.supplierReady ?? true };
    return {
      // A catalogue that is STILL SELLING the unit: gate 1 is not in the way.
      catalog: { units: async () => [unit] },
      releases: {
        decide: async () => ({
          released: true as const,
          priceCents: 4_750,
          currency: "USD" as const,
          promotion: { promotionId: null, version: null, label: null, discountCents: 0 },
        }),
      },
      suppliers: {
        forUnit: async () =>
          overrides.supplier === undefined
            ? { supplierId: "supplier-apex", supplierSku: "APEX-PEX-001" }
            : overrides.supplier,
      },
      shipping: {
        serves: async () => true,
        quote: async () => ({ currency: "USD" as const, shippingCents: 0 }),
      },
      agreements: { accepted: async () => true },
      quotes: new InMemoryEarlyAccessCartStore(),
      now: () => Date.parse("2026-08-08T10:00:00.000Z"),
      quoteId: () => "xeaq_gatetwo000000000001",
    };
  }

  function cartRequest() {
    return {
      items: [
        {
          productId: sellableUnit.productId,
          variantId: sellableUnit.variantId,
          quantity: 1,
          expectedUnitPriceCents: 4_750,
          expectedCurrency: "USD" as const,
        },
      ],
      contact: ORDER_CONTACT,
      shipTo: SHIP_TO,
    };
  }

  it("a missing route is refused SUPPLIER_UNAVAILABLE, not quoted", async () => {
    const result = await quoteEarlyAccessCart(quoteDeps({ supplier: null }) as never, customer, cartRequest());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("LINE_REFUSED");
    expect(result.lines).toHaveLength(1);
    expect(result.lines![0]!.code).toBe("SUPPLIER_UNAVAILABLE");
  });

  it("a unit the projection says is NOT supplier-ready is refused", async () => {
    const result = await quoteEarlyAccessCart(
      quoteDeps({ supplierReady: false }) as never,
      customer,
      cartRequest(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.lines![0]!.code).toBe("SUPPLIER_UNAVAILABLE");
  });

  it.each([
    ["a blank supplier id", { supplierId: "", supplierSku: "APEX-OK" }],
    ["a blank supplier sku", { supplierId: "supplier-apex", supplierSku: "" }],
    ["a space in the supplier id", { supplierId: "supplier apex", supplierSku: "APEX-OK" }],
    ["a newline in the supplier sku", { supplierId: "supplier-apex", supplierSku: "APEX\nOK" }],
    ["an over-long supplier id", { supplierId: "s".repeat(400), supplierSku: "APEX-OK" }],
  ])("%s cannot manufacture a route", async (_name, supplier) => {
    const result = await quoteEarlyAccessCart(
      quoteDeps({ supplier: supplier as EarlyAccessSupplierAssignment }) as never,
      customer,
      cartRequest(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.lines![0]!.code).toBe("SUPPLIER_UNAVAILABLE");
  });

  it("a real route quotes, so the refusals above are the gate and not a broken fixture", async () => {
    const result = await quoteEarlyAccessCart(quoteDeps() as never, customer, cartRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.lines).toHaveLength(1);
    expect(result.quote.lines[0]!.supplierId).toBe("supplier-apex");
    expect(result.quote.lines[0]!.supplierSku).toBe("APEX-PEX-001");
  });

  it("with NO supplier authority mounted at all, the cart still refuses", async () => {
    // register.ts wraps the catalogue only when a directory is supplied, so a
    // deployment that mounts none has NO gate 1. The cart must still refuse
    // rather than sell a unit it cannot route.
    const confirmations = new InMemorySupplierConfirmationStore();
    const source = new ProductControlCatalogSource({
      catalog: { readCatalog: async () => canonicalReviewProducts() },
      declaredFacts: new ProductControlDeclaredFactsReader({
        inventory: NO_RECORDED_LOTS_INVENTORY,
        currency: resolveEarlyAccessSettlementCurrency(),
        supplierConfirmations: confirmations,
      }),
    } as never);
    const now = Date.now();
    const context = { earlyAccessCustomer: { customerRef: "cus_no_supplier_authority" } };
    const before = await source.load(new Date(now), context);
    await seedRawPeptidesConfirmations({ rows: before.rows as never, store: confirmations });
    const confirmed = await source.load(new Date(now), context);
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    const releases = await seedFounderFirstRelease({ rows: confirmed.rows as never, ledger });

    const app = express();
    app.use(express.json());
    registerPrivateEarlyAccessApi(app, {
      config: EARLY_ACCESS_TEST_CONFIG,
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
      // deliberately NO `suppliers`
    });

    const cookie = await unlock(app);
    const units = await shelf(app, cookie);
    const offered = units.filter((unit) => unit.purchasable && unit.priceCents !== null);
    // Whatever the unwrapped shelf happens to offer, NONE of it may be quoted,
    // because nothing in this process can route any of it.
    for (const unit of offered.slice(0, 3)) {
      const quoted = await quoteOne(app, cookie, unit);
      expect(quoted.status).toBe(409);
      expect(quoted.body.code).toBe("LINE_REFUSED");
      expect(quoted.body.lines[0].code).toBe("SUPPLIER_UNAVAILABLE");
      expect(quoted.body.quote).toBeUndefined();
    }
  });
});

describe("the shelf stays internally consistent under supplier truth", () => {
  it("every purchasable unit has a price and every held unit has none", async () => {
    const { app, suppliers } = await realApp();
    const cookie = await unlock(app);
    const units = await shelf(app, cookie);
    for (const unit of units) {
      if (unit.purchasable) expect(unit.priceCents).toBeGreaterThan(0);
      else expect(unit.priceCents).toBeNull();
    }

    // Revoking one route may only ever REDUCE what is on offer.
    const sellable = units.filter((unit) => unit.purchasable);
    suppliers.revoke(sellable[0]!.productId, sellable[0]!.variantId);
    const after = await shelf(app, cookie);
    expect(after.filter((unit) => unit.purchasable).length).toBe(sellable.length - 1);
    for (const unit of after) {
      if (unit.purchasable) expect(unit.priceCents).toBeGreaterThan(0);
      else expect(unit.priceCents).toBeNull();
    }
  });
});

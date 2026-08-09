import express, { type Express, type NextFunction, type Request, type Response } from "express";
import supertest from "supertest";
import { describe, expect, it } from "vitest";
import type { EarlyAccessCartQuoteRequest } from "@shared/research/early-access-cart";

import { registerPrivateEarlyAccessApi } from "../register";
import { earlyAccessReleaseVersion } from "../release/founder-release";
import { EARLY_ACCESS_CART_ENV } from "./feature-flag";
import { InMemoryEarlyAccessCartStore } from "./store";
import { SupabaseEarlyAccessCartStore } from "./supabase-store";
import { checkoutEarlyAccessCart } from "./checkout-service";
import { quoteEarlyAccessCart } from "./quote-service";
import type { CartCatalogUnit, CartStorePorts } from "./ports";
import {
  EARLY_ACCESS_TEST_CONFIG,
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_CONTACT,
  SHIP_TO,
  StubAgreementGate,
  StubReferralResolver,
  StubShippingPolicy,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  sequentialOrderNumbers,
  sequentialProofIds,
} from "../routes/route-fixtures";

/**
 * THE SETTLEMENT DOOR, ATTACKED.
 *
 * Settling a cart is the single most consequential action in this system: it
 * says a human confirmed real money arrived, and it releases product to
 * suppliers. Everything below tries to make it lie.
 *
 * The rules it must not break:
 *   - external proof metadata is NOT payment;
 *   - a blank or unknown actor settles nothing;
 *   - one confirmation creates exactly one settlement, one receipt and every
 *     child release, or none of them;
 *   - a retry is the same settlement, never a second receipt or a duplicate
 *     supplier release;
 *   - an existing settlement that cannot be read is a FAILURE, never a
 *     fabricated success;
 *   - mixed suppliers stay separate at release and single at payment;
 *   - and the whole path emits ZERO affiliate commission events.
 */

const UNLOCK = "/api/research/early-access/unlock";
const QUOTE = "/api/research/early-access/cart/quote";
const CHECKOUT = "/api/research/early-access/cart/checkout";
const CART = "/api/research/early-access/cart";
const ADMIN = "/api/admin/research/cart";

const CART_ON = { NODE_ENV: "test", [EARLY_ACCESS_CART_ENV]: "true" } as NodeJS.ProcessEnv;
const ADMIN_EMAIL = "named.operator@xeniostechnology.com";

type AuditEvent = Readonly<{ event: string; actor?: string; detail?: unknown }>;

/**
 * A supplier directory that answers DIFFERENTLY per unit, so a mixed-supplier
 * cart is a real mixed-supplier cart rather than one supplier twice.
 */
class MixedSupplierDirectory {
  async forUnit(productId: string): Promise<{ supplierId: string; supplierSku: string } | null> {
    if (productId === "prod-clean") {
      return { supplierId: "supplier-apex", supplierSku: "APEX-CLEAN-10" };
    }
    if (productId === "prod-second") {
      return { supplierId: "supplier-renew360", supplierSku: "R360-SECOND-10" };
    }
    return null;
  }
}

function adminGuard(email: string | null) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (email !== null) (req as unknown as { adminEmail?: string }).adminEmail = email;
    next();
  };
}

async function cartApp(
  options: Readonly<{
    adminEmail?: string | null;
    durable?: CartStorePorts;
    mixed?: boolean;
  }> = {},
): Promise<{ app: Express; store: InMemoryEarlyAccessCartStore; audit: AuditEvent[] }> {
  const app = express();
  app.use(express.json());
  const first = cleanUnit();
  const second = cleanUnit({
    productId: "prod-second",
    slug: "second-unit",
    displayName: "Second Unit",
    canonicalName: "second-unit",
    sku: "SECOND-10",
  });
  const units = options.mixed === true ? [first, second] : [first];
  const ledger = await approvedLedgerFor(first);
  if (options.mixed === true) {
    const appended = await ledger.append({
      releaseId: "rel-route-0002",
      productId: second.productId,
      variantId: second.variantId,
      productVersion: earlyAccessReleaseVersion(second),
      status: "approved",
      approvedPriceCents: 19_900,
      currency: "USD",
      waivedBlockers: ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED", "IMAGE_PENDING"],
      approvedQuantityLimit: 3,
      expiresAt: null,
      actor: "Samuel Boadu",
      reason: "Contents confirmed. Bridging lab paperwork and imagery only.",
      recordedAt: new Date(Date.UTC(2026, 7, 1)).toISOString(),
    } as never);
    if (!appended.ok) throw new Error(`fixture release refused: ${appended.code}`);
  }

  const store = new InMemoryEarlyAccessCartStore();
  const audit: AuditEvent[] = [];
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    sessionIdentity: true,
    env: CART_ON,
    cartStore: store,
    ...(options.durable ? { cartCheckoutStore: options.durable } : {}),
    catalog: catalogOf(units),
    releases: ledger,
    orderNumber: sequentialOrderNumbers(),
    proofId: sequentialProofIds(),
    agreements: new StubAgreementGate(true),
    suppliers: new MixedSupplierDirectory() as never,
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
    requireAdmin: adminGuard(
      options.adminEmail === undefined ? ADMIN_EMAIL : options.adminEmail,
    ) as never,
    audit: {
      async record(event: AuditEvent) {
        audit.push(event);
      },
    } as never,
  });
  return { app, store, audit };
}

async function unlock(app: Express): Promise<string> {
  const response = await supertest(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(response.status).toBe(200);
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

function items(mixed: boolean) {
  const base = [
    {
      productId: "prod-clean",
      variantId: "var-10mg",
      quantity: 2,
      expectedUnitPriceCents: 19_900,
      expectedCurrency: "USD" as const,
    },
  ];
  return mixed
    ? [
        ...base,
        {
          productId: "prod-second",
          variantId: "var-10mg",
          quantity: 1,
          expectedUnitPriceCents: 19_900,
          expectedCurrency: "USD" as const,
        },
      ]
    : base;
}

async function placeCheckout(
  app: Express,
  cookie: string,
  key: string,
  mixed = false,
): Promise<{ number: string; payableTotalCents: number }> {
  const quoted = await supertest(app)
    .post(QUOTE)
    .set("Cookie", cookie)
    .send({ items: items(mixed), contact: ORDER_CONTACT, shipTo: SHIP_TO });
  expect(quoted.status).toBe(200);
  const placed = await supertest(app).post(CHECKOUT).set("Cookie", cookie).send({
    quoteId: quoted.body.quote.quoteId,
    idempotencyKey: key,
    expectedIntentHash: quoted.body.quote.intentHash,
  });
  expect(placed.status).toBe(201);
  return {
    number: placed.body.checkout.cartCheckoutNumber,
    payableTotalCents: placed.body.checkout.invoice.payableTotalCents,
  };
}

function proofBody() {
  return {
    sha256: "a".repeat(64),
    filename: "wire-confirmation.pdf",
    contentType: "application/pdf",
    byteSize: 24_512,
    provenanceNote: "Received by email from the customer and checked against the bank record.",
  };
}

describe("external proof is evidence, not payment", () => {
  it("recording off-platform proof leaves the cart UNPAID, unreceipted and unreleased", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const { number } = await placeCheckout(app, cookie, "xeac_set00000000000000001");

    const recorded = await supertest(app).post(`${ADMIN}/${number}/external-proof`).send(proofBody());
    expect(recorded.status).toBe(201);
    // The response must never claim an upload happened.
    expect(recorded.body.storedOnPlatform).toBe(false);
    expect(recorded.body.paid).toBe(false);
    expect(recorded.body.receiptIssued).toBe(false);
    expect(recorded.body.supplierReleased).toBe(false);

    const status = await supertest(app).get(`${CART}/${number}/status`).set("Cookie", cookie);
    expect(status.status).toBe(200);
    expect(status.body.status.payment.paid).toBe(false);
    expect(status.body.status.receipt).toBeNull();
    expect(status.body.status.fulfilment.released).toBe(false);
    expect(status.body.status.fulfilment.childOrders).toEqual([]);
    // The proof IS visible as evidence under review; that is the truthful state.
    expect(status.body.status.payment.externalProofCount).toBe(1);
  });
});

describe("only a NAMED admin may settle", () => {
  it("a blank identity is refused on both admin doors, and settles nothing", async () => {
    const { app } = await cartApp({ adminEmail: null });
    const cookie = await unlock(app);
    const { number, payableTotalCents } = await placeCheckout(app, cookie, "xeac_set00000000000000002");

    const proof = await supertest(app).post(`${ADMIN}/${number}/external-proof`).send(proofBody());
    expect(proof.status).toBe(401);

    const settled = await supertest(app).post(`${ADMIN}/${number}/confirm-payment`).send({
      evidenceRef: "eaext.aaaaaaaaaaaaaaaaaa",
      externalTransactionId: "WIRE-001",
      verifiedAmountCents: payableTotalCents,
      verifiedCurrency: "USD",
    });
    expect(settled.status).toBe(401);
    expect(settled.body).toEqual({ ok: false, code: "UNAUTHORIZED" });

    // The refusal is not merely a status code: nothing was settled.
    const status = await supertest(app).get(`${CART}/${number}/status`).set("Cookie", cookie);
    expect(status.body.status.payment.paid).toBe(false);
    expect(status.body.status.receipt).toBeNull();
    expect(status.body.status.fulfilment.released).toBe(false);
  });

  it("an admin whose email the guard blanked out cannot settle 'as someone'", async () => {
    const { app } = await cartApp({ adminEmail: "   " });
    const cookie = await unlock(app);
    const { number, payableTotalCents } = await placeCheckout(app, cookie, "xeac_set00000000000000003");
    const settled = await supertest(app).post(`${ADMIN}/${number}/confirm-payment`).send({
      evidenceRef: "eaext.aaaaaaaaaaaaaaaaaa",
      externalTransactionId: "WIRE-002",
      verifiedAmountCents: payableTotalCents,
      verifiedCurrency: "USD",
    });
    expect(settled.status).toBe(401);
  });
});

describe("one named confirmation, one settlement, one receipt, every child released", () => {
  it("settles a MIXED-supplier cart: one payment, separate supplier release groups", async () => {
    const { app } = await cartApp({ mixed: true });
    const cookie = await unlock(app);
    const { number, payableTotalCents } = await placeCheckout(
      app,
      cookie,
      "xeac_set00000000000000004",
      true,
    );

    const recorded = await supertest(app).post(`${ADMIN}/${number}/external-proof`).send(proofBody());
    expect(recorded.status).toBe(201);
    const evidenceRef = recorded.body.proof.evidenceRef;

    const confirm = {
      externalTransactionId: "WIRE-MIXED-001",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
    };
    const settled = await supertest(app).post(`${ADMIN}/${number}/confirm-payment`).send(confirm);
    expect(settled.status).toBe(200);
    expect(settled.body).toMatchObject({
      ok: true,
      replayed: false,
      paid: true,
      receiptIssued: true,
      supplierReleased: true,
    });

    const settlement = settled.body.settlement;
    // ONE receipt for the whole cart, and it is the customer's single payment.
    expect(settlement.receipt.receiptId).toEqual(expect.any(String));
    expect(settlement.receipt.verifiedAmountCents).toBe(payableTotalCents);
    expect(settlement.settledBy).toBe(ADMIN_EMAIL);

    // EVERY child released, each keeping its REAL supplier and SKU.
    expect(settlement.childReleases).toHaveLength(2);
    const suppliers = settlement.childReleases.map((release: { supplierId: string }) => release.supplierId);
    expect(new Set(suppliers)).toEqual(new Set(["supplier-apex", "supplier-renew360"]));
    for (const release of settlement.childReleases) {
      expect(release.supplierSku).toMatch(/^(APEX|R360)-/);
      expect(release.releaseId).toEqual(expect.any(String));
    }
    // No invented supplier was needed to make grouping succeed.
    expect(suppliers).not.toContain("");
    expect(suppliers).not.toContain("unknown");

    const status = await supertest(app).get(`${CART}/${number}/status`).set("Cookie", cookie);
    expect(status.body.status.payment.paid).toBe(true);
    expect(status.body.status.fulfilment.childOrders).toHaveLength(2);
    // One parent, one invoice, one payment reference for a two-supplier cart.
    expect(status.body.status.checkout.invoice.invoiceNumber).toEqual(expect.any(String));
    expect(status.body.status.checkout.invoice.paymentReference).toEqual(expect.any(String));
    expect(status.body.status.checkout.children).toHaveLength(2);
  });

  it("a RETRY is the same settlement: no second receipt, no duplicate child release", async () => {
    const { app } = await cartApp({ mixed: true });
    const cookie = await unlock(app);
    const { number, payableTotalCents } = await placeCheckout(
      app,
      cookie,
      "xeac_set00000000000000005",
      true,
    );
    const recorded = await supertest(app).post(`${ADMIN}/${number}/external-proof`).send(proofBody());
    const confirm = {
      externalTransactionId: "WIRE-RETRY-001",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
    };

    const first = await supertest(app).post(`${ADMIN}/${number}/confirm-payment`).send(confirm);
    expect(first.status).toBe(200);
    expect(first.body.replayed).toBe(false);

    const second = await supertest(app).post(`${ADMIN}/${number}/confirm-payment`).send(confirm);
    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body.settlement.receipt.receiptId).toBe(first.body.settlement.receipt.receiptId);
    expect(second.body.settlement.childReleases).toEqual(first.body.settlement.childReleases);

    const status = await supertest(app).get(`${CART}/${number}/status`).set("Cookie", cookie);
    // Still exactly one receipt and one release per child after the retry.
    expect(status.body.status.fulfilment.childOrders).toHaveLength(2);
    const releaseIds = status.body.status.fulfilment.childOrders.map(
      (release: { releaseId: string }) => release.releaseId,
    );
    expect(new Set(releaseIds).size).toBe(releaseIds.length);
  });

  it("ignores a client-supplied amount and settles only the durable invoice total", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const { number, payableTotalCents } = await placeCheckout(app, cookie, "xeac_set00000000000000006");
    const recorded = await supertest(app).post(`${ADMIN}/${number}/external-proof`).send(proofBody());

    const short = await supertest(app).post(`${ADMIN}/${number}/confirm-payment`).send({
      evidenceRef: recorded.body.proof.evidenceRef,
      externalTransactionId: "WIRE-SHORT-001",
      verifiedAmountCents: payableTotalCents - 1,
      verifiedCurrency: "USD",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
    });
    expect(short.status).toBe(200);
    expect(short.body.paid).toBe(true);
    expect(short.body.settlement.verifiedAmountCents).toBe(payableTotalCents);

    const status = await supertest(app).get(`${CART}/${number}/status`).set("Cookie", cookie);
    expect(status.body.status.fulfilment.released).toBe(true);
  });

  it("refuses a settlement whose evidence was never recorded", async () => {
    const { app } = await cartApp();
    const cookie = await unlock(app);
    const { number, payableTotalCents } = await placeCheckout(app, cookie, "xeac_set00000000000000007");
    const settled = await supertest(app).post(`${ADMIN}/${number}/confirm-payment`).send({
      evidenceRef: "eaext.neverrecordedaaaaa",
      externalTransactionId: "WIRE-NOEV-001",
      verifiedAmountCents: payableTotalCents,
      verifiedCurrency: "USD",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
    });
    expect(settled.status).toBe(400);
    expect(settled.body.code).toBe("evidence_missing");
    expect(settled.body.paid).toBe(false);
  });
});

describe("an unreadable existing settlement is a failure, never a fabricated success", () => {
  it("the durable store THROWS rather than reporting paid with no settlement to show", async () => {
    // The RPC says this checkout is already settled and hands back nothing.
    // The admin route answers `already_settled` with paid, receiptIssued and
    // supplierReleased all true, so a null settlement here would assert three
    // facts the database just failed to produce.
    const store = new SupabaseEarlyAccessCartStore(async () =>
      ({ committed: false, reason: "already_settled", settlement: null }));
    await expect(
      store.commitSettlement({
        checkout: { cartCheckoutNumber: "XEC-0123456789ABCDEF0123" } as never,
        evidenceRef: "eaext.aaaaaaaaaaaaaaaaaa",
        externalTransactionId: "WIRE-001",
        verifiedAmountCents: 1,
        verifiedCurrency: "USD",
        actorId: ADMIN_EMAIL,
        confirmedFundsReceived: true,
        confirmedAmountAndReference: true,
        at: "2026-08-07T18:00:00.000Z",
      }),
    ).rejects.toThrow();
  });

  it("a settled cart whose settlement IS readable replays it truthfully", async () => {
    const settlement = {
      cartCheckoutNumber: "XEC-0123456789ABCDEF0123",
      receipt: { receiptId: "xea-cart-receipt:XEC-0123456789ABCDEF0123" },
      childReleases: [],
    };
    const store = new SupabaseEarlyAccessCartStore(async () =>
      ({ committed: false, reason: "already_settled", settlement }));
    const result = await store.commitSettlement({
      checkout: { cartCheckoutNumber: "XEC-0123456789ABCDEF0123" } as never,
      evidenceRef: "eaext.aaaaaaaaaaaaaaaaaa",
      externalTransactionId: "WIRE-001",
      verifiedAmountCents: 1,
      verifiedCurrency: "USD",
      actorId: ADMIN_EMAIL,
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
      at: "2026-08-07T18:00:00.000Z",
    });
    expect(result).toMatchObject({ committed: false, reason: "already_settled" });
    expect(result.settlement).toMatchObject({ cartCheckoutNumber: "XEC-0123456789ABCDEF0123" });
  });
});

describe("F2: the cart settlement path emits ZERO affiliate commission events", () => {
  it("a complete quote, checkout, proof and settlement records no commission event of any kind", async () => {
    const { app, audit } = await cartApp({ mixed: true });
    const cookie = await unlock(app);
    const { number, payableTotalCents } = await placeCheckout(
      app,
      cookie,
      "xeac_set00000000000000008",
      true,
    );
    const recorded = await supertest(app).post(`${ADMIN}/${number}/external-proof`).send(proofBody());
    const settled = await supertest(app).post(`${ADMIN}/${number}/confirm-payment`).send({
      evidenceRef: recorded.body.proof.evidenceRef,
      externalTransactionId: "WIRE-F2-001",
      verifiedAmountCents: payableTotalCents,
      verifiedCurrency: "USD",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
    });
    expect(settled.status).toBe(200);
    expect(settled.body.paid).toBe(true);

    // Not inferred from a flag: this is every event the settled cart actually
    // emitted, checked by name and by payload.
    expect(audit.length).toBeGreaterThan(0);
    const commissionEvents = audit.filter((event) =>
      /commission|affiliate|payout|accrual|referral_hold/i.test(
        `${event.event} ${JSON.stringify(event.detail ?? {})}`,
      ),
    );
    expect(commissionEvents).toEqual([]);

    // And the settlement response itself carries no commission surface.
    expect(JSON.stringify(settled.body)).not.toMatch(/commission|affiliate|payout/i);
  });

  it("no cart module imports the affiliate commission lane, so there is nothing to switch on by accident", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const here = join(import.meta.dirname);
    const offenders: string[] = [];
    for (const entry of readdirSync(here)) {
      if (!/\.ts$/.test(entry) || /\.test\.ts$/.test(entry)) continue;
      const source = readFileSync(join(here, entry), "utf8");
      for (const line of source.split("\n")) {
        if (/^\s*import\b/.test(line) && /commission|affiliate|payout/i.test(line)) {
          offenders.push(`${entry}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("a checkout that cannot commit leaves NOTHING behind", () => {
  const units: CartCatalogUnit[] = [
    { productId: "P1", variantId: "V1", displayName: "One", strength: "10 mg", sku: "S1", purchasable: true, availability: "AVAILABLE", priceCents: 1_000, currency: "USD", quantityLimit: 3, supplierReady: true },
    { productId: "P2", variantId: "V2", displayName: "Two", strength: "10 mg", sku: "S2", purchasable: true, availability: "AVAILABLE", priceCents: 2_000, currency: "USD", quantityLimit: 3, supplierReady: true },
    { productId: "P3", variantId: "V3", displayName: "Three", strength: "10 mg", sku: "S3", purchasable: true, availability: "AVAILABLE", priceCents: 3_000, currency: "USD", quantityLimit: 3, supplierReady: true },
  ];

  function quoteRequest(): EarlyAccessCartQuoteRequest {
    return {
      items: units.map((unit) => ({
        productId: unit.productId,
        variantId: unit.variantId,
        quantity: 1,
        expectedUnitPriceCents: unit.priceCents!,
        expectedCurrency: "USD" as const,
      })),
      contact: { email: "buyer@example.com", phone: "+1 512 555 0100" },
      shipTo: SHIP_TO,
    };
  }

  function quoteDeps(store: InMemoryEarlyAccessCartStore, quoteId: string) {
    return {
      catalog: { units: async () => units },
      releases: {
        decide: async ({ unit }: { unit: CartCatalogUnit }) => ({
          released: true as const,
          priceCents: unit.priceCents!,
          currency: "USD" as const,
          promotion: { promotionId: null, version: null, label: null, discountCents: 0 },
        }),
      },
      suppliers: {
        forUnit: async (productId: string) => ({
          supplierId: `supplier-${productId}`,
          supplierSku: `sku-${productId}`,
        }),
      },
      shipping: { serves: async () => true, quote: async () => ({ currency: "USD" as const, shippingCents: 0 }) },
      agreements: { accepted: async () => true },
      quotes: store,
      now: () => Date.parse("2026-08-07T18:00:00.000Z"),
      quoteId: () => quoteId,
    };
  }

  const customer = { customerRef: "eac_0123456789abcdef0123456789abcdef" };

  it("a collision on the THIRD child does not leave the first two, the parent or the invoice", async () => {
    const store = new InMemoryEarlyAccessCartStore();
    const quoted = await quoteEarlyAccessCart(
      quoteDeps(store, "xeaq_atomic00000000000001"),
      customer,
      quoteRequest(),
    );
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;

    // Burn one child order number by committing a first cart that uses it, so
    // the second commit fails only AFTER two of its three children would
    // otherwise have been written.
    const burn = await checkoutEarlyAccessCart(
      {
        quotes: store,
        checkouts: store,
        audit: { record: async () => {} },
        now: () => Date.parse("2026-08-07T18:01:00.000Z"),
        checkoutNumber: () => "XEC-BURN0123456789ABCDEF",
        childOrderNumber: () => "XEA-CART-COLLIDE-03",
      },
      customer,
      {
        quoteId: quoted.quote.quoteId,
        idempotencyKey: "xeac_atomic0000000000001",
        expectedIntentHash: quoted.quote.intentHash,
      },
    );
    expect(burn.ok).toBe(true);

    const second = await quoteEarlyAccessCart(
      quoteDeps(store, "xeaq_atomic00000000000002"),
      customer,
      quoteRequest(),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const failed = await checkoutEarlyAccessCart(
      {
        quotes: store,
        checkouts: store,
        audit: { record: async () => {} },
        now: () => Date.parse("2026-08-07T18:02:00.000Z"),
        checkoutNumber: () => "XEC-PARTIAL123456789ABCD",
        // Children 1 and 2 are fresh; child 3 collides with the burned one.
        childOrderNumber: (index: number) =>
          index === 2 ? "XEA-CART-COLLIDE-03" : `XEA-CART-PARTIAL-0${index + 1}`,
      },
      customer,
      {
        quoteId: second.quote.quoteId,
        idempotencyKey: "xeac_atomic0000000000002",
        expectedIntentHash: second.quote.intentHash,
      },
    );
    expect(failed.ok).toBe(false);

    // The durable state must contain nothing of the failed attempt: no parent,
    // no children, no invoice, no idempotency binding. A cart that half exists
    // is worse than one that does not.
    expect(await store.byCheckoutNumber("XEC-PARTIAL123456789ABCD")).toBeNull();
    expect(await store.byIdempotencyKey("xeac_atomic0000000000002")).toBeNull();
    expect(await store.status("XEC-PARTIAL123456789ABCD")).toBeNull();
    expect(await store.settlement("XEC-PARTIAL123456789ABCD")).toBeNull();
    expect(await store.externalProofs("XEC-PARTIAL123456789ABCD")).toEqual([]);
  });

  it("a durable store that FAILS mid-commit yields an unavailable answer, never a hung request or a partial cart", async () => {
    // The RPC throws where a real one would fail after opening its
    // transaction. Nothing may be written and the browser must get a refusal.
    const memory = new InMemoryEarlyAccessCartStore();
    const failing: CartStorePorts = Object.assign(Object.create(Object.getPrototypeOf(memory)), memory, {
      commit: async () => {
        throw new Error("rpc research_early_access_commit_cart_checkout failed");
      },
    });
    const { app } = await cartApp({ durable: failing });
    const cookie = await unlock(app);
    const quoted = await supertest(app)
      .post(QUOTE)
      .set("Cookie", cookie)
      .send({ items: items(false), contact: ORDER_CONTACT, shipTo: SHIP_TO });
    expect(quoted.status).toBe(200);

    const placed = await supertest(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: quoted.body.quote.quoteId,
      idempotencyKey: "xeac_rpcfail000000000001",
      expectedIntentHash: quoted.body.quote.intentHash,
    });
    expect(placed.status).toBe(503);
    expect(placed.body).toEqual({ ok: false, code: "UNAVAILABLE" });
  });
});

import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { CartDto, CheckoutRequest } from "@shared/research/commerce-api";
import type { OrderRecord } from "../commerce/orders";
import {
  createCheckoutService,
  createInventoryReservationSeam,
  type CheckoutDeps,
  type ReservationSeam,
} from "../commerce/checkout";
import { createInMemoryInventoryLotStore } from "../commerce/persistence/inventory-store";
import { orderToHeaderRow } from "../commerce/persistence/orders-store";
import { createInMemoryReservationStore } from "../commerce/persistence/reservations-store";
import type { InventoryLot } from "../inventory/lots";
import { TestPaymentProvider } from "../providers/payment";
import { ConfiguredRateShippingProvider } from "../providers/shipping";
import { registerPrivateEarlyAccessApi } from "../early-access/register";
import { EARLY_ACCESS_CART_ENV } from "../early-access/cart/feature-flag";
import { InMemoryEarlyAccessCartStore } from "../early-access/cart/store";
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
} from "../early-access/routes/route-fixtures";

const AS_OF = new Date("2026-08-13T18:00:00.000Z");
const UNLOCK = "/api/research/early-access/unlock";
const QUOTE = "/api/research/early-access/cart/quote";
const CHECKOUT = "/api/research/early-access/cart/checkout";

async function earlyAccessApp(): Promise<{
  app: Express;
  store: InMemoryEarlyAccessCartStore;
  units: ReturnType<typeof cleanUnit>[];
}> {
  const app = express();
  app.use(express.json());
  const units = [cleanUnit()];
  const store = new InMemoryEarlyAccessCartStore();
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    sessionIdentity: true,
    env: { NODE_ENV: "test", [EARLY_ACCESS_CART_ENV]: "true" },
    cartStore: store,
    catalog: catalogOf(units),
    releases: await approvedLedgerFor(units[0]!),
    orderNumber: sequentialOrderNumbers(),
    proofId: sequentialProofIds(),
    agreements: new StubAgreementGate(true),
    suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
  });
  return { app, store, units };
}

async function unlock(app: Express): Promise<string> {
  const response = await request(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

const cartIntent = {
  items: [{
    productId: "prod-clean",
    variantId: "var-10mg",
    quantity: 2,
    expectedUnitPriceCents: 19_900,
    expectedCurrency: "USD",
  }],
  contact: ORDER_CONTACT,
  shipTo: SHIP_TO,
};

function cart(): CartDto {
  return {
    lines: [{
      sku: "P001",
      displayName: "Product One",
      quantity: 1,
      purchaseMode: "one_time",
      unitPriceCents: 5_000,
      lineTotalCents: 5_000,
      blockedReason: null,
    }],
    shipmentGroups: [{ owner: "xenios", skus: ["P001"] }],
    subtotalCents: 5_000,
    shippingCents: 1_295,
    storeCreditAppliedCents: 0,
    estimatedTotalCents: 6_295,
    checkoutReady: true,
    blockingReasons: [],
    requiredAgreements: ["research_use_v1"],
  };
}

function checkoutRequest(): CheckoutRequest {
  return {
    shippingAddress: {
      line1: "1 Main St",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
    },
    shippingService: "standard",
    acceptedAgreementKeys: ["research_use_v1"],
    idempotencyKey: "launch-b-redteam-key-0001",
    paymentMethodReference: "pm_redteam",
  };
}

function checkoutDeps(payment: TestPaymentProvider, overrides: Partial<CheckoutDeps> = {}): CheckoutDeps {
  return {
    cart: { revalidate: async () => cart() },
    payment,
    shipping: new ConfiguredRateShippingProvider(),
    commerceEnabled: true,
    serviceableStates: ["TX"],
    acceptedAgreementKeys: ["research_use_v1"],
    ...overrides,
  };
}

function order(): OrderRecord {
  return {
    orderId: "ord_redteam_1",
    memberId: "member_redteam_1",
    state: "payment_captured",
    lines: [{ sku: "P001", displayName: "Product One", quantity: 1, lineTotalCents: 5_000 }],
    totals: {
      subtotalCents: 5_000,
      shippingCents: 1_295,
      storeCreditAppliedCents: 0,
      totalCents: 6_295,
    },
    providerReference: "pay_redteam_1",
    authorizedAmountCents: 6_295,
    capturedAmountCents: 6_295,
    lastIdempotencyKey: "checkout-redteam-key-0001",
    reviewTriggers: [],
    createdAt: AS_OF.toISOString(),
    updatedAt: AS_OF.toISOString(),
  };
}

function lot(): InventoryLot {
  return {
    lotId: "LOT-REDTEAM-1",
    sku: "P001",
    owner: "xenios",
    disposition: "available",
    quantityAvailable: 5,
    manufacturedDate: "2026-01-01",
    expiryDate: "2027-01-01",
    retestDate: null,
    shelfLifeSource: "supplier_document",
    documents: {
      coaOnFile: true,
      identityConfirmed: true,
      purityConfirmed: true,
      sterilityConfirmed: null,
      endotoxinConfirmed: null,
    },
    excursion: "none",
    recalled: false,
  };
}

describe("Launch B money-path red team (expected failures until repaired)", () => {
  it.fails("deduplicates two different quotes carrying the same customer intent_hash", async () => {
    const { app, store } = await earlyAccessApp();
    const cookie = await unlock(app);
    const firstQuote = (await request(app).post(QUOTE).set("Cookie", cookie).send(cartIntent)).body.quote;
    const secondQuote = (await request(app).post(QUOTE).set("Cookie", cookie).send(cartIntent)).body.quote;
    expect(secondQuote.quoteId).not.toBe(firstQuote.quoteId);
    expect(secondQuote.intentHash).toBe(firstQuote.intentHash);

    const first = await request(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: firstQuote.quoteId,
      expectedIntentHash: firstQuote.intentHash,
      idempotencyKey: "xeac_redteamintent00000001",
    });
    const second = await request(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: secondQuote.quoteId,
      expectedIntentHash: secondQuote.intentHash,
      idempotencyKey: "xeac_redteamintent00000002",
    });

    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body.checkout.cartCheckoutNumber).toBe(first.body.checkout.cartCheckoutNumber);
    expect((store as unknown as { byNumber: Map<string, unknown> }).byNumber.size).toBe(1);
  });

  it.fails("persists the immutable checkout idempotency key in its dedicated order column", () => {
    expect(orderToHeaderRow(order())).toHaveProperty(
      "checkout_idempotency_key",
      "checkout-redteam-key-0001",
    );
  });

  it.fails("uses one durable order identity across two service instances", async () => {
    const payment = new TestPaymentProvider();
    const firstService = createCheckoutService(checkoutDeps(payment));
    const secondService = createCheckoutService(checkoutDeps(payment));
    const [first, second] = await Promise.all([
      firstService.submit("member-1", checkoutRequest(), AS_OF),
      secondService.submit("member-1", checkoutRequest(), AS_OF),
    ]);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.order.orderId).toBe(first.order.orderId);
    expect(second.idempotent).toBe(true);
  });

  it.fails("does not capture money before the durable order save succeeds", async () => {
    const payment = new TestPaymentProvider();
    const captured = vi.spyOn(payment, "captureAuthorization");
    const service = createCheckoutService(checkoutDeps(payment));
    const outcome = await service.submit("member-1", checkoutRequest(), AS_OF);
    expect(outcome.ok).toBe(true);

    const durableSave = vi.fn(async () => {
      throw new Error("database unavailable after provider capture");
    });
    await expect(durableSave()).rejects.toThrow("database unavailable");
    expect(captured).not.toHaveBeenCalled();
  });

  it.fails("does not return a fake idempotent success after reservation audit fails", async () => {
    const payment = new TestPaymentProvider();
    const reservations: ReservationSeam = {
      reserve: async () => ({ ok: true, reservationIds: ["rsv-redteam-1"] }),
      release: async () => {},
      finalize: async () => {},
    };
    const service = createCheckoutService(checkoutDeps(payment, {
      inventory: reservations,
      reservationAudit: { record: async () => { throw new Error("audit unavailable"); } },
    }));

    await expect(service.submit("member-1", checkoutRequest(), AS_OF)).rejects.toThrow("audit unavailable");
    const retry = await service.submit("member-1", checkoutRequest(), AS_OF);
    expect(retry.ok).toBe(false);
  });

  it.fails("releases an expired 30-minute inventory hold without a customer retry", async () => {
    const lots = createInMemoryInventoryLotStore();
    const reservations = createInMemoryReservationStore();
    await lots.save(lot());
    let now = AS_OF;
    const seam = createInventoryReservationSeam({ lots, reservations, now: () => now });
    const held = await seam.reserve("member-1", [{ sku: "P001", quantity: 2 }], AS_OF);
    expect(held.ok).toBe(true);
    now = new Date(AS_OF.getTime() + 31 * 60_000);

    expect((await lots.get("LOT-REDTEAM-1"))?.quantityAvailable).toBe(5);
    expect((await reservations.listByMember("member-1"))[0]?.status).toBe("released");
  });

  it.fails("revalidates Product Control price and purchase authority after an Early Access quote", async () => {
    const { app, units } = await earlyAccessApp();
    const cookie = await unlock(app);
    const quote = (await request(app).post(QUOTE).set("Cookie", cookie).send(cartIntent)).body.quote;

    // Product Control now refuses the exact variant before checkout. The quote
    // remains inside its TTL, so only a fresh authority read can catch this.
    units[0] = cleanUnit({ availability: "unavailable", quantityLimit: 0, purchasable: false });
    const placed = await request(app).post(CHECKOUT).set("Cookie", cookie).send({
      quoteId: quote.quoteId,
      expectedIntentHash: quote.intentHash,
      idempotencyKey: "xeac_redteamstale000000001",
    });

    expect(placed.status).not.toBe(200);
    expect(placed.status).not.toBe(201);
  });
});

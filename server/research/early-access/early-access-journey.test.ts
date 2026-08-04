import { describe, expect, it } from "vitest";

import type { EarlyAccessCatalogProjection, EarlyAccessCatalogRow } from "./catalog/early-access-catalog";
import {
  InMemoryEarlyAccessReleaseLedger,
  earlyAccessReleaseVersion,
} from "./release/founder-release";
import { buildEarlyAccessStorefront } from "./release/storefront-view";
import { createFounderReleaseRoute, type EarlyAccessCatalogSource } from "./release/release-routes";
import {
  InMemoryEarlyAccessOrderRepository,
  createEarlyAccessOrder,
} from "./commerce/order-service";
import {
  InMemoryEarlyAccessInvoiceRepository,
  createEarlyAccessInvoice,
} from "./commerce/invoice-service";

// The whole customer journey, in one test, crossing every lane.
//
// Each lane proved its own piece against its own fakes. This is the first test
// that runs them together, which is where the disagreements live: a price that
// means one thing to the bridge and another to commerce, a blocker one lane
// waives and another refuses, a total the invoice bills and the receipt does not.

const NOW = Date.parse("2026-08-04T12:00:00.000Z");
const OPERATIONAL_ONLY = ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED", "IMAGE_PENDING"] as const;

/**
 * A unit whose CONTENTS are fully confirmed and whose remaining gaps are purely
 * operational. This is the only shape a founder may release, and today no real
 * Product Control row looks like this.
 */
function cleanUnit(overrides: Partial<EarlyAccessCatalogRow> = {}): EarlyAccessCatalogRow {
  return {
    productId: "prod-clean",
    slug: "clean-unit",
    displayName: "Clean Unit",
    canonicalName: "clean-unit",
    variantId: "var-10mg",
    sku: "CLEAN-10",
    strength: "10 mg",
    presentation: "lyophilised vial",
    priceCents: null,
    currency: "",
    audience: "member",
    availability: "available",
    offerState: "APPROVAL_REQUIRED_PURCHASE",
    description: "",
    imageState: "none",
    quantityLimit: 3,
    supplierReady: true,
    disputeStatus: { identity: "none", strength: "none" },
    purchasable: false,
    blockers: [...OPERATIONAL_ONLY],
    ...overrides,
  } as unknown as EarlyAccessCatalogRow;
}

function sourceOf(rows: EarlyAccessCatalogRow[]): EarlyAccessCatalogSource {
  return {
    async load(now: Date) {
      return { evaluatedAt: now.toISOString(), rows, productsWithoutVariants: [] } as unknown as EarlyAccessCatalogProjection;
    },
  };
}

function res() {
  const state: any = { status: 0, body: null };
  const port: any = {
    setHeader: () => {},
    status(code: number) {
      state.status = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  };
  return { port, state };
}

describe("a founder approves one unit and a customer buys it", () => {
  it("runs the whole journey, and the money agrees at every step", async () => {
    const unit = cleanUnit();
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    const catalog = sourceOf([unit]);

    // 1. THE FOUNDER APPROVES. The version is echoed from what they were shown.
    const { port, state } = res();
    await createFounderReleaseRoute({ catalog, ledger, now: () => NOW } as any)(
      {
        actor: "Samuel Boadu",
        body: {
          releaseId: "rel-clean-0001",
          productId: unit.productId,
          variantId: unit.variantId,
          productVersion: earlyAccessReleaseVersion(unit),
          status: "approved",
          approvedPriceCents: 19_900,
          currency: "USD",
          waivedBlockers: [...OPERATIONAL_ONLY],
          approvedQuantityLimit: 3,
          expiresAt: null,
          reason: "Contents confirmed. Bridging lab paperwork and imagery only.",
        },
      },
      port,
    );
    expect(state.status).toBe(201);

    // 2. THE CUSTOMER SEES IT behind the gate, priced.
    const releases = await ledger.all();
    const storefront = buildEarlyAccessStorefront({
      projection: await catalog.load(new Date(NOW)),
      releases,
    });
    expect(storefront.purchasableCount).toBe(1);
    const shown = storefront.units[0];
    expect(shown?.state).toBe("purchasable");
    expect(shown?.priceCents).toBe(19_900);
    expect(shown?.basis).toBe("founder_release");
    // Product Control's verdict travels with it rather than being hidden.
    expect(shown?.productControlBlockers).toEqual([...OPERATIONAL_ONLY]);

    // 3. THE CUSTOMER ORDERS three, and states a price of one cent while doing so.
    const orders = new InMemoryEarlyAccessOrderRepository();
    const placed = await createEarlyAccessOrder({
      orders,
      rows: [unit],
      releases: [...releases],
      request: {
        idempotencyKey: "ea-journey-key-0000001",
        orderId: "ea-order-journey-0001",
        customerRef: "cust-journey-0001",
        productId: unit.productId,
        variantId: unit.variantId,
        quantity: 3,
        referralCode: null,
        now: new Date(NOW).toISOString(),
        // Ignored entirely. The price is the founder's, never the caller's.
        priceCents: 1,
        totalCents: 1,
        currency: "EUR",
      },
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    const record = placed.value.record;
    expect(record.releaseId).toBe("rel-clean-0001");
    expect(record.productVersion).toBe(earlyAccessReleaseVersion(unit));
    // 3 units at 19,900 is 59,700, less the 20 percent bundle, is 47,760.
    expect(record.money.subtotalCents).toBe(59_700);
    expect(record.money.discountCents).toBe(11_940);
    expect(record.money.payableTotalCents).toBe(47_760);
    expect(record.money.currency).toBe("USD");
    // The pre-discount subtotal is still on the order, and it is still exactly
    // unit price times quantity. It is not what anyone is asked to pay.
    expect(record.order.orderTotalCents).toBe(59_700);

    // 4. THE INVOICE bills what the customer actually owes.
    const invoices = new InMemoryEarlyAccessInvoiceRepository();
    const issued = await createEarlyAccessInvoice({
      invoices,
      order: record,
      now: new Date(NOW).toISOString(),
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const invoice = issued.value.invoice;
    expect(invoice.payableTotalCents).toBe(47_760);
    expect(invoice.subtotalCents).toBe(59_700);
    expect(invoice.discountCents).toBe(11_940);
    expect(invoice.currency).toBe("USD");
    expect(invoice.paymentReference.length).toBeGreaterThan(0);
    expect(invoice.orderId).toBe("ea-order-journey-0001");

    // 5. THE ORDER IS IMMUTABLE AGAINST A LATER REVOCATION. Revoking the release
    // stops new sales and must not rewrite what was already sold.
    await ledger.append({
      releaseId: "rel-clean-0002",
      productId: unit.productId,
      variantId: unit.variantId,
      productVersion: earlyAccessReleaseVersion(unit),
      status: "revoked",
      approvedPriceCents: 0,
      currency: "",
      waivedBlockers: [],
      approvedQuantityLimit: 0,
      expiresAt: null,
      actor: "Samuel Boadu",
      reason: "Pulled pending the lab documentation.",
      recordedAt: new Date(NOW + 60_000).toISOString(),
    });

    const afterRevocation = buildEarlyAccessStorefront({
      projection: await catalog.load(new Date(NOW + 120_000)),
      releases: await ledger.all(),
    });
    expect(afterRevocation.purchasableCount).toBe(0);

    const stored = await orders.findByOrderId("ea-order-journey-0001");
    expect(stored?.money.payableTotalCents).toBe(47_760);
    expect(stored?.money.promotionId).toBe("early-access-bundle-3");
    expect(stored?.releaseId).toBe("rel-clean-0001");

    const blockedNow = await createEarlyAccessOrder({
      orders,
      rows: [unit],
      releases: await ledger.all(),
      request: {
        idempotencyKey: "ea-journey-key-0000002",
        orderId: "ea-order-journey-0002",
        customerRef: "cust-journey-0002",
        productId: unit.productId,
        variantId: unit.variantId,
        quantity: 1,
        referralCode: null,
        now: new Date(NOW + 120_000).toISOString(),
      },
    });
    expect(blockedNow.ok).toBe(false);
  });

  it("refuses the journey at step one when the contents are in doubt", async () => {
    // The same unit, with a strength dispute. Nothing downstream should be
    // reachable, and the refusal should happen where the founder can see it.
    const doubtful = cleanUnit({ blockers: [...OPERATIONAL_ONLY, "STRENGTH_DISPUTE_UNRESOLVED"] });
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    const { port, state } = res();
    await createFounderReleaseRoute({
      catalog: sourceOf([doubtful]),
      ledger,
      now: () => NOW,
    } as any)(
      {
        actor: "Samuel Boadu",
        body: {
          releaseId: "rel-doubtful-0001",
          productId: doubtful.productId,
          variantId: doubtful.variantId,
          productVersion: earlyAccessReleaseVersion(doubtful),
          status: "approved",
          approvedPriceCents: 19_900,
          currency: "USD",
          waivedBlockers: [...OPERATIONAL_ONLY],
          approvedQuantityLimit: 3,
          expiresAt: null,
          reason: "Attempting to release while the strength is disputed.",
        },
      },
      port,
    );
    expect(state.status).toBe(422);
    expect(state.body.code).toBe("NONWAIVABLE_BLOCKER");
    expect(await ledger.all()).toHaveLength(0);
  });
});

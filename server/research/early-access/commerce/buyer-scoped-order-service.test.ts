/**
 * The buyer-scoped price at the ONE money writer.
 *
 * What must hold: a buyer-scoped amount substitutes the ledger AMOUNT and
 * nothing else. The release decision still decides sellability, the quantity
 * authorities still bind, an invalid scoped amount refuses rather than
 * falling anywhere, and an absent scoped price leaves every historical
 * behaviour byte-identical. The negative control at the bottom proves the
 * test would catch the known-bad topology (a scoped price selling an
 * unreleased unit).
 */
import { describe, expect, it } from "vitest";

import type { EarlyAccessCatalogRow } from "../catalog/early-access-catalog";
import {
  earlyAccessReleaseVersion,
  validateEarlyAccessRelease,
  type EarlyAccessRelease,
} from "../release/founder-release";
import { EARLY_ACCESS_MAX_UNIT_PRICE_CENTS } from "./early-access-order";
import {
  InMemoryEarlyAccessOrderRepository,
  createEarlyAccessOrder,
  type EarlyAccessOrderRepository,
  type EarlyAccessOrderServiceResult,
} from "./order-service";

const PRODUCT_ID = "prd_aod9604";
const VARIANT_ID = "var_5mg";
const NOW = "2026-08-14T12:00:00.000Z";
const RELEASE_PRICE_CENTS = 7_999;
const PARTNER_PRICE_CENTS = 2_464;
const IDEMPOTENCY_KEY = "idem-ea-9001-000001";

const HELD_BLOCKERS = ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED"] as const;

function row(overrides: Partial<EarlyAccessCatalogRow> = {}): EarlyAccessCatalogRow {
  return {
    productId: PRODUCT_ID,
    slug: "aod-9604",
    displayName: "AOD-9604",
    canonicalName: "AOD-9604",
    variantId: VARIANT_ID,
    sku: "XEA-AOD-5MG",
    strength: "5 mg",
    presentation: "vial",
    priceCents: null,
    currency: "",
    audience: "member",
    availability: "unavailable",
    offerState: null,
    description: "Product information for this item is still being confirmed.",
    imageState: "none",
    quantityLimit: null,
    supplierReady: false,
    disputeStatus: { identity: "cleared", strength: "cleared" },
    purchasable: false,
    blockers: [...HELD_BLOCKERS],
    ...overrides,
  };
}

function release(overrides: Record<string, unknown> = {}): EarlyAccessRelease {
  const result = validateEarlyAccessRelease({
    releaseId: "rel_ea_9001",
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    productVersion: earlyAccessReleaseVersion(row()),
    status: "approved",
    approvedPriceCents: RELEASE_PRICE_CENTS,
    currency: "USD",
    waivedBlockers: [...HELD_BLOCKERS],
    approvedQuantityLimit: 20,
    expiresAt: null,
    actor: "Samuel Boadu",
    reason: "Founder approved this exact unit for the private early access portal.",
    recordedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  });
  if (!result.ok) throw new Error(`fixture release refused: ${result.code}`);
  return result.release;
}

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    idempotencyKey: IDEMPOTENCY_KEY,
    orderId: "ord_ea_9001",
    customerRef: "cus_kris",
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    quantity: 1,
    now: NOW,
    ...overrides,
  };
}

type PlaceOptions = {
  request?: Record<string, unknown> | unknown;
  rows?: readonly EarlyAccessCatalogRow[];
  releases?: readonly EarlyAccessRelease[];
  orders?: EarlyAccessOrderRepository;
  buyerScopedPrice?: { amountCents: number; currency: string } | null;
};

function place(options: PlaceOptions = {}): Promise<EarlyAccessOrderServiceResult> {
  return createEarlyAccessOrder({
    request: "request" in options ? options.request : request(),
    rows: options.rows ?? [row()],
    releases: options.releases ?? [release()],
    orders: options.orders ?? new InMemoryEarlyAccessOrderRepository(),
    ...(options.buyerScopedPrice === undefined
      ? {}
      : { buyerScopedPrice: options.buyerScopedPrice }),
  });
}

describe("buyer-scoped price at the order service", () => {
  it("writes the scoped amount into the money, under the release's own fingerprint", async () => {
    const placed = await place({
      buyerScopedPrice: { amountCents: PARTNER_PRICE_CENTS, currency: "USD" },
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const order = placed.value.record.order;
    expect(order.line.unitPriceCents).toBe(PARTNER_PRICE_CENTS);
    expect(order.currency).toBe("USD");
    // The version stays the release's product fingerprint: same product, same
    // release, buyer-scoped amount.
    expect(order.unitPriceVersion).toBe(earlyAccessReleaseVersion(row()));
  });

  it("changes nothing when no scoped price is supplied", async () => {
    const scoped = await place({ buyerScopedPrice: null });
    const absent = await place();
    expect(scoped.ok).toBe(true);
    expect(absent.ok).toBe(true);
    if (!scoped.ok || !absent.ok) return;
    expect(scoped.value.record.order.line.unitPriceCents).toBe(RELEASE_PRICE_CENTS);
    expect(absent.value.record.order.line.unitPriceCents).toBe(RELEASE_PRICE_CENTS);
  });

  it("NEGATIVE CONTROL: a scoped price cannot sell an unreleased unit", async () => {
    const placed = await place({
      releases: [],
      buyerScopedPrice: { amountCents: PARTNER_PRICE_CENTS, currency: "USD" },
    });
    expect(placed.ok).toBe(false);
  });

  it("NEGATIVE CONTROL: a scoped price cannot sell a revoked release", async () => {
    const placed = await place({
      releases: [release({ status: "revoked" })],
      buyerScopedPrice: { amountCents: PARTNER_PRICE_CENTS, currency: "USD" },
    });
    expect(placed.ok).toBe(false);
  });

  it("refuses a scoped amount outside the portal's price domain", async () => {
    for (const amountCents of [0, -1, EARLY_ACCESS_MAX_UNIT_PRICE_CENTS + 1, 0.5]) {
      const placed = await place({
        buyerScopedPrice: { amountCents, currency: "USD" },
      });
      expect(placed.ok).toBe(false);
      if (!placed.ok) expect(placed.code).toBe("release_price_invalid");
    }
  });

  it("refuses a scoped currency the portal does not carry", async () => {
    const placed = await place({
      buyerScopedPrice: { amountCents: PARTNER_PRICE_CENTS, currency: "EUR" },
    });
    expect(placed.ok).toBe(false);
    if (!placed.ok) expect(placed.code).toBe("release_currency_invalid");
  });

  it("still enforces the release quantity authority under a scoped price", async () => {
    const placed = await place({
      request: request({ quantity: 21 }),
      buyerScopedPrice: { amountCents: PARTNER_PRICE_CENTS, currency: "USD" },
    });
    expect(placed.ok).toBe(false);
  });

  it("replays return the order as sold, not as currently priced", async () => {
    const orders = new InMemoryEarlyAccessOrderRepository();
    const first = await place({
      orders,
      buyerScopedPrice: { amountCents: PARTNER_PRICE_CENTS, currency: "USD" },
    });
    expect(first.ok).toBe(true);
    // The same intent replayed WITHOUT a scoped price still answers the order
    // that was sold at the scoped amount: what was sold stays sold.
    const replay = await place({ orders, buyerScopedPrice: null });
    expect(replay.ok).toBe(true);
    if (!replay.ok || !first.ok) return;
    expect(replay.value.replayed).toBe(true);
    expect(replay.value.record.order.line.unitPriceCents).toBe(PARTNER_PRICE_CENTS);
  });
});

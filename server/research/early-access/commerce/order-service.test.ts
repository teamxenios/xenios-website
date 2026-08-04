import { describe, expect, it } from "vitest";

import type { EarlyAccessCatalogRow } from "../catalog/early-access-catalog";
import {
  earlyAccessReleaseVersion,
  validateEarlyAccessRelease,
  type EarlyAccessRelease,
} from "../release/founder-release";
import {
  CLIENT_SUPPLIED_TOTAL_KEYS,
  EARLY_ACCESS_MAX_UNIT_PRICE_CENTS,
} from "./early-access-order";
import {
  EARLY_ACCESS_BUNDLE_TIERS,
  InMemoryEarlyAccessOrderRepository,
  createEarlyAccessOrder,
  earlyAccessBundleDiscountCents,
  earlyAccessBundleTier,
  isEarlyAccessIdempotencyKey,
  type EarlyAccessOrderInsert,
  type EarlyAccessOrderRepository,
  type EarlyAccessOrderServiceResult,
  type EarlyAccessReleaseOrder,
} from "./order-service";

const PRODUCT_ID = "prd_bpc157";
const VARIANT_ID = "var_5mg";
const NOW = "2026-08-04T12:00:00.000Z";
const RELEASE_PRICE_CENTS = 19_900;
const IDEMPOTENCY_KEY = "idem-ea-0001-000001";

/** The blockers Product Control holds this unit with, all waived by the release. */
const HELD_BLOCKERS = ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED"] as const;

function row(overrides: Partial<EarlyAccessCatalogRow> = {}): EarlyAccessCatalogRow {
  return {
    productId: PRODUCT_ID,
    slug: "bpc-157",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    variantId: VARIANT_ID,
    sku: "XEA-BPC-5MG",
    strength: "5 mg",
    presentation: "vial",
    // Every Early Access unit is held with no approved price, which is exactly
    // why a founder release has to supply one.
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
    releaseId: "rel_ea_0001",
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    productVersion: earlyAccessReleaseVersion(row()),
    status: "approved",
    approvedPriceCents: RELEASE_PRICE_CENTS,
    currency: "USD",
    waivedBlockers: [...HELD_BLOCKERS],
    approvedQuantityLimit: 3,
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
    orderId: "ord_ea_0001",
    customerRef: "cus_samuel",
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
};

function place(options: PlaceOptions = {}): Promise<EarlyAccessOrderServiceResult> {
  return createEarlyAccessOrder({
    request: "request" in options ? options.request : request(),
    rows: options.rows ?? [row()],
    releases: options.releases ?? [release()],
    orders: options.orders ?? new InMemoryEarlyAccessOrderRepository(),
  });
}

async function placed(options: PlaceOptions = {}): Promise<EarlyAccessReleaseOrder> {
  const result = await place(options);
  if (!result.ok) throw new Error(`fixture order refused: ${result.code}`);
  return result.value.record;
}

describe("the price is never taken from the client", () => {
  it("creates the order at the release price when the client states one cent", async () => {
    const record = await placed({
      request: request({
        price: 1,
        priceCents: 1,
        unitPriceCents: 1,
        total: 1,
        totalCents: 1,
        orderTotalCents: 1,
        subtotalCents: 1,
        amountDueCents: 1,
        currency: "EUR",
      }),
    });

    expect(record.order.line.unitPriceCents).toBe(RELEASE_PRICE_CENTS);
    expect(record.order.line.lineTotalCents).toBe(RELEASE_PRICE_CENTS);
    expect(record.subtotalCents).toBe(RELEASE_PRICE_CENTS);
    expect(record.totalCents).toBe(RELEASE_PRICE_CENTS);
    expect(record.currency).toBe("USD");
    expect(record.order.currency).toBe("USD");
  });

  it("ignores every money bearing key rather than refusing the request", async () => {
    for (const key of CLIENT_SUPPLIED_TOTAL_KEYS) {
      const result = await place({ request: request({ [key]: 1 }) });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`refused on ${key}: ${result.code}`);
      expect(result.value.record.totalCents).toBe(RELEASE_PRICE_CENTS);
    }
  });

  it("never raises the domain module's client total refusal", async () => {
    const result = await place({ request: request({ orderTotalCents: 24_900 }) });
    expect(result.ok).toBe(true);
  });

  it("prices a quantity of three from the release, not from a client line total", async () => {
    const record = await placed({
      request: request({ quantity: 3, lineTotalCents: 3, orderTotalCents: 3 }),
    });
    expect(record.subtotalCents).toBe(59_700);
    expect(record.totalCents).toBe(47_760);
  });

  it("takes the sku from the catalog row and ignores a client supplied one", async () => {
    const record = await placed({ request: request({ sku: "ATTACKER-SKU" }) });
    expect(record.order.line.sku).toBe("XEA-BPC-5MG");
  });

  it("ignores a prototype polluting key and leaves Object.prototype alone", async () => {
    const hostile = JSON.parse(
      [
        `{"__proto__":{"polluted":true}`,
        `,"idempotencyKey":"${IDEMPOTENCY_KEY}"`,
        `,"orderId":"ord_ea_0001","customerRef":"cus_samuel"`,
        `,"productId":"${PRODUCT_ID}","variantId":"${VARIANT_ID}"`,
        `,"quantity":1,"now":"${NOW}"}`,
      ].join(""),
    ) as Record<string, unknown>;

    const record = await placed({ request: hostile });

    expect(record.totalCents).toBe(RELEASE_PRICE_CENTS);
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("a sale requires a live founder release", () => {
  it("refuses a unit with no release at all", async () => {
    const result = await place({ releases: [] });
    expect(result).toEqual({ ok: false, code: "release_required" });
  });

  it("refuses a unit whose release was revoked", async () => {
    const revoked = release({
      releaseId: "rel_ea_0002",
      status: "revoked",
      approvedPriceCents: 0,
      currency: "",
      recordedAt: "2026-08-02T00:00:00.000Z",
    });
    const result = await place({ releases: [release(), revoked] });
    expect(result).toEqual({ ok: false, code: "release_revoked" });
  });

  it("refuses a release whose product version no longer matches the unit", async () => {
    // The strength moved after the founder approved the unit, so the approval is
    // about a product that no longer exists.
    const moved = row({ strength: "10 mg" });
    const result = await place({ rows: [moved], releases: [release()] });
    expect(result).toEqual({ ok: false, code: "release_stale" });
  });

  it("refuses when a blocker appeared that the release never waived", async () => {
    const held = row({ blockers: [...HELD_BLOCKERS, "IMAGE_PENDING"] });
    // Re-approve against the new facts so the refusal is the unwaived blocker and
    // not staleness.
    const current = release({ productVersion: earlyAccessReleaseVersion(held) });
    const result = await place({ rows: [held], releases: [current] });
    expect(result).toEqual({ ok: false, code: "release_blockers_not_waived" });
  });

  it("refuses to sell a unit whose CONTENTS are in doubt, whatever the release says", async () => {
    // A founder release may bridge an operational gap. It may never sell a unit
    // when xenios cannot say exactly what is in the vial, so the order refuses
    // even though a release exists and matches the current facts.
    for (const blocker of [
      "IDENTITY_DISPUTE_UNRESOLVED",
      "STRENGTH_DISPUTE_UNRESOLVED",
      "SUPPLIER_NOT_ASSIGNED",
      "REGULATORY_HOLD",
    ]) {
      const doubtful = row({ blockers: [...HELD_BLOCKERS, blocker] });
      const current = release({ productVersion: earlyAccessReleaseVersion(doubtful) });
      const result = await place({ rows: [doubtful], releases: [current] });
      expect(result).toEqual({ ok: false, code: "product_held" });
    }
  });

  it("refuses a unit that Product Control considers purchasable but no founder released", async () => {
    const clear = row({ blockers: [], purchasable: true, priceCents: 12_000, currency: "USD" });
    const result = await place({ rows: [clear], releases: [] });
    expect(result).toEqual({ ok: false, code: "release_required" });
  });

  it("refuses a release priced above the early access unit ceiling", async () => {
    const expensive = release({ approvedPriceCents: EARLY_ACCESS_MAX_UNIT_PRICE_CENTS + 1 });
    const result = await place({ releases: [expensive] });
    expect(result).toEqual({ ok: false, code: "release_price_invalid" });
  });

  it("records the exact release and product version the unit was sold under", async () => {
    const record = await placed();
    expect(record.releaseId).toBe("rel_ea_0001");
    expect(record.productVersion).toBe(earlyAccessReleaseVersion(row()));
  });

  it("keeps the order readable after the release ledger is gone", async () => {
    const orders = new InMemoryEarlyAccessOrderRepository();
    await placed({ orders });

    // The bridge is deleted. The stored order still states what it was sold under.
    const stored = await orders.findByOrderId("ord_ea_0001");
    expect(stored?.releaseId).toBe("rel_ea_0001");
    expect(stored?.productVersion).toHaveLength(64);
    expect(stored?.order.line.unitPriceCents).toBe(RELEASE_PRICE_CENTS);
  });
});

describe("catalog resolution", () => {
  it("refuses a unit that is not in the projection", async () => {
    const result = await place({ request: request({ variantId: "var_10mg" }) });
    expect(result).toEqual({ ok: false, code: "unit_not_in_catalog" });
  });

  it("refuses when two rows claim the same identity", async () => {
    const result = await place({ rows: [row(), row({ sku: "XEA-BPC-5MG-DUP" })] });
    expect(result).toEqual({ ok: false, code: "unit_ambiguous" });
  });
});

describe("quantity", () => {
  it("accepts the three tiers and refuses anything outside them", async () => {
    for (const quantity of [1, 2, 3]) {
      const result = await place({ request: request({ quantity }) });
      expect(result.ok).toBe(true);
    }
    for (const quantity of [0, 4, -1, 2.5, "2", null]) {
      const result = await place({ request: request({ quantity }) });
      expect(result).toEqual({ ok: false, code: "quantity_out_of_range" });
    }
  });

  it("refuses a quantity above the row's own limit", async () => {
    const limited = row({ quantityLimit: 1 });
    const result = await place({
      request: request({ quantity: 2 }),
      rows: [limited],
      releases: [release({ productVersion: earlyAccessReleaseVersion(limited) })],
    });
    expect(result).toEqual({ ok: false, code: "quantity_limit_exceeded" });
  });

  it("allows a quantity exactly at the row's limit", async () => {
    const limited = row({ quantityLimit: 2 });
    const record = await placed({
      request: request({ quantity: 2 }),
      rows: [limited],
      releases: [release({ productVersion: earlyAccessReleaseVersion(limited) })],
    });
    expect(record.order.line.quantity).toBe(2);
  });
});

describe("bundle arithmetic is exact to the cent", () => {
  it("prices each tier from the release price", async () => {
    const one = await placed({ request: request({ quantity: 1 }) });
    expect([one.subtotalCents, one.discountCents, one.totalCents]).toEqual([19_900, 0, 19_900]);
    expect(one.tier.label).toBe("1 Unit");

    const two = await placed({ request: request({ quantity: 2 }) });
    expect([two.subtotalCents, two.discountCents, two.totalCents]).toEqual([39_800, 0, 39_800]);
    expect(two.tier.label).toBe("2 Units");

    const three = await placed({ request: request({ quantity: 3 }) });
    expect([three.subtotalCents, three.discountCents, three.totalCents]).toEqual([
      59_700, 11_940, 47_760,
    ]);
    expect(three.tier.label).toBe("3-Unit Bundle");
    expect(three.tier.discountBasisPoints).toBe(2_000);
  });

  it("drops the fractional cent rather than inventing one", async () => {
    // 59,997 at twenty percent is 11,999.4 cents of discount.
    const odd = release({ approvedPriceCents: 19_999 });
    const record = await placed({ request: request({ quantity: 3 }), releases: [odd] });
    expect(record.subtotalCents).toBe(59_997);
    expect(record.discountCents).toBe(11_999);
    expect(record.totalCents).toBe(47_998);
  });

  it("never produces a discount on an amount too small to carry one", () => {
    expect(earlyAccessBundleDiscountCents(3, 2_000)).toBe(0);
    expect(earlyAccessBundleDiscountCents(4, 2_000)).toBe(0);
    expect(earlyAccessBundleDiscountCents(5, 2_000)).toBe(1);
  });

  it("does not drift across the whole supported price range", () => {
    for (let unit = 1; unit <= EARLY_ACCESS_MAX_UNIT_PRICE_CENTS; unit += 997) {
      for (const tier of EARLY_ACCESS_BUNDLE_TIERS) {
        const subtotal = unit * tier.quantity;
        const discount = earlyAccessBundleDiscountCents(subtotal, tier.discountBasisPoints);
        expect(Number.isSafeInteger(discount)).toBe(true);
        // The discount is the largest whole cent that does not exceed the exact
        // percentage, so it is never rounded up and never a cent short.
        expect(discount * 10_000).toBeLessThanOrEqual(subtotal * tier.discountBasisPoints);
        expect((discount + 1) * 10_000).toBeGreaterThan(subtotal * tier.discountBasisPoints);
        expect(subtotal - discount).toBeGreaterThan(0);
      }
    }
  });

  it("is deterministic for the same request", async () => {
    const first = await placed();
    const second = await placed();
    expect(first).toEqual(second);
  });

  it("exposes exactly three tiers and one discount", () => {
    expect(EARLY_ACCESS_BUNDLE_TIERS.map((tier) => tier.quantity)).toEqual([1, 2, 3]);
    expect(
      EARLY_ACCESS_BUNDLE_TIERS.filter((tier) => tier.discountBasisPoints > 0),
    ).toHaveLength(1);
    expect(earlyAccessBundleTier(4)).toBeNull();
  });
});

describe("idempotency", () => {
  it("creates one order for two submissions of the same key", async () => {
    const orders = new InMemoryEarlyAccessOrderRepository();
    const first = await place({ orders });
    const second = await place({ orders });

    expect(first.ok && first.value.replayed).toBe(false);
    expect(second.ok && second.value.replayed).toBe(true);
    if (!first.ok || !second.ok) throw new Error("both submissions must succeed");
    expect(second.value.record).toEqual(first.value.record);
    expect(await orders.findByIdempotencyKey(IDEMPOTENCY_KEY)).toEqual(first.value.record);
  });

  it("refuses a key reused for a different order", async () => {
    const orders = new InMemoryEarlyAccessOrderRepository();
    await place({ orders });
    const result = await place({ orders, request: request({ quantity: 2 }) });
    expect(result).toEqual({ ok: false, code: "idempotency_key_conflict" });
  });

  it("refuses a key reused for a different customer", async () => {
    const orders = new InMemoryEarlyAccessOrderRepository();
    await place({ orders });
    const result = await place({ orders, request: request({ customerRef: "cus_other" }) });
    expect(result).toEqual({ ok: false, code: "idempotency_key_conflict" });
  });

  it("replays a sold order even after its release is revoked", async () => {
    const orders = new InMemoryEarlyAccessOrderRepository();
    const first = await placed({ orders });

    const revoked = release({
      releaseId: "rel_ea_0002",
      status: "revoked",
      approvedPriceCents: 0,
      currency: "",
      recordedAt: "2026-08-05T00:00:00.000Z",
    });
    const result = await place({ orders, releases: [release(), revoked] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.replayed).toBe(true);
    expect(result.value.record).toEqual(first);
  });

  it("answers with the incumbent when a concurrent write claims the key first", async () => {
    const inner = new InMemoryEarlyAccessOrderRepository();
    const winner = await placed({ orders: inner });

    // The read misses, the write collides: the exact race a unique index closes.
    const racing: EarlyAccessOrderRepository = {
      findByIdempotencyKey: async () => null,
      findByOrderId: (orderId) => inner.findByOrderId(orderId),
      insert: (record) => inner.insert(record),
    };
    const result = await place({ orders: racing });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.replayed).toBe(true);
    expect(result.value.record).toEqual(winner);
  });

  it("refuses when a concurrent write claims the key for a different order", async () => {
    const inner = new InMemoryEarlyAccessOrderRepository();
    await placed({ orders: inner });
    const racing: EarlyAccessOrderRepository = {
      findByIdempotencyKey: async () => null,
      findByOrderId: (orderId) => inner.findByOrderId(orderId),
      insert: (record) => inner.insert(record),
    };
    const result = await place({ orders: racing, request: request({ quantity: 3 }) });
    expect(result).toEqual({ ok: false, code: "idempotency_key_conflict" });
  });

  it("refuses a second order id claimed under a new key", async () => {
    const orders = new InMemoryEarlyAccessOrderRepository();
    await place({ orders });
    const result = await place({
      orders,
      request: request({ idempotencyKey: "idem-ea-0001-000002" }),
    });
    expect(result).toEqual({ ok: false, code: "order_id_taken" });
  });

  it("requires a key long enough not to collide by accident", async () => {
    expect(isEarlyAccessIdempotencyKey("a".repeat(16))).toBe(true);
    expect(isEarlyAccessIdempotencyKey("a".repeat(15))).toBe(false);

    const result = await place({ request: request({ idempotencyKey: "a".repeat(15) }) });
    expect(result).toEqual({ ok: false, code: "idempotency_key_invalid" });
  });

  it("reports the insert outcome the caller needs to distinguish the two collisions", async () => {
    const orders = new InMemoryEarlyAccessOrderRepository();
    const record = await placed({ orders });

    const sameKey: EarlyAccessOrderInsert = await orders.insert(record);
    expect(sameKey.inserted).toBe(false);
    if (sameKey.inserted) return;
    expect(sameKey.reason).toBe("idempotency_key");

    const sameOrderId = await orders.insert({ ...record, idempotencyKey: "idem-ea-0001-000003" });
    expect(sameOrderId.inserted).toBe(false);
    if (sameOrderId.inserted) return;
    expect(sameOrderId.reason).toBe("order_id");
  });
});

describe("request reading fails closed", () => {
  it("refuses input that is not a plain record", async () => {
    for (const hostile of [null, undefined, 42, "order", [], new Date(NOW)]) {
      const result = await place({ request: hostile });
      expect(result).toEqual({ ok: false, code: "request_invalid" });
    }
  });

  it("refuses a request missing a required field", async () => {
    const incomplete = request();
    delete incomplete.customerRef;
    const result = await place({ request: incomplete });
    expect(result).toEqual({ ok: false, code: "request_invalid" });
  });

  it("refuses an accessor planted on a field rather than invoking it", async () => {
    let invoked = 0;
    const hostile = request();
    Object.defineProperty(hostile, "quantity", {
      enumerable: true,
      configurable: true,
      get() {
        invoked += 1;
        return 1;
      },
    });

    const result = await place({ request: hostile });
    expect(result).toEqual({ ok: false, code: "request_invalid" });
    expect(invoked).toBe(0);
  });

  it("raises a distinct code for each malformed identifier", async () => {
    expect(await place({ request: request({ orderId: "!!" }) })).toEqual({
      ok: false,
      code: "order_id_invalid",
    });
    expect(await place({ request: request({ customerRef: "" }) })).toEqual({
      ok: false,
      code: "customer_invalid",
    });
    expect(await place({ request: request({ productId: "!!" }) })).toEqual({
      ok: false,
      code: "product_invalid",
    });
    expect(await place({ request: request({ now: "2026-08-04" }) })).toEqual({
      ok: false,
      code: "timestamp_invalid",
    });
    expect(await place({ request: request({ referralCode: "no spaces allowed" }) })).toEqual({
      ok: false,
      code: "referral_invalid",
    });
  });

  it("carries a valid referral code onto the order", async () => {
    const record = await placed({ request: request({ referralCode: "ALEX-HOUSTON" }) });
    expect(record.order.referralCode).toBe("ALEX-HOUSTON");
  });

  it("writes nothing when the request is refused", async () => {
    const orders = new InMemoryEarlyAccessOrderRepository();
    await place({ orders, request: request({ orderId: "!!" }) });
    await place({ orders, releases: [] });
    expect(await orders.findByIdempotencyKey(IDEMPOTENCY_KEY)).toBeNull();
  });
});

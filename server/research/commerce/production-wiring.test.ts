import { describe, expect, it, vi } from "vitest";
import {
  buildCommerceDependencies,
  CHECKOUT_REQUIRED_AGREEMENT_KEYS,
  type CommerceWiring,
} from "./production-deps";
import { createInMemoryCartStore } from "./persistence/cart-store";
import { createInMemoryOrderStore } from "./persistence/orders-store";
import { createInMemoryInventoryLotStore } from "./persistence/inventory-store";
import { createInMemoryStoreCreditLedgerStore } from "./persistence/store-credit-store";
import { createInMemorySubscriptionStore } from "./persistence/subscriptions-store";
import { createInMemoryAdminQueuesStore } from "./persistence/admin-queues-store";
import { createInMemoryClaimOrderRepository, createInMemoryClaimRepository } from "./refunds";
import { SyntheticDataInProductionError } from "./production-guards";
import { TestPaymentProvider } from "../providers/payment";
import { ConfiguredRateShippingProvider } from "../providers/shipping";
import type { CatalogProduct, ProvenancedFact } from "@shared/research/catalog";
import type { CartDto, CheckoutRequest } from "@shared/research/commerce-api";
import type { InventoryLot } from "../inventory/lots";

// ---------------------------------------------------------------------------
// Three-state proof of the production commerce composition.
//
//   State 1 (flag off): behavior identical to the frozen fail-closed contract,
//     and NO store or provider is even resolved (proven by spies).
//   State 2 (flag on, database unprovisioned): precise capability denials with
//     no side effects, and still no store or provider resolved.
//   State 3 (flag on, database configured): the real services composed over
//     injected in-memory stores and the TestPaymentProvider (sandbox state;
//     synthetic here is deliberate and legal), driven cart to checkout to the
//     member's order history.
//
// Environments are injected objects. process.env is never mutated.
// ---------------------------------------------------------------------------

const NOW = () => new Date("2026-07-22T00:00:00Z");
const AS_OF = new Date("2026-07-22T00:00:00Z");

// Every resolver as a spy that THROWS if invoked, so states 1 and 2 prove
// structurally that no store is touched and no provider is constructed.
function refusingWiring(): { wiring: Partial<CommerceWiring>; spies: Record<string, ReturnType<typeof vi.fn>> } {
  const spies: Record<string, ReturnType<typeof vi.fn>> = {};
  const refuse = (name: string): ReturnType<typeof vi.fn> => {
    const fn = vi.fn(() => {
      throw new Error(`${name} must not be called in this state`);
    });
    spies[name] = fn;
    return fn;
  };
  const wiring = {
    resolveCartStore: refuse("resolveCartStore"),
    resolveOrderRepository: refuse("resolveOrderRepository"),
    resolveClaimRepository: refuse("resolveClaimRepository"),
    resolveClaimOrderRepository: refuse("resolveClaimOrderRepository"),
    resolveInventoryLotStore: refuse("resolveInventoryLotStore"),
    resolveStoreCreditLedgerStore: refuse("resolveStoreCreditLedgerStore"),
    resolveSubscriptionRepository: refuse("resolveSubscriptionRepository"),
    resolveAdminQueuesStore: refuse("resolveAdminQueuesStore"),
    resolvePaymentProvider: refuse("resolvePaymentProvider"),
    resolveShippingProvider: refuse("resolveShippingProvider"),
  } as unknown as Partial<CommerceWiring>;
  return { wiring, spies };
}

function expectNoResolverRan(spies: Record<string, ReturnType<typeof vi.fn>>): void {
  for (const [name, spy] of Object.entries(spies)) {
    expect(spy, `${name} ran`).not.toHaveBeenCalled();
  }
}

// ---------------------------------------------------------------------------
// State 3 fixtures. Names deliberately avoid every synthetic production marker
// (this sandbox composition must not trip the guard) while remaining obviously
// non-production data to a human reader.
// ---------------------------------------------------------------------------

function confirmed<T>(value: T): ProvenancedFact<T> {
  return { value, confirmation: "confirmed", source: { kind: "supplier_document", reference: "wiring-doc-1" } };
}

function purchasableProduct(): CatalogProduct {
  return {
    sku: "P901",
    slug: "wiring-product",
    displayName: "Wiring Product",
    lane: "research_material",
    laneDecision: "decided",
    nameAliases: [],
    availability: "in_stock",
    commerceApproval: "approved",
    fulfillmentOwner: "xenios",
    facts: {
      composition: confirmed("compound W"),
      strength: confirmed("10mg"),
      format: confirmed("vial"),
      priceCents: confirmed(5000),
      shelfLife: confirmed("24 months"),
      storage: confirmed("cool dry place"),
      coa: confirmed("coa-wiring-batch-1"),
    },
    guideState: "guide_published",
    qualityDocumentState: "approved",
    storageDataState: "approved",
    shippingProfileState: "approved",
    goalMappings: [],
    relatedGuideSlugs: [],
    prohibitedClaims: [],
    subscriptionEligible: true,
    lastReviewed: "2026-07-20",
    openSupplierQuestions: [],
  };
}

function cleanLot(): InventoryLot {
  return {
    lotId: "LOTW1",
    sku: "P901",
    owner: "xenios",
    disposition: "available",
    quantityAvailable: 25,
    manufacturedDate: "2026-01-01",
    expiryDate: "2027-06-30",
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

const LIVE_ENV: NodeJS.ProcessEnv = {
  NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
  SUPABASE_URL: "https://wiring.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_wiring_key",
  RESEARCH_SERVICEABLE_STATES: "TX,CA",
};

async function liveSetup() {
  const cartStore = createInMemoryCartStore();
  const orderRepository = createInMemoryOrderStore();
  const lotStore = createInMemoryInventoryLotStore();
  const creditLedger = createInMemoryStoreCreditLedgerStore();
  await lotStore.save(cleanLot());
  const deps = buildCommerceDependencies(NOW, LIVE_ENV, {
    catalogProducts: [purchasableProduct()],
    resolveCartStore: () => cartStore,
    resolveOrderRepository: () => orderRepository,
    resolveClaimRepository: () => createInMemoryClaimRepository(),
    resolveClaimOrderRepository: () => createInMemoryClaimOrderRepository(),
    resolveInventoryLotStore: () => lotStore,
    resolveStoreCreditLedgerStore: () => creditLedger,
    resolveSubscriptionRepository: () => createInMemorySubscriptionStore(),
    resolveAdminQueuesStore: () => createInMemoryAdminQueuesStore(),
    resolvePaymentProvider: () => new TestPaymentProvider(),
    resolveShippingProvider: () => new ConfiguredRateShippingProvider(),
    isMembershipActive: async () => true,
    hasEffectiveAgreement: async () => true,
  });
  return { deps, cartStore, orderRepository, lotStore, creditLedger };
}

function checkoutRequest(overrides: Partial<CheckoutRequest> = {}): CheckoutRequest {
  return {
    shippingAddress: { line1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
    shippingService: "standard",
    acceptedAgreementKeys: [...CHECKOUT_REQUIRED_AGREEMENT_KEYS],
    idempotencyKey: "wire-key-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// State 1: flag off, the production default
// ---------------------------------------------------------------------------

describe("state 1: commerce flag off (production default)", () => {
  const { wiring, spies } = refusingWiring();
  const deps = buildCommerceDependencies(NOW, {}, wiring);

  it("fails every stateful write closed with the frozen commerce_disabled shape", async () => {
    expect(
      await deps.cart.addLine("mem_1", { sku: "P001", quantity: 1, purchaseMode: "one_time" }, AS_OF),
    ).toEqual({ ok: false, code: "commerce_disabled" });
    expect(await deps.cart.updateLine("mem_1", "P001", 2, AS_OF)).toEqual({ ok: false, code: "commerce_disabled" });
    expect(await deps.cart.removeLine("mem_1", "P001", AS_OF)).toEqual({ ok: false, code: "commerce_disabled" });
    expect(await deps.checkout.submit("mem_1", checkoutRequest(), AS_OF)).toEqual({
      ok: false,
      code: "commerce_disabled",
    });
    expect(
      await deps.subscriptions.apply("mem_1", "sub_1", { action: "pause" } as never, AS_OF),
    ).toEqual({ ok: false, code: "commerce_disabled" });
    expect(await deps.claims.submitClaim("mem_1", {} as never, AS_OF)).toEqual({
      ok: false,
      code: "commerce_disabled",
    });
  });

  it("serves the frozen empty read shapes", async () => {
    expect(await deps.cart.getCart("mem_1", AS_OF)).toEqual({ owner: "mem_1", lines: [], commerceEnabled: false });
    expect(await deps.orders.listForMember("mem_1")).toEqual([]);
    expect(await deps.orders.getForMember("mem_1", "ord_1")).toBeNull();
    expect(await deps.subscriptions.listForMember("mem_1")).toEqual([]);
    expect(await deps.claims.listForMember("mem_1")).toEqual([]);
    expect(await deps.storeCredit.forMember("mem_1")).toEqual({ owner: "mem_1", balanceCents: 0, entries: [] });
    expect(await deps.partners.findByMemberId("mem_1")).toBeNull();
    expect(await deps.adminQueues.commerce()).toEqual({ provisioned: false, items: [] });
  });

  it("keeps the real catalog readable, purchasable nowhere, prices null", () => {
    const products = deps.catalog.listProducts();
    expect(products.length).toBeGreaterThanOrEqual(15);
    expect(products.filter((p) => p.purchasable)).toEqual([]);
    for (const product of products) expect(product.priceCents).toBeNull();
    const caps = deps.capabilities.memberVisible();
    expect(caps.product_commerce.enabled).toBe(false);
    expect(caps.quantum_commerce.enabled).toBe(false);
  });

  it("constructs NO provider and touches NO store (resolver spies never ran)", () => {
    expectNoResolverRan(spies);
  });
});

// ---------------------------------------------------------------------------
// State 2: flag on, database unprovisioned
// ---------------------------------------------------------------------------

describe("state 2: flag on, commerce database not provisioned", () => {
  const { wiring, spies } = refusingWiring();
  const deps = buildCommerceDependencies(NOW, { NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true" }, wiring);

  it("refuses storage-dependent writes with the precise capability_disabled denial", async () => {
    const add = (await deps.cart.addLine(
      "mem_1",
      { sku: "P001", quantity: 1, purchaseMode: "one_time" },
      AS_OF,
    )) as { ok: boolean; code: string };
    expect(add.ok).toBe(false);
    expect(add.code).toBe("capability_disabled");
    expect(((await deps.cart.updateLine("mem_1", "P001", 2, AS_OF)) as { code: string }).code).toBe(
      "capability_disabled",
    );
    expect(((await deps.cart.removeLine("mem_1", "P001", AS_OF)) as { code: string }).code).toBe(
      "capability_disabled",
    );
    const sub = (await deps.subscriptions.apply("mem_1", "sub_1", { action: "pause" } as never, AS_OF)) as {
      ok: boolean;
      code: string;
    };
    expect(sub.ok).toBe(false);
    expect(sub.code).toBe("capability_disabled");
    const claim = (await deps.claims.submitClaim("mem_1", {} as never, AS_OF)) as {
      ok: boolean;
      codes: string[];
    };
    expect(claim.ok).toBe(false);
    expect(claim.codes).toEqual(["capability_disabled"]);
  });

  it("refuses checkout with payment_disabled leading (the payment path)", async () => {
    const denied = (await deps.checkout.submit("mem_1", checkoutRequest(), AS_OF)) as {
      ok: boolean;
      code: string;
      codes: string[];
    };
    expect(denied.ok).toBe(false);
    expect(denied.code).toBe("payment_disabled");
    expect(denied.codes).toContain("capability_disabled");
  });

  it("serves empty-safe stateful reads without crashing", async () => {
    expect(await deps.cart.getCart("mem_1", AS_OF)).toEqual({ owner: "mem_1", lines: [], commerceEnabled: false });
    expect(await deps.orders.listForMember("mem_1")).toEqual([]);
    expect(await deps.orders.getForMember("mem_1", "ord_1")).toBeNull();
    expect(await deps.subscriptions.listForMember("mem_1")).toEqual([]);
    expect(await deps.claims.listForMember("mem_1")).toEqual([]);
    expect(await deps.storeCredit.forMember("mem_1")).toEqual({ owner: "mem_1", balanceCents: 0, entries: [] });
    expect(await deps.adminQueues.commerce()).toEqual({ provisioned: false, items: [] });
  });

  it("still serves the catalog, presents nothing purchasable, reports commerce disabled", () => {
    const products = deps.catalog.listProducts();
    expect(products.length).toBeGreaterThanOrEqual(15);
    expect(products.filter((p) => p.purchasable)).toEqual([]);
    const caps = deps.capabilities.memberVisible();
    expect(caps.product_commerce.enabled).toBe(false);
    expect(caps.quantum_commerce.enabled).toBe(false);
  });

  it("constructs NO provider and touches NO store (resolver spies never ran)", () => {
    expectNoResolverRan(spies);
  });
});

// ---------------------------------------------------------------------------
// State 3: flag on, database configured, sandbox composition
// ---------------------------------------------------------------------------

describe("state 3: flag on and configured (sandbox stores + test payment provider)", () => {
  it("runs the full cart to checkout happy path and lands the order in member history", async () => {
    const { deps, orderRepository } = await liveSetup();

    // Cart: the persisted store, real pricing from the catalog, agreements listed.
    const added = (await deps.cart.addLine(
      "mem_w1",
      { sku: "P901", quantity: 2, purchaseMode: "one_time" },
      AS_OF,
    )) as { ok: true; cart: CartDto };
    expect(added.ok).toBe(true);
    expect(added.cart.subtotalCents).toBe(10000);
    expect(added.cart.checkoutReady).toBe(true);
    expect(added.cart.requiredAgreements).toEqual([...CHECKOUT_REQUIRED_AGREEMENT_KEYS]);

    // The cart read survives the request boundary (a fresh per-request service
    // over the same store sees the same lines).
    const read = (await deps.cart.getCart("mem_w1", AS_OF)) as CartDto;
    expect(read.lines.map((l) => l.sku)).toEqual(["P901"]);

    // Checkout: authorized and captured through the test provider.
    const placed = (await deps.checkout.submit("mem_w1", checkoutRequest(), AS_OF)) as {
      ok: true;
      order: Record<string, unknown>;
    };
    expect(placed.ok).toBe(true);
    expect(placed.order.state).toBe("payment_captured");
    expect(placed.order.totalCents).toBe(10000 + (added.cart.shippingCents as number));

    // The wire projection is member-safe by explicit construction.
    expect("paymentReference" in placed.order).toBe(false);
    expect("reviewTriggers" in placed.order).toBe(false);
    expect("idempotencyKey" in placed.order).toBe(false);

    // The order landed in the SAME repository the member order surface reads.
    const orderId = placed.order.orderId as string;
    const summaries = (await deps.orders.listForMember("mem_w1")) as Array<{ orderId: string }>;
    expect(summaries.map((s) => s.orderId)).toEqual([orderId]);
    expect(await deps.orders.getForMember("mem_w1", orderId)).not.toBeNull();
    // Ownership on read: another member cannot see it.
    expect(await deps.orders.getForMember("mem_other", orderId)).toBeNull();

    // Operator data lives on the durable record, not on the wire: the stored
    // order carries the REAL provider reference and the capture amount.
    const stored = await orderRepository.get(orderId);
    expect(stored).not.toBeNull();
    expect(stored!.providerReference).toMatch(/^test_auth_/);
    expect(stored!.capturedAmountCents).toBe(stored!.totals.totalCents);

    // Idempotent replay: same key, same order, no second charge, and the
    // stored record is not overwritten by the replay.
    const before = stored!.updatedAt;
    const replay = (await deps.checkout.submit(
      "mem_w1",
      checkoutRequest(),
      new Date("2026-07-22T01:00:00Z"),
    )) as { ok: true; order: { orderId: string } };
    expect(replay.order.orderId).toBe(orderId);
    expect((await orderRepository.get(orderId))!.updatedAt).toBe(before);
  });

  it("denies a checkout missing the required agreements and writes NOTHING", async () => {
    const { deps, orderRepository } = await liveSetup();
    const added = (await deps.cart.addLine(
      "mem_w2",
      { sku: "P901", quantity: 1, purchaseMode: "one_time" },
      AS_OF,
    )) as { ok: true };
    expect(added.ok).toBe(true);

    const denied = (await deps.checkout.submit(
      "mem_w2",
      checkoutRequest({ acceptedAgreementKeys: [], idempotencyKey: "wire-key-2" }),
      AS_OF,
    )) as { ok: false; code: string; codes: string[] };
    expect(denied.ok).toBe(false);
    expect(denied.codes).toContain("agreement_required");

    // No orphan order, no partial write, in either store.
    expect(await deps.orders.listForMember("mem_w2")).toEqual([]);
    expect(await orderRepository.listAll()).toEqual([]);
  });

  it("denies an empty-cart checkout with the precise reasons and no side effects", async () => {
    const { deps, orderRepository } = await liveSetup();
    const denied = (await deps.checkout.submit(
      "mem_w3",
      checkoutRequest({ idempotencyKey: "wire-key-3" }),
      AS_OF,
    )) as { ok: false; codes: string[] };
    expect(denied.ok).toBe(false);
    expect(denied.codes).toContain("cart_empty");
    expect(await orderRepository.listAll()).toEqual([]);
  });

  it("serves store credit from the ledger with spendable computed", async () => {
    const { deps, creditLedger } = await liveSetup();
    await creditLedger.append({
      id: "cred-w1",
      memberId: "mem_w4",
      amountCents: 1500,
      state: "approved",
      reason: "service_recovery",
      createdAt: "2026-07-01T00:00:00Z",
      availableAt: null,
      reversesId: null,
      actorType: "admin",
      actorId: "admin_w",
      expiresAt: null,
    });
    const credit = (await deps.storeCredit.forMember("mem_w4")) as {
      owner: string;
      balanceCents: number;
      spendableCents: number;
      pendingCents: number;
      entries: unknown[];
    };
    expect(credit.owner).toBe("mem_w4");
    expect(credit.spendableCents).toBe(1500);
    expect(credit.balanceCents).toBe(1500);
    expect(credit.pendingCents).toBe(0);
    expect(credit.entries.length).toBe(1);
  });

  it("wires subscriptions to the real service (ownership enforced, empty list honest)", async () => {
    const { deps } = await liveSetup();
    expect(await deps.subscriptions.listForMember("mem_w5")).toEqual([]);
    const denied = (await deps.subscriptions.apply("mem_w5", "sub_missing", { action: "pause" } as never, AS_OF)) as {
      ok: false;
      code: string;
    };
    expect(denied.ok).toBe(false);
    expect(denied.code).toBe("subscription_not_found");
  });

  it("serves the provisioned admin commerce queues", async () => {
    const { deps } = await liveSetup();
    const view = (await deps.adminQueues.commerce()) as { provisioned: boolean; queues: unknown[] };
    expect(view.provisioned).toBe(true);
    expect(Array.isArray(view.queues)).toBe(true);
    expect(view.queues.length).toBeGreaterThan(0);
  });

  it("reports commerce capabilities as enabled", async () => {
    const { deps } = await liveSetup();
    const caps = deps.capabilities.memberVisible();
    expect(caps.product_commerce.enabled).toBe(true);
    expect(caps.quantum_commerce.enabled).toBe(false);
  });

  it("keeps the REAL catalog non-purchasable even fully configured (per-SKU gates hold)", () => {
    // No catalogProducts override here: the genuine adapted catalog with the
    // flag on and the database configured still sells nothing, because per-SKU
    // eligibility (confirmed facts, quality documentation) fails closed.
    const deps = buildCommerceDependencies(NOW, LIVE_ENV, {
      resolveCartStore: () => createInMemoryCartStore(),
      resolveOrderRepository: () => createInMemoryOrderStore(),
      resolveClaimRepository: () => createInMemoryClaimRepository(),
      resolveClaimOrderRepository: () => createInMemoryClaimOrderRepository(),
      resolveInventoryLotStore: () => createInMemoryInventoryLotStore(),
      resolveStoreCreditLedgerStore: () => createInMemoryStoreCreditLedgerStore(),
      resolveSubscriptionRepository: () => createInMemorySubscriptionStore(),
      resolveAdminQueuesStore: () => createInMemoryAdminQueuesStore(),
      resolvePaymentProvider: () => new TestPaymentProvider(),
      resolveShippingProvider: () => new ConfiguredRateShippingProvider(),
      isMembershipActive: async () => true,
      hasEffectiveAgreement: async () => true,
    });
    const products = deps.catalog.listProducts();
    expect(products.length).toBeGreaterThanOrEqual(15);
    expect(products.filter((p) => p.purchasable)).toEqual([]);
    for (const product of products) expect(product.priceCents).toBeNull();
  });

  it("refuses to compose over a synthetic configuration marker (the guard runs first)", () => {
    expect(() =>
      buildCommerceDependencies(
        NOW,
        { ...LIVE_ENV, SUPABASE_URL: "https://project.example.invalid" },
        {
          resolvePaymentProvider: () => new TestPaymentProvider(),
          resolveShippingProvider: () => new ConfiguredRateShippingProvider(),
        },
      ),
    ).toThrow(SyntheticDataInProductionError);
  });
});

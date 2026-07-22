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
import { createInMemoryReservationStore } from "./persistence/reservations-store";
import { createInMemoryWebhookEventStore } from "./webhooks";
import { createOrderService } from "./orders";
import { TestMitchProvider } from "../providers/fulfillment";
import {
  createInMemoryPartnerLinkStore,
  createInMemoryPartnerMemberStore,
} from "./persistence/partners-store";
import { createInMemoryCommissionLedgerStore } from "./persistence/commissions-store";
import type { CommissionLedgerEntry } from "../partners/commissions";
import { SyntheticDataInProductionError } from "./production-guards";
import { TestPaymentProvider } from "../providers/payment";
import { ConfiguredRateShippingProvider } from "../providers/shipping";
import type { CatalogProduct, ProvenancedFact } from "@shared/research/catalog";
import type { CartDto, CheckoutRequest, ShippingQuoteRequest } from "@shared/research/commerce-api";
import type { PartnerSelfSource } from "./routes";
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
    resolveReservationStore: refuse("resolveReservationStore"),
    resolveWebhookEventStore: refuse("resolveWebhookEventStore"),
    resolvePartnerMemberStore: refuse("resolvePartnerMemberStore"),
    resolvePartnerLinkStore: refuse("resolvePartnerLinkStore"),
    resolveCommissionLedgerStore: refuse("resolveCommissionLedgerStore"),
    resolvePaymentProvider: refuse("resolvePaymentProvider"),
    resolveShippingProvider: refuse("resolveShippingProvider"),
    resolveFulfillmentProvider: refuse("resolveFulfillmentProvider"),
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

/** A cold-chain product: the storage fact names refrigeration, so the shipping
 * profile of any cart containing it is cold_chain. */
function coldChainProduct(): CatalogProduct {
  return {
    ...purchasableProduct(),
    sku: "P902",
    slug: "wiring-cold-product",
    displayName: "Wiring Cold Product",
    facts: {
      ...purchasableProduct().facts,
      storage: confirmed("Refrigerated, store at 2-8C"),
    },
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
  const reservationStore = createInMemoryReservationStore();
  const creditLedger = createInMemoryStoreCreditLedgerStore();
  const claimRepository = createInMemoryClaimRepository();
  const claimOrderRepository = createInMemoryClaimOrderRepository();
  const webhookEventStore = createInMemoryWebhookEventStore();
  const partnerMemberStore = createInMemoryPartnerMemberStore();
  const partnerLinkStore = createInMemoryPartnerLinkStore();
  const commissionLedger = createInMemoryCommissionLedgerStore();
  const payment = new TestPaymentProvider();
  const fulfillment = new TestMitchProvider();
  await lotStore.save(cleanLot());
  await lotStore.save({ ...cleanLot(), lotId: "LOTW2", sku: "P902" });
  // The wiring table is returned so a test can build a SECOND composition over
  // the SAME stores and providers, which is what a process restart means for
  // the durable layer.
  const wiring: Partial<CommerceWiring> = {
    catalogProducts: [purchasableProduct(), coldChainProduct()],
    resolveCartStore: () => cartStore,
    resolveOrderRepository: () => orderRepository,
    resolveClaimRepository: () => claimRepository,
    resolveClaimOrderRepository: () => claimOrderRepository,
    resolveInventoryLotStore: () => lotStore,
    resolveReservationStore: () => reservationStore,
    resolveStoreCreditLedgerStore: () => creditLedger,
    resolveSubscriptionRepository: () => createInMemorySubscriptionStore(),
    resolveAdminQueuesStore: () => createInMemoryAdminQueuesStore(),
    resolveWebhookEventStore: () => webhookEventStore,
    resolvePartnerMemberStore: () => partnerMemberStore,
    resolvePartnerLinkStore: () => partnerLinkStore,
    resolveCommissionLedgerStore: () => commissionLedger,
    resolvePaymentProvider: () => payment,
    resolveShippingProvider: () => new ConfiguredRateShippingProvider(),
    resolveFulfillmentProvider: () => fulfillment,
    isMembershipActive: async () => true,
    hasEffectiveAgreement: async () => true,
  };
  const deps = buildCommerceDependencies(NOW, LIVE_ENV, wiring);
  return {
    deps,
    wiring,
    cartStore,
    orderRepository,
    lotStore,
    reservationStore,
    creditLedger,
    claimRepository,
    claimOrderRepository,
    webhookEventStore,
    partnerMemberStore,
    partnerLinkStore,
    commissionLedger,
    payment,
    fulfillment,
  };
}

/** Places a captured order for `memberId` through the real cart + checkout path. */
async function placeOrder(deps: Awaited<ReturnType<typeof liveSetup>>["deps"], memberId: string, key: string) {
  const added = (await deps.cart.addLine(
    memberId,
    { sku: "P901", quantity: 1, purchaseMode: "one_time" },
    AS_OF,
  )) as { ok: boolean };
  expect(added.ok).toBe(true);
  const placed = (await deps.checkout.submit(memberId, checkoutRequest({ idempotencyKey: key }), AS_OF)) as {
    ok: true;
    order: { orderId: string; totalCents: number };
  };
  expect(placed.ok).toBe(true);
  return placed.order;
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

  it("fails the expanded surfaces closed with the frozen commerce_disabled shape", async () => {
    expect(await deps.subscriptions.create("mem_1", {
      sku: "P001", quantity: 1, frequencyDays: 30, priceVersion: "v1",
    }, AS_OF)).toEqual({ ok: false, code: "commerce_disabled" });
    expect(await deps.claims.getForMember("mem_1", "clm_1")).toBeNull();
    expect(await deps.claimsAdmin.listOpen()).toEqual([]);
    expect(await deps.claimsAdmin.review("clm_1", "admin", "approved", AS_OF)).toEqual({
      ok: false, code: "commerce_disabled",
    });
    expect(await deps.claimsAdmin.refund("clm_1", "admin", 100, "k1", AS_OF)).toEqual({
      ok: false, code: "commerce_disabled",
    });
    expect(await deps.claimsAdmin.replacement("clm_1", "admin", AS_OF)).toEqual({
      ok: false, code: "commerce_disabled",
    });
    expect(
      await deps.partners.applyForMember("mem_1", { role: "affiliate", legalName: "A", contactEmail: "a@b.co" }, AS_OF),
    ).toEqual({ ok: false, code: "commerce_disabled" });
    expect(await deps.partnerAdmin.review("prt_1", "admin", "certify", AS_OF)).toEqual({
      ok: false, code: "commerce_disabled",
    });
    expect(await deps.ordersAdmin.approve("ord_1", "admin", AS_OF)).toEqual({
      ok: false, code: "commerce_disabled",
    });
    expect(await deps.ordersAdmin.capture("ord_1", "admin", AS_OF)).toEqual({
      ok: false, code: "commerce_disabled",
    });
    expect(await deps.ordersAdmin.cancel("ord_1", "admin", "reason", AS_OF)).toEqual({
      ok: false, code: "commerce_disabled",
    });
    expect(
      await deps.shippingQuotes.quoteFor("mem_1", {
        destination: { line1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
        service: "standard",
      }, AS_OF),
    ).toEqual({ ok: false, code: "commerce_disabled" });
  });

  it("refuses a webhook as capability_disabled without constructing anything", async () => {
    expect(await deps.webhooks.handlePayment("{}", "any-signature", AS_OF)).toEqual({
      ok: false,
      code: "capability_disabled",
    });
    expect(await deps.webhooks.handleFulfillment("{}", "any-signature", AS_OF)).toEqual({
      ok: false,
      code: "capability_disabled",
    });
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

  it("refuses the expanded surfaces with the precise capability denial", async () => {
    const create = (await deps.subscriptions.create("mem_1", {
      sku: "P001", quantity: 1, frequencyDays: 30, priceVersion: "v1",
    }, AS_OF)) as { ok: boolean; code: string };
    expect(create.ok).toBe(false);
    expect(create.code).toBe("capability_disabled");
    expect(await deps.claims.getForMember("mem_1", "clm_1")).toBeNull();
    expect(await deps.claimsAdmin.listOpen()).toEqual([]);
    expect(((await deps.claimsAdmin.review("clm_1", "admin", "approved", AS_OF)) as { code: string }).code).toBe(
      "capability_disabled",
    );
    expect(
      ((await deps.claimsAdmin.refund("clm_1", "admin", 100, "k1", AS_OF)) as { code: string }).code,
    ).toBe("capability_disabled");
    expect(
      ((await deps.partners.applyForMember("mem_1", { role: "affiliate", legalName: "A", contactEmail: "a@b.co" }, AS_OF)) as {
        code: string;
      }).code,
    ).toBe("capability_disabled");
    expect(((await deps.partnerAdmin.review("prt_1", "admin", "certify", AS_OF)) as { code: string }).code).toBe(
      "capability_disabled",
    );
    expect(((await deps.ordersAdmin.approve("ord_1", "admin", AS_OF)) as { code: string }).code).toBe(
      "capability_disabled",
    );
    expect(((await deps.ordersAdmin.capture("ord_1", "admin", AS_OF)) as { code: string }).code).toBe(
      "capability_disabled",
    );
    expect(((await deps.ordersAdmin.cancel("ord_1", "admin", "reason", AS_OF)) as { code: string }).code).toBe(
      "capability_disabled",
    );
    expect(
      ((await deps.shippingQuotes.quoteFor("mem_1", {
        destination: { line1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
        service: "standard",
      }, AS_OF)) as { code: string }).code,
    ).toBe("capability_disabled");
    expect(await deps.webhooks.handlePayment("{}", "sig", AS_OF)).toEqual({
      ok: false,
      code: "capability_disabled",
    });
    expect(await deps.webhooks.handleFulfillment("{}", "sig", AS_OF)).toEqual({
      ok: false,
      code: "capability_disabled",
    });
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

// ---------------------------------------------------------------------------
// State 3: the payment webhook over the SAME order repository
// ---------------------------------------------------------------------------

describe("state 3: payment webhook", () => {
  function eventBody(id: string, type: string, orderId: string, providerReference?: string): string {
    return JSON.stringify({ id, type, orderId, providerReference });
  }

  it("verifies, records, applies, and is idempotent on replay, against the member-visible order", async () => {
    const { deps, orderRepository, webhookEventStore } = await liveSetup();

    // An approved order awaiting its capture confirmation, in the SAME
    // repository checkout writes and the member order surface reads.
    await orderRepository.save({
      orderId: "ord_wh1",
      memberId: "mem_wh",
      state: "approved",
      lines: [{ sku: "P901", displayName: "Wiring Product", quantity: 1, lineTotalCents: 5000 }],
      totals: { subtotalCents: 5000, shippingCents: 1295, storeCreditAppliedCents: 0, totalCents: 6295 },
      providerReference: "test_auth_wh",
      lastIdempotencyKey: null,
      reviewTriggers: [],
      createdAt: AS_OF.toISOString(),
      updatedAt: AS_OF.toISOString(),
    });

    const first = await deps.webhooks.handlePayment(
      eventBody("evt_w1", "payment.captured", "ord_wh1", "test_capture_wh"),
      "test-signature",
      AS_OF,
    );
    expect(first).toEqual({ ok: true, applied: true, eventId: "evt_w1" });
    expect((await orderRepository.get("ord_wh1"))!.state).toBe("payment_captured");
    expect(webhookEventStore.seen("test", "evt_w1")).toBe(true);

    // The advance is visible to the member through the ordinary order surface.
    const detail = (await deps.orders.getForMember("mem_wh", "ord_wh1")) as { state: string };
    expect(detail.state).toBe("payment_captured");

    // Replay, layer 1: the test provider's own duplicate-event guard refuses the
    // second delivery outright. Either way, nothing is applied twice.
    const replay = (await deps.webhooks.handlePayment(
      eventBody("evt_w1", "payment.captured", "ord_wh1", "test_capture_wh"),
      "test-signature",
      new Date(AS_OF.getTime() + 60_000),
    )) as { ok: boolean };
    expect(replay.ok).toBe(false);
    expect((await orderRepository.get("ord_wh1"))!.state).toBe("payment_captured");

    // Replay, layer 2: the durable event store is the guard production relies
    // on. An event id it has already seen (recorded here as if by a previous
    // process) is acknowledged as applied:false without touching the order.
    webhookEventStore.record("test", "evt_w9", AS_OF, "payment.captured");
    const storeReplay = await deps.webhooks.handlePayment(
      eventBody("evt_w9", "payment.captured", "ord_wh1", "test_capture_wh"),
      "test-signature",
      new Date(AS_OF.getTime() + 120_000),
    );
    expect(storeReplay).toEqual({ ok: true, applied: false, eventId: "evt_w9" });
    expect((await orderRepository.get("ord_wh1"))!.state).toBe("payment_captured");
  });

  it("refuses an invalid signature before any store is consulted", async () => {
    const { deps, webhookEventStore } = await liveSetup();
    const result = await deps.webhooks.handlePayment(
      eventBody("evt_w2", "payment.captured", "ord_none"),
      "wrong-signature",
      AS_OF,
    );
    expect(result).toEqual({ ok: false, code: "invalid_signature" });
    expect(webhookEventStore.seen("test", "evt_w2")).toBe(false);
  });

  it("records an unknown event type and acknowledges it as a no-op", async () => {
    const { deps, webhookEventStore } = await liveSetup();
    const result = await deps.webhooks.handlePayment(
      eventBody("evt_w3", "payment.something_new", "ord_none"),
      "test-signature",
      AS_OF,
    );
    expect(result).toEqual({ ok: true, applied: false, eventId: "evt_w3" });
    expect(webhookEventStore.seen("test", "evt_w3")).toBe(true);
  });

  it("reports an unknown order without recording the event", async () => {
    const { deps, webhookEventStore } = await liveSetup();
    const result = await deps.webhooks.handlePayment(
      eventBody("evt_w4", "payment.captured", "ord_missing"),
      "test-signature",
      AS_OF,
    );
    expect(result).toEqual({ ok: false, code: "unknown_order" });
    expect(webhookEventStore.seen("test", "evt_w4")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// State 3: checkout reserves through the wired FEFO seam
// ---------------------------------------------------------------------------

describe("state 3: checkout reserves through the wired FEFO seam", () => {
  it("persists the hold, drains FEFO, decrements the shelf, and finalizes on settlement", async () => {
    const setup = await liveSetup();
    await setup.lotStore.save({
      ...cleanLot(),
      lotId: "LOTW_EARLY",
      expiryDate: "2026-12-31",
      quantityAvailable: 1,
    });

    const added = (await setup.deps.cart.addLine(
      "mem_rs",
      { sku: "P901", quantity: 2, purchaseMode: "one_time" },
      AS_OF,
    )) as { ok: boolean };
    expect(added.ok).toBe(true);
    const placed = (await setup.deps.checkout.submit(
      "mem_rs",
      checkoutRequest({ idempotencyKey: "rs-key-1" }),
      AS_OF,
    )) as { ok: true; order: { state: string } };
    expect(placed.ok).toBe(true);
    expect(placed.order.state).toBe("payment_captured");

    // The hold is PERSISTED in the wiring reservation store, FEFO drained the
    // earliest-expiring lot first, and settlement finalized the decrement.
    const holds = await setup.reservationStore.listByMember("mem_rs");
    expect(holds).toHaveLength(1);
    expect(holds[0].sku).toBe("P901");
    expect(holds[0].quantity).toBe(2);
    expect(holds[0].lines).toEqual([
      { lotId: "LOTW_EARLY", quantity: 1 },
      { lotId: "LOTW1", quantity: 1 },
    ]);
    expect(holds[0].status).toBe("finalized");
    expect((await setup.lotStore.get("LOTW_EARLY"))!.quantityAvailable).toBe(0);
    expect((await setup.lotStore.get("LOTW1"))!.quantityAvailable).toBe(24);
  });

  it("reserves nothing when a gate denies the checkout", async () => {
    const setup = await liveSetup();
    await setup.deps.cart.addLine("mem_rs2", { sku: "P901", quantity: 1, purchaseMode: "one_time" }, AS_OF);
    const denied = (await setup.deps.checkout.submit(
      "mem_rs2",
      checkoutRequest({ acceptedAgreementKeys: [], idempotencyKey: "rs-key-2" }),
      AS_OF,
    )) as { ok: false };
    expect(denied.ok).toBe(false);
    expect(await setup.reservationStore.listByMember("mem_rs2")).toEqual([]);
    expect((await setup.lotStore.get("LOTW1"))!.quantityAvailable).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// State 3: cross-instance checkout replay (the durable projection answers)
// ---------------------------------------------------------------------------

describe("state 3: cross-instance checkout replay", () => {
  it("answers a replayed key from the durable projection on a FRESH composition, regressing nothing", async () => {
    const setup = await liveSetup();
    const order = await placeOrder(setup.deps, "mem_rp", "wire-restart-1");

    // An operator advance lands on the durable record before the replay.
    const orders = createOrderService({
      repository: setup.orderRepository,
      payment: setup.payment,
      commerceEnabled: true,
    });
    expect((await orders.beginProcessing(order.orderId, "system", AS_OF)).ok).toBe(true);
    const advanced = (await setup.orderRepository.get(order.orderId))!;
    expect(advanced.state).toBe("processing");

    // A SECOND buildCommerceDependencies over the SAME wiring: fresh
    // in-process service state, exactly what a process restart leaves behind.
    const deps2 = buildCommerceDependencies(NOW, LIVE_ENV, setup.wiring);
    const replay = (await deps2.checkout.submit(
      "mem_rp",
      checkoutRequest({ idempotencyKey: "wire-restart-1" }),
      AS_OF,
    )) as { ok: true; order: { orderId: string; state: string } };
    expect(replay.ok).toBe(true);

    // Same order, the record's CURRENT state reported, one row, and the
    // durable record neither overwritten nor regressed (updatedAt unchanged,
    // capture intact).
    expect(replay.order.orderId).toBe(order.orderId);
    expect(replay.order.state).toBe("processing");
    expect(await setup.orderRepository.listAll()).toHaveLength(1);
    const stored = (await setup.orderRepository.get(order.orderId))!;
    expect(stored.state).toBe("processing");
    expect(stored.capturedAmountCents).toBe(stored.totals.totalCents);
    expect(stored.updatedAt).toBe(advanced.updatedAt);
  });
});

// ---------------------------------------------------------------------------
// State 3: the admin order lifecycle over the composition
// ---------------------------------------------------------------------------

describe("state 3: admin order lifecycle", () => {
  async function heldOrder(setup: Awaited<ReturnType<typeof liveSetup>>) {
    const added = (await setup.deps.cart.addLine(
      "mem_adm",
      { sku: "P901", quantity: 21, purchaseMode: "one_time" },
      AS_OF,
    )) as { ok: boolean };
    expect(added.ok).toBe(true);
    const placed = (await setup.deps.checkout.submit(
      "mem_adm",
      checkoutRequest({ idempotencyKey: "adm-key-1" }),
      AS_OF,
    )) as { ok: true; order: { orderId: string; state: string; totalCents: number } };
    expect(placed.ok).toBe(true);
    expect(placed.order.state).toBe("manual_review");
    return placed.order;
  }

  it("refuses capture before approval with the machine code, then approves and captures once", async () => {
    const setup = await liveSetup();
    const held = await heldOrder(setup);

    const early = (await setup.deps.ordersAdmin.capture(held.orderId, "samuel@admin", AS_OF)) as {
      ok: false;
      code: string;
    };
    expect(early.ok).toBe(false);
    expect(early.code).toBe("order_state_invalid");

    const approved = (await setup.deps.ordersAdmin.approve(held.orderId, "samuel@admin", AS_OF)) as {
      ok: true;
      order: { state: string; approvedBy: string | null };
    };
    expect(approved.ok).toBe(true);
    expect(approved.order.state).toBe("approved");
    expect(approved.order.approvedBy).toBe("samuel@admin");

    const captured = (await setup.deps.ordersAdmin.capture(held.orderId, "samuel@admin", AS_OF)) as {
      ok: true;
      order: { state: string; capturedAmountCents: number | null };
    };
    expect(captured.ok).toBe(true);
    expect(captured.order.state).toBe("payment_captured");
    expect(captured.order.capturedAmountCents).toBe(held.totalCents);

    // The durable record carries the capture; the member surface reads it.
    const stored = await setup.orderRepository.get(held.orderId);
    expect(stored?.capturedAmountCents).toBe(held.totalCents);
    const view = (await setup.deps.orders.getForMember("mem_adm", held.orderId)) as { state: string };
    expect(view.state).toBe("payment_captured");
  });

  it("cancels a held order with the reason recorded and the authorization released", async () => {
    const setup = await liveSetup();
    const held = await heldOrder(setup);

    const cancelled = (await setup.deps.ordersAdmin.cancel(
      held.orderId,
      "samuel@admin",
      "review declined",
      AS_OF,
    )) as {
      ok: true;
      order: { state: string; cancellationReason: string | null; authorizationReleaseFailed: boolean };
    };
    expect(cancelled.ok).toBe(true);
    expect(cancelled.order.state).toBe("cancelled");
    expect(cancelled.order.cancellationReason).toBe("review declined");
    expect(cancelled.order.authorizationReleaseFailed).toBe(false);

    // Terminal: nothing further may happen to a cancelled order.
    const late = (await setup.deps.ordersAdmin.approve(held.orderId, "samuel@admin", AS_OF)) as {
      ok: false;
      code: string;
    };
    expect(late.ok).toBe(false);
    expect(late.code).toBe("order_state_invalid");
  });
});

// ---------------------------------------------------------------------------
// State 3: the fulfillment webhook over the composed provider and stores
// ---------------------------------------------------------------------------

describe("state 3: fulfillment webhook", () => {
  it("verifies, applies, lands tracking on the shipments, and absorbs a replay via the durable event store", async () => {
    const setup = await liveSetup();
    const order = await placeOrder(setup.deps, "mem_ff", "ff-key-1");

    // Advance to fulfilled so the delivered event is a legal provider move.
    const orders = createOrderService({
      repository: setup.orderRepository,
      payment: setup.payment,
      commerceEnabled: true,
    });
    expect((await orders.beginProcessing(order.orderId, "system", AS_OF)).ok).toBe(true);
    expect((await orders.markFulfilled(order.orderId, "system", AS_OF)).ok).toBe(true);

    const body = JSON.stringify({
      eventId: "ff_evt_w1",
      fulfillmentOrderId: order.orderId,
      status: "delivered",
      trackingNumber: "TRACKW1",
      carrier: "test-carrier",
    });
    const first = await setup.deps.webhooks.handleFulfillment(body, "test-signature", AS_OF);
    expect(first).toEqual({ ok: true, applied: true, eventId: "ff_evt_w1" });

    // The order every surface reads advanced, and the verified event's
    // tracking landed on the member-visible shipment records.
    const stored = (await setup.orderRepository.get(order.orderId))!;
    expect(stored.state).toBe("delivered");
    expect(stored.shipments).toEqual([
      { owner: "xenios", status: "delivered", trackingNumber: "TRACKW1", carrier: "test-carrier" },
    ]);

    // TestMitchProvider does not deduplicate, so the redelivery proves the
    // durable EVENT STORE's replay gate: acknowledged, applied false, no move.
    const replay = await setup.deps.webhooks.handleFulfillment(body, "test-signature", AS_OF);
    expect(replay).toEqual({ ok: true, applied: false, eventId: "ff_evt_w1" });
    expect((await setup.orderRepository.get(order.orderId))!.state).toBe("delivered");
  });

  it("refuses a forged signature before any store is consulted", async () => {
    const setup = await liveSetup();
    const result = await setup.deps.webhooks.handleFulfillment(
      JSON.stringify({ eventId: "ff_evt_w2", fulfillmentOrderId: "ord_x", status: "delivered" }),
      "forged-signature",
      AS_OF,
    );
    expect(result).toEqual({ ok: false, code: "invalid_signature" });
    expect(setup.webhookEventStore.seen("test", "ff_evt_w2")).toBe(false);
  });

  it("refuses precisely under the DEFAULT provider resolution (Mitch not enabled)", async () => {
    // No fulfillment injection: the default resolver over LIVE_ENV (which does
    // not enable Mitch) resolves the disabled provider, so a fulfillment event
    // is refused as a capability that is not ready (retryable at the route).
    const deps = buildCommerceDependencies(NOW, LIVE_ENV, {
      catalogProducts: [purchasableProduct()],
      resolveCartStore: () => createInMemoryCartStore(),
      resolveOrderRepository: () => createInMemoryOrderStore(),
      resolveClaimRepository: () => createInMemoryClaimRepository(),
      resolveClaimOrderRepository: () => createInMemoryClaimOrderRepository(),
      resolveInventoryLotStore: () => createInMemoryInventoryLotStore(),
      resolveReservationStore: () => createInMemoryReservationStore(),
      resolveStoreCreditLedgerStore: () => createInMemoryStoreCreditLedgerStore(),
      resolveSubscriptionRepository: () => createInMemorySubscriptionStore(),
      resolveAdminQueuesStore: () => createInMemoryAdminQueuesStore(),
      resolveWebhookEventStore: () => createInMemoryWebhookEventStore(),
      resolvePartnerMemberStore: () => createInMemoryPartnerMemberStore(),
      resolvePartnerLinkStore: () => createInMemoryPartnerLinkStore(),
      resolveCommissionLedgerStore: () => createInMemoryCommissionLedgerStore(),
      resolvePaymentProvider: () => new TestPaymentProvider(),
      resolveShippingProvider: () => new ConfiguredRateShippingProvider(),
      isMembershipActive: async () => true,
      hasEffectiveAgreement: async () => true,
    });
    const result = await deps.webhooks.handleFulfillment(
      JSON.stringify({ eventId: "ff_evt_w3", fulfillmentOrderId: "ord_x", status: "delivered" }),
      "test-signature",
      AS_OF,
    );
    expect(result).toEqual({ ok: false, code: "capability_disabled" });
  });
});

// ---------------------------------------------------------------------------
// State 3: the refund claim workflow end to end
// ---------------------------------------------------------------------------

describe("state 3: refund claims (member submit to admin refund)", () => {
  async function claimSetup() {
    const setup = await liveSetup();
    const order = await placeOrder(setup.deps, "mem_c1", "claim-key-1");
    const stored = (await setup.orderRepository.get(order.orderId))!;
    // In production the claim-order projection reads the same research_orders
    // row checkout wrote; the in-memory twin of that shared row is seeded here.
    await setup.claimOrderRepository.save({
      orderId: order.orderId,
      memberId: "mem_c1",
      state: stored.state,
      capturedAmountCents: stored.capturedAmountCents ?? 0,
      paymentReference: stored.providerReference,
      refundedCents: 0,
      lines: [{ sku: "P901", lotId: null }],
    });
    return { ...setup, order };
  }

  it("runs submit, admin review, and a provider-proofed refund, idempotently", async () => {
    const { deps, order, claimOrderRepository } = await claimSetup();

    const submitted = (await deps.claims.submitClaim(
      "mem_c1",
      { orderId: order.orderId, sku: "P901", reason: "damaged", detail: "arrived cracked", evidenceRefs: ["ev-1"] },
      AS_OF,
    )) as { ok: true; claim: { claimId: string; state: string } };
    expect(submitted.ok).toBe(true);
    const claimId = submitted.claim.claimId;

    // The member sees their own claim; another member cannot.
    expect(await deps.claims.getForMember("mem_c1", claimId)).not.toBeNull();
    expect(await deps.claims.getForMember("mem_other", claimId)).toBeNull();

    // The admin queue lists it through the explicit admin view.
    const open = (await deps.claimsAdmin.listOpen()) as Array<{ claimId: string; memberId: string }>;
    expect(open.map((c) => c.claimId)).toContain(claimId);

    const approved = (await deps.claimsAdmin.review(claimId, "samuel@admin", "approved", AS_OF)) as {
      ok: boolean;
    };
    expect(approved.ok).toBe(true);

    const refunded = (await deps.claimsAdmin.refund(claimId, "samuel@admin", 1000, "refund-key-1", AS_OF)) as {
      ok: true;
      claim: { state: string; resolution: string };
    };
    expect(refunded.ok).toBe(true);
    expect(refunded.claim.state).toBe("resolved");
    expect(refunded.claim.resolution).toBe("partial_refund");

    // The order projection reflects the refund state (the member history reads it).
    const view = (await claimOrderRepository.get(order.orderId))!;
    expect(view.state).toBe("refunded");
    expect(view.refundedCents).toBe(1000);

    // A replayed refund key is absorbed: no second refund, the ledger stands.
    const replay = (await deps.claimsAdmin.refund(claimId, "samuel@admin", 1000, "refund-key-1", AS_OF)) as {
      ok: boolean;
    };
    expect(replay.ok).toBe(true);
    expect((await claimOrderRepository.get(order.orderId))!.refundedCents).toBe(1000);
  });

  it("denies a refund of an unapproved claim and moves no money", async () => {
    const { deps, order, claimOrderRepository } = await claimSetup();
    const submitted = (await deps.claims.submitClaim(
      "mem_c1",
      { orderId: order.orderId, sku: "P901", reason: "damaged", detail: "d", evidenceRefs: [] },
      AS_OF,
    )) as { ok: true; claim: { claimId: string } };
    const denied = (await deps.claimsAdmin.refund(submitted.claim.claimId, "admin", 500, "rk-2", AS_OF)) as {
      ok: false;
      codes: string[];
    };
    expect(denied.ok).toBe(false);
    expect(denied.codes).toContain("order_state_invalid");
    expect((await claimOrderRepository.get(order.orderId))!.refundedCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// State 3: subscription creation through the real service
// ---------------------------------------------------------------------------

describe("state 3: subscription creation", () => {
  it("creates a PENDING subscription that charges nothing and lists for its owner only", async () => {
    const { deps } = await liveSetup();
    const created = (await deps.subscriptions.create(
      "mem_s1",
      { sku: "P901", quantity: 1, frequencyDays: 30, priceVersion: "2026-07-20" },
      AS_OF,
    )) as { ok: true; subscription: { subscriptionId: string; state: string; nextChargeAt: string | null } };
    expect(created.ok).toBe(true);
    expect(created.subscription.state).toBe("pending");
    // Never charges out of creation alone: no schedule until activation.
    expect(created.subscription.nextChargeAt).toBeNull();

    const mine = (await deps.subscriptions.listForMember("mem_s1")) as Array<{ subscriptionId: string }>;
    expect(mine.map((s) => s.subscriptionId)).toEqual([created.subscription.subscriptionId]);
    expect(await deps.subscriptions.listForMember("mem_other")).toEqual([]);
  });

  it("denies the precise gate failures", async () => {
    const { deps } = await liveSetup();
    expect(
      ((await deps.subscriptions.create("mem_s2", { sku: "NOPE", quantity: 1, frequencyDays: 30, priceVersion: "v" }, AS_OF)) as { code: string }).code,
    ).toBe("product_not_found");
    expect(
      ((await deps.subscriptions.create("mem_s2", { sku: "P901", quantity: 0, frequencyDays: 30, priceVersion: "v" }, AS_OF)) as { code: string }).code,
    ).toBe("quantity_invalid");
    expect(
      ((await deps.subscriptions.create("mem_s2", { sku: "P901", quantity: 1, frequencyDays: 45, priceVersion: "v" }, AS_OF)) as { code: string }).code,
    ).toBe("subscription_action_invalid");
  });
});

// ---------------------------------------------------------------------------
// State 3: the partner portal over the durable linkage
// ---------------------------------------------------------------------------

describe("state 3: partner portal", () => {
  const APPLY = { role: "affiliate" as const, legalName: "Wiring Person", contactEmail: "wiring@partner.co" };

  it("onboards one partner per member and resolves it from the member only", async () => {
    const { deps } = await liveSetup();
    const applied = (await deps.partners.applyForMember("mem_p1", APPLY, AS_OF)) as {
      ok: true;
      partner: { partnerId: string; state: string };
    };
    expect(applied.ok).toBe(true);
    expect(applied.partner.state).toBe("application");

    // Resolvable by the owning member, invisible to anyone else.
    const self = await deps.partners.findByMemberId("mem_p1");
    expect(self?.partnerId).toBe(applied.partner.partnerId);
    expect(await deps.partners.findByMemberId("mem_p2")).toBeNull();

    // One member, one partner: the duplicate is a typed refusal, not an overwrite.
    const dup = (await deps.partners.applyForMember("mem_p1", APPLY, AS_OF)) as { ok: false; code: string };
    expect(dup.ok).toBe(false);
    expect(dup.code).toBe("forbidden");
  });

  it("never serializes the legal name or contact email back out", async () => {
    const { deps } = await liveSetup();
    const applied = await deps.partners.applyForMember("mem_p3", APPLY, AS_OF);
    expect(JSON.stringify(applied)).not.toContain("Wiring Person");
    expect(JSON.stringify(applied)).not.toContain("wiring@partner.co");
    const self = await deps.partners.findByMemberId("mem_p3");
    expect(JSON.stringify(self)).not.toContain("Wiring Person");
    expect(JSON.stringify(self)).not.toContain("wiring@partner.co");
  });

  it("serves the dashboard as ledger aggregates and the links from the durable store", async () => {
    const { deps, commissionLedger, partnerLinkStore } = await liveSetup();
    const applied = (await deps.partners.applyForMember("mem_p4", APPLY, AS_OF)) as {
      ok: true;
      partner: { partnerId: string };
    };
    const partnerId = applied.partner.partnerId;

    const accrual: CommissionLedgerEntry = {
      id: "cl_1",
      rootId: "cl_1",
      previousEntryId: null,
      kind: "accrual",
      partnerId,
      orderId: "ord_led_1",
      amountCents: 500,
      eligibleNetCents: 5000,
      state: "pending",
      actor: "system",
      actorId: null,
      reason: null,
      payoutBatchId: null,
      providerReference: null,
      sourceReference: null,
      createdAt: AS_OF.toISOString(),
    };
    await commissionLedger.append(accrual);
    await commissionLedger.append({
      ...accrual,
      id: "cl_2",
      previousEntryId: "cl_1",
      kind: "transition",
      amountCents: 0,
      state: "payable",
    });
    await partnerLinkStore.saveLink({
      code: "wire-code-1",
      partnerId,
      channel: "code",
      campaign: null,
      issuedAt: AS_OF.toISOString(),
    });

    const source = (await deps.partners.findByMemberId("mem_p4")) as PartnerSelfSource;
    const dashboard = (await deps.partners.dashboardFor(source)) as {
      partnerId: string;
      conversionCount: number;
      totalCommissionCents: number;
      payableCents: number;
      conversions: unknown[];
    };
    expect(dashboard.partnerId).toBe(partnerId);
    expect(dashboard.conversionCount).toBe(1);
    expect(dashboard.totalCommissionCents).toBe(500);
    expect(dashboard.payableCents).toBe(500);
    // Aggregates only: no member identity survives serialization.
    expect(JSON.stringify(dashboard)).not.toContain("mem_");

    const links = await deps.partners.listLinks(partnerId);
    expect(links).toEqual([
      {
        code: "wire-code-1",
        url: "https://xeniostechnology.com/r/wire-code-1",
        channel: "code",
        campaign: null,
        qrSvgPath: null,
      },
    ]);
  });

  it("refuses the admin lifecycle review precisely while no durable lifecycle path exists", async () => {
    const { deps } = await liveSetup();
    const result = (await deps.partnerAdmin.review("prt_any", "admin", "certify", AS_OF)) as {
      ok: false;
      code: string;
    };
    expect(result.ok).toBe(false);
    expect(result.code).toBe("capability_disabled");
  });
});

// ---------------------------------------------------------------------------
// State 3: the member shipping quote
// ---------------------------------------------------------------------------

describe("state 3: shipping quote", () => {
  const DESTINATION: ShippingQuoteRequest["destination"] = {
    line1: "1 Main St",
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    country: "US",
  };

  it("quotes the configured standard rate for an ambient cart, with an expiry", async () => {
    const { deps } = await liveSetup();
    await deps.cart.addLine("mem_q1", { sku: "P901", quantity: 1, purchaseMode: "one_time" }, AS_OF);
    const result = (await deps.shippingQuotes.quoteFor(
      "mem_q1",
      { destination: DESTINATION, service: "standard" },
      AS_OF,
    )) as { ok: true; quote: { kind: string; amountCents: number }; expiresAt: string };
    expect(result.ok).toBe(true);
    expect(result.quote.kind).toBe("configured_fallback");
    expect(result.quote.amountCents).toBe(1295);
    expect(result.expiresAt).toBe(new Date(AS_OF.getTime() + 15 * 60 * 1000).toISOString());
  });

  it("refuses to quote an empty cart", async () => {
    const { deps } = await liveSetup();
    const result = (await deps.shippingQuotes.quoteFor(
      "mem_q2",
      { destination: DESTINATION, service: "standard" },
      AS_OF,
    )) as { ok: false; code: string };
    expect(result.code).toBe("cart_empty");
  });

  it("derives cold chain from the cart's product profiles and refuses honestly", async () => {
    const { deps } = await liveSetup();
    await deps.cart.addLine("mem_q3", { sku: "P902", quantity: 1, purchaseMode: "one_time" }, AS_OF);
    // The configured-rate provider cannot carry a validated cold chain, so a
    // cold cart is a refusal, never a guessed ambient price.
    const result = (await deps.shippingQuotes.quoteFor(
      "mem_q3",
      { destination: DESTINATION, service: "standard" },
      AS_OF,
    )) as { ok: false; code: string };
    expect(result.ok).toBe(false);
    expect(result.code).toBe("shipping_unavailable");
  });

  it("relays a provider address rejection as address_invalid", async () => {
    const { deps } = await liveSetup();
    await deps.cart.addLine("mem_q4", { sku: "P901", quantity: 1, purchaseMode: "one_time" }, AS_OF);
    const result = (await deps.shippingQuotes.quoteFor(
      "mem_q4",
      { destination: { ...DESTINATION, postalCode: "1234" }, service: "standard" },
      AS_OF,
    )) as { ok: false; code: string };
    expect(result.code).toBe("address_invalid");
  });

  it("refuses a service the provider cannot actually buy", async () => {
    const { deps } = await liveSetup();
    await deps.cart.addLine("mem_q5", { sku: "P901", quantity: 1, purchaseMode: "one_time" }, AS_OF);
    const result = (await deps.shippingQuotes.quoteFor(
      "mem_q5",
      { destination: DESTINATION, service: "next_day" },
      AS_OF,
    )) as { ok: false; code: string };
    expect(result.code).toBe("shipping_unavailable");
  });
});

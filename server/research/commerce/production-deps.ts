import type { CommerceDependencies } from "./routes";
import type { CatalogProduct } from "@shared/research/catalog";
import type { CommerceDenialCode } from "@shared/research/commerce-api";
import type { InventoryLot } from "../inventory/lots";
import { products as legacyProducts } from "../products-data";
import { adaptLegacyCatalog } from "../catalog/legacy-adapter";
import { createCatalogService, type CatalogService } from "../catalog/catalog-service";
import { createCartService, type CartService } from "./cart";
import { createCheckoutService, type CheckoutOrder, type CheckoutService } from "./checkout";
import { createOrderService, type OrderRecord, type OrderRepository } from "./orders";
import {
  createRefundService,
  type ClaimOrderRepository,
  type ClaimRepository,
} from "./refunds";
import { createSubscriptionService, type SubscriptionRepository } from "./subscriptions";
import { assertNoSyntheticDataInProduction } from "./production-guards";
import { resolveCartStore, type AsyncCartStore } from "./persistence/cart-store";
import { resolveOrderRepository } from "./persistence/orders-store";
import { resolveClaimOrderRepository, resolveClaimRepository } from "./persistence/claims-store";
import { resolveInventoryLotStore, type InventoryLotRepository } from "./persistence/inventory-store";
import {
  resolveStoreCreditLedgerStore,
  storeCreditDtoOf,
  type StoreCreditLedgerRecord,
  type StoreCreditLedgerRepository,
} from "./persistence/store-credit-store";
import { resolveSubscriptionRepository } from "./persistence/subscriptions-store";
import { resolveAdminQueuesStore, type AdminQueuesRepository } from "./persistence/admin-queues-store";
import { resolvePaymentProvider, type PaymentProvider } from "../providers/payment";
import { resolveShippingProvider, type ShippingProvider } from "../providers/shipping";
import { hasAcceptedCurrent } from "../agreements";
import { getSupabaseAdmin } from "../../supabase";

// ---------------------------------------------------------------------------
// Production commerce dependencies (integration lane): the three-state composition.
//
// The commerce HTTP surface is registered with these deps by the integration
// wiring (server/index.ts calls buildCommerceDependencies() bare). The build
// resolves to exactly one of three states, decided ONCE at composition time:
//
//   STATE 1, commerce flag off (the production default).
//     Behavior is IDENTICAL to the original fail-closed wiring and is a hard
//     compatibility contract: the CATALOG read path is real and provenance
//     gated (an unconfirmed supplier fact is never shown as fact, nothing is
//     purchasable), while every STATEFUL surface fails closed. Reads return
//     their empty shapes and writes return { ok: false, code: "commerce_disabled" }.
//     No provider is constructed, no store is touched, no database call happens.
//
//   STATE 2, commerce flag on but the commerce database is not provisioned
//     (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absent).
//     The catalog stays readable, but the system refuses to half-work: every
//     stateful read returns its empty-safe shape and every write refuses with
//     a PRECISE capability denial (capability_disabled for storage-dependent
//     writes; payment_disabled leads for checkout, the payment path). Nothing
//     partial is written, no provider is constructed, no store is touched, so
//     there can be no orphan order and no inventory loss. Member-visible
//     capabilities report commerce as disabled, because a flag without a
//     backing capability is not commerce.
//
//   STATE 3, commerce flag on and the database configured.
//     The real composition: the domain services (cart, checkout, orders,
//     refund claims, subscriptions) over their resolved persistent stores and
//     the resolved payment and shipping providers. The synthetic-data guard
//     runs FIRST over every configuration value about to be used, so sandbox
//     fixtures can never compose into a live process.
//
// Product commerce additionally stays gated by per-SKU purchase eligibility
// (0 of 15 today; no COAs on file) regardless of state. See
// docs/research-commerce/PURCHASE_ELIGIBILITY_FINAL.md.
// ---------------------------------------------------------------------------

const DISABLED = { ok: false as const, code: "commerce_disabled" as const };

// ---------------------------------------------------------------------------
// Checkout and subscription agreement keys.
//
// Sourced from the legal register (docs/research-legal/00-register), which is
// the only place these obligations are defined today; there is no code-side
// agreement config for the commerce documents yet (the XR-MEM activation
// bundle in server/research/agreements.ts is a different lifecycle moment).
// Presenting them at EVERY checkout is a superset of the register's "first
// checkout, re-acceptance on material change" trigger, which is the safe side.
//   XR-COM-001 Product Order Terms (first product checkout)
//   XR-COM-007 No Ordinary Returns Policy (product checkout)
//   XR-COM-018 Recall Notification Terms (before the first purchase completes)
//   XR-COM-002 Product Subscription Authorization (subscription enrollment)
// ---------------------------------------------------------------------------

export const CHECKOUT_REQUIRED_AGREEMENT_KEYS: readonly string[] = [
  "XR-COM-001",
  "XR-COM-007",
  "XR-COM-018",
];

export const SUBSCRIPTION_REQUIRED_AGREEMENT_KEYS: readonly string[] = ["XR-COM-002"];

// ---------------------------------------------------------------------------
// Environment reads. All flag and configuration reads happen INSIDE
// buildCommerceDependencies against the injected env (default process.env), so
// the composition is decided per build rather than at module import.
// ---------------------------------------------------------------------------

/** Mirrors supabaseConfigured() in server/supabase.ts, over an injectable env. */
function databaseConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * US states xenios may ship to, from RESEARCH_SERVICEABLE_STATES (comma
 * separated two-letter codes). The default is EMPTY, which ships nowhere:
 * checkout fails closed with state_not_serviceable until Samuel configures the
 * serviceable list. Malformed entries are dropped, never guessed.
 */
function serviceableStatesFrom(env: NodeJS.ProcessEnv): string[] {
  return (env.RESEARCH_SERVICEABLE_STATES ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{2}$/.test(s));
}

// ---------------------------------------------------------------------------
// Wiring seam.
//
// Every store and provider is resolved through this table so the composition
// itself is testable: the production default is the real resolver set below,
// and a test can inject in-memory stores or spies without touching process
// state. index.ts passes nothing, so production always gets the real thing.
// ---------------------------------------------------------------------------

export interface CommerceWiring {
  /** Catalog records to serve. Default: the provenance-adapted legacy catalog. */
  catalogProducts?: CatalogProduct[];
  resolveCartStore(): AsyncCartStore;
  resolveOrderRepository(): OrderRepository;
  resolveClaimRepository(): ClaimRepository;
  resolveClaimOrderRepository(): ClaimOrderRepository;
  resolveInventoryLotStore(): InventoryLotRepository;
  resolveStoreCreditLedgerStore(): StoreCreditLedgerRepository;
  resolveSubscriptionRepository(): SubscriptionRepository;
  resolveAdminQueuesStore(): AdminQueuesRepository;
  resolvePaymentProvider(env: NodeJS.ProcessEnv): PaymentProvider;
  resolveShippingProvider(env: NodeJS.ProcessEnv): ShippingProvider;
  /** Renewal-gate seams (subscriptions.evaluateRenewal only; not on the HTTP path). */
  isMembershipActive(memberId: string): Promise<boolean>;
  hasEffectiveAgreement(memberId: string, agreementKey: string): Promise<boolean>;
}

/**
 * A renewal never proceeds for a lapsed membership. Reads the member row and
 * fails CLOSED on any error, so a database hiccup refuses a charge rather than
 * allowing one.
 */
async function memberIsActiveInDatabase(memberId: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("research_members")
      .select("status")
      .eq("id", memberId)
      .maybeSingle();
    if (error || !data) return false;
    return (data as { status?: string }).status === "active";
  } catch {
    return false;
  }
}

/**
 * Effective paper is answered by the agreements engine. The commerce agreement
 * keys (XR-COM-*) are not registered there yet, so this fails CLOSED for them:
 * a subscription renewal refuses with agreement_required until the agreements
 * engine carries the commerce documents. That is the correct direction to fail.
 */
async function memberHasAcceptedCurrentAgreement(memberId: string, agreementKey: string): Promise<boolean> {
  try {
    return await hasAcceptedCurrent(memberId, agreementKey);
  } catch {
    return false;
  }
}

function defaultWiring(): CommerceWiring {
  return {
    resolveCartStore,
    resolveOrderRepository,
    resolveClaimRepository,
    resolveClaimOrderRepository,
    resolveInventoryLotStore,
    resolveStoreCreditLedgerStore,
    resolveSubscriptionRepository,
    resolveAdminQueuesStore,
    resolvePaymentProvider,
    resolveShippingProvider,
    isMembershipActive: memberIsActiveInDatabase,
    hasEffectiveAgreement: memberHasAcceptedCurrentAgreement,
  };
}

// ---------------------------------------------------------------------------
// Shared read-only pieces (catalog + guides), used by every state.
// ---------------------------------------------------------------------------

function catalogDependency(catalogService: CatalogService): CommerceDependencies["catalog"] {
  return {
    listProducts: () => catalogService.listProducts(),
    getProduct: (slug) => catalogService.getProduct(slug),
    listGoals: () => catalogService.listGoals(),
  };
}

// Evidence-domain guides exist (server/research/evidence), but the
// evidence-to-commerce DTO adapter is the next content-integration step, so
// the member guide surface reads empty rather than presenting unmapped data.
// This is deliberately NOT one of the stateful commerce surfaces.
function guidesDependency(): CommerceDependencies["guides"] {
  return {
    listForMember: () => Promise.resolve([]),
    getForMember: () => Promise.resolve(null),
  };
}

// The partner surface stays fail-closed in every state, with the reason
// documented once here rather than implied: the domain PartnerRecord carries
// no member linkage (research_partners.member_id exists in the schema but not
// in the domain model), and resolvePartnerRepository is an in-memory-only
// documented deferral pending that schema-domain reconciliation. Every partner
// route resolves through findByMemberId first, so the honest composition is
// the whole surface closed rather than half-wired.
// TODO(track-b): wire the partner surface once the partners domain carries the
// member linkage and a durable partner repository exists.
function partnersFailClosed(): CommerceDependencies["partners"] {
  return {
    findByMemberId: () => Promise.resolve(null),
    dashboardFor: (partnerId) => Promise.resolve({ partnerId, provisioned: false }),
    listLinks: () => Promise.resolve([]),
  };
}

// ---------------------------------------------------------------------------
// STATE 1: commerce flag off. The frozen compatibility contract.
// ---------------------------------------------------------------------------

function disabledDependencies(
  catalogService: CatalogService,
  now: () => Date,
): CommerceDependencies {
  return {
    catalog: catalogDependency(catalogService),
    guides: guidesDependency(),
    cart: {
      getCart: (memberId) => Promise.resolve({ owner: memberId, lines: [], commerceEnabled: false }),
      addLine: () => Promise.resolve(DISABLED),
      updateLine: () => Promise.resolve(DISABLED),
      removeLine: () => Promise.resolve(DISABLED),
    },
    checkout: {
      submit: async () => DISABLED,
    },
    orders: {
      listForMember: () => Promise.resolve([]),
      getForMember: () => Promise.resolve(null),
    },
    subscriptions: {
      listForMember: () => Promise.resolve([]),
      apply: () => Promise.resolve(DISABLED),
    },
    claims: {
      submitClaim: () => Promise.resolve(DISABLED),
      listForMember: () => Promise.resolve([]),
    },
    storeCredit: {
      forMember: (memberId) => Promise.resolve({ owner: memberId, balanceCents: 0, entries: [] }),
    },
    partners: partnersFailClosed(),
    capabilities: {
      memberVisible: () => ({
        product_commerce: { enabled: false },
        quantum_commerce: { enabled: false },
      }),
    },
    adminQueues: {
      commerce: () => Promise.resolve({ provisioned: false, items: [] }),
    },
    now,
  };
}

// ---------------------------------------------------------------------------
// STATE 2: flag on, database not provisioned. Precise refusals, no side effects.
// ---------------------------------------------------------------------------

function unprovisionedDependencies(
  catalogService: CatalogService,
  now: () => Date,
): CommerceDependencies {
  // Storage-dependent writes refuse as a capability that is not ready, which
  // is exactly what capability_disabled means in this lane's vocabulary
  // (orders.ts uses it for the same distinction). It is deliberately NOT
  // commerce_disabled: the flag is on, the capability is what is missing.
  const storageDenial = {
    ok: false as const,
    code: "capability_disabled" as const,
    message: "Commerce storage is not provisioned. Nothing was changed.",
  };
  // Checkout is the payment path, so its leading refusal is payment_disabled,
  // with the storage refusal carried alongside for the operator.
  const checkoutDenial = {
    ok: false as const,
    code: "payment_disabled" as const,
    codes: ["payment_disabled", "capability_disabled"] as CommerceDenialCode[],
    message: "Checkout is not available: the payment and storage capabilities are not provisioned.",
  };
  return {
    catalog: catalogDependency(catalogService),
    guides: guidesDependency(),
    cart: {
      getCart: (memberId) => Promise.resolve({ owner: memberId, lines: [], commerceEnabled: false }),
      addLine: () => Promise.resolve(storageDenial),
      updateLine: () => Promise.resolve(storageDenial),
      removeLine: () => Promise.resolve(storageDenial),
    },
    checkout: {
      submit: async () => checkoutDenial,
    },
    orders: {
      listForMember: () => Promise.resolve([]),
      getForMember: () => Promise.resolve(null),
    },
    subscriptions: {
      listForMember: () => Promise.resolve([]),
      apply: () => Promise.resolve(storageDenial),
    },
    claims: {
      submitClaim: () => Promise.resolve({ ok: false as const, codes: ["capability_disabled"] as CommerceDenialCode[] }),
      listForMember: () => Promise.resolve([]),
    },
    storeCredit: {
      forMember: (memberId) => Promise.resolve({ owner: memberId, balanceCents: 0, entries: [] }),
    },
    partners: partnersFailClosed(),
    capabilities: {
      // A flag without a backing capability is not commerce. Members are told
      // the truth: nothing here is operable.
      memberVisible: () => ({
        product_commerce: { enabled: false },
        quantum_commerce: { enabled: false },
      }),
    },
    adminQueues: {
      commerce: () => Promise.resolve({ provisioned: false, items: [] }),
    },
    now,
  };
}

// ---------------------------------------------------------------------------
// STATE 3 adapters (thin, documented; the services and stores are owned
// elsewhere and are not modified).
// ---------------------------------------------------------------------------

/** Mirrors the ledger's own expiry rule (store-credit-store spendableCentsOf). */
function ledgerRecordExpired(record: StoreCreditLedgerRecord, asOf: Date): boolean {
  if (record.expiresAt === null) return false;
  const ms = Date.parse(record.expiresAt);
  return Number.isFinite(ms) && ms <= asOf.getTime();
}

/**
 * Projects a settled checkout into the durable OrderRecord the order service
 * reads, so a placed order appears in the member's order history and in the
 * admin large-order queue. Adapter only: every value is carried, none invented.
 */
function checkoutOrderToRecord(order: CheckoutOrder, asOf: Date): OrderRecord {
  return {
    orderId: order.orderId,
    memberId: order.memberId,
    state: order.state,
    lines: order.lines.map((line) => ({
      sku: line.sku,
      displayName: line.displayName,
      quantity: line.quantity,
      // A settled order's lines all carry totals: checkout denies any
      // null-total line before an order can exist. The fallback is a negative
      // sentinel so a future defect fails loudly at the database CHECK rather
      // than persisting a fake price of zero.
      lineTotalCents: line.lineTotalCents ?? -1,
    })),
    totals: {
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      storeCreditAppliedCents: order.storeCreditAppliedCents,
      totalCents: order.totalCents,
    },
    providerReference: order.paymentReference,
    ...(order.paymentReference !== null ? { authorizedAmountCents: order.totalCents } : {}),
    lastIdempotencyKey: order.idempotencyKey,
    reviewTriggers: [...order.reviewTriggers],
    createdAt: order.placedAt,
    updatedAt: asOf.toISOString(),
    ...(order.captured ? { capturedAmountCents: order.totalCents } : {}),
    shipments: order.shipmentGroups.map((group) => ({
      owner: group.owner,
      status: "pending",
      trackingNumber: null,
      carrier: null,
    })),
  };
}

/**
 * The member-safe checkout confirmation, by EXPLICIT construction. The stored
 * CheckoutOrder carries the payment reference, review triggers, and the
 * idempotency key, which are operator data; the routes layer spreads whatever
 * it is handed, so the projection happens here and nothing else can leak.
 */
function toMemberOrderConfirmation(order: CheckoutOrder): {
  orderId: string;
  state: string;
  placedAt: string;
  totalCents: number;
  shipments: Array<{ owner: "mitch" | "xenios"; status: string; trackingNumber: null; carrier: null }>;
} {
  return {
    orderId: order.orderId,
    state: order.state,
    placedAt: order.placedAt,
    totalCents: order.totalCents,
    shipments: order.shipmentGroups.map((group) => ({
      owner: group.owner,
      status: "pending",
      trackingNumber: null,
      carrier: null,
    })),
  };
}

// ---------------------------------------------------------------------------
// STATE 3: flag on, database configured. The real composition.
// ---------------------------------------------------------------------------

function liveDependencies(
  now: () => Date,
  env: NodeJS.ProcessEnv,
  wiring: CommerceWiring,
  products: CatalogProduct[],
  catalogService: CatalogService,
  quantumEnabled: boolean,
): CommerceDependencies {
  const serviceableStates = serviceableStatesFrom(env);

  // The activation chokepoint, FIRST: no store or provider may exist over a
  // configuration that carries a synthetic fixture marker while this process
  // is production-like. The provider resolvers repeat this check over their
  // own secrets; this call covers the composition-level configuration.
  assertNoSyntheticDataInProduction(
    {
      supabase: { url: env.SUPABASE_URL ?? "" },
      payment: { provider: env.PAYMENTS_PROVIDER ?? env.PAYMENT_PROVIDER ?? "disabled" },
      shipping: {
        provider: env.SHIPPING_PROVIDER ?? "configured",
        liveShippingEnabled: env.RESEARCH_LIVE_SHIPPING_ENABLED ?? "false",
      },
      checkout: {
        serviceableStates: serviceableStates.join(","),
        requiredAgreementKeys: CHECKOUT_REQUIRED_AGREEMENT_KEYS.join(","),
      },
    },
    env,
  );

  const cartStore = wiring.resolveCartStore();
  const orderRepository = wiring.resolveOrderRepository();
  const claimRepository = wiring.resolveClaimRepository();
  const claimOrderRepository = wiring.resolveClaimOrderRepository();
  const lotStore = wiring.resolveInventoryLotStore();
  const creditLedger = wiring.resolveStoreCreditLedgerStore();
  const subscriptionRepository = wiring.resolveSubscriptionRepository();
  const adminQueuesStore = wiring.resolveAdminQueuesStore();
  const payment = wiring.resolvePaymentProvider(env);
  const shipping = wiring.resolveShippingProvider(env);

  const catalogBySku = new Map<string, CatalogProduct>(products.map((p) => [p.sku, p]));

  /**
   * A per-request cart composition. The cart service evaluates against a
   * snapshot of lots and store credit, so both are loaded fresh for the SKUs
   * involved (the stored cart's lines, plus the line being added) and the
   * member's unexpired ledger rows. The repository is the durable store, so
   * every mutation persists through the same seam it loaded from.
   */
  async function cartServiceFor(memberId: string, asOf: Date, extraSku?: string): Promise<CartService> {
    const stored = await cartStore.load(memberId);
    const skus = new Set<string>((stored?.lines ?? []).map((line) => line.sku));
    if (extraSku) skus.add(extraSku);
    const lotLists = await Promise.all(Array.from(skus).map((sku) => lotStore.listBySku(sku)));
    const lots: InventoryLot[] = lotLists.flat();
    const ledgerRecords = await creditLedger.listForMember(memberId);
    const storeCredit = ledgerRecords.filter((record) => !ledgerRecordExpired(record, asOf));
    return createCartService({
      repository: cartStore,
      catalog: catalogBySku,
      lots,
      storeCredit,
      commerceEnabled: true,
      quantumCommerceEnabled: quantumEnabled,
      requiredAgreementKeys: [...CHECKOUT_REQUIRED_AGREEMENT_KEYS],
    });
  }

  // One checkout service per process, exactly per createCheckoutService's
  // existing dependency shape. Its request idempotency is the service's own
  // in-process guarantee; the durable IdempotencyStore cannot be injected
  // without changing checkout.ts (owned elsewhere), which is reported rather
  // than forced. Store credit spends are recorded on the ledger the moment a
  // reduced-amount charge exists, so the same credit cannot fund two orders.
  const checkoutService: CheckoutService = createCheckoutService({
    cart: {
      revalidate: async (memberId, asOf) => (await cartServiceFor(memberId, asOf)).revalidate(memberId, asOf),
    },
    payment,
    shipping,
    commerceEnabled: true,
    serviceableStates,
    // The cart's requiredAgreements list is the single source at checkout; the
    // checkout service unions this with the cart's, so an empty list here
    // means "no keys beyond what the cart already requires", never "none".
    acceptedAgreementKeys: [],
    storeCredit: {
      recordSpend: async (memberId, amountCents, orderId, asOf) => {
        await creditLedger.spend(memberId, amountCents, orderId, asOf);
      },
    },
  });

  const orderService = createOrderService({
    repository: orderRepository,
    payment,
    commerceEnabled: true,
  });

  const refundService = createRefundService({
    claims: claimRepository,
    orders: claimOrderRepository,
    payment,
    commerceEnabled: true,
  });

  const subscriptionService = createSubscriptionService({
    repository: subscriptionRepository,
    catalog: catalogBySku,
    // The member-action surface (listForMember, apply) never consults lots.
    // evaluateRenewal does, and over an empty list it refuses with
    // insufficient_stock, which fails CLOSED: the renewal scheduler is the
    // component that composes evaluateRenewal with freshly loaded lots.
    lots: [],
    commerceEnabled: true,
    quantumCommerceEnabled: quantumEnabled,
    isMembershipActive: wiring.isMembershipActive,
    hasEffectiveAgreement: wiring.hasEffectiveAgreement,
    requiredAgreementKeys: [...SUBSCRIPTION_REQUIRED_AGREEMENT_KEYS],
    payment,
  });

  return {
    catalog: catalogDependency(catalogService),
    guides: guidesDependency(),
    cart: {
      getCart: async (memberId, asOf) => (await cartServiceFor(memberId, asOf)).getCart(memberId, asOf),
      addLine: async (memberId, req, asOf) =>
        (await cartServiceFor(memberId, asOf, req.sku)).addLine(memberId, req, asOf),
      updateLine: async (memberId, sku, quantity, asOf) =>
        (await cartServiceFor(memberId, asOf)).updateLine(memberId, sku, quantity, asOf),
      // The service returns the bare CartDto here; the routes relay expects a
      // discriminated result, so the success envelope is added in this file.
      removeLine: async (memberId, sku, asOf) => ({
        ok: true as const,
        cart: await (await cartServiceFor(memberId, asOf)).removeLine(memberId, sku, asOf),
      }),
    },
    checkout: {
      submit: async (memberId, req, asOf) => {
        const outcome = await checkoutService.submit(memberId, req, asOf);
        if (!outcome.ok) {
          // Nothing was created, charged, or reserved on a denial (the
          // service guarantees it), so relaying the precise code set is safe.
          const codes: CommerceDenialCode[] =
            outcome.denials.length > 0 ? outcome.denials : ["forbidden"];
          return { ok: false as const, code: codes[0], codes };
        }
        // First settlement only: a replayed idempotency key reports the
        // original order and must not overwrite a repository row that an
        // admin or provider may have advanced since.
        if (!outcome.idempotent) {
          await orderRepository.save(checkoutOrderToRecord(outcome.order, asOf));
        }
        return { ok: true as const, order: toMemberOrderConfirmation(outcome.order) };
      },
    },
    orders: {
      listForMember: (memberId) => orderService.listForMember(memberId),
      getForMember: (memberId, orderId) => orderService.getForMember(memberId, orderId),
    },
    subscriptions: {
      listForMember: (memberId) => subscriptionService.listForMember(memberId),
      apply: (memberId, subscriptionId, req, asOf) =>
        subscriptionService.apply(memberId, subscriptionId, req, asOf),
    },
    claims: {
      submitClaim: (memberId, req, asOf) => refundService.submitClaim(memberId, req, asOf),
      listForMember: (memberId) => refundService.listForMember(memberId),
    },
    storeCredit: {
      // The wire DTO (spendableCents, pendingCents, entries) plus the legacy
      // stub keys (owner, balanceCents) so both consumers keep working.
      forMember: async (memberId) => {
        const records = await creditLedger.listForMember(memberId);
        const dto = storeCreditDtoOf(records, now());
        return { owner: memberId, balanceCents: dto.spendableCents, ...dto };
      },
    },
    partners: partnersFailClosed(),
    capabilities: {
      memberVisible: () => ({
        product_commerce: { enabled: true },
        quantum_commerce: { enabled: quantumEnabled },
      }),
    },
    adminQueues: {
      commerce: () => adminQueuesStore.commerce(),
    },
    now,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Builds the commerce dependencies for the running server.
 *
 * Backward compatible: index.ts calls it bare and existing tests pass only a
 * clock. `env` defaults to process.env and exists so the three states are
 * provable under test without mutating process state; `wiring` defaults to the
 * real resolvers and exists so state 3 is provable over injected stores. In
 * production both defaults apply, so the default resolvers and this function
 * read the same environment.
 */
export function buildCommerceDependencies(
  now: () => Date = () => new Date(),
  env: NodeJS.ProcessEnv = process.env,
  wiring?: Partial<CommerceWiring>,
): CommerceDependencies {
  const commerceEnabled = env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED === "true";
  const quantumEnabled = commerceEnabled && env.RESEARCH_QUANTUM_COMMERCE_ENABLED === "true";
  const dbConfigured = databaseConfigured(env);
  // Commerce is OPERABLE only when the flag is on AND the database exists.
  // The catalog's purchasable computation runs off operability, so a flag
  // without a backing capability can never present goods as purchasable.
  const operable = commerceEnabled && dbConfigured;

  const resolved: CommerceWiring = { ...defaultWiring(), ...wiring };

  // Real catalog, provenance-gated. Reviewed date is the catalog review date;
  // it labels the adapted records, it is not a live inventory timestamp.
  const products = resolved.catalogProducts ?? adaptLegacyCatalog(legacyProducts, "2026-07-20").products;
  const catalogService = createCatalogService({
    products,
    commerceEnabled: operable,
    quantumCommerceEnabled: operable && quantumEnabled,
  });

  if (!commerceEnabled) return disabledDependencies(catalogService, now);
  if (!dbConfigured) return unprovisionedDependencies(catalogService, now);
  return liveDependencies(now, env, resolved, products, catalogService, quantumEnabled);
}

import { randomUUID } from "node:crypto";
import type {
  CommerceDependencies,
  CreateSubscriptionWireInput,
  PartnerApplyWireInput,
  PartnerReviewWireDecision,
  PartnerSelfSource,
} from "./routes";
import type { CatalogProduct } from "@shared/research/catalog";
import type {
  CommerceDenialCode,
  PartnerDashboardDto,
  PartnerLinkDto,
  ShippingQuoteRequest,
} from "@shared/research/commerce-api";
import type { InventoryLot } from "../inventory/lots";
import { products as legacyProducts } from "../products-data";
import { adaptLegacyCatalog } from "../catalog/legacy-adapter";
import { createCatalogService, type CatalogService } from "../catalog/catalog-service";
import { createCartService, type CartService } from "./cart";
import {
  createCheckoutService,
  createInventoryReservationSeam,
  DEFAULT_PACKAGE_WEIGHT_GRAMS,
  type CheckoutOrder,
  type CheckoutService,
} from "./checkout";
import {
  createOrderService,
  type OrderRecord,
  type OrderRepository,
  type OrderResult,
} from "./orders";
import {
  createRefundService,
  type ClaimOrderRepository,
  type ClaimRepository,
} from "./refunds";
import { createSubscriptionService, type SubscriptionRepository } from "./subscriptions";
import type { SubscriptionFrequencyDays } from "@shared/research/commerce";
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
import {
  resolveReservationStore,
  type ReservationRepository,
} from "./persistence/reservations-store";
import {
  createWebhookHandler,
  createInMemoryWebhookEventStore,
  type WebhookEventStore,
  type WebhookOrder,
  type WebhookOrderStore,
} from "./webhooks";
import { createSupabaseWebhookReplayGuard } from "./persistence/webhooks-store";
import {
  resolvePartnerLinkStore,
  resolvePartnerMemberStore,
  MemberAlreadyPartner,
  type AsyncPartnerLinkStore,
  type AsyncPartnerMemberStore,
} from "./persistence/partners-store";
import { resolveCommissionLedgerStore } from "./persistence/commissions-store";
import type { CommissionLedgerRepository } from "../partners/commissions";
import { createLedgerPartnerStatsSource } from "../partners/member-linkage";
import type { ClaimRecord, RefundService } from "./refunds";
import { resolvePaymentProvider, type PaymentProvider } from "../providers/payment";
import { resolveShippingProvider, type ShippingProvider } from "../providers/shipping";
import {
  resolveFulfillmentProvider,
  type FulfillmentProvider,
} from "../providers/fulfillment";
import { hasAcceptedCurrent } from "../agreements";
import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";

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
  /**
   * The durable lot-reservation store behind checkout's inventory hold
   * (DB-backed when the database is configured). State 3 composes
   * createInventoryReservationSeam over this store and the resolved lot store,
   * so a checkout reserves real FEFO stock before any money moves.
   */
  resolveReservationStore(): ReservationRepository;
  /** The durable webhook replay guard (DB-backed when the database is configured). */
  resolveWebhookEventStore(): WebhookEventStore;
  resolvePartnerMemberStore(): AsyncPartnerMemberStore;
  resolvePartnerLinkStore(): AsyncPartnerLinkStore;
  resolveCommissionLedgerStore(): CommissionLedgerRepository;
  resolvePaymentProvider(env: NodeJS.ProcessEnv): PaymentProvider;
  resolveShippingProvider(env: NodeJS.ProcessEnv): ShippingProvider;
  /**
   * The fulfillment partner adapter for the inbound status webhook. The env
   * default resolves DisabledMitchProvider unless RESEARCH_MITCH_FULFILLMENT_ENABLED
   * is "true", so an unconfigured deployment refuses fulfillment events with a
   * precise capability denial rather than guessing.
   */
  resolveFulfillmentProvider(env: NodeJS.ProcessEnv): FulfillmentProvider;
  /** Renewal-gate seams (subscriptions.evaluateRenewal only; not on the HTTP path). */
  isMembershipActive(memberId: string): Promise<boolean>;
  hasEffectiveAgreement(memberId: string, agreementKey: string): Promise<boolean>;
}

/**
 * The durable webhook replay guard behind the (now async-capable) event-store
 * interface. Whether an event was seen is answered by the DATABASE via the
 * UNIQUE (provider_name, event_id) constraint; without a configured database the
 * in-memory reference stands in (and state 3 always has the database).
 */
function resolveDurableWebhookEventStore(): WebhookEventStore {
  if (!supabaseConfigured()) return createInMemoryWebhookEventStore();
  const guard = createSupabaseWebhookReplayGuard();
  return {
    seen: (providerName, eventId) => guard.seen(providerName, eventId),
    record: (providerName, eventId, at, eventType) =>
      guard.record(providerName, eventId, eventType ?? "unrecognized", at),
  };
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
    resolveReservationStore,
    resolveWebhookEventStore: resolveDurableWebhookEventStore,
    resolvePartnerMemberStore,
    resolvePartnerLinkStore,
    resolveCommissionLedgerStore,
    resolvePaymentProvider,
    resolveShippingProvider,
    resolveFulfillmentProvider,
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

// The partner surface fails closed in states 1 and 2 (reads empty-safe, writes
// refused with the state's denial). The REAL member-linked composition exists
// only in state 3, where the durable partner-member store, the link store, and
// the commission ledger are resolved.
function partnersFailClosed(denial: { ok: false; code: CommerceDenialCode }): CommerceDependencies["partners"] {
  return {
    findByMemberId: () => Promise.resolve(null),
    dashboardFor: (partner) => Promise.resolve({ partnerId: partner.partnerId, provisioned: false }),
    listLinks: () => Promise.resolve([]),
    applyForMember: () => Promise.resolve(denial),
  };
}

/** The admin partner review surface in states 1 and 2: refused, nothing touched. */
function partnerAdminFailClosed(denial: { ok: false; code: CommerceDenialCode }): CommerceDependencies["partnerAdmin"] {
  return {
    review: () => Promise.resolve(denial),
  };
}

/**
 * The webhook surface while the capability is not ready. The event is refused as
 * capability_disabled (a 503 at the route, so the provider retries once the
 * capability exists) and NOTHING is constructed: no provider, no store, no
 * verification attempt, so states 1 and 2 stay structurally side-effect free.
 */
function webhooksFailClosed(): CommerceDependencies["webhooks"] {
  const refused = () =>
    Promise.resolve({ ok: false as const, code: "capability_disabled" as const });
  return {
    handlePayment: refused,
    handleFulfillment: refused,
  };
}

/** The admin order lifecycle in states 1 and 2: refused, nothing touched. */
function ordersAdminFailClosed(denial: {
  ok: false;
  code: CommerceDenialCode;
}): CommerceDependencies["ordersAdmin"] {
  return {
    approve: () => Promise.resolve(denial),
    capture: () => Promise.resolve(denial),
    cancel: () => Promise.resolve(denial),
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
      create: () => Promise.resolve(DISABLED),
    },
    claims: {
      submitClaim: () => Promise.resolve(DISABLED),
      listForMember: () => Promise.resolve([]),
      getForMember: () => Promise.resolve(null),
    },
    claimsAdmin: {
      listOpen: () => Promise.resolve([]),
      review: () => Promise.resolve(DISABLED),
      refund: () => Promise.resolve(DISABLED),
      replacement: () => Promise.resolve(DISABLED),
    },
    storeCredit: {
      forMember: (memberId) => Promise.resolve({ owner: memberId, balanceCents: 0, entries: [] }),
    },
    partners: partnersFailClosed(DISABLED),
    partnerAdmin: partnerAdminFailClosed(DISABLED),
    ordersAdmin: ordersAdminFailClosed(DISABLED),
    webhooks: webhooksFailClosed(),
    shippingQuotes: {
      quoteFor: () => Promise.resolve(DISABLED),
    },
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
      create: () => Promise.resolve(storageDenial),
    },
    claims: {
      submitClaim: () => Promise.resolve({ ok: false as const, codes: ["capability_disabled"] as CommerceDenialCode[] }),
      listForMember: () => Promise.resolve([]),
      getForMember: () => Promise.resolve(null),
    },
    claimsAdmin: {
      listOpen: () => Promise.resolve([]),
      review: () => Promise.resolve(storageDenial),
      refund: () => Promise.resolve(storageDenial),
      replacement: () => Promise.resolve(storageDenial),
    },
    storeCredit: {
      forMember: (memberId) => Promise.resolve({ owner: memberId, balanceCents: 0, entries: [] }),
    },
    partners: partnersFailClosed(storageDenial),
    partnerAdmin: partnerAdminFailClosed(storageDenial),
    ordersAdmin: ordersAdminFailClosed(storageDenial),
    webhooks: webhooksFailClosed(),
    shippingQuotes: {
      quoteFor: () => Promise.resolve(storageDenial),
    },
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

/** How long a member-facing shipping quote stands before it must be re-requested. */
export const SHIPPING_QUOTE_TTL_MINUTES = 15;

/**
 * Ambient versus temperature-controlled, decided from the product profiles of
 * the cart and FAIL-SAFE in the cold direction: an unknown product, an
 * unconfirmed storage fact, or a storage instruction that names refrigeration
 * or freezing means the order is treated as cold chain, so an ambient promise
 * is never made about goods whose storage is not confirmed ambient.
 */
export function cartTemperatureProfile(
  products: ReadonlyArray<CatalogProduct | undefined>,
): "ambient" | "cold_chain" {
  for (const product of products) {
    if (!product) return "cold_chain";
    const storage = product.facts.storage;
    if (storage.confirmation !== "confirmed") return "cold_chain";
    if (/refriger|freez|frozen|cold[\s-]?chain|2\s*(?:-|–|to)\s*8/i.test(String(storage.value))) {
      return "cold_chain";
    }
  }
  return "ambient";
}

/**
 * The webhook's narrow order projection over the SAME repository checkout
 * writes and the member order history reads, so a webhook-advanced state is
 * immediately visible everywhere. Save is read-modify-write of only the fields
 * a webhook owns: state, the payment reference (forward only), and the
 * transition idempotency key. A capture amount is never written here; that
 * column belongs to the payment path.
 */
export function webhookOrderStoreOverOrders(repository: OrderRepository): WebhookOrderStore {
  const CAPTURED_STATES = new Set([
    "payment_captured",
    "processing",
    "partially_fulfilled",
    "fulfilled",
    "delivered",
    "refunded",
    "replaced",
  ]);
  return {
    async get(orderId): Promise<WebhookOrder | undefined> {
      const record = await repository.get(orderId);
      if (!record) return undefined;
      const order: WebhookOrder = {
        orderId: record.orderId,
        state: record.state,
        paymentReference: record.providerReference,
        captured: record.capturedAmountCents !== undefined || CAPTURED_STATES.has(record.state),
      };
      if (record.lastIdempotencyKey !== null) order.lastWebhookEventId = record.lastIdempotencyKey;
      return order;
    },
    async save(order): Promise<void> {
      const record = await repository.get(order.orderId);
      if (!record) throw new Error(`webhook order save failed: no order ${order.orderId}`);
      record.state = order.state;
      record.providerReference = order.paymentReference;
      record.lastIdempotencyKey = order.lastWebhookEventId ?? record.lastIdempotencyKey;
      // A verified fulfillment event's shipment status and tracking land on the
      // order's shipment records, so the member sees the carrier's tracking
      // number the moment the partner reports it. The status always advances;
      // tracking is written only when the event actually carried one, so a
      // later status-only event never erases a known tracking number.
      if (order.shipmentUpdate) {
        for (const shipment of record.shipments ?? []) {
          shipment.status = order.shipmentUpdate.status;
          if (order.shipmentUpdate.trackingNumber !== null) {
            shipment.trackingNumber = order.shipmentUpdate.trackingNumber;
          }
          if (order.shipmentUpdate.carrier !== null) {
            shipment.carrier = order.shipmentUpdate.carrier;
          }
        }
      }
      await repository.save(record);
    },
  };
}

/**
 * The admin claim view, by explicit construction. Wider than the member DTO
 * (an admin reviews evidence and notes) but still a named projection, so a
 * field added to ClaimRecord later cannot reach the wire by default.
 */
export function toAdminClaimView(record: ClaimRecord): {
  claimId: string;
  orderId: string;
  memberId: string;
  sku: string;
  lotId: string | null;
  reason: ClaimRecord["reason"];
  state: ClaimRecord["state"];
  resolution: ClaimRecord["resolution"];
  evidenceRefs: string[];
  submittedAt: string;
  reviewedBy: string | null;
  notes: string;
} {
  return {
    claimId: record.claimId,
    orderId: record.orderId,
    memberId: record.memberId,
    sku: record.sku,
    lotId: record.lotId,
    reason: record.reason,
    state: record.state,
    resolution: record.resolution,
    evidenceRefs: record.evidenceRefs.slice(),
    submittedAt: record.submittedAt,
    reviewedBy: record.reviewedBy,
    notes: record.notes,
  };
}

/**
 * The admin order view, by explicit construction (the toAdminClaimView
 * discipline). Wider than the member DTO on purpose: an admin reviewing a held
 * order needs the provider reference, the review triggers, and the money
 * columns. Still a named projection, so a field added to OrderRecord later
 * cannot reach the wire by default.
 */
export function toAdminOrderView(record: OrderRecord): {
  orderId: string;
  memberId: string;
  state: string;
  lines: Array<{ sku: string; displayName: string; quantity: number; lineTotalCents: number }>;
  totals: OrderRecord["totals"];
  providerReference: string | null;
  authorizedAmountCents: number | null;
  capturedAmountCents: number | null;
  reviewTriggers: string[];
  approvedBy: string | null;
  approvedAt: string | null;
  cancellationReason: string | null;
  authorizationReleaseFailed: boolean;
  shipments: Array<{ owner: "mitch" | "xenios"; status: string; trackingNumber: string | null; carrier: string | null }>;
  createdAt: string;
  updatedAt: string;
} {
  return {
    orderId: record.orderId,
    memberId: record.memberId,
    state: record.state,
    lines: record.lines.map((line) => ({
      sku: line.sku,
      displayName: line.displayName,
      quantity: line.quantity,
      lineTotalCents: line.lineTotalCents,
    })),
    totals: { ...record.totals },
    providerReference: record.providerReference,
    authorizedAmountCents: record.authorizedAmountCents ?? null,
    capturedAmountCents: record.capturedAmountCents ?? null,
    reviewTriggers: record.reviewTriggers.slice(),
    approvedBy: record.approvedBy ?? null,
    approvedAt: record.approvedAt ?? null,
    cancellationReason: record.cancellationReason ?? null,
    authorizationReleaseFailed: record.authorizationReleaseFailed ?? false,
    shipments: (record.shipments ?? []).map((s) => ({
      owner: s.owner,
      status: s.status,
      trackingNumber: s.trackingNumber,
      carrier: s.carrier,
    })),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Maps the order service's discriminated result onto the wire relay's shape:
 * a success carries the explicit admin view, a denial keeps its machine codes
 * (leading code first) so the admin UI can route on them.
 */
function adminOrderResult(result: OrderResult):
  | { ok: true; order: ReturnType<typeof toAdminOrderView> }
  | { ok: false; code: CommerceDenialCode; codes: CommerceDenialCode[]; message: string } {
  if (!result.ok) {
    return {
      ok: false as const,
      code: result.denials[0] ?? "forbidden",
      codes: result.denials,
      message: result.message,
    };
  }
  return { ok: true as const, order: toAdminOrderView(result.order) };
}

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

/**
 * The same member-safe confirmation, built from the DURABLE OrderRecord for a
 * replayed idempotency key that outlived the process which settled it. Explicit
 * construction again: the record's provider reference, review triggers, and
 * idempotency key have no field to travel in. The record's CURRENT state and
 * shipments are reported (an admin or provider may have advanced them), which
 * is the truth a replaying member should see.
 */
function orderRecordToMemberConfirmation(record: OrderRecord): {
  orderId: string;
  state: string;
  placedAt: string;
  totalCents: number;
  shipments: Array<{ owner: "mitch" | "xenios"; status: string; trackingNumber: string | null; carrier: string | null }>;
} {
  return {
    orderId: record.orderId,
    state: record.state,
    placedAt: record.createdAt,
    totalCents: record.totals.totalCents,
    shipments: (record.shipments ?? []).map((shipment) => ({
      owner: shipment.owner,
      status: shipment.status,
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.carrier,
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
      partner: {
        linkBaseUrl: env.RESEARCH_PARTNER_LINK_BASE_URL ?? "https://xeniostechnology.com",
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
  const reservationStore = wiring.resolveReservationStore();
  const webhookEventStore = wiring.resolveWebhookEventStore();
  const partnerMemberStore = wiring.resolvePartnerMemberStore();
  const partnerLinkStore = wiring.resolvePartnerLinkStore();
  const commissionLedger = wiring.resolveCommissionLedgerStore();
  const payment = wiring.resolvePaymentProvider(env);
  const shipping = wiring.resolveShippingProvider(env);
  const fulfillment = wiring.resolveFulfillmentProvider(env);

  /**
   * The inventory hold around a checkout: the CANONICAL seam checkout.ts
   * declares, over the SAME lot store the cart evaluates and the durable
   * reservation store. A clean submit reserves real FEFO stock (the decrement
   * IS the hold) before any money moves, releases it when the payment is
   * refused, and finalizes it on immediate capture. No reservationAudit
   * recorder is wired: the durable reservation rows themselves (status plus
   * released/finalized timestamps) are the evidence trail until an audit
   * destination exists, which is reported rather than invented.
   */
  const inventoryReservations = createInventoryReservationSeam({
    lots: lotStore,
    reservations: reservationStore,
    now,
  });

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
  // in-process guarantee, and the COMPOSITION extends it across instances: the
  // submit adapter below consults the durable order projection
  // (findByIdempotencyKey) before invoking the service, so a replayed key
  // whose order already settled is answered from the durable record on a
  // fresh process too. Store credit spends are recorded on the ledger the
  // moment a reduced-amount charge exists, so the same credit cannot fund two
  // orders.
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
    inventory: inventoryReservations,
  });

  const orderService = createOrderService({
    repository: orderRepository,
    payment,
    commerceEnabled: true,
  });

  const refundService: RefundService = createRefundService({
    claims: claimRepository,
    orders: claimOrderRepository,
    payment,
    commerceEnabled: true,
  });

  // The provider webhook handler, over the SAME order repository checkout writes
  // (through the narrow projection) and the durable replay guard, so a verified
  // event advances the order every surface reads and a replayed delivery is
  // absorbed by the database, not by process memory. The fulfillment provider
  // rides the same handler, so a partner status webhook is signature-gated and
  // replay-guarded identically to a payment event.
  const webhookHandler = createWebhookHandler({
    store: webhookEventStore,
    payment,
    fulfillment,
    orders: webhookOrderStoreOverOrders(orderRepository),
    commerceEnabled: true,
  });

  // ----- the partner portal (member-linked, aggregates only) -----------------

  const partnerStats = createLedgerPartnerStatsSource({ ledger: commissionLedger });
  const linkBaseUrl = (env.RESEARCH_PARTNER_LINK_BASE_URL ?? "https://xeniostechnology.com").replace(/\/+$/, "");

  function partnerLinkDto(link: { code: string; channel: PartnerLinkDto["channel"]; campaign: string | null }): PartnerLinkDto {
    return {
      code: link.code,
      url: `${linkBaseUrl}/r/${link.code}`,
      channel: link.channel,
      campaign: link.campaign,
      qrSvgPath: null,
    };
  }

  /**
   * The durable linkage row as the route layer's self source. Training and
   * agreement completions are honestly EMPTY here: the durable partner store
   * carries identity, role, and lifecycle state only, and this surface reports
   * what is stored rather than inventing progress.
   */
  function linkToSelfSource(link: {
    partnerId: string;
    role: PartnerSelfSource["role"];
    state: PartnerSelfSource["state"];
    certifiedAt: string | null;
    activatedAt: string | null;
  }): PartnerSelfSource {
    return {
      partnerId: link.partnerId,
      role: link.role,
      state: link.state,
      certifiedAt: link.certifiedAt,
      activatedAt: link.activatedAt,
      training: [],
      agreements: [],
    };
  }

  const partners: CommerceDependencies["partners"] = {
    async findByMemberId(memberId) {
      const link = await partnerMemberStore.findByMemberId(memberId);
      return link ? linkToSelfSource(link) : null;
    },

    async applyForMember(memberId: string, input: PartnerApplyWireInput, asOf: Date) {
      try {
        const link = await partnerMemberStore.createPartnerForMember({
          partnerId: `prt_${randomUUID()}`,
          memberId,
          role: input.role,
          legalName: input.legalName,
          contactEmail: input.contactEmail,
          appliedAt: asOf.toISOString(),
        });
        // The response is the same explicit self shape every partner read uses;
        // the legal name and contact email are write-only through this store.
        return { ok: true as const, partner: linkToSelfSource(link) };
      } catch (error) {
        if (error instanceof MemberAlreadyPartner) {
          // One member, one partner. The store's UNIQUE constraint is the
          // authority; this is its typed surface.
          return {
            ok: false as const,
            code: "forbidden" as const,
            message: "This member already owns a partner account.",
          };
        }
        throw error;
      }
    },

    /**
     * Aggregates only, from the append-only commission ledger. The stats source
     * is aggregate-shaped by type and each conversion is rebuilt by explicit
     * construction, so no member identity has a field to travel in.
     */
    async dashboardFor(partner) {
      const stats = await partnerStats.statsFor(partner.partnerId);
      const dashboard: PartnerDashboardDto = {
        partnerId: partner.partnerId,
        role: partner.role,
        state: partner.state,
        leadCount: stats.leadCount,
        conversionCount: stats.conversionCount,
        totalCommissionCents: stats.totalCommissionCents,
        payableCents: stats.payableCents,
        conversions: stats.conversions.map((c) => ({
          attributedAt: c.attributedAt,
          eligibleNetCents: c.eligibleNetCents,
          commissionCents: c.commissionCents,
          state: c.state,
        })),
        // The durable store does not carry training completions yet, so nothing
        // is reported as outstanding rather than everything being guessed at.
        outstandingTraining: [],
      };
      return dashboard;
    },

    async listLinks(partnerId) {
      const links = await partnerLinkStore.listLinks(partnerId);
      return links.map((link) => partnerLinkDto(link));
    },
  };

  // ----- the member shipping quote -------------------------------------------

  async function shippingQuoteFor(memberId: string, req: ShippingQuoteRequest, asOf: Date): Promise<unknown> {
    // The quote is for THIS member's cart: temperature profile and existence
    // both come from what they are actually buying.
    const stored = await cartStore.load(memberId);
    const lines = stored?.lines ?? [];
    if (lines.length === 0) {
      return {
        ok: false as const,
        code: "cart_empty" as const,
        message: "A shipping quote is computed for the cart, and the cart is empty.",
      };
    }

    // Address validation through the shipping provider. A structural rejection
    // is the member's problem (address_invalid); a provider that cannot
    // validate at all is a capability state (shipping_unavailable).
    const validated = await shipping.validateAddress(req.destination);
    if (!validated.ok) {
      if (validated.code === "DISABLED" || validated.code === "MISCONFIGURED") {
        return {
          ok: false as const,
          code: "shipping_unavailable" as const,
          message: "Shipping is not available right now.",
        };
      }
      return { ok: false as const, code: "address_invalid" as const, message: validated.message };
    }

    const profile = cartTemperatureProfile(lines.map((line) => catalogBySku.get(line.sku)));
    const quoted = await shipping.quote({
      destination: validated.value.normalized,
      service: req.service,
      // The same configured package weight checkout quotes with, so the quote a
      // member sees is the quote checkout charges.
      weightGrams: DEFAULT_PACKAGE_WEIGHT_GRAMS,
      temperatureControlled: profile === "cold_chain" || req.service === "temperature_controlled",
    });
    if (!quoted.ok) {
      // Disabled, misconfigured, or refused: every one is a precise refusal to
      // quote, never an invented number. The provider's member-safe message is
      // carried; its failure code is not.
      return {
        ok: false as const,
        code: "shipping_unavailable" as const,
        message: quoted.message,
      };
    }
    return {
      ok: true as const,
      quote: quoted.value,
      expiresAt: new Date(asOf.getTime() + SHIPPING_QUOTE_TTL_MINUTES * 60 * 1000).toISOString(),
    };
  }

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
        // THE CROSS-INSTANCE REPLAY GATE. The service's idempotency map lives
        // in process memory, so after a restart (or on a second instance over
        // the same database) a replayed key would re-run settlement projection
        // and save over a durable record an admin or provider may have
        // advanced since. The durable order projection is therefore consulted
        // FIRST: a key that already projected an order for THIS member answers
        // with that order's current truth, runs no service, touches no
        // provider, and saves nothing. (A key the member reused across two
        // different operations resolves to the order it is already bound to,
        // never to a second charge, which is the safe direction.)
        if (typeof req?.idempotencyKey === "string" && req.idempotencyKey.length > 0) {
          const settled = await orderRepository.findByIdempotencyKey(memberId, req.idempotencyKey);
          if (settled) {
            return { ok: true as const, order: orderRecordToMemberConfirmation(settled) };
          }
        }
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
      // The full gate chain is the service's create: catalog existence,
      // capability, quantity bound, frequency set, per-SKU subscription
      // eligibility. A created subscription is PENDING and never charges out
      // of creation alone.
      create: (memberId, input: CreateSubscriptionWireInput, asOf) =>
        subscriptionService.create(
          memberId,
          {
            sku: input.sku,
            quantity: input.quantity,
            // The wire layer guaranteed a number; the service's isFrequency gate
            // refuses anything outside the published set at runtime.
            frequencyDays: input.frequencyDays as SubscriptionFrequencyDays,
            priceVersion: input.priceVersion,
            paymentProviderReference: input.paymentProviderReference ?? null,
            shippingAddressRef: input.shippingAddressRef ?? null,
          },
          asOf,
        ),
    },
    claims: {
      submitClaim: (memberId, req, asOf) => refundService.submitClaim(memberId, req, asOf),
      listForMember: (memberId) => refundService.listForMember(memberId),
      getForMember: (memberId, claimId) => refundService.getForMember(memberId, claimId),
    },
    claimsAdmin: {
      listOpen: async () => (await refundService.listOpenForAdmin()).map(toAdminClaimView),
      review: (claimId, adminId, decision, asOf, note) =>
        refundService.reviewClaim(claimId, adminId, decision, asOf, note),
      // Provider proof is enforced by the service: the order reaches refunded
      // only on the reference the provider returned, and a replayed key is
      // absorbed without a second refund.
      refund: (claimId, adminId, amountCents, idempotencyKey, asOf) =>
        refundService.resolveWithRefund(claimId, adminId, amountCents, idempotencyKey, asOf),
      replacement: (claimId, adminId, asOf) =>
        refundService.resolveWithReplacement(claimId, adminId, asOf),
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
    partners,
    partnerAdmin: {
      // DELIBERATELY still capability_disabled, and precisely why (reviewed for
      // the lifecycle wave rather than papered over here):
      //   1. The durable member-linkage store (AsyncPartnerMemberStore) is
      //      create + read ONLY by design, so a lifecycle move cannot bypass
      //      the activation gates the partner service owns. Adding an update
      //      path there to make this route answer would gut that guarantee.
      //   2. The partner service that DOES own the gates has no durable
      //      repository: the shipped lifecycle-event table cannot round-trip
      //      the typed PartnerLifecycleEvent (see partners-store.ts), so
      //      resolvePartnerRepository fails safe to an in-memory reference.
      //      Reviewing through it would report a state change that evaporates
      //      on restart and never reaches the durable row every member-facing
      //      partner read resolves, which is worse than refusing.
      // So the admin review refuses precisely rather than pretending a state
      // changed. Registering the surface now means the wire contract and guard
      // are already proven when the durable gate-checked lifecycle path lands.
      review: async (_partnerId: string, _adminId: string, _decision: PartnerReviewWireDecision, _asOf: Date) => ({
        ok: false as const,
        code: "capability_disabled" as const,
        message: "Partner lifecycle review is not provisioned yet. Nothing was changed.",
      }),
    },
    ordersAdmin: {
      // The canonical order service over the SAME wiring repository and payment
      // provider checkout writes through. Approve is Samuel's decision and is
      // attributed to the guard-verified admin; capture then runs as the SYSTEM
      // acting on the provider's capture result (the transition table admits no
      // admin actor for approved -> payment_captured, by design: money moves
      // only on provider proof); cancel is an admin action carrying its reason
      // and releasing an uncaptured authorization through the service.
      approve: async (orderId: string, adminId: string, asOf: Date) =>
        adminOrderResult(await orderService.approve(orderId, adminId, asOf)),
      capture: async (orderId: string, _adminId: string, asOf: Date) =>
        adminOrderResult(await orderService.capture(orderId, "system", asOf)),
      cancel: async (orderId: string, _adminId: string, reason: string, asOf: Date) =>
        adminOrderResult(await orderService.cancel(orderId, "admin", reason, asOf)),
    },
    webhooks: {
      handlePayment: (rawBody, signature, asOf) => webhookHandler.handlePayment(rawBody, signature, asOf),
      handleFulfillment: (rawBody, signature, asOf) =>
        webhookHandler.handleFulfillment(rawBody, signature, asOf),
    },
    shippingQuotes: {
      quoteFor: (memberId, req, asOf) => shippingQuoteFor(memberId, req, asOf),
    },
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

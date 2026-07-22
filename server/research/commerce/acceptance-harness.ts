// Wave 24: the running-server acceptance harness.
//
// Builds a REAL express app through the CANONICAL registration path, exactly as
// server/index.ts does: registerCommerceApi(app, buildCommerceDependencies(now,
// env, wiring), guards), followed by the same error handler and the same JSON
// /api 404 tail. Nothing here re-implements a route or a service; the only
// doubles are the injected seams the production wiring already declares:
//
//   - the commerce flag is TRUE only inside the injected env object
//     (process.env is never mutated),
//   - every store resolves to its in-memory implementation via the wiring table,
//   - payment and shipping resolve to the Test providers (never available in a
//     production process by their own constructor guard),
//   - guards authenticate a fake member from a test header, mirroring how the
//     merged guards attach `researchMember` to the request.
//
// Fixtures are labeled synthetic_test_fixture / TEST_LOT_ so they are
// unmistakably non-production data. That is safe here BECAUSE they enter
// through the wiring table, not through configuration: the production guard
// scans the configuration values, and a synthetic marker in an env value would
// (correctly) refuse to compose.

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { registerCommerceApi, type CommerceGuards } from "./routes";
import { buildCommerceDependencies, CHECKOUT_REQUIRED_AGREEMENT_KEYS } from "./production-deps";
import { createInMemoryCartStore, type AsyncCartStore } from "./persistence/cart-store";
import { createInMemoryOrderStore, type AsyncOrderStore } from "./persistence/orders-store";
import {
  createInMemoryInventoryLotStore,
  type InventoryLotRepository,
} from "./persistence/inventory-store";
import {
  createInMemoryStoreCreditLedgerStore,
  type StoreCreditLedgerRepository,
} from "./persistence/store-credit-store";
import { createInMemorySubscriptionStore } from "./persistence/subscriptions-store";
import {
  createInMemoryAdminQueuesStore,
  type AdminQueuesRepository,
} from "./persistence/admin-queues-store";
import {
  createInMemoryClaimOrderRepository,
  createInMemoryClaimRepository,
  type ClaimOrderRepository,
  type ClaimRepository,
} from "./refunds";
import type { SubscriptionRepository } from "./subscriptions";
import { TestPaymentProvider, type CreateAuthorizationInput } from "../providers/payment";
import { TestShippingProvider } from "../providers/shipping";
import type { CatalogProduct, ProvenancedFact } from "@shared/research/catalog";
import type { CheckoutRequest } from "@shared/research/commerce-api";
import type { InventoryLot } from "../inventory/lots";

// ---------------------------------------------------------------------------
// Clock and identities
// ---------------------------------------------------------------------------

export const NOW = (): Date => new Date("2026-07-22T00:00:00Z");
export const AS_OF = new Date("2026-07-22T00:00:00Z");

export const MEMBER_A = "member-acceptance-a";
export const MEMBER_B = "member-acceptance-b";

/** The header the test guards authenticate from. */
export const MEMBER_HEADER = "x-acceptance-member";
export const ADMIN_HEADER = "x-acceptance-admin";
export const ADMIN_HEADER_VALUE = "yes";

export const ELIGIBLE_SKU = "P950";
export const INELIGIBLE_SKU = "P951";
export const ELIGIBLE_SLUG = "acceptance-eligible";

// ---------------------------------------------------------------------------
// The injected environment. The commerce flag is on and the database reads as
// configured, so buildCommerceDependencies composes STATE 3 (the real
// services), while process.env stays untouched. The values carry no synthetic
// marker because configuration is exactly what the production guard scans.
// ---------------------------------------------------------------------------

export function acceptanceEnv(): NodeJS.ProcessEnv {
  return {
    NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
    SUPABASE_URL: "https://acceptance.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_acceptance_key",
    RESEARCH_SERVICEABLE_STATES: "TX,CA",
  };
}

// ---------------------------------------------------------------------------
// Catalog fixtures, unmistakably synthetic by label
// ---------------------------------------------------------------------------

function confirmed<T>(value: T): ProvenancedFact<T> {
  return {
    value,
    confirmation: "confirmed",
    source: { kind: "supplier_document", reference: "synthetic_test_fixture acceptance doc 1" },
  };
}

/** A fully test-eligible SKU: confirmed facts, approved documentation, in stock. */
export function acceptanceProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    sku: ELIGIBLE_SKU,
    slug: ELIGIBLE_SLUG,
    displayName: "Acceptance Eligible Product",
    lane: "research_material",
    laneDecision: "decided",
    nameAliases: ["synthetic_test_fixture"],
    availability: "in_stock",
    commerceApproval: "approved",
    fulfillmentOwner: "xenios",
    facts: {
      composition: confirmed("compound A"),
      strength: confirmed("10mg"),
      format: confirmed("vial"),
      priceCents: confirmed(5000),
      shelfLife: confirmed("24 months"),
      storage: confirmed("cool dry place"),
      coa: confirmed("synthetic_test_fixture coa acceptance 1"),
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
    ...overrides,
  };
}

/**
 * An ineligible SKU: everything confirmed EXCEPT the written commerce approval,
 * so the one precise per-line refusal is product_not_purchasable.
 */
export function ineligibleProduct(): CatalogProduct {
  return acceptanceProduct({
    sku: INELIGIBLE_SKU,
    slug: "acceptance-ineligible",
    displayName: "Acceptance Ineligible Product",
    commerceApproval: "blocked_pending_written_approval",
    subscriptionEligible: false,
  });
}

// ---------------------------------------------------------------------------
// Inventory fixtures. A released lot is one that has EARNED allocation:
// disposition available, complete documents, confirmed shelf life, unexpired.
// ---------------------------------------------------------------------------

export function releasedLot(overrides: Partial<InventoryLot> = {}): InventoryLot {
  return {
    lotId: "TEST_LOT_ACC_1",
    sku: ELIGIBLE_SKU,
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A payment provider that counts its consequential calls, so the suite can
// assert "no second authorization" and "no provider call past the cap" rather
// than inferring them. Behavior is entirely the canonical TestPaymentProvider.
// ---------------------------------------------------------------------------

export class CountingPaymentProvider extends TestPaymentProvider {
  authorizationCalls = 0;
  refundCalls = 0;

  override async createAuthorization(input: CreateAuthorizationInput) {
    this.authorizationCalls += 1;
    return super.createAuthorization(input);
  }

  override async refund(ref: string, amountCents: number, idempotencyKey: string) {
    this.refundCalls += 1;
    return super.refund(ref, amountCents, idempotencyKey);
  }
}

// ---------------------------------------------------------------------------
// Guards. The merged production guards authenticate a session and attach the
// member row as `researchMember`; these do the same from a test header, which
// is exactly the seam CommerceGuards exists for. Identity never comes from a
// body, so "body-supplied member ids are ignored" is provable end to end.
// ---------------------------------------------------------------------------

function testGuards(): CommerceGuards {
  const authenticate = (req: Request, res: Response, next: () => void): void => {
    const id = req.header(MEMBER_HEADER);
    if (!id) {
      res.status(401).json({ ok: false, code: "membership_inactive" });
      return;
    }
    (req as unknown as { researchMember?: Record<string, unknown> }).researchMember = { id };
    next();
  };
  return {
    requireActiveMember: authenticate,
    requireMember: authenticate,
    requireAdmin: (req: Request, res: Response, next: () => void): void => {
      if (req.header(ADMIN_HEADER) !== ADMIN_HEADER_VALUE) {
        res.status(403).json({ ok: false, code: "forbidden" });
        return;
      }
      next();
    },
  };
}

// ---------------------------------------------------------------------------
// The assembled application context
// ---------------------------------------------------------------------------

export interface AcceptanceContext {
  app: Express;
  payment: CountingPaymentProvider;
  shipping: TestShippingProvider;
  cartStore: AsyncCartStore;
  orderRepository: AsyncOrderStore;
  lotStore: InventoryLotRepository;
  creditLedger: StoreCreditLedgerRepository;
  subscriptionStore: SubscriptionRepository;
  claimRepository: ClaimRepository;
  claimOrderRepository: ClaimOrderRepository;
  adminQueuesStore: AdminQueuesRepository;
  env: NodeJS.ProcessEnv;
}

export interface AcceptanceOptions {
  /** Catalog to serve. Default: the eligible and the ineligible fixture. */
  products?: CatalogProduct[];
  /** Lots seeded into the wiring table's inventory store. Default: one released lot. */
  lots?: InventoryLot[];
}

export async function buildAcceptanceContext(
  options: AcceptanceOptions = {},
): Promise<AcceptanceContext> {
  const cartStore = createInMemoryCartStore();
  const orderRepository = createInMemoryOrderStore();
  const lotStore = createInMemoryInventoryLotStore();
  const creditLedger = createInMemoryStoreCreditLedgerStore();
  const subscriptionStore = createInMemorySubscriptionStore();
  const adminQueuesStore = createInMemoryAdminQueuesStore();
  const claimRepository = createInMemoryClaimRepository();
  const claimOrderRepository = createInMemoryClaimOrderRepository();
  const payment = new CountingPaymentProvider();
  const shipping = new TestShippingProvider();

  for (const lot of options.lots ?? [releasedLot()]) {
    await lotStore.save(lot);
  }

  const env = acceptanceEnv();
  const deps = buildCommerceDependencies(NOW, env, {
    catalogProducts: options.products ?? [acceptanceProduct(), ineligibleProduct()],
    resolveCartStore: () => cartStore,
    resolveOrderRepository: () => orderRepository,
    resolveClaimRepository: () => claimRepository,
    resolveClaimOrderRepository: () => claimOrderRepository,
    resolveInventoryLotStore: () => lotStore,
    resolveStoreCreditLedgerStore: () => creditLedger,
    resolveSubscriptionRepository: () => subscriptionStore,
    resolveAdminQueuesStore: () => adminQueuesStore,
    resolvePaymentProvider: () => payment,
    resolveShippingProvider: () => shipping,
    isMembershipActive: async () => true,
    hasEffectiveAgreement: async () => true,
  });

  const app = express();
  app.use(express.json());
  registerCommerceApi(app, deps, testGuards());

  // The same tail server/index.ts installs: the JSON error handler, then the
  // /api 404 guard so an unknown API path answers JSON rather than the SPA.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const shaped = err as { status?: number; statusCode?: number; message?: string };
    const status = shaped.status || shaped.statusCode || 500;
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(status).json({ message: shaped.message || "Internal Server Error" });
  });
  app.use("/api/{*rest}", (_req: Request, res: Response) => {
    res.status(404).json({ message: "Not Found" });
  });

  return {
    app,
    payment,
    shipping,
    cartStore,
    orderRepository,
    lotStore,
    creditLedger,
    subscriptionStore,
    claimRepository,
    claimOrderRepository,
    adminQueuesStore,
    env,
  };
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

export function checkoutRequest(overrides: Partial<CheckoutRequest> = {}): CheckoutRequest {
  return {
    shippingAddress: {
      line1: "1 Acceptance Way",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
    },
    shippingService: "standard",
    acceptedAgreementKeys: [...CHECKOUT_REQUIRED_AGREEMENT_KEYS],
    idempotencyKey: "acceptance-key-1",
    ...overrides,
  };
}

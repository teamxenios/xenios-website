import express, { type Express } from "express";

import type { EarlyAccessCatalogProjection, EarlyAccessCatalogRow } from "../catalog/early-access-catalog";
import {
  InMemoryEarlyAccessReleaseLedger,
  earlyAccessReleaseVersion,
} from "../release/founder-release";
import type { EarlyAccessCatalogSource } from "../release/release-routes";
import type { EarlyAccessConfig } from "../private-access-config";
import { hashPrivateAccessPassword } from "../private-access-password";
import {
  registerPrivateEarlyAccessApi,
  type EarlyAccessRegistrationOptions,
} from "../register";
import type {
  EarlyAccessAdminActor,
  EarlyAccessAdminDirectory,
  EarlyAccessAgreementGate,
  EarlyAccessCustomer,
  EarlyAccessIdentityDirectory,
  EarlyAccessReferralAttribution,
  EarlyAccessReferralResolver,
  EarlyAccessShippingPolicy,
  EarlyAccessSupplierAssignment,
  EarlyAccessSupplierDirectory,
} from "./ports";
import { InMemoryEarlyAccessCommerceStore } from "./store";

/**
 * Fixtures for the Early Access route tests, following the existing
 * member-platform-fixtures.ts precedent: test-only, imported by no production
 * module, and kept out of the handlers so the handlers carry no test seam.
 *
 * The gate is exercised FOR REAL rather than stubbed. A test unlocks with the
 * real password against a real scrypt hash and carries the real signed cookie,
 * because the property under test in half these cases is "the session gate ran",
 * and a stubbed resolver would prove nothing about that.
 */

export const EARLY_ACCESS_TEST_PASSWORD = "correct horse battery staple";

/** A real hash at the minimum accepted cost, so the verifier runs without a slow suite. */
export const EARLY_ACCESS_TEST_PASSWORD_HASH = hashPrivateAccessPassword(
  EARLY_ACCESS_TEST_PASSWORD,
  { n: 16_384 },
);

export const EARLY_ACCESS_TEST_SESSION_SECRET =
  "private-early-access-route-test-secret-0123456789";

export const EARLY_ACCESS_TEST_CONFIG: EarlyAccessConfig = Object.freeze({
  enabled: true,
  passwordHash: EARLY_ACCESS_TEST_PASSWORD_HASH,
  sessionSecret: EARLY_ACCESS_TEST_SESSION_SECRET,
  sessionTtlMinutes: 60,
  sessionTtlClampedFrom: null,
  maxAttempts: 20,
  lockoutMinutes: 5,
  cookieName: null,
  problems: Object.freeze([]),
}) as EarlyAccessConfig;

/** Gaps that are purely operational, which is the only shape a founder may release. */
export const OPERATIONAL_ONLY = Object.freeze([
  "PRICE_NOT_APPROVED",
  "DOCUMENTATION_NOT_SATISFIED",
  "IMAGE_PENDING",
] as const);

export const UNIT_PRICE_CENTS = 19_900;

export function cleanUnit(overrides: Partial<EarlyAccessCatalogRow> = {}): EarlyAccessCatalogRow {
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

export function catalogOf(rows: readonly EarlyAccessCatalogRow[]): EarlyAccessCatalogSource {
  return {
    async load(now: Date): Promise<EarlyAccessCatalogProjection> {
      return {
        evaluatedAt: now.toISOString(),
        rows: [...rows],
        productsWithoutVariants: [],
      } as unknown as EarlyAccessCatalogProjection;
    },
  };
}

/** A ledger holding one approved release for the unit, priced by the founder. */
export async function approvedLedgerFor(
  unit: EarlyAccessCatalogRow,
  overrides: Record<string, unknown> = {},
): Promise<InMemoryEarlyAccessReleaseLedger> {
  const ledger = new InMemoryEarlyAccessReleaseLedger();
  const appended = await ledger.append({
    releaseId: "rel-route-0001",
    productId: unit.productId,
    variantId: unit.variantId,
    productVersion: earlyAccessReleaseVersion(unit),
    status: "approved",
    approvedPriceCents: UNIT_PRICE_CENTS,
    currency: "USD",
    waivedBlockers: [...OPERATIONAL_ONLY],
    approvedQuantityLimit: 3,
    expiresAt: null,
    actor: "Samuel Boadu",
    reason: "Contents confirmed. Bridging lab paperwork and imagery only.",
    recordedAt: new Date(Date.UTC(2026, 7, 1)).toISOString(),
    ...overrides,
  });
  if (!appended.ok) throw new Error(`fixture release refused: ${appended.code}`);
  return ledger;
}

// ---------------------------------------------------------------------------
// Stub ports
// ---------------------------------------------------------------------------

// The route fixtures represent customers bound by the SIGNED verification
// link, which is what a test exercising order reads means. A session bound
// only by email entry is exercised explicitly in the provenance tests.
export const CUSTOMER_ALPHA: EarlyAccessCustomer = Object.freeze({
  customerRef: "cust-alpha-0001",
  displayName: "Alpha Buyer",
  boundBy: "verified_link",
});

export const CUSTOMER_BETA: EarlyAccessCustomer = Object.freeze({
  customerRef: "cust-beta-0002",
  displayName: "Beta Buyer",
  boundBy: "verified_link",
});

/**
 * Identity keyed on the presented cookie header.
 *
 * Two live sessions map to two different customers, which is what makes the
 * cross-customer test real: both callers are genuinely signed in.
 */
export class StubIdentityDirectory implements EarlyAccessIdentityDirectory {
  private readonly byCookie = new Map<string, EarlyAccessCustomer>();
  private fallback: EarlyAccessCustomer | null = null;

  bind(cookie: string, customer: EarlyAccessCustomer): this {
    this.byCookie.set(cookie, customer);
    return this;
  }

  always(customer: EarlyAccessCustomer | null): this {
    this.fallback = customer;
    return this;
  }

  async resolve(input: Readonly<{ cookieHeader: unknown }>): Promise<EarlyAccessCustomer | null> {
    const header = typeof input.cookieHeader === "string" ? input.cookieHeader : "";
    for (const [cookie, customer] of Array.from(this.byCookie.entries())) {
      if (header.includes(cookie)) return customer;
    }
    return this.fallback;
  }
}

export class StubAgreementGate implements EarlyAccessAgreementGate {
  constructor(private readonly answer: boolean) {}
  async accepted(): Promise<boolean> {
    return this.answer;
  }
}

export class StubSupplierDirectory implements EarlyAccessSupplierDirectory {
  constructor(private readonly assignment: EarlyAccessSupplierAssignment | null) {}
  async forUnit(): Promise<EarlyAccessSupplierAssignment | null> {
    return this.assignment;
  }
}

export class StubShippingPolicy implements EarlyAccessShippingPolicy {
  constructor(private readonly answer: boolean) {}
  async serves(): Promise<boolean> {
    return this.answer;
  }
}

export class StubReferralResolver implements EarlyAccessReferralResolver {
  constructor(private readonly attribution: EarlyAccessReferralAttribution | null) {}
  async forCustomer(): Promise<EarlyAccessReferralAttribution | null> {
    return this.attribution;
  }
}

export class StubAdminDirectory implements EarlyAccessAdminDirectory {
  constructor(private readonly byEmail: Readonly<Record<string, EarlyAccessAdminActor>>) {}
  async resolve(adminEmail: string): Promise<EarlyAccessAdminActor | null> {
    return this.byEmail[adminEmail] ?? null;
  }
}

export const SUPPLIER_ASSIGNMENT: EarlyAccessSupplierAssignment = Object.freeze({
  supplierId: "supplier-apex",
  supplierSku: "APEX-CLEAN-10",
});

export const SHIP_TO = Object.freeze({
  recipientName: "Alpha Buyer",
  line1: "1 Test Street",
  line2: null,
  city: "Houston",
  region: "TX",
  postalCode: "77002",
  country: "US",
});

export const REFERRAL: EarlyAccessReferralAttribution = Object.freeze({
  referralCode: "PARTNER-ONE",
  affiliateId: "affiliate-one",
  affiliateCustomerRef: "cust-affiliate-9999",
  holdBasisPoints: 1_000,
});

// ---------------------------------------------------------------------------
// The app
// ---------------------------------------------------------------------------

/** Deterministic, in the generated alphabet, so the wall's anchor still matches. */
export function sequentialOrderNumbers(): () => string {
  let issued = 0;
  return () => {
    issued += 1;
    return `XEA-${String(issued).padStart(16, "0")}`;
  };
}

export function sequentialProofIds(): () => string {
  let issued = 0;
  return () => {
    issued += 1;
    return `eaproofid.${String(issued).padStart(8, "0")}`;
  };
}

export type EarlyAccessHarness = Readonly<{
  app: Express;
  store: InMemoryEarlyAccessCommerceStore;
  identity: StubIdentityDirectory;
}>;

/**
 * An app with the real registration, the real gate, and the real commerce
 * routes. Only the outside world is stubbed.
 */
export function makeEarlyAccessApp(
  overrides: Partial<EarlyAccessRegistrationOptions> = {},
): EarlyAccessHarness {
  const app = express();
  app.use(express.json());
  const store = (overrides.store as InMemoryEarlyAccessCommerceStore | undefined)
    ?? new InMemoryEarlyAccessCommerceStore();
  const identity = (overrides.identity as StubIdentityDirectory | undefined)
    ?? new StubIdentityDirectory().always(CUSTOMER_ALPHA);

  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    orderNumber: sequentialOrderNumbers(),
    proofId: sequentialProofIds(),
    agreements: new StubAgreementGate(true),
    suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
    ...overrides,
    store,
    identity,
  });

  return Object.freeze({ app, store, identity });
}

export const ORDER_BODY = Object.freeze({
  idempotencyKey: "ea-route-order-key-0001",
  productId: "prod-clean",
  variantId: "var-10mg",
  quantity: 3,
  expectedUnitPriceCents: UNIT_PRICE_CENTS,
  expectedCurrency: "USD",
  shipTo: SHIP_TO,
});

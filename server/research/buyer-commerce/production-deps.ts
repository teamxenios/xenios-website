import type {
  BuyerCatalogVariant,
  BuyerOrderRequestRecord,
  BuyerRequestCommit,
  ResolvedBuyerLine,
} from "@shared/research/buyer-commerce";
import { BUYER_REQUEST_MAX_QUANTITY } from "@shared/research/buyer-commerce";
import {
  customerRefFor,
  normalizeEmail,
  type EarlyAccessCustomerRepository,
} from "../early-access/identity/early-access-customer";
import type { EarlyAccessAuditSink } from "../early-access/routes/ports";
import { EarlyAccessBuyerIdentityAdapter } from "./identity-adapter";
import { BuyerCommerceOutboxAdapter } from "./outbox-adapter";
import type {
  BuyerCatalogPort,
  BuyerCommerceDependencies,
  BuyerNotificationPort,
  BuyerOrderRequestPort,
} from "./service";

export const BUYER_CANONICAL_REVALIDATION_GATES = Object.freeze([
  "product_control",
  "price",
  "eligibility",
  "product_specific_legal",
  "fraud",
  "value",
  "inventory",
  "payment",
  "fulfillment",
] as const);

export type Pack02OrganizationBuyerContext = Readonly<{
  organizationId: string;
  status: "active" | "suspended" | "closed";
  roles: readonly ("organization_owner" | "organization_admin" | "business_buyer" | "billing_viewer")[];
  passwordChangeRequired: boolean;
}>;

export type Pack02BuyerContext = Readonly<{
  authUserId: string;
  emailVerified: true;
  memberId: string;
  passwordChangeRequired: boolean;
  organizations: readonly Pack02OrganizationBuyerContext[];
}>;

/** Canonical Pack02 reader. It reads existing Auth/member/org state and writes nothing. */
export interface Pack02BuyerContextReader {
  findByAuthUserId(authUserId: string): Promise<Pack02BuyerContext | null>;
}

/**
 * The existing Pack03 master-offerings projection after its exact Product
 * Control resolver has run. The brand prevents an uncomposed dataset reader or
 * display-only catalog from being wired by accident. This packet neither reads
 * the Pack03 dataset nor recreates Product Control composition.
 */
export interface CanonicalBuyerCatalogBinding extends BuyerCatalogPort {
  readonly authority: "master_offerings_plus_product_control";
}

function nonEmptyText(value: unknown, maxLength = 512): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maxLength;
}

function validCatalogVariant(value: BuyerCatalogVariant): boolean {
  const priced = value.displayPriceCents === undefined
    || (Number.isSafeInteger(value.displayPriceCents) && value.displayPriceCents > 0);
  const direct = value.directPurchaseAuthorized;
  const directAuthorityCoherent = direct
    ? value.directAuthorityBasis !== null
      && Number.isSafeInteger(value.directQuantityLimit)
      && (value.directQuantityLimit ?? 0) >= 1
      && (value.directQuantityLimit ?? 0) <= BUYER_REQUEST_MAX_QUANTITY
      && value.displayPriceCents !== undefined
      && !value.carePathway
    : value.directAuthorityBasis === null && value.directQuantityLimit === null;
  return nonEmptyText(value.offeringId, 128)
    && nonEmptyText(value.variantId, 128)
    && nonEmptyText(value.sku, 180)
    && nonEmptyText(value.slug, 240)
    && nonEmptyText(value.productName)
    && nonEmptyText(value.category, 240)
    && nonEmptyText(value.currency, 12)
    && nonEmptyText(value.displayState, 120)
    && typeof value.directPurchaseAuthorized === "boolean"
    && typeof value.carePathway === "boolean"
    && priced
    && directAuthorityCoherent;
}

/**
 * Fail-closed seam over Pack03's authoritative catalog + Product Control
 * projection. It does not infer bindings, prices, SKUs, or purchase authority.
 */
export class CanonicalBuyerCatalogAdapter implements BuyerCatalogPort {
  constructor(private readonly canonical: CanonicalBuyerCatalogBinding) {
    if (canonical.authority !== "master_offerings_plus_product_control") {
      throw new Error("Buyer catalog requires canonical Pack03 and Product Control composition.");
    }
  }

  async variants(input: Readonly<{ customerRef: string; at: Date }>): Promise<readonly BuyerCatalogVariant[]> {
    const variants = await this.canonical.variants(input);
    if (!Array.isArray(variants)) {
      throw new Error("Canonical Buyer catalog returned an invalid projection.");
    }
    const seen = new Set<string>();
    const result: BuyerCatalogVariant[] = [];
    for (const variant of variants) {
      const exact = `${variant.offeringId}\u0000${variant.variantId}`;
      if (seen.has(exact) || !validCatalogVariant(variant)) {
        throw new Error("Canonical Buyer catalog returned ambiguous or invalid authority.");
      }
      seen.add(exact);
      result.push(Object.freeze({ ...variant }));
    }
    return Object.freeze(result);
  }
}

export type CanonicalBuyerAccountBinding =
  | Readonly<{ kind: "guest"; customerRef: string }>
  | Readonly<{
      kind: "pack02_member";
      customerRef: string;
      authUserId: string;
      memberId: string;
      organizations: readonly Pack02OrganizationBuyerContext[];
    }>;

export type BuyerDirectCartHandoffLine = Readonly<{
  offeringId: string;
  variantId: string;
  sku: string;
  quantity: number;
  expectedUnitPriceCents: number;
  currency: string;
  authorityLimit: number;
}>;

export type BuyerPack04OrderRequestLine = Readonly<{
  sku: string;
  quantity: number;
  reason:
    | "DIRECT_AUTHORITY_UNAVAILABLE"
    | "PRICE_AUTHORITY_UNAVAILABLE"
    | "PRODUCT_CONTROL_REVIEW_REQUIRED";
}>;

export type CanonicalBuyerCommerceCommitInput = Readonly<{
  record: BuyerOrderRequestRecord;
  account: CanonicalBuyerAccountBinding;
  /** Re-resolve each exact selection and write only through the canonical cart. */
  directCart: Readonly<{
    mode: "canonical_cart_then_checkout";
    lines: readonly BuyerDirectCartHandoffLine[];
  }>;
  /** Adapt only these lines through accepted Pack04 into canonical research_orders. */
  orderRequest: Readonly<{
    mode: "pack04_to_canonical_research_orders";
    lines: readonly BuyerPack04OrderRequestLine[];
  }>;
  careAndUnavailable: readonly ResolvedBuyerLine[];
  revalidate: typeof BUYER_CANONICAL_REVALIDATION_GATES;
}>;

/**
 * Fusion-owned transaction boundary. A conforming implementation uses the
 * existing cart/checkout, research_orders and accepted Pack04 adapters. It is
 * responsible for durable idempotency and must not create Buyer persistence.
 */
export interface CanonicalBuyerCommerceCommitPort {
  commit(input: CanonicalBuyerCommerceCommitInput): Promise<BuyerRequestCommit>;
}

function safeIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function validOrganization(value: Pack02OrganizationBuyerContext): boolean {
  return safeIdentifier(value.organizationId)
    && ["active", "suspended", "closed"].includes(value.status)
    && Array.isArray(value.roles)
    && value.roles.every((role) => [
      "organization_owner",
      "organization_admin",
      "business_buyer",
      "billing_viewer",
    ].includes(role))
    && typeof value.passwordChangeRequired === "boolean";
}

export class CanonicalBuyerAccountResolver {
  constructor(
    private readonly customers: EarlyAccessCustomerRepository,
    private readonly pack02: Pack02BuyerContextReader,
  ) {}

  async resolve(record: BuyerOrderRequestRecord): Promise<CanonicalBuyerAccountBinding> {
    const customer = await this.customers.findByNormalizedEmail(
      normalizeEmail(record.payload.identity.email),
    );
    if (customer === null || customerRefFor(customer) !== record.customerRef) {
      throw new Error("Buyer customer binding could not be verified.");
    }
    if (customer.userId === null) {
      return Object.freeze({ kind: "guest" as const, customerRef: record.customerRef });
    }
    const context = await this.pack02.findByAuthUserId(customer.userId);
    if (
      context === null
      || context.authUserId !== customer.userId
      || context.emailVerified !== true
      || !safeIdentifier(context.authUserId)
      || !safeIdentifier(context.memberId)
      || context.passwordChangeRequired
      || !Array.isArray(context.organizations)
      || !context.organizations.every(validOrganization)
    ) {
      throw new Error("Pack02 buyer account context could not be verified.");
    }
    return Object.freeze({
      kind: "pack02_member" as const,
      customerRef: record.customerRef,
      authUserId: context.authUserId,
      memberId: context.memberId,
      // Available organizations are evidence, not an ownership choice. The
      // public Buyer request has no trusted organization target, so fusion must
      // never infer one from company name or email.
      organizations: Object.freeze(context.organizations.map((organization) => Object.freeze({
        ...organization,
        roles: Object.freeze([...organization.roles]),
      }))),
    });
  }
}

function validQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= BUYER_REQUEST_MAX_QUANTITY;
}

function directLine(line: ResolvedBuyerLine): BuyerDirectCartHandoffLine {
  if (
    line.disposition !== "direct_cart_eligible"
    || typeof line.sku !== "string"
    || !validQuantity(line.requestedQuantity)
    || !Number.isSafeInteger(line.displayPriceCents)
    || (line.displayPriceCents ?? 0) <= 0
    || !Number.isSafeInteger(line.directQuantityLimit)
    || (line.directQuantityLimit ?? 0) < line.requestedQuantity
    || (line.directQuantityLimit ?? 0) > BUYER_REQUEST_MAX_QUANTITY
  ) {
    throw new Error("Forged or incomplete direct-cart handoff was refused.");
  }
  return Object.freeze({
    offeringId: line.offeringId,
    variantId: line.variantId,
    sku: line.sku,
    quantity: line.requestedQuantity,
    expectedUnitPriceCents: line.displayPriceCents!,
    currency: line.currency,
    authorityLimit: line.directQuantityLimit!,
  });
}

function orderRequestLine(line: ResolvedBuyerLine): BuyerPack04OrderRequestLine {
  if (
    line.disposition !== "order_request"
    || typeof line.sku !== "string"
    || !validQuantity(line.requestedQuantity)
    || ![
      "DIRECT_AUTHORITY_UNAVAILABLE",
      "PRICE_AUTHORITY_UNAVAILABLE",
      "PRODUCT_CONTROL_REVIEW_REQUIRED",
    ].includes(line.reason ?? "")
  ) {
    throw new Error("Forged or incomplete Pack04 order-request handoff was refused.");
  }
  return Object.freeze({
    sku: line.sku,
    quantity: line.requestedQuantity,
    reason: line.reason as BuyerPack04OrderRequestLine["reason"],
  });
}

/** Partitions trusted Buyer decisions without weakening or reinterpreting them. */
export class CanonicalBuyerOrderRequestAdapter implements BuyerOrderRequestPort {
  constructor(
    private readonly accounts: CanonicalBuyerAccountResolver,
    private readonly canonical: CanonicalBuyerCommerceCommitPort,
  ) {}

  async commit(record: BuyerOrderRequestRecord): Promise<BuyerRequestCommit> {
    const seen = new Set<string>();
    for (const line of record.resolvedLines) {
      const exact = `${line.offeringId}\u0000${line.variantId}`;
      if (seen.has(exact) || !validQuantity(line.requestedQuantity)) {
        throw new Error("Forged Buyer quantity or duplicate exact variant was refused.");
      }
      seen.add(exact);
    }
    const account = await this.accounts.resolve(record);
    const direct = record.resolvedLines
      .filter((line) => line.disposition === "direct_cart_eligible")
      .map(directLine);
    const requested = record.resolvedLines
      .filter((line) => line.disposition === "order_request")
      .map(orderRequestLine);
    const careAndUnavailable = record.resolvedLines.filter(
      (line) => line.disposition === "care_pathway" || line.disposition === "unavailable",
    );
    return this.canonical.commit(Object.freeze({
      record,
      account,
      directCart: Object.freeze({
        mode: "canonical_cart_then_checkout" as const,
        lines: Object.freeze(direct),
      }),
      orderRequest: Object.freeze({
        mode: "pack04_to_canonical_research_orders" as const,
        lines: Object.freeze(requested),
      }),
      careAndUnavailable: Object.freeze(careAndUnavailable),
      revalidate: BUYER_CANONICAL_REVALIDATION_GATES,
    }));
  }
}

export type BuyerCommerceProductionParts = Readonly<{
  persistenceMode: "durable";
  customers: EarlyAccessCustomerRepository;
  audit: EarlyAccessAuditSink;
  /** Pack03 master offerings composed with its exact Product Control resolver. */
  catalog: CanonicalBuyerCatalogBinding;
  pack02: Pack02BuyerContextReader;
  canonicalCommit: CanonicalBuyerCommerceCommitPort;
  notifications?: BuyerNotificationPort;
}>;

export function createBuyerCommerceProductionDependencies(
  parts: BuyerCommerceProductionParts,
): BuyerCommerceDependencies {
  if (parts.persistenceMode !== "durable") {
    throw new Error("Buyer Commerce requires canonical durable production ports.");
  }
  const accounts = new CanonicalBuyerAccountResolver(parts.customers, parts.pack02);
  return Object.freeze({
    identity: new EarlyAccessBuyerIdentityAdapter(parts.customers),
    catalog: new CanonicalBuyerCatalogAdapter(parts.catalog),
    requests: new CanonicalBuyerOrderRequestAdapter(accounts, parts.canonicalCommit),
    audit: parts.audit,
    notifications: parts.notifications ?? new BuyerCommerceOutboxAdapter(),
  });
}

/**
 * Unmounted production builder. Agentic OS passes the ports produced by the
 * existing production composition roots. Re-resolving environment or database
 * state here would create a second composition root, so this deliberately does
 * not do that.
 */
export function buildBuyerCommerceProductionDependencies(
  parts: BuyerCommerceProductionParts,
): BuyerCommerceDependencies {
  return createBuyerCommerceProductionDependencies(parts);
}

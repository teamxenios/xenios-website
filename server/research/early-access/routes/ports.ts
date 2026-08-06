import { createHash } from "node:crypto";

import { isBoundedText, isSafeIdentifier } from "../commerce/input-guards";
import type { SupplierShipmentRecipient } from "../commerce/supplier-release";
import type { EarlyAccessVerifierRole } from "../commerce/payment-verification";

/**
 * Everything the Early Access commerce routes need from outside themselves, and
 * nothing else.
 *
 * Each port has a default, and every default that touches money, identity, or
 * shipment FAILS CLOSED. That follows the rule `register.ts` already states for
 * the catalog: a deployment that has not deliberately wired a thing should do
 * nothing, not do whatever it can find. An unwired deployment therefore refuses
 * every order with a truthful reason rather than selling on assumptions.
 *
 * The one default that does not fail closed is the admin directory, and only
 * because the door it sits behind is already narrower than it is: the existing
 * `requireSupabaseAdmin` guard admits exactly the one configured ADMIN_EMAIL, so
 * treating that single verified address as the founder adds no reach.
 */

// ---------------------------------------------------------------------------
// Who the caller is
// ---------------------------------------------------------------------------

/**
 * The Early Access gate is ONE shared password for a whole deployment, so a live
 * session proves the caller may be here and proves nothing at all about which
 * customer they are. Identity is therefore a separate resolution against a
 * separate credential, and this is the seam where that credential is read.
 *
 * Conflating the two is exactly how one customer ends up reading another's
 * order: the session says "authenticated", the route treats that as "the owner",
 * and the shared password becomes a master key over the whole order book.
 */
export type EarlyAccessCustomer = Readonly<{
  /** Stable, opaque, and safe to embed in an order record. Never an email. */
  customerRef: string;
  /** For an operator screen. Never returned to a customer-facing response. */
  displayName: string;
  /**
   * How this session was bound. Absent means unknown, which is treated as
   * the WEAK provenance everywhere, because a missing answer must never read
   * as a verified one.
   *
   * THE RULE, since the verified-link gate: only "verified_link" identifies a
   * customer. Prices, purchase controls, agreement acceptance, order
   * placement and the PRIVATE_EARLY_ACCESS audience all require it. An
   * "email_entry" binding is an email typed under a SHARED password, which
   * anyone holding that password can type about anyone, so it authorizes
   * none of those. The one thing it still does is let a session read back an
   * order it created here itself, which is a fact about this session rather
   * than a claim about who the customer is.
   */
  readonly boundBy?: "email_entry" | "verified_link";
}>;

/**
 * THE authorization predicate. One function, consulted by every surface that
 * treats a caller as an identified customer.
 *
 * It is deliberately a single exported function rather than four inline
 * comparisons. Four comparisons is four places to forget, and the surfaces
 * that must agree (the catalogue audience, the agreement read, the agreement
 * write, and the order path) sit in four different files. A disposable
 * mutation of THIS function should break all of them at once, which is what
 * makes the guarantee checkable.
 *
 * Everything that is not an exact "verified_link" on a customer with a real
 * reference is unidentified: no binding, an email-entry binding, an absent
 * provenance, an unknown provenance, and a customerRef with nothing behind
 * it. There is no argument that makes it answer true by accident.
 */
export function isVerifiedEarlyAccessCustomer(
  // Structural on purpose, so the catalogue's narrow audience customer and the
  // order path's full `EarlyAccessCustomer` are checked by the SAME function
  // rather than by two that could drift.
  customer: Readonly<{ customerRef?: unknown; boundBy?: unknown }> | null | undefined,
): boolean {
  if (customer === null || customer === undefined) return false;
  if (typeof customer.customerRef !== "string" || customer.customerRef.trim().length === 0) {
    return false;
  }
  return customer.boundBy === "verified_link";
}

/**
 * What the catalogue audience is allowed to know about the caller.
 *
 * Narrower than `EarlyAccessCustomer` (no display name: a projection has no
 * business carrying one), and provenance is carried rather than dropped,
 * because the audience decision now depends on it. This is the shape the
 * catalogue context must retain end to end.
 */
export type EarlyAccessAudienceCustomer = Readonly<{
  customerRef: string;
  readonly boundBy?: "email_entry" | "verified_link";
}>;

/**
 * What THIS session created, so a session bound only by email entry can read
 * back the order it just placed (its invoice, its proof) without being able
 * to read anything that existed before it. Scoped by session id, never by
 * customer id: the customer id is exactly the thing an email-entry binding
 * can claim without proof.
 */
export interface SessionOrderLog {
  record(sessionId: string, orderNumber: string): Promise<void>;
  createdHere(sessionId: string, orderNumber: string): Promise<boolean>;
}

export class InMemorySessionOrderLog implements SessionOrderLog {
  private readonly bySession = new Map<string, Set<string>>();
  async record(sessionId: string, orderNumber: string): Promise<void> {
    const existing = this.bySession.get(sessionId);
    if (existing === undefined) {
      this.bySession.set(sessionId, new Set([orderNumber]));
      return;
    }
    existing.add(orderNumber);
  }
  async createdHere(sessionId: string, orderNumber: string): Promise<boolean> {
    return this.bySession.get(sessionId)?.has(orderNumber) === true;
  }
}

export interface EarlyAccessIdentityDirectory {
  resolve(input: Readonly<{ cookieHeader: unknown }>): Promise<EarlyAccessCustomer | null>;
}

/** Nobody. An unwired deployment cannot identify a buyer, so it sells nothing. */
export class NoEarlyAccessIdentity implements EarlyAccessIdentityDirectory {
  async resolve(): Promise<EarlyAccessCustomer | null> {
    return null;
  }
}

// ---------------------------------------------------------------------------
// What the caller has agreed to
// ---------------------------------------------------------------------------

export interface EarlyAccessAgreementGate {
  /** True only when every agreement required to place an order is on file. */
  accepted(customerRef: string): Promise<boolean>;
}

/** Nothing is agreed until an agreement source says so. */
export class NoEarlyAccessAgreements implements EarlyAccessAgreementGate {
  async accepted(): Promise<boolean> {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Who ships it, and where we can ship
// ---------------------------------------------------------------------------

export type EarlyAccessSupplierAssignment = Readonly<{
  supplierId: string;
  /** The supplier's own SKU. Never the xenios SKU: they are different vocabularies. */
  supplierSku: string;
}>;

export interface EarlyAccessSupplierDirectory {
  forUnit(productId: string, variantId: string): Promise<EarlyAccessSupplierAssignment | null>;
}

/** No supplier is assigned, so nothing can be promised to a customer. */
export class NoEarlyAccessSuppliers implements EarlyAccessSupplierDirectory {
  async forUnit(): Promise<EarlyAccessSupplierAssignment | null> {
    return null;
  }
}

export interface EarlyAccessShippingPolicy {
  /** True when xenios can actually deliver to this destination today. */
  serves(destination: SupplierShipmentRecipient): Promise<boolean>;
}

/** Nowhere is served until a policy says otherwise. */
export class NoEarlyAccessShipping implements EarlyAccessShippingPolicy {
  async serves(): Promise<boolean> {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Referral attribution
// ---------------------------------------------------------------------------

/**
 * The referral is resolved from the SERVER's record of how this customer arrived,
 * never from the order body. A code a customer can type into a checkout request
 * is a code they can type into someone else's, and the commission it creates is
 * real money moving on an unverified claim.
 */
export type EarlyAccessReferralAttribution = Readonly<{
  referralCode: string;
  affiliateId: string;
  /** The affiliate's own customer reference, so self referral is detectable. */
  affiliateCustomerRef: string;
  holdBasisPoints: number;
}>;

export interface EarlyAccessReferralResolver {
  forCustomer(customerRef: string): Promise<EarlyAccessReferralAttribution | null>;
}

/** No attribution, so no commission. Silence is the safe answer about money. */
export class NoEarlyAccessReferrals implements EarlyAccessReferralResolver {
  async forCustomer(): Promise<EarlyAccessReferralAttribution | null> {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Private proof storage
// ---------------------------------------------------------------------------

/**
 * The seam a real private object store sits behind.
 *
 * The route reserves a private object and records the customer's own hash of it;
 * BYTES NEVER PASS THROUGH THIS PROCESS. That is why the reservation takes a
 * size and a digest rather than a body, and why the return value is an opaque
 * handle rather than a URL: a URL in a record is a URL that ends up in a log, an
 * email, or a response.
 */
export type EarlyAccessProofReservation = Readonly<{
  objectKey: string;
  contentType: string;
  byteSize: number;
  /** Lowercase hex SHA-256, supplied by the uploader and stored, never computed here. */
  sha256: string;
}>;

export interface EarlyAccessProofStorage {
  reserve(input: EarlyAccessProofReservation): Promise<string | null>;
}

/**
 * The offline default. It contacts nothing and returns a handle derived from the
 * object key, so the reservation is deterministic and a test can assert that two
 * proofs never share one handle.
 */
export class SyntheticEarlyAccessProofStorage implements EarlyAccessProofStorage {
  private readonly reserved = new Set<string>();

  async reserve(input: EarlyAccessProofReservation): Promise<string | null> {
    const handle = `eaproof.${createHash("sha256").update(input.objectKey, "utf8").digest("hex").slice(0, 40)}`;
    if (this.reserved.has(handle)) return null;
    this.reserved.add(handle);
    return handle;
  }
}

// ---------------------------------------------------------------------------
// Who may accept money
// ---------------------------------------------------------------------------

/**
 * The two roles `payment-verification.ts` accepts, resolved from the admin the
 * existing guard authenticated. Being an admin at all is not the same as being
 * permitted to accept money, so this is a second, narrower question.
 */
export type EarlyAccessAdminActor = Readonly<{
  actorId: string;
  role: EarlyAccessVerifierRole;
}>;

export interface EarlyAccessAdminDirectory {
  resolve(adminEmail: string): Promise<EarlyAccessAdminActor | null>;
}

/**
 * An actor id that is stable, readable in an audit trail, and not an email.
 *
 * The commerce domain's identifier class has no place for "@", and an audit row
 * is not the right home for a contact address in any case. The local part keeps
 * the row human-readable, and the digest of the whole address keeps two people
 * who share a local part on different domains from collapsing into one actor.
 */
export function earlyAccessActorIdFor(adminEmail: string): string {
  const normalized = adminEmail.trim().toLowerCase();
  const local = (normalized.split("@")[0] ?? "").replace(/[^a-z0-9]/g, "").slice(0, 24);
  const digest = createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 12);
  return `${local.length > 0 ? local : "admin"}.${digest}`;
}

/**
 * The configured ADMIN_EMAIL, as founder.
 *
 * This is not a widening: `requireSupabaseAdmin` has already verified the JWT and
 * refused every address except this one, so the only thing decided here is which
 * ROLE that single verified human holds. A deployment that needs a separate
 * operations admin injects a directory instead.
 */
export class ConfiguredEarlyAccessAdminDirectory implements EarlyAccessAdminDirectory {
  async resolve(adminEmail: string): Promise<EarlyAccessAdminActor | null> {
    const configured = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
    const presented = typeof adminEmail === "string" ? adminEmail.trim().toLowerCase() : "";
    if (configured.length === 0 || presented.length === 0 || configured !== presented) return null;
    const actorId = earlyAccessActorIdFor(presented);
    if (!isSafeIdentifier(actorId)) return null;
    return Object.freeze({ actorId, role: "founder_admin" as const });
  }
}

// ---------------------------------------------------------------------------
// The audit trail
// ---------------------------------------------------------------------------

export type EarlyAccessAuditEvent = Readonly<{
  event: string;
  orderNumber: string;
  /** The named party. "the system" is never an acceptable value here. */
  actor: string;
  at: string;
  detail: Readonly<Record<string, unknown>>;
}>;

export interface EarlyAccessAuditSink {
  record(event: EarlyAccessAuditEvent): Promise<void>;
}

export class InMemoryEarlyAccessAuditSink implements EarlyAccessAuditSink {
  private readonly events: EarlyAccessAuditEvent[] = [];

  async record(event: EarlyAccessAuditEvent): Promise<void> {
    this.events.push(event);
  }

  all(): readonly EarlyAccessAuditEvent[] {
    return Object.freeze([...this.events]);
  }
}

// ---------------------------------------------------------------------------
// Shipping destination
// ---------------------------------------------------------------------------

const POSTAL_CODE = /^[A-Za-z0-9][A-Za-z0-9 -]{1,15}$/;
const COUNTRY = /^[A-Z]{2}$/;

const RECIPIENT_KEYS = [
  "recipientName",
  "line1",
  "line2",
  "city",
  "region",
  "postalCode",
  "country",
] as const;

/**
 * Read a shipping destination from a request body.
 *
 * `supplier-release.ts` owns this shape and validates it again when the packet is
 * built, so this is the early refusal that gives the customer a useful answer
 * rather than the authority on the rule. A drift between the two therefore fails
 * closed at packet time instead of shipping to an address nobody checked.
 */
export function readShippingDestination(value: unknown): SupplierShipmentRecipient | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;

  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
    string,
    PropertyDescriptor | undefined
  >;
  const read: Record<string, unknown> = {};
  for (const key of RECIPIENT_KEYS) {
    const descriptor = descriptors[key];
    if (descriptor === undefined) {
      read[key] = key === "line2" ? null : undefined;
      continue;
    }
    if (!("value" in descriptor) || descriptor.enumerable !== true) return null;
    read[key] = descriptor.value;
  }

  if (!isBoundedText(read.recipientName, 120)) return null;
  if (!isBoundedText(read.line1, 120)) return null;
  if (read.line2 !== null && !isBoundedText(read.line2, 120)) return null;
  if (!isBoundedText(read.city, 64)) return null;
  if (!isBoundedText(read.region, 64)) return null;
  if (typeof read.postalCode !== "string" || !POSTAL_CODE.test(read.postalCode)) return null;
  if (typeof read.country !== "string" || !COUNTRY.test(read.country)) return null;

  return Object.freeze({
    recipientName: read.recipientName,
    line1: read.line1,
    line2: read.line2 === null ? null : (read.line2 as string),
    city: read.city,
    region: read.region,
    postalCode: read.postalCode,
    country: read.country,
  });
}

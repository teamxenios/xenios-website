/**
 * The Early Access customer: an explicit identity, separate from entry.
 *
 * The shared Early Access password proves that someone got through the door. It
 * proves nothing about WHO they are. Conflating the two is how one customer ends
 * up reading another's order, so identity is its own record, resolved against
 * its own credential, and it is never inferred from the password, from whoever
 * happens to be signed in, or from a default.
 *
 * This module owns the record and its rules. It performs no I/O: persistence is
 * a port, so the durable table can land later without changing the decisions
 * made here.
 */

import { createHash } from "node:crypto";
import type { CommerceResult } from "../commerce/input-guards";

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/**
 * INVITED is the only state a customer may be created in. APPROVED is the only
 * state that may own an order. SUSPENDED and REVOKED are terminal for ordering,
 * and REVOKED is terminal outright: a revoked identity is never re-approved,
 * because reusing a revoked identity would silently restore access someone
 * deliberately removed.
 */
export type EarlyAccessCustomerStatus =
  | "INVITED"
  | "APPROVED"
  | "SUSPENDED"
  | "REVOKED";

export const EARLY_ACCESS_AUDIENCE = "PRIVATE_EARLY_ACCESS" as const;

export type EarlyAccessCustomerRecord = Readonly<{
  id: string;
  /** Set only when the identity is backed by a real authenticated account. */
  userId: string | null;
  email: string;
  /** The uniqueness key. Two records may never share one. */
  normalizedEmail: string;
  legalName: string;
  phone: string | null;
  status: EarlyAccessCustomerStatus;
  /** A named human. Never "the system", never an empty string. */
  approvedBy: string;
  approvedAt: string | null;
  approvalReason: string;
  audience: typeof EARLY_ACCESS_AUDIENCE;
  createdAt: string;
  updatedAt: string;
}>;

export type EarlyAccessCustomerFailureCode =
  | "EMAIL_INVALID"
  | "LEGAL_NAME_INVALID"
  | "PHONE_INVALID"
  | "IDENTIFIER_INVALID"
  | "INSTANT_INVALID"
  | "APPROVER_NOT_NAMED"
  | "APPROVAL_REASON_MISSING"
  | "STATUS_TRANSITION_INVALID"
  | "EMAIL_ALREADY_REGISTERED";

// ---------------------------------------------------------------------------
// Normalization and validation
// ---------------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Lowercase and trim only. Deliberately NOT dot-stripping or plus-stripping:
 * treating a+b@x and a@x as one person is a policy decision with real
 * consequences (it merges two humans), and it is not this module's to make.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 254 &&
    EMAIL.test(value.trim())
  );
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value);
}

function isValidInstant(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isNamedHuman(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 200) return false;
  // "the system" and its neighbours are exactly what the accountability rule
  // exists to forbid, so they are refused by name rather than by convention.
  return !/^(the\s+)?(system|automation|robot|bot|service|admin)$/i.test(trimmed);
}

function fail(
  code: EarlyAccessCustomerFailureCode,
): CommerceResult<never, EarlyAccessCustomerFailureCode> {
  return Object.freeze({ ok: false, code });
}

// ---------------------------------------------------------------------------
// Creation and transitions
// ---------------------------------------------------------------------------

export type CreateEarlyAccessCustomerInput = Readonly<{
  id: string;
  email: string;
  legalName: string;
  phone?: string | null;
  userId?: string | null;
  now: string;
}>;

/**
 * A new customer is always INVITED. There is deliberately no way to create an
 * APPROVED record in one step: approval requires a named human and a reason, so
 * it is a separate, auditable transition.
 */
export function createEarlyAccessCustomer(
  input: CreateEarlyAccessCustomerInput,
): CommerceResult<EarlyAccessCustomerRecord, EarlyAccessCustomerFailureCode> {
  if (!isSafeIdentifier(input.id)) return fail("IDENTIFIER_INVALID");
  if (!isValidEmail(input.email)) return fail("EMAIL_INVALID");
  if (
    typeof input.legalName !== "string" ||
    input.legalName.trim().length < 2 ||
    input.legalName.trim().length > 200
  ) {
    return fail("LEGAL_NAME_INVALID");
  }
  if (
    input.phone !== undefined &&
    input.phone !== null &&
    (typeof input.phone !== "string" ||
      input.phone.trim().length < 7 ||
      input.phone.trim().length > 32)
  ) {
    return fail("PHONE_INVALID");
  }
  if (
    input.userId !== undefined &&
    input.userId !== null &&
    !isSafeIdentifier(input.userId)
  ) {
    return fail("IDENTIFIER_INVALID");
  }
  if (!isValidInstant(input.now)) return fail("INSTANT_INVALID");

  const email = input.email.trim();
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      id: input.id,
      userId: input.userId ?? null,
      email,
      normalizedEmail: normalizeEmail(email),
      legalName: input.legalName.trim(),
      phone: input.phone?.trim() ?? null,
      status: "INVITED" as const,
      approvedBy: "",
      approvedAt: null,
      approvalReason: "",
      audience: EARLY_ACCESS_AUDIENCE,
      createdAt: input.now,
      updatedAt: input.now,
    }),
  });
}

const ALLOWED_TRANSITIONS: Readonly<
  Record<EarlyAccessCustomerStatus, readonly EarlyAccessCustomerStatus[]>
> = Object.freeze({
  INVITED: Object.freeze(["APPROVED", "REVOKED"] as const),
  APPROVED: Object.freeze(["SUSPENDED", "REVOKED"] as const),
  SUSPENDED: Object.freeze(["APPROVED", "REVOKED"] as const),
  // Terminal. A revoked identity is never resurrected.
  REVOKED: Object.freeze([] as const),
});

export type TransitionInput = Readonly<{
  customer: EarlyAccessCustomerRecord;
  to: EarlyAccessCustomerStatus;
  by: string;
  reason: string;
  now: string;
}>;

export function transitionEarlyAccessCustomer(
  input: TransitionInput,
): CommerceResult<EarlyAccessCustomerRecord, EarlyAccessCustomerFailureCode> {
  if (!isValidInstant(input.now)) return fail("INSTANT_INVALID");
  if (!isNamedHuman(input.by)) return fail("APPROVER_NOT_NAMED");
  if (typeof input.reason !== "string" || input.reason.trim().length < 3) {
    return fail("APPROVAL_REASON_MISSING");
  }
  if (!ALLOWED_TRANSITIONS[input.customer.status].includes(input.to)) {
    return fail("STATUS_TRANSITION_INVALID");
  }

  const approving = input.to === "APPROVED";
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      ...input.customer,
      status: input.to,
      approvedBy: input.by.trim(),
      approvedAt: approving ? input.now : input.customer.approvedAt,
      approvalReason: input.reason.trim(),
      updatedAt: input.now,
    }),
  });
}

/** The only state permitted to own an order or bind a session. */
export function mayOwnOrders(customer: EarlyAccessCustomerRecord): boolean {
  return customer.status === "APPROVED";
}

// ---------------------------------------------------------------------------
// Persistence port
// ---------------------------------------------------------------------------

export interface EarlyAccessCustomerRepository {
  findById(id: string): Promise<EarlyAccessCustomerRecord | null>;
  findByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<EarlyAccessCustomerRecord | null>;
  /** Refuses a duplicate normalized email rather than overwriting. */
  insert(
    record: EarlyAccessCustomerRecord,
  ): Promise<CommerceResult<EarlyAccessCustomerRecord, "EMAIL_ALREADY_REGISTERED">>;
  update(record: EarlyAccessCustomerRecord): Promise<EarlyAccessCustomerRecord>;
}

/**
 * IN MEMORY. For tests and for a deployment that has not provisioned the durable
 * table yet. It is honest about what it is: nothing here survives a restart, so
 * it must never be the production directory.
 */
export class InMemoryEarlyAccessCustomerRepository
  implements EarlyAccessCustomerRepository
{
  private readonly byId = new Map<string, EarlyAccessCustomerRecord>();
  private readonly byEmail = new Map<string, string>();

  async findById(id: string): Promise<EarlyAccessCustomerRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async findByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<EarlyAccessCustomerRecord | null> {
    const id = this.byEmail.get(normalizedEmail);
    return id ? (this.byId.get(id) ?? null) : null;
  }

  async insert(
    record: EarlyAccessCustomerRecord,
  ): Promise<CommerceResult<EarlyAccessCustomerRecord, "EMAIL_ALREADY_REGISTERED">> {
    if (this.byEmail.has(record.normalizedEmail)) {
      return Object.freeze({ ok: false, code: "EMAIL_ALREADY_REGISTERED" });
    }
    this.byId.set(record.id, record);
    this.byEmail.set(record.normalizedEmail, record.id);
    return Object.freeze({ ok: true, value: record });
  }

  async update(
    record: EarlyAccessCustomerRecord,
  ): Promise<EarlyAccessCustomerRecord> {
    this.byId.set(record.id, record);
    this.byEmail.set(record.normalizedEmail, record.id);
    return record;
  }
}

/**
 * A stable, opaque reference for an order record. Derived from the customer id
 * so it is deterministic, and hashed so an order row never carries an email or
 * anything else that identifies a person by sight.
 */
export function customerRefFor(customer: EarlyAccessCustomerRecord): string {
  return `eac_${createHash("sha256").update(`early-access-customer-v1:${customer.id}`).digest("hex").slice(0, 32)}`;
}

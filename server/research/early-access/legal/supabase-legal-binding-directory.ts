/**
 * Private Early Access: the durable legal-binding directory.
 *
 * WHY THIS FILE EXISTS
 *
 * The legal lane defined the binding between an `eac_` handle and a legally
 * identified member, and M62 gave it durable storage. This is the production
 * adapter over the two M62 routines, so the payment-proof submission service can
 * be composed against real records instead of an in-memory stand-in.
 *
 * READ AND WRITE ARE SEPARATE CLASSES, NOT TWO METHODS
 *
 * `SupabaseEarlyAccessLegalBindingDirectory` implements the frozen read-only
 * directory and has no write method at all. Creating or upgrading a binding
 * lives in `SupabaseEarlyAccessLegalBindingWriter`, a different class that a
 * customer-facing route has no reason to construct. The separation is
 * structural rather than a comment, because "read must never write" is only as
 * strong as the smallest thing that can violate it: if the directory carried a
 * record method, a checkout route holding a directory could mint a binding as a
 * side effect of being visited.
 *
 * FAIL CLOSED, EVERYWHERE
 *
 * Every path that cannot positively prove a verified binding returns a refusal.
 * There is no success fallback, no "assume the common case", and no branch where
 * a malformed row becomes an accepted identity. A decode that finds anything
 * unexpected refuses rather than repairing, because a binding is the answer to
 * "who is legally on the hook", and a repaired answer to that question is a
 * fabricated one.
 *
 * WHAT THE DATABASE ALREADY GUARANTEES, AND WHAT THIS STILL RE-CHECKS
 *
 * M62 enforces a great deal on the write side: the `eac_` shape, the provenance
 * enum, the attestor constraint, `customer_ref <> all(alias_refs)`, append-only
 * triggers, and the rule that `admin_attested` may only ever be recorded for the
 * one founder checkout. This adapter re-checks the same facts on the read side
 * anyway. Not because the constraints are doubted, but because this process is
 * the one deciding whether to let someone sign, and a decision that important
 * should not rest on the assumption that the row it just read came from the
 * schema it expects.
 */

import type {
  EarlyAccessBindingResolution,
  EarlyAccessLegalBinding,
  EarlyAccessLegalBindingDirectory,
} from "../hardening-contract";
import {
  EarlyAccessPersistenceError,
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "../persistence/executor";

const RPC = Object.freeze({
  bindingForCustomer: "research_early_access_legal_binding_for_customer",
  /**
   * The inverse read, added by M67.
   *
   * It exists because M62 revokes every one of its tables from `service_role`
   * as well as from the public roles, and of the routines it grants, the only
   * bindings reader is keyed by a single `customerRef`. There was therefore no
   * statement in this deployment that could answer "which handles are this
   * member's", index or no index. M67 adds exactly one read-only routine for
   * it and grants no table anything, which is the same shape M64 took when the
   * shipping monitor needed a list read for the same reason.
   */
  bindingsForMember: "research_early_access_legal_bindings_for_member",
  recordBinding: "research_early_access_record_legal_binding",
  checkoutByNumber: "research_early_access_cart_checkout_for_number",
});

/**
 * The one checkout M62 permits `admin_attested` for.
 *
 * This literal is the same one the migration carries in
 * `research_early_access_record_legal_binding`. It is repeated here so the read
 * side can refuse an attested binding that arrived for any other handle, which
 * is the shape a widened escape hatch would take.
 */
export const FOUNDER_ATTESTATION_CHECKOUT_NUMBER = "XEC-E1703CC63BBE89E6839E24C1";

const EAC_HANDLE = /^eac_[a-f0-9]{32}$/;

/** One frozen empty list, so no caller can be handed a mutable array. */
const EMPTY_REFS: readonly string[] = Object.freeze([]);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Order-history-specific read evidence. `customerRefsFor` keeps the frozen
 * identity-directory contract, while this envelope preserves whether the raw
 * durable answer was losslessly decoded. Without the bit, a dropped malformed
 * row is indistinguishable from a complete empty history.
 */
export type EarlyAccessHistoryCustomerRefsRead = Readonly<{
  refs: readonly string[];
  complete: boolean;
}>;

function refuse(
  code: "binding_absent" | "binding_unverified" | "binding_owner_mismatch",
): EarlyAccessBindingResolution {
  return Object.freeze({ ok: false, code } as const);
}

/**
 * Normalize a database timestamp to an exact ISO 8601 UTC instant.
 *
 * PostgREST serializes `timestamptz` with a numeric offset
 * (`2026-08-09T00:00:00+00:00`), while the frozen contract documents
 * `verifiedAt` as ISO 8601 UTC. Both describe the same instant, so this
 * converts rather than refusing, but anything that does not parse to a real
 * instant is refused: a binding with an unreadable verification time cannot
 * prove when it became durable.
 */
function isoInstant(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function aliasList(value: unknown, customerRef: string): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !EAC_HANDLE.test(entry)) return null;
    // M62 constrains `customer_ref <> all(alias_refs)`. A row that carries its
    // own handle as an alias did not come from that schema.
    if (entry === customerRef) return null;
    if (!out.includes(entry)) out.push(entry);
  }
  return Object.freeze(out);
}

/**
 * Decode the RPC payload into a frozen binding, or null when anything is off.
 *
 * `requestedRef` is compared against the row's own handle so a directory can
 * never answer a question about one customer with another customer's binding.
 */
export function decodeLegalBinding(
  value: unknown,
  requestedRef: string,
): EarlyAccessLegalBinding | null {
  if (value === null || value === undefined) return null;
  let raw: Record<string, unknown>;
  try {
    raw = expectObject(RPC.bindingForCustomer, value);
  } catch {
    return null;
  }

  const customerRef = raw.customerRef;
  if (typeof customerRef !== "string" || !EAC_HANDLE.test(customerRef)) return null;
  if (customerRef !== requestedRef) return null;

  const memberId = raw.memberId;
  if (typeof memberId !== "string" || !UUID.test(memberId)) return null;

  const establishedBy = raw.establishedBy;
  if (establishedBy !== "verified_link" && establishedBy !== "admin_attested") return null;

  const verifiedAt = isoInstant(raw.verifiedAt);
  if (verifiedAt === null) return null;

  // Mirrors the M62 attestor constraint exactly: a verified link carries no
  // attestor, and an attestation without a named human is not an attestation.
  const attestedByRaw = raw.attestedBy;
  let attestedBy: string | null;
  if (establishedBy === "verified_link") {
    if (attestedByRaw !== null && attestedByRaw !== undefined) return null;
    attestedBy = null;
  } else {
    if (typeof attestedByRaw !== "string") return null;
    const trimmed = attestedByRaw.trim();
    if (trimmed.length < 2 || trimmed.length > 200) return null;
    attestedBy = attestedByRaw;
  }

  const aliasRefs = aliasList(raw.aliasRefs ?? [], customerRef);
  if (aliasRefs === null) return null;

  return Object.freeze({
    customerRef,
    memberId,
    establishedBy,
    verifiedAt,
    attestedBy,
    aliasRefs,
  });
}

export class SupabaseEarlyAccessLegalBindingDirectory
  implements EarlyAccessLegalBindingDirectory
{
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  /**
   * Read the binding for one handle. Never writes.
   *
   * The only statement this issues is
   * `research_early_access_legal_binding_for_customer`, which is declared
   * `stable` and is a bare select. There is no code path here that reaches the
   * record routine, and the directory holds no reference to it.
   */
  async forCustomer(customerRef: string): Promise<EarlyAccessBindingResolution> {
    if (typeof customerRef !== "string" || !EAC_HANDLE.test(customerRef)) {
      return refuse("binding_absent");
    }

    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.bindingForCustomer,
      args: { p_customer_ref: customerRef },
    });

    const binding = decodeLegalBinding(raw, customerRef);
    if (binding === null) return refuse("binding_absent");

    if (binding.establishedBy === "admin_attested") {
      const permitted = await this.attestationIsPermitted(binding.customerRef);
      // The weaker provenance stays pinned to the one checkout M62 allows it
      // for. Anywhere else it is not a binding this directory will sign under.
      if (!permitted) return refuse("binding_unverified");
    }

    return Object.freeze({ ok: true, binding } as const);
  }

  /**
   * True only when this member is the one bound to the handle that owns the
   * checkout.
   *
   * The answer is derived from two durable records and nothing else: the
   * checkout's own `customerRef`, and the binding stored for that handle. No
   * browser-supplied ownership claim is consulted, and nothing is cached, so a
   * binding written a moment ago is visible and a stale answer cannot outlive
   * the record it came from.
   */
  async ownsCheckout(memberId: string, cartCheckoutNumber: string): Promise<boolean> {
    if (typeof memberId !== "string" || !UUID.test(memberId)) return false;
    if (typeof cartCheckoutNumber !== "string" || cartCheckoutNumber.length === 0) return false;

    const owningRef = await this.checkoutCustomerRef(cartCheckoutNumber);
    if (owningRef === null) return false;

    const resolution = await this.forCustomer(owningRef);
    if (!resolution.ok) return false;

    return resolution.binding.memberId === memberId;
  }

  /**
   * Every handle this member is bound to, primary and aliases, sorted.
   *
   * FAIL CLOSED AT EVERY STEP. A malformed member id never reaches the
   * database. A row whose shape is not exactly what M62 stores is DROPPED
   * rather than repaired, because a repaired handle here would attach one
   * person's orders to another person's account. A routine that is absent,
   * unreadable or throwing yields an EMPTY list, never a partial one and never
   * a wider one.
   *
   * THIS METHOD DOES NOT DECIDE WHAT MAY BE SHOWN. It answers identity only.
   * The caller still applies its own ownership rule to every record it finds,
   * so a mistake here cannot silently become an authorization.
   */
  async customerRefsForHistory(
    memberId: string,
  ): Promise<EarlyAccessHistoryCustomerRefsRead> {
    if (typeof memberId !== "string" || !UUID.test(memberId)) {
      return Object.freeze({ refs: EMPTY_REFS, complete: false });
    }

    let raw: unknown;
    try {
      raw = await runEarlyAccessCall(this.query, {
        fn: RPC.bindingsForMember,
        args: { p_member_id: memberId },
      });
    } catch (error) {
      // An unwired deployment (the routine not yet applied) must show a member
      // NOTHING rather than fall through to some broader read. A persistence
      // error is re-thrown so the caller can answer "unavailable" instead of
      // rendering an empty history that looks like "you have no orders".
      if (error instanceof EarlyAccessPersistenceError) throw error;
      return Object.freeze({ refs: EMPTY_REFS, complete: false });
    }

    if (!Array.isArray(raw)) {
      return Object.freeze({ refs: EMPTY_REFS, complete: false });
    }

    const refs = new Set<string>();
    let complete = true;
    for (const entry of raw) {
      if (typeof entry !== "string" || !EAC_HANDLE.test(entry)) {
        complete = false;
        continue;
      }
      if (refs.has(entry)) {
        complete = false;
        continue;
      }
      refs.add(entry);
    }
    // Sorted so two calls against an unchanged database return an identical
    // list, which is what makes the order history above it deterministic.
    return Object.freeze({
      refs: Object.freeze(Array.from(refs).sort()),
      complete,
    });
  }

  async customerRefsFor(memberId: string): Promise<readonly string[]> {
    return (await this.customerRefsForHistory(memberId)).refs;
  }

  /** The `customerRef` recorded on the checkout, or null when unreadable. */
  private async checkoutCustomerRef(cartCheckoutNumber: string): Promise<string | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.checkoutByNumber,
      args: { p_checkout_number: cartCheckoutNumber },
    });
    if (raw === null || raw === undefined) return null;
    let record: Record<string, unknown>;
    try {
      record = expectObject(RPC.checkoutByNumber, raw);
    } catch {
      return null;
    }
    const ref = record.customerRef;
    if (typeof ref !== "string" || !EAC_HANDLE.test(ref)) return null;
    return ref;
  }

  /**
   * Whether an attested binding belongs to the one checkout M62 permits.
   *
   * Checked against the authoritative checkout record rather than trusted from
   * a constant alone, so the rule tracks the same fact the migration checks.
   */
  private async attestationIsPermitted(customerRef: string): Promise<boolean> {
    const founderRef = await this.checkoutCustomerRef(FOUNDER_ATTESTATION_CHECKOUT_NUMBER);
    if (founderRef === null) return false;
    return founderRef === customerRef;
  }
}

export const RECORD_LEGAL_BINDING_REASONS = [
  "binding_conflict",
  "admin_attestation_not_allowed",
] as const;

export type RecordLegalBindingReason = (typeof RECORD_LEGAL_BINDING_REASONS)[number];

export type RecordLegalBindingResult =
  | Readonly<{ ok: true; recorded: boolean; replayed: boolean }>
  | Readonly<{ ok: false; reason: RecordLegalBindingReason }>;

export type RecordLegalBindingInput = Readonly<{
  customerRef: string;
  memberId: string;
  establishedBy: "verified_link" | "admin_attested";
  verifiedAt: string;
  attestedBy: string | null;
  aliasRefs: readonly string[];
}>;

/**
 * The narrow administrative write path, deliberately not part of the directory.
 *
 * Nothing on a checkout or payment-proof route may construct this. It exists for
 * the identity-verification step and for the one named-admin founder
 * attestation, which is the only reason `admin_attested` exists at all.
 *
 * A rebind is impossible by construction rather than by care here: M62 looks up
 * the existing row by `customer_ref` and returns `binding_conflict` for any
 * differing member, provenance or alias set, and the append-only trigger refuses
 * UPDATE and DELETE outright. So a handle bound to member A can never come to
 * point at member B, whatever this adapter is asked to do. A byte-identical
 * resubmission reports `replayed` instead of failing, so a retried verification
 * is harmless.
 */
export class SupabaseEarlyAccessLegalBindingWriter {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async record(input: RecordLegalBindingInput): Promise<RecordLegalBindingResult> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.recordBinding,
      args: {
        p_binding: {
          customerRef: input.customerRef,
          memberId: input.memberId,
          establishedBy: input.establishedBy,
          verifiedAt: input.verifiedAt,
          attestedBy: input.attestedBy,
          aliasRefs: [...input.aliasRefs],
        },
      },
    });

    const result = expectObject(RPC.recordBinding, raw);
    const recorded = result.recorded === true;
    const replayed = result.replayed === true;
    if (recorded || replayed) return Object.freeze({ ok: true, recorded, replayed } as const);

    const reason = result.reason;
    if (
      typeof reason === "string" &&
      (RECORD_LEGAL_BINDING_REASONS as readonly string[]).includes(reason)
    ) {
      return Object.freeze({ ok: false, reason: reason as RecordLegalBindingReason } as const);
    }
    throw new EarlyAccessPersistenceError(RPC.recordBinding);
  }
}

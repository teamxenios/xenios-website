// xenios research: the durable customer attribution binding — the missing
// middle of the attribution spine.
//
// What exists on either side of this module: the capture doors write a durable
// TOUCH and set the signed xr_aff cookie (referral-capture-routes.ts), and the
// conversion seams read the cookie at submit time (assisted-order) or read a
// durable Early Access referral grant at checkout time (the EA cart lane). The
// cookie is the ONLY thing that carries attribution across sign-in today, and
// the EA grant writer has no production caller, so attribution dies with the
// cookie. This module is the bind moment: the first time a request carries
// BOTH a verified attribution cookie AND a resolved customer identity, the
// attribution becomes a durable, customer-keyed record.
//
// Invariants, in the order they are enforced:
//
//   1. ONLY A VERIFIED COOKIE BINDS. The partner and code come from the
//      HMAC-verified xr_aff payload and from nowhere else. A body, header,
//      or query value naming a partner has no path into this module, and an
//      absent RESEARCH_PARTNER_LINK_SECRET verifies nothing — the same
//      fail-closed rule the whole spine follows.
//   2. FIRST BIND WINS. The store is insert-if-absent per customer key with
//      no update or delete path, so a customer (or an affiliate) cannot
//      re-point attribution after it lands — not by clearing cookies, not by
//      clicking a second link, not by racing two requests. The candidate SQL
//      backs the same rule with a PRIMARY KEY and insert-only grants.
//   3. NO ECONOMICS ARE STORED, EVER. A binding records WHO referred WHOM,
//      WITH WHICH CODE, WHEN. Rates, holds, and payouts stay in the
//      founder-gated program config and the commission ledger. When the
//      program is not activated the binding is stamped "pending_program", so
//      attribution is preserved without inventing a single basis point.
//   4. BINDING NEVER BLOCKS THE JOURNEY. The identity decorator returns the
//      inner directory's answer unchanged whether the bind succeeded, was
//      refused, or the store was down. A visit is never broken by attribution.
//   5. NOTHING PERSONAL IS CARRIED. The customer key must be opaque (an EA
//      customer ref or a namespaced member id, never an email or a name), the
//      subject key is the same opaque visitor key the touch ledger uses, and
//      no other identity field exists in the record.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AffiliateProgramConfig } from "@shared/research/affiliate-program/config";
import { isOpaqueSubjectKey } from "./attribution";
import {
  attributionTokenFromCookieHeader,
  verifiedAttributionFromCookieHeader,
} from "./attribution-cookie";
import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/** The only bind method this version knows. Versioned data, not a free string. */
export const CUSTOMER_BINDING_METHOD = "attribution_cookie" as const;

/**
 * Whether the founder-gated program was active when the binding landed.
 * "pending_program" preserves the attribution WITHOUT economics: when the
 * founder activates the program, the binding is already on file and the grant
 * adapter can translate it then — rates are read at that moment, never stored
 * here, so activation cannot resurrect stale economics.
 */
export type AffiliateProgramStateAtBind = "active" | "pending_program";

const PROGRAM_STATES: readonly AffiliateProgramStateAtBind[] = [
  "active",
  "pending_program",
];

/**
 * One customer's attribution, durable and append-only.
 *
 * `customerKey` is the opaque identity the conversion seams already use: the
 * Early Access customer ref (eac_…) for the EA lane, or a namespaced member
 * key for the member lane. `subjectKey` preserves continuity with the
 * append-only touch ledger the capture door wrote, and `code` preserves the
 * exact link code that was clicked. No email, name, or member profile field
 * has a seat here.
 */
export interface AffiliateCustomerBinding {
  readonly customerKey: string;
  /** From the VERIFIED cookie payload only. Never from a request value. */
  readonly partnerId: string;
  /** The link code that was clicked, exactly as captured. Audit continuity. */
  readonly code: string;
  /** The opaque visitor key the capture touch was written under. */
  readonly subjectKey: string;
  /** When the touch was captured (the cookie's issuedAt). */
  readonly capturedAt: string;
  /** When identity became known and the binding was written. */
  readonly boundAt: string;
  readonly programState: AffiliateProgramStateAtBind;
  readonly method: typeof CUSTOMER_BINDING_METHOD;
}

// ---------------------------------------------------------------------------
// The store seam
// ---------------------------------------------------------------------------

export type BindingPutResult = Readonly<{
  /** The record that is durable AFTER the call: the new one, or the winner. */
  binding: AffiliateCustomerBinding;
  /** False exactly when a binding already existed; the existing one is returned. */
  created: boolean;
}>;

/**
 * Insert-if-absent plus read, and NOTHING else. There is deliberately no
 * update, no delete, and no partner-scoped listing: a binding cannot be
 * rewritten through this seam, and one partner cannot enumerate customers —
 * their dashboard sees ledger aggregates, never bindings.
 */
export interface AsyncAffiliateCustomerBindingStore {
  putBindingIfAbsent(binding: AffiliateCustomerBinding): Promise<BindingPutResult>;
  findByCustomerKey(customerKey: string): Promise<AffiliateCustomerBinding | null>;
}

export function createInMemoryAffiliateCustomerBindingStore(): AsyncAffiliateCustomerBindingStore {
  const byCustomer = new Map<string, AffiliateCustomerBinding>();
  const clone = (binding: AffiliateCustomerBinding): AffiliateCustomerBinding => ({
    ...binding,
  });
  return {
    async putBindingIfAbsent(binding) {
      const existing = byCustomer.get(binding.customerKey);
      // First bind wins: the existing record is returned untouched, exactly
      // as the DB PRIMARY KEY makes the durable store behave under a race.
      if (existing) return { binding: clone(existing), created: false };
      byCustomer.set(binding.customerKey, clone(binding));
      return { binding: clone(binding), created: true };
    },
    async findByCustomerKey(customerKey) {
      const binding = byCustomer.get(customerKey);
      return binding ? clone(binding) : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed store (candidate table; see supabase/candidates/
// 20260819_research_affiliate_customer_bindings.sql, founder-gated)
// ---------------------------------------------------------------------------

const CUSTOMER_BINDINGS = "research_affiliate_customer_bindings";

// PostgREST unique-violation code: the PRIMARY KEY on customer_key firing,
// which IS the first-bind-wins guarantee under concurrency.
const UNIQUE_VIOLATION = "23505";

/** A research_affiliate_customer_bindings row, exactly the binding's columns. */
export interface AffiliateCustomerBindingRow {
  customer_key: string;
  partner_id: string;
  code: string;
  subject_key: string;
  captured_at: string;
  bound_at: string;
  program_state: string;
  method: string;
}

/**
 * Map a persisted row to a binding. Returns null when the program state or
 * method is not a value this version writes, so a foreign or corrupt row is
 * dropped rather than trusted — the same "drop, do not guess" discipline the
 * partners-store channel guards apply.
 */
export function bindingRowToBinding(
  row: AffiliateCustomerBindingRow,
): AffiliateCustomerBinding | null {
  if (!(PROGRAM_STATES as readonly string[]).includes(row.program_state)) return null;
  if (row.method !== CUSTOMER_BINDING_METHOD) return null;
  return {
    customerKey: row.customer_key,
    partnerId: row.partner_id,
    code: row.code,
    subjectKey: row.subject_key,
    capturedAt: row.captured_at,
    boundAt: row.bound_at,
    programState: row.program_state as AffiliateProgramStateAtBind,
    method: CUSTOMER_BINDING_METHOD,
  };
}

/** Map a binding to an insertable row. Explicit construction, both ways. */
export function bindingToRow(binding: AffiliateCustomerBinding): AffiliateCustomerBindingRow {
  return {
    customer_key: binding.customerKey,
    partner_id: binding.partnerId,
    code: binding.code,
    subject_key: binding.subjectKey,
    captured_at: binding.capturedAt,
    bound_at: binding.boundAt,
    program_state: binding.programState,
    method: binding.method,
  };
}

const BINDING_COLUMNS =
  "customer_key, partner_id, code, subject_key, captured_at, bound_at, program_state, method";

/**
 * Supabase-backed binding store. Insert + read only, scoped by the customer
 * key the caller passes and never by any ambient identity. The table's
 * PRIMARY KEY carries first-bind-wins; a conflicting insert re-reads and
 * returns the standing winner, mirroring putAttributionIfAbsent.
 */
export function createSupabaseAffiliateCustomerBindingStore(
  client: SupabaseClient = getSupabaseAdmin(),
): AsyncAffiliateCustomerBindingStore {
  async function read(customerKey: string): Promise<AffiliateCustomerBinding | null> {
    const found = await client
      .from(CUSTOMER_BINDINGS)
      .select(BINDING_COLUMNS)
      .eq("customer_key", customerKey)
      .maybeSingle();
    if (found.error) {
      throw new Error(`customer binding load failed: ${found.error.message}`);
    }
    if (!found.data) return null;
    return bindingRowToBinding(found.data as unknown as AffiliateCustomerBindingRow);
  }

  return {
    async putBindingIfAbsent(binding) {
      const ins = await client.from(CUSTOMER_BINDINGS).insert(bindingToRow(binding));
      if (ins.error) {
        if (ins.error.code === UNIQUE_VIOLATION) {
          const existing = await read(binding.customerKey);
          // A conflict with no readable winner is an inconsistency, not a
          // success; failing here keeps the caller's refusal honest.
          if (!existing) {
            throw new Error(
              `customer binding conflict for ${binding.customerKey} but no stored row is readable`,
            );
          }
          return { binding: existing, created: false };
        }
        throw new Error(`customer binding insert failed: ${ins.error.message}`);
      }
      return { binding, created: true };
    },
    findByCustomerKey: read,
  };
}

/**
 * The durable store when Supabase is configured, the in-memory reference
 * otherwise. Until the founder applies the candidate table, the Supabase
 * branch's inserts fail and the binder answers "store_unavailable" — the
 * journey continues, attribution is honestly not recorded, and nothing
 * pretends durability that does not exist.
 */
export function resolveAffiliateCustomerBindingStore(): AsyncAffiliateCustomerBindingStore {
  return supabaseConfigured()
    ? createSupabaseAffiliateCustomerBindingStore()
    : createInMemoryAffiliateCustomerBindingStore();
}

// ---------------------------------------------------------------------------
// The binder
// ---------------------------------------------------------------------------

export type CustomerBindRefusal =
  /** No verified attribution: absent, forged, expired, or unconfigured secret. */
  | "no_attribution"
  /** The customer key looks like identity (email/whitespace/empty), refused outright. */
  | "customer_key_not_opaque"
  /** The verified partner is the customer's own partner account. */
  | "self_referral"
  /** The store could not answer; nothing was recorded, nothing is claimed. */
  | "store_unavailable";

export type CustomerBindOutcome =
  | Readonly<{ bound: true; binding: AffiliateCustomerBinding; created: boolean }>
  | Readonly<{ bound: false; reason: CustomerBindRefusal }>;

export interface CustomerAttributionBinderDeps {
  /** RESEARCH_PARTNER_LINK_SECRET at the composition root. Null binds nothing. */
  linkSecret: string | null;
  bindings: AsyncAffiliateCustomerBindingStore;
  /**
   * resolveAffiliateProgram(env) at the composition root. Null is a legal
   * input meaning "economics not activated": the binding still lands, stamped
   * pending_program, and no rate is read or stored.
   */
  program: AffiliateProgramConfig | null;
  /**
   * The customer's OWN partner id, when the composition can resolve one
   * (e.g. member key -> research_partners.member_id). Used only to refuse a
   * self-referral at bind time. Absent means the check cannot run here; the
   * grant adapter and the settlement lane still refuse self-referral where
   * money moves, so this seam failing to answer never pays anyone.
   */
  ownPartnerIdFor?: (customerKey: string) => Promise<string | null>;
  clock?: () => Date;
}

export interface CustomerAttributionBinder {
  /**
   * Attempt the bind for one identified customer. Idempotent: a repeat call
   * (or a second cookie) returns the standing binding with created=false.
   */
  bindFromCookieHeader(
    cookieHeader: string | undefined,
    customerKey: string,
  ): Promise<CustomerBindOutcome>;
  /**
   * The durable attribution for one customer, or null. This is the fallback
   * conversion seams may consult when no live cookie is present — the read
   * half of "survive sign-in beyond the cookie's life".
   */
  attributionForCustomer(customerKey: string): Promise<AffiliateCustomerBinding | null>;
}

export function createCustomerAttributionBinder(
  deps: CustomerAttributionBinderDeps,
): CustomerAttributionBinder {
  const clock = deps.clock ?? (() => new Date());

  return {
    async bindFromCookieHeader(cookieHeader, customerKey) {
      // An address-shaped or whitespace-bearing key is refused before
      // anything is read: the binding table must never become a place
      // identity is stored, same rule as the touch ledger.
      if (!isOpaqueSubjectKey(customerKey)) {
        return { bound: false, reason: "customer_key_not_opaque" };
      }

      const now = clock();
      // The one source of partner and code. Covers every negative at once:
      // missing cookie, forged signature, expired token, absent secret.
      const claims = verifiedAttributionFromCookieHeader(
        deps.linkSecret,
        cookieHeader,
        now,
      );
      if (!claims) return { bound: false, reason: "no_attribution" };

      if (deps.ownPartnerIdFor) {
        let ownPartnerId: string | null;
        try {
          ownPartnerId = await deps.ownPartnerIdFor(customerKey);
        } catch {
          // The self-check could not answer. Refusing to bind is the closed
          // failure: nothing lands that the check might have refused.
          return { bound: false, reason: "store_unavailable" };
        }
        // Denied unconditionally when detectable. The launch program denies
        // self-referral, and a null program must never read as permission.
        if (ownPartnerId !== null && ownPartnerId === claims.partnerId) {
          return { bound: false, reason: "self_referral" };
        }
      }

      const binding: AffiliateCustomerBinding = {
        customerKey,
        partnerId: claims.partnerId,
        code: claims.code,
        subjectKey: claims.subjectKey,
        capturedAt: claims.issuedAt,
        boundAt: now.toISOString(),
        programState: deps.program ? "active" : "pending_program",
        method: CUSTOMER_BINDING_METHOD,
      };

      try {
        const stored = await deps.bindings.putBindingIfAbsent(binding);
        return { bound: true, binding: stored.binding, created: stored.created };
      } catch {
        // A store that cannot answer records nothing and claims nothing.
        return { bound: false, reason: "store_unavailable" };
      }
    },

    async attributionForCustomer(customerKey) {
      if (!isOpaqueSubjectKey(customerKey)) return null;
      try {
        return await deps.bindings.findByCustomerKey(customerKey);
      } catch {
        // An unreadable store is a plain miss for a read-side fallback; the
        // conversion seam simply proceeds unattributed, never errors.
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// The bind moment: an identity-source decorator
// ---------------------------------------------------------------------------

/** The one field the decorator needs from a resolved identity. */
export interface BindableCustomerIdentity {
  readonly customerRef: string;
}

/**
 * Structurally identical to EarlyAccessIdentityDirectory (server/research/
 * early-access/routes/ports.ts) without importing it, so this module adds no
 * dependency on the Early Access lane. The composition root wraps its real
 * directory in one line and TypeScript's structural typing does the rest.
 */
export interface CustomerIdentitySource<C extends BindableCustomerIdentity> {
  resolve(input: Readonly<{ cookieHeader: unknown }>): Promise<C | null>;
}

/**
 * Wrap an identity source so that resolving an identity ALSO binds any
 * verified attribution the same request carries. The inner answer is returned
 * unchanged in every case — bind success, bind refusal, store failure — so
 * attribution can never break identity resolution or the customer journey.
 *
 * The bind is attempted only when the raw xr_aff cookie is present (a cheap
 * string check), so the overwhelming majority of requests pay nothing here,
 * and it is awaited rather than fire-and-forgotten so the write either lands
 * before the response or observably did not — no dangling writes to reason
 * about in tests or in incident review.
 */
export function withCustomerAttributionBinding<C extends BindableCustomerIdentity>(
  inner: CustomerIdentitySource<C>,
  binder: Pick<CustomerAttributionBinder, "bindFromCookieHeader">,
): CustomerIdentitySource<C> {
  return {
    async resolve(input) {
      const customer = await inner.resolve(input);
      if (customer === null) return null;

      const cookieHeader =
        typeof input.cookieHeader === "string" ? input.cookieHeader : undefined;
      if (cookieHeader && attributionTokenFromCookieHeader(cookieHeader) !== null) {
        try {
          await binder.bindFromCookieHeader(cookieHeader, customer.customerRef);
        } catch {
          // The binder itself answers refusals as values; a throw here is a
          // defect, and even a defect must not cost the customer their visit.
        }
      }
      return customer;
    },
  };
}

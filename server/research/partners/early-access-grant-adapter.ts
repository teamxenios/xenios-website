// xenios research: binding -> Early Access referral grant, the money-side
// translation of the attribution spine.
//
// A durable customer binding (customer-attribution-binding.ts) records WHO
// referred WHOM with WHICH code — no economics. The Early Access referral
// grant (SupabaseEarlyAccessReferralGrantWriter, server/research/early-access/
// persistence/commerce-ports.ts) is the record the EA CART lane reads at
// checkout and settlement, and it DOES carry economics (holdBasisPoints), so
// it can only ever be written from an ACTIVATED program. This adapter is the
// one translation between the two, and it refuses rather than invents:
//
//   - Program not activated (null)          -> "pending_program". The binding
//     stays on file; when the founder activates the program this adapter is
//     simply run again, reading the rate THEN. No rate is ever stored early.
//   - Partner has no EA customer ref        -> "affiliate_unmapped". The Gen 2
//     partner directory and the EA customer directory are different identity
//     spaces; until the composition can map one to the other, no grant — and
//     no invented affiliateCustomerRef — is possible.
//   - Affiliate referred themselves         -> "self_referral". Checked here
//     under the program's own policy, and checked AGAIN by the grant writer
//     and the settlement lane, because self-referral is where money leaks.
//
// The shapes below are STRUCTURAL COPIES of the EA writer's contract, not
// imports, so the partners lane adds no dependency on early-access/**. The
// writer's own validation remains the authority; this adapter only ever
// builds inputs the writer would accept, and a drift between the two surfaces
// as the writer's named "input_invalid", never as silent money.

import { createHash } from "node:crypto";
import type { AffiliateProgramConfig } from "@shared/research/affiliate-program/config";
import type { AffiliateCustomerBinding } from "./customer-attribution-binding";

// ---------------------------------------------------------------------------
// The EA grant contract, restated structurally
// ---------------------------------------------------------------------------

/** Field-for-field EarlyAccessReferralGrantInput (EA commerce-ports.ts). */
export type EarlyAccessGrantInput = Readonly<{
  customerRef: string;
  referralCode: string;
  affiliateId: string;
  affiliateCustomerRef: string;
  holdBasisPoints: number;
}>;

/** What the EA grant writer answers. Structural, so the real writer satisfies it. */
export interface EarlyAccessGrantWriterLike {
  grant(input: EarlyAccessGrantInput): Promise<"granted" | "input_invalid">;
}

// Restated from the EA writer so a code this adapter emits is never one the
// writer refuses on shape. The writer's own copy remains the enforcing one.
const GRANT_REFERRAL_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,63}$/;

/**
 * The grant's referral_code column holds at most 64 characters, and a signed
 * Gen 2 link code (version.partner.nonce.signature, all base64url) is longer
 * than that by construction. A code that fits is carried verbatim; a code
 * that does not is carried as a STABLE DIGEST — "xc" plus the first 56 hex
 * characters of its SHA-256 — which is deterministic and recomputable from
 * the research_partner_links row, so audit continuity survives without
 * truncating or mutating the code itself. 224 bits keeps collisions out of
 * the conversation.
 */
export function referralCodeForGrant(code: string): string {
  if (GRANT_REFERRAL_CODE.test(code)) return code;
  return `xc${createHash("sha256").update(code, "utf8").digest("hex").slice(0, 56)}`;
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

export type GrantTranslationRefusal =
  /** Economics not activated. The binding is preserved; translate again later. */
  | "pending_program"
  /** No EA customer ref is known for this partner; nothing is invented. */
  | "affiliate_unmapped"
  /** The program denies self-referral and this binding is one. */
  | "self_referral";

export type GrantTranslationResult =
  | Readonly<{ ok: true; grant: EarlyAccessGrantInput }>
  | Readonly<{ ok: false; reason: GrantTranslationRefusal }>;

export interface GrantTranslationDeps {
  /**
   * resolveAffiliateProgram(env) at the call moment. Null means economics are
   * not approved: the answer is "pending_program" and NOTHING else happens.
   */
  program: AffiliateProgramConfig | null;
  /**
   * The affiliate's own Early Access customer ref (eac_…), by partner id.
   * This mapping lives with the composition root (it joins the Gen 2 partner
   * directory to the EA customer directory); null means unmapped and refuses
   * the grant. A throwing directory propagates: the caller decides whether an
   * unavailable directory retries or refuses, and no default guesses.
   */
  affiliateCustomerRefFor: (partnerId: string) => Promise<string | null>;
}

/**
 * Build the exact grant input for one binding, or a typed refusal.
 *
 * holdBasisPoints is the program's FIRST-ORDER rate: the grant is written at
 * the moment the referred customer arrives, before any order exists, and the
 * hold is a reservation ceiling — the commission ledger still computes what
 * actually pays per order (first vs repeat, window, partner state). Reserving
 * at the higher first-order rate can only ever over-reserve, never over-pay.
 */
export async function earlyAccessGrantFromBinding(
  binding: AffiliateCustomerBinding,
  deps: GrantTranslationDeps,
): Promise<GrantTranslationResult> {
  const program = deps.program;
  if (!program) return { ok: false, reason: "pending_program" };

  const affiliateCustomerRef = await deps.affiliateCustomerRefFor(binding.partnerId);
  if (affiliateCustomerRef === null) {
    return { ok: false, reason: "affiliate_unmapped" };
  }

  if (
    program.selfReferralPolicy === "denied" &&
    affiliateCustomerRef === binding.customerKey
  ) {
    return { ok: false, reason: "self_referral" };
  }

  return {
    ok: true,
    grant: {
      customerRef: binding.customerKey,
      referralCode: referralCodeForGrant(binding.code),
      affiliateId: binding.partnerId,
      affiliateCustomerRef,
      holdBasisPoints: program.firstOrderRateBasisPoints,
    },
  };
}

// ---------------------------------------------------------------------------
// The write helper
// ---------------------------------------------------------------------------

export type GrantWriteResult =
  | Readonly<{ ok: true; grant: EarlyAccessGrantInput }>
  | Readonly<{ ok: false; reason: GrantTranslationRefusal | "writer_refused" }>;

/**
 * Translate and write in one motion. The writer's "input_invalid" surfaces as
 * "writer_refused" — the writer is the authority on its own table, and a
 * refusal there means this adapter and that contract have drifted, which must
 * be heard, not smoothed over.
 */
export async function writeEarlyAccessGrantFromBinding(
  writer: EarlyAccessGrantWriterLike,
  binding: AffiliateCustomerBinding,
  deps: GrantTranslationDeps,
): Promise<GrantWriteResult> {
  const translated = await earlyAccessGrantFromBinding(binding, deps);
  if (!translated.ok) return translated;
  const outcome = await writer.grant(translated.grant);
  if (outcome !== "granted") return { ok: false, reason: "writer_refused" };
  return translated;
}

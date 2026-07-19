import { getSupabaseAdmin, supabaseConfigured } from "../supabase";
import type { FraudAction, FraudFlagReason } from "@shared/research/referral-types";

// ---------------------------------------------------------------------------
// xenios research referral fraud controls (V3 section 71).
//
// Doctrine baked in:
// - Detection signals FLAG for human review; they never auto-penalize.
//   (Legitimate households must not be punished automatically.) The only
//   automatic disqualifications are the bright lines: self-referral and
//   disposable email addresses, both recorded with a reason.
// - Every reviewer action requires an audit reason, and every decision writes
//   an append-only referral_events row.
// - Everything here is behind RESEARCH_REFERRALS_ENABLED via its callers; a
//   failure in a fraud check never breaks the application or activation path.
// ---------------------------------------------------------------------------

const EVENTS = "referral_events";
const FLAGS = "referral_fraud_flags";
const REWARDS = "referral_rewards";
const ATTRIBUTIONS = "referral_attributions";
const IDENTITIES = "referral_identities";

// Canonical email identity: lowercase, plus-tag stripped, gmail dot variants
// collapsed. Used for self-referral and multi-account comparison ONLY; the
// stored address is always the one the person typed.
export function canonicalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return trimmed;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

// A small curated denylist of throwaway-address domains, extendable without a
// deploy via RESEARCH_DISPOSABLE_DOMAINS (comma separated). Deliberately
// conservative: a miss goes to human review, a hit is a bright line.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "sharklasers.com", "10minutemail.com",
  "tempmail.com", "temp-mail.org", "tempmail.dev", "yopmail.com", "getnada.com",
  "dispostable.com", "trashmail.com", "maildrop.cc", "fakeinbox.com",
  "mintemail.com", "throwawaymail.com", "mytemp.email", "tempinbox.com",
  "mohmal.com", "emailondeck.com", "mail-temp.com", "mailnesia.com",
  "spam4.me", "grr.la", "tempr.email", "discard.email",
]);

export function isDisposableEmail(email: string): boolean {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.trim().toLowerCase().slice(at + 1);
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  const extra = (process.env.RESEARCH_DISPOSABLE_DOMAINS ?? "")
    .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  return extra.includes(domain);
}

// Append-only audit trail. Failures log and never propagate: audit must not
// break the money path, and the money path never depends on audit succeeding.
export async function recordReferralEvent(event: {
  eventType: string;
  attributionId?: string | null;
  rewardId?: string | null;
  identityId?: string | null;
  fraudFlagId?: string | null;
  actorType: "system" | "admin";
  actorId?: string | null;
  reason?: string | null;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    if (!supabaseConfigured()) return;
    const { error } = await getSupabaseAdmin().from(EVENTS).insert({
      event_type: event.eventType,
      attribution_id: event.attributionId ?? null,
      reward_id: event.rewardId ?? null,
      identity_id: event.identityId ?? null,
      fraud_flag_id: event.fraudFlagId ?? null,
      actor_type: event.actorType,
      actor_id: event.actorId ?? null,
      reason: event.reason ?? null,
      detail: event.detail ?? null,
    });
    if (error) console.error("[referral fraud] event insert failed:", error.message);
  } catch (err) {
    console.error("[referral fraud] event error:", err);
  }
}

// Open a review-queue flag (deduplicated: one OPEN flag per reason per
// attribution). Returns the flag id when one was created.
export async function openFraudFlag(flag: {
  reason: FraudFlagReason;
  attributionId?: string | null;
  identityId?: string | null;
  applicationId?: string | null;
  detail?: string | null;
}): Promise<string | null> {
  try {
    if (!supabaseConfigured()) return null;
    if (flag.attributionId) {
      const { data: existing } = await getSupabaseAdmin()
        .from(FLAGS)
        .select("id")
        .eq("attribution_id", flag.attributionId)
        .eq("reason", flag.reason)
        .eq("status", "open");
      if ((existing as any[])?.length) return null;
    }
    const { data, error } = await getSupabaseAdmin()
      .from(FLAGS)
      .insert({
        reason: flag.reason,
        status: "open",
        attribution_id: flag.attributionId ?? null,
        identity_id: flag.identityId ?? null,
        application_id: flag.applicationId ?? null,
        detail: flag.detail ?? null,
      })
      .select()
      .single();
    if (error || !data) {
      if (error) console.error("[referral fraud] flag insert failed:", error.message);
      return null;
    }
    await recordReferralEvent({
      eventType: "fraud-flag-opened",
      attributionId: flag.attributionId,
      identityId: flag.identityId,
      fraudFlagId: (data as any).id,
      actorType: "system",
      reason: flag.reason,
      detail: flag.detail ? { detail: flag.detail } : null,
    });
    return (data as any).id;
  } catch (err) {
    console.error("[referral fraud] flag error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reviewer actions (V3 section 71): clear, hold, disqualify, reverse-reward,
// suspend-referrer, request-information, escalate. Reason is REQUIRED.
// ---------------------------------------------------------------------------

async function rewardsForAttribution(attributionId: string): Promise<any[]> {
  const { data } = await getSupabaseAdmin().from(REWARDS).select("*").eq("attribution_id", attributionId);
  return (data as any[]) ?? [];
}

// Reverse or cancel every reward on an attribution. Held/pending rewards are
// cancelled (they never reached the ledger); available/redeemed rewards are
// reversed with a compensating negative ledger entry so the ledger stays
// append-only and the balance is corrected, never rewritten.
export async function reverseRewardsForAttribution(input: {
  attributionId: string;
  reason: string;
  actorType: "system" | "admin";
  actorId?: string | null;
}): Promise<{ cancelled: number; reversed: number }> {
  const nowIso = new Date().toISOString();
  let cancelled = 0;
  let reversed = 0;
  for (const reward of await rewardsForAttribution(input.attributionId)) {
    if (reward.status === "held" || reward.status === "pending") {
      const { data: updated } = await getSupabaseAdmin()
        .from(REWARDS)
        .update({ status: "cancelled", reversed_at: nowIso, reversal_reason: input.reason, updated_at: nowIso })
        .eq("id", reward.id)
        .eq("status", reward.status)
        .select()
        .single();
      if (updated) cancelled += 1;
    } else if (reward.status === "available" || reward.status === "redeemed") {
      const { data: updated } = await getSupabaseAdmin()
        .from(REWARDS)
        .update({ status: "reversed", reversed_at: nowIso, reversal_reason: input.reason, updated_at: nowIso })
        .eq("id", reward.id)
        .eq("status", reward.status)
        .select()
        .single();
      if (!updated) continue;
      reversed += 1;
      const { getLedgerBalance } = await import("./referrals");
      const balance = await getLedgerBalance(reward.recipient_member_id);
      const amount = reward.value_cents ?? 0;
      const { error: ledgerError } = await getSupabaseAdmin().from("member_credit_ledger").insert({
        member_id: reward.recipient_member_id,
        entry_type: "reversal",
        amount_cents: -amount,
        currency: reward.currency ?? "usd",
        referral_reward_id: reward.id,
        balance_after_cents: balance - amount,
        reason: input.reason,
        actor_type: input.actorType,
        actor_id: input.actorId ?? null,
      });
      if (ledgerError) console.error("[referral fraud] reversal ledger insert failed:", ledgerError.message);
    }
    await recordReferralEvent({
      eventType: "reward-reversed",
      attributionId: input.attributionId,
      rewardId: reward.id,
      actorType: input.actorType,
      actorId: input.actorId,
      reason: input.reason,
    });
  }
  return { cancelled, reversed };
}

// Apply one reviewer action to one flag. Exported for tests; the route below
// is a thin shell around it.
export async function applyFraudAction(input: {
  flagId: string;
  action: FraudAction;
  reason: string;
  adminId?: string | null;
}): Promise<{ ok: true; status: string } | { ok: false; message: string }> {
  const { data: flag } = await getSupabaseAdmin().from(FLAGS).select("*").eq("id", input.flagId).maybeSingle();
  if (!flag) return { ok: false, message: "Flag not found." };
  if ((flag as any).status === "resolved") return { ok: false, message: "This flag is already resolved." };
  const attributionId = (flag as any).attribution_id as string | null;
  const identityId = (flag as any).identity_id as string | null;
  const nowIso = new Date().toISOString();

  let nextStatus: string = "resolved";
  switch (input.action) {
    case "clear": {
      // Benign: release any review-paused (pending) rewards back to held so
      // the normal hold-window promotion resumes.
      if (attributionId) {
        for (const reward of await rewardsForAttribution(attributionId)) {
          if (reward.status !== "pending") continue;
          await getSupabaseAdmin()
            .from(REWARDS)
            .update({ status: "held", updated_at: nowIso })
            .eq("id", reward.id)
            .eq("status", "pending");
        }
      }
      break;
    }
    case "hold": {
      // Pause: held rewards move to pending so the clock cannot promote them
      // while the case is examined. The flag STAYS OPEN.
      if (attributionId) {
        for (const reward of await rewardsForAttribution(attributionId)) {
          if (reward.status !== "held") continue;
          await getSupabaseAdmin()
            .from(REWARDS)
            .update({ status: "pending", updated_at: nowIso })
            .eq("id", reward.id)
            .eq("status", "held");
        }
      }
      nextStatus = "open";
      break;
    }
    case "disqualify": {
      if (attributionId) {
        await getSupabaseAdmin()
          .from(ATTRIBUTIONS)
          .update({ status: "disqualified", disqualification_reason: input.reason, updated_at: nowIso })
          .eq("id", attributionId);
        await reverseRewardsForAttribution({
          attributionId,
          reason: input.reason,
          actorType: "admin",
          actorId: input.adminId,
        });
      }
      break;
    }
    case "reverse-reward": {
      if (attributionId) {
        await reverseRewardsForAttribution({
          attributionId,
          reason: input.reason,
          actorType: "admin",
          actorId: input.adminId,
        });
      }
      break;
    }
    case "suspend-referrer": {
      if (identityId) {
        await getSupabaseAdmin()
          .from(IDENTITIES)
          .update({ status: "paused" })
          .eq("id", identityId);
      }
      break;
    }
    case "request-information":
      nextStatus = "information-requested";
      break;
    case "escalate":
      nextStatus = "escalated";
      break;
  }

  const resolved = nextStatus === "resolved";
  await getSupabaseAdmin()
    .from(FLAGS)
    .update({
      status: nextStatus,
      resolution_action: input.action,
      resolution_reason: input.reason,
      resolved_by: resolved ? (input.adminId ?? "admin") : null,
      resolved_at: resolved ? nowIso : null,
      updated_at: nowIso,
    })
    .eq("id", input.flagId);

  await recordReferralEvent({
    eventType: `fraud-action-${input.action}`,
    attributionId,
    identityId,
    fraudFlagId: input.flagId,
    actorType: "admin",
    actorId: input.adminId,
    reason: input.reason,
  });
  return { ok: true, status: nextStatus };
}

// Admin routes live in fraud-admin.ts so this module stays free of express
// and auth imports (unit tests exercise the services directly).

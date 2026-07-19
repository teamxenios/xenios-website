import crypto from "crypto";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase";
import { canonicalizeEmail, isDisposableEmail, openFraudFlag, recordReferralEvent } from "./fraud";

// ---------------------------------------------------------------------------
// xenios research referrals: FOUNDATION ONLY (V3 sections 68-70, 84).
// Everything is behind RESEARCH_REFERRALS_ENABLED (default false): when the
// flag is off, capture and qualification are no-ops and no reward can be
// created. Public UI is CODEX_UI's lane; nothing here renders.
//
// Money rules baked in: rewards qualify only on verified membership activation
// (never clicks or applications), start HELD for the program's hold window,
// self-referral is disqualified, qualification is idempotent per
// referral-activation:<memberId>:<paymentId>, and the credit ledger is
// append-only with running balances.
// ---------------------------------------------------------------------------

export const referralsEnabled = () => process.env.RESEARCH_REFERRALS_ENABLED === "true";

// Program economics knobs (V3 section 61), env-configurable with safe defaults.
const MAX_QUALIFIED_PER_MONTH = () => {
  const n = Number(process.env.RESEARCH_REFERRAL_MAX_QUALIFIED_PER_MONTH);
  return Number.isFinite(n) && n > 0 ? n : 20;
};
const VELOCITY_PER_DAY = () => {
  const n = Number(process.env.RESEARCH_REFERRAL_VELOCITY_PER_DAY);
  return Number.isFinite(n) && n > 0 ? n : 10;
};

const IDENTITIES = "referral_identities";
const PROGRAMS = "referral_programs";
const ATTRIBUTIONS = "referral_attributions";
const REWARDS = "referral_rewards";
const LEDGER = "member_credit_ledger";

// Opaque referral codes: crockford-ish base32, no database ids, no vowels that
// spell words, collision-checked on insert.
const CODE_ALPHABET = "23456789BCDFGHJKMNPQRSTVWXZ";
export function generateReferralCode(): string {
  const bytes = crypto.randomBytes(10);
  let code = "";
  for (let i = 0; i < 10; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

export async function createReferralIdentity(input: {
  ownerType: "applicant" | "member" | "ambassador" | "partner";
  ownerId: string;
  ownerEmail: string;
  displayMode?: "anonymous" | "first-name" | "initials" | "custom";
  displayValue?: string | null;
}): Promise<{ id: string; code: string } | null> {
  if (!supabaseConfigured()) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateReferralCode();
    const { data, error } = await getSupabaseAdmin()
      .from(IDENTITIES)
      .insert({
        owner_type: input.ownerType,
        owner_id: input.ownerId,
        owner_email: input.ownerEmail.toLowerCase(),
        code,
        public_display_mode: input.displayMode ?? "anonymous",
        public_display_value: input.displayValue ?? null,
      })
      .select()
      .single();
    if (!error && data) return { id: (data as any).id, code };
    // unique collision: retry with a fresh code; anything else: fail
    if (!String((error as any)?.message ?? "").toLowerCase().includes("duplicate")) break;
  }
  return null;
}

async function getDefaultProgram(): Promise<any | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(PROGRAMS)
    .select("*")
    .eq("enabled", true)
    .eq("program_type", "member")
    .limit(1);
  if (error) return null;
  return (data as any[])?.[0] ?? null;
}

async function getIdentityByCode(code: string): Promise<any | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(IDENTITIES)
    .select("*")
    .eq("code", code)
    .eq("status", "active")
    .maybeSingle();
  if (error) return null;
  return data ?? null;
}

// Review signal: an identity attracting an abnormal burst of attributions is
// flagged for a human (V3 section 71), never auto-penalized.
async function flagUnusualVelocity(identity: any, attributionId: string): Promise<void> {
  const { data } = await getSupabaseAdmin()
    .from(ATTRIBUTIONS)
    .select("id, created_at")
    .eq("referral_identity_id", identity.id);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = ((data as any[]) ?? []).filter(
    (r) => r.created_at && new Date(r.created_at).getTime() >= dayAgo,
  ).length;
  if (recent > VELOCITY_PER_DAY()) {
    await openFraudFlag({
      reason: "unusual-velocity",
      attributionId,
      identityId: identity.id,
      detail: `${recent} attributions for this identity in 24 hours`,
    });
  }
}

// Review signal: the applicant's IP matches the referrer's own application IP.
// Legitimate households exist, so this FLAGS for review only (V3 section 71).
async function flagSharedHousehold(identity: any, attributionId: string, applicantIp: string | null | undefined): Promise<void> {
  if (!applicantIp || applicantIp === "unknown") return;
  if (identity.owner_type !== "member") return;
  const { data: member } = await getSupabaseAdmin()
    .from("research_members")
    .select("application_id")
    .eq("id", identity.owner_id)
    .maybeSingle();
  const applicationId = (member as any)?.application_id;
  if (!applicationId) return;
  const { data: app } = await getSupabaseAdmin()
    .from("research_applications")
    .select("ip")
    .eq("id", applicationId)
    .maybeSingle();
  if ((app as any)?.ip && (app as any).ip === applicantIp) {
    await openFraudFlag({
      reason: "repeated-household",
      attributionId,
      identityId: identity.id,
      detail: "applicant IP matches the referrer's own application IP",
    });
  }
}

// Called from the application submit path. Flag-gated no-op; failures never
// affect the application itself. Bright lines (canonical self-referral, where
// plus-tags and gmail dot variants collapse to one identity, and disposable
// email domains) are recorded as disqualified so they can never qualify later;
// softer signals only open review flags.
export async function linkApplicationToAttribution(input: {
  applicationId: string;
  referralCode: string | null | undefined;
  applicantEmail: string;
  landingPath?: string | null;
  applicantIp?: string | null;
}): Promise<void> {
  try {
    if (!referralsEnabled() || !supabaseConfigured()) return;
    const code = (input.referralCode ?? "").trim();
    if (!code) return;
    const identity = await getIdentityByCode(code);
    if (!identity) return;
    const program = await getDefaultProgram();
    if (!program) return;

    const selfReferral = canonicalizeEmail(String(identity.owner_email)) === canonicalizeEmail(input.applicantEmail);
    const disposable = !selfReferral && isDisposableEmail(input.applicantEmail);
    const disqualificationReason = selfReferral ? "self_referral" : disposable ? "disposable_email" : null;
    const expires = new Date(Date.now() + (program.attribution_days ?? 30) * 24 * 60 * 60 * 1000);
    const { data: inserted, error } = await getSupabaseAdmin()
      .from(ATTRIBUTIONS)
      .insert({
        referral_identity_id: identity.id,
        program_id: program.id,
        application_id: input.applicationId,
        attribution_expires_at: expires.toISOString(),
        landing_path: input.landingPath ?? null,
        applicant_ip: input.applicantIp ?? null,
        status: disqualificationReason ? "disqualified" : "application-submitted",
        disqualification_reason: disqualificationReason,
      })
      .select()
      .single();
    if (error || !inserted) {
      if (error) console.error("[referrals] attribution insert failed:", error.message);
      return;
    }
    await recordReferralEvent({
      eventType: disqualificationReason ? "attribution-disqualified" : "attribution-created",
      attributionId: (inserted as any).id,
      identityId: identity.id,
      actorType: "system",
      reason: disqualificationReason,
    });
    if (disqualificationReason) return;

    await flagUnusualVelocity(identity, (inserted as any).id);
    await flagSharedHousehold(identity, (inserted as any).id, input.applicantIp);
  } catch (err) {
    console.error("[referrals] attribution error:", err);
  }
}

// The idempotent qualification service (V3 section 70). Called ONLY from a
// verified payment/activation event (Phase 5); never from client analytics.
export async function qualifyReferralForMembershipActivation(input: {
  applicationId: string;
  memberId: string;
  paymentId: string;
  activationTimestamp: Date;
}): Promise<{ qualified: boolean; reason: string }> {
  if (!referralsEnabled()) return { qualified: false, reason: "referrals_disabled" };
  if (!supabaseConfigured()) return { qualified: false, reason: "storage_unconfigured" };

  // 1-2. valid attribution inside the window
  const { data: rows, error } = await getSupabaseAdmin()
    .from(ATTRIBUTIONS)
    .select("*")
    .eq("application_id", input.applicationId)
    .limit(1);
  if (error || !rows?.length) return { qualified: false, reason: "no_attribution" };
  const attribution = rows[0] as any;

  if (attribution.status === "disqualified") return { qualified: false, reason: attribution.disqualification_reason || "disqualified" };
  if (attribution.status === "qualified") return { qualified: false, reason: "already_qualified" };
  if (new Date(attribution.attribution_expires_at).getTime() < input.activationTimestamp.getTime()) {
    await getSupabaseAdmin().from(ATTRIBUTIONS).update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", attribution.id);
    return { qualified: false, reason: "attribution_expired" };
  }

  // 3. referrer eligibility (identity still active)
  const { data: identity } = await getSupabaseAdmin()
    .from(IDENTITIES)
    .select("*")
    .eq("id", attribution.referral_identity_id)
    .maybeSingle();
  if (!identity || (identity as any).status !== "active") return { qualified: false, reason: "referrer_ineligible" };

  // 4-5. referred-member eligibility + the REAL self-referral re-check
  // (defense in depth): the activating member must not be the referrer, by
  // member id or by canonical email. Caught here means it slipped past
  // capture, so it is disqualified AND surfaced to the review queue.
  const { data: activatingMember } = await getSupabaseAdmin()
    .from("research_members")
    .select("*")
    .eq("id", input.memberId)
    .maybeSingle();
  const sameId = (identity as any).owner_id === input.memberId;
  const sameEmail = activatingMember
    ? canonicalizeEmail(String((activatingMember as any).email ?? "")) ===
      canonicalizeEmail(String((identity as any).owner_email ?? ""))
    : false;
  if (sameId || sameEmail) {
    await getSupabaseAdmin()
      .from(ATTRIBUTIONS)
      .update({ status: "disqualified", disqualification_reason: "self_referral", updated_at: new Date().toISOString() })
      .eq("id", attribution.id);
    await recordReferralEvent({
      eventType: "qualification-refused",
      attributionId: attribution.id,
      identityId: (identity as any).id,
      actorType: "system",
      reason: "self_referral",
    });
    await openFraudFlag({
      reason: "possible-self-referral",
      attributionId: attribution.id,
      identityId: (identity as any).id,
      detail: sameId
        ? "the activating member IS the referrer"
        : "the activating member's email matches the referrer's canonically",
    });
    return { qualified: false, reason: "self_referral" };
  }

  const { data: program } = await getSupabaseAdmin()
    .from(PROGRAMS)
    .select("*")
    .eq("id", attribution.program_id)
    .maybeSingle();
  if (!program) return { qualified: false, reason: "program_missing" };

  // 6b. monthly cap (V3 section 61, RESEARCH_REFERRAL_MAX_QUALIFIED_PER_MONTH,
  // default 20): at or past the cap, this qualification's rewards are created
  // for REVIEW (pending, which the promoter never touches) instead of held,
  // and the queue gets a velocity flag. Never a silent loss, never auto-pay.
  const { data: priorRewards } = await getSupabaseAdmin()
    .from(REWARDS)
    .select("recipient_type, qualifies_at")
    .eq("recipient_member_id", (identity as any).owner_id);
  const monthAgo = input.activationTimestamp.getTime() - 30 * 24 * 60 * 60 * 1000;
  const priorQualified = ((priorRewards as any[]) ?? []).filter(
    (r) => r.recipient_type === "referrer" && r.qualifies_at && new Date(r.qualifies_at).getTime() >= monthAgo,
  ).length;
  const atCap = priorQualified >= MAX_QUALIFIED_PER_MONTH();

  // 7-9. held rewards for BOTH sides (Give $10 / Get $15), each idempotent by
  // the activation key. A webhook retry duplicates neither.
  const holdDays = (program as any).hold_days ?? 14;
  const availableAt = new Date(input.activationTimestamp.getTime() + holdDays * 24 * 60 * 60 * 1000);
  const rewardStatus = atCap ? "pending" : "held";
  const rewards: Array<Record<string, unknown>> = [
    {
      attribution_id: attribution.id,
      recipient_type: "referrer",
      recipient_member_id: (identity as any).owner_id,
      reward_type: (program as any).referrer_reward_type ?? "credit",
      value_cents: (program as any).referrer_reward_value_cents ?? null,
      currency: (program as any).currency ?? "usd",
      status: rewardStatus,
      idempotency_key: `referral-activation:${input.memberId}:${input.paymentId}:referrer`,
      qualifies_at: input.activationTimestamp.toISOString(),
      available_at: availableAt.toISOString(),
    },
  ];
  const referredType = (program as any).referred_reward_type ?? "none";
  if (referredType !== "none" && (program as any).referred_reward_value_cents) {
    rewards.push({
      attribution_id: attribution.id,
      recipient_type: "referred",
      recipient_member_id: input.memberId,
      reward_type: referredType,
      value_cents: (program as any).referred_reward_value_cents,
      currency: (program as any).currency ?? "usd",
      status: rewardStatus,
      idempotency_key: `referral-activation:${input.memberId}:${input.paymentId}:referred`,
      qualifies_at: input.activationTimestamp.toISOString(),
      available_at: availableAt.toISOString(),
    });
  }
  for (const reward of rewards) {
    const { error: rewardError } = await getSupabaseAdmin().from(REWARDS).insert(reward);
    if (rewardError) {
      // unique violation on the idempotency key = already processed; anything else is a real failure
      if (String(rewardError.message ?? "").toLowerCase().includes("duplicate")) {
        return { qualified: false, reason: "duplicate_activation_event" };
      }
      console.error("[referrals] reward insert failed:", rewardError.message);
      return { qualified: false, reason: "reward_insert_failed" };
    }
  }

  // 10. audit via the attribution state machine + the append-only event trail
  await getSupabaseAdmin()
    .from(ATTRIBUTIONS)
    .update({ status: "qualified", member_id: input.memberId, updated_at: new Date().toISOString() })
    .eq("id", attribution.id);
  await recordReferralEvent({
    eventType: "qualification-succeeded",
    attributionId: attribution.id,
    identityId: (identity as any).id,
    actorType: "system",
    reason: atCap ? "qualified_pending_review" : "qualified",
    detail: { paymentId: input.paymentId, rewardStatus },
  });
  if (atCap) {
    await openFraudFlag({
      reason: "unusual-velocity",
      attributionId: attribution.id,
      identityId: (identity as any).id,
      detail: `monthly qualified-referral cap reached (${priorQualified} in the last 30 days); rewards created pending review`,
    });
    return { qualified: true, reason: "qualified_pending_review" };
  }

  return { qualified: true, reason: "qualified" };
}

// Promote held rewards whose hold window has passed. Idempotent: a reward is
// promoted exactly once (status guard), and each promotion writes exactly one
// append-only ledger entry with the running balance.
export async function promoteHeldRewards(now: Date): Promise<number> {
  if (!referralsEnabled() || !supabaseConfigured()) return 0;
  const { data: rewards, error } = await getSupabaseAdmin()
    .from(REWARDS)
    .select("*")
    .eq("status", "held")
    .limit(100);
  if (error || !rewards?.length) return 0;

  let promoted = 0;
  for (const reward of rewards as any[]) {
    if (!reward.available_at || new Date(reward.available_at).getTime() > now.getTime()) continue;
    // status-guarded update: only one promoter wins
    const { data: updated, error: updateError } = await getSupabaseAdmin()
      .from(REWARDS)
      .update({ status: "available", updated_at: now.toISOString() })
      .eq("id", reward.id)
      .eq("status", "held")
      .select()
      .single();
    if (updateError || !updated) continue;

    const balance = await getLedgerBalance(reward.recipient_member_id);
    const amount = reward.value_cents ?? 0;
    const { error: ledgerError } = await getSupabaseAdmin().from(LEDGER).insert({
      member_id: reward.recipient_member_id,
      entry_type: "referral-earned",
      amount_cents: amount,
      currency: reward.currency ?? "usd",
      referral_reward_id: reward.id,
      balance_after_cents: balance + amount,
      reason: "Referral reward available after hold window",
      actor_type: "system",
    });
    if (ledgerError) console.error("[referrals] ledger insert failed:", ledgerError.message);
    promoted += 1;
  }
  return promoted;
}

// Advance an attribution when its application is approved (visibility only;
// qualification still happens exclusively at verified activation).
export async function markAttributionApproved(applicationId: string): Promise<void> {
  try {
    if (!referralsEnabled() || !supabaseConfigured()) return;
    await getSupabaseAdmin()
      .from(ATTRIBUTIONS)
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("application_id", applicationId)
      .eq("status", "application-submitted");
  } catch (err) {
    console.error("[referrals] attribution approve mark failed:", err);
  }
}

export async function getLedgerBalance(memberId: string): Promise<number> {
  const { data } = await getSupabaseAdmin()
    .from(LEDGER)
    .select("balance_after_cents")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data as any[])?.[0]?.balance_after_cents ?? 0;
}

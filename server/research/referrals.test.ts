import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Referral foundation tests (V3 section 85, unit rows that exist at the
// foundation stage): code opacity/uniqueness, disabled-flag no-op,
// self-referral, attribution window, qualification idempotency, hold ->
// available promotion, and append-only ledger balances.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  tables: {
    referral_programs: [] as any[],
    referral_identities: [] as any[],
    referral_attributions: [] as any[],
    referral_rewards: [] as any[],
    member_credit_ledger: [] as any[],
    referral_events: [] as any[],
    referral_fraud_flags: [] as any[],
    research_members: [] as any[],
    research_applications: [] as any[],
  } as Record<string, any[]>,
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list = state.tables[table];
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    let limitN: number | null = null;
    let orderDesc = false;

    const uniqueViolation = (row: any): boolean => {
      if (table === "referral_rewards" && row.idempotency_key) {
        return list.some((r) => r.idempotency_key === row.idempotency_key);
      }
      if (table === "referral_identities" && row.code) {
        return list.some((r) => r.code === row.code);
      }
      return false;
    };

    const applyFilters = (rows: any[]) => rows.filter((r) => filters.every(([c, v]) => r[c] === v));
    const finish = () => {
      if (mode === "insert") {
        if (uniqueViolation(insertPayload)) {
          return { data: null, error: { message: "duplicate key value violates unique constraint" } };
        }
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...insertPayload };
        list.push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        const targets = applyFilters(list);
        if (!targets.length) return { data: null, error: { message: "no matching row" } };
        Object.assign(targets[0], updatePayload);
        return { data: targets[0], error: null };
      }
      let rows = applyFilters(list);
      if (orderDesc) rows = [...rows].reverse();
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows, error: null };
    };

    const api: any = {
      select: () => api,
      insert: (p: any) => { mode = "insert"; insertPayload = p; return api; },
      update: (p: any) => { mode = "update"; updatePayload = p; return api; },
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      order: () => { orderDesc = true; return api; },
      limit: (n: number) => { limitN = n; return api; },
      maybeSingle: async () => { const r = finish(); const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data; return { data: d, error: null }; },
      single: async () => {
        const r = finish();
        const d = Array.isArray(r.data) ? r.data[0] : r.data;
        return d ? { data: d, error: null } : { data: null, error: r.error ?? { message: "not found" } };
      },
      then: (resolve: any) => resolve(finish()),
    };
    return api;
  }
  return {
    supabaseConfigured: () => true,
    getSupabaseAdmin: () => ({ from: query }),
    getSupabaseAnon: () => { throw new Error("not used"); },
  };
});

import {
  createReferralIdentity,
  generateReferralCode,
  getLedgerBalance,
  linkApplicationToAttribution,
  promoteHeldRewards,
  qualifyReferralForMembershipActivation,
} from "./referrals";
import { applyFraudAction, reverseRewardsForAttribution } from "./fraud";

function seedProgram(overrides: Record<string, unknown> = {}) {
  const program = {
    id: crypto.randomUUID(),
    code: "member-v1",
    name: "Member referrals",
    program_type: "member",
    enabled: true,
    hold_days: 14,
    attribution_days: 30,
    referrer_reward_type: "credit",
    referred_reward_type: "credit",
    referrer_reward_value_cents: 1500,
    referred_reward_value_cents: 1000,
    currency: "usd",
    ...overrides,
  };
  state.tables.referral_programs.push(program);
  return program;
}

function seedIdentity(overrides: Record<string, unknown> = {}) {
  const identity = {
    id: crypto.randomUUID(),
    owner_type: "member",
    owner_id: crypto.randomUUID(),
    owner_email: "referrer@example.com",
    code: generateReferralCode(),
    status: "active",
    ...overrides,
  };
  state.tables.referral_identities.push(identity);
  return identity;
}

beforeEach(() => {
  for (const key of Object.keys(state.tables)) state.tables[key].length = 0;
  process.env.RESEARCH_REFERRALS_ENABLED = "true";
  delete process.env.RESEARCH_REFERRAL_MAX_QUALIFIED_PER_MONTH;
  delete process.env.RESEARCH_REFERRAL_VELOCITY_PER_DAY;
  delete process.env.RESEARCH_DISPOSABLE_DOMAINS;
});

describe("code opacity and uniqueness", () => {
  it("codes are opaque (no uuid fragments) and unique across identities", async () => {
    const a = await createReferralIdentity({ ownerType: "member", ownerId: "owner-a", ownerEmail: "a@example.com" });
    const b = await createReferralIdentity({ ownerType: "member", ownerId: "owner-b", ownerEmail: "b@example.com" });
    expect(a && b).toBeTruthy();
    expect(a!.code).not.toBe(b!.code);
    expect(a!.code).toHaveLength(10);
    expect(a!.code).not.toContain("owner");
    expect(a!.code).not.toContain("-");
  });
});

describe("disabled flag", () => {
  it("captures nothing when RESEARCH_REFERRALS_ENABLED is false", async () => {
    process.env.RESEARCH_REFERRALS_ENABLED = "false";
    seedProgram();
    const identity = seedIdentity();
    await linkApplicationToAttribution({ applicationId: crypto.randomUUID(), referralCode: identity.code, applicantEmail: "new@example.com" });
    expect(state.tables.referral_attributions).toHaveLength(0);
  });

  it("cannot qualify a reward when disabled", async () => {
    process.env.RESEARCH_REFERRALS_ENABLED = "false";
    const result = await qualifyReferralForMembershipActivation({
      applicationId: crypto.randomUUID(),
      memberId: "m1",
      paymentId: "p1",
      activationTimestamp: new Date(),
    });
    expect(result.qualified).toBe(false);
    expect(result.reason).toBe("referrals_disabled");
    expect(state.tables.referral_rewards).toHaveLength(0);
  });
});

describe("self-referral", () => {
  it("is recorded as disqualified and can never qualify", async () => {
    seedProgram();
    const identity = seedIdentity({ owner_email: "same@example.com" });
    const applicationId = crypto.randomUUID();
    await linkApplicationToAttribution({ applicationId, referralCode: identity.code, applicantEmail: "SAME@example.com" });
    expect(state.tables.referral_attributions).toHaveLength(1);
    expect(state.tables.referral_attributions[0].status).toBe("disqualified");
    expect(state.tables.referral_attributions[0].disqualification_reason).toBe("self_referral");

    const result = await qualifyReferralForMembershipActivation({
      applicationId,
      memberId: "m1",
      paymentId: "p1",
      activationTimestamp: new Date(),
    });
    expect(result.qualified).toBe(false);
    expect(state.tables.referral_rewards).toHaveLength(0);
  });
});

describe("qualification", () => {
  async function seedSubmittedAttribution(expiresInDays = 30) {
    seedProgram();
    const identity = seedIdentity();
    const applicationId = crypto.randomUUID();
    await linkApplicationToAttribution({ applicationId, referralCode: identity.code, applicantEmail: "applicant@example.com" });
    if (expiresInDays !== 30) {
      state.tables.referral_attributions[0].attribution_expires_at = new Date(Date.now() + expiresInDays * 86400000).toISOString();
    }
    return { identity, applicationId };
  }

  it("creates HELD rewards for BOTH sides (Give $10, Get $15) and is idempotent per member+payment", async () => {
    const { identity, applicationId } = await seedSubmittedAttribution();
    const activation = new Date();
    const first = await qualifyReferralForMembershipActivation({ applicationId, memberId: "m1", paymentId: "pay-1", activationTimestamp: activation });
    expect(first.qualified).toBe(true);
    expect(state.tables.referral_rewards).toHaveLength(2);
    const referrer = state.tables.referral_rewards.find((r) => r.recipient_type === "referrer");
    const referred = state.tables.referral_rewards.find((r) => r.recipient_type === "referred");
    expect(referrer.status).toBe("held");
    expect(referrer.recipient_member_id).toBe(identity.owner_id);
    expect(referrer.value_cents).toBe(1500);
    expect(referrer.idempotency_key).toBe("referral-activation:m1:pay-1:referrer");
    expect(referred.recipient_member_id).toBe("m1");
    expect(referred.value_cents).toBe(1000);
    expect(referred.idempotency_key).toBe("referral-activation:m1:pay-1:referred");
    expect(new Date(referrer.available_at).getTime()).toBe(activation.getTime() + 14 * 86400000);
    expect(state.tables.referral_attributions[0].status).toBe("qualified");

    // Webhook retry: same member + payment must not create ANY new reward.
    state.tables.referral_attributions[0].status = "activated"; // even if state drifted
    const retry = await qualifyReferralForMembershipActivation({ applicationId, memberId: "m1", paymentId: "pay-1", activationTimestamp: activation });
    expect(retry.qualified).toBe(false);
    expect(retry.reason).toBe("duplicate_activation_event");
    expect(state.tables.referral_rewards).toHaveLength(2);
  });

  it("refuses an expired attribution window", async () => {
    const { applicationId } = await seedSubmittedAttribution(-1);
    const result = await qualifyReferralForMembershipActivation({ applicationId, memberId: "m1", paymentId: "pay-1", activationTimestamp: new Date() });
    expect(result.qualified).toBe(false);
    expect(result.reason).toBe("attribution_expired");
    expect(state.tables.referral_attributions[0].status).toBe("expired");
    expect(state.tables.referral_rewards).toHaveLength(0);
  });

  it("refuses when the referrer identity is no longer active", async () => {
    const { identity, applicationId } = await seedSubmittedAttribution();
    identity.status = "revoked";
    const result = await qualifyReferralForMembershipActivation({ applicationId, memberId: "m1", paymentId: "pay-1", activationTimestamp: new Date() });
    expect(result.qualified).toBe(false);
    expect(result.reason).toBe("referrer_ineligible");
  });
});

describe("hold promotion and ledger", () => {
  it("promotes past-hold rewards exactly once and appends running balances", async () => {
    seedProgram();
    const identity = seedIdentity();
    const applicationId = crypto.randomUUID();
    await linkApplicationToAttribution({ applicationId, referralCode: identity.code, applicantEmail: "applicant@example.com" });
    const activation = new Date(Date.now() - 15 * 86400000); // hold already passed
    await qualifyReferralForMembershipActivation({ applicationId, memberId: "m1", paymentId: "pay-1", activationTimestamp: activation });

    const promoted = await promoteHeldRewards(new Date());
    expect(promoted).toBe(2);
    expect(state.tables.referral_rewards.every((r) => r.status === "available")).toBe(true);
    expect(state.tables.member_credit_ledger).toHaveLength(2);
    expect(await getLedgerBalance(identity.owner_id)).toBe(1500);
    expect(await getLedgerBalance("m1")).toBe(1000);

    // Second run: nothing to promote, no duplicate ledger entries.
    const again = await promoteHeldRewards(new Date());
    expect(again).toBe(0);
    expect(state.tables.member_credit_ledger).toHaveLength(2);
  });

  it("does not promote rewards still inside the hold window", async () => {
    seedProgram();
    const identity = seedIdentity();
    const applicationId = crypto.randomUUID();
    await linkApplicationToAttribution({ applicationId, referralCode: identity.code, applicantEmail: "applicant@example.com" });
    await qualifyReferralForMembershipActivation({ applicationId, memberId: "m1", paymentId: "pay-1", activationTimestamp: new Date() });

    const promoted = await promoteHeldRewards(new Date());
    expect(promoted).toBe(0);
    expect(state.tables.referral_rewards.every((r) => r.status === "held")).toBe(true);
    expect(state.tables.member_credit_ledger).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Fraud controls (V3 section 71).
// ---------------------------------------------------------------------------

describe("canonical self-referral and disposable emails at capture", () => {
  it("catches gmail plus-tag and dot aliases as self-referral", async () => {
    seedProgram();
    const identity = seedIdentity({ owner_email: "referrer@gmail.com" });
    await linkApplicationToAttribution({
      applicationId: crypto.randomUUID(),
      referralCode: identity.code,
      applicantEmail: "r.e.f.errer+promo@gmail.com",
    });
    expect(state.tables.referral_attributions).toHaveLength(1);
    expect(state.tables.referral_attributions[0].status).toBe("disqualified");
    expect(state.tables.referral_attributions[0].disqualification_reason).toBe("self_referral");
  });

  it("disqualifies disposable-domain applicants at capture", async () => {
    seedProgram();
    const identity = seedIdentity();
    await linkApplicationToAttribution({
      applicationId: crypto.randomUUID(),
      referralCode: identity.code,
      applicantEmail: "burner@mailinator.com",
    });
    expect(state.tables.referral_attributions[0].status).toBe("disqualified");
    expect(state.tables.referral_attributions[0].disqualification_reason).toBe("disposable_email");
    const result = await qualifyReferralForMembershipActivation({
      applicationId: state.tables.referral_attributions[0].application_id,
      memberId: "m1",
      paymentId: "p1",
      activationTimestamp: new Date(),
    });
    expect(result.qualified).toBe(false);
    expect(state.tables.referral_rewards).toHaveLength(0);
  });
});

describe("self-referral re-check at qualification (defense in depth)", () => {
  it("refuses when the activating member's email matches the referrer canonically", async () => {
    seedProgram();
    const identity = seedIdentity({ owner_email: "owner@gmail.com" });
    const applicationId = crypto.randomUUID();
    // The capture check passes (different address)...
    await linkApplicationToAttribution({ applicationId, referralCode: identity.code, applicantEmail: "innocent@example.com" });
    expect(state.tables.referral_attributions[0].status).toBe("application-submitted");
    // ...but the member who ACTIVATES is the referrer under an alias.
    state.tables.research_members.push({ id: "m1", email: "o.w.ner+alt@gmail.com", application_id: applicationId });

    const result = await qualifyReferralForMembershipActivation({ applicationId, memberId: "m1", paymentId: "p1", activationTimestamp: new Date() });
    expect(result.qualified).toBe(false);
    expect(result.reason).toBe("self_referral");
    expect(state.tables.referral_attributions[0].status).toBe("disqualified");
    expect(state.tables.referral_rewards).toHaveLength(0);
    expect(state.tables.referral_fraud_flags.some((f) => f.reason === "possible-self-referral")).toBe(true);
  });

  it("refuses when the activating member IS the referrer by id", async () => {
    seedProgram();
    const identity = seedIdentity();
    const applicationId = crypto.randomUUID();
    await linkApplicationToAttribution({ applicationId, referralCode: identity.code, applicantEmail: "someone@example.com" });
    const result = await qualifyReferralForMembershipActivation({
      applicationId,
      memberId: identity.owner_id as string,
      paymentId: "p1",
      activationTimestamp: new Date(),
    });
    expect(result.qualified).toBe(false);
    expect(result.reason).toBe("self_referral");
    expect(state.tables.referral_rewards).toHaveLength(0);
  });
});

describe("monthly qualified cap", () => {
  it("creates rewards PENDING REVIEW (never auto-pays, never silently loses) at the cap", async () => {
    process.env.RESEARCH_REFERRAL_MAX_QUALIFIED_PER_MONTH = "1";
    seedProgram();
    const identity = seedIdentity();
    // One already-qualified referral this month (its hold has passed).
    state.tables.referral_rewards.push({
      id: crypto.randomUUID(),
      recipient_type: "referrer",
      recipient_member_id: identity.owner_id,
      qualifies_at: new Date().toISOString(),
      available_at: new Date(Date.now() - 1000).toISOString(),
      status: "held",
      idempotency_key: "referral-activation:prior:pay:referrer",
    });
    const applicationId = crypto.randomUUID();
    await linkApplicationToAttribution({ applicationId, referralCode: identity.code, applicantEmail: "applicant@example.com" });

    const result = await qualifyReferralForMembershipActivation({ applicationId, memberId: "m2", paymentId: "pay-2", activationTimestamp: new Date() });
    expect(result.qualified).toBe(true);
    expect(result.reason).toBe("qualified_pending_review");
    const created = state.tables.referral_rewards.filter((r) => r.attribution_id);
    expect(created).toHaveLength(2);
    expect(created.every((r) => r.status === "pending")).toBe(true);
    expect(state.tables.referral_fraud_flags.some((f) => f.reason === "unusual-velocity")).toBe(true);

    // The promoter must never touch pending (review) rewards.
    const promoted = await promoteHeldRewards(new Date(Date.now() + 20 * 86400000));
    expect(created.every((r) => r.status === "pending")).toBe(true);
    expect(promoted).toBe(1); // only the seeded prior HELD reward promotes
  });
});

describe("velocity and household review flags at capture", () => {
  it("flags an abnormal attribution burst for review without penalizing", async () => {
    process.env.RESEARCH_REFERRAL_VELOCITY_PER_DAY = "2";
    seedProgram();
    const identity = seedIdentity();
    for (let i = 0; i < 3; i++) {
      await linkApplicationToAttribution({
        applicationId: crypto.randomUUID(),
        referralCode: identity.code,
        applicantEmail: `applicant${i}@example.com`,
      });
    }
    // All three still captured (no auto-penalty)...
    expect(state.tables.referral_attributions.every((a) => a.status === "application-submitted")).toBe(true);
    // ...and the burst is flagged for a human.
    expect(state.tables.referral_fraud_flags.some((f) => f.reason === "unusual-velocity")).toBe(true);
  });

  it("flags a shared-household IP match for review without penalizing", async () => {
    seedProgram();
    const identity = seedIdentity();
    const referrerApplicationId = crypto.randomUUID();
    state.tables.research_members.push({ id: identity.owner_id, email: identity.owner_email, application_id: referrerApplicationId });
    state.tables.research_applications.push({ id: referrerApplicationId, ip: "203.0.113.7" });

    await linkApplicationToAttribution({
      applicationId: crypto.randomUUID(),
      referralCode: identity.code,
      applicantEmail: "housemate@example.com",
      applicantIp: "203.0.113.7",
    });
    expect(state.tables.referral_attributions[0].status).toBe("application-submitted");
    expect(state.tables.referral_fraud_flags.some((f) => f.reason === "repeated-household")).toBe(true);
  });
});

describe("reversal and clawback", () => {
  async function qualifiedAttribution(activationOffsetDays = 0) {
    seedProgram();
    const identity = seedIdentity();
    const applicationId = crypto.randomUUID();
    await linkApplicationToAttribution({ applicationId, referralCode: identity.code, applicantEmail: "applicant@example.com" });
    const activation = new Date(Date.now() + activationOffsetDays * 86400000);
    await qualifyReferralForMembershipActivation({ applicationId, memberId: "m1", paymentId: "pay-1", activationTimestamp: activation });
    return { identity, attributionId: state.tables.referral_attributions[0].id as string };
  }

  it("cancels held rewards without touching the ledger", async () => {
    const { attributionId } = await qualifiedAttribution();
    const result = await reverseRewardsForAttribution({ attributionId, reason: "refund", actorType: "admin", actorId: "admin@x" });
    expect(result.cancelled).toBe(2);
    expect(result.reversed).toBe(0);
    expect(state.tables.referral_rewards.every((r) => r.status === "cancelled")).toBe(true);
    expect(state.tables.member_credit_ledger).toHaveLength(0);
  });

  it("reverses available rewards with compensating negative ledger entries", async () => {
    const { identity, attributionId } = await qualifiedAttribution(-15);
    await promoteHeldRewards(new Date());
    expect(await getLedgerBalance(identity.owner_id)).toBe(1500);

    const result = await reverseRewardsForAttribution({ attributionId, reason: "chargeback", actorType: "admin" });
    expect(result.reversed).toBe(2);
    expect(state.tables.referral_rewards.every((r) => r.status === "reversed")).toBe(true);
    expect(state.tables.referral_rewards.every((r) => r.reversal_reason === "chargeback")).toBe(true);
    // Append-only: 2 earn entries + 2 reversal entries, balances back to zero.
    expect(state.tables.member_credit_ledger).toHaveLength(4);
    expect(await getLedgerBalance(identity.owner_id)).toBe(0);
    expect(await getLedgerBalance("m1")).toBe(0);
  });
});

describe("fraud review queue actions", () => {
  async function flaggedQualifiedCase() {
    process.env.RESEARCH_REFERRAL_MAX_QUALIFIED_PER_MONTH = "1";
    seedProgram();
    const identity = seedIdentity();
    state.tables.referral_rewards.push({
      id: crypto.randomUUID(),
      recipient_type: "referrer",
      recipient_member_id: identity.owner_id,
      qualifies_at: new Date().toISOString(),
      status: "held",
      idempotency_key: "prior",
    });
    const applicationId = crypto.randomUUID();
    await linkApplicationToAttribution({ applicationId, referralCode: identity.code, applicantEmail: "applicant@example.com" });
    await qualifyReferralForMembershipActivation({ applicationId, memberId: "m2", paymentId: "pay-2", activationTimestamp: new Date() });
    const flag = state.tables.referral_fraud_flags.find((f) => f.reason === "unusual-velocity");
    return { identity, flag, attributionId: state.tables.referral_attributions[0].id as string };
  }

  it("clear releases review-pending rewards back to held and resolves the flag", async () => {
    const { flag } = await flaggedQualifiedCase();
    const result = await applyFraudAction({ flagId: flag.id, action: "clear", reason: "reviewed: legitimate activity", adminId: "admin@x" });
    expect(result.ok).toBe(true);
    const created = state.tables.referral_rewards.filter((r) => r.attribution_id);
    expect(created.every((r) => r.status === "held")).toBe(true);
    expect(flag.status).toBe("resolved");
    expect(flag.resolution_reason).toBe("reviewed: legitimate activity");
  });

  it("hold pauses rewards in review and keeps the case open", async () => {
    seedProgram();
    const identity = seedIdentity();
    const applicationId = crypto.randomUUID();
    await linkApplicationToAttribution({ applicationId, referralCode: identity.code, applicantEmail: "applicant@example.com" });
    await qualifyReferralForMembershipActivation({ applicationId, memberId: "m1", paymentId: "p1", activationTimestamp: new Date() });
    state.tables.referral_fraud_flags.push({
      id: crypto.randomUUID(),
      reason: "manual-report",
      status: "open",
      attribution_id: state.tables.referral_attributions[0].id,
    });
    const flag = state.tables.referral_fraud_flags[0];
    const result = await applyFraudAction({ flagId: flag.id, action: "hold", reason: "investigating a report" });
    expect(result.ok).toBe(true);
    expect(state.tables.referral_rewards.every((r) => r.status === "pending")).toBe(true);
    expect(flag.status).toBe("open");
    // Paused rewards never promote.
    const promoted = await promoteHeldRewards(new Date(Date.now() + 20 * 86400000));
    expect(promoted).toBe(0);
  });

  it("disqualify reverses the attribution and its rewards with an audit reason", async () => {
    const { flag, attributionId } = await flaggedQualifiedCase();
    const result = await applyFraudAction({ flagId: flag.id, action: "disqualify", reason: "confirmed duplicate accounts", adminId: "admin@x" });
    expect(result.ok).toBe(true);
    const attribution = state.tables.referral_attributions.find((a) => a.id === attributionId);
    expect(attribution.status).toBe("disqualified");
    expect(attribution.disqualification_reason).toBe("confirmed duplicate accounts");
    const created = state.tables.referral_rewards.filter((r) => r.attribution_id);
    expect(created.every((r) => r.status === "cancelled")).toBe(true);
    expect(flag.status).toBe("resolved");
  });

  it("suspend-referrer pauses the identity so it cannot qualify again", async () => {
    const { identity, flag } = await flaggedQualifiedCase();
    const result = await applyFraudAction({ flagId: flag.id, action: "suspend-referrer", reason: "pattern across accounts" });
    expect(result.ok).toBe(true);
    expect(identity.status).toBe("paused");
    // A later qualification against this identity now refuses.
    const applicationId = crypto.randomUUID();
    state.tables.referral_attributions.push({
      id: crypto.randomUUID(),
      referral_identity_id: identity.id,
      program_id: state.tables.referral_programs[0].id,
      application_id: applicationId,
      attribution_expires_at: new Date(Date.now() + 86400000).toISOString(),
      status: "application-submitted",
    });
    const qual = await qualifyReferralForMembershipActivation({ applicationId, memberId: "m9", paymentId: "p9", activationTimestamp: new Date() });
    expect(qual.qualified).toBe(false);
    expect(qual.reason).toBe("referrer_ineligible");
  });

  it("every attribution decision leaves an append-only event trail", async () => {
    await flaggedQualifiedCase();
    const types = state.tables.referral_events.map((e) => e.event_type);
    expect(types).toContain("attribution-created");
    expect(types).toContain("qualification-succeeded");
    expect(types).toContain("fraud-flag-opened");
  });
});

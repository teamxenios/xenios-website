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

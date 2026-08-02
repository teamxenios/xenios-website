import crypto from "crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FRAUD_ACTIONS } from "@shared/research/referral-types";

// ---------------------------------------------------------------------------
// P0: the referral fraud reviewer surface writes the member credit ledger, so
// it must fail closed while RESEARCH_REFERRALS_ENABLED is off.
//
// These tests drive the REAL fraud.ts and fraud-admin.ts. Nothing about the
// gate is mocked. What is faked is the store underneath, so that "no money
// moved" can be asserted directly: every insert and update is a spy, and the
// two tables that matter (member_credit_ledger and referral_rewards) have
// their own spies that must never be called while the capability is off.
// ---------------------------------------------------------------------------

const db = vi.hoisted(() => ({
  tables: {
    referral_fraud_flags: [] as any[],
    referral_rewards: [] as any[],
    referral_attributions: [] as any[],
    referral_identities: [] as any[],
    referral_events: [] as any[],
    member_credit_ledger: [] as any[],
  } as Record<string, any[]>,
  // Table-scoped write spies. The money assertions read these.
  ledgerInsert: vi.fn(),
  rewardInsert: vi.fn(),
  rewardUpdate: vi.fn(),
  // Everything else, for the wider "nothing at all happened" assertions.
  anyInsert: vi.fn(),
  anyUpdate: vi.fn(),
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list = db.tables[table] ?? (db.tables[table] = []);
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    let limitN: number | null = null;
    let orderDesc = false;

    const applyFilters = (rows: any[]) => rows.filter((r) => filters.every(([c, v]) => r[c] === v));
    const finish = () => {
      if (mode === "insert") {
        db.anyInsert(table, insertPayload);
        if (table === "member_credit_ledger") db.ledgerInsert(insertPayload);
        if (table === "referral_rewards") db.rewardInsert(insertPayload);
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...insertPayload };
        list.push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        // Spy on the ATTEMPT, before any row matching, so a mutation that
        // matched nothing is still visible as a mutation that was tried.
        db.anyUpdate(table, updatePayload);
        if (table === "referral_rewards") db.rewardUpdate(updatePayload);
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
      maybeSingle: async () => {
        const r = finish();
        const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data;
        return { data: d, error: null };
      },
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

const auth = vi.hoisted(() => ({ adminEmail: null as string | null }));

vi.mock("../routes", () => ({
  requireSupabaseAdmin(req: any, res: any, next: any) {
    if (!auth.adminEmail) return res.status(401).json({ ok: false, message: "Admin sign-in required." });
    req.adminEmail = auth.adminEmail;
    next();
  },
}));

import {
  applyFraudAction,
  openFraudFlag,
  recordReferralEvent,
  reverseRewardsForAttribution,
} from "./fraud";
import { registerReferralFraudAdmin } from "./fraud-admin";

// --- fixtures ---------------------------------------------------------------

function seedCase(rewardStatuses: string[]) {
  const identity = {
    id: crypto.randomUUID(),
    owner_type: "member",
    owner_id: crypto.randomUUID(),
    owner_email: "referrer@example.com",
    code: "AAAAAAAAAA",
    status: "active",
  };
  db.tables.referral_identities.push(identity);

  const attribution = {
    id: crypto.randomUUID(),
    referral_identity_id: identity.id,
    application_id: crypto.randomUUID(),
    status: "qualified",
    disqualification_reason: null,
  };
  db.tables.referral_attributions.push(attribution);

  for (const status of rewardStatuses) {
    db.tables.referral_rewards.push({
      id: crypto.randomUUID(),
      attribution_id: attribution.id,
      recipient_type: "referrer",
      recipient_member_id: identity.owner_id,
      reward_type: "credit",
      value_cents: 1500,
      currency: "usd",
      status,
    });
  }

  const flag = {
    id: crypto.randomUUID(),
    reason: "unusual-velocity",
    status: "open",
    attribution_id: attribution.id,
    identity_id: identity.id,
    resolution_action: null,
    resolution_reason: null,
    resolved_by: null,
    resolved_at: null,
  };
  db.tables.referral_fraud_flags.push(flag);

  return { identity, attribution, flag };
}

function rewardStatuses(): string[] {
  return db.tables.referral_rewards.map((r) => r.status);
}

/** The single assertion that matters: no money moved and no reward changed. */
function expectNoMoneyPathTouched() {
  expect(db.ledgerInsert).not.toHaveBeenCalled();
  expect(db.rewardInsert).not.toHaveBeenCalled();
  expect(db.rewardUpdate).not.toHaveBeenCalled();
  expect(db.tables.member_credit_ledger).toHaveLength(0);
}

function makeAdminApp() {
  const app = express();
  app.use(express.json());
  registerReferralFraudAdmin(app);
  return app;
}

// A refused action logs. Captured rather than printed, so the refusal-log
// assertions below read the calls instead of the test output being flooded.
let warned: ReturnType<typeof vi.spyOn>;

function warnLines(): string[] {
  return warned.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  for (const key of Object.keys(db.tables)) db.tables[key].length = 0;
  db.ledgerInsert.mockClear();
  db.rewardInsert.mockClear();
  db.rewardUpdate.mockClear();
  db.anyInsert.mockClear();
  db.anyUpdate.mockClear();
  auth.adminEmail = null;
  delete process.env.RESEARCH_REFERRALS_ENABLED;
  warned = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warned.mockRestore();
  delete process.env.RESEARCH_REFERRALS_ENABLED;
});

// ---------------------------------------------------------------------------

describe("capability OFF: every fraud entry point fails closed", () => {
  it("refuses all seven reviewer actions and writes nothing to the ledger or the rewards", async () => {
    for (const action of FRAUD_ACTIONS) {
      for (const key of Object.keys(db.tables)) db.tables[key].length = 0;
      const { flag, identity } = seedCase(["held", "pending", "available"]);

      const result = await applyFraudAction({
        flagId: flag.id,
        action,
        reason: `attempted ${action} while the program is off`,
        adminId: "admin@xeniostechnology.com",
      });

      expect(result.ok).toBe(false);
      expect((result as { code?: string }).code).toBe("referrals_disabled");
      // The flag itself is untouched, so the case is not silently resolved.
      expect(db.tables.referral_fraud_flags[0].status).toBe("open");
      expect(db.tables.referral_fraud_flags[0].resolution_action).toBeNull();
      // Reward statuses are exactly as seeded.
      expect(rewardStatuses().sort()).toEqual(["available", "held", "pending"]);
      // The referrer identity is not suspended either.
      expect(db.tables.referral_identities.find((i) => i.id === identity.id)!.status).toBe("active");
      expect(db.tables.referral_events).toHaveLength(0);
      expectNoMoneyPathTouched();
    }
  });

  it("reverseRewardsForAttribution writes no compensating negative ledger entry", async () => {
    const { attribution } = seedCase(["available", "redeemed", "held", "pending"]);

    const result = await reverseRewardsForAttribution({
      attributionId: attribution.id,
      reason: "chargeback",
      actorType: "admin",
      actorId: "admin@xeniostechnology.com",
    });

    expect(result).toEqual({ cancelled: 0, reversed: 0 });
    expect(rewardStatuses().sort()).toEqual(["available", "held", "pending", "redeemed"]);
    expectNoMoneyPathTouched();
  });

  it("the held -> pending flip that steers the promotion cron cannot happen", async () => {
    // hold is the action that pauses a held reward so the 5-minute
    // promoteHeldRewards cron cannot mint it; clear is the action that releases
    // a paused reward back into the cron's path. Neither may move while the
    // program is off, because both decide what the cron later turns into
    // positive member credit.
    const held = seedCase(["held"]);
    const holdResult = await applyFraudAction({
      flagId: held.flag.id,
      action: "hold",
      reason: "pause this while the program is off",
      adminId: "admin@xeniostechnology.com",
    });
    expect(holdResult.ok).toBe(false);
    expect(rewardStatuses()).toEqual(["held"]);
    expect(db.rewardUpdate).not.toHaveBeenCalled();

    for (const key of Object.keys(db.tables)) db.tables[key].length = 0;
    db.rewardUpdate.mockClear();

    const paused = seedCase(["pending"]);
    const clearResult = await applyFraudAction({
      flagId: paused.flag.id,
      action: "clear",
      reason: "release this while the program is off",
      adminId: "admin@xeniostechnology.com",
    });
    expect(clearResult.ok).toBe(false);
    expect(rewardStatuses()).toEqual(["pending"]);
    expect(db.rewardUpdate).not.toHaveBeenCalled();
    expectNoMoneyPathTouched();
  });

  it("openFraudFlag creates no flag row", async () => {
    const id = await openFraudFlag({ reason: "manual-report", detail: "reported while the program is off" });
    expect(id).toBeNull();
    expect(db.tables.referral_fraud_flags).toHaveLength(0);
    expect(db.anyInsert).not.toHaveBeenCalled();
  });

  it("recordReferralEvent writes no event row", async () => {
    await recordReferralEvent({ eventType: "fraud-action-clear", actorType: "admin", actorId: "admin@x" });
    expect(db.tables.referral_events).toHaveLength(0);
    expect(db.anyInsert).not.toHaveBeenCalled();
  });
});

describe("capability OFF: a refused action leaves a log line, and only a log line", () => {
  // Without this, an admin attempting money moves during a capability-off
  // window produces zero rows AND zero log lines, so the attempts are
  // invisible. The log is the only trace, because recording a row would be a
  // referral-subsystem write while the subsystem is off.
  it("warns with the action and the flag id while still writing nothing", async () => {
    const { flag } = seedCase(["held", "available"]);

    const result = await applyFraudAction({
      flagId: flag.id,
      action: "reverse-reward",
      reason: "attempted while the program is off",
      adminId: "admin@xeniostechnology.com",
    });

    expect(result.ok).toBe(false);
    const lines = warnLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[referral fraud]");
    expect(lines[0]).toContain("reverse-reward");
    expect(lines[0]).toContain(flag.id);

    // Log only. Nothing was inserted or updated anywhere, so the fail-closed
    // property is intact and observability did not weaken it.
    expect(db.anyInsert).not.toHaveBeenCalled();
    expect(db.anyUpdate).not.toHaveBeenCalled();
    expect(db.tables.referral_events).toHaveLength(0);
    expect(db.tables.referral_fraud_flags[0].status).toBe("open");
    expectNoMoneyPathTouched();
  });

  it("logs no email, no reviewer reason text and no ledger amount", async () => {
    const { flag } = seedCase(["available"]);

    await applyFraudAction({
      flagId: flag.id,
      action: "disqualify",
      reason: "member jane.doe@example.com reported this",
      adminId: "admin@xeniostechnology.com",
    });

    const line = warnLines()[0];
    expect(line).not.toContain("admin@xeniostechnology.com");
    expect(line).not.toContain("jane.doe@example.com");
    expect(line).not.toContain("referrer@example.com");
    expect(line).not.toContain("1500");
  });

  it("logs every repeated attempt, so a run of attempts is visible as a run", async () => {
    const { flag } = seedCase(["held", "available"]);
    const attempts: Array<"disqualify" | "reverse-reward"> = [
      "disqualify",
      "reverse-reward",
      "disqualify",
    ];

    for (const action of attempts) {
      await applyFraudAction({
        flagId: flag.id,
        action,
        reason: "attempted while the program is off",
        adminId: "admin@xeniostechnology.com",
      });
    }

    expect(warnLines()).toHaveLength(3);
    expect(warnLines().filter((l) => l.includes("disqualify"))).toHaveLength(2);
    expectNoMoneyPathTouched();
  });

  it("the admin route's refusal is logged too", async () => {
    auth.adminEmail = "admin@xeniostechnology.com";
    const { flag } = seedCase(["available"]);

    const res = await request(makeAdminApp())
      .post(`/api/admin/research/referral-fraud/${flag.id}/action`)
      .send({ action: "disqualify", reason: "confirmed duplicate accounts" });

    expect(res.status).toBe(503);
    expect(warnLines().some((l) => l.includes("disqualify") && l.includes(flag.id))).toBe(true);
    expectNoMoneyPathTouched();
  });
});

describe("capability ON: an applied action is not logged as a refusal", () => {
  it("stays silent when the action actually runs", async () => {
    process.env.RESEARCH_REFERRALS_ENABLED = "true";
    const { flag } = seedCase(["held"]);

    const result = await applyFraudAction({
      flagId: flag.id,
      action: "hold",
      reason: "investigating a report",
      adminId: "admin@xeniostechnology.com",
    });

    expect(result.ok).toBe(true);
    expect(warnLines()).toHaveLength(0);
  });
});

describe("capability OFF with a real admin principal: the capability gate, not the auth gate, refuses", () => {
  it("the action route answers 401 without an admin and 503 referrals_disabled with one", async () => {
    const { flag } = seedCase(["held", "available"]);
    const app = makeAdminApp();
    const body = { action: "disqualify", reason: "confirmed duplicate accounts" };

    // No admin: the auth gate stops it first.
    auth.adminEmail = null;
    const anonymous = await request(app).post(`/api/admin/research/referral-fraud/${flag.id}/action`).send(body);
    expect(anonymous.status).toBe(401);

    // A real admin principal gets all the way past auth and is refused anyway.
    auth.adminEmail = "admin@xeniostechnology.com";
    const authorized = await request(app).post(`/api/admin/research/referral-fraud/${flag.id}/action`).send(body);
    expect(authorized.status).toBe(503);
    expect(authorized.body.ok).toBe(false);
    expect(authorized.body.code).toBe("referrals_disabled");

    expect(rewardStatuses().sort()).toEqual(["available", "held"]);
    expect(db.tables.referral_attributions[0].status).toBe("qualified");
    expectNoMoneyPathTouched();
  });

  it("the manual-report route refuses for an admin instead of reporting a phantom success", async () => {
    auth.adminEmail = "admin@xeniostechnology.com";
    const res = await request(makeAdminApp())
      .post("/api/admin/research/referral-fraud/report")
      .send({ detail: "a member reported a suspicious referral" });

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("referrals_disabled");
    expect(db.tables.referral_fraud_flags).toHaveLength(0);
    expectNoMoneyPathTouched();
  });
});

describe("only the exact string \"true\" enables the capability", () => {
  // referralsEnabled() is process.env.RESEARCH_REFERRALS_ENABLED === "true".
  // Anything else, including the near misses people actually type, fails closed.
  const refusingValues: Array<[string, string | undefined]> = [
    ["unset", undefined],
    ["empty string", ""],
    ["1", "1"],
    ["TRUE", "TRUE"],
    ["True", "True"],
    ["leading and trailing spaces", " true "],
    ["trailing newline", "true\n"],
    ["false", "false"],
    ["yes", "yes"],
    ["on", "on"],
  ];

  for (const [label, value] of refusingValues) {
    it(`refuses when the flag is ${label}`, async () => {
      if (value === undefined) delete process.env.RESEARCH_REFERRALS_ENABLED;
      else process.env.RESEARCH_REFERRALS_ENABLED = value;

      const { flag } = seedCase(["held", "available"]);
      const result = await applyFraudAction({
        flagId: flag.id,
        action: "disqualify",
        reason: "attempted with a near-miss flag value",
        adminId: "admin@xeniostechnology.com",
      });

      expect(result.ok).toBe(false);
      expect((result as { code?: string }).code).toBe("referrals_disabled");
      expect(rewardStatuses().sort()).toEqual(["available", "held"]);
      expectNoMoneyPathTouched();
    });
  }

  it("accepts the exact string \"true\" and only then acts", async () => {
    process.env.RESEARCH_REFERRALS_ENABLED = "true";
    const { flag } = seedCase(["held"]);
    const result = await applyFraudAction({
      flagId: flag.id,
      action: "hold",
      reason: "investigating a report",
      adminId: "admin@xeniostechnology.com",
    });
    expect(result.ok).toBe(true);
    expect(rewardStatuses()).toEqual(["pending"]);
  });
});

describe("capability ON: the reviewer surface still behaves exactly as before", () => {
  beforeEach(() => {
    process.env.RESEARCH_REFERRALS_ENABLED = "true";
  });

  it("clear releases review-pending rewards back to held and resolves the flag", async () => {
    const { flag } = seedCase(["pending"]);
    const result = await applyFraudAction({
      flagId: flag.id,
      action: "clear",
      reason: "reviewed: legitimate activity",
      adminId: "admin@xeniostechnology.com",
    });
    expect(result).toEqual({ ok: true, status: "resolved" });
    expect(rewardStatuses()).toEqual(["held"]);
    expect(db.tables.referral_fraud_flags[0].status).toBe("resolved");
    expect(db.tables.referral_fraud_flags[0].resolution_reason).toBe("reviewed: legitimate activity");
  });

  it("hold pauses held rewards and keeps the case open", async () => {
    const { flag } = seedCase(["held"]);
    const result = await applyFraudAction({
      flagId: flag.id,
      action: "hold",
      reason: "investigating a report",
    });
    expect(result).toEqual({ ok: true, status: "open" });
    expect(rewardStatuses()).toEqual(["pending"]);
    expect(db.tables.referral_fraud_flags[0].status).toBe("open");
  });

  it("disqualify reverses the attribution and writes the compensating negative ledger entry", async () => {
    const { flag } = seedCase(["available"]);
    const result = await applyFraudAction({
      flagId: flag.id,
      action: "disqualify",
      reason: "confirmed duplicate accounts",
      adminId: "admin@xeniostechnology.com",
    });
    expect(result).toEqual({ ok: true, status: "resolved" });
    expect(db.tables.referral_attributions[0].status).toBe("disqualified");
    expect(rewardStatuses()).toEqual(["reversed"]);
    expect(db.tables.member_credit_ledger).toHaveLength(1);
    expect(db.tables.member_credit_ledger[0].amount_cents).toBe(-1500);
    expect(db.tables.member_credit_ledger[0].entry_type).toBe("reversal");
    expect(db.ledgerInsert).toHaveBeenCalledTimes(1);
  });

  it("reverseRewardsForAttribution cancels held rewards and reverses available ones", async () => {
    const { attribution } = seedCase(["held", "available"]);
    const result = await reverseRewardsForAttribution({
      attributionId: attribution.id,
      reason: "chargeback",
      actorType: "admin",
      actorId: "admin@xeniostechnology.com",
    });
    expect(result).toEqual({ cancelled: 1, reversed: 1 });
    expect(rewardStatuses().sort()).toEqual(["cancelled", "reversed"]);
    expect(db.tables.member_credit_ledger).toHaveLength(1);
    expect(db.tables.member_credit_ledger[0].amount_cents).toBe(-1500);
  });

  it("suspend-referrer pauses the identity", async () => {
    const { flag, identity } = seedCase(["held"]);
    const result = await applyFraudAction({
      flagId: flag.id,
      action: "suspend-referrer",
      reason: "pattern across accounts",
    });
    expect(result).toEqual({ ok: true, status: "resolved" });
    expect(db.tables.referral_identities.find((i) => i.id === identity.id)!.status).toBe("paused");
  });

  it("openFraudFlag and recordReferralEvent write their rows again", async () => {
    const id = await openFraudFlag({ reason: "manual-report", detail: "a member reported this" });
    expect(id).toBeTruthy();
    expect(db.tables.referral_fraud_flags).toHaveLength(1);

    await recordReferralEvent({ eventType: "fraud-action-clear", actorType: "admin", actorId: "admin@x" });
    // one event from openFraudFlag ("fraud-flag-opened") plus this one
    expect(db.tables.referral_events).toHaveLength(2);
  });

  it("the admin action route still returns 404 for an unknown flag, not the capability refusal", async () => {
    auth.adminEmail = "admin@xeniostechnology.com";
    const res = await request(makeAdminApp())
      .post(`/api/admin/research/referral-fraud/${crypto.randomUUID()}/action`)
      .send({ action: "clear", reason: "reviewed: legitimate activity" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBeUndefined();
  });

  it("the admin action route applies a real action end to end", async () => {
    auth.adminEmail = "admin@xeniostechnology.com";
    const { flag } = seedCase(["available"]);
    const res = await request(makeAdminApp())
      .post(`/api/admin/research/referral-fraud/${flag.id}/action`)
      .send({ action: "disqualify", reason: "confirmed duplicate accounts" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, status: "resolved" });
    expect(db.tables.member_credit_ledger).toHaveLength(1);
    expect(db.tables.member_credit_ledger[0].actor_id).toBe("admin@xeniostechnology.com");
  });

  it("the manual-report route opens a flag again", async () => {
    auth.adminEmail = "admin@xeniostechnology.com";
    const res = await request(makeAdminApp())
      .post("/api/admin/research/referral-fraud/report")
      .send({ detail: "a member reported a suspicious referral" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.flagId).toBeTruthy();
    expect(db.tables.referral_fraud_flags).toHaveLength(1);
  });
});

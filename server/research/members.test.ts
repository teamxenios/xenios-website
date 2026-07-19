import crypto from "crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Member claiming + auth + the CODEX_UI contract endpoints. The claim
// credential is the signed status token (delivered by email); an email match
// or a guessed id must never open an account.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  tables: {
    research_applications: [] as any[],
    research_members: [] as any[],
    referral_identities: [] as any[],
    referral_attributions: [] as any[],
    referral_rewards: [] as any[],
    member_credit_ledger: [] as any[],
    referral_programs: [] as any[],
  } as Record<string, any[]>,
  auth: {
    createUser: vi.fn(async (input: any) => ({ data: { user: { id: crypto.randomUUID(), email: input.email } }, error: null })),
    getUser: vi.fn(async (jwt: string) =>
      jwt === "good-jwt"
        ? { data: { user: { id: "auth-1", email: "member@example.com" } }, error: null }
        : { data: { user: null }, error: { message: "invalid" } },
    ),
  },
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list = state.tables[table];
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    let limitN: number | null = null;
    const applyFilters = (rows: any[]) => rows.filter((r) => filters.every(([c, v]) => r[c] === v));
    const finish = () => {
      if (mode === "insert") {
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...insertPayload };
        list.push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        const targets = applyFilters(list);
        if (!targets.length) return { data: null, error: { message: "no rows" } };
        Object.assign(targets[0], updatePayload);
        return { data: targets[0], error: null };
      }
      let rows = applyFilters(list);
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows, error: null };
    };
    const api: any = {
      select: () => api,
      insert: (p: any) => { mode = "insert"; insertPayload = p; return api; },
      update: (p: any) => { mode = "update"; updatePayload = p; return api; },
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      order: () => api,
      limit: (n: number) => { limitN = n; return api; },
      maybeSingle: async () => { const r = finish(); const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data; return { data: d, error: null }; },
      single: async () => {
        const r = finish();
        const d = Array.isArray(r.data) ? r.data[0] : r.data;
        return d ? { data: d, error: null } : { data: null, error: { message: "not found" } };
      },
      then: (resolve: any) => resolve(finish()),
    };
    return api;
  }
  return {
    supabaseConfigured: () => true,
    getSupabaseAdmin: () => ({ from: query, auth: { admin: { createUser: state.auth.createUser } } }),
    getSupabaseAnon: () => ({ auth: { getUser: state.auth.getUser } }),
  };
});

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import { makeStatusToken } from "./membership";
import { registerMemberApi } from "./members";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerMemberApi(app);
  return app;
}

let ipCounter = 0;
const uniqueIp = () => `10.8.0.${(ipCounter++ % 250) + 1}`;

function seedApplication(overrides: Record<string, unknown> = {}) {
  const row = {
    id: crypto.randomUUID(),
    email: "member@example.com",
    first_name: "Avery",
    last_name: "Member",
    status: "approved_pending_payment",
    submitted_at: new Date().toISOString(),
    ...overrides,
  };
  state.tables.research_applications.push(row);
  return row;
}

beforeEach(() => {
  for (const key of Object.keys(state.tables)) state.tables[key].length = 0;
  vi.clearAllMocks();
  delete process.env.RESEARCH_REFERRALS_ENABLED;
});

describe("account claiming", () => {
  it("rejects an invalid token", async () => {
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: "aaaa.bbbb.cccc", password: "long-enough-password" });
    expect(res.status).toBe(401);
    expect(state.auth.createUser).not.toHaveBeenCalled();
  });

  it("refuses to open an account before approval", async () => {
    const app = seedApplication({ status: "under_review" });
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: makeStatusToken(app.id), password: "long-enough-password" });
    expect(res.status).toBe(409);
    expect(state.tables.research_members).toHaveLength(0);
  });

  it("claims an approved application: confirmed auth user + member row", async () => {
    const app = seedApplication();
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: makeStatusToken(app.id), password: "long-enough-password" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(state.auth.createUser).toHaveBeenCalledWith({ email: "member@example.com", password: "long-enough-password", email_confirm: true });
    expect(state.tables.research_members).toHaveLength(1);
    expect(state.tables.research_members[0].status).toBe("pending_activation");
  });

  it("rejects a second claim for the same email", async () => {
    const app = seedApplication();
    state.tables.research_members.push({ id: "m1", application_id: app.id, auth_user_id: "auth-1", email: app.email, first_name: "Avery", status: "pending_activation", created_at: new Date().toISOString() });
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: makeStatusToken(app.id), password: "long-enough-password" });
    expect(res.status).toBe(409);
    expect(state.auth.createUser).not.toHaveBeenCalled();
  });
});

describe("member session guard", () => {
  function seedMember() {
    const app = seedApplication();
    state.tables.research_members.push({ id: "m1", application_id: app.id, auth_user_id: "auth-1", email: "member@example.com", first_name: "Avery", status: "pending_activation", created_at: new Date().toISOString() });
    return app;
  }

  it("401 without a bearer token, 401 with a bad one", async () => {
    seedMember();
    const app = makeApp();
    expect((await request(app).get("/api/research/member/me")).status).toBe(401);
    expect((await request(app).get("/api/research/member/me").set("Authorization", "Bearer bad-jwt")).status).toBe(401);
  });

  it("403 when the auth user has no membership", async () => {
    // valid jwt but no member row
    const res = await request(makeApp()).get("/api/research/member/me").set("Authorization", "Bearer good-jwt");
    expect(res.status).toBe(403);
  });

  it("returns the member view for a valid session", async () => {
    seedMember();
    const res = await request(makeApp()).get("/api/research/member/me").set("Authorization", "Bearer good-jwt");
    expect(res.status).toBe(200);
    expect(res.body.member.firstName).toBe("Avery");
    expect(res.body.member.applicationStatus).toBe("approved_pending_payment");
  });
});

describe("CODEX_UI contracts", () => {
  function seedMemberWithReferrals() {
    const app = seedApplication();
    state.tables.research_members.push({ id: "m1", application_id: app.id, auth_user_id: "auth-1", email: "member@example.com", first_name: "Avery", status: "active", created_at: new Date().toISOString() });
    const identity = { id: "rid-1", owner_type: "member", owner_id: "owner-1", owner_email: "member@example.com", code: "XK7TESTCODE", status: "active" };
    state.tables.referral_identities.push(identity);
    state.tables.referral_attributions.push(
      { id: "a1", referral_identity_id: "rid-1", status: "application-submitted" },
      { id: "a2", referral_identity_id: "rid-1", status: "qualified" },
      { id: "a3", referral_identity_id: "rid-1", status: "disqualified" },
    );
    state.tables.referral_rewards.push({ id: "rw1", recipient_member_id: "owner-1", status: "held", value_cents: 1500 });
    state.tables.member_credit_ledger.push({ member_id: "owner-1", balance_after_cents: 1000, created_at: new Date().toISOString() });
    return identity;
  }

  it("referral dashboard: flags off -> disabled zeros, never an error", async () => {
    seedMemberWithReferrals();
    const res = await request(makeApp()).get("/api/research/member/referrals").set("Authorization", "Bearer good-jwt");
    expect(res.status).toBe(200);
    expect(res.body.referrals).toEqual({
      enabled: false,
      code: null,
      counts: { visits: 0, applications: 0, qualified: 0 },
      creditAvailableCents: 0,
      creditPendingCents: 0,
    });
  });

  it("referral dashboard: flags on -> aggregates only, no invitee data anywhere", async () => {
    process.env.RESEARCH_REFERRALS_ENABLED = "true";
    seedMemberWithReferrals();
    const res = await request(makeApp()).get("/api/research/member/referrals").set("Authorization", "Bearer good-jwt");
    expect(res.status).toBe(200);
    expect(res.body.referrals.enabled).toBe(true);
    expect(res.body.referrals.code).toBe("XK7TESTCODE");
    expect(res.body.referrals.counts).toEqual({ visits: 3, applications: 2, qualified: 1 });
    expect(res.body.referrals.creditAvailableCents).toBe(1000);
    expect(res.body.referrals.creditPendingCents).toBe(1500);
    // privacy: no emails, ids, or applicant fields in the payload
    expect(JSON.stringify(res.body)).not.toMatch(/@example\.com|application_id|rid-1|owner-1/);
  });

  it("auto-issues a referral identity for an ACTIVE member on first dashboard access", async () => {
    process.env.RESEARCH_REFERRALS_ENABLED = "true";
    // active member, program present, NO identity seeded
    const app = seedApplication();
    state.tables.research_members.push({ id: "m1", application_id: app.id, auth_user_id: "auth-1", email: "member@example.com", first_name: "Avery", status: "active", created_at: new Date().toISOString() });
    state.tables.referral_programs.push({ id: "p1", code: "member-v1", program_type: "member", enabled: true });
    const res = await request(makeApp()).get("/api/research/member/referrals").set("Authorization", "Bearer good-jwt");
    expect(res.status).toBe(200);
    expect(res.body.referrals.enabled).toBe(true);
    expect(res.body.referrals.eligible).toBe(true);
    expect(res.body.referrals.code).toBeTruthy();
    expect(state.tables.referral_identities).toHaveLength(1);
    expect(state.tables.referral_identities[0].owner_id).toBe("m1");
  });

  it("a pending member gets no code and eligible=false", async () => {
    process.env.RESEARCH_REFERRALS_ENABLED = "true";
    const app = seedApplication();
    state.tables.research_members.push({ id: "m1", application_id: app.id, auth_user_id: "auth-1", email: "member@example.com", first_name: "Avery", status: "pending_activation", created_at: new Date().toISOString() });
    const res = await request(makeApp()).get("/api/research/member/referrals").set("Authorization", "Bearer good-jwt");
    expect(res.status).toBe(200);
    expect(res.body.referrals.code).toBeNull();
    expect(res.body.referrals.eligible).toBe(false);
    expect(state.tables.referral_identities).toHaveLength(0);
  });

  it("invite validation: flag off -> invalid; active code -> valid; never referrer identity", async () => {
    const identity = seedMemberWithReferrals();
    const app = makeApp();
    const off = await request(app).get(`/api/research/invite/${identity.code}`);
    expect(off.body.invitation).toEqual({ valid: false });

    process.env.RESEARCH_REFERRALS_ENABLED = "true";
    const on = await request(app).get(`/api/research/invite/${identity.code}`);
    expect(on.body.invitation).toEqual({ valid: true, code: identity.code });
    expect(JSON.stringify(on.body)).not.toMatch(/member@example\.com|owner/);

    const unknown = await request(app).get("/api/research/invite/NOSUCHCODE1");
    expect(unknown.body.invitation).toEqual({ valid: false });
  });
});

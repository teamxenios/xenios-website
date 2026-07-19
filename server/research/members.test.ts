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
    research_notification_outbox: [] as any[],
    research_notification_attempts: [] as any[],
    referral_identities: [] as any[],
    referral_attributions: [] as any[],
    referral_rewards: [] as any[],
    member_credit_ledger: [] as any[],
    referral_programs: [] as any[],
  } as Record<string, any[]>,
  failMemberInsertWith: null as string | null,
  authUsers: [] as Array<{ id: string; email: string }>,
  auth: {
    createUser: vi.fn(async (input: any) => {
      if (state.authUsers.some((u) => u.email === input.email)) {
        return { data: { user: null }, error: { message: "A user with this email address has already been registered" } };
      }
      const user = { id: crypto.randomUUID(), email: input.email };
      state.authUsers.push(user);
      return { data: { user }, error: null };
    }),
    deleteUser: vi.fn(async (id: string) => {
      state.authUsers = state.authUsers.filter((u) => u.id !== id);
      return { data: null, error: null };
    }),
    updateUserById: vi.fn(async (_id: string, _attrs: any) => ({ data: { user: { id: _id } }, error: null })),
    listUsers: vi.fn(async () => ({ data: { users: state.authUsers }, error: null })),
    getUser: vi.fn(async (jwt: string) =>
      jwt === "good-jwt"
        ? { data: { user: { id: "auth-1", email: "member@example.com" } }, error: null }
        : { data: { user: null }, error: { message: "invalid" } },
    ),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
  },
}));

const emails = vi.hoisted(() => ({
  sendApplicationReceived: vi.fn(async () => true),
  sendStatusLink: vi.fn(async () => true),
  sendInternalApplicationAlert: vi.fn(async () => true),
  sendApplicationApproved: vi.fn(async () => true),
  sendApplicationDeclined: vi.fn(async () => true),
  sendMoreInformationRequested: vi.fn(async () => true),
  sendResubmittedConfirmation: vi.fn(async () => true),
  sendAccountClaimSuccess: vi.fn(async () => true),
  sendEmailFailureAlert: vi.fn(async () => true),
  sendAdminTestEmail: vi.fn(async () => ({ ok: true, id: "resend-test-id" })),
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list = state.tables[table];
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    const lteFilters: Array<[string, any]> = [];
    const ltFilters: Array<[string, any]> = [];
    let inFilter: [string, any[]] | null = null;
    let limitN: number | null = null;
    const applyFilters = (rows: any[]) =>
      rows.filter(
        (r) =>
          filters.every(([c, v]) => r[c] === v) &&
          lteFilters.every(([c, v]) => r[c] <= v) &&
          ltFilters.every(([c, v]) => r[c] != null && r[c] < v) &&
          (!inFilter || inFilter[1].includes(r[inFilter[0]])),
      );
    const finish = () => {
      if (mode === "insert") {
        if (table === "research_members" && state.failMemberInsertWith) {
          const message = state.failMemberInsertWith;
          state.failMemberInsertWith = null;
          return { data: null, error: { message } };
        }
        const row = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...(table === "research_notification_outbox"
            ? { status: "pending", attempt_count: 0, next_attempt_at: new Date(0).toISOString() }
            : {}),
          ...insertPayload,
        };
        list.push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        const targets = applyFilters(list);
        if (!targets.length) return { data: null, error: null };
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
      in: (c: string, vs: any[]) => { inFilter = [c, vs]; return api; },
      lte: (c: string, v: any) => { lteFilters.push([c, v]); return api; },
      lt: (c: string, v: any) => { ltFilters.push([c, v]); return api; },
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
    getSupabaseAdmin: () => ({
      from: query,
      auth: {
        admin: {
          createUser: state.auth.createUser,
          deleteUser: state.auth.deleteUser,
          updateUserById: state.auth.updateUserById,
          listUsers: state.auth.listUsers,
        },
      },
    }),
    getSupabaseAnon: () => ({
      auth: { getUser: state.auth.getUser, resetPasswordForEmail: state.auth.resetPasswordForEmail },
    }),
  };
});

vi.mock("./membership-emails", () => emails);

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import { makeResearchToken, makeStatusToken } from "./membership";
import { registerMemberApi } from "./members";
import { registerMemberAccessApi } from "./guards";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerMemberApi(app);
  registerMemberAccessApi(app);
  return app;
}

function claimToken(applicationId: string) {
  return makeResearchToken("account_claim", applicationId);
}

// A pre-purpose (legacy) token: `${id}.${exp}.${sig}` with the same derived key.
function legacyToken(applicationId: string) {
  const exp = Date.now() + 24 * 3600 * 1000;
  const key = crypto.createHash("sha256").update("test-secret-for-vitest").digest();
  const sig = crypto.createHmac("sha256", key).update(`${applicationId}.${exp}`).digest("base64url");
  return `${applicationId}.${exp}.${sig}`;
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
  state.authUsers = [];
  state.failMemberInsertWith = null;
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

  it("rejects a status-purpose token: a status link is never a claim credential", async () => {
    const app = seedApplication();
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: makeStatusToken(app.id), password: "long-enough-password" });
    expect(res.status).toBe(401);
    expect(state.auth.createUser).not.toHaveBeenCalled();
    expect(state.tables.research_members).toHaveLength(0);
  });

  it("accepts a legacy pre-purpose token during the transition window", async () => {
    const app = seedApplication();
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: legacyToken(app.id), password: "long-enough-password" });
    expect(res.status).toBe(200);
    expect(state.tables.research_members).toHaveLength(1);
  });

  it("refuses to open an account before approval", async () => {
    const app = seedApplication({ status: "under_review" });
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: claimToken(app.id), password: "long-enough-password" });
    expect(res.status).toBe(409);
    expect(state.tables.research_members).toHaveLength(0);
  });

  it("refuses a lapsed approval (approval_expires_at in the past)", async () => {
    const app = seedApplication({ approval_expires_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString() });
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: claimToken(app.id), password: "long-enough-password" });
    expect(res.status).toBe(409);
    expect(state.tables.research_members).toHaveLength(0);
  });

  it("claims an approved application: confirmed auth user + member row + confirmation email", async () => {
    const app = seedApplication();
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: claimToken(app.id), password: "long-enough-password" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(state.auth.createUser).toHaveBeenCalledWith({ email: "member@example.com", password: "long-enough-password", email_confirm: true });
    expect(state.tables.research_members).toHaveLength(1);
    expect(state.tables.research_members[0].status).toBe("pending_activation");
    // The claim-success confirmation went through the outbox to the member.
    expect(emails.sendAccountClaimSuccess).toHaveBeenCalledTimes(1);
    expect(emails.sendAccountClaimSuccess.mock.calls[0][0].email).toBe("member@example.com");
  });

  it("rejects a second claim for the same email", async () => {
    const app = seedApplication();
    state.tables.research_members.push({ id: "m1", application_id: app.id, auth_user_id: "auth-1", email: app.email, first_name: "Avery", status: "pending_activation", created_at: new Date().toISOString() });
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: claimToken(app.id), password: "long-enough-password" });
    expect(res.status).toBe(409);
    expect(state.auth.createUser).not.toHaveBeenCalled();
  });

  it("cleans up the orphan auth user when the member insert fails", async () => {
    const app = seedApplication();
    state.failMemberInsertWith = "connection reset";
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: claimToken(app.id), password: "long-enough-password" });
    expect(res.status).toBe(500);
    // Compensating delete ran: no confirmed auth user is left stranded.
    expect(state.auth.deleteUser).toHaveBeenCalledTimes(1);
    expect(state.authUsers).toHaveLength(0);
    expect(state.tables.research_members).toHaveLength(0);

    // The applicant retries and succeeds cleanly.
    const retry = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: claimToken(app.id), password: "long-enough-password" });
    expect(retry.status).toBe(200);
    expect(state.tables.research_members).toHaveLength(1);
  });

  it("heals a stranded claim: auth user exists, member row missing", async () => {
    const app = seedApplication();
    // A previous claim died between the two writes.
    state.authUsers.push({ id: "stranded-1", email: "member@example.com" });
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: claimToken(app.id), password: "fresh-password-123" });
    expect(res.status).toBe(200);
    // The password was reset on the stranded user (email ownership was proven
    // by the claim token) and the member row completed.
    expect(state.auth.updateUserById).toHaveBeenCalledWith("stranded-1", expect.objectContaining({ password: "fresh-password-123" }));
    expect(state.tables.research_members).toHaveLength(1);
    expect(state.tables.research_members[0].auth_user_id).toBe("stranded-1");
  });

  it("treats a concurrent duplicate member insert as success", async () => {
    const app = seedApplication();
    state.failMemberInsertWith = "duplicate key value violates unique constraint";
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: claimToken(app.id), password: "long-enough-password" });
    expect(res.status).toBe(200);
    expect(state.auth.deleteUser).not.toHaveBeenCalled();
  });
});

describe("forgot password", () => {
  // Distinct addresses per test: the per-email cooldown's in-memory fallback
  // window persists across tests in this file.
  function seedMemberRow(email: string) {
    const app = seedApplication({ email });
    state.tables.research_members.push({ id: crypto.randomUUID(), application_id: app.id, auth_user_id: crypto.randomUUID(), email, first_name: "Avery", status: "pending_activation", created_at: new Date().toISOString() });
  }

  it("sends the recovery email for an existing member, generic response", async () => {
    seedMemberRow("forgot-a@example.com");
    const res = await request(makeApp())
      .post("/api/research/member/forgot-password")
      .set("X-Forwarded-For", uniqueIp())
      .send({ email: "forgot-a@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(state.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(state.auth.resetPasswordForEmail.mock.calls[0][0]).toBe("forgot-a@example.com");
  });

  it("returns the identical generic response when no member exists (no enumeration)", async () => {
    seedMemberRow("forgot-b@example.com");
    const appHttp = makeApp();
    const known = await request(appHttp)
      .post("/api/research/member/forgot-password")
      .set("X-Forwarded-For", uniqueIp())
      .send({ email: "forgot-b@example.com" });
    const unknown = await request(appHttp)
      .post("/api/research/member/forgot-password")
      .set("X-Forwarded-For", uniqueIp())
      .send({ email: "nobody@example.com" });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    // Only the real member triggered a recovery email.
    expect(state.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it("per-email cooldown silently suppresses a repeat request", async () => {
    seedMemberRow("forgot-c@example.com");
    const appHttp = makeApp();
    const first = await request(appHttp)
      .post("/api/research/member/forgot-password")
      .set("X-Forwarded-For", uniqueIp())
      .send({ email: "forgot-c@example.com" });
    const second = await request(appHttp)
      .post("/api/research/member/forgot-password")
      .set("X-Forwarded-For", uniqueIp())
      .send({ email: "forgot-c@example.com" });
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(state.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });
});

describe("active-member authorization (requireActiveMember)", () => {
  function seedMemberWithStatus(status: string, extra: Record<string, unknown> = {}) {
    const app = seedApplication();
    state.tables.research_members.push({
      id: "m1",
      application_id: app.id,
      auth_user_id: "auth-1",
      email: "member@example.com",
      first_name: "Avery",
      status,
      created_at: new Date().toISOString(),
      ...extra,
    });
  }

  it("no bearer token: 401; the shared review password never reaches the member catalog", async () => {
    seedMemberWithStatus("active");
    const res = await request(makeApp()).get("/api/research/member/catalog");
    expect(res.status).toBe(401);
  });

  it("pending_activation member: 403 activation_required, no catalog data", async () => {
    seedMemberWithStatus("pending_activation");
    const res = await request(makeApp()).get("/api/research/member/catalog").set("Authorization", "Bearer good-jwt");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("activation_required");
    expect(JSON.stringify(res.body)).not.toMatch(/products/);
  });

  it("active member: 200 with the catalog", async () => {
    seedMemberWithStatus("active");
    const res = await request(makeApp()).get("/api/research/member/catalog").set("Authorization", "Bearer good-jwt");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
  });

  it("past_due member: 403 billing recovery", async () => {
    seedMemberWithStatus("past_due");
    const res = await request(makeApp()).get("/api/research/member/catalog").set("Authorization", "Bearer good-jwt");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("billing_past_due");
  });

  it("closed member: 403 from the base member guard", async () => {
    seedMemberWithStatus("closed");
    const res = await request(makeApp()).get("/api/research/member/catalog").set("Authorization", "Bearer good-jwt");
    expect(res.status).toBe(403);
  });

  it("billing enforcement: active status with explicit non-active billing_state denies when the flag is on", async () => {
    process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED = "true";
    try {
      seedMemberWithStatus("active", { billing_state: "past_due" });
      const res = await request(makeApp()).get("/api/research/member/catalog").set("Authorization", "Bearer good-jwt");
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("billing_past_due");
    } finally {
      delete process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED;
    }
  });

  it("member resolution is keyed on auth_user_id, not email", async () => {
    const app = seedApplication({ email: "old-address@example.com" });
    // The member's stored email differs from the JWT email; the auth_user_id
    // link still resolves the same person.
    state.tables.research_members.push({
      id: "m1",
      application_id: app.id,
      auth_user_id: "auth-1",
      email: "old-address@example.com",
      first_name: "Avery",
      status: "active",
      created_at: new Date().toISOString(),
    });
    const res = await request(makeApp()).get("/api/research/member/me").set("Authorization", "Bearer good-jwt");
    expect(res.status).toBe(200);
    expect(res.body.member.firstName).toBe("Avery");
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

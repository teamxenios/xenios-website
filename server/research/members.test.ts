import crypto from "crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    listUsers: vi.fn(async ({ page, perPage }: { page: number; perPage: number }) => ({
      data: { users: state.authUsers.slice((page - 1) * perPage, page * perPage) },
      error: null,
    })),
    getUser: vi.fn(async (jwt: string) => {
      if (jwt === "good-jwt") return { data: { user: { id: "auth-1", email: "member@example.com" } }, error: null };
      if (jwt === "recovery-jwt") return { data: { user: { id: "auth-recovery", email: "recovery@example.com" } }, error: null };
      // Realistic JWT fixtures: a three-part token whose payload carries
      // sub/email (and amr, which the server reads from the claim itself).
      try {
        const parts = jwt.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
          if (payload?.sub && payload?.email) {
            return { data: { user: { id: String(payload.sub), email: String(payload.email) } }, error: null };
          }
        }
      } catch {
        /* fall through */
      }
      return { data: { user: null }, error: { message: "invalid" } };
    }),
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
import { registerResearchApi, researchPageGate } from "./index";
import { registerOutboxAdmin } from "./outbox";

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

// Realistic Supabase-shaped access-token fixture. The claim shape follows the
// installed SDK (@supabase/auth-js types.d.ts): JwtPayload with amr as EITHER
// AMREntry[] ({method,timestamp}) or RFC-8176 string[]; recovery links verify
// through the one-time-password path (method "otp"), password sign-ins carry
// "password". The signature is a dummy: the server verifies authenticity via
// auth.getUser() (stubbed above) and then reads the amr CLAIM, which in
// production is Supabase-signed.
function makeSupabaseJwt(input: { sub: string; email: string; amr?: Array<{ method: string; timestamp: number } | string> }) {
  const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: "https://test.supabase.co/auth/v1",
    sub: input.sub,
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    email: input.email,
    role: "authenticated",
    aal: "aal1",
    session_id: crypto.randomUUID(),
    ...(input.amr ? { amr: input.amr } : {}),
  };
  return `${b64(header)}.${b64(payload)}.dummysig`;
}

const now = () => Math.floor(Date.now() / 1000);
const recoveryJwtFor = (sub: string, email: string) => makeSupabaseJwt({ sub, email, amr: [{ method: "otp", timestamp: now() }] });
const passwordJwtFor = (sub: string, email: string) => makeSupabaseJwt({ sub, email, amr: [{ method: "password", timestamp: now() }] });

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

  it("heals a stranded claim when the auth user sits beyond the first listUsers page", async () => {
    const app = seedApplication();
    for (let i = 0; i < 205; i += 1) state.authUsers.push({ id: `filler-${i}`, email: `filler-${i}@example.com` });
    state.authUsers.push({ id: "stranded-deep", email: "member@example.com" }); // page 2
    const res = await request(makeApp())
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", uniqueIp())
      .send({ token: claimToken(app.id), password: "fresh-password-123" });
    expect(res.status).toBe(200);
    expect(state.auth.listUsers.mock.calls.length).toBeGreaterThan(1);
    expect(state.tables.research_members[0].auth_user_id).toBe("stranded-deep");
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

  it("billing enforcement: an active pre-migration member (no billing_state column) stays allowed", async () => {
    process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED = "true";
    try {
      seedMemberWithStatus("active"); // row has no billing_state key at all
      const res = await request(makeApp()).get("/api/research/member/catalog").set("Authorization", "Bearer good-jwt");
      expect(res.status).toBe(200);
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

// ---------------------------------------------------------------------------
// Fresh-browser password recovery (founder decision, 2026-07-19): the narrow
// recovery flow bypasses the shared review gate by EXPLICIT allowlist; the
// gate itself, the member guards, and the admin guard all stay intact.
// The wall is the REAL registerResearchApi, composed exactly as in
// server/index.ts.
// ---------------------------------------------------------------------------
describe("fresh-browser password recovery (wall allowlist)", () => {
  function makeComposedApp() {
    const app = express();
    app.use(express.json());
    registerResearchApi(app);
    registerMemberApi(app);
    registerMemberAccessApi(app);
    registerOutboxAdmin(app); // REAL requireSupabaseAdmin (../routes is not mocked here)
    return app;
  }

  beforeEach(() => {
    process.env.RESEARCH_ACCESS_PASSWORD = "composed-test-password";
  });
  afterEach(() => {
    delete process.env.RESEARCH_ACCESS_PASSWORD;
  });

  it("a fresh browser submits a reset request with NO credential of any kind", async () => {
    seedApplication({ email: "fresh-a@example.com" });
    state.tables.research_members.push({ id: crypto.randomUUID(), application_id: state.tables.research_applications[0].id, auth_user_id: crypto.randomUUID(), email: "fresh-a@example.com", first_name: "Avery", status: "pending_activation", created_at: new Date().toISOString() });
    const res = await request(makeComposedApp())
      .post("/api/research/member/forgot-password")
      .set("X-Forwarded-For", uniqueIp())
      .send({ email: "fresh-a@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(state.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    // Sensitive-flow headers, and the bypass never mints a review cookie.
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("unknown email from a fresh browser gets the identical generic response, no email sent", async () => {
    seedApplication({ email: "fresh-b@example.com" });
    state.tables.research_members.push({ id: crypto.randomUUID(), application_id: state.tables.research_applications[0].id, auth_user_id: crypto.randomUUID(), email: "fresh-b@example.com", first_name: "Avery", status: "pending_activation", created_at: new Date().toISOString() });
    const app = makeComposedApp();
    const known = await request(app)
      .post("/api/research/member/forgot-password")
      .set("X-Forwarded-For", uniqueIp())
      .send({ email: "fresh-b@example.com" });
    const unknown = await request(app)
      .post("/api/research/member/forgot-password")
      .set("X-Forwarded-For", uniqueIp())
      .send({ email: "fresh-nobody@example.com" });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(state.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it("the recovery allowlist stays rate-limited per IP", async () => {
    const app = makeComposedApp();
    const ip = uniqueIp();
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post("/api/research/member/forgot-password")
        .set("X-Forwarded-For", ip)
        .send({ email: `fresh-rl-${i}@example.com` });
      expect(res.status).toBe(200);
    }
    const fourth = await request(app)
      .post("/api/research/member/forgot-password")
      .set("X-Forwarded-For", ip)
      .send({ email: "fresh-rl-3@example.com" });
    expect(fourth.status).toBe(429);
  });

  it("the allowlist opens ONLY recovery: gateway/application-flow endpoints keep the wall", async () => {
    const app = makeComposedApp();
    // No credential: everything else still 401s at the wall.
    expect((await request(app).get("/api/research/policies")).status).toBe(401);
    expect((await request(app).get("/api/research/catalog")).status).toBe(401);
    expect((await request(app).get("/api/research/member/me")).status).toBe(401);
    expect((await request(app).get("/api/research/member/catalog")).status).toBe(401);
    expect((await request(app).post("/api/research/orders").send({})).status).toBe(401);
  });

  it("a recovery session (valid JWT, no membership) reaches NO catalog, member data, or admin surface", async () => {
    seedApplication(); // unrelated member data exists
    state.tables.research_members.push({ id: "m1", application_id: state.tables.research_applications[0].id, auth_user_id: "auth-1", email: "member@example.com", first_name: "Avery", status: "active", created_at: new Date().toISOString() });
    const app = makeComposedApp();
    const bearer = { Authorization: "Bearer recovery-jwt" }; // auth-recovery: no member row
    expect((await request(app).get("/api/research/catalog").set(bearer)).status).toBe(403);
    expect((await request(app).get("/api/research/member/catalog").set(bearer)).status).toBe(403);
    expect((await request(app).get("/api/research/member/me").set(bearer)).status).toBe(403);
    // Admin surface: the REAL requireSupabaseAdmin refuses (no ADMIN_EMAIL
    // configured here fails closed; a recovery user is never an admin).
    const admin = await request(app).get("/api/admin/research/outbox").set(bearer);
    expect(admin.status).toBeGreaterThanOrEqual(400);
    expect(admin.body?.outbox).toBeUndefined();
  });

  it("RECOVERY-PURPOSE AUTHORIZATION: a recovery session of an ACTIVE member is denied every member surface", async () => {
    const app = seedApplication({ status: "active" });
    state.tables.research_members.push({ id: "m1", application_id: app.id, auth_user_id: "auth-active", email: "member@example.com", first_name: "Avery", status: "active", billing_state: "active", created_at: new Date().toISOString() });
    const composed = makeComposedApp();
    const bearer = { Authorization: `Bearer ${recoveryJwtFor("auth-active", "member@example.com")}` };

    for (const probe of [
      () => request(composed).get("/api/research/catalog").set(bearer),
      () => request(composed).get("/api/research/member/catalog").set(bearer),
      () => request(composed).get("/api/research/member/me").set(bearer),
      () => request(composed).get("/api/research/member/referrals").set(bearer),
      () => request(composed).post("/api/research/orders").set(bearer).send({}),
    ]) {
      const res = await probe();
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("recovery_session");
      // No catalog, member, or order data leaks in the denial.
      expect(JSON.stringify(res.body)).not.toMatch(/products|priceCents|firstName|orderId/);
    }
  });

  it("RECOVERY-PURPOSE AUTHORIZATION: a recovery session with Samuel's ADMIN_EMAIL is denied every admin surface", async () => {
    process.env.ADMIN_EMAIL = "samuel@xeniostechnology.com";
    try {
      const composed = makeComposedApp();
      const bearer = { Authorization: `Bearer ${recoveryJwtFor("auth-samuel", "samuel@xeniostechnology.com")}` };
      const outbox = await request(composed).get("/api/admin/research/outbox").set(bearer);
      expect(outbox.status).toBe(403);
      expect(JSON.stringify(outbox.body)).not.toMatch(/outbox|recipient|template/i);
      const drain = await request(composed).post("/api/admin/research/outbox/run").set(bearer);
      expect(drain.status).toBe(403);
      const testEmail = await request(composed).post("/api/admin/research/test-email").set(bearer).send({ to: "samuel@xeniostechnology.com" });
      expect(testEmail.status).toBe(403);
      expect(emails.sendAdminTestEmail).not.toHaveBeenCalled();
    } finally {
      delete process.env.ADMIN_EMAIL;
    }
  });

  it("RECOVERY-PURPOSE AUTHORIZATION: pending and approved-unpaid members are denied with a recovery session", async () => {
    const app = seedApplication({ status: "approved_pending_payment" });
    state.tables.research_members.push({ id: "m1", application_id: app.id, auth_user_id: "auth-pending", email: "member@example.com", first_name: "Avery", status: "pending_activation", created_at: new Date().toISOString() });
    const composed = makeComposedApp();
    const bearer = { Authorization: `Bearer ${recoveryJwtFor("auth-pending", "member@example.com")}` };
    for (const path of ["/api/research/member/me", "/api/research/member/catalog", "/api/research/catalog"]) {
      const res = await request(composed).get(path).set(bearer);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("recovery_session");
    }
  });

  it("RECOVERY-PURPOSE AUTHORIZATION: RFC-8176 string-form amr is honored too", async () => {
    const app = seedApplication({ status: "active" });
    state.tables.research_members.push({ id: "m1", application_id: app.id, auth_user_id: "auth-active", email: "member@example.com", first_name: "Avery", status: "active", billing_state: "active", created_at: new Date().toISOString() });
    const composed = makeComposedApp();
    const recoveryStringAmr = makeSupabaseJwt({ sub: "auth-active", email: "member@example.com", amr: ["otp"] });
    const denied = await request(composed).get("/api/research/member/me").set("Authorization", `Bearer ${recoveryStringAmr}`);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("recovery_session");

    const passwordStringAmr = makeSupabaseJwt({ sub: "auth-active", email: "member@example.com", amr: ["password"] });
    const allowed = await request(composed).get("/api/research/member/me").set("Authorization", `Bearer ${passwordStringAmr}`);
    expect(allowed.status).toBe(200);
  });

  it("RECOVERY-PURPOSE AUTHORIZATION: ordinary password sessions still work for members and the admin", async () => {
    const app = seedApplication({ status: "active" });
    state.tables.research_members.push({ id: "m1", application_id: app.id, auth_user_id: "auth-active", email: "member@example.com", first_name: "Avery", status: "active", billing_state: "active", created_at: new Date().toISOString() });
    const composed = makeComposedApp();
    const memberBearer = { Authorization: `Bearer ${passwordJwtFor("auth-active", "member@example.com")}` };
    expect((await request(composed).get("/api/research/member/me").set(memberBearer)).status).toBe(200);
    expect((await request(composed).get("/api/research/catalog").set(memberBearer)).status).toBe(200);
    expect((await request(composed).get("/api/research/member/catalog").set(memberBearer)).status).toBe(200);

    process.env.ADMIN_EMAIL = "samuel@xeniostechnology.com";
    try {
      const adminBearer = { Authorization: `Bearer ${passwordJwtFor("auth-samuel", "samuel@xeniostechnology.com")}` };
      const outbox = await request(composed).get("/api/admin/research/outbox").set(adminBearer);
      expect(outbox.status).toBe(200);
    } finally {
      delete process.env.ADMIN_EMAIL;
    }
  });

  it("the shared gate remains required for the gateway page flow, and the recovery PAGE carries the sensitive-flow headers", async () => {
    const app = express();
    app.use(researchPageGate);
    app.get("/research/reset-password", (_req, res) => res.send("reset page"));
    app.get("/research", (_req, res) => res.send("gateway"));

    const reset = await request(app).get("/research/reset-password");
    expect(reset.status).toBe(200);
    expect(reset.headers["cache-control"]).toBe("no-store");
    expect(reset.headers["referrer-policy"]).toBe("no-referrer");
    expect(reset.headers["x-robots-tag"]).toBe("noindex, nofollow");

    // The gateway page itself is untouched by the recovery exception: it
    // still serves (the shared-password gate is enforced by the API wall +
    // client layout, unchanged), and still carries noindex.
    const gateway = await request(app).get("/research");
    expect(gateway.status).toBe(200);
    expect(gateway.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });
});

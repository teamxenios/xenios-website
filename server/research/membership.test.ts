import crypto from "crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Privacy and authorization tests for the research membership application API.
// Supabase is replaced with an in-memory fake; emails are spied. The contract
// under test: an email match must never disclose an application's existence,
// status, or token, and must never authorize a modification.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  apps: [] as any[],
  events: [] as any[],
  outbox: [] as any[],
  attempts: [] as any[],
  members: [] as any[],
}));

const emails = vi.hoisted(() => ({
  sendApplicationReceived: vi.fn(async () => true),
  sendStatusLink: vi.fn(async () => true),
  sendInternalApplicationAlert: vi.fn(async () => true),
  sendApplicationApproved: vi.fn(async () => true),
  sendApplicationDeclined: vi.fn(async () => true),
  sendMoreInformationRequested: vi.fn(async () => true),
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list =
      table === "research_applications"
        ? state.apps
        : table === "research_notification_outbox"
          ? state.outbox
          : table === "research_notification_attempts"
            ? state.attempts
            : table === "research_members"
              ? state.members
              : state.events;
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    const lteFilters: Array<[string, any]> = [];
    let notNullCol: string | null = null;
    let limitN: number | null = null;

    const applyFilters = (rows: any[]) =>
      rows.filter((r) => filters.every(([c, v]) => r[c] === v) && lteFilters.every(([c, v]) => r[c] <= v));
    const finish = () => {
      if (mode === "insert") {
        if (table === "research_notification_outbox" && insertPayload?.event_key &&
            list.some((r: any) => r.event_key === insertPayload.event_key)) {
          return { data: null, error: { message: "duplicate key value violates unique constraint" } };
        }
        const row = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          submitted_at: new Date().toISOString(),
          approval_expires_at: null,
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
        if (!targets.length) return { data: null, error: { message: "no matching row" } };
        Object.assign(targets[0], updatePayload);
        return { data: targets[0], error: null };
      }
      let rows = applyFilters(list);
      if (notNullCol) rows = rows.filter((r) => r[notNullCol!] != null);
      if (limitN != null) rows = rows.slice(-limitN);
      return { data: rows, error: null };
    };

    const api: any = {
      select: () => api,
      insert: (p: any) => { mode = "insert"; insertPayload = p; return api; },
      update: (p: any) => { mode = "update"; updatePayload = p; return api; },
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      in: (c: string, vs: any[]) => { filters.push([c, vs[0]]); return api; },
      lte: (c: string, v: any) => { lteFilters.push([c, v]); return api; },
      not: (c: string) => { notNullCol = c; return api; },
      order: () => api,
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
    getSupabaseAnon: () => { throw new Error("not used in tests"); },
  };
});

vi.mock("../routes", () => ({
  requireSupabaseAdmin: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("./membership-emails", () => emails);

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import { makeStatusToken, readStatusToken, registerMembershipApi } from "./membership";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerMembershipApi(app);
  return app;
}

let ipCounter = 0;
function uniqueIp() {
  ipCounter += 1;
  return `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

const VALID = {
  firstName: "Jordan",
  lastName: "Reyes",
  email: "jordan@example.com",
  country: "United States",
  ageConfirmed: true,
  applicantType: "individual",
  interests: ["Whole-life planning"],
  goalsText: "Sleep, recovery, and a routine I can keep.",
  fitText: "I want one coherent plan instead of scattered tools.",
  acceptAccuracy: true,
  acceptNoGuarantee: true,
  acceptEducational: true,
  acceptTerms: true,
};

function seedApplication(overrides: Record<string, unknown> = {}) {
  const row = {
    id: crypto.randomUUID(),
    email: "existing@example.com",
    first_name: "Avery",
    last_name: "OnFile",
    status: "submitted",
    submitted_at: new Date().toISOString(),
    approval_expires_at: null,
    goals_text: "original goals",
    ...overrides,
  };
  state.apps.push(row);
  return row;
}

beforeEach(() => {
  state.apps.length = 0;
  state.events.length = 0;
  state.outbox.length = 0;
  state.attempts.length = 0;
  state.members.length = 0;
  vi.clearAllMocks();
});

describe("duplicate email privacy", () => {
  it("returns the identical generic response for new and duplicate submissions, with no token or status", async () => {
    const app = makeApp();
    const fresh = await request(app)
      .post("/api/research/applications")
      .set("X-Forwarded-For", uniqueIp())
      .send(VALID);
    expect(fresh.status).toBe(200);
    expect(fresh.body).toEqual({ ok: true });

    const dup = await request(app)
      .post("/api/research/applications")
      .set("X-Forwarded-For", uniqueIp())
      .send(VALID);
    expect(dup.status).toBe(200);
    // Indistinguishable from a first submission: no token, no duplicate flag, no status.
    expect(dup.body).toEqual(fresh.body);
    expect(JSON.stringify(dup.body)).not.toMatch(/token|status|duplicate/i);
    // No second row was created.
    expect(state.apps.filter((a) => a.email === VALID.email)).toHaveLength(1);
  });

  it("sends the secure link only to the address already on file", async () => {
    seedApplication({ email: VALID.email, first_name: "OnFile" });
    const app = makeApp();
    const res = await request(app)
      .post("/api/research/applications")
      .set("X-Forwarded-For", uniqueIp())
      .send(VALID);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(emails.sendStatusLink).toHaveBeenCalledTimes(1);
    expect(emails.sendStatusLink.mock.calls[0][0].email).toBe(VALID.email);
    // The freshly minted token goes into the email, never the HTTP response.
    expect(emails.sendStatusLink.mock.calls[0][0].token).toBeTruthy();
  });
});

describe("unauthorized resubmission", () => {
  it("an email match alone never modifies an application awaiting more information", async () => {
    const row = seedApplication({ email: VALID.email, status: "more_information_requested" });
    const app = makeApp();
    const res = await request(app)
      .post("/api/research/applications")
      .set("X-Forwarded-For", uniqueIp())
      .send({ ...VALID, goalsText: "attacker overwrite attempt" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // Unchanged: still awaiting information, original content intact.
    expect(row.status).toBe("more_information_requested");
    expect(row.goals_text).toBe("original goals");
  });

  it("resubmit without a token is rejected", async () => {
    seedApplication({ email: VALID.email, status: "more_information_requested" });
    const app = makeApp();
    const res = await request(app)
      .post("/api/research/applications/resubmit")
      .set("X-Forwarded-For", uniqueIp())
      .send(VALID);
    expect(res.status).toBe(401);
  });

  it("resubmit is rejected when the application is not awaiting an update", async () => {
    const row = seedApplication({ email: VALID.email, status: "under_review" });
    const app = makeApp();
    const res = await request(app)
      .post("/api/research/applications/resubmit")
      .set("X-Forwarded-For", uniqueIp())
      .send({ ...VALID, token: makeStatusToken(row.id) });
    expect(res.status).toBe(409);
    expect(row.status).toBe("under_review");
  });
});

describe("token integrity", () => {
  it("a tampered signature is rejected", async () => {
    const row = seedApplication();
    const good = makeStatusToken(row.id);
    const tampered = good.slice(0, -2) + (good.endsWith("aa") ? "bb" : "aa");
    expect(readStatusToken(tampered)).toBeNull();

    const app = makeApp();
    const res = await request(app).get(`/api/research/applications/status?token=${encodeURIComponent(tampered)}`);
    expect(res.status).toBe(401);
  });

  it("an expired token is rejected even with a valid signature", async () => {
    const row = seedApplication();
    const pastExp = Date.now() - 60_000;
    const payload = `${row.id}.${pastExp}`;
    const key = crypto.createHash("sha256").update("test-secret-for-vitest").digest();
    const sig = crypto.createHmac("sha256", key).update(payload).digest("base64url");
    const expired = `${payload}.${sig}`;
    expect(readStatusToken(expired)).toBeNull();

    const app = makeApp();
    const res = await request(app).get(`/api/research/applications/status?token=${encodeURIComponent(expired)}`);
    expect(res.status).toBe(401);
  });

  it("a valid token reads status without leaking internals", async () => {
    const row = seedApplication({ status: "under_review" });
    const app = makeApp();
    const res = await request(app).get(`/api/research/applications/status?token=${encodeURIComponent(makeStatusToken(row.id))}`);
    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe("under_review");
    expect(res.body.application.internalNote).toBeUndefined();
  });
});

describe("legitimate verified resubmission", () => {
  it("a valid token on an application awaiting information updates it and transitions to resubmitted", async () => {
    const row = seedApplication({ email: VALID.email, status: "more_information_requested" });
    const app = makeApp();
    const res = await request(app)
      .post("/api/research/applications/resubmit")
      .set("X-Forwarded-For", uniqueIp())
      .send({ ...VALID, goalsText: "updated goals after the request", token: makeStatusToken(row.id) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(row.status).toBe("resubmitted");
    expect(row.goals_text).toBe("updated goals after the request");
    // The transition was audited.
    expect(state.events.some((e) => e.new_status === "resubmitted" && e.application_id === row.id)).toBe(true);
  });
});

describe("resend rate limiting", () => {
  it("per-IP limit returns 429 after three requests", async () => {
    const app = makeApp();
    const ip = uniqueIp();
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/api/research/applications/resend-link")
        .set("X-Forwarded-For", ip)
        .send({ email: `probe${i}@example.com` });
      expect(res.status).toBe(200);
    }
    const fourth = await request(app)
      .post("/api/research/applications/resend-link")
      .set("X-Forwarded-For", ip)
      .send({ email: "probe3@example.com" });
    expect(fourth.status).toBe(429);
  });

  it("per-email cooldown silently suppresses the send with the same generic response", async () => {
    seedApplication({ email: "cool@example.com" });
    const app = makeApp();
    const first = await request(app)
      .post("/api/research/applications/resend-link")
      .set("X-Forwarded-For", uniqueIp())
      .send({ email: "cool@example.com" });
    const second = await request(app)
      .post("/api/research/applications/resend-link")
      .set("X-Forwarded-For", uniqueIp())
      .send({ email: "cool@example.com" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body); // indistinguishable
    expect(emails.sendStatusLink).toHaveBeenCalledTimes(1); // but only one send
  });

  it("nonexistent emails get the same generic response as existing ones", async () => {
    seedApplication({ email: "real@example.com" });
    const app = makeApp();
    const real = await request(app)
      .post("/api/research/applications/resend-link")
      .set("X-Forwarded-For", uniqueIp())
      .send({ email: "real@example.com" });
    const fake = await request(app)
      .post("/api/research/applications/resend-link")
      .set("X-Forwarded-For", uniqueIp())
      .send({ email: "nobody@example.com" });
    expect(real.status).toBe(200);
    expect(fake.status).toBe(200);
    expect(fake.body).toEqual(real.body);
  });
});

describe("admin activation (interim, admin-verified, billing-flag gated)", () => {
  // Membership is a $50 one-time activation PLUS a $25 recurring monthly
  // membership; both must be verified before any member becomes active.
  const BOTH_REFS = { paymentReference: "manual-check-001", subscriptionReference: "sub-check-001" };

  beforeEach(() => {
    process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED = "true";
  });
  afterEach(() => {
    delete process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED;
  });

  it("fails closed when RESEARCH_MEMBERSHIP_BILLING_ENABLED is false (default)", async () => {
    delete process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED;
    const row = seedApplication({ status: "payment_pending" });
    state.members.push({ id: "mem-1", application_id: row.id, auth_user_id: "auth-1", email: row.email, first_name: "Avery", status: "pending_activation", created_at: new Date().toISOString() });

    const begin = await request(makeApp())
      .post(`/api/admin/research/applications/${row.id}/begin-activation`)
      .set("X-Forwarded-For", uniqueIp())
      .send({});
    expect(begin.status).toBe(503);

    const res = await request(makeApp())
      .post(`/api/admin/research/applications/${row.id}/activate`)
      .set("X-Forwarded-For", uniqueIp())
      .send(BOTH_REFS);
    expect(res.status).toBe(503);
    // No member activation and no referral qualification happened.
    expect(row.status).toBe("payment_pending");
    expect(state.members[0].status).toBe("pending_activation");
    expect(state.events.some((e) => e.new_status === "active")).toBe(false);
  });

  it("begin-activation moves approved -> payment_pending", async () => {
    const row = seedApplication({ status: "approved_pending_payment" });
    const res = await request(makeApp())
      .post(`/api/admin/research/applications/${row.id}/begin-activation`)
      .set("X-Forwarded-For", uniqueIp())
      .send({});
    expect(res.status).toBe(200);
    expect(row.status).toBe("payment_pending");
  });

  it("activate refuses when the applicant has not claimed a member account", async () => {
    const row = seedApplication({ status: "payment_pending" });
    const res = await request(makeApp())
      .post(`/api/admin/research/applications/${row.id}/activate`)
      .set("X-Forwarded-For", uniqueIp())
      .send(BOTH_REFS);
    expect(res.status).toBe(409);
    expect(row.status).toBe("payment_pending");
  });

  it("activate flips application and member to active and fires the referral hook", async () => {
    const row = seedApplication({ status: "payment_pending" });
    state.members.push({ id: "mem-1", application_id: row.id, auth_user_id: "auth-1", email: row.email, first_name: "Avery", status: "pending_activation", created_at: new Date().toISOString() });
    const res = await request(makeApp())
      .post(`/api/admin/research/applications/${row.id}/activate`)
      .set("X-Forwarded-For", uniqueIp())
      .send(BOTH_REFS);
    expect(res.status).toBe(200);
    expect(row.status).toBe("active");
    expect(state.members[0].status).toBe("active");
    // Referrals are flag-off in this suite: the hook ran and reported disabled.
    expect(res.body.referral.reason).toBe("referrals_disabled");
    // The transition was audited with BOTH references, internal-only.
    const audited = state.events.find((e) => e.new_status === "active");
    expect(String(audited?.internal_note)).toContain("payment_reference=manual-check-001");
    expect(String(audited?.internal_note)).toContain("subscription_reference=sub-check-001");
  });

  it("activate fails closed unless BOTH the activation payment and the monthly membership are provided", async () => {
    const row = seedApplication({ status: "payment_pending" });
    state.members.push({ id: "mem-1", application_id: row.id, auth_user_id: "auth-1", email: row.email, first_name: "Avery", status: "pending_activation", created_at: new Date().toISOString() });
    for (const body of [{}, { paymentReference: "manual-check-001" }, { subscriptionReference: "sub-check-001" }]) {
      const res = await request(makeApp())
        .post(`/api/admin/research/applications/${row.id}/activate`)
        .set("X-Forwarded-For", uniqueIp())
        .send(body);
      expect(res.status).toBe(400);
    }
    expect(row.status).toBe("payment_pending");
    expect(state.members[0].status).toBe("pending_activation");
  });

  it("activate is not allowed from the wrong state", async () => {
    const row = seedApplication({ status: "under_review" });
    state.members.push({ id: "mem-1", application_id: row.id, auth_user_id: "auth-1", email: row.email, first_name: "Avery", status: "pending_activation", created_at: new Date().toISOString() });
    const res = await request(makeApp())
      .post(`/api/admin/research/applications/${row.id}/activate`)
      .set("X-Forwarded-For", uniqueIp())
      .send(BOTH_REFS);
    expect(res.status).toBe(409);
    expect(row.status).toBe("under_review");
  });
});

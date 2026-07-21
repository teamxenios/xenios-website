import crypto from "crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Plans tests: member isolation on every route, the draft-never-serializes
// rule, the one included early change per calendar month (structural via the
// unique constraint), publish-supersedes versioning, the single publish
// notification with a safe payload, and the Review Week calendar math.
// Supabase is an in-memory fake; member auth and requireSupabaseAdmin are
// mocked so identities and denials are chosen per test.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  x30: [] as any[],
  x90: [] as any[],
  changes: [] as any[],
  members: [] as any[],
}));

const auth = vi.hoisted(() => ({
  current: null as any,
  deny: null as { status: number; code: string } | null,
}));

const admin = vi.hoisted(() => ({
  deny: false,
  email: "samuel@xeniostechnology.com",
}));

vi.mock("../supabase", () => {
  const TABLES: Record<string, () => any[]> = {
    research_xenios30_plans: () => state.x30,
    research_xenios90_plans: () => state.x90,
    research_plan_change_requests: () => state.changes,
    research_members: () => state.members,
  };
  const UNIQUE: Record<string, string[]> = {
    research_xenios30_plans: ["member_id", "month_label", "version"],
    research_xenios90_plans: ["member_id", "version"],
    research_plan_change_requests: ["member_id", "month_label"],
  };

  function query(table: string) {
    const list = (TABLES[table] ?? (() => []))();
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    const neqFilters: Array<[string, any]> = [];
    let inFilter: [string, any[]] | null = null;
    let isNullCol: string | null = null;
    let limitN: number | null = null;

    const applyFilters = (rows: any[]) =>
      rows.filter(
        (r) =>
          filters.every(([c, v]) => r[c] === v) &&
          neqFilters.every(([c, v]) => r[c] !== v) &&
          (inFilter === null || inFilter[1].includes(r[inFilter[0]])) &&
          (isNullCol === null || r[isNullCol] === null),
      );
    const finish = () => {
      if (mode === "insert") {
        const keys = UNIQUE[table];
        if (keys && list.some((r: any) => keys.every((k) => r[k] === insertPayload[k]))) {
          return { data: null, error: { message: "duplicate key value violates unique constraint" } };
        }
        const row = { id: crypto.randomUUID(), ...insertPayload };
        list.push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        const targets = applyFilters(list);
        if (!targets.length) return { data: null, error: null };
        for (const target of targets) Object.assign(target, updatePayload);
        return { data: targets, error: null };
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
      neq: (c: string, v: any) => { neqFilters.push([c, v]); return api; },
      in: (c: string, vs: any[]) => { inFilter = [c, vs]; return api; },
      is: (c: string, v: any) => { if (v === null) isNullCol = c; return api; },
      order: () => api,
      limit: (n: number) => { limitN = n; return api; },
      maybeSingle: async () => {
        const r = finish();
        const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data;
        return { data: d, error: r.error ?? null };
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
    getSupabaseAnon: () => { throw new Error("not used in tests"); },
  };
});

vi.mock("./member-auth", () => ({
  requireActiveMember: (req: any, res: any, next: any) => {
    if (auth.deny) return res.status(auth.deny.status).json({ ok: false, code: auth.deny.code });
    req.researchMember = auth.current;
    next();
  },
  requireMember: (req: any, res: any, next: any) => {
    if (auth.deny) return res.status(auth.deny.status).json({ ok: false, code: auth.deny.code });
    req.researchMember = auth.current;
    next();
  },
}));

vi.mock("../routes", () => ({
  requireSupabaseAdmin: (req: any, res: any, next: any) => {
    if (admin.deny) return res.status(401).json({ ok: false, code: "admin_required" });
    req.adminEmail = admin.email;
    next();
  },
}));

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import {
  firstMondayAfterMonthEnd,
  monthLabelFor,
  monthlyReviewStateFor,
  registerPlansApi,
} from "./plans";
import type { MemberPlatformDeps } from "./member-platform-deps";

// Deterministic clock + recording notifier. T0 sits mid July 2026 (UTC), so
// the current month label is 2026-07 and Review Week for a July plan starts
// Monday 2026-08-03 (2026-08-01 is a Saturday).
const T0 = Date.parse("2026-07-15T12:00:00.000Z");
const JULY_REVIEW_WEEK_START = "2026-08-03T00:00:00.000Z";

let nowMs = T0;
let notifications: any[] = [];

function makeDeps(): MemberPlatformDeps {
  return {
    clock: { now: () => new Date(nowMs) },
    notifier: {
      notify: vi.fn(async (input: any) => {
        notifications.push(input);
        return true;
      }),
    },
  };
}

let deps: MemberPlatformDeps;

function makeApp() {
  const app = express();
  app.use(express.json());
  registerPlansApi(app, deps);
  return app;
}

const MEMBER_A = {
  id: "00000000-0000-4000-8000-00000000mema",
  application_id: "app-a",
  auth_user_id: "auth-a",
  email: "ava@example.com",
  first_name: "Ava",
  status: "active",
  created_at: new Date(T0).toISOString(),
};

const MEMBER_B = {
  id: "00000000-0000-4000-8000-00000000memb",
  application_id: "app-b",
  auth_user_id: "auth-b",
  email: "bo@example.com",
  first_name: "Bo",
  status: "active",
  created_at: new Date(T0).toISOString(),
};

// Sentinel strings that must never reach a member before publication.
const DRAFT_SENTINEL = "draft-only-sentinel-value";

// A full Xenios30Plan content payload (minus the column-owned fields).
// Provenance rule holds: product references are slugs + dispositions only,
// the supplement Foundation entry is a generic category, and nothing carries
// dosing or treatment vocabulary.
const X30_CONTENT = {
  fitnessDocumentId: "doc-fitness-1",
  nutritionDocumentId: null,
  blueprintActions: ["Walk after lunch most days", "Lights out by 22:30"],
  supplementFoundation: [
    {
      id: "foundation-multivitamin",
      kind: "supplement_foundation",
      title: "A foundation multivitamin",
      disposition: "recommended",
      explanation: "Covers the basics while the routine settles.",
      sourceSignals: ["assessment.nutrition"],
    },
  ],
  productGuidance: [
    {
      id: "guidance-1",
      kind: "product_option",
      title: "sleep-support",
      disposition: "possible_research_pathway",
      explanation: "Flagged from the sleep answers for Samuel's review.",
      sourceSignals: ["assessment.sleep"],
    },
  ],
  adherenceTargets: [{ key: "training_days", label: "Training days", target: "3 per week" }],
  trackerMetricKeys: ["plan_adherence", "sleep_and_recovery"],
  checkInDueAt: null,
};

const X90_CONTENT = {
  phaseGoals: {
    foundation: ["Build the base routine"],
    progression: ["Add challenge gradually"],
    consolidation: ["Make it a lifestyle"],
  },
  milestones: [{ id: "m1", label: "Four steady weeks", targetMonth: 1, done: false }],
  monthlyVersions: [{ monthLabel: "2026-07", xenios30PlanId: "plan-ref-1" }],
};

async function adminCreate30(app: any, memberId: string, monthLabel: string, content: any = {}) {
  const res = await request(app)
    .post("/api/admin/research/plans/xenios30")
    .send({ memberId, monthLabel, content });
  expect(res.status).toBe(200);
  return res.body.plan;
}

async function adminPublish30(app: any, planId: string) {
  const res = await request(app).post(`/api/admin/research/plans/xenios30/${planId}/publish`).send({});
  expect(res.status).toBe(200);
  return res.body.plan;
}

async function adminCreate90(app: any, memberId: string, currentPhase: string, content: any = {}) {
  const res = await request(app)
    .post("/api/admin/research/plans/xenios90")
    .send({ memberId, currentPhase, content });
  expect(res.status).toBe(200);
  return res.body.plan;
}

async function adminPublish90(app: any, planId: string) {
  const res = await request(app).post(`/api/admin/research/plans/xenios90/${planId}/publish`).send({});
  expect(res.status).toBe(200);
  return res.body.plan;
}

function x30Row(planId: string) {
  return state.x30.find((r) => r.id === planId) ?? null;
}

beforeEach(() => {
  state.x30.length = 0;
  state.x90.length = 0;
  state.changes.length = 0;
  state.members.length = 0;
  state.members.push({ ...MEMBER_A }, { ...MEMBER_B });
  auth.current = MEMBER_A;
  auth.deny = null;
  admin.deny = false;
  nowMs = T0;
  notifications = [];
  deps = makeDeps();
  vi.clearAllMocks();
});

describe("review week calendar math", () => {
  it("pins the first Monday after month end for fixed dates, including the plain, Monday, Sunday, and year-end cases", () => {
    // 2026-08-01 is a Saturday, so the first Monday after July is Aug 3.
    expect(firstMondayAfterMonthEnd("2026-07")?.toISOString()).toBe(JULY_REVIEW_WEEK_START);
    // 2026-09-01 is a Tuesday, so the first Monday after August is Sep 7.
    expect(firstMondayAfterMonthEnd("2026-08")?.toISOString()).toBe("2026-09-07T00:00:00.000Z");
    // 2026-06-01 is itself a Monday: the day after the month ends wins.
    expect(firstMondayAfterMonthEnd("2026-05")?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    // 2026-02-01 is a Sunday: Monday lands one day later.
    expect(firstMondayAfterMonthEnd("2026-01")?.toISOString()).toBe("2026-02-02T00:00:00.000Z");
    // Year rollover: 2027-01-01 is a Friday, so the Monday is Jan 4.
    expect(firstMondayAfterMonthEnd("2026-12")?.toISOString()).toBe("2027-01-04T00:00:00.000Z");
  });

  it("rejects malformed month labels", () => {
    expect(firstMondayAfterMonthEnd("2026-13")).toBeNull();
    expect(firstMondayAfterMonthEnd("2026-7")).toBeNull();
    expect(firstMondayAfterMonthEnd("garbage")).toBeNull();
  });

  it("derives the UTC month label from the clock", () => {
    expect(monthLabelFor(new Date(T0))).toBe("2026-07");
    expect(monthLabelFor(new Date("2026-12-31T23:59:59.000Z"))).toBe("2026-12");
    expect(monthLabelFor(new Date("2026-08-01T00:00:00.000Z"))).toBe("2026-08");
  });
});

describe("GET /api/research/plans/xenios30", () => {
  it("returns the empty state with privacy headers before any plan exists", async () => {
    const res = await request(makeApp()).get("/api/research/plans/xenios30");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.body).toEqual({ ok: true, current: null, history: [] });
  });

  it("never serializes draft or samuel_review content to a member, in any field", async () => {
    const app = makeApp();
    await adminCreate30(app, MEMBER_A.id, "2026-07", { blueprintActions: [DRAFT_SENTINEL] });
    // A review-stage row is just as invisible as a draft.
    state.x30.push({
      id: crypto.randomUUID(),
      member_id: MEMBER_A.id,
      month_label: "2026-06",
      version: 1,
      state: "samuel_review",
      content: { blueprintActions: [DRAFT_SENTINEL] },
      reviewed_by: null,
      published_at: null,
      member_acknowledged_at: null,
      created_at: new Date(T0).toISOString(),
      updated_at: new Date(T0).toISOString(),
    });

    const res = await request(app).get("/api/research/plans/xenios30");
    expect(res.status).toBe(200);
    expect(res.body.current).toBeNull();
    expect(res.body.history).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain(DRAFT_SENTINEL);
  });

  it("round-trips the full content jsonb once published, with columns overriding smuggled content keys", async () => {
    const app = makeApp();
    const draft = await adminCreate30(app, MEMBER_A.id, "2026-07", {
      ...X30_CONTENT,
      // Column-owned keys smuggled inside content must never win.
      planId: "hack",
      state: "published",
      version: 99,
      monthLabel: "1999-01",
    });
    expect(draft.state).toBe("draft");
    await adminPublish30(app, draft.planId);

    const res = await request(app).get("/api/research/plans/xenios30");
    expect(res.status).toBe(200);
    const current = res.body.current;
    expect(current.planId).toBe(draft.planId);
    expect(current.monthLabel).toBe("2026-07");
    expect(current.state).toBe("published");
    expect(current.version).toBe(1);
    expect(current.fitnessDocumentId).toBe("doc-fitness-1");
    expect(current.nutritionDocumentId).toBeNull();
    expect(current.blueprintActions).toEqual(X30_CONTENT.blueprintActions);
    expect(current.supplementFoundation).toEqual(X30_CONTENT.supplementFoundation);
    expect(current.productGuidance).toEqual(X30_CONTENT.productGuidance);
    expect(current.adherenceTargets).toEqual(X30_CONTENT.adherenceTargets);
    expect(current.trackerMetricKeys).toEqual(X30_CONTENT.trackerMetricKeys);
    expect(current.checkInDueAt).toBeNull();
    expect(current.reviewedBy).toBe(admin.email);
    expect(current.publishedAt).toBe(new Date(T0).toISOString());
    expect(current.memberAcknowledgedAt).toBeNull();
    expect(res.body.history).toEqual([{ planId: draft.planId, monthLabel: "2026-07", state: "published" }]);
  });

  it("scopes reads to the authenticated member: A never sees B's published plan", async () => {
    const app = makeApp();
    const draft = await adminCreate30(app, MEMBER_B.id, "2026-07", X30_CONTENT);
    await adminPublish30(app, draft.planId);

    const res = await request(app).get("/api/research/plans/xenios30");
    expect(res.body).toEqual({ ok: true, current: null, history: [] });

    auth.current = MEMBER_B;
    const own = await request(app).get("/api/research/plans/xenios30");
    expect(own.body.current.planId).toBe(draft.planId);
  });

  it("denies with the guard's code", async () => {
    auth.deny = { status: 403, code: "activation_required" };
    const res = await request(makeApp()).get("/api/research/plans/xenios30");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("activation_required");
  });
});

describe("acknowledge", () => {
  it("stamps member_acknowledged_at on the member's own published plan, idempotently keeping the first stamp", async () => {
    const app = makeApp();
    const draft = await adminCreate30(app, MEMBER_A.id, "2026-07");
    await adminPublish30(app, draft.planId);

    const first = await request(app).post(`/api/research/plans/xenios30/${draft.planId}/acknowledge`).send({});
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, acknowledgedAt: new Date(T0).toISOString() });
    expect(x30Row(draft.planId).member_acknowledged_at).toBe(new Date(T0).toISOString());

    // A later re-acknowledgment returns the original stamp unchanged.
    nowMs = T0 + 60 * 60 * 1000;
    const second = await request(app).post(`/api/research/plans/xenios30/${draft.planId}/acknowledge`).send({});
    expect(second.status).toBe(200);
    expect(second.body.acknowledgedAt).toBe(new Date(T0).toISOString());
  });

  it("a foreign plan is not_found and stays untouched", async () => {
    const app = makeApp();
    const draft = await adminCreate30(app, MEMBER_B.id, "2026-07");
    await adminPublish30(app, draft.planId);

    auth.current = MEMBER_A;
    const res = await request(app).post(`/api/research/plans/xenios30/${draft.planId}/acknowledge`).send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
    expect(x30Row(draft.planId).member_acknowledged_at).toBeNull();
  });

  it("an unknown plan and the member's own unpublished draft both read as not_found", async () => {
    const app = makeApp();
    const unknown = await request(app)
      .post(`/api/research/plans/xenios30/${crypto.randomUUID()}/acknowledge`)
      .send({});
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("not_found");

    // The member's own draft: acknowledging must not confirm it exists.
    const draft = await adminCreate30(app, MEMBER_A.id, "2026-07", { blueprintActions: [DRAFT_SENTINEL] });
    const res = await request(app).post(`/api/research/plans/xenios30/${draft.planId}/acknowledge`).send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
    expect(JSON.stringify(res.body)).not.toContain(DRAFT_SENTINEL);
  });

  it("a superseded plan is a state_conflict", async () => {
    const app = makeApp();
    const v1 = await adminCreate30(app, MEMBER_A.id, "2026-07");
    await adminPublish30(app, v1.planId);
    const v2 = await adminCreate30(app, MEMBER_A.id, "2026-07");
    await adminPublish30(app, v2.planId);

    const res = await request(app).post(`/api/research/plans/xenios30/${v1.planId}/acknowledge`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
  });
});

describe("early plan change", () => {
  const REASON = "My work schedule changed and the training days no longer fit.";

  it("records the first request of the month and reports it in the review state", async () => {
    const res = await request(makeApp()).post("/api/research/plans/early-change").send({ reason: REASON });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.review).toEqual({
      reviewWeekStart: null, // no published plan yet
      checkInStatus: "not_due",
      earlyChangeUsedThisMonth: true,
      slaDeadline: null,
    });
    expect(state.changes).toHaveLength(1);
    expect(state.changes[0]).toMatchObject({
      member_id: MEMBER_A.id,
      month_label: "2026-07",
      reason: REASON,
      created_at: new Date(T0).toISOString(),
    });
  });

  it("a second request in the same month is a state_conflict; the next month opens a new allowance", async () => {
    const app = makeApp();
    expect((await request(app).post("/api/research/plans/early-change").send({ reason: REASON })).status).toBe(200);

    const second = await request(app).post("/api/research/plans/early-change").send({ reason: REASON });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("state_conflict");
    expect(state.changes).toHaveLength(1);

    nowMs = Date.parse("2026-08-05T10:00:00.000Z");
    const nextMonth = await request(app).post("/api/research/plans/early-change").send({ reason: REASON });
    expect(nextMonth.status).toBe(200);
    expect(nextMonth.body.review.earlyChangeUsedThisMonth).toBe(true);
    expect(state.changes.map((r) => r.month_label)).toEqual(["2026-07", "2026-08"]);
  });

  it("the monthly limit is structural: concurrent requests collapse to exactly one stored row", async () => {
    const app = makeApp();
    const [r1, r2] = await Promise.all([
      request(app).post("/api/research/plans/early-change").send({ reason: REASON }),
      request(app).post("/api/research/plans/early-change").send({ reason: REASON }),
    ]);
    // Whichever interleaving happened, exactly one wins and one conflicts,
    // because the unique (member_id, month_label) constraint backstops the
    // pre-check.
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect(state.changes).toHaveLength(1);
  });

  it("one member's request never consumes another member's allowance", async () => {
    const app = makeApp();
    expect((await request(app).post("/api/research/plans/early-change").send({ reason: REASON })).status).toBe(200);

    auth.current = MEMBER_B;
    const res = await request(app).post("/api/research/plans/early-change").send({ reason: REASON });
    expect(res.status).toBe(200);
    expect(state.changes.map((r) => r.member_id).sort()).toEqual([MEMBER_A.id, MEMBER_B.id].sort());
  });

  it("validates the reason length", async () => {
    const app = makeApp();
    const short = await request(app).post("/api/research/plans/early-change").send({ reason: "too short" });
    expect(short.status).toBe(400);
    expect(short.body.code).toBe("validation_failed");
    expect(short.body.fieldErrors.reason).toBeTruthy();

    const long = await request(app).post("/api/research/plans/early-change").send({ reason: "x".repeat(1001) });
    expect(long.status).toBe(400);
    expect(state.changes).toHaveLength(0);
  });
});

describe("GET /api/research/plans/xenios90 + monthly review state", () => {
  it("is empty and not_due before anything is published", async () => {
    const res = await request(makeApp()).get("/api/research/plans/xenios90");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual({
      ok: true,
      plan: null,
      review: {
        reviewWeekStart: null,
        checkInStatus: "not_due",
        earlyChangeUsedThisMonth: false,
        slaDeadline: null,
      },
    });
  });

  it("review week comes from the latest published xenios30 month and flips checkInStatus exactly at its start", async () => {
    const app = makeApp();
    const draft = await adminCreate30(app, MEMBER_A.id, "2026-07");
    await adminPublish30(app, draft.planId);

    const before = await request(app).get("/api/research/plans/xenios90");
    expect(before.body.review.reviewWeekStart).toBe(JULY_REVIEW_WEEK_START);
    expect(before.body.review.checkInStatus).toBe("not_due");

    nowMs = Date.parse("2026-08-02T23:59:59.000Z");
    const stillBefore = await request(app).get("/api/research/plans/xenios90");
    expect(stillBefore.body.review.checkInStatus).toBe("not_due");

    nowMs = Date.parse(JULY_REVIEW_WEEK_START);
    const atStart = await request(app).get("/api/research/plans/xenios90");
    expect(atStart.body.review.checkInStatus).toBe("due");

    // The service helper agrees with the route.
    const direct = await monthlyReviewStateFor(MEMBER_A.id, new Date(nowMs));
    expect(direct.reviewWeekStart).toBe(JULY_REVIEW_WEEK_START);
    expect(direct.checkInStatus).toBe("due");
  });

  it("draft xenios90 content never reaches the member; publication reveals it with columns authoritative", async () => {
    const app = makeApp();
    const draft = await adminCreate90(app, MEMBER_A.id, "foundation", {
      ...X90_CONTENT,
      phaseGoals: { ...X90_CONTENT.phaseGoals, foundation: [DRAFT_SENTINEL] },
      state: "published",
      version: 42,
    });

    const hidden = await request(app).get("/api/research/plans/xenios90");
    expect(hidden.body.plan).toBeNull();
    expect(JSON.stringify(hidden.body)).not.toContain(DRAFT_SENTINEL);

    await adminPublish90(app, draft.planId);
    const res = await request(app).get("/api/research/plans/xenios90");
    expect(res.body.plan.planId).toBe(draft.planId);
    expect(res.body.plan.state).toBe("published");
    expect(res.body.plan.version).toBe(1);
    expect(res.body.plan.currentPhase).toBe("foundation");
    expect(res.body.plan.milestones).toEqual(X90_CONTENT.milestones);
    expect(res.body.plan.monthlyVersions).toEqual(X90_CONTENT.monthlyVersions);
    expect(res.body.plan.publishedAt).toBe(new Date(T0).toISOString());
  });

  it("publishing a newer xenios90 version supersedes the earlier one", async () => {
    const app = makeApp();
    const v1 = await adminCreate90(app, MEMBER_A.id, "foundation", X90_CONTENT);
    await adminPublish90(app, v1.planId);
    const v2 = await adminCreate90(app, MEMBER_A.id, "progression", X90_CONTENT);
    await adminPublish90(app, v2.planId);

    const res = await request(app).get("/api/research/plans/xenios90");
    expect(res.body.plan.planId).toBe(v2.planId);
    expect(res.body.plan.version).toBe(2);
    expect(res.body.plan.currentPhase).toBe("progression");
    expect(state.x90.find((r) => r.id === v1.planId).state).toBe("superseded");
  });

  it("scopes the ninety-day plan to the authenticated member", async () => {
    const app = makeApp();
    const draft = await adminCreate90(app, MEMBER_B.id, "foundation", X90_CONTENT);
    await adminPublish90(app, draft.planId);

    const res = await request(app).get("/api/research/plans/xenios90");
    expect(res.body.plan).toBeNull();
  });

  it("rejects an unknown phase at creation", async () => {
    const res = await request(makeApp())
      .post("/api/admin/research/plans/xenios90")
      .send({ memberId: MEMBER_A.id, currentPhase: "sprint", content: {} });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(state.x90).toHaveLength(0);
  });
});

describe("admin publish flow", () => {
  it("publishing a second version supersedes the earlier published one for the same month", async () => {
    const app = makeApp();
    const v1 = await adminCreate30(app, MEMBER_A.id, "2026-07");
    await adminPublish30(app, v1.planId);
    const v2 = await adminCreate30(app, MEMBER_A.id, "2026-07");
    expect(v2.version).toBe(2);
    await adminPublish30(app, v2.planId);

    expect(x30Row(v1.planId).state).toBe("superseded");
    expect(x30Row(v2.planId).state).toBe("published");

    const res = await request(app).get("/api/research/plans/xenios30");
    expect(res.body.current.planId).toBe(v2.planId);
    expect(res.body.history).toEqual([
      { planId: v2.planId, monthLabel: "2026-07", state: "published" },
      { planId: v1.planId, monthLabel: "2026-07", state: "superseded" },
    ]);
  });

  it("a newer month becomes current while the earlier month stays published in history", async () => {
    const app = makeApp();
    const july = await adminCreate30(app, MEMBER_A.id, "2026-07");
    await adminPublish30(app, july.planId);
    nowMs = Date.parse("2026-08-10T09:00:00.000Z");
    const august = await adminCreate30(app, MEMBER_A.id, "2026-08");
    await adminPublish30(app, august.planId);

    const res = await request(app).get("/api/research/plans/xenios30");
    expect(res.body.current.planId).toBe(august.planId);
    expect(res.body.history.map((h: any) => h.monthLabel)).toEqual(["2026-08", "2026-07"]);

    // Review week now keys on the August plan.
    const review = await monthlyReviewStateFor(MEMBER_A.id, new Date(nowMs));
    expect(review.reviewWeekStart).toBe("2026-09-07T00:00:00.000Z");
  });

  it("notifies the member exactly once per publish, with the safe payload only", async () => {
    const app = makeApp();
    const draft = await adminCreate30(app, MEMBER_A.id, "2026-07", X30_CONTENT);
    expect(notifications).toHaveLength(0); // creating a draft never notifies
    await adminPublish30(app, draft.planId);

    expect(notifications).toHaveLength(1);
    const sent = notifications[0];
    expect(sent.templateKey).toBe("member_plan_published");
    expect(sent.recipient).toBe(MEMBER_A.email);
    expect(sent.memberId).toBe(MEMBER_A.id);
    expect(sent.payload).toEqual({ firstName: "Ava", monthLabel: "2026-07" });
    expect(Object.keys(sent.payload).sort()).toEqual(["firstName", "monthLabel"]);
    // No plan content, no health data, anywhere in the notification.
    expect(JSON.stringify(sent)).not.toContain("supplementFoundation");
    expect(JSON.stringify(sent)).not.toContain("sleep-support");

    // Publishing the same plan again is a conflict and never re-notifies.
    const again = await request(app)
      .post(`/api/admin/research/plans/xenios30/${draft.planId}/publish`)
      .send({});
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("state_conflict");
    expect(notifications).toHaveLength(1);
  });

  it("xenios90 publish notifies once with firstName only", async () => {
    const app = makeApp();
    const draft = await adminCreate90(app, MEMBER_A.id, "foundation", X90_CONTENT);
    await adminPublish90(app, draft.planId);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].templateKey).toBe("member_plan_published");
    expect(notifications[0].recipient).toBe(MEMBER_A.email);
    expect(notifications[0].payload).toEqual({ firstName: "Ava" });
  });

  it("stamps reviewed_by from the admin session, never from the request body", async () => {
    const app = makeApp();
    const draft = await adminCreate30(app, MEMBER_A.id, "2026-07");
    const res = await request(app)
      .post(`/api/admin/research/plans/xenios30/${draft.planId}/publish`)
      .send({ reviewedBy: "mallory@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.plan.reviewedBy).toBe(admin.email);
    expect(x30Row(draft.planId).reviewed_by).toBe(admin.email);
  });

  it("publishing an unknown plan is not_found; creating for an unknown member is not_found", async () => {
    const app = makeApp();
    const missing = await request(app)
      .post(`/api/admin/research/plans/xenios30/${crypto.randomUUID()}/publish`)
      .send({});
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("not_found");

    const orphan = await request(app)
      .post("/api/admin/research/plans/xenios30")
      .send({ memberId: crypto.randomUUID(), monthLabel: "2026-07", content: {} });
    expect(orphan.status).toBe(404);
    expect(orphan.body.code).toBe("not_found");
    expect(state.x30).toHaveLength(0);
  });

  it("rejects a malformed month label", async () => {
    const res = await request(makeApp())
      .post("/api/admin/research/plans/xenios30")
      .send({ memberId: MEMBER_A.id, monthLabel: "2026-7", content: {} });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.monthLabel).toBeTruthy();
  });

  it("every admin route denies without the admin guard, writing and notifying nothing", async () => {
    admin.deny = true;
    const app = makeApp();
    const attempts = [
      request(app).post("/api/admin/research/plans/xenios30").send({ memberId: MEMBER_A.id, monthLabel: "2026-07", content: {} }),
      request(app).post(`/api/admin/research/plans/xenios30/${crypto.randomUUID()}/publish`).send({}),
      request(app).post("/api/admin/research/plans/xenios90").send({ memberId: MEMBER_A.id, currentPhase: "foundation", content: {} }),
      request(app).post(`/api/admin/research/plans/xenios90/${crypto.randomUUID()}/publish`).send({}),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("admin_required");
    }
    expect(state.x30).toHaveLength(0);
    expect(state.x90).toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });
});

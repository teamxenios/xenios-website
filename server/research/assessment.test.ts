import crypto from "crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Assessment tests: definition integrity (structured flags, never dosing or
// diagnosis), member-scoped autosave, adaptive-branching submission rules,
// the 72 hour deadline, and the milestone reminder sweep. Supabase is an
// in-memory fake; auth and the rate limiter are mocked so member identity
// and throttle outcomes are chosen per test.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  responses: [] as any[],
  members: [] as any[],
}));

const auth = vi.hoisted(() => ({
  current: null as any,
  deny: null as { status: number; code: string } | null,
}));

const rl = vi.hoisted(() => ({
  allow: true,
  calls: [] as Array<[string, number, number]>,
}));

// Consent gate seam: the routes require an accepted current-version
// XR-MEM-012 before any answer is stored. Default granted; the gate tests
// flip it off.
const consent = vi.hoisted(() => ({ accepted: true }));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list = table === "research_assessment_responses" ? state.responses : state.members;
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    let isNullCol: string | null = null;
    let limitN: number | null = null;

    const applyFilters = (rows: any[]) =>
      rows.filter(
        (r) =>
          filters.every(([c, v]) => r[c] === v) &&
          (isNullCol === null || r[isNullCol] === null),
      );
    const finish = () => {
      if (mode === "insert") {
        if (
          table === "research_assessment_responses" &&
          list.some(
            (r: any) =>
              r.member_id === insertPayload.member_id &&
              r.definition_id === insertPayload.definition_id &&
              r.mode === insertPayload.mode,
          )
        ) {
          return { data: null, error: { message: "duplicate key value violates unique constraint" } };
        }
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...insertPayload };
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
      is: (c: string, v: any) => { if (v === null) isNullCol = c; return api; },
      in: (c: string, vs: any[]) => { filters.push([c, vs[0]]); return api; },
      order: () => api,
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

vi.mock("./rate-limit", () => ({
  rateLimitHit: vi.fn(async (key: string, windowSeconds: number, maxHits: number) => {
    rl.calls.push([key, windowSeconds, maxHits]);
    return rl.allow;
  }),
  requestIp: () => "10.0.0.1",
}));

vi.mock("./agreements", () => ({
  hasAcceptedCurrent: vi.fn(async (_memberId: string, key: string) =>
    key === "XR-MEM-012" ? consent.accepted : false,
  ),
}));

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import {
  assessmentStatusForMember,
  INITIAL_ASSESSMENT_DEFINITION,
  listAssessmentQuestions,
  registerAssessmentApi,
} from "./assessment";
import { sweepAssessmentReminders } from "./assessment-reminders";
import type { MemberPlatformDeps } from "./member-platform-deps";

// Deterministic clock + recording notifier.
const T0 = Date.parse("2026-07-01T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DUE_ISO = "2026-07-04T00:00:00.000Z"; // T0 + 72h

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
  registerAssessmentApi(app, deps);
  return app;
}

const MEMBER_A = {
  id: "00000000-0000-4000-8000-00000000mema",
  application_id: "app-a",
  auth_user_id: "auth-a",
  email: "ava@example.com",
  first_name: "Ava",
  status: "active",
  activated_at: new Date(T0).toISOString(),
  created_at: new Date(T0).toISOString(),
};

const MEMBER_B = {
  id: "00000000-0000-4000-8000-00000000memb",
  application_id: "app-b",
  auth_user_id: "auth-b",
  email: "bo@example.com",
  first_name: "Bo",
  status: "active",
  activated_at: new Date(T0).toISOString(),
  created_at: new Date(T0).toISOString(),
};

function rowFor(memberId: string) {
  return state.responses.find((r) => r.member_id === memberId) ?? null;
}

// Valid default answer for any question kind. Overrides replace a value;
// an explicit undefined override omits the answer entirely.
function defaultValueFor(question: any) {
  switch (question.kind) {
    case "single_choice":
      return question.options[0].value;
    case "multi_choice":
      return [question.options[0].value];
    case "scale":
    case "number":
      return question.min ?? 0;
    default:
      return "synthetic answer";
  }
}

function fullAnswers(overrides: Record<string, unknown> = {}) {
  const answers = listAssessmentQuestions()
    .filter((q) => !(q.id in overrides))
    .map((q) => ({ questionId: q.id, value: defaultValueFor(q) }));
  for (const [questionId, value] of Object.entries(overrides)) {
    if (value !== undefined) answers.push({ questionId, value });
  }
  return answers;
}

function autosaveBody(answers: any[], version = 1) {
  return {
    definitionId: "initial-v1",
    definitionVersion: version,
    answers,
    clientSavedAt: new Date(nowMs).toISOString(),
  };
}

const SUBMIT_BODY = { definitionId: "initial-v1", definitionVersion: 1, confirmReviewed: true };

beforeEach(() => {
  state.responses.length = 0;
  state.members.length = 0;
  auth.current = MEMBER_A;
  auth.deny = null;
  rl.allow = true;
  rl.calls.length = 0;
  consent.accepted = true;
  nowMs = T0;
  notifications = [];
  deps = makeDeps();
  vi.clearAllMocks();
});

describe("definition integrity", () => {
  const questions = INITIAL_ASSESSMENT_DEFINITION.sections.flatMap((s) => s.questions);

  it("has the canon sections in order and a sane question count", () => {
    expect(INITIAL_ASSESSMENT_DEFINITION.definitionId).toBe("initial-v1");
    expect(INITIAL_ASSESSMENT_DEFINITION.version).toBe(1);
    expect(INITIAL_ASSESSMENT_DEFINITION.mode).toBe("initial");
    expect(INITIAL_ASSESSMENT_DEFINITION.targetMinutes).toBe(10);
    expect(INITIAL_ASSESSMENT_DEFINITION.sections.map((s) => s.id)).toEqual([
      "goals",
      "body_and_routine",
      "fitness",
      "nutrition",
      "sleep",
      "energy",
      "stress",
      "current_products",
      "allergies_and_restrictions",
      "basic_safety_context",
      "budget",
      "routine_complexity",
      "preferences",
      "direction_30_90",
    ]);
    expect(INITIAL_ASSESSMENT_DEFINITION.sections.map((s) => s.order)).toEqual(
      INITIAL_ASSESSMENT_DEFINITION.sections.map((_, i) => i + 1),
    );
    expect(questions.length).toBeGreaterThanOrEqual(30);
    expect(questions.length).toBeLessThanOrEqual(38);
    // Ids are unique and every question belongs to its declared section.
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    for (const section of INITIAL_ASSESSMENT_DEFINITION.sections) {
      for (const q of section.questions) expect(q.sectionId).toBe(section.id);
    }
    // Choice questions always carry options.
    for (const q of questions) {
      if (q.kind === "single_choice" || q.kind === "multi_choice") {
        expect(q.options && q.options.length > 0).toBe(true);
      }
    }
  });

  it("every showWhen references an existing question, with at least three adaptive questions", () => {
    const ids = new Set(questions.map((q) => q.id));
    const adaptive = questions.filter((q) => q.showWhen && q.showWhen.length > 0);
    expect(adaptive.length).toBeGreaterThanOrEqual(3);
    for (const q of adaptive) {
      for (const condition of q.showWhen!) {
        expect(ids.has(condition.questionId)).toBe(true);
        expect(condition.questionId).not.toBe(q.id);
        expect(condition.equals.length).toBeGreaterThan(0);
      }
    }
  });

  it("carries the consent reference where the health questions begin", () => {
    const bodySection = INITIAL_ASSESSMENT_DEFINITION.sections.find((s) => s.id === "body_and_routine")!;
    expect(bodySection.questions[0].consentRef).toBe("XR-MEM-012");
  });

  it("contains no dosing, medication-direction, or diagnosis language", () => {
    const banned = /(dose|dosage|dosing|milligram|microgram|\bmg\b|\bmcg\b|prescri|diagnos|medicat|inject)/i;
    for (const q of questions) {
      expect(q.prompt).not.toMatch(banned);
      for (const option of q.options ?? []) {
        expect(option.label).not.toMatch(banned);
        expect(option.value).not.toMatch(banned);
      }
    }
    // Safety context stays structured: choices only, no free-text symptom capture.
    const safety = INITIAL_ASSESSMENT_DEFINITION.sections.find((s) => s.id === "basic_safety_context")!;
    for (const q of safety.questions) expect(q.kind).toBe("single_choice");
  });
});

describe("GET /api/research/assessment", () => {
  it("creates the member's response on first open, stamps startedAt, and sets privacy headers", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/research/assessment");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.body.definition.definitionId).toBe("initial-v1");
    expect(res.body.response.status).toBe("in_progress");
    expect(res.body.response.startedAt).toBe(new Date(T0).toISOString());
    expect(res.body.status).toEqual({
      required: true,
      status: "in_progress",
      dueAt: DUE_ISO,
      overdue: false,
      remindersSent: 0,
    });
    expect(rowFor(MEMBER_A.id)).toBeTruthy();
  });

  it("denies a non-active member with the guard's code and creates nothing", async () => {
    auth.deny = { status: 403, code: "activation_required" };
    const res = await request(makeApp()).get("/api/research/assessment");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("activation_required");
    expect(state.responses).toHaveLength(0);
  });
});

describe("autosave", () => {
  it("merges partial saves by questionId into one member-scoped row", async () => {
    const app = makeApp();
    const first = await request(app)
      .post("/api/research/assessment/responses")
      .send(autosaveBody([{ questionId: "primary_goal", value: "strength" }]));
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, lastSavedAt: new Date(T0).toISOString() });

    nowMs = T0 + 5 * 60 * 1000;
    const second = await request(app)
      .post("/api/research/assessment/responses")
      .send(
        autosaveBody([
          { questionId: "goal_meaning", value: "steadier energy and a keepable routine" },
          { questionId: "primary_goal", value: "energy" },
        ]),
      );
    expect(second.status).toBe(200);
    expect(second.body.lastSavedAt).toBe(new Date(nowMs).toISOString());

    const row = rowFor(MEMBER_A.id);
    expect(row.answers).toEqual({
      primary_goal: "energy",
      goal_meaning: "steadier energy and a keepable routine",
    });
    expect(state.responses).toHaveLength(1);
  });

  it("scopes writes to the authenticated member: A cannot touch B's row", async () => {
    const app = makeApp();
    auth.current = MEMBER_B;
    await request(app)
      .post("/api/research/assessment/responses")
      .send(autosaveBody([{ questionId: "primary_goal", value: "longevity" }]));

    auth.current = MEMBER_A;
    await request(app)
      .post("/api/research/assessment/responses")
      .send(autosaveBody([{ questionId: "primary_goal", value: "strength" }]));

    expect(rowFor(MEMBER_B.id).answers).toEqual({ primary_goal: "longevity" });
    expect(rowFor(MEMBER_A.id).answers).toEqual({ primary_goal: "strength" });
    // The route derives identity from the session, never the body: no row
    // beyond the two members' own exists, and B's row is unchanged by A's save.
    expect(state.responses).toHaveLength(2);
  });

  it("denies pending and cancelled members with the real guard codes, writing nothing", async () => {
    for (const code of ["activation_required", "membership_inactive"]) {
      auth.deny = { status: 403, code };
      const res = await request(makeApp())
        .post("/api/research/assessment/responses")
        .send(autosaveBody([{ questionId: "primary_goal", value: "strength" }]));
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ ok: false, code });
    }
    expect(state.responses).toHaveLength(0);
  });

  it("a stale definition version is a state_conflict carrying the current version", async () => {
    const res = await request(makeApp())
      .post("/api/research/assessment/responses")
      .send(autosaveBody([{ questionId: "primary_goal", value: "strength" }], 2));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
    expect(res.body.message).toContain("version 1");
    expect(state.responses).toHaveLength(0);
  });

  it("an unknown questionId fails validation and nothing is merged", async () => {
    const res = await request(makeApp())
      .post("/api/research/assessment/responses")
      .send(
        autosaveBody([
          { questionId: "primary_goal", value: "strength" },
          { questionId: "not_a_question", value: "x" },
        ]),
      );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.not_a_question).toBeTruthy();
    expect(state.responses).toHaveLength(0);
  });

  it("a value outside the question's options fails validation", async () => {
    const res = await request(makeApp())
      .post("/api/research/assessment/responses")
      .send(autosaveBody([{ questionId: "primary_goal", value: "not_an_option" }]));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.primary_goal).toBeTruthy();
  });

  it("returns 429 rate_limited when the throttle denies, keyed per member", async () => {
    rl.allow = false;
    const res = await request(makeApp())
      .post("/api/research/assessment/responses")
      .send(autosaveBody([{ questionId: "primary_goal", value: "strength" }]));
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("rate_limited");
    expect(rl.calls).toContainEqual([`assessment-autosave:${MEMBER_A.id}`, 60, 30]);
    expect(state.responses).toHaveLength(0);
  });
});

describe("submit", () => {
  async function saveAll(app: any, overrides: Record<string, unknown> = {}) {
    const res = await request(app)
      .post("/api/research/assessment/responses")
      .send(autosaveBody(fullAnswers(overrides)));
    expect(res.status).toBe(200);
  }

  it("blocks on missing required visible answers and lists them", async () => {
    const app = makeApp();
    await saveAll(app, { goal_meaning: undefined, sleep_quality: undefined });
    const res = await request(app).post("/api/research/assessment/submit").send(SUBMIT_BODY);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(Object.keys(res.body.fieldErrors).sort()).toEqual(["goal_meaning", "sleep_quality"]);
    expect(res.body.message).toContain("goal_meaning");
    expect(rowFor(MEMBER_A.id).status).toBe("in_progress");
  });

  it("a required question hidden by branching does not block submission", async () => {
    const app = makeApp();
    // has_injuries=no hides injury_details, so leaving it unanswered is fine.
    await saveAll(app, { has_injuries: "no", injury_details: undefined });
    const res = await request(app).post("/api/research/assessment/submit").send(SUBMIT_BODY);
    expect(res.status).toBe(200);
    expect(res.body.response.status).toBe("submitted");
  });

  it("the same required question blocks when its branch is visible", async () => {
    const app = makeApp();
    await saveAll(app, { has_injuries: "yes", injury_details: undefined });
    const res = await request(app).post("/api/research/assessment/submit").send(SUBMIT_BODY);
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fieldErrors)).toEqual(["injury_details"]);
  });

  it("requires the review confirmation literal", async () => {
    const app = makeApp();
    await saveAll(app);
    const res = await request(app)
      .post("/api/research/assessment/submit")
      .send({ ...SUBMIT_BODY, confirmReviewed: false });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
  });

  it("locks the response, reports the blueprint transition, and flips the tracker signal", async () => {
    const app = makeApp();
    await saveAll(app);
    nowMs = T0 + 2 * HOUR;
    const res = await request(app).post("/api/research/assessment/submit").send(SUBMIT_BODY);
    expect(res.status).toBe(200);
    expect(res.body.blueprintState).toBe("assessment_submitted");
    expect(res.body.response.status).toBe("submitted");
    expect(res.body.response.submittedAt).toBe(new Date(nowMs).toISOString());

    // The tracker-unlock signal: the status summary now reads submitted.
    const status = await assessmentStatusForMember(MEMBER_A as any, new Date(nowMs));
    expect(status.status).toBe("submitted");

    // Autosave after the lock is refused.
    const after = await request(app)
      .post("/api/research/assessment/responses")
      .send(autosaveBody([{ questionId: "primary_goal", value: "energy" }]));
    expect(after.status).toBe(409);
    expect(after.body.code).toBe("state_conflict");
  });

  it("double submit is a state_conflict", async () => {
    const app = makeApp();
    await saveAll(app);
    const first = await request(app).post("/api/research/assessment/submit").send(SUBMIT_BODY);
    expect(first.status).toBe(200);
    const second = await request(app).post("/api/research/assessment/submit").send(SUBMIT_BODY);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("state_conflict");
  });

  it("a stale definition version cannot submit", async () => {
    const app = makeApp();
    await saveAll(app);
    const res = await request(app)
      .post("/api/research/assessment/submit")
      .send({ ...SUBMIT_BODY, definitionVersion: 2 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
  });
});

describe("deadline math", () => {
  it("dueAt is activation plus 72 hours and overdue flips only after it, only unsubmitted", async () => {
    const before = await assessmentStatusForMember(MEMBER_A as any, new Date(T0 + 71 * HOUR));
    expect(before.dueAt).toBe(DUE_ISO);
    expect(before.overdue).toBe(false);
    expect(before.status).toBe("not_started");

    const after = await assessmentStatusForMember(MEMBER_A as any, new Date(T0 + 73 * HOUR));
    expect(after.overdue).toBe(true);

    // Submitted members are never overdue.
    state.responses.push({
      id: crypto.randomUUID(),
      member_id: MEMBER_A.id,
      definition_id: "initial-v1",
      definition_version: 1,
      mode: "initial",
      status: "submitted",
      answers: {},
      started_at: new Date(T0).toISOString(),
      last_saved_at: new Date(T0).toISOString(),
      submitted_at: new Date(T0 + HOUR).toISOString(),
      reminders_sent: 1,
    });
    const submitted = await assessmentStatusForMember(MEMBER_A as any, new Date(T0 + 100 * HOUR));
    expect(submitted.status).toBe("submitted");
    expect(submitted.overdue).toBe(false);
    expect(submitted.remindersSent).toBe(1);
  });

  it("a member with no activation time has no deadline", async () => {
    const status = await assessmentStatusForMember(
      { ...MEMBER_A, activated_at: null } as any,
      new Date(T0 + 200 * HOUR),
    );
    expect(status.dueAt).toBeNull();
    expect(status.overdue).toBe(false);
  });

  it("the boundary itself is not overdue; one millisecond past it is", async () => {
    const atDue = await assessmentStatusForMember(MEMBER_A as any, new Date(T0 + 72 * HOUR));
    expect(atDue.overdue).toBe(false);
    const pastDue = await assessmentStatusForMember(MEMBER_A as any, new Date(T0 + 72 * HOUR + 1));
    expect(pastDue.overdue).toBe(true);
  });
});

describe("reminder sweep", () => {
  beforeEach(() => {
    state.members.push({ ...MEMBER_A });
  });

  it("sends the 0h, 24h, 48h, and 72h reminders exactly once each, then goes quiet", async () => {
    for (const [index, offsetHours] of [0, 24, 48, 72].entries()) {
      nowMs = T0 + offsetHours * HOUR + 60 * 1000;
      expect(await sweepAssessmentReminders(deps)).toBe(1);
      const latest = notifications[notifications.length - 1];
      expect(latest.eventKey).toBe(`assessment-due:${MEMBER_A.id}:${index}`);
      expect(latest.eventType).toBe("assessment_due_member");
      expect(latest.templateKey).toBe("member_assessment_due");
      expect(latest.recipient).toBe(MEMBER_A.email);
      expect(latest.payload).toEqual({ firstName: "Ava", dueAt: DUE_ISO });
      // Idempotent: the same sweep at the same clock sends nothing more.
      expect(await sweepAssessmentReminders(deps)).toBe(0);
    }
    expect(notifications).toHaveLength(4);
    expect(new Set(notifications.map((n) => n.eventKey)).size).toBe(4);
    expect(rowFor(MEMBER_A.id).reminders_sent).toBe(4);

    // After day 3 only the dashboard overdue state continues; no more email.
    nowMs = T0 + 96 * HOUR;
    expect(await sweepAssessmentReminders(deps)).toBe(0);
    expect(notifications).toHaveLength(4);
  });

  it("the sweep-created row never fakes a member start", async () => {
    nowMs = T0 + 60 * 1000;
    await sweepAssessmentReminders(deps);
    expect(rowFor(MEMBER_A.id).started_at).toBeNull();
  });

  it("a late sweep catches up with one email, not a backlog", async () => {
    nowMs = T0 + 49 * HOUR;
    expect(await sweepAssessmentReminders(deps)).toBe(1);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].eventKey).toBe(`assessment-due:${MEMBER_A.id}:2`);
    expect(rowFor(MEMBER_A.id).reminders_sent).toBe(3);

    nowMs = T0 + 73 * HOUR;
    expect(await sweepAssessmentReminders(deps)).toBe(1);
    expect(notifications[1].eventKey).toBe(`assessment-due:${MEMBER_A.id}:3`);
  });

  it("stops after submission", async () => {
    state.responses.push({
      id: crypto.randomUUID(),
      member_id: MEMBER_A.id,
      definition_id: "initial-v1",
      definition_version: 1,
      mode: "initial",
      status: "submitted",
      answers: {},
      started_at: new Date(T0).toISOString(),
      last_saved_at: new Date(T0).toISOString(),
      submitted_at: new Date(T0 + HOUR).toISOString(),
      reminders_sent: 1,
    });
    nowMs = T0 + 25 * HOUR;
    expect(await sweepAssessmentReminders(deps)).toBe(0);
    expect(notifications).toHaveLength(0);
  });

  it("only active members are swept", async () => {
    state.members.length = 0;
    state.members.push({ ...MEMBER_B, status: "pending_activation" });
    nowMs = T0 + 60 * 1000;
    expect(await sweepAssessmentReminders(deps)).toBe(0);
    expect(notifications).toHaveLength(0);
    expect(state.responses).toHaveLength(0);
  });

  it("a member without an activation time is skipped", async () => {
    state.members.length = 0;
    state.members.push({ ...MEMBER_B, activated_at: null });
    nowMs = T0 + 60 * 1000;
    expect(await sweepAssessmentReminders(deps)).toBe(0);
    expect(notifications).toHaveLength(0);
  });
});

describe("the sensitive health data consent gate (XR-MEM-012)", () => {
  it("refuses autosave without the accepted current consent, storing nothing", async () => {
    consent.accepted = false;
    const res = await request(makeApp())
      .post("/api/research/assessment/responses")
      .send({ definitionId: "initial-v1", definitionVersion: 1, answers: [{ questionId: "primary_goal", value: "recover_faster" }], clientSavedAt: new Date(T0).toISOString() });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
    expect(res.body.message).toContain("XR-MEM-012");
    expect(state.responses).toHaveLength(0);
  });

  it("refuses submission without the accepted current consent", async () => {
    consent.accepted = false;
    const res = await request(makeApp())
      .post("/api/research/assessment/submit")
      .send({ definitionId: "initial-v1", definitionVersion: 1, confirmReviewed: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
    expect(res.body.message).toContain("XR-MEM-012");
  });
});


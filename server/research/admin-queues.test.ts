import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Samuel admin queue tests. The load-bearing properties, in order of how much
// damage getting them wrong would do:
//
// 1. The payload wall. A queue list is the widest-angle view of the membership
//    that exists, so every seeded row carries an obvious sensitive marker (a
//    blueprint recommendation, plan content, a question body, an applicant's
//    free text, an email) and every list and detail response is asserted to
//    contain NONE of them.
// 2. Opaque subject refs. The list never carries a raw member id, the ref is
//    stable across calls, and the same member gets a different ref per queue.
// 3. Defensive reads. Waves land independently, so a MISSING table must read
//    as an empty queue rather than a 500 on Samuel's console.
// 4. The guard. requireSupabaseAdmin on both routes, proven by denial.
//
// Supabase is an in-memory fake whose table registry is per test: a table that
// was never registered answers with an error, which is exactly how a
// not-yet-migrated table behaves. The admin gate and the capability registry
// are mocked so denial and capability state are chosen per test.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
}));

const admin = vi.hoisted(() => ({ allow: true }));

const caps = vi.hoisted(() => ({
  values: {} as Record<string, boolean>,
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list: any[] | null = Object.prototype.hasOwnProperty.call(state.tables, table)
      ? state.tables[table]
      : null;

    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    let limitN: number | null = null;

    const matches = (r: any) =>
      filters.every(([c, v]) => r[c] === v) && inFilters.every(([c, vs]) => vs.includes(r[c]));

    const finish = () => {
      // The not-yet-migrated case: the table does not exist, so the client
      // reports an error and every collector must read it as empty.
      if (list === null) {
        return { data: null, error: { message: `relation "${table}" does not exist` } };
      }
      let rows = list.filter(matches);
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows.map((r) => ({ ...r })), error: null };
    };

    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => {
        filters.push([c, v]);
        return api;
      },
      in: (c: string, vs: any[]) => {
        inFilters.push([c, vs]);
        return api;
      },
      is: () => api,
      order: () => api,
      limit: (n: number) => {
        limitN = n;
        return api;
      },
      maybeSingle: async () => {
        const r = finish();
        const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
        return { data: d, error: r.error };
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
    getSupabaseAnon: () => {
      throw new Error("not used in tests");
    },
  };
});

// The admin gate: per-test allow/deny so a non-admin session can be proven to
// reach neither route.
vi.mock("../routes", () => ({
  requireSupabaseAdmin: (req: any, res: any, next: any) => {
    if (!admin.allow) return res.status(403).json({ ok: false, code: "admin_required" });
    req.adminEmail = "admin@example.com";
    next();
  },
}));

// Member auth is only in the graph through sibling modules; stubbing it keeps
// those imports inert and keeps this suite off the session secret.
vi.mock("./member-auth", () => ({
  requireActiveMember: (_req: any, _res: any, next: any) => next(),
  requireMember: (_req: any, _res: any, next: any) => next(),
}));

// Capability state is chosen per test. Mocking the registry rather than
// setting the flag environment variables keeps this suite from leaking flags
// into other suites in the same worker.
vi.mock("./capabilities", () => ({
  capabilityEnabled: (capability: string) => caps.values[capability] !== false,
}));

import { MEMBER_QUESTIONS_TABLE, registerAdminQueuesApi, subjectRefFor } from "./admin-queues";
import { ADMIN_QUEUE_KEYS } from "@shared/research/member-platform";
import { SLA_WINDOW_HOURS } from "./sla";
import { MEMBER_QUESTIONS_TABLE as QUESTIONS_WAVE_TABLE } from "./questions";
import type { MemberPlatformDeps } from "./member-platform-deps";

// The brief's env rule: snapshot anything this file touches and put it back,
// because process.env is shared across test files in a worker.
const ENV_KEYS = ["RESEARCH_QUEUE_REF_SALT", "RESEARCH_SESSION_SECRET"] as const;
const ENV_SNAPSHOT: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) ENV_SNAPSHOT[key] = process.env[key];
process.env.RESEARCH_QUEUE_REF_SALT = "queue-ref-salt-for-vitest";

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (ENV_SNAPSHOT[key] === undefined) delete process.env[key];
    else process.env[key] = ENV_SNAPSHOT[key];
  }
});

const T0 = Date.parse("2026-07-19T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function iso(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString();
}

let nowMs = T0;

function makeDeps(): MemberPlatformDeps {
  return {
    clock: { now: () => new Date(nowMs) },
    notifier: { notify: vi.fn(async () => true) },
  };
}

function makeApp() {
  const app = express();
  app.use(express.json());
  registerAdminQueuesApi(app, makeDeps());
  return app;
}

// ---------------------------------------------------------------------------
// Seeds. Every one carries an obvious sensitive marker so the payload wall can
// be asserted rather than assumed.
// ---------------------------------------------------------------------------

const MEMBER_A = {
  id: "00000000-0000-4000-8000-0000000000a1",
  application_id: "app-a",
  auth_user_id: "auth-a",
  email: "ava@example.com",
  first_name: "Ava",
  status: "active",
  activated_at: iso(-5 * DAY),
  created_at: iso(-10 * DAY),
  updated_at: iso(-5 * DAY),
};

const MEMBER_B = {
  id: "00000000-0000-4000-8000-0000000000b2",
  application_id: "app-b",
  auth_user_id: "auth-b",
  email: "bo@example.com",
  first_name: "Bo",
  status: "paused",
  activated_at: iso(-30 * DAY),
  created_at: iso(-40 * DAY),
  updated_at: iso(-3 * DAY),
};

const MEMBER_C = {
  id: "00000000-0000-4000-8000-0000000000c3",
  application_id: "app-c",
  auth_user_id: "auth-c",
  email: "cy@example.com",
  first_name: "Cy",
  status: "cancelled",
  activated_at: iso(-60 * DAY),
  created_at: iso(-70 * DAY),
  updated_at: iso(-10 * DAY),
};

const MEMBER_D = {
  id: "00000000-0000-4000-8000-0000000000d4",
  application_id: "app-d",
  auth_user_id: "auth-d",
  email: "di@example.com",
  first_name: "Di",
  status: "closed",
  activated_at: iso(-20 * DAY),
  created_at: iso(-25 * DAY),
  updated_at: iso(-1 * DAY),
};

const MARKERS = [
  "SENSITIVE_BLUEPRINT_RECOMMENDATION",
  "SENSITIVE_PLAN_CONTENT",
  "SENSITIVE_QUESTION_BODY",
  "SENSITIVE_QUESTION_ANSWER",
  "SENSITIVE_APPLICATION_GOALS",
  "SENSITIVE_ASSESSMENT_ANSWER",
  "INTERNAL_REVIEW_NOTE",
  "transcript-media-1",
  "@example.com",
];

function seedEverything() {
  state.tables = {
    research_members: [MEMBER_A, MEMBER_B, MEMBER_C, MEMBER_D],
    research_applications: [
      {
        id: "application-1",
        first_name: "Cass",
        last_name: "Rivera",
        email: "cass@example.com",
        status: "submitted",
        goals_text: "SENSITIVE_APPLICATION_GOALS",
        fit_text: "SENSITIVE_APPLICATION_GOALS too",
        applicant_type: "individual",
        submitted_at: iso(-1 * DAY),
        created_at: iso(-1 * DAY),
      },
      {
        id: "application-2",
        first_name: "Dev",
        email: "dev@example.com",
        status: "approved_pending_payment",
        submitted_at: iso(-2 * DAY),
        created_at: iso(-2 * DAY),
      },
    ],
    research_agreement_acceptances: [
      {
        id: "acc-1",
        subject_type: "member",
        subject_id: MEMBER_A.id,
        agreement_key: "XR-MEM-001",
        agreement_version: "0.1.0-draft",
        decision: "accepted",
        created_at: iso(-9 * DAY),
      },
    ],
    research_assessment_responses: [],
    research_blueprints: [
      {
        id: "blueprint-1",
        member_id: MEMBER_A.id,
        version: 2,
        state: "samuel_review",
        content: { recommendations: ["SENSITIVE_BLUEPRINT_RECOMMENDATION"] },
        review_comment: "INTERNAL_REVIEW_NOTE",
        assessment_response_id: "response-1",
        created_at: iso(-3 * DAY),
        updated_at: iso(-3 * DAY),
      },
      {
        id: "blueprint-2",
        member_id: MEMBER_A.id,
        version: 1,
        state: "published",
        content: { recommendations: ["SENSITIVE_BLUEPRINT_RECOMMENDATION"] },
        created_at: iso(-20 * DAY),
        updated_at: iso(-20 * DAY),
      },
    ],
    research_xenios30_plans: [
      {
        id: "plan-1",
        member_id: MEMBER_A.id,
        month_label: "2026-08",
        version: 1,
        state: "draft",
        content: { blueprintActions: ["SENSITIVE_PLAN_CONTENT"] },
        created_at: iso(-1 * DAY),
        updated_at: iso(-1 * DAY),
      },
    ],
    research_member_questions: [
      {
        id: "question-1",
        member_id: MEMBER_A.id,
        category: "plan",
        status: "pending",
        source: "telegram_text",
        body_text: "SENSITIVE_QUESTION_BODY",
        answer_text: "SENSITIVE_QUESTION_ANSWER",
        transcript_media_id: "transcript-media-1",
        created_at: iso(-20 * HOUR),
        sla_target_at: iso(-8 * HOUR),
      },
      {
        id: "question-2",
        member_id: MEMBER_A.id,
        category: "account",
        status: "completed",
        source: "web",
        body_text: "SENSITIVE_QUESTION_BODY",
        created_at: iso(-40 * HOUR),
      },
    ],
  };
}

beforeEach(() => {
  nowMs = T0;
  admin.allow = true;
  caps.values = {};
  seedEverything();
});

async function getQueue(queue: string, query = "") {
  return request(makeApp()).get(`/api/admin/research/queues/${queue}${query}`);
}

function expectNoSensitiveMarkers(payload: unknown) {
  const body = JSON.stringify(payload);
  for (const marker of MARKERS) expect(body).not.toContain(marker);
}

// ---------------------------------------------------------------------------

describe("GET /api/admin/research/queues/:queue", () => {
  it("returns a well-formed page for every one of the twelve queue keys", async () => {
    for (const queue of ADMIN_QUEUE_KEYS) {
      const res = await getQueue(queue);
      expect(res.status, queue).toBe(200);
      expect(res.body.ok, queue).toBe(true);
      expect(res.body.page.queue, queue).toBe(queue);
      expect(Array.isArray(res.body.page.items), queue).toBe(true);
      expect(typeof res.body.page.total, queue).toBe("number");
      expect(res.body.page.total, queue).toBeGreaterThanOrEqual(res.body.page.items.length);
      expect(res.body.page.nextCursor === null || typeof res.body.page.nextCursor === "string", queue).toBe(true);
      for (const item of res.body.page.items) {
        expect(item.queue, queue).toBe(queue);
        expect(typeof item.itemId, queue).toBe("string");
        expect(typeof item.subjectRef, queue).toBe("string");
        expect(typeof item.safeSummary, queue).toBe("string");
        expect(["critical", "high", "normal"], queue).toContain(item.priority);
        expect(typeof item.requiresStepUp, queue).toBe("boolean");
        expect(typeof item.createdAt, queue).toBe("string");
      }
    }
  });

  it("sets the privacy headers on every queue response", async () => {
    const res = await getQueue("questions");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("refuses an unknown queue key with validation_failed", async () => {
    const res = await getQueue("not_a_queue");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.queue).toBeTruthy();
  });

  it("reports the queues whose source tables belong to later waves as empty, not as errors", async () => {
    for (const queue of ["privacy_requests", "security_events", "product_concerns"]) {
      const res = await getQueue(queue);
      expect(res.status, queue).toBe(200);
      expect(res.body.page.items, queue).toEqual([]);
      expect(res.body.page.total, queue).toBe(0);
      expect(res.body.page.nextCursor, queue).toBeNull();
    }
  });

  // The independent-waves property: nothing is migrated yet, so every read
  // errors and every queue must still answer.
  it("reads MISSING tables as empty queues rather than failing", async () => {
    state.tables = {};
    for (const queue of ADMIN_QUEUE_KEYS) {
      const res = await getQueue(queue);
      expect(res.status, queue).toBe(200);
      expect(res.body.ok, queue).toBe(true);
      expect(res.body.page.items, queue).toEqual([]);
      expect(res.body.page.total, queue).toBe(0);
    }
  });

  it("still fills the queues that can be computed when only some tables exist", async () => {
    // The questions wave has not landed; the members table has.
    delete state.tables.research_member_questions;
    const questions = await getQueue("questions");
    expect(questions.status).toBe(200);
    expect(questions.body.page.total).toBe(0);

    const blocks = await getQueue("account_blocks");
    expect(blocks.body.page.total).toBe(3);
  });
});

describe("the payload wall", () => {
  it("never leaks a seeded sensitive marker or an email into any queue list", async () => {
    for (const queue of ADMIN_QUEUE_KEYS) {
      const res = await getQueue(queue);
      expectNoSensitiveMarkers(res.body);
    }
  });

  it("never leaks a raw member id into a queue list", async () => {
    for (const queue of ADMIN_QUEUE_KEYS) {
      const body = JSON.stringify(await getQueue(queue).then((r) => r.body));
      for (const member of [MEMBER_A, MEMBER_B, MEMBER_C, MEMBER_D]) {
        expect(body, `${queue} leaked ${member.id}`).not.toContain(member.id);
      }
    }
  });

  it("summarizes a blueprint in review by name, version, and age only", async () => {
    const res = await getQueue("blueprint_review");
    expect(res.body.page.total).toBe(1);
    const [item] = res.body.page.items;
    expect(item.safeSummary).toContain("Ava");
    expect(item.safeSummary).toContain("blueprint v2");
    expect(item.safeSummary).not.toContain("SENSITIVE_BLUEPRINT_RECOMMENDATION");
    expect(item.safeSummary).not.toContain("INTERNAL_REVIEW_NOTE");
    expect(item.requiresStepUp).toBe(true);
  });

  it("summarizes a monthly plan in review by month label and version only", async () => {
    const res = await getQueue("monthly_plan_review");
    expect(res.body.page.total).toBe(1);
    const [item] = res.body.page.items;
    expect(item.safeSummary).toContain("2026-08");
    expect(item.safeSummary).not.toContain("SENSITIVE_PLAN_CONTENT");
  });

  it("summarizes a question by category and age, never by its body", async () => {
    const res = await getQueue("questions");
    expect(res.body.page.total).toBe(1); // the completed one is not queue work
    const [item] = res.body.page.items;
    expect(item.safeSummary).toContain("plan question");
    expect(item.safeSummary).not.toContain("SENSITIVE_QUESTION_BODY");
    expect(item.safeSummary).not.toContain("SENSITIVE_QUESTION_ANSWER");
  });

  it("summarizes an application under review without the applicant's own free text", async () => {
    const res = await getQueue("applications");
    // approved_pending_payment is not waiting on Samuel.
    expect(res.body.page.total).toBe(1);
    const [item] = res.body.page.items;
    expect(item.safeSummary).toContain("Cass");
    expect(item.safeSummary).not.toContain("SENSITIVE_APPLICATION_GOALS");
  });

  it("puts an overdue assessment in the queue by age, never by its answers", async () => {
    state.tables.research_assessment_responses = [
      {
        id: "response-1",
        member_id: MEMBER_A.id,
        definition_id: "initial-v1",
        mode: "initial",
        status: "in_progress",
        answers: { goal_meaning: "SENSITIVE_ASSESSMENT_ANSWER" },
        started_at: iso(-4 * DAY),
        last_saved_at: iso(-4 * DAY),
        reminders_sent: 3,
      },
    ];
    const res = await getQueue("assessment_due");
    expect(res.body.page.total).toBe(1);
    expect(res.body.page.items[0].safeSummary).toContain("Ava");
    expectNoSensitiveMarkers(res.body);
  });

  it("drops a member out of assessment_due once the assessment is submitted", async () => {
    state.tables.research_assessment_responses = [
      {
        id: "response-1",
        member_id: MEMBER_A.id,
        definition_id: "initial-v1",
        mode: "initial",
        status: "submitted",
        answers: { goal_meaning: "SENSITIVE_ASSESSMENT_ANSWER" },
      },
    ];
    const res = await getQueue("assessment_due");
    expect(res.body.page.total).toBe(0);
  });
});

describe("opaque subject references", () => {
  it("never uses the raw member id and stays stable across calls", async () => {
    const first = await getQueue("agreement_status");
    const second = await getQueue("agreement_status");
    expect(first.body.page.total).toBe(1);
    const a = first.body.page.items[0];
    const b = second.body.page.items[0];

    expect(a.subjectRef).not.toBe(MEMBER_A.id);
    expect(a.subjectRef).not.toContain(MEMBER_A.id);
    expect(a.subjectRef).toBe(b.subjectRef);
    expect(a.itemId).toBe(b.itemId);
    // The exported helper is the same function the route uses.
    expect(a.subjectRef).toBe(subjectRefFor("agreement_status", MEMBER_A.id));
  });

  it("gives the same member a different reference in a different queue", async () => {
    const agreements = await getQueue("agreement_status");
    const blueprints = await getQueue("blueprint_review");
    expect(agreements.body.page.items[0].subjectRef).not.toBe(
      blueprints.body.page.items[0].subjectRef,
    );
  });
});

describe("pagination, limits, and the priority filter", () => {
  it("pages through a queue with a cursor offset", async () => {
    const all = await getQueue("account_blocks");
    expect(all.body.page.total).toBe(3);
    expect(all.body.page.nextCursor).toBeNull();

    const page1 = await getQueue("account_blocks", "?limit=2");
    expect(page1.body.page.items).toHaveLength(2);
    expect(page1.body.page.total).toBe(3);
    expect(page1.body.page.nextCursor).toBe("2");

    const page2 = await getQueue("account_blocks", "?limit=2&cursor=2");
    expect(page2.body.page.items).toHaveLength(1);
    expect(page2.body.page.nextCursor).toBeNull();

    const ids = [...page1.body.page.items, ...page2.body.page.items].map((i: any) => i.itemId);
    expect(new Set(ids).size).toBe(3);
  });

  it("clamps the limit and refuses a nonsense cursor", async () => {
    for (const query of ["?limit=0", "?limit=101", "?limit=abc", "?limit=2.5"]) {
      const res = await getQueue("account_blocks", query);
      expect(res.status, query).toBe(400);
      expect(res.body.code, query).toBe("validation_failed");
      expect(res.body.fieldErrors.limit, query).toBeTruthy();
    }
    for (const query of ["?cursor=-1", "?cursor=abc"]) {
      const res = await getQueue("account_blocks", query);
      expect(res.status, query).toBe(400);
      expect(res.body.fieldErrors.cursor, query).toBeTruthy();
    }
    const max = await getQueue("account_blocks", "?limit=100");
    expect(max.status).toBe(200);
  });

  it("filters by priority and reports the filtered total", async () => {
    const all = await getQueue("account_blocks");
    const priorities = all.body.page.items.map((i: any) => i.priority);
    expect(priorities).toContain("critical");
    expect(priorities).toContain("normal");

    const critical = await getQueue("account_blocks", "?priority=critical");
    expect(critical.body.page.total).toBe(priorities.filter((p: string) => p === "critical").length);
    for (const item of critical.body.page.items) expect(item.priority).toBe("critical");

    const normal = await getQueue("account_blocks", "?priority=normal");
    expect(normal.body.page.total).toBe(priorities.filter((p: string) => p === "normal").length);
  });

  it("refuses an unknown priority", async () => {
    const res = await getQueue("account_blocks", "?priority=urgent");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.priority).toBeTruthy();
  });
});

describe("sla_risk", () => {
  it("lifts overdue work from the queues that carry deadlines, keeping their step-up", async () => {
    const res = await getQueue("sla_risk");
    expect(res.body.page.total).toBeGreaterThan(0);
    const summaries = res.body.page.items.map((i: any) => i.safeSummary).join(" | ");
    // The question is 8 hours past target and the blueprint is a day past its
    // 48 hour review target; the fresh monthly plan is not at risk.
    expect(summaries).toContain("question overdue");
    expect(summaries).toContain("blueprint overdue");
    expect(summaries).not.toContain("monthly plan");
    for (const item of res.body.page.items) {
      expect(item.queue).toBe("sla_risk");
      expect(item.priority).toBe("critical");
      // The aggregate never softens the authorization the real action needs.
      expect(item.requiresStepUp).toBe(true);
    }
    expectNoSensitiveMarkers(res.body);
  });
});

describe("GET /api/admin/research/queues/:queue/items/:itemId", () => {
  it("returns the item plus a server-authorized detail with no sensitive material", async () => {
    const list = await getQueue("questions");
    const [item] = list.body.page.items;

    const res = await request(makeApp()).get(
      `/api/admin/research/queues/questions/items/${encodeURIComponent(item.itemId)}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.item.itemId).toBe(item.itemId);
    expect(res.body.item.subjectRef).toBe(item.subjectRef);

    // Detail is the admin-only surface, so the real member id is allowed here
    // and only here.
    expect(res.body.detail.memberId).toBe(MEMBER_A.id);
    expect(res.body.detail.questionId).toBe("question-1");
    expect(res.body.detail.hasBodyText).toBe(true);
    expect(res.body.detail.hasTranscript).toBe(true);
    expect(res.body.detail.stepUp.required).toBe(true);
    // Presence flags only: never the body, the answer, or the media reference.
    expectNoSensitiveMarkers(res.body);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("keeps blueprint content and Samuel's internal note out of the detail", async () => {
    const list = await getQueue("blueprint_review");
    const [item] = list.body.page.items;
    const res = await request(makeApp()).get(
      `/api/admin/research/queues/blueprint_review/items/${encodeURIComponent(item.itemId)}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.detail.blueprintId).toBe("blueprint-1");
    expect(res.body.detail.version).toBe(2);
    expectNoSensitiveMarkers(res.body);
  });

  it("refuses an unknown queue key and an unknown item id", async () => {
    const badQueue = await request(makeApp()).get("/api/admin/research/queues/nope/items/abc");
    expect(badQueue.status).toBe(400);
    expect(badQueue.body.code).toBe("validation_failed");

    const badItem = await request(makeApp()).get(
      "/api/admin/research/queues/questions/items/questions%3Adeadbeefdeadbeef",
    );
    expect(badItem.status).toBe(404);
    expect(badItem.body.code).toBe("not_found");
  });

  it("does not resolve an item id minted for a different queue", async () => {
    const list = await getQueue("questions");
    const [item] = list.body.page.items;
    const res = await request(makeApp()).get(
      `/api/admin/research/queues/blueprint_review/items/${encodeURIComponent(item.itemId)}`,
    );
    expect(res.status).toBe(404);
  });
});

describe("capability truthfulness", () => {
  it("reports a telegram answer route as unavailable rather than implying one", async () => {
    caps.values = { telegram_support: false };
    const list = await getQueue("questions");
    const [item] = list.body.page.items;
    const res = await request(makeApp()).get(
      `/api/admin/research/queues/questions/items/${encodeURIComponent(item.itemId)}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.detail.answerChannel.channel).toBe("telegram");
    expect(res.body.detail.answerChannel.available).toBe(false);
    expect(res.body.detail.answerChannel.code).toBe("capability_disabled");
  });

  it("reports an unconfigured identity provider instead of a verification result", async () => {
    caps.values = { identity_verification: false };
    const list = await getQueue("identity_status");
    expect(list.body.page.total).toBe(1);
    const [item] = list.body.page.items;
    const res = await request(makeApp()).get(
      `/api/admin/research/queues/identity_status/items/${encodeURIComponent(item.itemId)}`,
    );
    expect(res.body.detail.identityVerification.available).toBe(false);
    expect(res.body.detail.identityVerification.code).toBe("capability_disabled");
    expect(res.body.detail.identityVerification.providerRecord).toBeUndefined();
  });

  it("reports Infinity escalation as unavailable on an at-risk item when the capability is off", async () => {
    caps.values = { infinity_events: false };
    const list = await getQueue("sla_risk");
    const [item] = list.body.page.items;
    const res = await request(makeApp()).get(
      `/api/admin/research/queues/sla_risk/items/${encodeURIComponent(item.itemId)}`,
    );
    expect(res.body.detail.infinityEscalation.available).toBe(false);
    expect(res.body.detail.infinityEscalation.code).toBe("capability_disabled");
  });

  // A work queue that hides work because an optional integration is off would
  // be the worse failure, so the list stays available either way.
  it("still returns every queue with all capabilities disabled", async () => {
    caps.values = {
      telegram_support: false,
      infinity_events: false,
      identity_verification: false,
      private_media: false,
      document_rendering: false,
    };
    for (const queue of ADMIN_QUEUE_KEYS) {
      const res = await getQueue(queue);
      expect(res.status, queue).toBe(200);
    }
  });
});

describe("the admin gate", () => {
  it("denies a non-admin session on both queue routes", async () => {
    const list = await getQueue("questions");
    const [item] = list.body.page.items;

    admin.allow = false;
    const deniedList = await getQueue("questions");
    expect(deniedList.status).toBe(403);
    expect(deniedList.body.page).toBeUndefined();

    const deniedItem = await request(makeApp()).get(
      `/api/admin/research/queues/questions/items/${encodeURIComponent(item.itemId)}`,
    );
    expect(deniedItem.status).toBe(403);
    expect(deniedItem.body.detail).toBeUndefined();
  });

  it("denies a non-admin session on every queue key", async () => {
    admin.allow = false;
    for (const queue of ADMIN_QUEUE_KEYS) {
      const res = await getQueue(queue);
      expect(res.status, queue).toBe(403);
    }
  });
});

// This module projects tables and policy numbers other waves own, so the two
// ways it can silently go wrong are a copied SLA window that drifts and a
// hardcoded table name that gets renamed. Both are pinned here.
describe("no drift from the modules that own the sources", () => {
  it("computes review deadlines from the SLA module's windows, not a local copy", async () => {
    const blueprint = await getQueue("blueprint_review");
    expect(blueprint.body.page.items[0].slaDeadline).toBe(
      iso(-3 * DAY + SLA_WINDOW_HOURS.blueprint_review * HOUR),
    );

    const plan = await getQueue("monthly_plan_review");
    expect(plan.body.page.items[0].slaDeadline).toBe(
      iso(-1 * DAY + SLA_WINDOW_HOURS.monthly_plan_review * HOUR),
    );

    // A question with no stamped target falls back to the same window the SLA
    // module would have used.
    state.tables.research_member_questions = [
      {
        id: "question-3",
        member_id: MEMBER_A.id,
        category: "account",
        status: "pending",
        source: "web",
        created_at: iso(-2 * HOUR),
        sla_target_at: null,
      },
    ];
    const question = await getQueue("questions");
    expect(question.body.page.items[0].slaDeadline).toBe(
      iso(-2 * HOUR + SLA_WINDOW_HOURS.question_response * HOUR),
    );
  });

  it("reads the same questions table the questions wave writes", () => {
    expect(MEMBER_QUESTIONS_TABLE).toBe(QUESTIONS_WAVE_TABLE);
  });
});

describe("agreement and identity gaps", () => {
  it("queues only members missing a current-version required acceptance", async () => {
    const res = await getQueue("agreement_status");
    expect(res.body.page.total).toBe(1);
    expect(res.body.page.items[0].safeSummary).toContain("Ava");

    const list = res.body.page.items[0];
    const detail = await request(makeApp()).get(
      `/api/admin/research/queues/agreement_status/items/${encodeURIComponent(list.itemId)}`,
    );
    // XR-MEM-001 was accepted at the current version, so it is not missing.
    expect(detail.body.detail.missingAgreementKeys).not.toContain("XR-MEM-001");
    expect(detail.body.detail.missingAgreementKeys.length).toBeGreaterThan(0);
  });

  it("treats an acceptance of a superseded version as still missing", async () => {
    state.tables.research_agreement_acceptances = [
      {
        id: "acc-old",
        subject_type: "member",
        subject_id: MEMBER_A.id,
        agreement_key: "XR-MEM-001",
        agreement_version: "0.0.1-draft",
        decision: "accepted",
        created_at: iso(-9 * DAY),
      },
    ];
    const list = await getQueue("agreement_status");
    const detail = await request(makeApp()).get(
      `/api/admin/research/queues/agreement_status/items/${encodeURIComponent(list.body.page.items[0].itemId)}`,
    );
    expect(detail.body.detail.missingAgreementKeys).toContain("XR-MEM-001");
  });

  it("leaves blocked accounts out of the paperwork queues", async () => {
    const agreements = await getQueue("agreement_status");
    const identity = await getQueue("identity_status");
    // Only the active member is chased for paperwork; paused, cancelled, and
    // closed accounts belong to account_blocks.
    expect(agreements.body.page.total).toBe(1);
    expect(identity.body.page.total).toBe(1);
    const blocks = await getQueue("account_blocks");
    expect(blocks.body.page.total).toBe(3);
  });
});

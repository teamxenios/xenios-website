import crypto from "crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Questions and Telegram boundary tests. What these pin down:
//
// - A/B isolation on every member-scoped route (list, create, follow-up, rate).
// - THE DIGNITY WALL: no queue position and no count of anyone else's work in
//   any payload. A member waiting on an answer is never handed a number that
//   tells them how small their place in line is.
// - Closed questions are continued by a linked follow-up, never reopened.
// - Answering is Samuel-only, stamps a DISPLAY NAME (never an admin email),
//   and notifies once with firstName only. A notification failure never
//   un-answers the question.
// - THE TOKEN WALL: the raw link token is never stored, is single use, and a
//   replayed, expired, or revoked token is denied.
// - THE TELEGRAM WALL: an unverified webhook is refused before anything is
//   read, and every byte that goes OUT over Telegram is scanned for the
//   forbidden classes (passwords, reset tokens, ID documents, payment data,
//   assessments, private media, sensitive PDFs, health answers).
//
// Supabase is an in-memory fake; member auth, the admin guard, and the
// capability registry are mocked so identity and capability state are chosen
// per test.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  questions: [] as any[],
  links: [] as any[],
  members: [] as any[],
}));

const auth = vi.hoisted(() => ({
  current: null as any,
  deny: null as { status: number; code: string } | null,
}));

const admin = vi.hoisted(() => ({ allow: true }));
const caps = vi.hoisted(() => ({ enabled: true }));

vi.mock("../supabase", () => {
  function tableFor(name: string) {
    if (name === "research_member_questions") return state.questions;
    if (name === "research_telegram_links") return state.links;
    if (name === "research_members") return state.members;
    throw new Error(`unexpected table in test: ${name}`);
  }
  function query(table: string) {
    const list = tableFor(table);
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    const gtFilters: Array<[string, any]> = [];
    const neqFilters: Array<[string, any]> = [];
    let isNullCol: string | null = null;
    let limitN: number | null = null;

    const matches = (r: any) =>
      filters.every(([c, v]) => r[c] === v) &&
      inFilters.every(([c, vs]) => vs.includes(r[c])) &&
      gtFilters.every(([c, v]) => String(r[c] ?? "") > String(v)) &&
      neqFilters.every(([c, v]) => r[c] !== v) &&
      (isNullCol === null || r[isNullCol] === null);

    const finish = () => {
      if (mode === "insert") {
        const row = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...insertPayload,
        };
        list.push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        const targets = list.filter(matches);
        if (!targets.length) return { data: null, error: null };
        Object.assign(targets[0], updatePayload);
        return { data: targets[0], error: null };
      }
      if (mode === "delete") {
        for (let i = list.length - 1; i >= 0; i -= 1) {
          if (matches(list[i])) list.splice(i, 1);
        }
        return { data: null, error: null };
      }
      let rows = list.filter(matches);
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows, error: null };
    };

    const api: any = {
      select: () => api,
      insert: (p: any) => { mode = "insert"; insertPayload = p; return api; },
      update: (p: any) => { mode = "update"; updatePayload = p; return api; },
      delete: () => { mode = "delete"; return api; },
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      is: (c: string, v: any) => { if (v === null) isNullCol = c; return api; },
      // The link spend guards on expiry as well as single use, so the fake
      // has to understand a greater-than filter to model the real write.
      gt: (c: string, v: any) => { gtFilters.push([c, v]); return api; },
      neq: (c: string, v: any) => { neqFilters.push([c, v]); return api; },
      in: (c: string, vs: any[]) => { inFilters.push([c, vs]); return api; },
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

vi.mock("../routes", () => ({
  requireSupabaseAdmin: (req: any, res: any, next: any) => {
    if (!admin.allow) return res.status(403).json({ ok: false, code: "admin_required" });
    req.adminEmail = ADMIN_EMAIL;
    next();
  },
}));

// The capability registry: per-test on/off so the disabled paths can be proven
// to be truthful denials rather than fake tokens.
vi.mock("./capabilities", () => ({
  capabilityEnabled: () => caps.enabled,
}));

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import {
  hashLinkToken,
  registerQuestionsApi,
  toMemberQuestion,
  LINK_TOKEN_TTL_MINUTES,
  QUESTION_LIMIT_PER_HOUR,
  SLA_TARGET_HOURS,
} from "./questions";
import {
  TELEGRAM_NOTICES,
  TELEGRAM_SECRET_HEADER,
  TEST_TELEGRAM_WEBHOOK_SECRET,
  disabledTelegramProvider,
  scanOutboundText,
  selectTelegramProvider,
  testTelegramProvider,
} from "./telegram-provider";
import type { MemberPlatformDeps } from "./member-platform-deps";

const T0 = Date.parse("2026-07-21T00:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

// The admin's own address. It must never appear in a member-facing payload,
// so it is a distinctive marker rather than a plausible-looking email.
const ADMIN_EMAIL = "XENIOS_ADMIN_EMAIL_NEVER_IN_A_MEMBER_PAYLOAD@example.com";

// The environment this suite touches. process.env is SHARED across test files
// in a worker, so it is snapshotted here and restored in afterAll; leaking a
// flag would quietly break another suite.
const ENV_KEYS = [
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "RESEARCH_TELEGRAM_ENABLED",
] as const;
const envSnapshot: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) envSnapshot[key] = process.env[key];
  process.env.TELEGRAM_BOT_USERNAME = "xenios_test_bot";
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (envSnapshot[key] === undefined) delete process.env[key];
    else process.env[key] = envSnapshot[key];
  }
});

let nowMs = T0;
let notifications: any[] = [];
let deps: MemberPlatformDeps;

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

function makeApp() {
  const app = express();
  app.use(express.json());
  registerQuestionsApi(app, deps);
  return app;
}

// Member ids are minted per test. The durable rate limiter falls back to a
// per-process window keyed by member id, so a fixed id would carry hits from
// one test into the next.
let MEMBER_A: any;
let MEMBER_B: any;

function makeMember(firstName: string, email: string) {
  const row = {
    id: crypto.randomUUID(),
    application_id: `app-${firstName}`,
    auth_user_id: `auth-${firstName}`,
    email,
    first_name: firstName,
    status: "active",
    created_at: new Date(T0).toISOString(),
  };
  state.members.push(row);
  return row;
}

function seedQuestion(overrides: Record<string, any> = {}) {
  const row = {
    id: crypto.randomUUID(),
    member_id: MEMBER_A.id,
    category: "plan",
    status: "pending",
    source: "web",
    body_text: "How should I handle a travel week?",
    transcript_media_id: null,
    answer_text: null,
    answered_at: null,
    answered_by: null,
    rating: null,
    follow_up_of_question_id: null,
    sla_target_at: new Date(nowMs + SLA_TARGET_HOURS * HOUR_MS).toISOString(),
    created_at: new Date(nowMs).toISOString(),
    updated_at: new Date(nowMs).toISOString(),
    ...overrides,
  };
  state.questions.push(row);
  return row;
}

function seedLink(overrides: Record<string, any> = {}) {
  const row = {
    id: crypto.randomUUID(),
    member_id: MEMBER_A.id,
    link_token_hash: hashLinkToken(crypto.randomUUID()),
    chat_ref: null,
    display_name: null,
    linked_at: null,
    revoked_at: null,
    expires_at: new Date(nowMs + LINK_TOKEN_TTL_MINUTES * 60 * 1000).toISOString(),
    used_at: null,
    created_at: new Date(nowMs).toISOString(),
    ...overrides,
  };
  state.links.push(row);
  return row;
}

function questionById(id: string) {
  return state.questions.find((r) => r.id === id);
}

function linkById(id: string) {
  return state.links.find((r) => r.id === id);
}

// Posts a webhook update with the shared secret already attached.
function postWebhook(app: any, body: Record<string, unknown>) {
  return request(app)
    .post("/api/research/telegram/webhook")
    .set(TELEGRAM_SECRET_HEADER, TEST_TELEGRAM_WEBHOOK_SECRET)
    .send(body);
}

// A member is never told their place in line, nor how much other work exists.
const QUEUE_SIGNAL = /(queue|position|ahead|backlog|waiting[-\s]?list|\btotal\b|\bcount\b|\brank\b|\bplace\b)/i;

function expectNoQueueSignals(body: unknown) {
  expect(JSON.stringify(body)).not.toMatch(QUEUE_SIGNAL);
}

beforeEach(() => {
  state.questions.length = 0;
  state.links.length = 0;
  state.members.length = 0;
  MEMBER_A = makeMember("Ava", "ava@example.com");
  MEMBER_B = makeMember("Bo", "bo@example.com");
  auth.current = MEMBER_A;
  auth.deny = null;
  admin.allow = true;
  caps.enabled = true;
  nowMs = T0;
  notifications = [];
  testTelegramProvider.reset();
  deps = makeDeps();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

describe("telegram provider selection", () => {
  it("returns the disabled provider while the capability is off, and it refuses every call", async () => {
    caps.enabled = false;
    expect(selectTelegramProvider()).toBe(disabledTelegramProvider);

    const sent = await disabledTelegramProvider.sendMessage({ chatRef: "chat-1", text: "anything" });
    expect(sent.ok).toBe(false);
    if (!sent.ok) expect(sent.code).toBe("DISABLED");

    // Verification refuses too: with no configured secret, nothing can be
    // verified and a webhook must not be honored.
    const verified = disabledTelegramProvider.verifyWebhook();
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.code).toBe("DISABLED");
  });

  it("returns the deterministic test provider while the capability is on", () => {
    caps.enabled = true;
    expect(selectTelegramProvider()).toBe(testTelegramProvider);
  });
});

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

describe("GET /api/research/questions", () => {
  it("returns only the member's own questions, newest first", async () => {
    seedQuestion({ body_text: "mine, older", created_at: new Date(T0 - HOUR_MS).toISOString() });
    seedQuestion({ body_text: "mine, newer", created_at: new Date(T0).toISOString() });
    seedQuestion({ member_id: MEMBER_B.id, body_text: "theirs" });

    const mine = await request(makeApp()).get("/api/research/questions");
    expect(mine.status).toBe(200);
    expect(mine.body.questions).toHaveLength(2);
    expect(mine.body.questions[0].bodyText).toBe("mine, newer");
    expect(JSON.stringify(mine.body)).not.toContain("theirs");

    auth.current = MEMBER_B;
    const theirs = await request(makeApp()).get("/api/research/questions");
    expect(theirs.body.questions).toHaveLength(1);
    expect(theirs.body.questions[0].bodyText).toBe("theirs");
  });

  it("serializes exactly the contract record shape, with no queue position", async () => {
    const row = seedQuestion({ status: "answer_ready", answer_text: "Here is what I would do." });
    expect(Object.keys(toMemberQuestion(row as any)).sort()).toEqual(
      [
        "answerText",
        "answeredAt",
        "bodyText",
        "category",
        "createdAt",
        "followUpOfQuestionId",
        "questionId",
        "rating",
        "slaTargetAt",
        "source",
        "status",
        "transcriptMediaId",
      ].sort(),
    );
  });

  it("NEVER carries a queue position or a count of other members' work", async () => {
    seedQuestion();
    seedQuestion({ member_id: MEMBER_B.id });
    const res = await request(makeApp()).get("/api/research/questions");
    expectNoQueueSignals(res.body);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });
});

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

describe("POST /api/research/questions", () => {
  it("stores the question as pending with a 12 hour target and no queue position in the reply", async () => {
    const res = await request(makeApp())
      .post("/api/research/questions")
      .send({ category: "plan", bodyText: "Should I train on a travel week?" });

    expect(res.status).toBe(200);
    expect(res.body.question.status).toBe("pending");
    expect(res.body.question.source).toBe("web");
    expect(res.body.question.slaTargetAt).toBe(new Date(T0 + SLA_TARGET_HOURS * HOUR_MS).toISOString());
    // A target, never a promise: nothing in the payload commits to a deadline.
    expect(JSON.stringify(res.body)).not.toMatch(/guarantee|promise|within 12|by 12/i);
    expectNoQueueSignals(res.body);

    const stored = questionById(res.body.question.questionId);
    expect(stored.member_id).toBe(MEMBER_A.id);
    expect(stored.rating).toBeNull();
  });

  it("refuses a body that is too short or too long", async () => {
    const app = makeApp();
    const short = await request(app).post("/api/research/questions").send({ category: "plan", bodyText: "hm" });
    expect(short.status).toBe(400);
    expect(short.body.code).toBe("validation_failed");
    expect(short.body.fieldErrors.bodyText).toBeTruthy();

    const long = await request(app)
      .post("/api/research/questions")
      .send({ category: "plan", bodyText: "x".repeat(4001) });
    expect(long.status).toBe(400);
    expect(long.body.fieldErrors.bodyText).toBeTruthy();
    expect(state.questions).toHaveLength(0);
  });

  it("refuses an unknown category", async () => {
    const res = await request(makeApp())
      .post("/api/research/questions")
      .send({ category: "billing_dispute", bodyText: "A perfectly reasonable question." });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.category).toBeTruthy();
  });

  it("links a follow-up to the member's own COMPLETED question", async () => {
    const parent = seedQuestion({ status: "completed", answer_text: "Answered." });
    const res = await request(makeApp())
      .post("/api/research/questions")
      .send({ category: "plan", bodyText: "Thanks. One more thing about that.", followUpOfQuestionId: parent.id });

    expect(res.status).toBe(200);
    expect(res.body.question.followUpOfQuestionId).toBe(parent.id);
    // The original is untouched: a closed question is continued, never reopened.
    expect(questionById(parent.id).status).toBe("completed");
  });

  it("refuses a follow-up to a question that is not completed", async () => {
    const parent = seedQuestion({ status: "answer_ready", answer_text: "Here you go." });
    const res = await request(makeApp())
      .post("/api/research/questions")
      .send({ category: "plan", bodyText: "Following up early.", followUpOfQuestionId: parent.id });

    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.followUpOfQuestionId).toBeTruthy();
    expect(state.questions).toHaveLength(1);
  });

  it("refuses a follow-up to ANOTHER member's completed question (A/B isolation)", async () => {
    const theirs = seedQuestion({ member_id: MEMBER_B.id, status: "completed" });
    const res = await request(makeApp())
      .post("/api/research/questions")
      .send({ category: "plan", bodyText: "Piggybacking on someone else.", followUpOfQuestionId: theirs.id });

    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.followUpOfQuestionId).toBeTruthy();
    // Refused in the same words as a non-completed one, so this route cannot
    // be used to discover whether a given question exists.
    expect(state.questions).toHaveLength(1);
  });

  it("rate limits at ten an hour per member", async () => {
    const app = makeApp();
    for (let i = 0; i < QUESTION_LIMIT_PER_HOUR; i += 1) {
      const ok = await request(app)
        .post("/api/research/questions")
        .send({ category: "other", bodyText: `Question number ${i} with enough text.` });
      expect(ok.status).toBe(200);
    }
    const limited = await request(app)
      .post("/api/research/questions")
      .send({ category: "other", bodyText: "One question too many for this hour." });
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("rate_limited");
    expect(state.questions).toHaveLength(QUESTION_LIMIT_PER_HOUR);

    // The budget is per member: another member is unaffected.
    auth.current = MEMBER_B;
    const other = await request(app)
      .post("/api/research/questions")
      .send({ category: "other", bodyText: "A different member asking their first question." });
    expect(other.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------------

describe("POST /api/research/questions/:questionId/rate", () => {
  it("accepts a rating once an answer is ready and stores it", async () => {
    const row = seedQuestion({ status: "answer_ready", answer_text: "Here is the plan." });
    const res = await request(makeApp()).post(`/api/research/questions/${row.id}/rate`).send({ rating: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(questionById(row.id).rating).toBe(5);
  });

  it("accepts a rating on a completed question", async () => {
    const row = seedQuestion({ status: "completed", answer_text: "Done." });
    const res = await request(makeApp()).post(`/api/research/questions/${row.id}/rate`).send({ rating: 3 });
    expect(res.status).toBe(200);
    expect(questionById(row.id).rating).toBe(3);
  });

  it("refuses a rating while there is no answer to rate", async () => {
    for (const status of ["pending", "being_reviewed", "more_information_needed"]) {
      const row = seedQuestion({ status });
      const res = await request(makeApp()).post(`/api/research/questions/${row.id}/rate`).send({ rating: 4 });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("state_conflict");
      expect(questionById(row.id).rating).toBeNull();
    }
  });

  it("refuses a rating outside one to five", async () => {
    const row = seedQuestion({ status: "answer_ready" });
    const app = makeApp();
    for (const rating of [0, 6, 2.5, "five"]) {
      const res = await request(app).post(`/api/research/questions/${row.id}/rate`).send({ rating });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("validation_failed");
    }
    expect(questionById(row.id).rating).toBeNull();
  });

  it("cannot rate another member's question (A/B isolation)", async () => {
    const theirs = seedQuestion({ member_id: MEMBER_B.id, status: "answer_ready" });
    const res = await request(makeApp()).post(`/api/research/questions/${theirs.id}/rate`).send({ rating: 1 });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
    expect(questionById(theirs.id).rating).toBeNull();
  });

  it("refuses a body questionId that disagrees with the path", async () => {
    const row = seedQuestion({ status: "answer_ready" });
    const other = seedQuestion({ status: "answer_ready" });
    const res = await request(makeApp())
      .post(`/api/research/questions/${row.id}/rate`)
      .send({ questionId: other.id, rating: 5 });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.questionId).toBeTruthy();
    expect(questionById(row.id).rating).toBeNull();
    expect(questionById(other.id).rating).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Samuel's answer
// ---------------------------------------------------------------------------

describe("POST /api/admin/research/questions/:questionId/answer", () => {
  it("is Samuel-only", async () => {
    admin.allow = false;
    const row = seedQuestion();
    const res = await request(makeApp())
      .post(`/api/admin/research/questions/${row.id}/answer`)
      .send({ answerText: "Not from a member.", status: "answer_ready" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("admin_required");
    expect(questionById(row.id).answer_text).toBeNull();
  });

  it("stamps the answer with a display name, never an admin email, and notifies once with firstName only", async () => {
    const row = seedQuestion();
    nowMs = T0 + 3 * HOUR_MS;
    const res = await request(makeApp())
      .post(`/api/admin/research/questions/${row.id}/answer`)
      .send({ answerText: "Train Tuesday and Friday, keep the rest easy.", status: "answer_ready" });

    expect(res.status).toBe(200);
    expect(res.body.question.status).toBe("answer_ready");
    expect(res.body.question.answerText).toBe("Train Tuesday and Friday, keep the rest easy.");

    const stored = questionById(row.id);
    expect(stored.answered_at).toBe(new Date(nowMs).toISOString());
    expect(stored.answered_by).toBe("Samuel");
    // The admin's address is nowhere in the row or the member's payload.
    expect(stored.answered_by).not.toContain("@");
    expect(JSON.stringify(res.body)).not.toContain(ADMIN_EMAIL);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].templateKey).toBe("member_question_answer_ready");
    expect(notifications[0].recipient).toBe(MEMBER_A.email);
    // firstName ONLY: never the question, never the answer, never health data.
    expect(notifications[0].payload).toEqual({ firstName: "Ava" });
    expect(JSON.stringify(notifications[0])).not.toContain("Train Tuesday");
    expect(JSON.stringify(notifications[0])).not.toContain(ADMIN_EMAIL);
  });

  it("does NOT notify when more information is needed", async () => {
    const row = seedQuestion();
    const res = await request(makeApp())
      .post(`/api/admin/research/questions/${row.id}/answer`)
      .send({ answerText: "Which days are you travelling?", status: "more_information_needed" });

    expect(res.status).toBe(200);
    expect(questionById(row.id).status).toBe("more_information_needed");
    // No answer is ready, so no member is told one is.
    expect(notifications).toHaveLength(0);
  });

  it("a notification failure never un-answers the question", async () => {
    const row = seedQuestion();
    deps.notifier.notify = vi.fn(async () => {
      throw new Error("the mail transport is down");
    });

    const res = await request(makeApp())
      .post(`/api/admin/research/questions/${row.id}/answer`)
      .send({ answerText: "The answer survives the outage.", status: "answer_ready" });

    expect(res.status).toBe(200);
    const stored = questionById(row.id);
    expect(stored.status).toBe("answer_ready");
    expect(stored.answer_text).toBe("The answer survives the outage.");
    expect(stored.answered_at).toBe(new Date(T0).toISOString());
  });

  it("refuses to overwrite a completed question and reports not_found for an unknown id", async () => {
    const closed = seedQuestion({ status: "completed", answer_text: "Already answered." });
    const conflict = await request(makeApp())
      .post(`/api/admin/research/questions/${closed.id}/answer`)
      .send({ answerText: "Second thoughts.", status: "answer_ready" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("state_conflict");
    expect(questionById(closed.id).answer_text).toBe("Already answered.");

    const missing = await request(makeApp())
      .post(`/api/admin/research/questions/${crypto.randomUUID()}/answer`)
      .send({ answerText: "Into the void.", status: "answer_ready" });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("not_found");
  });

  it("refuses a status the review action does not own", async () => {
    const row = seedQuestion();
    const res = await request(makeApp())
      .post(`/api/admin/research/questions/${row.id}/answer`)
      .send({ answerText: "Closing it myself.", status: "completed" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
  });
});

// ---------------------------------------------------------------------------
// Telegram linking
// ---------------------------------------------------------------------------

describe("POST /api/research/telegram/link", () => {
  it("mints a one-time token and stores ONLY its hash", async () => {
    const res = await request(makeApp()).post("/api/research/telegram/link");
    expect(res.status).toBe(200);

    const token = res.body.link.linkToken;
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
    expect(res.body.link.expiresAt).toBe(new Date(T0 + LINK_TOKEN_TTL_MINUTES * 60 * 1000).toISOString());
    expect(res.body.link.botUsername).toBe("xenios_test_bot");

    expect(state.links).toHaveLength(1);
    const row = state.links[0];
    // The raw token is nowhere in the stored row, in any field.
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.link_token_hash).toBe(hashLinkToken(token));
    expect(row.used_at).toBeNull();
    expect(row.member_id).toBe(MEMBER_A.id);
  });

  it("revokes a previous UNUSED token and leaves a live link alone", async () => {
    const stale = seedLink();
    const live = seedLink({
      used_at: new Date(T0 - HOUR_MS).toISOString(),
      linked_at: new Date(T0 - HOUR_MS).toISOString(),
      chat_ref: "chat-live",
    });

    const res = await request(makeApp()).post("/api/research/telegram/link");
    expect(res.status).toBe(200);
    expect(linkById(stale.id).revoked_at).toBe(new Date(T0).toISOString());
    // A working connection is not cut off just because a new token was minted.
    expect(linkById(live.id).revoked_at).toBeNull();
  });

  it("returns capability_disabled and mints NO token while Telegram is off", async () => {
    caps.enabled = false;
    const res = await request(makeApp()).post("/api/research/telegram/link");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      ok: false,
      code: "capability_disabled",
      message: "Telegram support is not available yet.",
    });
    expect(res.body.link).toBeUndefined();
    expect(state.links).toHaveLength(0);
  });
});

describe("GET /api/research/telegram and DELETE /api/research/telegram/link", () => {
  it("reports the linked state with a display name only", async () => {
    seedLink({
      used_at: new Date(T0).toISOString(),
      linked_at: new Date(T0).toISOString(),
      chat_ref: "chat-secret-routing-detail",
      display_name: "Ava",
    });
    const res = await request(makeApp()).get("/api/research/telegram");
    expect(res.status).toBe(200);
    expect(res.body.state).toEqual({
      linked: true,
      linkedAt: new Date(T0).toISOString(),
      telegramDisplayName: "Ava",
    });
    // The chat reference is a routing detail and never leaves the server.
    expect(JSON.stringify(res.body)).not.toContain("chat-secret-routing-detail");
  });

  it("reports unlinked when the only token is unspent, and never leaks the hash", async () => {
    seedLink();
    const res = await request(makeApp()).get("/api/research/telegram");
    expect(res.body.state).toEqual({ linked: false, linkedAt: null, telegramDisplayName: null });
    expect(JSON.stringify(res.body)).not.toContain(state.links[0].link_token_hash);
  });

  it("does not report another member's link", async () => {
    seedLink({
      member_id: MEMBER_B.id,
      used_at: new Date(T0).toISOString(),
      linked_at: new Date(T0).toISOString(),
      chat_ref: "chat-theirs",
      display_name: "Bo",
    });
    const res = await request(makeApp()).get("/api/research/telegram");
    expect(res.body.state.linked).toBe(false);
  });

  it("revokes every link on delete, and stays available with the capability off", async () => {
    caps.enabled = false;
    const unspent = seedLink();
    const live = seedLink({
      used_at: new Date(T0).toISOString(),
      linked_at: new Date(T0).toISOString(),
      chat_ref: "chat-live",
    });

    const res = await request(makeApp()).delete("/api/research/telegram/link");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(linkById(unspent.id).revoked_at).toBe(new Date(T0).toISOString());
    expect(linkById(live.id).revoked_at).toBe(new Date(T0).toISOString());
  });
});

// ---------------------------------------------------------------------------
// The webhook
// ---------------------------------------------------------------------------

describe("POST /api/research/telegram/webhook", () => {
  it("refuses a missing or wrong secret before anything is read", async () => {
    const row = seedLink();
    const app = makeApp();

    const missing = await request(app)
      .post("/api/research/telegram/webhook")
      .send({ chatRef: "chat-1", linkToken: "whatever" });
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe("unauthorized");

    const wrong = await request(app)
      .post("/api/research/telegram/webhook")
      .set(TELEGRAM_SECRET_HEADER, "not-the-secret")
      .send({ chatRef: "chat-1", linkToken: "whatever" });
    expect(wrong.status).toBe(401);

    // Nothing was linked, nothing was created, nothing was sent.
    expect(linkById(row.id).used_at).toBeNull();
    expect(state.questions).toHaveLength(0);
    expect(testTelegramProvider.sent).toHaveLength(0);
  });

  it("returns capability_disabled while Telegram is off", async () => {
    caps.enabled = false;
    const res = await postWebhook(makeApp(), { chatRef: "chat-1", text: "hello" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("capability_disabled");
    expect(state.questions).toHaveLength(0);
  });

  it("spends a valid token exactly once and records the chat", async () => {
    const minted = await request(makeApp()).post("/api/research/telegram/link");
    const token = minted.body.link.linkToken;

    const first = await postWebhook(makeApp(), {
      chatRef: "chat-42",
      displayName: "Ava",
      linkToken: token,
    });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, linked: true });

    const row = state.links[0];
    expect(row.used_at).toBe(new Date(T0).toISOString());
    expect(row.linked_at).toBe(new Date(T0).toISOString());
    expect(row.chat_ref).toBe("chat-42");
    expect(row.display_name).toBe("Ava");

    // REPLAY: the same token again is denied, and the chat is not re-bound.
    nowMs = T0 + 60_000;
    const replay = await postWebhook(makeApp(), { chatRef: "chat-attacker", linkToken: token });
    expect(replay.status).toBe(409);
    expect(replay.body.code).toBe("state_conflict");
    expect(linkById(row.id).chat_ref).toBe("chat-42");
  });

  it("accepts Telegram's own /start deep-link shape", async () => {
    const minted = await request(makeApp()).post("/api/research/telegram/link");
    const token = minted.body.link.linkToken;

    const res = await postWebhook(makeApp(), {
      message: { chat: { id: 998877 }, from: { first_name: "Ava" }, text: `/start ${token}` },
    });
    expect(res.status).toBe(200);
    expect(state.links[0].chat_ref).toBe("998877");
    expect(state.links[0].display_name).toBe("Ava");
  });

  it("denies an expired token", async () => {
    const minted = await request(makeApp()).post("/api/research/telegram/link");
    const token = minted.body.link.linkToken;

    nowMs = T0 + (LINK_TOKEN_TTL_MINUTES + 1) * 60 * 1000;
    const res = await postWebhook(makeApp(), { chatRef: "chat-late", linkToken: token });
    expect(res.status).toBe(409);
    expect(state.links[0].used_at).toBeNull();
    expect(state.links[0].chat_ref).toBeNull();
  });

  it("denies a revoked token", async () => {
    const minted = await request(makeApp()).post("/api/research/telegram/link");
    const token = minted.body.link.linkToken;
    await request(makeApp()).delete("/api/research/telegram/link");

    const res = await postWebhook(makeApp(), { chatRef: "chat-revoked", linkToken: token });
    expect(res.status).toBe(409);
    expect(state.links[0].used_at).toBeNull();
  });

  it("denies an unknown token in the same words as a spent one", async () => {
    const res = await postWebhook(makeApp(), { chatRef: "chat-x", linkToken: "a-token-nobody-minted" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
    expect(state.links).toHaveLength(0);
  });

  it("turns a message from a linked chat into a telegram_text question", async () => {
    seedLink({
      used_at: new Date(T0).toISOString(),
      linked_at: new Date(T0).toISOString(),
      chat_ref: "chat-42",
      display_name: "Ava",
    });

    const res = await postWebhook(makeApp(), { chatRef: "chat-42", text: "Can I swap Thursday for Friday?" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, received: true });

    expect(state.questions).toHaveLength(1);
    const stored = state.questions[0];
    expect(stored.member_id).toBe(MEMBER_A.id);
    expect(stored.source).toBe("telegram_text");
    expect(stored.status).toBe("pending");
    expect(stored.category).toBe("other");
    expect(stored.body_text).toBe("Can I swap Thursday for Friday?");
    expect(stored.sla_target_at).toBe(new Date(T0 + SLA_TARGET_HOURS * HOUR_MS).toISOString());

    // The durable record is here, and the member reads it in their account.
    const listed = await request(makeApp()).get("/api/research/questions");
    expect(listed.body.questions).toHaveLength(1);
    expect(listed.body.questions[0].source).toBe("telegram_text");
  });

  it("ignores a message from a chat that is not linked", async () => {
    const res = await postWebhook(makeApp(), { chatRef: "chat-stranger", text: "Let me in." });
    expect(res.status).toBe(409);
    expect(state.questions).toHaveLength(0);
    expect(testTelegramProvider.sent).toHaveLength(0);
  });

  it("ignores a message from a REVOKED chat", async () => {
    seedLink({
      used_at: new Date(T0).toISOString(),
      linked_at: new Date(T0).toISOString(),
      revoked_at: new Date(T0).toISOString(),
      chat_ref: "chat-42",
    });
    const res = await postWebhook(makeApp(), { chatRef: "chat-42", text: "Still here?" });
    expect(res.status).toBe(409);
    expect(state.questions).toHaveLength(0);
  });

  it("applies the same hourly budget as the website", async () => {
    seedLink({
      used_at: new Date(T0).toISOString(),
      linked_at: new Date(T0).toISOString(),
      chat_ref: "chat-42",
    });
    const app = makeApp();
    for (let i = 0; i < QUESTION_LIMIT_PER_HOUR; i += 1) {
      const ok = await postWebhook(app, { chatRef: "chat-42", text: `Message ${i}` });
      expect(ok.status).toBe(200);
    }
    const limited = await postWebhook(app, { chatRef: "chat-42", text: "One too many" });
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("rate_limited");
    expect(state.questions).toHaveLength(QUESTION_LIMIT_PER_HOUR);
  });
});

// ---------------------------------------------------------------------------
// THE TELEGRAM WALL: what goes out
// ---------------------------------------------------------------------------

describe("outbound Telegram content", () => {
  it("sends only fixed notices, and none of them carries a forbidden class", async () => {
    const minted = await request(makeApp()).post("/api/research/telegram/link");
    const token = minted.body.link.linkToken;
    await postWebhook(makeApp(), { chatRef: "chat-42", displayName: "Ava", linkToken: token });
    await postWebhook(makeApp(), {
      chatRef: "chat-42",
      text: "My blood pressure reading was odd and my card number changed, can you look?",
    });

    expect(testTelegramProvider.sent.length).toBeGreaterThan(0);
    const notices: string[] = Object.values(TELEGRAM_NOTICES);
    for (const message of testTelegramProvider.sent) {
      // Every outbound byte is a notice from the fixed allowlist.
      expect(notices).toContain(message.text);
      // And every one of them passes the forbidden-class scan.
      expect(scanOutboundText(message.text)).toEqual({ safe: true, violations: [] });
      // The member's own words never travel back out over Telegram either.
      expect(message.text).not.toContain("blood pressure");
      expect(message.text).not.toContain("card number");
    }

    // The token itself is never echoed back over the channel.
    expect(JSON.stringify(testTelegramProvider.sent)).not.toContain(token);

    // And the guard was never NEEDED. This is the assertion that catches a
    // caller trying to push member content through Telegram: the provider
    // would refuse it, so `sent` would still look clean, and the only trace of
    // the attempt is here. A legitimate flow never trips the guard.
    expect(testTelegramProvider.refused).toEqual([]);
  });

  it("refuses to transmit any forbidden class, whoever asks", async () => {
    const forbidden = [
      "Your password is hunter2",
      "Here is your reset link to get back in",
      "Your verification code is 123456",
      "Card number 4111111111111111 on file",
      "Your passport was accepted",
      "Your assessment answer about medication was flagged",
      "Your progress photo is ready",
      "Attached: your blueprint",
      "Reference 987654321098765",
    ];

    for (const text of forbidden) {
      const result = await testTelegramProvider.sendMessage({ chatRef: "chat-42", text });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("UNSAFE_CONTENT");
    }

    // Nothing was transmitted, and the refusals are recorded as LABELS only,
    // so the refused text is not kept anywhere.
    expect(testTelegramProvider.sent).toHaveLength(0);
    expect(testTelegramProvider.refused).toHaveLength(forbidden.length);
    for (const refusal of testTelegramProvider.refused) {
      expect(refusal.violations.length).toBeGreaterThan(0);
      expect(JSON.stringify(refusal)).not.toContain("hunter2");
    }
  });

  it("refuses anything longer than a notice, because Telegram carries pointers and not content", async () => {
    const result = await testTelegramProvider.sendMessage({
      chatRef: "chat-42",
      text: "A".repeat(401),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNSAFE_CONTENT");
    expect(testTelegramProvider.sent).toHaveLength(0);
  });

  it("scans deterministically and reports the classes it matched", () => {
    expect(scanOutboundText(TELEGRAM_NOTICES.update_waiting).safe).toBe(true);
    const scan = scanOutboundText("Your password and your card number");
    expect(scan.safe).toBe(false);
    expect(scan.violations).toContain("password");
    expect(scan.violations).toContain("payment data");
  });
});

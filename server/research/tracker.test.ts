import crypto from "crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Tracker tests: the assessment unlock (locked reads return a locked view, not
// an error; locked writes are refused), A/B isolation on both read and write,
// window boundary math against a fixed clock, the computed-and-never-submitted
// data_completeness rule, timestamp bounds, value normalization including the
// words-are-kept-verbatim path, the accessibility text summary on every metric,
// the standing promise that no composite health score exists anywhere in the
// payload, and the write throttle. Supabase is an in-memory fake; member auth
// and the admin gate are mocked. The rate limiter is REAL (its memory fallback
// runs because the fake exposes no rpc), so the 429 is the real limiter.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  observations: [] as any[],
  responses: [] as any[],
  members: [] as any[],
  plans: [] as any[],
}));

const auth = vi.hoisted(() => ({
  current: null as any,
  deny: null as { status: number; code: string } | null,
}));

const admin = vi.hoisted(() => ({ allow: true }));

vi.mock("../supabase", () => {
  function tableFor(name: string) {
    if (name === "research_tracker_observations") return state.observations;
    if (name === "research_assessment_responses") return state.responses;
    if (name === "research_members") return state.members;
    if (name === "research_xenios30_plans") return state.plans;
    throw new Error(`unexpected table in test: ${name}`);
  }
  function query(table: string) {
    const list = tableFor(table);
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    // Timestamp comparison mirrors Postgres timestamptz ordering rather than
    // string ordering, so the window boundary is exercised honestly.
    const gteFilters: Array<[string, any]> = [];
    let isNullCol: string | null = null;
    let limitN: number | null = null;

    const matches = (r: any) =>
      filters.every(([c, v]) => r[c] === v) &&
      inFilters.every(([c, vs]) => vs.includes(r[c])) &&
      gteFilters.every(([c, v]) => Date.parse(r[c]) >= Date.parse(v)) &&
      (isNullCol === null || r[isNullCol] === null);

    const finish = () => {
      if (mode === "insert") {
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...insertPayload };
        list.push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        const targets = list.filter(matches);
        if (!targets.length) return { data: null, error: null };
        Object.assign(targets[0], updatePayload);
        return { data: targets[0], error: null };
      }
      let rows = list.filter(matches);
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows, error: null };
    };

    const api: any = {
      select: () => api,
      insert: (p: any) => { mode = "insert"; insertPayload = p; return api; },
      update: (p: any) => { mode = "update"; updatePayload = p; return api; },
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      gte: (c: string, v: any) => { gteFilters.push([c, v]); return api; },
      is: (c: string, v: any) => { if (v === null) isNullCol = c; return api; },
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
    req.adminEmail = "admin@example.com";
    next();
  },
}));

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import { TRACKER_METRIC_KEYS } from "@shared/research/member-platform";
import {
  normalizeObservationValue,
  registerTrackerApi,
  SUBMITTABLE_TRACKER_METRIC_KEYS,
  windowStartFor,
} from "./tracker";
import type { MemberPlatformDeps } from "./member-platform-deps";

// Deterministic clock. Every window assertion is measured from T0.
const T0 = Date.parse("2026-07-10T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

let nowMs = T0;

function makeDeps(): MemberPlatformDeps {
  return {
    clock: { now: () => new Date(nowMs) },
    notifier: { notify: vi.fn(async () => true) },
  };
}

let deps: MemberPlatformDeps;

function makeApp() {
  const app = express();
  app.use(express.json());
  registerTrackerApi(app, deps);
  return app;
}

const MEMBER_A = {
  id: "00000000-0000-4000-8000-0000000trka0",
  application_id: "app-a",
  auth_user_id: "auth-a",
  email: "ava@example.com",
  first_name: "Ava",
  status: "active",
  activated_at: new Date(T0 - 30 * DAY).toISOString(),
  created_at: new Date(T0 - 30 * DAY).toISOString(),
};

const MEMBER_B = {
  id: "00000000-0000-4000-8000-0000000trkb0",
  application_id: "app-b",
  auth_user_id: "auth-b",
  email: "bo@example.com",
  first_name: "Bo",
  status: "active",
  activated_at: new Date(T0 - 30 * DAY).toISOString(),
  created_at: new Date(T0 - 30 * DAY).toISOString(),
};

// Submitting the assessment is what unlocks the tracker.
function seedSubmission(memberId: string, status: "in_progress" | "submitted" = "submitted") {
  const row = {
    id: crypto.randomUUID(),
    member_id: memberId,
    definition_id: "initial-v1",
    definition_version: 1,
    mode: "initial",
    status,
    answers: {},
    started_at: new Date(T0 - 20 * DAY).toISOString(),
    last_saved_at: new Date(T0 - 20 * DAY).toISOString(),
    submitted_at: status === "submitted" ? new Date(T0 - 20 * DAY).toISOString() : null,
    reminders_sent: 0,
  };
  state.responses.push(row);
  return row;
}

function seedObservation(overrides: Record<string, any> = {}) {
  const row = {
    id: crypto.randomUUID(),
    member_id: MEMBER_A.id,
    metric_key: "sleep_and_recovery",
    source: "manual",
    recorded_at: new Date(nowMs - DAY).toISOString(),
    timezone: "Europe/London",
    unit: null,
    original_value: "7",
    normalized_value: 7,
    confidence: "high",
    notes: null,
    plan_id: null,
    created_at: new Date(nowMs - DAY).toISOString(),
    ...overrides,
  };
  state.observations.push(row);
  return row;
}

function validEntry(overrides: Record<string, any> = {}) {
  return {
    metricKey: "sleep_and_recovery",
    recordedAt: new Date(nowMs - 2 * 60 * 60 * 1000).toISOString(),
    timezone: "Europe/London",
    value: 7,
    ...overrides,
  };
}

// Every key in the payload, recursively. The composite-score promise is
// checked against field NAMES, not display text.
function collectKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, out);
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out.push(key);
      collectKeys(entry, out);
    }
  }
  return out;
}

beforeEach(() => {
  state.observations.length = 0;
  state.responses.length = 0;
  state.members.length = 0;
  state.plans.length = 0;
  auth.current = MEMBER_A;
  auth.deny = null;
  admin.allow = true;
  nowMs = T0;
  deps = makeDeps();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Normalization (pure)
// ---------------------------------------------------------------------------

describe("value normalization", () => {
  it("a number normalizes to itself with high confidence", () => {
    for (const raw of [7, 0, 72.5, -3]) {
      const result = normalizeObservationValue(raw);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.entry.normalizedValue).toBe(raw);
      expect(result.entry.confidence).toBe("high");
    }
    const asText = normalizeObservationValue("72.5");
    expect(asText.ok && asText.entry.normalizedValue).toBe(72.5);
  });

  it("a five-point rating is doubled onto the shared 0 to 10 scale; a ten-point rating is kept", () => {
    const cases: Array<[string, number]> = [
      ["4/5", 8],
      ["4 / 5", 8],
      ["3 out of 5", 6],
      ["7/10", 7],
      ["9 out of 10", 9],
    ];
    for (const [text, expected] of cases) {
      const result = normalizeObservationValue(text);
      expect(result.ok, text).toBe(true);
      if (!result.ok) continue;
      expect(result.entry.normalizedValue, text).toBe(expected);
      expect(result.entry.originalValue, text).toBe(text);
    }
  });

  it("a rating above its own scale is refused rather than guessed at", () => {
    const result = normalizeObservationValue("12/10");
    expect(result.ok).toBe(false);
  });

  it("words are kept verbatim with a null normalized value and low confidence", () => {
    const result = normalizeObservationValue("  felt sluggish all week  ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.originalValue).toBe("felt sluggish all week");
    expect(result.entry.normalizedValue).toBeNull();
    expect(result.entry.confidence).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// The unlock
// ---------------------------------------------------------------------------

describe("tracker unlock", () => {
  it("stays locked until the assessment is submitted: the read is a locked view, the write is refused", async () => {
    const app = makeApp();

    const noResponse = await request(app).get("/api/research/tracker");
    expect(noResponse.status).toBe(200);
    expect(noResponse.headers["cache-control"]).toBe("no-store");
    expect(noResponse.headers["referrer-policy"]).toBe("no-referrer");
    expect(noResponse.body).toEqual({ ok: true, progress: { unlocked: false, windowDays: 30, metrics: [] } });

    // An assessment in progress is not a submitted one.
    seedSubmission(MEMBER_A.id, "in_progress");
    const inProgress = await request(app).get("/api/research/tracker?windowDays=7");
    expect(inProgress.body.progress).toEqual({ unlocked: false, windowDays: 7, metrics: [] });

    const write = await request(app).post("/api/research/tracker").send(validEntry());
    expect(write.status).toBe(409);
    expect(write.body.code).toBe("state_conflict");
    expect(write.headers["cache-control"]).toBe("no-store");
    expect(state.observations).toHaveLength(0);
  });

  it("unlocks on submission: the read carries every metric domain and the write is stored", async () => {
    seedSubmission(MEMBER_A.id);
    const app = makeApp();

    const view = await request(app).get("/api/research/tracker");
    expect(view.status).toBe(200);
    expect(view.body.progress.unlocked).toBe(true);
    expect(view.body.progress.windowDays).toBe(30);
    expect(view.body.progress.metrics.map((metric: any) => metric.metricKey)).toEqual([...TRACKER_METRIC_KEYS]);

    const write = await request(app).post("/api/research/tracker").send(validEntry({ unit: "hours" }));
    expect(write.status).toBe(200);
    expect(write.body.observation.metricKey).toBe("sleep_and_recovery");
    expect(write.body.observation.source).toBe("manual");
    expect(write.body.observation.normalizedValue).toBe(7);
    expect(write.body.observation.originalValue).toBe(7);
    expect(write.body.observation.unit).toBe("hours");
    expect(write.body.observation.confidence).toBe("high");
    expect(state.observations).toHaveLength(1);
    expect(state.observations[0].member_id).toBe(MEMBER_A.id);
    expect(state.observations[0].created_at).toBe(new Date(T0).toISOString());
  });
});

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

describe("A/B isolation", () => {
  it("member B never sees member A's observations", async () => {
    seedSubmission(MEMBER_A.id);
    seedSubmission(MEMBER_B.id);
    seedObservation({ notes: "XENIOS_MEMBER_A_ONLY_MARKER" });

    const app = makeApp();
    const mine = await request(app).get("/api/research/tracker");
    const sleepA = mine.body.progress.metrics.find((m: any) => m.metricKey === "sleep_and_recovery");
    expect(sleepA.observations).toHaveLength(1);

    auth.current = MEMBER_B;
    const theirs = await request(app).get("/api/research/tracker");
    expect(theirs.status).toBe(200);
    expect(theirs.body.progress.unlocked).toBe(true);
    for (const metric of theirs.body.progress.metrics) {
      if (metric.metricKey === "data_completeness") continue;
      expect(metric.observations).toEqual([]);
    }
    expect(JSON.stringify(theirs.body)).not.toContain("XENIOS_MEMBER_A_ONLY_MARKER");
  });

  it("a memberId in the body is ignored: the entry lands on the signed-in member", async () => {
    seedSubmission(MEMBER_A.id);
    const res = await request(makeApp())
      .post("/api/research/tracker")
      .send({ ...validEntry(), memberId: MEMBER_B.id, member_id: MEMBER_B.id, source: "system" });

    expect(res.status).toBe(200);
    expect(state.observations).toHaveLength(1);
    expect(state.observations[0].member_id).toBe(MEMBER_A.id);
    // A client-chosen source is ignored too: this route only writes manual.
    expect(state.observations[0].source).toBe("manual");
  });

  it("another member's plan id cannot be attached to an observation", async () => {
    seedSubmission(MEMBER_A.id);
    const mine = { id: crypto.randomUUID(), member_id: MEMBER_A.id, month_label: "2026-07", state: "published" };
    const theirs = { id: crypto.randomUUID(), member_id: MEMBER_B.id, month_label: "2026-07", state: "published" };
    state.plans.push(mine, theirs);
    const app = makeApp();

    const ok = await request(app).post("/api/research/tracker").send(validEntry({ planId: mine.id }));
    expect(ok.status).toBe(200);
    expect(ok.body.observation.planId).toBe(mine.id);

    const denied = await request(app).post("/api/research/tracker").send(validEntry({ planId: theirs.id }));
    expect(denied.status).toBe(400);
    expect(denied.body.code).toBe("validation_failed");
    expect(denied.body.fieldErrors.planId).toBeTruthy();
    expect(state.observations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

describe("reporting windows", () => {
  it("filters on the 7, 30, and 90 day boundaries against a fixed clock", async () => {
    seedSubmission(MEMBER_A.id);
    seedObservation({ recorded_at: new Date(T0 - DAY).toISOString() });
    seedObservation({ recorded_at: new Date(T0 - 7 * DAY).toISOString() }); // exactly on the 7 day edge
    seedObservation({ recorded_at: new Date(T0 - 7 * DAY - 1).toISOString() }); // one ms outside it
    seedObservation({ recorded_at: new Date(T0 - 45 * DAY).toISOString() });
    seedObservation({ recorded_at: new Date(T0 - 91 * DAY).toISOString() });

    const app = makeApp();
    const counts: Record<number, number> = {};
    for (const windowDays of [7, 30, 90]) {
      const res = await request(app).get(`/api/research/tracker?windowDays=${windowDays}`);
      expect(res.status).toBe(200);
      expect(res.body.progress.windowDays).toBe(windowDays);
      const sleep = res.body.progress.metrics.find((m: any) => m.metricKey === "sleep_and_recovery");
      counts[windowDays] = sleep.observations.length;
    }
    expect(counts).toEqual({ 7: 2, 30: 3, 90: 4 });

    // The window start is inclusive, computed from the injected clock.
    expect(windowStartFor(new Date(T0), 7).toISOString()).toBe(new Date(T0 - 7 * DAY).toISOString());
  });

  it("defaults to 30 days and refuses any other window", async () => {
    seedSubmission(MEMBER_A.id);
    const app = makeApp();

    const byDefault = await request(app).get("/api/research/tracker");
    expect(byDefault.body.progress.windowDays).toBe(30);

    const bad = await request(app).get("/api/research/tracker?windowDays=45");
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("validation_failed");
    expect(bad.body.fieldErrors.windowDays).toBeTruthy();
  });

  it("returns observations newest first within a metric", async () => {
    seedSubmission(MEMBER_A.id);
    seedObservation({ recorded_at: new Date(T0 - 3 * DAY).toISOString(), original_value: "6", normalized_value: 6 });
    seedObservation({ recorded_at: new Date(T0 - DAY).toISOString(), original_value: "8", normalized_value: 8 });

    const res = await request(makeApp()).get("/api/research/tracker");
    const sleep = res.body.progress.metrics.find((m: any) => m.metricKey === "sleep_and_recovery");
    expect(sleep.observations.map((o: any) => o.normalizedValue)).toEqual([8, 6]);
  });
});

// ---------------------------------------------------------------------------
// data_completeness: computed, never submitted
// ---------------------------------------------------------------------------

describe("data_completeness", () => {
  it("is computed from coverage of the other five domains", async () => {
    seedSubmission(MEMBER_A.id);
    seedObservation({ metric_key: "sleep_and_recovery" });
    seedObservation({ metric_key: "plan_adherence" });
    seedObservation({ metric_key: "energy_stress_vitality" });

    const res = await request(makeApp()).get("/api/research/tracker");
    const completeness = res.body.progress.metrics.find((m: any) => m.metricKey === "data_completeness");
    expect(completeness.observations).toHaveLength(1);
    expect(completeness.observations[0].normalizedValue).toBe(60);
    expect(completeness.observations[0].originalValue).toBe(`3 of ${SUBMITTABLE_TRACKER_METRIC_KEYS.length}`);
    expect(completeness.observations[0].source).toBe("system");
    expect(completeness.textSummary).toContain("3 of the other 5 areas");
    // Nothing computed is ever stored.
    expect(state.observations.every((row: any) => row.metric_key !== "data_completeness")).toBe(true);
  });

  it("is empty-but-honest with no entries at all", async () => {
    seedSubmission(MEMBER_A.id);
    const res = await request(makeApp()).get("/api/research/tracker");
    const completeness = res.body.progress.metrics.find((m: any) => m.metricKey === "data_completeness");
    expect(completeness.observations[0].normalizedValue).toBe(0);
    expect(completeness.textSummary).toContain("nothing to compare");
  });

  it("cannot be submitted by a member", async () => {
    seedSubmission(MEMBER_A.id);
    const res = await request(makeApp())
      .post("/api/research/tracker")
      .send(validEntry({ metricKey: "data_completeness", value: 100 }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.metricKey[0]).toContain("computed");
    expect(state.observations).toHaveLength(0);
  });

  it("rejects a metric key outside the six domains", async () => {
    seedSubmission(MEMBER_A.id);
    const res = await request(makeApp())
      .post("/api/research/tracker")
      .send(validEntry({ metricKey: "overall_health" }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(state.observations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

describe("recordedAt bounds", () => {
  it("refuses any future timestamp and anything older than seven days, and accepts both edges", async () => {
    seedSubmission(MEMBER_A.id);
    const app = makeApp();

    const future = await request(app)
      .post("/api/research/tracker")
      .send(validEntry({ recordedAt: new Date(T0 + 1000).toISOString() }));
    expect(future.status).toBe(400);
    expect(future.body.fieldErrors.recordedAt[0]).toContain("future");

    const tooOld = await request(app)
      .post("/api/research/tracker")
      .send(validEntry({ recordedAt: new Date(T0 - 7 * DAY - 1).toISOString() }));
    expect(tooOld.status).toBe(400);
    expect(tooOld.body.fieldErrors.recordedAt[0]).toContain("backdated");

    const malformed = await request(app)
      .post("/api/research/tracker")
      .send(validEntry({ recordedAt: "last tuesday" }));
    expect(malformed.status).toBe(400);
    expect(malformed.body.fieldErrors.recordedAt).toBeTruthy();

    expect(state.observations).toHaveLength(0);

    // Both boundaries are inclusive: exactly now, and exactly seven days ago.
    const atNow = await request(app)
      .post("/api/research/tracker")
      .send(validEntry({ recordedAt: new Date(T0).toISOString() }));
    expect(atNow.status).toBe(200);

    const atEdge = await request(app)
      .post("/api/research/tracker")
      .send(validEntry({ recordedAt: new Date(T0 - 7 * DAY).toISOString() }));
    expect(atEdge.status).toBe(200);
    expect(state.observations).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Stored values
// ---------------------------------------------------------------------------

describe("stored values", () => {
  it("a text entry is kept verbatim with a null normalized value and low confidence", async () => {
    seedSubmission(MEMBER_A.id);
    const res = await request(makeApp())
      .post("/api/research/tracker")
      .send(validEntry({ metricKey: "energy_stress_vitality", value: "wiped out by Thursday" }));

    expect(res.status).toBe(200);
    expect(res.body.observation.originalValue).toBe("wiped out by Thursday");
    expect(res.body.observation.normalizedValue).toBeNull();
    expect(res.body.observation.confidence).toBe("low");
    expect(state.observations[0].normalized_value).toBeNull();
    expect(state.observations[0].confidence).toBe("low");
  });

  it("a five-point rating is stored on the shared scale with the member's words intact", async () => {
    seedSubmission(MEMBER_A.id);
    const res = await request(makeApp())
      .post("/api/research/tracker")
      .send(validEntry({ metricKey: "plan_adherence", value: "4/5" }));

    expect(res.status).toBe(200);
    expect(res.body.observation.originalValue).toBe("4/5");
    expect(res.body.observation.normalizedValue).toBe(8);
    expect(state.observations[0].original_value).toBe("4/5");
  });
});

// ---------------------------------------------------------------------------
// Accessibility and the no-score promise
// ---------------------------------------------------------------------------

describe("text summaries", () => {
  it("every metric carries a non-empty plain-language summary, with data or without", async () => {
    seedSubmission(MEMBER_A.id);
    seedObservation({
      metric_key: "sleep_and_recovery",
      recorded_at: new Date(T0 - 4 * DAY).toISOString(),
      original_value: "6",
      normalized_value: 6,
      unit: "hours",
    });
    seedObservation({
      metric_key: "sleep_and_recovery",
      recorded_at: new Date(T0 - DAY).toISOString(),
      original_value: "8",
      normalized_value: 8,
      unit: "hours",
    });
    seedObservation({
      metric_key: "body_and_appearance",
      original_value: "leaner in the shoulders",
      normalized_value: null,
      confidence: "low",
    });

    const res = await request(makeApp()).get("/api/research/tracker");
    expect(res.body.progress.metrics).toHaveLength(TRACKER_METRIC_KEYS.length);
    for (const metric of res.body.progress.metrics) {
      expect(typeof metric.textSummary, metric.metricKey).toBe("string");
      expect(metric.textSummary.length, metric.metricKey).toBeGreaterThan(0);
    }

    const sleep = res.body.progress.metrics.find((m: any) => m.metricKey === "sleep_and_recovery");
    expect(sleep.textSummary).toContain("2 entries in the last 30 days");
    expect(sleep.textSummary).toContain("Latest 8 hours");
    expect(sleep.textSummary).toContain("Higher than your first entry");

    const body = res.body.progress.metrics.find((m: any) => m.metricKey === "body_and_appearance");
    expect(body.textSummary).toContain("in your own words");

    const performance = res.body.progress.metrics.find((m: any) => m.metricKey === "performance_and_function");
    expect(performance.textSummary).toContain("no entries in the last 30 days");
  });
});

describe("no composite health score", () => {
  it("no field named score, overall, or index exists anywhere in a tracker response", async () => {
    seedSubmission(MEMBER_A.id);
    for (const key of SUBMITTABLE_TRACKER_METRIC_KEYS) seedObservation({ metric_key: key });

    const app = makeApp();
    const view = await request(app).get("/api/research/tracker");
    const written = await request(app).post("/api/research/tracker").send(validEntry());
    const wideWindow = await request(app).get("/api/research/tracker?windowDays=90");

    for (const res of [view, written, wideWindow]) {
      const keys = collectKeys(res.body);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(key, `unexpected field: ${key}`).not.toMatch(/score|overall|index/i);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Throttle
// ---------------------------------------------------------------------------

describe("write throttle", () => {
  it("allows 120 entries an hour per member and then rate limits", async () => {
    // Its own member id: the limiter's window is shared for the process, so a
    // dedicated key keeps this test from spending another test's budget.
    const heavy = { ...MEMBER_A, id: "00000000-0000-4000-8000-0000000trkl0" };
    auth.current = heavy;
    seedSubmission(heavy.id);
    const app = makeApp();

    for (let i = 0; i < 120; i += 1) {
      const res = await request(app).post("/api/research/tracker").send(validEntry());
      expect(res.status, `entry ${i + 1}`).toBe(200);
    }

    const limited = await request(app).post("/api/research/tracker").send(validEntry());
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("rate_limited");
    expect(state.observations).toHaveLength(120);
  });
});

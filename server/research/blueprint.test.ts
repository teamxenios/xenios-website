import crypto from "crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Blueprint + recommendation tests: engine determinism and vocabulary (never
// dosing, never free-text echo), the member content wall (draft content is
// NEVER visible before publication), Samuel-only review and publication, the
// frozen state machine, acknowledgment versioning, and A/B isolation.
// Supabase is an in-memory fake; member auth and the admin gate are mocked so
// identity and denial are chosen per test.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  blueprints: [] as any[],
  responses: [] as any[],
  members: [] as any[],
}));

const auth = vi.hoisted(() => ({
  current: null as any,
  deny: null as { status: number; code: string } | null,
}));

const admin = vi.hoisted(() => ({ allow: true }));

vi.mock("../supabase", () => {
  function tableFor(name: string) {
    if (name === "research_blueprints") return state.blueprints;
    if (name === "research_assessment_responses") return state.responses;
    if (name === "research_members") return state.members;
    throw new Error(`unexpected table in test: ${name}`);
  }
  function query(table: string) {
    const list = tableFor(table);
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    let isNullCol: string | null = null;
    let limitN: number | null = null;

    const matches = (r: any) =>
      filters.every(([c, v]) => r[c] === v) &&
      inFilters.every(([c, vs]) => vs.includes(r[c])) &&
      (isNullCol === null || r[isNullCol] === null);

    const finish = () => {
      if (mode === "insert") {
        if (
          table === "research_blueprints" &&
          list.some((r: any) => r.member_id === insertPayload.member_id && r.version === insertPayload.version)
        ) {
          return { data: null, error: { message: "duplicate key value violates unique constraint" } };
        }
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

// The admin gate: per-test allow/deny so a member session can be proven
// unable to reach the Samuel-only surface.
vi.mock("../routes", () => ({
  requireSupabaseAdmin: (req: any, res: any, next: any) => {
    if (!admin.allow) return res.status(403).json({ ok: false, code: "admin_required" });
    req.adminEmail = "admin@example.com";
    next();
  },
}));

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import { recommend, type RecommendationInput } from "./recommendation";
import { canTransition, registerBlueprintApi } from "./blueprint";
import type { MemberPlatformDeps } from "./member-platform-deps";

// Deterministic clock + recording notifier.
const T0 = Date.parse("2026-07-10T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

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
  registerBlueprintApi(app, deps);
  return app;
}

const MEMBER_A = {
  id: "00000000-0000-4000-8000-00000000bpa0",
  application_id: "app-a",
  auth_user_id: "auth-a",
  email: "ava@example.com",
  first_name: "Ava",
  status: "active",
  activated_at: new Date(T0).toISOString(),
  created_at: new Date(T0).toISOString(),
};

const MEMBER_B = {
  id: "00000000-0000-4000-8000-00000000bpb0",
  application_id: "app-b",
  auth_user_id: "auth-b",
  email: "bo@example.com",
  first_name: "Bo",
  status: "active",
  activated_at: new Date(T0).toISOString(),
  created_at: new Date(T0).toISOString(),
};

// A full, realistic submitted answer set (assessment question ids).
const BASE_ANSWERS: Record<string, any> = {
  primary_goal: "body_recomposition",
  secondary_goals: ["sleep_quality", "energy"],
  goal_meaning: "feel strong and present by day 90",
  height_cm: 180,
  weight_kg: 82,
  typical_day: "seated_desk",
  training_frequency: "three_to_four",
  training_styles: ["strength"],
  has_injuries: "no",
  eating_pattern: "loosely_structured",
  meals_per_day: 3,
  dietary_restrictions: ["none"],
  sleep_hours: 6,
  sleep_quality: 4,
  trouble_falling_asleep: "some_nights",
  energy_level: 4,
  energy_dips: ["afternoon"],
  stress_level: 7,
  stress_sources: ["work"],
  takes_supplements: "no",
  has_allergies: "no",
  clinician_care_flag: "no",
  activity_restriction_flag: "no",
  pregnancy_flag: "no",
  monthly_budget: "from_100_to_200",
  budget_priority: "balanced",
  routine_capacity: "moderate",
  format_preference: ["capsules"],
  reminder_preference: "email",
  direction_30: "build the base",
  direction_90: "a consistent routine",
  plan_confidence: 7,
};

function answersWith(overrides: Record<string, any>): RecommendationInput {
  return { answers: { ...BASE_ANSWERS, ...overrides } };
}

function seedSubmission(memberId: string, answers: Record<string, any> = BASE_ANSWERS) {
  const row = {
    id: crypto.randomUUID(),
    member_id: memberId,
    definition_id: "initial-v1",
    definition_version: 1,
    mode: "initial",
    status: "submitted",
    answers,
    started_at: new Date(T0).toISOString(),
    last_saved_at: new Date(T0).toISOString(),
    submitted_at: new Date(T0).toISOString(),
    reminders_sent: 0,
  };
  state.responses.push(row);
  return row;
}

const DRAFT_MARKER = "XENIOS_DRAFT_MARKER_NEVER_MEMBER_VISIBLE";
const INTERNAL_NOTE_MARKER = "XENIOS_INTERNAL_NOTE_MARKER";

function draftContent(marker = DRAFT_MARKER) {
  return {
    primaryGoal: "Body recomposition",
    secondaryGoals: ["Sleep quality"],
    topPriorities: ["one", "two", "three"],
    recommendations: [
      {
        id: "lifestyle_sleep_routine",
        kind: "lifestyle",
        title: "A consistent wind-down and sleep window",
        disposition: "recommended",
        explanation: marker,
        sourceSignals: ["sleep_hours"],
      },
    ],
    questionsForReview: [],
    confidence: "high",
  };
}

function seedBlueprint(overrides: Record<string, any> = {}) {
  const row = {
    id: crypto.randomUUID(),
    member_id: MEMBER_A.id,
    version: 1,
    state: "samuel_review",
    content: draftContent(),
    assessment_response_id: null,
    reviewed_by: null,
    review_comment: null,
    member_visible_message: null,
    published_at: null,
    superseded_by_version: null,
    member_acknowledged_at: null,
    created_at: new Date(nowMs).toISOString(),
    updated_at: new Date(nowMs).toISOString(),
    ...overrides,
  };
  state.blueprints.push(row);
  return row;
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const entry of value) collectStrings(entry, out);
  else if (value && typeof value === "object") for (const entry of Object.values(value)) collectStrings(entry, out);
  return out;
}

// The vocabulary wall: no dosing, administration, or treatment language may
// ever appear in engine output.
const DENYLIST =
  /\b(mg|mcg|dose|doses|dosage|dosing|inject|injection|injections|administer|administered|administering|administration|prescription|prescriptions|prescribe|prescribed)\b/i;

beforeEach(() => {
  state.blueprints.length = 0;
  state.responses.length = 0;
  state.members.length = 0;
  auth.current = MEMBER_A;
  auth.deny = null;
  admin.allow = true;
  nowMs = T0;
  notifications = [];
  deps = makeDeps();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// The recommendation engine (pure)
// ---------------------------------------------------------------------------

describe("recommendation engine", () => {
  const variants: Record<string, RecommendationInput> = {
    base: answersWith({}),
    safety_flagged: answersWith({ pregnancy_flag: "yes", clinician_care_flag: "yes" }),
    injured_allergic_duplicates: answersWith({
      has_injuries: "yes",
      injury_details: "torn ACL from a ski accident",
      has_allergies: "yes",
      allergy_details: "peanuts and shellfish",
      takes_supplements: "yes",
      current_supplements: "Daily multivitamin and fish oil",
      products_working: "not_working",
    }),
    budget_tight: answersWith({ monthly_budget: "under_50", budget_priority: "essentials_only" }),
    sparse: { answers: {} },
  };

  it("is deterministic: the same input always produces the same output", () => {
    for (const input of Object.values(variants)) {
      const first = recommend(JSON.parse(JSON.stringify(input)));
      const second = recommend(JSON.parse(JSON.stringify(input)));
      expect(second).toEqual(first);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    }
  });

  it("never emits dosing, administration, or prescription vocabulary in any variant", () => {
    for (const [name, input] of Object.entries(variants)) {
      const strings = collectStrings(recommend(input));
      for (const text of strings) {
        expect(text, `variant ${name}: "${text}"`).not.toMatch(DENYLIST);
      }
    }
  });

  it("every recommendation carries an explanation and answered sourceSignals", () => {
    for (const [name, input] of Object.entries(variants)) {
      const output = recommend(input);
      for (const item of output.recommendations) {
        expect(item.id, `variant ${name}`).toBeTruthy();
        expect(item.title, `variant ${name}`).toBeTruthy();
        expect(item.explanation.length, `variant ${name}: ${item.id}`).toBeGreaterThan(0);
        expect(item.sourceSignals.length, `variant ${name}: ${item.id}`).toBeGreaterThan(0);
        // Every signal is traceable to a question that was actually answered.
        for (const signal of item.sourceSignals) {
          expect(input.answers[signal], `variant ${name}: ${item.id} cites ${signal}`).not.toBeUndefined();
        }
      }
    }
  });

  it("maps goals and always returns exactly three priorities", () => {
    const output = recommend(variants.base);
    expect(output.primaryGoal).toBe("Body recomposition");
    expect(output.secondaryGoals).toEqual(["Sleep quality", "Everyday energy"]);
    expect(output.topPriorities).toHaveLength(3);
    expect(recommend(variants.sparse).topPriorities).toHaveLength(3);
  });

  it("assigns a named fitness program and caps it at three days for minimal capacity", () => {
    const base = recommend(variants.base);
    const fitness = base.recommendations.find((item) => item.kind === "fitness_program")!;
    expect(fitness.title).toBe("Strength Builder 4-Day");
    expect(fitness.disposition).toBe("recommended");

    const capped = recommend(answersWith({ routine_capacity: "minimal" }));
    const cappedFitness = capped.recommendations.find((item) => item.kind === "fitness_program")!;
    expect(cappedFitness.title).toBe("Foundation Strength 3-Day");
  });

  it("safety flags push product and supplement items to needs_samuel_review with review questions", () => {
    const output = recommend(variants.safety_flagged);
    const flagged = output.recommendations.filter(
      (item) => item.kind === "product_option" || (item.kind === "supplement_foundation" && item.disposition !== "excluded"),
    );
    expect(flagged.length).toBeGreaterThan(0);
    for (const item of flagged) expect(item.disposition).toBe("needs_samuel_review");
    expect(output.questionsForReview.length).toBeGreaterThan(0);
  });

  it("an injury routes the fitness program to needs_samuel_review without echoing the member's words", () => {
    const output = recommend(variants.injured_allergic_duplicates);
    const fitness = output.recommendations.find((item) => item.kind === "fitness_program")!;
    expect(fitness.disposition).toBe("needs_samuel_review");
    expect(output.questionsForReview.some((q) => q.toLowerCase().includes("injury"))).toBe(true);
    // Free-text answers never enter the output: no injury, allergy, or
    // product text appears anywhere.
    const strings = collectStrings(output).join(" ").toLowerCase();
    expect(strings).not.toContain("acl");
    expect(strings).not.toContain("ski");
    expect(strings).not.toContain("peanut");
    expect(strings).not.toContain("shellfish");
    expect(strings).not.toContain("fish oil");
  });

  it("product options only ever speak through the three availability dispositions", () => {
    const allowed = new Set(["possible_research_pathway", "needs_samuel_review", "not_available"]);
    for (const [name, input] of Object.entries(variants)) {
      for (const item of recommend(input).recommendations) {
        if (item.kind === "product_option" || item.kind === "research_pathway") {
          expect(allowed.has(item.disposition), `variant ${name}: ${item.id} -> ${item.disposition}`).toBe(true);
        }
      }
    }
    const base = recommend(variants.base);
    expect(base.recommendations.find((item) => item.id === "product_options_goal_fit")!.disposition).toBe(
      "possible_research_pathway",
    );
    const tight = recommend(variants.budget_tight);
    expect(tight.recommendations.find((item) => item.id === "product_options_goal_fit")!.disposition).toBe(
      "not_available",
    );
  });

  it("supplement foundations are generic categories, with duplicates warned instead of re-added", () => {
    const output = recommend(variants.injured_allergic_duplicates);
    const multivitamin = output.recommendations.find((item) => item.id === "supplement_multivitamin")!;
    const omega = output.recommendations.find((item) => item.id === "supplement_omega_3")!;
    expect(multivitamin.title).toBe("A foundation multivitamin");
    expect(omega.title).toBe("An omega-3 source");
    expect(multivitamin.disposition).toBe("duplicate_warning");
    expect(omega.disposition).toBe("duplicate_warning");
    // The current-products review item exists because the member said their
    // products may not be working.
    const review = output.recommendations.find((item) => item.id === "product_options_current_review")!;
    expect(review.disposition).toBe("needs_samuel_review");
  });

  it("allergies produce an exclusion item and a cross-check question", () => {
    const output = recommend(variants.injured_allergic_duplicates);
    const exclusion = output.recommendations.find((item) => item.id === "exclusions_allergies")!;
    expect(exclusion.disposition).toBe("excluded");
    expect(exclusion.sourceSignals).toContain("has_allergies");
    expect(output.questionsForReview.some((q) => q.toLowerCase().includes("allergy"))).toBe(true);
  });

  it("confidence tiers follow answer completeness", () => {
    expect(recommend(variants.base).confidence).toBe("high");
    expect(recommend({ answers: {} }).confidence).toBe("low");
    expect(
      recommend({
        answers: {
          primary_goal: "strength",
          goal_meaning: "get stronger",
          training_frequency: "three_to_four",
          has_injuries: "no",
          eating_pattern: "tracked",
          sleep_hours: 7,
          sleep_quality: 7,
          energy_level: 6,
          stress_level: 4,
          takes_supplements: "no",
        },
      }).confidence,
    ).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// Member surface
// ---------------------------------------------------------------------------

describe("GET /api/research/blueprint", () => {
  it("derives the pre-generation state from the assessment and sets privacy headers", async () => {
    const app = makeApp();
    const before = await request(app).get("/api/research/blueprint");
    expect(before.status).toBe(200);
    expect(before.headers["cache-control"]).toBe("no-store");
    expect(before.headers["referrer-policy"]).toBe("no-referrer");
    expect(before.body).toEqual({ ok: true, blueprint: null, state: "assessment_due" });

    seedSubmission(MEMBER_A.id);
    const after = await request(app).get("/api/research/blueprint");
    expect(after.body).toEqual({ ok: true, blueprint: null, state: "assessment_submitted" });
  });

  it("NEVER returns draft content in review states: state and placeholder message only", async () => {
    const app = makeApp();
    for (const reviewState of ["preliminary", "samuel_review"]) {
      state.blueprints.length = 0;
      seedBlueprint({ state: reviewState });
      const res = await request(app).get("/api/research/blueprint");
      expect(res.status).toBe(200);
      expect(res.body.blueprint).toBeNull();
      expect(res.body.state).toBe(reviewState);
      expect(typeof res.body.memberVisibleMessage).toBe("string");
      expect(res.body.memberVisibleMessage.length).toBeGreaterThan(0);
      // The hard wall: nothing from the draft content is serialized.
      expect(JSON.stringify(res.body)).not.toContain(DRAFT_MARKER);
    }
  });

  it("more_information_needed shows Samuel's member-visible message and never the internal note", async () => {
    seedBlueprint({
      state: "more_information_needed",
      member_visible_message: "Could you say more about your training history?",
      review_comment: INTERNAL_NOTE_MARKER,
    });
    const res = await request(makeApp()).get("/api/research/blueprint");
    expect(res.status).toBe(200);
    expect(res.body.blueprint).toBeNull();
    expect(res.body.state).toBe("more_information_needed");
    expect(res.body.memberVisibleMessage).toBe("Could you say more about your training history?");
    expect(JSON.stringify(res.body)).not.toContain(INTERNAL_NOTE_MARKER);
    expect(JSON.stringify(res.body)).not.toContain(DRAFT_MARKER);
  });

  it("a published blueprint returns the full view, still without the internal note", async () => {
    seedBlueprint({
      state: "published",
      reviewed_by: "Samuel",
      review_comment: INTERNAL_NOTE_MARKER,
      published_at: new Date(T0).toISOString(),
    });
    const res = await request(makeApp()).get("/api/research/blueprint");
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("published");
    expect(res.body.blueprint.state).toBe("published");
    expect(res.body.blueprint.version).toBe(1);
    expect(res.body.blueprint.primaryGoal).toBe("Body recomposition");
    expect(res.body.blueprint.recommendations).toHaveLength(1);
    expect(res.body.blueprint.reviewedBy).toBe("Samuel");
    expect(res.body.blueprint.publishedAt).toBe(new Date(T0).toISOString());
    expect(JSON.stringify(res.body)).not.toContain(INTERNAL_NOTE_MARKER);
  });

  it("A/B isolation: member B never sees member A's blueprint", async () => {
    seedBlueprint({ state: "published", published_at: new Date(T0).toISOString() });
    auth.current = MEMBER_B;
    const res = await request(makeApp()).get("/api/research/blueprint");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, blueprint: null, state: "assessment_due" });
    expect(JSON.stringify(res.body)).not.toContain(DRAFT_MARKER);
  });
});

describe("POST /api/research/blueprint/acknowledge", () => {
  it("stamps acknowledgedAt on the current published version, idempotently", async () => {
    const row = seedBlueprint({ state: "published", published_at: new Date(T0).toISOString() });
    const app = makeApp();
    const res = await request(app)
      .post("/api/research/blueprint/acknowledge")
      .send({ blueprintId: row.id, version: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, acknowledgedAt: new Date(T0).toISOString() });
    expect(state.blueprints[0].member_acknowledged_at).toBe(new Date(T0).toISOString());

    // Acknowledging again returns the original timestamp, not an error.
    nowMs = T0 + DAY;
    const again = await request(app)
      .post("/api/research/blueprint/acknowledge")
      .send({ blueprintId: row.id, version: 1 });
    expect(again.status).toBe(200);
    expect(again.body.acknowledgedAt).toBe(new Date(T0).toISOString());
  });

  it("a stale version is a state_conflict naming the current version", async () => {
    const row = seedBlueprint({ state: "published", version: 3, published_at: new Date(T0).toISOString() });
    const res = await request(makeApp())
      .post("/api/research/blueprint/acknowledge")
      .send({ blueprintId: row.id, version: 2 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
    expect(res.body.message).toContain("3");
    expect(state.blueprints[0].member_acknowledged_at).toBeNull();
  });

  it("A/B isolation: member B acknowledging A's blueprint reads as not_found", async () => {
    const row = seedBlueprint({ state: "published", published_at: new Date(T0).toISOString() });
    auth.current = MEMBER_B;
    const res = await request(makeApp())
      .post("/api/research/blueprint/acknowledge")
      .send({ blueprintId: row.id, version: 1 });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("not_found");
    expect(state.blueprints[0].member_acknowledged_at).toBeNull();
  });

  it("a blueprint still in review cannot be acknowledged", async () => {
    const row = seedBlueprint({ state: "samuel_review" });
    const res = await request(makeApp())
      .post("/api/research/blueprint/acknowledge")
      .send({ blueprintId: row.id, version: 1 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
  });
});

// ---------------------------------------------------------------------------
// Samuel-only surface
// ---------------------------------------------------------------------------

describe("admin gate", () => {
  it("a non-admin session cannot reach any admin blueprint route", async () => {
    admin.allow = false;
    const row = seedBlueprint({ state: "samuel_review" });
    const app = makeApp();

    const queue = await request(app).get("/api/admin/research/blueprints");
    expect(queue.status).toBe(403);

    const review = await request(app)
      .post(`/api/admin/research/blueprints/${row.id}/review`)
      .send({ action: "approve_and_publish" });
    expect(review.status).toBe(403);

    const generate = await request(app)
      .post("/api/admin/research/blueprints/generate")
      .send({ memberId: MEMBER_A.id });
    expect(generate.status).toBe(403);

    // Nothing was published and nobody was notified.
    expect(state.blueprints[0].state).toBe("samuel_review");
    expect(notifications).toHaveLength(0);
  });
});

describe("GET /api/admin/research/blueprints", () => {
  it("lists review states with safe summaries (first name, version, days waiting) and no content", async () => {
    state.members.push({ ...MEMBER_A }, { ...MEMBER_B });
    seedBlueprint({ created_at: new Date(T0 - 3 * DAY).toISOString() }); // Ava, samuel_review
    seedBlueprint({
      member_id: MEMBER_B.id,
      state: "preliminary",
      created_at: new Date(T0).toISOString(),
    });
    seedBlueprint({ version: 9, state: "published", created_at: new Date(T0 - 9 * DAY).toISOString() });

    const res = await request(makeApp()).get("/api/admin/research/blueprints");
    expect(res.status).toBe(200);
    expect(res.body.page.queue).toBe("blueprint_review");
    expect(res.body.page.total).toBe(2); // the published row is not queued
    const summaries = res.body.page.items.map((item: any) => item.safeSummary);
    expect(summaries[0]).toContain("Ava");
    expect(summaries[0]).toContain("v1");
    expect(summaries[0]).toContain("waiting 3 days");
    expect(summaries[1]).toContain("Bo");
    expect(res.body.page.items[0].priority).toBe("high");
    expect(res.body.page.items[1].priority).toBe("normal");
    expect(res.body.page.items[0].subjectRef).toBe(MEMBER_A.id);
    // Health answers and draft content never enter the queue payload.
    expect(JSON.stringify(res.body)).not.toContain(DRAFT_MARKER);
  });

  it("filters by state, paginates with a cursor, and rejects a non-review state", async () => {
    state.members.push({ ...MEMBER_A });
    seedBlueprint({ created_at: new Date(T0 - 2 * DAY).toISOString() });
    seedBlueprint({ version: 2, created_at: new Date(T0 - DAY).toISOString() });
    seedBlueprint({ version: 3, state: "more_information_needed", created_at: new Date(T0).toISOString() });

    const app = makeApp();
    const filtered = await request(app).get("/api/admin/research/blueprints?state=samuel_review");
    expect(filtered.body.page.total).toBe(2);

    const page1 = await request(app).get("/api/admin/research/blueprints?limit=2");
    expect(page1.body.page.items).toHaveLength(2);
    expect(page1.body.page.nextCursor).toBe("2");
    const page2 = await request(app).get("/api/admin/research/blueprints?limit=2&cursor=2");
    expect(page2.body.page.items).toHaveLength(1);
    expect(page2.body.page.nextCursor).toBeNull();

    const bad = await request(app).get("/api/admin/research/blueprints?state=published");
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("validation_failed");
  });
});

describe("generation", () => {
  it("consumes the submitted assessment, creates version 1 in samuel_review, and is idempotent", async () => {
    state.members.push({ ...MEMBER_A });
    const submission = seedSubmission(MEMBER_A.id);
    const app = makeApp();

    const first = await request(app)
      .post("/api/admin/research/blueprints/generate")
      .send({ memberId: MEMBER_A.id });
    expect(first.status).toBe(200);
    expect(first.body.version).toBe(1);
    expect(first.body.state).toBe("samuel_review");
    expect(first.body.created).toBe(true);
    expect(state.blueprints).toHaveLength(1);
    expect(state.blueprints[0].assessment_response_id).toBe(submission.id);
    expect(state.blueprints[0].content.primaryGoal).toBe("Body recomposition");
    expect(state.blueprints[0].content.recommendations.length).toBeGreaterThan(0);

    const again = await request(app)
      .post("/api/admin/research/blueprints/generate")
      .send({ memberId: MEMBER_A.id });
    expect(again.status).toBe(200);
    expect(again.body.blueprintId).toBe(first.body.blueprintId);
    expect(again.body.created).toBe(false);
    expect(state.blueprints).toHaveLength(1);

    const forced = await request(app)
      .post("/api/admin/research/blueprints/generate")
      .send({ memberId: MEMBER_A.id, force: true });
    expect(forced.status).toBe(409);
    expect(forced.body.code).toBe("state_conflict");
  });

  it("refuses generation without a submitted assessment, and for an unknown member", async () => {
    state.members.push({ ...MEMBER_B });
    const app = makeApp();

    const noSubmission = await request(app)
      .post("/api/admin/research/blueprints/generate")
      .send({ memberId: MEMBER_B.id });
    expect(noSubmission.status).toBe(409);
    expect(noSubmission.body.code).toBe("state_conflict");

    const unknown = await request(app)
      .post("/api/admin/research/blueprints/generate")
      .send({ memberId: "00000000-0000-4000-8000-000000nobody" });
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("not_found");
    expect(state.blueprints).toHaveLength(0);
  });
});

describe("review actions", () => {
  it("approve_and_publish publishes, notifies with a firstName-only payload, and refuses a re-publish", async () => {
    state.members.push({ ...MEMBER_A });
    const row = seedBlueprint({ state: "samuel_review" });
    const app = makeApp();

    nowMs = T0 + DAY;
    const res = await request(app)
      .post(`/api/admin/research/blueprints/${row.id}/review`)
      .send({ action: "approve_and_publish", comment: "reviewed and sound" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, state: "published" });
    expect(state.blueprints[0].state).toBe("published");
    expect(state.blueprints[0].published_at).toBe(new Date(nowMs).toISOString());
    expect(state.blueprints[0].reviewed_by).toBe("Samuel");
    expect(state.blueprints[0].review_comment).toBe("reviewed and sound");

    expect(notifications).toHaveLength(1);
    expect(notifications[0].templateKey).toBe("member_plan_published");
    expect(notifications[0].recipient).toBe(MEMBER_A.email);
    // The payload carries the first name and NOTHING else: no health data,
    // no blueprint content.
    expect(notifications[0].payload).toEqual({ firstName: "Ava" });
    expect(Object.keys(notifications[0].payload)).toEqual(["firstName"]);

    const again = await request(app)
      .post(`/api/admin/research/blueprints/${row.id}/review`)
      .send({ action: "approve_and_publish" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("state_conflict");
    expect(notifications).toHaveLength(1);
  });

  it("request_information stores the member message and internal note in the right places", async () => {
    const row = seedBlueprint({ state: "samuel_review" });
    const app = makeApp();
    const res = await request(app)
      .post(`/api/admin/research/blueprints/${row.id}/review`)
      .send({
        action: "request_information",
        memberVisibleMessage: "One clarification about your training history, please.",
        internalNote: INTERNAL_NOTE_MARKER,
      });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("more_information_needed");
    expect(state.blueprints[0].member_visible_message).toBe("One clarification about your training history, please.");
    expect(state.blueprints[0].review_comment).toBe(INTERNAL_NOTE_MARKER);

    // The member sees the message and never the note or the draft.
    const memberView = await request(app).get("/api/research/blueprint");
    expect(memberView.body.memberVisibleMessage).toBe("One clarification about your training history, please.");
    expect(JSON.stringify(memberView.body)).not.toContain(INTERNAL_NOTE_MARKER);
    expect(JSON.stringify(memberView.body)).not.toContain(DRAFT_MARKER);
  });

  it("revise records the internal note and returns the blueprint to samuel_review", async () => {
    const row = seedBlueprint({ state: "more_information_needed" });
    const app = makeApp();
    const res = await request(app)
      .post(`/api/admin/research/blueprints/${row.id}/review`)
      .send({ action: "revise", internalNote: INTERNAL_NOTE_MARKER });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("samuel_review");
    expect(state.blueprints[0].review_comment).toBe(INTERNAL_NOTE_MARKER);

    // revise on a samuel_review row stays in samuel_review.
    const stay = await request(app)
      .post(`/api/admin/research/blueprints/${row.id}/review`)
      .send({ action: "revise", internalNote: "second pass" });
    expect(stay.status).toBe(200);
    expect(stay.body.state).toBe("samuel_review");
    expect(state.blueprints[0].review_comment).toBe("second pass");
  });

  it("the state machine rejects illegal transitions", async () => {
    expect(canTransition("preliminary", "published")).toBe(false);
    expect(canTransition("published", "more_information_needed")).toBe(false);
    expect(canTransition("samuel_review", "published")).toBe(true);

    const preliminary = seedBlueprint({ state: "preliminary" });
    const app = makeApp();
    const publishDraft = await request(app)
      .post(`/api/admin/research/blueprints/${preliminary.id}/review`)
      .send({ action: "approve_and_publish" });
    expect(publishDraft.status).toBe(409);
    expect(publishDraft.body.code).toBe("state_conflict");
    expect(state.blueprints[0].state).toBe("preliminary");

    const published = seedBlueprint({ version: 2, state: "published", published_at: new Date(T0).toISOString() });
    const askPublished = await request(app)
      .post(`/api/admin/research/blueprints/${published.id}/review`)
      .send({ action: "request_information", memberVisibleMessage: "hm" });
    expect(askPublished.status).toBe(409);
    expect(askPublished.body.code).toBe("state_conflict");

    const missing = await request(app)
      .post(`/api/admin/research/blueprints/${crypto.randomUUID()}/review`)
      .send({ action: "approve_and_publish" });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("not_found");
  });

  it("publishing a new version supersedes the old one and the member sees only the new", async () => {
    state.members.push({ ...MEMBER_A });
    seedSubmission(MEMBER_A.id);
    const app = makeApp();

    // Version 1: generate and publish.
    const gen1 = await request(app)
      .post("/api/admin/research/blueprints/generate")
      .send({ memberId: MEMBER_A.id });
    await request(app)
      .post(`/api/admin/research/blueprints/${gen1.body.blueprintId}/review`)
      .send({ action: "approve_and_publish" });
    expect(state.blueprints[0].state).toBe("published");

    // Version 2: the published v1 is no longer in review, so generation
    // creates the next version from the same submission.
    nowMs = T0 + 5 * DAY;
    const gen2 = await request(app)
      .post("/api/admin/research/blueprints/generate")
      .send({ memberId: MEMBER_A.id });
    expect(gen2.body.version).toBe(2);
    expect(gen2.body.created).toBe(true);

    const publish2 = await request(app)
      .post(`/api/admin/research/blueprints/${gen2.body.blueprintId}/review`)
      .send({ action: "approve_and_publish" });
    expect(publish2.status).toBe(200);

    const v1 = state.blueprints.find((r: any) => r.version === 1)!;
    const v2 = state.blueprints.find((r: any) => r.version === 2)!;
    expect(v1.state).toBe("updated");
    expect(v1.superseded_by_version).toBe(2);
    expect(v2.state).toBe("published");

    const memberView = await request(app).get("/api/research/blueprint");
    expect(memberView.body.state).toBe("published");
    expect(memberView.body.blueprint.version).toBe(2);
    expect(notifications).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Wave 2 adversarial-review regressions. Each of these pins a defect the
// reviewer found in the first implementation pass.
// ---------------------------------------------------------------------------
describe("wave 2 review regressions", () => {
  it("refuses to acknowledge a superseded version and points at the current one", async () => {
    const stale = seedBlueprint({
      state: "updated",
      version: 1,
      published_at: new Date(T0).toISOString(),
      superseded_by_version: 2,
    });
    seedBlueprint({ state: "published", version: 2, published_at: new Date(T0).toISOString() });

    const res = await request(makeApp())
      .post("/api/research/blueprint/acknowledge")
      .send({ blueprintId: stale.id, version: 1 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
    expect(res.body.message).toContain("Reload");
    expect(stale.member_acknowledged_at).toBeNull();
  });

  it("clears the member-visible message when Samuel revises out of more_information_needed", async () => {
    const row = seedBlueprint({
      state: "more_information_needed",
      member_visible_message: "Tell me about your knee.",
    });

    const revised = await request(makeApp())
      .post(`/api/admin/research/blueprints/${row.id}/review`)
      .send({ action: "revise", internalNote: "reworking the fitness assignment" });
    expect(revised.status).toBe(200);
    expect(row.member_visible_message).toBeNull();

    // The member now sees the neutral review placeholder, not the stale ask.
    const view = await request(makeApp()).get("/api/research/blueprint");
    expect(view.status).toBe(200);
    expect(JSON.stringify(view.body)).not.toContain("knee");
  });

  it("demotes every other member-visible version when an older one is republished", async () => {
    const older = seedBlueprint({ state: "samuel_review", version: 1 });
    const newer = seedBlueprint({
      state: "published",
      version: 2,
      published_at: new Date(T0).toISOString(),
    });

    const res = await request(makeApp())
      .post(`/api/admin/research/blueprints/${older.id}/review`)
      .send({ action: "approve_and_publish" });
    expect(res.status).toBe(200);

    // Exactly one published row survives: the one just approved.
    expect(older.state).toBe("published");
    expect(newer.state).toBe("updated");
    expect(newer.superseded_by_version).toBe(1);
  });
});

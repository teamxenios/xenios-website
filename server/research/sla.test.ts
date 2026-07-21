import crypto from "crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// SLA engine + Infinity event boundary tests.
//
// The three things worth proving here:
//   1. The window math. Each of the four kinds goes at-risk in the final 20
//      percent of its own window and breached only past the deadline.
//   2. The claim. A subject emits at_risk once and breached once, ever, across
//      any number of sweeps, including the duplicate-key race where our read
//      missed a row another worker had just inserted. A refused emit is
//      RETRIED, and the retry must not produce a second claim.
//   3. The boundary. Nothing member-identifying crosses it. The payload is
//      built from an allowlist, so a smuggled healthAnswers/email/token field
//      is dropped by construction, and a real sweep over rows full of PII
//      emits opaque references only.
//
// Supabase is an in-memory fake (with the unique constraint modeled, since
// that constraint IS the idempotency); the admin gate and the capability
// registry are mocked so denial and capability state are chosen per test.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  slaEvents: [] as any[],
  members: [] as any[],
  responses: [] as any[],
  blueprints: [] as any[],
  plans: [] as any[],
  questions: [] as any[],
  // Tables that do not exist yet in this deployment. The fake throws for them,
  // exactly like a real client hitting an unknown relation.
  missingTables: new Set<string>(),
  // Simulates losing the claim race: our read saw nothing, then our insert
  // collided with the row another worker had just written.
  claimCollision: false,
}));

const auth = vi.hoisted(() => ({
  current: null as any,
  deny: null as { status: number; code: string } | null,
}));

const admin = vi.hoisted(() => ({ allow: true }));
const caps = vi.hoisted(() => ({ enabled: true }));

vi.mock("../supabase", () => {
  function tableFor(name: string) {
    if (state.missingTables.has(name)) {
      throw new Error(`relation "${name}" does not exist`);
    }
    if (name === "research_sla_events") return state.slaEvents;
    if (name === "research_members") return state.members;
    if (name === "research_assessment_responses") return state.responses;
    if (name === "research_blueprints") return state.blueprints;
    if (name === "research_xenios30_plans") return state.plans;
    if (name === "research_member_questions") return state.questions;
    throw new Error(`unexpected table in test: ${name}`);
  }
  function query(table: string) {
    const list = tableFor(table);
    let mode: "select" | "insert" | "update" | "delete" = "select";
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
        // The unique (kind, subject_id, phase) constraint, modeled: it is the
        // whole idempotency mechanism, so a fake without it would prove nothing.
        if (table === "research_sla_events") {
          const collides = (row: any) =>
            row.kind === insertPayload.kind &&
            row.subject_id === insertPayload.subject_id &&
            row.phase === insertPayload.phase;
          if (state.claimCollision) {
            state.claimCollision = false;
            list.push({ id: crypto.randomUUID(), ...insertPayload });
            return { data: null, error: { message: "duplicate key value violates unique constraint" } };
          }
          if (list.some(collides)) {
            return { data: null, error: { message: "duplicate key value violates unique constraint" } };
          }
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

// The admin gate: per-test allow/deny so a member session can be proven unable
// to reach the Samuel-only sweep trigger.
vi.mock("../routes", () => ({
  requireSupabaseAdmin: (req: any, res: any, next: any) => {
    if (!admin.allow) return res.status(403).json({ ok: false, code: "admin_required" });
    req.adminEmail = "admin@example.com";
    next();
  },
}));

vi.mock("./capabilities", () => ({
  capabilityEnabled: () => caps.enabled,
}));

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import {
  AT_RISK_FRACTION,
  SLA_WINDOW_HOURS,
  registerSlaAdminApi,
  slaPhaseFor,
  slaSummaryForAdmin,
  sweepSlaDeadlines,
} from "./sla";
import { itemIdFor } from "./admin-queues";
import {
  INFINITY_EVENT_FIELDS,
  InfinityProviderNotConfigured,
  MAX_SAFE_SUMMARY_LENGTH,
  SignedHttpInfinityProvider,
  TestInfinityProvider,
  buildInfinityEvent,
  disabledInfinityProvider,
  scrubSafeSummary,
  selectInfinityProvider,
  signInfinityRequest,
  testInfinityProvider,
} from "./infinity-provider";
import { INITIAL_ASSESSMENT_DEFINITION } from "./assessment";
import type { MemberPlatformDeps } from "./member-platform-deps";

const T0 = Date.parse("2026-07-10T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;

let nowMs = T0;

function makeDeps(): MemberPlatformDeps {
  return {
    clock: { now: () => new Date(nowMs) },
    notifier: { notify: vi.fn(async () => true) },
  };
}

let deps: MemberPlatformDeps;
let provider: TestInfinityProvider;

function makeApp() {
  const app = express();
  app.use(express.json());
  registerSlaAdminApi(app, deps);
  return app;
}

// Markers: if any of these ever appear in an emitted payload, the boundary
// leaked. They are seeded into the source rows on purpose.
const EMAIL_MARKER = "ava.leak@example.com";
const HEALTH_MARKER = "XENIOS_HEALTH_ANSWER_NEVER_LEAVES_THIS_SYSTEM";
const TOKEN_MARKER = "XENIOS_TOKEN_NEVER_LEAVES_THIS_SYSTEM";
const QUESTION_MARKER = "XENIOS_QUESTION_BODY_NEVER_LEAVES_THIS_SYSTEM";

const MEMBER_ID = "00000000-0000-4000-8000-0000000s1a01";

function seedMember(overrides: Record<string, any> = {}) {
  const row = {
    id: MEMBER_ID,
    email: EMAIL_MARKER,
    first_name: "Ava",
    status: "active",
    activated_at: new Date(T0).toISOString(),
    ...overrides,
  };
  state.members.push(row);
  return row;
}

function seedBlueprint(overrides: Record<string, any> = {}) {
  const row = {
    id: crypto.randomUUID(),
    member_id: MEMBER_ID,
    version: 1,
    state: "samuel_review",
    content: { primaryGoal: HEALTH_MARKER },
    review_comment: TOKEN_MARKER,
    created_at: new Date(T0).toISOString(),
    updated_at: new Date(T0).toISOString(),
    ...overrides,
  };
  state.blueprints.push(row);
  return row;
}

function seedPlan(overrides: Record<string, any> = {}) {
  const row = {
    id: crypto.randomUUID(),
    member_id: MEMBER_ID,
    month_label: "2026-08",
    version: 1,
    state: "samuel_review",
    content: { note: HEALTH_MARKER },
    created_at: new Date(T0).toISOString(),
    updated_at: new Date(T0).toISOString(),
    ...overrides,
  };
  state.plans.push(row);
  return row;
}

function seedQuestion(overrides: Record<string, any> = {}) {
  const row = {
    id: crypto.randomUUID(),
    member_id: MEMBER_ID,
    category: "plan",
    status: "pending",
    body_text: QUESTION_MARKER,
    created_at: new Date(T0).toISOString(),
    ...overrides,
  };
  state.questions.push(row);
  return row;
}

// Capability flags live in process.env and process.env is SHARED across test
// files in a worker: leaking one breaks another suite. Snapshot, then restore.
const ENV_KEYS = ["INFINITY_EVENT_URL", "INFINITY_EVENT_SECRET", "NODE_ENV"] as const;
const envSnapshot: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) envSnapshot[key] = process.env[key];
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (envSnapshot[key] === undefined) delete process.env[key];
    else process.env[key] = envSnapshot[key] as string;
  }
});

beforeEach(() => {
  state.slaEvents.length = 0;
  state.members.length = 0;
  state.responses.length = 0;
  state.blueprints.length = 0;
  state.plans.length = 0;
  state.questions.length = 0;
  state.missingTables.clear();
  state.claimCollision = false;
  auth.current = null;
  auth.deny = null;
  admin.allow = true;
  caps.enabled = true;
  nowMs = T0;
  provider = new TestInfinityProvider();
  testInfinityProvider.reset();
  deps = makeDeps();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// The window math
// ---------------------------------------------------------------------------

describe("the at-risk rule", () => {
  it("opens the at-risk band in the final 20 percent of the window", () => {
    const start = T0;
    const deadline = T0 + 100 * HOUR;
    expect(AT_RISK_FRACTION).toBe(0.2);
    expect(slaPhaseFor(start, deadline, T0 + 79 * HOUR)).toBeNull();
    // Exactly on the boundary is already at risk.
    expect(slaPhaseFor(start, deadline, T0 + 80 * HOUR)).toBe("at_risk");
    expect(slaPhaseFor(start, deadline, T0 + 99 * HOUR)).toBe("at_risk");
    // Exactly on the deadline is not yet a breach.
    expect(slaPhaseFor(start, deadline, deadline)).toBe("at_risk");
    expect(slaPhaseFor(start, deadline, deadline + 1)).toBe("breached");
  });

  it("scales the band with each kind's own window", () => {
    for (const [kind, hours] of Object.entries(SLA_WINDOW_HOURS)) {
      const deadline = T0 + hours * HOUR;
      const opensAt = T0 + hours * HOUR * (1 - AT_RISK_FRACTION);
      expect(slaPhaseFor(T0, deadline, opensAt - 1)).toBeNull();
      expect(slaPhaseFor(T0, deadline, opensAt)).toBe("at_risk");
      expect(slaPhaseFor(T0, deadline, deadline + 1)).toBe("breached");
      // 72/48/48/12 are the frozen commitments; a silent change here would
      // move every deadline in the product.
      expect([72, 48, 12]).toContain(hours);
      expect(kind).toBeTruthy();
    }
  });

  it("returns null for unusable timestamps rather than guessing a phase", () => {
    expect(slaPhaseFor(Number.NaN, T0, T0)).toBeNull();
    expect(slaPhaseFor(T0, Number.NaN, T0)).toBeNull();
  });
});

describe("assessment deadline (72 hours from activation, while unsubmitted)", () => {
  it("is silent, then at risk, then breached", async () => {
    seedMember();

    nowMs = T0 + 50 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });
    expect(provider.emitted).toHaveLength(0);

    nowMs = T0 + 58 * HOUR; // past 57.6h
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 1, breached: 0 });
    expect(provider.emitted[0].type).toBe("research.review.sla_at_risk");
    expect(provider.emitted[0].priority).toBe("high");
    expect(provider.emitted[0].slaDeadline).toBe(new Date(T0 + 72 * HOUR).toISOString());

    nowMs = T0 + 73 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 1 });
    expect(provider.emitted[1].type).toBe("research.assessment.overdue");
    expect(provider.emitted[1].priority).toBe("critical");
  });

  it("ignores a member who already submitted", async () => {
    seedMember();
    // The exact row shape the assessment module writes, so the sweep's filter
    // is exercised rather than approximated.
    state.responses.push({
      id: crypto.randomUUID(),
      member_id: MEMBER_ID,
      definition_id: INITIAL_ASSESSMENT_DEFINITION.definitionId,
      mode: INITIAL_ASSESSMENT_DEFINITION.mode,
      status: "submitted",
      answers: { sleep: HEALTH_MARKER },
    });
    nowMs = T0 + 80 * HOUR;

    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });
    expect(provider.emitted).toHaveLength(0);
  });

  it("still sweeps a member whose response exists but is unsubmitted", async () => {
    seedMember();
    state.responses.push({
      id: crypto.randomUUID(),
      member_id: MEMBER_ID,
      definition_id: INITIAL_ASSESSMENT_DEFINITION.definitionId,
      mode: INITIAL_ASSESSMENT_DEFINITION.mode,
      status: "in_progress",
      answers: { sleep: HEALTH_MARKER },
    });
    nowMs = T0 + 80 * HOUR;

    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 1 });
    expect(JSON.stringify(provider.emitted)).not.toContain(HEALTH_MARKER);
  });

  it("ignores a member who was never activated", async () => {
    seedMember({ activated_at: null });
    nowMs = T0 + 200 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });
  });
});

describe("blueprint review (48 elapsed hours in samuel_review)", () => {
  it("is silent, then at risk, then breached", async () => {
    const row = seedBlueprint();

    nowMs = T0 + 30 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });

    nowMs = T0 + 40 * HOUR; // past 38.4h
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 1, breached: 0 });
    expect(provider.emitted[0].subjectRef).toBe(row.id);
    // The target must be a link the admin detail route can actually resolve,
    // which means the queue's opaque item id, not the raw row id.
    expect(provider.emitted[0].adminTarget).toBe(
      `/api/admin/research/queues/blueprint_review/items/${itemIdFor("blueprint_review", `blueprint:${row.id}`)}`,
    );

    nowMs = T0 + 49 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 1 });
    expect(provider.emitted[1].type).toBe("research.review.overdue");
  });

  it("ignores a blueprint that is not in samuel_review", async () => {
    seedBlueprint({ state: "published" });
    nowMs = T0 + 200 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });
  });
});

describe("monthly plan review (48 elapsed hours in samuel_review)", () => {
  it("is silent, then at risk, then breached", async () => {
    const row = seedPlan();

    nowMs = T0 + 30 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });

    nowMs = T0 + 40 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 1, breached: 0 });
    expect(provider.emitted[0].adminTarget).toBe(
      `/api/admin/research/queues/monthly_plan_review/items/${itemIdFor("monthly_plan_review", `xenios30:${row.id}`)}`,
    );

    nowMs = T0 + 49 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 1 });
  });
});

describe("question response (about 12 hours from creation)", () => {
  it("is silent, then at risk, then breached", async () => {
    seedQuestion();

    nowMs = T0 + 8 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });

    nowMs = T0 + 10 * HOUR; // past 9.6h
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 1, breached: 0 });
    expect(provider.emitted[0].type).toBe("research.question.response_due");

    nowMs = T0 + 13 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 1 });
    expect(provider.emitted[1].type).toBe("research.question.overdue");
  });

  it("honors the question's own sla_target_at when it carries one", async () => {
    seedQuestion({ sla_target_at: new Date(T0 + 40 * HOUR).toISOString() });
    nowMs = T0 + 13 * HOUR; // past the default 12h target, inside the stated one
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });
    nowMs = T0 + 41 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 1 });
  });

  it("ignores an answered question", async () => {
    seedQuestion({ status: "answer_ready" });
    seedQuestion({ status: "completed" });
    nowMs = T0 + 40 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });
  });
});

// ---------------------------------------------------------------------------
// Idempotency (the unique constraint is the mechanism)
// ---------------------------------------------------------------------------

describe("idempotency", () => {
  it("emits at_risk once and breached once, ever, across repeated sweeps", async () => {
    seedBlueprint();

    nowMs = T0 + 40 * HOUR;
    await sweepSlaDeadlines(deps, provider);
    await sweepSlaDeadlines(deps, provider);
    nowMs = T0 + 41 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });

    nowMs = T0 + 60 * HOUR;
    await sweepSlaDeadlines(deps, provider);
    nowMs = T0 + 90 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });

    // One claim per phase, and exactly two emissions in total.
    expect(state.slaEvents).toHaveLength(2);
    expect(state.slaEvents.map((row) => row.phase).sort()).toEqual(["at_risk", "breached"]);
    expect(state.slaEvents.every((row) => row.delivered === true)).toBe(true);
    expect(provider.emitted).toHaveLength(2);
  });

  it("skips when the claim insert loses the race to another sweep", async () => {
    seedBlueprint();
    nowMs = T0 + 40 * HOUR;
    // Our read saw no ledger row; between the read and the insert, another
    // worker claimed it and our insert hits the unique constraint.
    state.claimCollision = true;

    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });
    // The winner's claim is the only row, and we did NOT emit a duplicate.
    expect(state.slaEvents).toHaveLength(1);
    expect(provider.emitted).toHaveLength(0);
  });

  it("keeps the claim and RETRIES delivery when the provider refuses, without a second claim", async () => {
    seedBlueprint();
    nowMs = T0 + 40 * HOUR;

    provider.refuseWith = "PROVIDER_ERROR";
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });
    expect(state.slaEvents).toHaveLength(1);
    expect(state.slaEvents[0].delivered).toBe(false);
    expect(provider.emitted).toHaveLength(1);

    // A second sweep retries the SAME claim: one more attempt, still one row.
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });
    expect(state.slaEvents).toHaveLength(1);
    expect(state.slaEvents[0].delivered).toBe(false);
    expect(provider.emitted).toHaveLength(2);
    // The retry reuses the claim's id, so the receiver can dedupe on it.
    expect(provider.emitted[1].eventId).toBe(state.slaEvents[0].id);

    // Once Infinity recovers, the retry lands and the row settles.
    provider.refuseWith = null;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 1, breached: 0 });
    expect(state.slaEvents).toHaveLength(1);
    expect(state.slaEvents[0].delivered).toBe(true);
    expect(provider.emitted).toHaveLength(3);

    // And it never fires again.
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });
    expect(provider.emitted).toHaveLength(3);
  });

  it("emits the breach, not a stale at-risk warning, when the sweep runs late", async () => {
    seedBlueprint();
    nowMs = T0 + 200 * HOUR; // the at-risk window came and went unswept

    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 1 });
    expect(state.slaEvents).toHaveLength(1);
    expect(state.slaEvents[0].phase).toBe("breached");
  });
});

// ---------------------------------------------------------------------------
// Capability gating
// ---------------------------------------------------------------------------

describe("capability gating", () => {
  it("selects the disabled provider while infinity_events is off", () => {
    caps.enabled = false;
    expect(selectInfinityProvider()).toBe(disabledInfinityProvider);
    caps.enabled = true;
    expect(selectInfinityProvider()).toBe(testInfinityProvider);
  });

  it("emits nothing, claims nothing, and does not crash with the capability off", async () => {
    caps.enabled = false;
    seedMember();
    seedBlueprint();
    seedPlan();
    seedQuestion();
    nowMs = T0 + 200 * HOUR;

    // Both the resolved-by-capability path and an explicitly injected disabled
    // provider are silent.
    expect(await sweepSlaDeadlines(deps)).toEqual({ atRisk: 0, breached: 0 });
    expect(await sweepSlaDeadlines(deps, disabledInfinityProvider)).toEqual({ atRisk: 0, breached: 0 });
    // No claims banked for a flood on the day the capability turns on.
    expect(state.slaEvents).toHaveLength(0);
  });

  it("refuses in the disabled provider rather than reporting a fake delivery", async () => {
    const result = await disabledInfinityProvider.emit({} as any);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DISABLED");
  });
});

// ---------------------------------------------------------------------------
// The boundary: structural redaction
// ---------------------------------------------------------------------------

describe("buildInfinityEvent", () => {
  it("DROPS smuggled fields: health answers, emails, tokens, media references", () => {
    const event = buildInfinityEvent({
      eventId: "evt-1",
      type: "research.review.overdue",
      priority: "critical",
      subjectRef: "opaque-ref",
      safeSummary: "A Blueprint review has been waiting past its 48 hour review window.",
      slaDeadline: new Date(T0).toISOString(),
      adminTarget: "/api/admin/research/queues/blueprint_review/items/opaque-ref",
      emittedAt: new Date(T0).toISOString(),
      // Everything below is smuggled, and none of it may survive.
      healthAnswers: { sleep: HEALTH_MARKER },
      email: EMAIL_MARKER,
      memberEmail: EMAIL_MARKER,
      firstName: "Ava",
      token: TOKEN_MARKER,
      sessionToken: TOKEN_MARKER,
      mediaId: "media-123",
      transcriptText: HEALTH_MARKER,
      questionBody: QUESTION_MARKER,
    });

    expect(Object.keys(event).sort()).toEqual([...INFINITY_EVENT_FIELDS].sort());
    const serialized = JSON.stringify(event);
    for (const marker of [HEALTH_MARKER, EMAIL_MARKER, TOKEN_MARKER, QUESTION_MARKER, "media-123", "Ava"]) {
      expect(serialized).not.toContain(marker);
    }
  });

  it("scrubs an address-shaped token out of the one free-text field", () => {
    const event = buildInfinityEvent({
      eventId: "evt-2",
      type: "research.question.overdue",
      priority: "high",
      subjectRef: "opaque-ref",
      safeSummary: `A question from ${EMAIL_MARKER} is past its target.`,
      slaDeadline: null,
      adminTarget: "/api/admin/research/queues/questions/items/opaque-ref",
      emittedAt: new Date(T0).toISOString(),
    });
    expect(event.safeSummary).not.toContain(EMAIL_MARKER);
    expect(event.safeSummary).toContain("[redacted]");
  });

  it("caps the summary so a paragraph of member words cannot ride along", () => {
    const long = scrubSafeSummary("x".repeat(MAX_SAFE_SUMMARY_LENGTH + 500));
    expect(long.length).toBe(MAX_SAFE_SUMMARY_LENGTH);
  });
});

describe("the emitted payload over a real sweep", () => {
  it("carries opaque references only: never an email, a name, or health text", async () => {
    seedMember();
    seedBlueprint();
    seedPlan();
    seedQuestion();
    nowMs = T0 + 200 * HOUR;

    const swept = await sweepSlaDeadlines(deps, provider);
    expect(swept).toEqual({ atRisk: 0, breached: 4 });

    const serialized = JSON.stringify(provider.emitted);
    for (const marker of [EMAIL_MARKER, HEALTH_MARKER, TOKEN_MARKER, QUESTION_MARKER, "Ava"]) {
      expect(serialized).not.toContain(marker);
    }
    for (const event of provider.emitted) {
      expect(Object.keys(event).sort()).toEqual([...INFINITY_EVENT_FIELDS].sort());
      expect(event.subjectRef).toMatch(/^[0-9a-zA-Z-]+$/);
      expect(event.subjectRef).not.toContain("@");
    }
    // The assessment event's subject is the member's opaque id, nothing more.
    const assessment = provider.emitted.find((e) => e.type === "research.assessment.overdue");
    expect(assessment?.subjectRef).toBe(MEMBER_ID);
  });
});

// ---------------------------------------------------------------------------
// The signed HTTP shell
// ---------------------------------------------------------------------------

describe("SignedHttpInfinityProvider", () => {
  it("throws NotConfigured without an endpoint and a secret", async () => {
    delete process.env.INFINITY_EVENT_URL;
    delete process.env.INFINITY_EVENT_SECRET;
    const shell = new SignedHttpInfinityProvider();
    await expect(shell.emit({ eventId: "e" } as any)).rejects.toBeInstanceOf(InfinityProviderNotConfigured);
  });

  it("is inert once configured: a truthful transport error, never a fake delivery", async () => {
    process.env.INFINITY_EVENT_URL = "https://infinity.invalid/events";
    process.env.INFINITY_EVENT_SECRET = "not-a-real-secret";
    const shell = new SignedHttpInfinityProvider();
    const result = await shell.emit({
      eventId: "e",
      type: "research.review.overdue",
      priority: "critical",
      subjectRef: "opaque",
      safeSummary: "s",
      slaDeadline: null,
      adminTarget: "t",
      emittedAt: new Date(T0).toISOString(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
    delete process.env.INFINITY_EVENT_URL;
    delete process.env.INFINITY_EVENT_SECRET;
  });

  it("signs the timestamp together with the body, so a capture cannot be replayed", () => {
    const body = JSON.stringify({ eventId: "e" });
    const a = signInfinityRequest(body, "secret", new Date(T0));
    const b = signInfinityRequest(body, "secret", new Date(T0));
    const later = signInfinityRequest(body, "secret", new Date(T0 + 60_000));
    const otherSecret = signInfinityRequest(body, "other", new Date(T0));

    expect(a).toEqual(b); // deterministic for the same clock
    expect(a.signature.startsWith("sha256=")).toBe(true);
    // A different timestamp changes the signature, so the captured pair cannot
    // be reused under a fresh timestamp without the secret.
    expect(later.signature).not.toBe(a.signature);
    expect(otherSecret.signature).not.toBe(a.signature);
    // The secret itself never appears in what is sent.
    expect(a.signature).not.toContain("secret");
  });
});

// ---------------------------------------------------------------------------
// Defensive reads
// ---------------------------------------------------------------------------

describe("defensive source reads", () => {
  it("contributes zero for a table that does not exist yet instead of failing the sweep", async () => {
    // The questions wave has not shipped its table; the other three kinds keep
    // sweeping.
    state.missingTables.add("research_member_questions");
    seedBlueprint();
    nowMs = T0 + 200 * HOUR;

    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 1 });
  });

  it("returns zeros rather than throwing when every source table is missing", async () => {
    for (const table of [
      "research_members",
      "research_assessment_responses",
      "research_blueprints",
      "research_xenios30_plans",
      "research_member_questions",
    ]) {
      state.missingTables.add(table);
    }
    nowMs = T0 + 200 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });
    const summary = await slaSummaryForAdmin(deps);
    expect(summary.totals).toEqual({ atRisk: 0, breached: 0 });
  });

  it("survives a missing ledger table by claiming nothing", async () => {
    state.missingTables.add("research_sla_events");
    seedBlueprint();
    nowMs = T0 + 200 * HOUR;
    expect(await sweepSlaDeadlines(deps, provider)).toEqual({ atRisk: 0, breached: 0 });
    expect(provider.emitted).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The admin summary + the manual trigger
// ---------------------------------------------------------------------------

describe("slaSummaryForAdmin", () => {
  it("counts the live at-risk and breached work per kind without emitting", async () => {
    seedMember();
    seedBlueprint();
    seedPlan({ updated_at: new Date(T0 + 160 * HOUR).toISOString() });
    seedQuestion();
    nowMs = T0 + 200 * HOUR;

    const summary = await slaSummaryForAdmin(deps);
    expect(summary.kinds.assessment_deadline).toEqual({ atRisk: 0, breached: 1 });
    expect(summary.kinds.blueprint_review).toEqual({ atRisk: 0, breached: 1 });
    expect(summary.kinds.monthly_plan_review).toEqual({ atRisk: 1, breached: 0 });
    expect(summary.kinds.question_response).toEqual({ atRisk: 0, breached: 1 });
    expect(summary.totals).toEqual({ atRisk: 1, breached: 3 });
    expect(summary.generatedAt).toBe(new Date(nowMs).toISOString());
    // Read-only: nothing was claimed by asking.
    expect(state.slaEvents).toHaveLength(0);
  });

  it("reports claims Infinity has refused so far", async () => {
    seedBlueprint();
    nowMs = T0 + 200 * HOUR;
    provider.refuseWith = "PROVIDER_ERROR";
    await sweepSlaDeadlines(deps, provider);
    const summary = await slaSummaryForAdmin(deps);
    expect(summary.undeliveredEvents).toBe(1);
  });
});

describe("POST /api/admin/research/sla/sweep", () => {
  it("is Samuel-only", async () => {
    admin.allow = false;
    seedBlueprint();
    nowMs = T0 + 200 * HOUR;

    const res = await request(makeApp()).post("/api/admin/research/sla/sweep").send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("admin_required");
    expect(state.slaEvents).toHaveLength(0);
  });

  it("runs a sweep on demand and returns the counts", async () => {
    seedBlueprint();
    nowMs = T0 + 200 * HOUR;

    const res = await request(makeApp()).post("/api/admin/research/sla/sweep").send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.swept).toEqual({ atRisk: 0, breached: 1 });
    expect(res.body.summary.totals).toEqual({ atRisk: 0, breached: 1 });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    // The default provider resolves through the capability registry, so the
    // shared test provider is what received it.
    expect(testInfinityProvider.emitted).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(HEALTH_MARKER);
  });

  it("returns zeros with the capability off rather than a 500", async () => {
    caps.enabled = false;
    seedBlueprint();
    nowMs = T0 + 200 * HOUR;

    const res = await request(makeApp()).post("/api/admin/research/sla/sweep").send({});
    expect(res.status).toBe(200);
    expect(res.body.swept).toEqual({ atRisk: 0, breached: 0 });
    expect(state.slaEvents).toHaveLength(0);
  });
});

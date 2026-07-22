import crypto from "crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROFILE_SECTION_KEYS,
  SENSITIVE_PROFILE_SECTIONS,
} from "@shared/research/member-platform";

// ---------------------------------------------------------------------------
// Member profile tests: per-member isolation, the sensitive split, strict
// section validation, schema-version conflicts, upsert-in-place, completeness
// math, and guard denials. Supabase is replaced with an in-memory fake;
// member-auth is mocked so tests choose exactly which member (or denial) the
// guard produces.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  profiles: [] as any[],
}));

const auth = vi.hoisted(() => ({
  member: null as any,
  denyCode: null as string | null,
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list = table === "research_member_profile_sections" ? state.profiles : ([] as any[]);
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    let inFilter: [string, any[]] | null = null;
    let isNullCol: string | null = null;
    let limitN: number | null = null;

    const matches = (r: any) =>
      filters.every(([c, v]) => r[c] === v) &&
      (!inFilter || inFilter[1].includes(r[inFilter[0]])) &&
      (isNullCol == null || r[isNullCol] == null);

    const finish = () => {
      if (mode === "insert") {
        const rows = Array.isArray(insertPayload) ? insertPayload : [insertPayload];
        for (const payload of rows) {
          if (
            list.some(
              (r: any) => r.member_id === payload.member_id && r.section_key === payload.section_key,
            )
          ) {
            return { data: null, error: { message: "duplicate key value violates unique constraint" } };
          }
        }
        const created = rows.map((payload: any) => ({
          id: crypto.randomUUID(),
          updated_at: new Date().toISOString(),
          ...payload,
        }));
        list.push(...created);
        return { data: created, error: null };
      }
      if (mode === "update") {
        const targets = list.filter(matches);
        if (!targets.length) return { data: null, error: null };
        Object.assign(targets[0], updatePayload);
        return { data: [targets[0]], error: null };
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

// The guard is mocked so tests pick the member the request runs as, or make
// the guard deny with the REAL denial codes (pending/cancelled members never
// reach the handler in production; the mock mirrors that contract).
vi.mock("./member-auth", () => ({
  requireActiveMember: (req: any, res: any, next: any) => {
    if (auth.denyCode) return res.status(403).json({ ok: false, code: auth.denyCode });
    req.researchMember = auth.member;
    next();
  },
  requireMember: (req: any, res: any, next: any) => {
    req.researchMember = auth.member;
    next();
  },
}));

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import { registerProfileApi } from "./profile";

const NOW = new Date("2026-07-20T12:00:00.000Z");
const deps = {
  clock: { now: () => NOW },
  notifier: { notify: vi.fn(async () => true) },
};

function makeApp() {
  const app = express();
  app.use(express.json());
  registerProfileApi(app, deps);
  return app;
}

function makeMember(id: string) {
  return {
    id,
    application_id: `app-${id}`,
    auth_user_id: `auth-${id}`,
    email: `${id}@example.com`,
    first_name: "Test",
    status: "active",
    created_at: "2026-07-01T00:00:00.000Z",
  };
}

const MEMBER_A = makeMember("mem-a");
const MEMBER_B = makeMember("mem-b");

function seedSection(memberId: string, sectionKey: string, data: Record<string, unknown>) {
  const row = {
    id: crypto.randomUUID(),
    member_id: memberId,
    section_key: sectionKey,
    schema_version: 1,
    data,
    updated_at: "2026-07-01T00:00:00.000Z",
  };
  state.profiles.push(row);
  return row;
}

beforeEach(() => {
  state.profiles.length = 0;
  auth.member = MEMBER_A;
  auth.denyCode = null;
  vi.clearAllMocks();
});

describe("member isolation", () => {
  it("returns only the signed-in member's sections, never another member's", async () => {
    seedSection(MEMBER_A.id, "goals", { primaryGoal: "member-a-goal" });
    seedSection(MEMBER_B.id, "goals", { primaryGoal: "member-b-goal-marker" });
    const res = await request(makeApp()).get("/api/research/profile");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.profile.memberId).toBe(MEMBER_A.id);
    expect(res.body.profile.sections).toHaveLength(1);
    expect(res.body.profile.sections[0].data.primaryGoal).toBe("member-a-goal");
    expect(JSON.stringify(res.body)).not.toContain("member-b-goal-marker");
  });

  it("the sensitive endpoint is member-scoped too", async () => {
    seedSection(MEMBER_A.id, "sleep", { averageHoursPerNight: 7 });
    seedSection(MEMBER_B.id, "basic_safety_context", { notes: "b-sensitive-marker" });
    const res = await request(makeApp()).get("/api/research/profile/sensitive");
    expect(res.status).toBe(200);
    expect(res.body.sections).toHaveLength(1);
    expect(res.body.sections[0].key).toBe("sleep");
    expect(JSON.stringify(res.body)).not.toContain("b-sensitive-marker");
  });

  it("a write lands on the signed-in member's row, never another member's", async () => {
    const bRow = seedSection(MEMBER_B.id, "goals", { primaryGoal: "b-original" });
    const res = await request(makeApp())
      .put("/api/research/profile")
      .send({ section: "goals", schemaVersion: 1, data: { primaryGoal: "a-new-goal" } });
    expect(res.status).toBe(200);
    expect(bRow.data.primaryGoal).toBe("b-original");
    const aRows = state.profiles.filter((r) => r.member_id === MEMBER_A.id);
    expect(aRows).toHaveLength(1);
    expect(aRows[0].data.primaryGoal).toBe("a-new-goal");
  });

  it("the strict envelope rejects an attempt to name a member in the body", async () => {
    const res = await request(makeApp())
      .put("/api/research/profile")
      .send({ section: "goals", schemaVersion: 1, data: { primaryGoal: "x" }, memberId: MEMBER_B.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.memberId).toBeDefined();
  });
});

describe("sensitive split", () => {
  it("sensitive sections never appear in the ordinary profile view", async () => {
    seedSection(MEMBER_A.id, "goals", { primaryGoal: "visible-goal" });
    seedSection(MEMBER_A.id, "basic_safety_context", { notes: "sensitive-notes-marker" });
    seedSection(MEMBER_A.id, "allergies_and_restrictions", { allergies: ["peanut-marker"] });
    const res = await request(makeApp()).get("/api/research/profile");
    expect(res.status).toBe(200);
    const keys = res.body.profile.sections.map((s: any) => s.key);
    for (const sensitiveKey of SENSITIVE_PROFILE_SECTIONS) {
      expect(keys).not.toContain(sensitiveKey);
    }
    expect(JSON.stringify(res.body)).not.toContain("sensitive-notes-marker");
    expect(JSON.stringify(res.body)).not.toContain("peanut-marker");
    // Completed sensitive sections still COUNT toward completeness.
    expect(res.body.profile.completeness).toEqual({ completedSections: 3, totalSections: 17 });
  });

  it("the sensitive endpoint serves only the sensitive set", async () => {
    seedSection(MEMBER_A.id, "goals", { primaryGoal: "visible-goal-marker" });
    seedSection(MEMBER_A.id, "basic_safety_context", { notes: "sensitive-notes-marker" });
    const res = await request(makeApp()).get("/api/research/profile/sensitive");
    expect(res.status).toBe(200);
    const keys = res.body.sections.map((s: any) => s.key);
    expect(keys).toEqual(["basic_safety_context"]);
    for (const key of keys) {
      expect(SENSITIVE_PROFILE_SECTIONS).toContain(key);
    }
    expect(JSON.stringify(res.body)).not.toContain("visible-goal-marker");
  });

  it("caching and referrer headers are set on member responses", async () => {
    const res = await request(makeApp()).get("/api/research/profile");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });
});

describe("validation", () => {
  it("an unknown section key is validation_failed", async () => {
    const res = await request(makeApp())
      .put("/api/research/profile")
      .send({ section: "medical_history", schemaVersion: 1, data: {} });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.section).toBeDefined();
    expect(state.profiles).toHaveLength(0);
  });

  it("unknown fields inside a section are rejected by the strict schema", async () => {
    const res = await request(makeApp())
      .put("/api/research/profile")
      .send({
        section: "goals",
        schemaVersion: 1,
        data: { primaryGoal: "real goal", injectedField: "nope" },
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.injectedField).toBeDefined();
    expect(state.profiles).toHaveLength(0);
  });

  it("bounds are enforced: safety-context notes over 500 chars fail", async () => {
    const res = await request(makeApp())
      .put("/api/research/profile")
      .send({
        section: "basic_safety_context",
        schemaVersion: 1,
        data: { notes: "x".repeat(501) },
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.notes).toBeDefined();
  });

  it("media_settings requires an explicit retention election (no silent default)", async () => {
    const res = await request(makeApp())
      .put("/api/research/profile")
      .send({ section: "media_settings", schemaVersion: 1, data: {} });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.fieldErrors.defaultRetentionElection).toBeDefined();
  });

  it("validation failures still carry the no-store headers", async () => {
    const res = await request(makeApp())
      .put("/api/research/profile")
      .send({ section: "nope", schemaVersion: 1, data: {} });
    expect(res.status).toBe(400);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });
});

describe("schema version conflict", () => {
  it("a stale schemaVersion returns state_conflict with the current version in the message", async () => {
    const res = await request(makeApp())
      .put("/api/research/profile")
      .send({ section: "goals", schemaVersion: 2, data: { primaryGoal: "x" } });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
    expect(res.body.message).toContain("version 1");
    expect(state.profiles).toHaveLength(0);
  });
});

describe("upsert", () => {
  it("creates then updates in place: one row per member and section", async () => {
    auth.member = makeMember("mem-upsert");
    const app = makeApp();
    const first = await request(app)
      .put("/api/research/profile")
      .send({ section: "goals", schemaVersion: 1, data: { primaryGoal: "first goal" } });
    expect(first.status).toBe(200);
    expect(first.body.section.key).toBe("goals");
    expect(first.body.section.schemaVersion).toBe(1);
    expect(first.body.section.updatedAt).toBe(NOW.toISOString());

    const second = await request(app)
      .put("/api/research/profile")
      .send({
        section: "goals",
        schemaVersion: 1,
        data: { primaryGoal: "second goal", secondaryGoals: ["mobility"] },
      });
    expect(second.status).toBe(200);
    expect(second.body.section.data.primaryGoal).toBe("second goal");
    expect(second.body.section.data.secondaryGoals).toEqual(["mobility"]);

    const rows = state.profiles.filter(
      (r) => r.member_id === "mem-upsert" && r.section_key === "goals",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].data.primaryGoal).toBe("second goal");
    expect(rows[0].updated_at).toBe(NOW.toISOString());
  });

  it("schema defaults are applied to the stored payload", async () => {
    auth.member = makeMember("mem-defaults");
    const res = await request(makeApp())
      .put("/api/research/profile")
      .send({ section: "privacy_choices", schemaVersion: 1, data: {} });
    expect(res.status).toBe(200);
    // Opt-in areas default OFF.
    expect(res.body.section.data.sexualWellnessEnabled).toBe(false);
    const row = state.profiles.find((r) => r.member_id === "mem-defaults");
    expect(row.data.sexualWellnessEnabled).toBe(false);
  });
});

describe("completeness", () => {
  it("counts every completed section against the 17 total", async () => {
    auth.member = makeMember("mem-complete");
    const app = makeApp();
    await request(app)
      .put("/api/research/profile")
      .send({ section: "goals", schemaVersion: 1, data: { primaryGoal: "goal" } });
    await request(app)
      .put("/api/research/profile")
      .send({ section: "budget", schemaVersion: 1, data: { monthlyBudgetRange: "100_250" } });
    seedSection("mem-complete", "sleep", { averageHoursPerNight: 8 });

    const res = await request(app).get("/api/research/profile");
    expect(res.status).toBe(200);
    expect(res.body.profile.completeness).toEqual({
      completedSections: 3,
      totalSections: PROFILE_SECTION_KEYS.length,
    });
    // The section LIST still excludes the sensitive sleep row.
    expect(res.body.profile.sections.map((s: any) => s.key).sort()).toEqual(["budget", "goals"]);
  });

  it("an empty profile is 0 of 17", async () => {
    auth.member = makeMember("mem-empty");
    const res = await request(makeApp()).get("/api/research/profile");
    expect(res.status).toBe(200);
    expect(res.body.profile.sections).toEqual([]);
    expect(res.body.profile.completeness).toEqual({ completedSections: 0, totalSections: 17 });
  });
});

describe("guard denials", () => {
  it("a pending member is denied with activation_required", async () => {
    auth.denyCode = "activation_required";
    const app = makeApp();
    const read = await request(app).get("/api/research/profile");
    expect(read.status).toBe(403);
    expect(read.body).toEqual({ ok: false, code: "activation_required" });
    const write = await request(app)
      .put("/api/research/profile")
      .send({ section: "goals", schemaVersion: 1, data: { primaryGoal: "x" } });
    expect(write.status).toBe(403);
    expect(write.body.code).toBe("activation_required");
    expect(state.profiles).toHaveLength(0);
  });

  it("a cancelled member is denied with membership_inactive, including the sensitive endpoint", async () => {
    auth.denyCode = "membership_inactive";
    const app = makeApp();
    const sensitive = await request(app).get("/api/research/profile/sensitive");
    expect(sensitive.status).toBe(403);
    expect(sensitive.body).toEqual({ ok: false, code: "membership_inactive" });
  });
});

describe("rate limiting", () => {
  it("the 31st profile write inside a minute is rate_limited", async () => {
    auth.member = makeMember("mem-rate-limit");
    const app = makeApp();
    for (let i = 0; i < 30; i++) {
      const res = await request(app)
        .put("/api/research/profile")
        .send({ section: "goals", schemaVersion: 1, data: { primaryGoal: `goal ${i}` } });
      expect(res.status).toBe(200);
    }
    const blocked = await request(app)
      .put("/api/research/profile")
      .send({ section: "goals", schemaVersion: 1, data: { primaryGoal: "one too many" } });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("rate_limited");
  });
});

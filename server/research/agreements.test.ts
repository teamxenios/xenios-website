import crypto from "crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Agreements engine tests. Supabase is replaced with an in-memory fake that
// RECORDS every update call so the append-only contract is provable; the
// member guard is mocked so member A vs member B isolation and the
// closed-membership denial are exercised with the real route code.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  acceptances: [] as any[],
  updates: [] as Array<{ table: string; payload: any }>,
  other: [] as any[],
}));

const auth = vi.hoisted(() => ({
  currentMember: null as any,
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list = table === "research_agreement_acceptances" ? state.acceptances : state.other;
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    const isFilters: Array<[string, any]> = [];
    let orderBy: { column: string; ascending: boolean } | null = null;
    let limitN: number | null = null;

    const applyFilters = (rows: any[]) =>
      rows.filter(
        (r) =>
          filters.every(([c, v]) => r[c] === v) &&
          isFilters.every(([c, v]) => r[c] === v),
      );
    const finish = () => {
      if (mode === "insert") {
        const payloads = Array.isArray(insertPayload) ? insertPayload : [insertPayload];
        const rows = payloads.map((p: any) => ({
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...p,
        }));
        list.push(...rows);
        return { data: rows, error: null };
      }
      if (mode === "update") {
        // Append-only contract: the suite asserts this stays empty.
        state.updates.push({ table, payload: updatePayload });
        const targets = applyFilters(list);
        targets.forEach((t) => Object.assign(t, updatePayload));
        return { data: targets, error: null };
      }
      let rows = applyFilters(list).slice();
      if (orderBy) {
        const { column, ascending } = orderBy;
        rows.sort((a, b) => {
          if (a[column] === b[column]) return 0;
          const cmp = a[column] < b[column] ? -1 : 1;
          return ascending ? cmp : -cmp;
        });
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows, error: null };
    };

    const api: any = {
      select: () => api,
      insert: (p: any) => { mode = "insert"; insertPayload = p; return api; },
      update: (p: any) => { mode = "update"; updatePayload = p; return api; },
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      is: (c: string, v: any) => { isFilters.push([c, v]); return api; },
      in: (c: string, vs: any[]) => { filters.push([c, vs[0]]); return api; },
      order: (c: string, opts?: { ascending?: boolean }) => { orderBy = { column: c, ascending: opts?.ascending !== false }; return api; },
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
    getSupabaseAdmin: () => ({ from: query, rpc: async () => ({ data: true, error: null }) }),
    getSupabaseAnon: () => { throw new Error("not used in tests"); },
  };
});

// The real guard verifies the JWT; here the session outcome is chosen per
// test. The mock mirrors the real requireMember denials (401 signed out,
// 403 closed) so denial paths use the real shapes.
vi.mock("./member-auth", () => ({
  requireMember: (req: any, res: any, next: any) => {
    const member = auth.currentMember;
    if (!member) return res.status(401).json({ ok: false, message: "Sign in required." });
    if (member.status === "closed") {
      return res.status(403).json({ ok: false, message: "No research membership for this account." });
    }
    req.researchMember = member;
    next();
  },
  requireActiveMember: (_req: any, res: any, _next: any) =>
    res.status(403).json({ ok: false, code: "activation_required" }),
}));

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import { AGREEMENT_DEFINITIONS, agreementContentHash, registerAgreementsApi } from "./agreements";

const FIXED_NOW = "2026-07-20T12:00:00.000Z";
let clockNow = FIXED_NOW;
const notify = vi.fn(async () => true);

function makeApp() {
  const app = express();
  app.use(express.json());
  registerAgreementsApi(app, {
    clock: { now: () => new Date(clockNow) },
    notifier: { notify },
  });
  return app;
}

const MEMBER_A = {
  id: "11111111-1111-4111-8111-111111111111",
  application_id: "app-a",
  auth_user_id: "auth-a",
  email: "a@example.com",
  first_name: "Avery",
  status: "pending_activation",
  created_at: FIXED_NOW,
};
const MEMBER_B = {
  id: "22222222-2222-4222-8222-222222222222",
  application_id: "app-b",
  auth_user_id: "auth-b",
  email: "b@example.com",
  first_name: "Blair",
  status: "pending_activation",
  created_at: FIXED_NOW,
};

const CURRENT = "0.1.0-draft";
const BUNDLE_KEYS = ["XR-MEM-001", "XR-MEM-002", "XR-MEM-004", "XR-MEM-005", "XR-MEM-006", "XR-MEM-026", "XR-PUB-007"];

function bundleDecisions(decision: "accepted" | "declined" = "accepted") {
  return BUNDLE_KEYS.map((key) => ({ key, version: CURRENT, decision }));
}

function seedAcceptance(overrides: Record<string, unknown> = {}) {
  const row = {
    id: crypto.randomUUID(),
    subject_type: "member",
    subject_id: MEMBER_A.id,
    agreement_key: "XR-MEM-001",
    agreement_version: CURRENT,
    content_hash: agreementContentHash(String(overrides.agreement_key ?? "XR-MEM-001"), String(overrides.agreement_version ?? CURRENT)),
    decision: "accepted",
    ip_hash: null,
    user_agent_hash: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
  state.acceptances.push(row);
  return row;
}

beforeEach(() => {
  state.acceptances.length = 0;
  state.updates.length = 0;
  state.other.length = 0;
  auth.currentMember = MEMBER_A;
  clockNow = FIXED_NOW;
  vi.clearAllMocks();
});

afterEach(() => {
  // Append-only, provable: no code path ever issued an update against the
  // acceptances table (or any table) in this suite.
  expect(state.updates).toHaveLength(0);
});

describe("listing definitions", () => {
  it("shows all nine register entries with honest draft status and current versions", async () => {
    const res = await request(makeApp()).get("/api/research/agreements");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.agreements).toHaveLength(9);
    const keys = res.body.agreements.map((a: any) => a.key);
    expect(keys).toEqual([
      "XR-MEM-001", "XR-MEM-002", "XR-MEM-003", "XR-MEM-004",
      "XR-MEM-005", "XR-MEM-006", "XR-MEM-026", "XR-PUB-007", "XR-MEM-012",
    ]);
    for (const agreement of res.body.agreements) {
      expect(agreement.status).toBe("draft");
      expect(agreement.version).toBe(CURRENT);
      expect(agreement.required).toBe(true);
      expect(agreement.trigger).toBe(agreement.key === "XR-MEM-012" ? "assessment" : "activation");
      expect(agreement.acceptedVersion).toBeNull();
      expect(agreement.reacceptanceNeeded).toBe(false);
    }
    const recurring = res.body.agreements.find((a: any) => a.key === "XR-MEM-003");
    expect(recurring.separateConsent).toBe(true);
    // Both billing (XR-MEM-003) and health consent (XR-MEM-012) stand alone.
    expect(res.body.agreements.filter((a: any) => a.separateConsent)).toHaveLength(2);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("definitions carry deterministic content hashes over key@version", () => {
    for (const definition of AGREEMENT_DEFINITIONS) {
      const expected = crypto.createHash("sha256").update(`${definition.key}@${definition.version}`).digest("hex");
      expect(definition.contentHash).toBe(expected);
      expect(definition.effectiveDate).toBeNull();
      expect(definition.supersedes).toBeNull();
    }
  });

  it("is refused signed out and for a closed membership", async () => {
    auth.currentMember = null;
    expect((await request(makeApp()).get("/api/research/agreements")).status).toBe(401);
    auth.currentMember = { ...MEMBER_A, status: "closed" };
    expect((await request(makeApp()).get("/api/research/agreements")).status).toBe(403);
  });
});

describe("accepting the activation bundle", () => {
  it("records the bundle excluding XR-MEM-003 and returns the updated state", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/research/agreements")
      .set("User-Agent", "vitest-agent")
      .set("X-Forwarded-For", "203.0.113.9")
      .send({ decisions: bundleDecisions() });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // One appended row per decision, scoped to member A, hashes only.
    const rows = state.acceptances;
    expect(rows).toHaveLength(BUNDLE_KEYS.length);
    for (const row of rows) {
      expect(row.subject_type).toBe("member");
      expect(row.subject_id).toBe(MEMBER_A.id);
      expect(row.decision).toBe("accepted");
      expect(row.agreement_version).toBe(CURRENT);
      expect(row.content_hash).toBe(agreementContentHash(row.agreement_key, CURRENT));
      // The clock seam, not the wall clock, stamped the row.
      expect(row.created_at).toBe(FIXED_NOW);
      // Privacy: sha256 hex only, never the raw IP or user agent.
      expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.ip_hash).not.toContain("203.0.113.9");
      expect(row.user_agent_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.user_agent_hash).not.toContain("vitest-agent");
    }

    // The response reflects the new state; the separate-consent keys
    // (XR-MEM-003 billing, XR-MEM-012 health) stay unaccepted.
    for (const agreement of res.body.agreements) {
      if (agreement.key === "XR-MEM-003" || agreement.key === "XR-MEM-012") {
        expect(agreement.acceptedVersion).toBeNull();
      } else {
        expect(agreement.acceptedVersion).toBe(CURRENT);
      }
      expect(agreement.reacceptanceNeeded).toBe(false);
    }
  });

  it("rejects XR-MEM-003 bundled with any other key and writes nothing", async () => {
    const res = await request(makeApp())
      .post("/api/research/agreements")
      .send({
        decisions: [
          { key: "XR-MEM-001", version: CURRENT, decision: "accepted" },
          { key: "XR-MEM-003", version: CURRENT, decision: "accepted" },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(JSON.stringify(res.body.fieldErrors)).toContain("XR-MEM-003");
    expect(state.acceptances).toHaveLength(0);
  });

  it("accepts XR-MEM-003 alone at its own step", async () => {
    const res = await request(makeApp())
      .post("/api/research/agreements")
      .send({ decisions: [{ key: "XR-MEM-003", version: CURRENT, decision: "accepted" }] });
    expect(res.status).toBe(200);
    expect(state.acceptances).toHaveLength(1);
    expect(state.acceptances[0].agreement_key).toBe("XR-MEM-003");
    const recurring = res.body.agreements.find((a: any) => a.key === "XR-MEM-003");
    expect(recurring.acceptedVersion).toBe(CURRENT);
  });

  it("rejects a stale definition version with state_conflict and writes nothing", async () => {
    const res = await request(makeApp())
      .post("/api/research/agreements")
      .send({ decisions: [{ key: "XR-MEM-001", version: "0.0.9-draft", decision: "accepted" }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("state_conflict");
    expect(res.body.message).toContain(CURRENT);
    expect(state.acceptances).toHaveLength(0);
  });

  it("rejects unknown keys, malformed bodies, and duplicate keys as validation_failed", async () => {
    const app = makeApp();
    const unknown = await request(app)
      .post("/api/research/agreements")
      .send({ decisions: [{ key: "XR-MEM-999", version: CURRENT, decision: "accepted" }] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("validation_failed");

    const empty = await request(app).post("/api/research/agreements").send({ decisions: [] });
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe("validation_failed");

    const duplicate = await request(app)
      .post("/api/research/agreements")
      .send({
        decisions: [
          { key: "XR-MEM-001", version: CURRENT, decision: "accepted" },
          { key: "XR-MEM-001", version: CURRENT, decision: "declined" },
        ],
      });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.code).toBe("validation_failed");
    expect(state.acceptances).toHaveLength(0);
  });
});

describe("reacceptance", () => {
  it("flips reacceptanceNeeded when the accepted version differs from the required version", async () => {
    seedAcceptance({ agreement_key: "XR-MEM-005", agreement_version: "0.0.1-draft" });
    const app = makeApp();

    const before = await request(app).get("/api/research/agreements");
    const covenant = before.body.agreements.find((a: any) => a.key === "XR-MEM-005");
    expect(covenant.acceptedVersion).toBe("0.0.1-draft");
    expect(covenant.reacceptanceNeeded).toBe(true);

    const res = await request(app)
      .post("/api/research/agreements")
      .send({ decisions: [{ key: "XR-MEM-005", version: CURRENT, decision: "accepted" }] });
    expect(res.status).toBe(200);
    const after = res.body.agreements.find((a: any) => a.key === "XR-MEM-005");
    expect(after.acceptedVersion).toBe(CURRENT);
    expect(after.reacceptanceNeeded).toBe(false);
    // Append-only: the old-version row is still there, superseded not erased.
    expect(state.acceptances.filter((r) => r.agreement_key === "XR-MEM-005")).toHaveLength(2);
  });
});

describe("declines", () => {
  it("records a decline and does not count it as accepted", async () => {
    const res = await request(makeApp())
      .post("/api/research/agreements")
      .send({ decisions: [{ key: "XR-MEM-006", version: CURRENT, decision: "declined" }] });
    expect(res.status).toBe(200);
    expect(state.acceptances).toHaveLength(1);
    expect(state.acceptances[0].decision).toBe("declined");
    const confidentiality = res.body.agreements.find((a: any) => a.key === "XR-MEM-006");
    expect(confidentiality.acceptedVersion).toBeNull();
    expect(confidentiality.reacceptanceNeeded).toBe(false);
  });

  it("a later decline supersedes an earlier acceptance (latest row wins)", async () => {
    const app = makeApp();
    await request(app)
      .post("/api/research/agreements")
      .send({ decisions: [{ key: "XR-MEM-001", version: CURRENT, decision: "accepted" }] });
    clockNow = "2026-07-20T13:00:00.000Z";
    const res = await request(app)
      .post("/api/research/agreements")
      .send({ decisions: [{ key: "XR-MEM-001", version: CURRENT, decision: "declined" }] });
    expect(res.status).toBe(200);
    const founding = res.body.agreements.find((a: any) => a.key === "XR-MEM-001");
    expect(founding.acceptedVersion).toBeNull();
    // Both rows remain: history is appended, never rewritten.
    expect(state.acceptances.filter((r) => r.agreement_key === "XR-MEM-001")).toHaveLength(2);
  });
});

describe("member isolation", () => {
  it("member A never reads member B rows and writes only under their own id", async () => {
    seedAcceptance({ subject_id: MEMBER_B.id, agreement_key: "XR-MEM-002" });
    const app = makeApp();

    // A sees nothing accepted even though B accepted XR-MEM-002.
    const asA = await request(app).get("/api/research/agreements");
    for (const agreement of asA.body.agreements) expect(agreement.acceptedVersion).toBeNull();

    // A body cannot pick a subject: extra fields are stripped and the row is
    // scoped to the session member.
    const write = await request(app)
      .post("/api/research/agreements")
      .send({
        subjectId: MEMBER_B.id,
        decisions: [{ key: "XR-MEM-001", version: CURRENT, decision: "accepted", subjectId: MEMBER_B.id }],
      });
    expect(write.status).toBe(200);
    const written = state.acceptances.filter((r) => r.agreement_key === "XR-MEM-001");
    expect(written).toHaveLength(1);
    expect(written[0].subject_id).toBe(MEMBER_A.id);

    // B still sees only their own state, unaffected by A's write.
    auth.currentMember = MEMBER_B;
    const asB = await request(app).get("/api/research/agreements");
    const bActivation = asB.body.agreements.find((a: any) => a.key === "XR-MEM-002");
    expect(bActivation.acceptedVersion).toBe(CURRENT);
    const bFounding = asB.body.agreements.find((a: any) => a.key === "XR-MEM-001");
    expect(bFounding.acceptedVersion).toBeNull();
  });
});

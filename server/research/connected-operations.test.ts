import express, { type Request, type RequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationsSnapshot } from "./analytics/snapshot";
import type { RateLimitOptions } from "./rate-limit";

type UserReply = { data: { user: { id: string; email: string; email_confirmed_at: string } | null }; error: { status?: number } | null };
type AssuranceReply = { data: { currentLevel: "aal1" | "aal2"; nextLevel: "aal1" | "aal2" } | null; error: { status?: number } | null };
const sdk = vi.hoisted(() => ({
  configured: vi.fn<() => boolean>(), anon: vi.fn<() => unknown>(), admin: vi.fn<() => unknown>(),
  identity: vi.fn<() => { configuredUrl: string | null; adminUrl: string | null; anonUrl: string | null }>(),
  getUser: vi.fn<(token: string) => Promise<UserReply>>(),
  assurance: vi.fn<(token: string) => Promise<AssuranceReply>>(),
  rpc: vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>(),
  rate: vi.fn<(key: string, seconds: number, max: number, options?: RateLimitOptions) => Promise<boolean>>(),
  snapshot: vi.fn<(window: { start: string; end: string }) => Promise<OperationsSnapshot>>(),
}));
vi.mock("../supabase", () => ({ supabaseConfigured: sdk.configured, getSupabaseAnon: sdk.anon, getSupabaseAdmin: sdk.admin, getSupabaseConnectionIdentity: sdk.identity }));
vi.mock("./rate-limit", async () => ({ ...await vi.importActual<typeof import("./rate-limit")>("./rate-limit"), rateLimitHit: sdk.rate }));
vi.mock("./analytics/snapshot", async () => ({ ...await vi.importActual<typeof import("./analytics/snapshot")>("./analytics/snapshot"), readOperationsSnapshot: sdk.snapshot }));
import { registerConnectedOperations } from "./connected-operations";

const actor = "80000000-0000-4000-8000-000000000001", scope = "80000000-0000-4000-8000-000000000002";
const email = "operator@example.invalid", contextPath = "/api/research/account-executive/context";
const analyticsPath = "/api/admin/research/early-access/analytics";
const base = { RENDER: "true", RENDER_SERVICE_ID: "srv-d9h4f4m7r5hc73ctjng0",
  SUPABASE_URL: "https://srcphrgnxreqyirkitxd.supabase.co", SITE_URL: "https://xenios-research-staging.onrender.com",
  RENDER_EXTERNAL_URL: "https://xenios-research-staging.onrender.com", RESEARCH_AE_OPERATIONAL_SCOPE_ID: scope };
function jwt(extra: Record<string, unknown> = {}) {
  return "synthetic." + Buffer.from(JSON.stringify({ sub: actor, session_id: "80000000-0000-4000-8000-000000000003",
    exp: Date.now() / 1000 + 600, aal: "aal2", amr: [{ method: "password" }, { method: "totp" }], ...extra })).toString("base64url") + ".synthetic";
}
const denyAdmin: RequestHandler = (_req, res) => { res.status(403).json({ error: "forbidden" }); };
const allowAdmin: RequestHandler = (req, _res, next) => { (req as Request & { adminEmail?: string }).adminEmail = email; next(); };
function app(overrides: Record<string, string | undefined> = {}, requireAdmin: RequestHandler = denyAdmin) {
  const server = express();
  const state = registerConnectedOperations(server, { env: { ...base, ...overrides }, requireAdmin });
  return { server, state };
}
beforeEach(() => {
  vi.resetAllMocks(); sdk.configured.mockReturnValue(true);
  sdk.identity.mockReturnValue({ configuredUrl: base.SUPABASE_URL, adminUrl: null, anonUrl: null });
  sdk.getUser.mockResolvedValue({ data: { user: { id: actor, email, email_confirmed_at: "2026-11-01T00:00:00Z" } }, error: null });
  sdk.assurance.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null });
  sdk.anon.mockReturnValue({ auth: { getUser: sdk.getUser, mfa: { getAuthenticatorAssuranceLevel: sdk.assurance } } });
  sdk.admin.mockReturnValue({ rpc: sdk.rpc }); sdk.rate.mockResolvedValue(true);
  sdk.rpc.mockResolvedValue({ data: null, error: { code: "unavailable" } });
  sdk.snapshot.mockImplementation(async window => {
    const observed = { state: "observed" as const, totalRecords: 42, windowRecords: 3, latestAt: "2026-11-18T12:00:00Z" };
    return { schemaVersion: 1, observedAt: "2026-11-18T23:00:00Z", windowStart: window.start, windowEnd: window.end,
      sources: { requests: observed, workflows: observed, workflowEvents: observed, outbox: observed, support: observed } };
  });
});
describe("actual Root connected composition (synthetic SDK/server boundaries)", () => {
  it("defaults off without SDK lookup, scope reads or route registration", async () => {
    const { server, state } = app(); expect(state.ae.state).toBe("disabled"); expect(state.analytics).toBe("disabled");
    expect((await request(server).get(contextPath)).status).toBe(404);
    expect(sdk.anon).not.toHaveBeenCalled(); expect(sdk.admin).not.toHaveBeenCalled(); expect(sdk.snapshot).not.toHaveBeenCalled();
  });
  it.each([{ RENDER_SERVICE_ID: "foreign-service" }, { SUPABASE_URL: "https://foreign.supabase.co" },
    { SITE_URL: "https://foreign.example.invalid" }, { IS_PULL_REQUEST: "true" }, { RENDER_PR_NUMBER: "42" },
    { RESEARCH_AE_OPERATIONAL_SCOPE_ID: "00000000-0000-0000-0000-000000000000" }])("refuses an invalid runtime before client lookup: %j", async patch => {
    const { server, state } = app({ RESEARCH_AE_WORKSPACE_ENABLED: "true", RESEARCH_OPERATIONS_ANALYTICS_ENABLED: "true", ...patch });
    expect(state.ae.state).not.toBe("ready"); expect((await request(server).get(contextPath)).status).toBe(404);
    expect(sdk.anon).not.toHaveBeenCalled(); expect(sdk.admin).not.toHaveBeenCalled();
  });
  it("requires available canonical clients and never constructs a fallback", async () => {
    sdk.anon.mockImplementation(() => { throw new Error("missing canonical configuration"); });
    const { server, state } = app({ RESEARCH_AE_WORKSPACE_ENABLED: "true" });
    expect(state.ae.state).toBe("unavailable"); expect((await request(server).get(contextPath)).status).toBe(404);
    expect(sdk.rpc).not.toHaveBeenCalled();
  });
  it.each(["configuredUrl", "adminUrl", "anonUrl"] as const)("refuses a mismatched %s before either protected boundary mounts", async field => {
    sdk.identity.mockReturnValue({ configuredUrl: base.SUPABASE_URL, adminUrl: null, anonUrl: null,
      [field]: "https://yvzeduaxbwgcwllhywff.supabase.co" });
    const { server, state } = app({ RESEARCH_AE_WORKSPACE_ENABLED: "true", RESEARCH_OPERATIONS_ANALYTICS_ENABLED: "true" });
    expect(state.ae.state).toBe("unavailable"); expect(state.analytics).toBe("unavailable");
    expect((await request(server).get(contextPath)).status).toBe(404);
    expect(sdk.anon).not.toHaveBeenCalled(); expect(sdk.admin).not.toHaveBeenCalled(); expect(sdk.snapshot).not.toHaveBeenCalled();
  });
  it("uses actual JWT-specific SDK verification/current level and a durable-only budget", async () => {
    const token = jwt(), { server, state } = app({ RESEARCH_AE_WORKSPACE_ENABLED: "true" });
    expect(state.ae.state).toBe("ready"); expect(state.ae.claimState).toBe("unavailable");
    const response = await request(server).get(contextPath).set("Authorization", "Bearer " + token);
    expect(response.status).toBe(200); expect(response.body).toEqual({ ok: true, value: { scopeId: scope } });
    expect(sdk.getUser).toHaveBeenCalledWith(token); expect(sdk.assurance).toHaveBeenCalledWith(token);
    expect(sdk.rate).toHaveBeenCalledWith(expect.stringMatching(/^ae-workspace:v1:[0-9a-f]{64}$/), 60, 60, { durableFailurePolicy: "deny" });
    expect(sdk.rpc).not.toHaveBeenCalled(); expect(response.headers["cache-control"]).toBe("private, no-store");
  });
  it("cannot promote enrolled next-level MFA to the session's current level", async () => {
    sdk.assurance.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    const { server } = app({ RESEARCH_AE_WORKSPACE_ENABLED: "true" });
    expect((await request(server).get(contextPath).set("Authorization", "Bearer " + jwt())).status).toBe(401);
    expect(sdk.rate).not.toHaveBeenCalled();
  });
  it("does not authenticate from decoded claims when the canonical verifier refuses", async () => {
    sdk.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    const { server } = app({ RESEARCH_AE_WORKSPACE_ENABLED: "true" });
    expect((await request(server).get(contextPath).set("Authorization", "Bearer " + jwt())).status).toBe(401);
    expect(sdk.assurance).not.toHaveBeenCalled(); expect(sdk.rate).not.toHaveBeenCalled();
  });
  it.each(["user", "assurance"]) ("keeps %s service failures unavailable without logging the provider error", async kind => {
    if (kind === "user") sdk.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
    else sdk.assurance.mockResolvedValue({ data: null, error: { status: 503 } });
    const { server } = app({ RESEARCH_AE_WORKSPACE_ENABLED: "true" });
    const response = await request(server).get(contextPath).set("Authorization", "Bearer " + jwt());
    expect(response.status).toBe(503); expect(response.body).toEqual({ ok: false, code: "unavailable" });
    expect(sdk.rpc).not.toHaveBeenCalled();
  });
  it("refuses recovery sessions and cannot leak a configured partition through them", async () => {
    const { server } = app({ RESEARCH_AE_WORKSPACE_ENABLED: "true" });
    const response = await request(server).get(contextPath).set("Authorization", "Bearer " + jwt({ amr: [{ method: "recovery" }] }));
    expect(response.status).toBe(403); expect(response.body.value).toBeUndefined(); expect(sdk.rate).not.toHaveBeenCalled();
  });
  it("preserves limiter refusal and rejects caller-selected context scope", async () => {
    const { server } = app({ RESEARCH_AE_WORKSPACE_ENABLED: "true" }), token = jwt();
    sdk.rate.mockResolvedValueOnce(false);
    expect((await request(server).get(contextPath).set("Authorization", "Bearer " + token)).status).toBe(429);
    const response = await request(server).get(contextPath + "?scopeId=client-choice").set("Authorization", "Bearer " + token);
    expect(response.status).toBe(400); expect(response.body.value).toBeUndefined();
  });
  it("mounts analytics only under the existing configured-admin guard", async () => {
    const { server, state } = app({ RESEARCH_OPERATIONS_ANALYTICS_ENABLED: "true" }); expect(state.analytics).toBe("ready");
    expect((await request(server).get(analyticsPath + "?day=2026-11-18")).status).toBe(403);
    expect(sdk.snapshot).not.toHaveBeenCalled(); expect(sdk.anon).not.toHaveBeenCalled();
  });
  it("keeps unclassified coverage separate from operational numbers", async () => {
    const { server } = app({ RESEARCH_OPERATIONS_ANALYTICS_ENABLED: "true" }, allowAdmin);
    const response = await request(server).get(analyticsPath + "?day=2026-11-18").set("Authorization", "Bearer " + jwt());
    expect(response.status).toBe(200); expect(response.body).toHaveLength(12);
    expect(response.body.every((metric: { value: unknown; freshness: string }) => metric.value === null &&
      ["not_measured", "not_configured"].includes(metric.freshness))).toBe(true);
    expect(response.headers["x-analytics-scope"]).toBe("server-project");
    const hinted = await request(server).get(analyticsPath + "?day=2026-11-18&projectId=foreign").set("Authorization", "Bearer " + jwt());
    expect(hinted.status).toBe(400);
  });
});

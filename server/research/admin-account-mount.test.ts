import express from "express";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminAccountReadiness, registerCanonicalAdminAccounts, ADMIN_ACCOUNT_READ_QUALIFICATION_ENV,
  ADMIN_ACCOUNT_SESSION_SQL_SHA256 } from "./admin-account-mount";
import { ADMIN_ACCOUNT_READ_ENABLED_ENV, ADMIN_ACCOUNT_READ_CURRENT_RPC,
  ADMIN_ACCOUNT_DENIED_AUDIT_RATE_LIMIT_RPC } from "./admin-account-admission";

const sdk = vi.hoisted(() => ({ anon: vi.fn(), admin: vi.fn(), connection: vi.fn(), configured: vi.fn() }));
vi.mock("../supabase", () => ({ getSupabaseAnon: sdk.anon, getSupabaseAdmin: sdk.admin,
  getSupabaseConnectionIdentity: sdk.connection, supabaseConfigured: sdk.configured }));
const project = "https://account-mount-fixture.supabase.co", source = "a".repeat(40);
const actor = "10000000-0000-4000-8000-000000000001", sid = "20000000-0000-4000-8000-000000000001";
const installation = { protocol: "account-read-installation/v1", sourceRevision: source, projectUrl: project,
  sqlSha256: ADMIN_ACCOUNT_SESSION_SQL_SHA256, installationReceiptSha256: "b".repeat(64) };
function environment() {
  return { SUPABASE_URL: project, RENDER_GIT_COMMIT: source, SUPABASE_ANON_KEY: "synthetic-key-not-a-secret",
    [ADMIN_ACCOUNT_READ_ENABLED_ENV]: "true", [ADMIN_ACCOUNT_READ_QUALIFICATION_ENV]: JSON.stringify(installation) } as Record<string, string | undefined>;
}
function fixture() {
  const env = environment(), probe = vi.fn(async (_project: string): Promise<unknown> => false);
  let connection = { configuredUrl: project, anonUrl: null as string | null, adminUrl: null as string | null };
  const configured = vi.fn(() => true);
  const gate = createAdminAccountReadiness({ env, configured, connection: () => connection, probe });
  return { env, probe, configured, gate, setConnection: (value: typeof connection) => { connection = value; } };
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("canonical account-read startup qualification", () => {
  it("binds the release configuration to the exact independently reviewed SQL candidate bytes", () => {
    expect(createHash("sha256").update(readFileSync("supabase/candidates/admin_account_session.sql")).digest("hex"))
      .toBe(ADMIN_ACCOUNT_SESSION_SQL_SHA256);
  });
  it("stays closed until its one bounded probe settles and shares an in-flight initialization", async () => {
    const f = fixture();
    let resolve!: (value: unknown) => void;
    f.probe.mockImplementation(() => new Promise(done => { resolve = done; }));
    expect(f.gate.ready()).toBe(false);
    const pending = f.gate.initialize();
    expect(f.gate.initialize()).toBe(pending);
    await Promise.resolve();
    expect(f.probe).toHaveBeenCalledExactlyOnceWith(project);
    expect(f.gate.ready()).toBe(false);
    resolve(false);
    expect(await pending).toBe(true);
    expect(f.gate.ready()).toBe(true);
    expect(await f.gate.initialize()).toBe(true);
    expect(f.probe).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["closed rollout", (e: Record<string, string | undefined>) => { delete e[ADMIN_ACCOUNT_READ_ENABLED_ENV]; }],
    ["missing binding", (e: Record<string, string | undefined>) => { delete e[ADMIN_ACCOUNT_READ_QUALIFICATION_ENV]; }],
    ["invalid JSON", (e: Record<string, string | undefined>) => { e[ADMIN_ACCOUNT_READ_QUALIFICATION_ENV] = "{"; }],
    ["source mismatch", (e: Record<string, string | undefined>) => { e.RENDER_GIT_COMMIT = "c".repeat(40); }],
    ["project mismatch", (e: Record<string, string | undefined>) => { e.SUPABASE_URL = "https://other.supabase.co"; }],
    ["SQL mismatch", (e: Record<string, string | undefined>) => { e[ADMIN_ACCOUNT_READ_QUALIFICATION_ENV] = JSON.stringify({ ...installation, sqlSha256: "0".repeat(64) }); }],
    ["extra field", (e: Record<string, string | undefined>) => { e[ADMIN_ACCOUNT_READ_QUALIFICATION_ENV] = JSON.stringify({ ...installation, approved: true }); }],
    ["missing receipt binding", (e: Record<string, string | undefined>) => { e[ADMIN_ACCOUNT_READ_QUALIFICATION_ENV] = JSON.stringify({ ...installation, installationReceiptSha256: "" }); }],
    ["non-origin URL", (e: Record<string, string | undefined>) => { e.SUPABASE_URL = project + "/path"; e[ADMIN_ACCOUNT_READ_QUALIFICATION_ENV] = JSON.stringify({ ...installation, projectUrl: e.SUPABASE_URL }); }],
  ])("performs no probe with %s", async (_name, change) => {
    const f = fixture(); change(f.env);
    expect(await f.gate.initialize()).toBe(false); expect(f.gate.ready()).toBe(false); expect(f.probe).not.toHaveBeenCalled();
  });
  it.each([true, null, undefined, 0, "false", { current: false }])("rejects a non-literal-false startup response %#", async result => {
    const f = fixture(); f.probe.mockResolvedValue(result);
    expect(await f.gate.initialize()).toBe(false); expect(f.gate.ready()).toBe(false);
  });
  it("withholds readiness after a provider failure or cached-project drift", async () => {
    const f = fixture(); f.probe.mockRejectedValue(Error("synthetic private diagnostic"));
    expect(await f.gate.initialize()).toBe(false);
    const other = fixture(); other.setConnection({ configuredUrl: project, anonUrl: project, adminUrl: "https://other.supabase.co" });
    expect(await other.gate.initialize()).toBe(false); expect(other.probe).not.toHaveBeenCalled();
  });
  it("refuses drift during the startup call and after successful qualification", async () => {
    const f = fixture(); f.probe.mockImplementation(async () => { f.env.RENDER_GIT_COMMIT = "d".repeat(40); return false; });
    expect(await f.gate.initialize()).toBe(false);
    const other = fixture(); expect(await other.gate.initialize()).toBe(true);
    other.env[ADMIN_ACCOUNT_READ_QUALIFICATION_ENV] = JSON.stringify({ ...installation, installationReceiptSha256: "e".repeat(64) });
    expect(other.gate.ready()).toBe(false);
  });
  it("cannot adopt a late probe response after its five-second bound", async () => {
    vi.useFakeTimers();
    const f = fixture(); let resolve!: (value: unknown) => void;
    f.probe.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = f.gate.initialize(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5001);
    expect(await pending).toBe(false); resolve(false); await Promise.resolve();
    expect(f.gate.ready()).toBe(false); expect(f.probe).toHaveBeenCalledTimes(1);
  });
});

describe("actual account route composition with controlled canonical SDK ports", () => {
  function mounted(enabled = true, coldAdmin = false) {
    const env = environment(); if (!enabled) delete env[ADMIN_ACCOUNT_READ_ENABLED_ENV];
    vi.stubEnv(ADMIN_ACCOUNT_READ_ENABLED_ENV, env[ADMIN_ACCOUNT_READ_ENABLED_ENV]);
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const connection = { configuredUrl: project, anonUrl: null as string | null, adminUrl: coldAdmin ? null : project };
    sdk.connection.mockImplementation(() => ({ ...connection })); sdk.configured.mockReturnValue(true);
    const getUser = vi.fn(async () => ({ data: { user: { id: actor } }, error: null }));
    const listUsers = vi.fn(async () => ({ data: { users: [], total: 0, lastPage: 1 }, error: null }));
    let current = true;
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === ADMIN_ACCOUNT_DENIED_AUDIT_RATE_LIMIT_RPC) return { data: true, error: null };
      if (name !== ADMIN_ACCOUNT_READ_CURRENT_RPC) throw Error("unexpected controlled RPC");
      return { data: args.p_actor_user_id === null && args.p_session_id === null ? false : current, error: null };
    });
    sdk.anon.mockImplementation(() => { connection.anonUrl = project; return { auth: { getUser,
      mfa: { getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: "aal2" }, error: null })) } } }; });
    sdk.admin.mockImplementation(() => { connection.adminUrl = project; return { rpc, auth: { admin: { listUsers } } }; });
    const audit = { appendAccessAudit: vi.fn(async () => undefined) };
    const app = express(); const readiness = registerCanonicalAdminAccounts(app, audit);
    const seconds = Math.floor(Date.now() / 1000);
    // Auth verification is a controlled port, not a genuinely signed provider JWT.
    const claims = { iss: project + "/auth/v1", aud: "authenticated", role: "authenticated", sub: actor,
      session_id: sid, is_anonymous: false, aal: "aal2", exp: seconds + 3600,
      amr: [{ method: "password", timestamp: seconds - 600 }, { method: "totp", timestamp: seconds - 10 }] };
    const bearer = Buffer.from("{}").toString("base64url") + "." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".synthetic";
    return { app, readiness, listUsers, rpc, audit, bearer, revoke: () => { current = false; } };
  }
  it("mounts stable private JSON refusals with zero SDK reads when rollout is closed", async () => {
    const f = mounted(false);
    expect(sdk.admin).not.toHaveBeenCalled(); expect(sdk.anon).not.toHaveBeenCalled();
    expect(await f.readiness.initialize()).toBe(false);
    const denied = await request(f.app).get("/api/admin/research/accounts").set("Authorization", "Bearer placeholder");
    expect(denied.status).toBe(503); expect(denied.body.code).toBe("account_read_unavailable");
    expect(denied.headers["cache-control"]).toContain("no-store");
    expect(f.listUsers).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("refuses a cold canonical admin cache before its getter can launch an unrelated Auth health read", async () => {
    const f = mounted(true, true);
    expect(await f.readiness.initialize()).toBe(false);
    expect(sdk.admin).not.toHaveBeenCalled(); expect(sdk.anon).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.listUsers).not.toHaveBeenCalled();
    const response = await request(f.app).get("/api/admin/research/accounts").set("Authorization", "Bearer placeholder");
    expect(response.status).toBe(503); expect(f.listUsers).not.toHaveBeenCalled();
  });
  it("opens the real U3 route only after qualification then refuses a current role/session revocation", async () => {
    const f = mounted();
    expect(await f.readiness.initialize()).toBe(true);
    const first = await request(f.app).get("/api/admin/research/accounts").set("Authorization", "Bearer " + f.bearer);
    expect(first.status).toBe(200); expect(first.body).toMatchObject({ accounts: [], total: 0 });
    expect(f.listUsers).toHaveBeenCalledTimes(1); expect(f.audit.appendAccessAudit).toHaveBeenCalledTimes(1);
    f.revoke();
    const second = await request(f.app).get("/api/admin/research/accounts").set("Authorization", "Bearer " + f.bearer);
    expect(second.status).toBe(403); expect(second.body.code).toBe("account_read_denied");
    expect(f.listUsers).toHaveBeenCalledTimes(1); expect(f.audit.appendAccessAudit).toHaveBeenCalledTimes(2);
    expect(f.audit.appendAccessAudit).toHaveBeenLastCalledWith(expect.objectContaining({
      authUserId: actor, routeGroup: "/api/admin/research/accounts", role: null,
      decision: "denied", reasonCode: "account_read_authority_required",
    }));
    expect(f.rpc).toHaveBeenLastCalledWith(ADMIN_ACCOUNT_DENIED_AUDIT_RATE_LIMIT_RPC, {
      p_key: "admin-account-read-denial:" + createHash("sha256").update(actor).digest("hex"),
      p_window_seconds: 60, p_max_hits: 10,
    });
    const anonymous = await request(f.app).get("/api/admin/research/accounts");
    expect(anonymous.status).toBe(401);
  });
  it("withholds a composed denial when its awaited existing audit sink rejects", async () => {
    const f = mounted(); await f.readiness.initialize(); f.revoke();
    f.audit.appendAccessAudit.mockRejectedValue(Error("synthetic private denial audit failure"));
    const response = await request(f.app).get("/api/admin/research/accounts").set("Authorization", "Bearer " + f.bearer);
    expect(response.status).toBe(503); expect(response.body).toEqual({ ok: false, code: "account_read_unavailable" });
    expect(f.listUsers).not.toHaveBeenCalled();
    expect(f.audit.appendAccessAudit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      authUserId: actor, role: null, decision: "denied", reasonCode: "account_read_authority_required",
    }));
    expect(JSON.stringify(response.body)).not.toContain("private denial audit");
  });
  it("returns no account data when the actual composed durable audit sink rejects", async () => {
    const f = mounted(); await f.readiness.initialize();
    f.audit.appendAccessAudit.mockRejectedValue(Error("synthetic private audit failure"));
    const response = await request(f.app).get("/api/admin/research/accounts").set("Authorization", "Bearer " + f.bearer);
    expect(response.status).toBe(503); expect(response.body).toEqual({ ok: false, code: "account_read_unavailable" });
    expect(JSON.stringify(response.body)).not.toContain("private audit");
  });
});


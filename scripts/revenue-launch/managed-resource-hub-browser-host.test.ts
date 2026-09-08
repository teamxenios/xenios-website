import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import express from "express";
import request from "supertest";
import {
  ACTORS, ADMIN_BASE, AUTH_CAPS, BUCKET, PDF_SHA, SOURCE_SHA, SOURCE_TREE, STAGING_ORIGIN, STAGING_PROJECT, TABLES,
  allowedBrowserRoute, appendBrowserJournal, assertBrowserCasResult, createBrowserBoundary, createStdinStopHandler, mountCanonicalBrowserRoutes, sanitizeBrowserHostError, sha256, validateBrowserCredentials, validateBrowserPlan, verifyBuildFiles,
  type Actor, type BrowserEvent, type BrowserPlan,
} from "./managed-resource-hub-browser-host";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const realtime = { transport: ws as unknown as typeof WebSocket };
function plan(host: "adminA" | "adminB" = "adminA"): BrowserPlan {
  const actors = Object.fromEntries(ACTORS.map((name, index) => [name, {
    authUserId: id(index + 1), email: `${name.toLowerCase()}@qualification.invalid`, memberId: index > 1 ? id(index + 11) : null,
    applicationId: index > 1 ? id(index + 21) : null, memberStatus: index > 1 ? "active" : null,
    partner: ["eligible", "suspended"].includes(name) ? { id: id(index + 31), role: "affiliate", state: name === "eligible" ? "active" : "suspended" } : null,
  }])) as BrowserPlan["actors"];
  return validateBrowserPlan({ schemaVersion: 1, runId: "hubbrowser-offline-20260908", sourceSha: SOURCE_SHA, sourceTree: SOURCE_TREE, hostFileSha256: "1".repeat(64), ownerApprovalSha256: "2".repeat(64), target: { projectRef: STAGING_PROJECT, origin: STAGING_ORIGIN }, host, credentialsFile: "/private/keys.json", receiptDirectory: "/private/fresh", actors,
    pdf: { path: "/private/fixture.pdf", sha256: PDF_SHA, sizeBytes: 42, metadata: { title: "Synthetic browser material", purpose: "Synthetic qualification only", usagePolicy: "private", audience: ["affiliate"], originalFilename: "qualification.pdf" }, reviewReason: "Browser review", withdrawReason: "Browser complete" },
    existing: [{ resourceId: id(50), versionId: id(51), objectKey: `resource-library/${id(50)}/v1-${id(51)}.pdf` }], distDirectory: "/build/public", buildManifestFile: "/private/build.json", buildManifestSha256: "3".repeat(64) });
}
const response = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function authResponse(p: BrowserPlan, name: Actor) { return { access_token: `opaque-real-provider-response-${name}`, refresh_token: `opaque-refresh-${name}`, token_type: "bearer", expires_in: 3600, user: { id: p.actors[name].authUserId, email: p.actors[name].email, email_confirmed_at: "2026-09-08T00:00:00Z" } }; }
function login(boundary: ReturnType<typeof createBrowserBoundary>, p: BrowserPlan, name: Actor) {
  return boundary.fetch(`${STAGING_ORIGIN}/auth/v1/token?grant_type=password`, { method: "POST", body: JSON.stringify({ email: p.actors[name].email, password: "synthetic-offline-only-password", gotrue_meta_security: {} }) });
}

describe("private browser host plan and source boundary", () => {
  it("records only a fixed startup stage and an allowlisted Error name", () => {
    expect(sanitizeBrowserHostError(new TypeError("untrusted provider diagnostic"), "static_fallback")).toEqual({ stage: "static_fallback", errorName: "TypeError" });
    const error = new Error("untrusted diagnostic"); error.name = "untrusted custom name";
    expect(sanitizeBrowserHostError(error, "canonical_modules")).toEqual({ stage: "canonical_modules", errorName: "UnknownError" });
    expect(JSON.stringify(sanitizeBrowserHostError(error, "listen"))).not.toContain("untrusted");
  });
  it("pins the two-host combined eight-password/eight-logout ceiling and refuses scope changes", () => {
    expect(Object.values(AUTH_CAPS).flatMap(Object.values).reduce((a, b) => a + b, 0)).toBe(8);
    for (const patch of [{ target: { projectRef: "yvzeduaxbwgcwllhywff", origin: "https://yvzeduaxbwgcwllhywff.supabase.co" } }, { sourceSha: "a".repeat(40) }, { pdf: { ...plan().pdf, sha256: "4".repeat(64) } }]) expect(() => validateBrowserPlan({ ...plan(), ...patch })).toThrow();
    expect(() => validateBrowserPlan({ ...plan(), unknown: true })).toThrow();
  });
  it("does not accept duplicate principals or an active suspended control", () => {
    const p = plan(); p.actors.adminB.authUserId = p.actors.adminA.authUserId; expect(() => validateBrowserPlan(p)).toThrow("distinct_actors");
    const q = plan(); q.actors.suspended.partner!.state = "active"; expect(() => validateBrowserPlan(q)).toThrow("partner_identity_scope");
  });
  it("requires a public browser key, a separate service key and exact staging binding", () => {
    expect(validateBrowserCredentials({ projectRef: STAGING_PROJECT, origin: STAGING_ORIGIN, anonKey: "sb_publishable_offline_0123456789", serviceKey: "sb_secret_offline_0123456789" })).toHaveProperty("origin", STAGING_ORIGIN);
    expect(() => validateBrowserCredentials({ projectRef: STAGING_PROJECT, origin: STAGING_ORIGIN, anonKey: "sb_secret_offline_0123456789", serviceKey: "sb_secret_offline_0123456789" })).toThrow("public_key_binding");
  });
  it("verifies the complete frozen asset set and rejects changed or additional files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hub-browser-test-"));
    try {
      mkdirSync(path.join(dir, "assets")); writeFileSync(path.join(dir, "index.html"), "<html></html>"); writeFileSync(path.join(dir, "assets", "app.js"), "export{}");
      const manifest = { sourceSha: SOURCE_SHA, sourceTree: SOURCE_TREE, buildExitCode: 0, files: [{ path: "index.html", sha256: sha256("<html></html>"), sizeBytes: 13 }, { path: "assets/app.js", sha256: sha256("export{}"), sizeBytes: 8 }] };
      expect(verifyBuildFiles(dir, manifest).files.size).toBe(2);
      writeFileSync(path.join(dir, "assets", "app.js"), "changed!"); expect(() => verifyBuildFiles(dir, manifest)).toThrow("asset_hash");
      writeFileSync(path.join(dir, "extra.js"), "extra"); expect(() => verifyBuildFiles(dir, manifest)).toThrow("build_inventory");
    } finally { rmSync(dir, { recursive: true }); }
  });
  it("only mounts the selected shell/read/lifecycle routes", () => {
    expect(allowedBrowserRoute("GET", "/api/research/member/me", false)).toBe(true);
    expect(allowedBrowserRoute("POST", ADMIN_BASE, false)).toBe(true);
    for (const route of ["/api/research/member/claim", "/api/research/member/forgot-password", "/api/research/partner/content", "/api/research/checkout", "/api/research/member/referrals"]) expect(allowedBrowserRoute("POST", route, false)).toBe(false);
    expect(allowedBrowserRoute("HEAD", `${ADMIN_BASE}/${id(50)}/versions/${id(51)}/download`, false)).toBe(false);
    expect(allowedBrowserRoute("POST", ADMIN_BASE, true)).toBe(false);
  });
});

describe("actual Express and canonical registrar boot without managed services", () => {
  it("mounts the actual member, Hub and partner routes before the Express5-compatible GET fallback", async () => {
    const oldEnv = { ...process.env }, originalFetch = globalThis.fetch; vi.resetModules();
    const upstream = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.origin !== STAGING_ORIGIN || url.pathname !== "/auth/v1/admin/users" || url.searchParams.get("page") !== "1" || url.searchParams.get("per_page") !== "1") throw new Error("unexpected offline transport");
      return response({ users: [], aud: "authenticated", next_page: null, last_page: 0, total: 0 });
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      for (const key of Object.keys(process.env)) if (!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE)$/i.test(key)) delete process.env[key];
      Object.assign(process.env, { NODE_ENV: "production", SUPABASE_URL: STAGING_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_offline_0123456789", SUPABASE_ANON_KEY: "sb_publishable_offline_0123456789", ADMIN_EMAIL: "admina@qualification.invalid", RESEARCH_RESOURCE_HUB_ENABLED: "true", AFFILIATE_SYSTEM_ENABLED: "true", AFFILIATE_PORTAL_ENABLED: "true", RESEARCH_REFERRAL_V1_ENABLED: "false" });
      globalThis.fetch = upstream as typeof fetch;
      const app = express(); const stages: string[] = [];
      app.use((req, res, next) => { if (req.path.startsWith("/api/") && !allowedBrowserRoute(req.method, req.path, false)) { res.sendStatus(503); return; } next(); });
      await mountCanonicalBrowserRoutes(app, (_req, res) => { res.type("html").send("<html>offline boot regression</html>"); }, (stage) => stages.push(stage));
      expect(stages).toEqual(["member_routes", "hub_routes", "partner_routes", "static_fallback"]);
      for (const route of ["/", "/research/account", "/research/partners/resources", "/admin/research/resource-hub"]) expect((await request(app).get(route)).status).toBe(200);
      for (const route of ["/api/research/member/me", ADMIN_BASE, "/api/research/partner/resources"]) expect((await request(app).get(route)).status).toBe(401);
      expect((await request(app).post("/api/research/member/claim").send({})).status).toBe(503);
      expect((await request(app).head("/research/account")).status).toBe(404);
      await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(1)); // Canonical key-grade self-check only, fulfilled offline.
    } finally { globalThis.fetch = originalFetch; for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, oldEnv); log.mockRestore(); }
  }, 15000);
});

describe("managed Auth effects are real-provider, capped and write-ahead", () => {
  it("permits only the exact canonical service-key self-check before writes", async () => {
    const p = plan(), upstream = vi.fn(async () => response({ users: [], aud: "authenticated", next_page: null, last_page: 0, total: 0 }));
    const boundary = createBrowserBoundary(p, upstream, () => {});
    // Actual canonical lazy-client startup including its automatic grade self-check.
    const before = { ...process.env }, originalFetch = globalThis.fetch; vi.resetModules();
    try {
      Object.assign(process.env, { SUPABASE_URL: STAGING_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_offline_0123456789" }); globalThis.fetch = boundary.fetch;
      const { getSupabaseAdmin } = await import("../../server/supabase"); getSupabaseAdmin();
      await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(1)); await boundary.drain();
    } finally { globalThis.fetch = originalFetch; for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, before); }
    expect(boundary.counts.service_key_self_check).toBe(1);
    await expect(boundary.fetch(`${STAGING_ORIGIN}/auth/v1/admin/users?page=1&per_page=200`)).rejects.toThrow("auth_endpoint_or_refresh");
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("does not dispatch a password effect before durable recording succeeds", async () => {
    const p = plan(), upstream = vi.fn(); const b = createBrowserBoundary(p, upstream, () => { throw new Error("private journal unavailable"); }); b.enableWrites();
    await expect(login(b, p, "adminA")).rejects.toThrow("transport_or_journal_failure"); expect(upstream).not.toHaveBeenCalled();
    expect(b.firstRefusal()?.code).toBe("transport_or_journal_failure");
  });
  it("runs the installed client's actual password/logout transport with redacted receipts", async () => {
    const p = plan(), events: BrowserEvent[] = [];
    const upstream = vi.fn(async (input: RequestInfo | URL) => new URL(String(input)).pathname.endsWith("logout") ? response(null, 204) : response(authResponse(p, "adminA")));
    const b = createBrowserBoundary(p, upstream as typeof fetch, (event) => events.push(event)); b.enableWrites();
    const client = createClient(STAGING_ORIGIN, "sb_publishable_offline_0123456789", { realtime, auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: b.fetch } });
    expect((await client.auth.signInWithPassword({ email: p.actors.adminA.email, password: "synthetic-offline-only-password" })).error).toBeNull();
    expect((await client.auth.signOut()).error).toBeNull();
    expect(b.counts.password_adminA).toBe(1); expect(b.counts.logout_adminA).toBe(1);
    expect(JSON.stringify(events)).not.toMatch(/password"|qualification\.invalid|opaque-|synthetic-offline-only-password/);
  });
  it("refuses sign-up, recovery, refresh, an unapproved email and a mismatched real Auth result", async () => {
    for (const route of ["signup", "recover", "token?grant_type=refresh_token"]) {
      const upstream = vi.fn(), b = createBrowserBoundary(plan(), upstream, () => {}); b.enableWrites();
      await expect(b.fetch(`${STAGING_ORIGIN}/auth/v1/${route}`, { method: "POST", body: "{}" })).rejects.toThrow("auth_endpoint_or_refresh"); expect(upstream).not.toHaveBeenCalled();
    }
    const p = plan(), upstream = vi.fn(async () => response(authResponse(p, "eligible"))), b = createBrowserBoundary(p, upstream, () => {}); b.enableWrites();
    await expect(login(b, p, "adminA")).rejects.toThrow("verified_auth_identity");
  });
  it("enforces fixed host/actor login and canonical logout scope caps", async () => {
    const p = plan("adminB"), upstream = vi.fn(async () => response(authResponse(p, "adminB"))), b = createBrowserBoundary(p, upstream, () => {}); b.enableWrites();
    await login(b, p, "adminB"); await expect(login(b, p, "adminB")).rejects.toThrow("request_cap"); expect(upstream).toHaveBeenCalledTimes(1);
    const q = plan(), b2 = createBrowserBoundary(q, vi.fn(async () => response(authResponse(q, "eligible"))), () => {}); b2.enableWrites(); await login(b2, q, "eligible");
    await expect(b2.fetch(`${STAGING_ORIGIN}/auth/v1/logout?scope=global`, { method: "POST", headers: { authorization: "Bearer opaque-real-provider-response-eligible" } })).rejects.toThrow("canonical_logout_scope");
  });
});

describe("row/object/transport containment", () => {
  it("requires a single exact winner row from a successful CAS response", () => {
    expect(() => assertBrowserCasResult([{ id: id(51) }], id(51))).not.toThrow();
    expect(() => assertBrowserCasResult({ id: id(51) }, id(51))).not.toThrow();
    for (const raw of [[], null, 1, {}, [{ id: id(99) }], [{ id: id(51) }, { id: id(51) }], [{ id: id(51), other: true }]]) expect(() => assertBrowserCasResult(raw, id(51))).toThrow();
  });
  it.each(["https://yvzeduaxbwgcwllhywff.supabase.co", "https://other.invalid", `${STAGING_ORIGIN}:444`])("refuses an origin outside exact staging: %s", async (origin) => {
    const upstream = vi.fn(), b = createBrowserBoundary(plan(), upstream, () => {});
    await expect(b.fetch(`${origin}/rest/v1/research_members?select=id`)).rejects.toThrow("origin_path_method"); expect(upstream).not.toHaveBeenCalled();
  });
  it("scopes canonical SDK list reads before dispatch, retaining another host's rows outside its scope", async () => {
    const p = plan("adminB"), upstream = vi.fn(async (_input: RequestInfo | URL) => response([{ id: id(50) }])), b = createBrowserBoundary(p, upstream, () => {});
    const client = createClient(STAGING_ORIGIN, "sb_secret_offline_0123456789", { realtime, auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: b.fetch } });
    const result = await client.from(TABLES[0]).select("id").order("created_at", { ascending: true }); expect(result.error).toBeNull();
    expect(new URL(String(upstream.mock.calls[0]?.[0])).searchParams.get("id")).toBe(`in.(${id(50)})`);
  });
  it("rejects an unowned version even when it names an owned resource", async () => {
    const upstream = vi.fn(async () => response([{ id: id(99), resource_id: id(50) }])), b = createBrowserBoundary(plan(), upstream, () => {});
    await expect(b.fetch(`${STAGING_ORIGIN}/rest/v1/${TABLES[1]}?select=id,resource_id&resource_id=eq.${id(50)}`)).rejects.toThrow("unowned_response_row");
  });
  it("uses an impossible NOT NULL column condition for an empty owned set", async () => {
    const p = plan(); p.existing = []; const upstream = vi.fn(async (_input: RequestInfo | URL) => response([]));
    const b = createBrowserBoundary(p, upstream, () => {}); await b.fetch(`${STAGING_ORIGIN}/rest/v1/${TABLES[0]}?select=id`);
    expect(new URL(String(upstream.mock.calls[0]?.[0])).searchParams.get("id")).toBe("is.null");
  });
  it("accepts only the bounded graceful stdin stop command, including split input", () => {
    const stop = vi.fn(), invalid = vi.fn(), input = createStdinStopHandler(stop, invalid); input("st"); input("op\r\n"); expect(stop).toHaveBeenCalledOnce(); expect(invalid).not.toHaveBeenCalled();
    createStdinStopHandler(stop, invalid)("stop\nextra"); expect(invalid).toHaveBeenCalledOnce();
  });
  it("forbids core writes, extra RPCs and retained-object mutations", async () => {
    for (const [method, route] of [["POST", "/rest/v1/research_members"], ["POST", "/rest/v1/rpc/research_rate_limit_hit"], ["DELETE", `/storage/v1/object/${BUCKET}/resource-library/${id(50)}/v1-${id(51)}.pdf`]]) {
      const upstream = vi.fn(), b = createBrowserBoundary(plan(), upstream, () => {}); b.enableWrites();
      await expect(b.fetch(`${STAGING_ORIGIN}${route}`, { method, body: "{}" })).rejects.toThrow(); expect(upstream).not.toHaveBeenCalled();
    }
  });
  it("freezes an in-flight operation and rejects its canonical continuation after draining", async () => {
    const upstream = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })));
    const b = createBrowserBoundary(plan(), upstream as typeof fetch, () => {});
    const pending = b.fetch(`${STAGING_ORIGIN}/storage/v1/bucket/${BUCKET}`); const failed = expect(pending).rejects.toThrow("transport_or_journal_failure");
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(1)); b.stop(); await b.drain(); await failed;
    await expect(b.fetch(`${STAGING_ORIGIN}/rest/v1/${TABLES[0]}`, { method: "POST", body: "{}" })).rejects.toThrow("run_stopped"); expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("fails closed on provider redirects or uncertain errors", async () => {
    for (const status of [302, 500]) { const b = createBrowserBoundary(plan(), vi.fn(async () => response({}, status)), () => {}); await expect(b.fetch(`${STAGING_ORIGIN}/storage/v1/bucket/${BUCKET}`)).rejects.toThrow(); expect(b.hasFailed()).toBe(true); }
  });
  it("finishes short journal writes before fsync and rejects zero-progress writes", () => {
    const sync = vi.fn(); let bytesWritten = 0;
    const write = vi.fn((_fd: number, _bytes: Uint8Array, _offset: number, length: number) => { const count = Math.min(length, 3); bytesWritten += count; return count; });
    appendBrowserJournal(1, { operation: "fixture" }, write as never, sync); expect(bytesWritten).toBe(Buffer.byteLength('{"operation":"fixture"}\n')); expect(sync).toHaveBeenCalledOnce();
    expect(() => appendBrowserJournal(1, {}, (() => 0) as never, sync)).toThrow("journal_write");
  });
});

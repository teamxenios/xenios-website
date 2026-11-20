import express from "express";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerAccountLifecycleApi } from "./routes";
import { buildAccountLifecycleDependencies } from "./production";
import { unavailableLifecycle } from "@shared/research/account-lifecycle";
import type { LifecycleAttemptBinding, LifecycleDependencies } from "./service";
import { scanExpressRouteResult } from "../../../scripts/acceptance/verify-route-uniqueness";
const actorId = "10000000-0000-4000-8000-000000000001", operationId = "20000000-0000-4000-8000-000000000002",
  targetId = "30000000-0000-4000-8000-000000000003", hash = "a".repeat(64);
const root = "/api/research/account-lifecycle", origin = "https://fixture.invalid";
function fixture(unready = false, mode: "self" | "admin" = "self") {
  const actor = { actorId, sessionBinding: hash, ordinary: true as const, emailConfirmed: true as const };
  const binding: LifecycleAttemptBinding = { actorId, targetId: mode === "self" ? actorId : targetId, mode, reason: mode === "self" ? "self_requested" : "privacy_request", attemptId: operationId,
    context: { policyRevision: hash, assuranceRef: hash, sessionBinding: hash, assuranceNotAfter: "2026-11-19T23:59:00Z", prepareNotAfter: "2026-11-19T23:58:00Z" } };
  const result = { ...unavailableLifecycle("legal_hold"), operationId, version: 1, state: "blocked" as const };
  const repo = { prepareSelf: vi.fn(async () => result), prepareAdmin: vi.fn(async () => result), confirmSelf: vi.fn(async () => result),
    confirmAdmin: vi.fn(async () => result), statusSelf: vi.fn(async () => result), statusAdmin: vi.fn(async () => result) };
  const verify = vi.fn(async (token: string) => token === "A" ? actor : null);
  const issue = vi.fn(async () => ({ carrier: "x".repeat(40), binding }));
  const deps: LifecycleDependencies = { origin, repository: repo, verifyOrdinary: verify, allow: async () => true,
    attempts: { issue, verify: async () => binding },
    currentAuthority: { resolve: async () => ({ assuranceRef: hash, sessionBinding: hash }) } };
  const app = express(); app.use(express.json()); registerAccountLifecycleApi(app, unready ? buildAccountLifecycleDependencies({ origin }) : deps);
  return { app, repo, verify, issue };
}

const canonicalEndpoints = [
  { method: "post", suffix: "/self/attempt", mode: "self", body: { retryKey: "synthetic_retry_01" }, handler: null },
  { method: "post", suffix: "/admin/:targetAuthUserId/:reason/attempt", mode: "admin", body: { retryKey: "synthetic_retry_01" }, handler: null },
  { method: "post", suffix: "/self/prepare", mode: "self", body: { attemptCarrier: "x".repeat(40) }, handler: "prepareSelf" },
  { method: "post", suffix: "/admin/prepare", mode: "admin", body: { attemptCarrier: "x".repeat(40) }, handler: "prepareAdmin" },
  { method: "post", suffix: "/self/confirm", mode: "self", body: { operationId, previewDigest: hash, expectedVersion: 1, confirm: true }, handler: "confirmSelf" },
  { method: "post", suffix: "/admin/confirm", mode: "admin", body: { operationId, previewDigest: hash, expectedVersion: 1, confirm: true }, handler: "confirmAdmin" },
  { method: "get", suffix: "/self/operations/:operationId", mode: "self", handler: "statusSelf" },
  { method: "get", suffix: "/admin/operations/:operationId", mode: "admin", handler: "statusAdmin" },
] as const;
function actualPath(suffix: string) {
  return root + suffix.replace(":targetAuthUserId", targetId).replace(":reason", "privacy_request").replace(":operationId", operationId);
}
describe("strict own/admin lifecycle HTTP routes without activation", () => {
  it("resolves exactly five real registration sites and eight public endpoints through the unchanged canonical collector", () => {
    const scanned = scanExpressRouteResult(fileURLToPath(new URL("../../../", import.meta.url)), ["server/research/account-lifecycle"]);
    expect(scanned.issues).toEqual([]); expect(scanned.callSites).toBe(5);
    expect(scanned.routes.map(route => `${route.method} ${route.path}`).sort())
      .toEqual(canonicalEndpoints.map(endpoint => `${endpoint.method.toUpperCase()} ${root}${endpoint.suffix}`).sort());
  });
  it.each(canonicalEndpoints)("preserves exact downstream $method $suffix and private headers", async endpoint => {
    const f = fixture(false, endpoint.mode);
    let call = request(f.app)[endpoint.method](actualPath(endpoint.suffix)).set("Authorization", "Bearer A").set("Origin", origin);
    if ("body" in endpoint) call = call.send(endpoint.body);
    const response = await call; expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store"); expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["referrer-policy"]).toBe("no-referrer"); expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
    expect(f.verify).toHaveBeenCalledExactlyOnceWith("A");
    if (endpoint.handler) expect(f.repo[endpoint.handler]).toHaveBeenCalledTimes(1); else expect(f.issue).toHaveBeenCalledTimes(1);
    for (const [name, handler] of Object.entries(f.repo)) expect(handler).toHaveBeenCalledTimes(name === endpoint.handler ? 1 : 0);
  });
  it.each(canonicalEndpoints)("keeps unauthenticated $method $suffix behind the real ordinary-session boundary", async endpoint => {
    const f = fixture(); let call = request(f.app)[endpoint.method](actualPath(endpoint.suffix)).set("Origin", origin);
    if ("body" in endpoint) call = call.send(endpoint.body);
    const response = await call; expect(response.status).toBe(401); expect(response.body.code).toBe("authentication_required");
    expect(f.verify).not.toHaveBeenCalled(); expect(f.issue).not.toHaveBeenCalled();
    for (const handler of Object.values(f.repo)) expect(handler).not.toHaveBeenCalled();
  });
  it.each(canonicalEndpoints)("preserves case-sensitive and trailing-slash denial for $method $suffix", async endpoint => {
    for (const path of [actualPath(endpoint.suffix) + "/", actualPath(endpoint.suffix).replace("/account-lifecycle/", "/Account-lifecycle/")]) {
      const f = fixture(); let call = request(f.app)[endpoint.method](path).set("Authorization", "Bearer A").set("Origin", origin);
      if ("body" in endpoint) call = call.send(endpoint.body);
      expect((await call).status).toBe(404); expect(f.verify).not.toHaveBeenCalled(); expect(f.issue).not.toHaveBeenCalled();
      for (const handler of Object.values(f.repo)) expect(handler).not.toHaveBeenCalled();
    }
  });
  it.each(["/unrelated", "/api/research/account-lifecycle-extra/ping", "/api/research/account-management/me", "/api/research/account-lifecycleish"])(
    "does not intercept or add lifecycle privacy headers to outside path %s", async path => {
      const f = fixture(); f.app.get(path, (req, res) => res.status(202).json({ ok: true, path: req.path, baseUrl: req.baseUrl }));
      const response = await request(f.app).get(path);
      expect(response.status).toBe(202); expect(response.body).toEqual({ ok: true, path, baseUrl: "" });
      for (const header of ["cache-control", "pragma", "referrer-policy", "x-robots-tag", "vary"]) expect(response.headers[header]).toBeUndefined();
      expect(f.verify).not.toHaveBeenCalled(); expect(f.issue).not.toHaveBeenCalled();
    });
  it("reports real prewrite unavailability without pretending account creation/deletion or clearing a known operation", async () => {
    const f = fixture(true), issue = await request(f.app).post(root + "/self/attempt").set("Authorization", "Bearer A").set("Origin", origin).send({ retryKey: "synthetic_retry_01" });
    expect(issue.status).toBe(503); expect(issue.body).toEqual(unavailableLifecycle("assurance_unavailable"));
    const status = await request(f.app).get(root + "/self/operations/" + operationId).set("Authorization", "Bearer A");
    expect(status.status).toBe(503); expect(status.body).toEqual({ protocol: "account-lifecycle/v1", code: "outcome_uncertain" });
    expect(status.headers["cache-control"]).toBe("private, no-store"); expect(status.headers["x-robots-tag"]).toContain("noarchive");
  });
  it("derives own target from verified bearer and keeps durable known blocked operation", async () => {
    const f = fixture(); const response = await request(f.app).post(root + "/self/prepare").set("Authorization", "Bearer A").set("Origin", origin).send({ attemptCarrier: "x".repeat(40) });
    expect(response.status).toBe(200); expect(response.body.operationId).toBe(operationId); expect(response.body.state).toBe("blocked");
    expect(f.repo.prepareSelf).toHaveBeenCalledTimes(1); expect(f.repo.prepareAdmin).not.toHaveBeenCalled();
    expect(response.headers["referrer-policy"]).toBe("no-referrer"); expect(response.headers["set-cookie"]).toBeUndefined();
  });
  it.each(["targetId", "actorId", "mode", "clear", "assuranceRef"])("refuses %s body substitution and never falls through", async field => {
    const f = fixture(), response = await request(f.app).post(root + "/self/prepare").set("Authorization", "Bearer A").set("Origin", origin)
      .send({ attemptCarrier: "x".repeat(40), [field]: actorId });
    expect(response.status).toBe(400); expect(f.repo.prepareSelf).not.toHaveBeenCalled();
  });
  it("denies self carrier at admin endpoint without inferring admin from ordinary Auth", async () => {
    const f = fixture(), response = await request(f.app).post(root + "/admin/prepare").set("Authorization", "Bearer A").set("Origin", origin).send({ attemptCarrier: "x".repeat(40) });
    expect(response.status).toBe(403); expect(f.repo.prepareAdmin).not.toHaveBeenCalled(); expect(f.repo.prepareSelf).not.toHaveBeenCalled();
  });
  it.each(["/self/prepare/", "/self/delete", "/admin/provider-outcome", "/self/withdraw", "/self/finish"])("exposes no ungranted method/action %s", async path => {
    const f = fixture(), response = await request(f.app).post(root + path).send({}); expect(response.status).toBe(404);
    expect(f.repo.prepareSelf).not.toHaveBeenCalled();
  });
});

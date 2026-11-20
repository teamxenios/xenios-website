import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerAccountLifecycleApi } from "./routes";
import { buildAccountLifecycleDependencies } from "./production";
import { unavailableLifecycle } from "@shared/research/account-lifecycle";
import type { LifecycleAttemptBinding, LifecycleDependencies } from "./service";
const actorId = "10000000-0000-4000-8000-000000000001", operationId = "20000000-0000-4000-8000-000000000002", hash = "a".repeat(64);
const root = "/api/research/account-lifecycle", origin = "https://fixture.invalid";
function fixture(unready = false) {
  const actor = { actorId, sessionBinding: hash, ordinary: true as const, emailConfirmed: true as const };
  const binding: LifecycleAttemptBinding = { actorId, targetId: actorId, mode: "self", reason: "self_requested", attemptId: operationId,
    context: { policyRevision: hash, assuranceRef: hash, sessionBinding: hash, assuranceNotAfter: "2026-11-19T23:59:00Z", prepareNotAfter: "2026-11-19T23:58:00Z" } };
  const result = { ...unavailableLifecycle("legal_hold"), operationId, version: 1, state: "blocked" as const };
  const repo = { prepareSelf: vi.fn(async () => result), prepareAdmin: vi.fn(async () => result), confirmSelf: vi.fn(async () => result),
    confirmAdmin: vi.fn(async () => result), statusSelf: vi.fn(async () => result), statusAdmin: vi.fn(async () => result) };
  const deps: LifecycleDependencies = { origin, repository: repo, verifyOrdinary: async token => token === "A" ? actor : null, allow: async () => true,
    attempts: { issue: async () => ({ carrier: "x".repeat(40), binding }), verify: async () => binding },
    currentAuthority: { resolve: async () => ({ assuranceRef: hash, sessionBinding: hash }) } };
  const app = express(); app.use(express.json()); registerAccountLifecycleApi(app, unready ? buildAccountLifecycleDependencies({ origin }) : deps);
  return { app, repo };
}
describe("strict own/admin lifecycle HTTP routes without activation", () => {
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

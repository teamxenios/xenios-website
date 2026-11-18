import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createOperationsAnalyticsRouter, OPERATIONS_ANALYTICS_PATH, type OperationsAnalyticsDependencies } from "./admin-routes";

const subject = "10000000-0000-4000-8000-000000000001";
const session = "20000000-0000-4000-8000-000000000001";
const now = Date.parse("2026-11-18T15:00:00Z");
const email = "admin@example.invalid";
function token(method = "password", overrides: object = {}) {
  return `header.${Buffer.from(JSON.stringify({ sub: subject, session_id: session, exp: now / 1000 + 60,
    amr: [{ method }], ...overrides })).toString("base64url")}.signature`;
}
const guard: RequestHandler = (req, res, next) => {
  if (!req.headers.authorization) return void res.status(401).json({ error: "sign_in_required" });
  (req as typeof req & { adminEmail: string }).adminEmail = email; next();
};
function fixture(overrides: Partial<OperationsAnalyticsDependencies> = {}) {
  const read = vi.fn(async (window: { start: string; end: string }) => ({ schemaVersion: 1 as const,
    observedAt: new Date(now).toISOString(), windowStart: window.start, windowEnd: window.end,
    sources: Object.fromEntries(["requests", "workflows", "workflowEvents", "outbox", "support"].map(key => [key,
      { state: "observed", totalRecords: 0, windowRecords: 0, latestAt: null }])) as never,
  }));
  const verifyUser = vi.fn(async () => ({ id: subject, email, email_confirmed_at: "2026-11-17T00:00:00Z" }));
  const app = express(); app.use(express.json());
  app.use(createOperationsAnalyticsRouter({ requireAdmin: guard, scope: { projectId: "configured-project", environment: "staging" },
    verifyUser, readSnapshot: read, now: () => now, ...overrides }));
  return { app, read, verifyUser };
}
const path = OPERATIONS_ANALYTICS_PATH + "?day=2026-11-18";
describe("project operations route requires canonical admin and fresh ordinary identity", () => {
  it("has no optional/permissive admin gate and does not query data for anonymous callers", async () => {
    expect(() => createOperationsAnalyticsRouter({ scope: { projectId: "configured-project", environment: "staging" } } as never)).toThrow();
    const f = fixture(); expect((await request(f.app).get(path)).status).toBe(401);
    expect(f.read).not.toHaveBeenCalled(); expect(f.verifyUser).not.toHaveBeenCalled();
    const noop = fixture({ requireAdmin: (_req, _res, next) => next() });
    expect((await request(noop.app).get(path).set("Authorization", "Bearer " + token())).status).toBe(401);
    expect(noop.read).not.toHaveBeenCalled();
  });
  it.each(["otp", "magiclink", "recovery", "totp", "anonymous"])("denies %s purpose before the source read", async method => {
    const f = fixture(); const result = await request(f.app).get(path).set("Authorization", "Bearer " + token(method));
    expect(result.status).toBe(403); expect(f.read).not.toHaveBeenCalled();
  });
  it("denies absent AMR, stale/foreign session bindings and unconfirmed/mismatched admin identities", async () => {
    for (const claims of [{ amr: undefined }, { session_id: undefined }, { sub: session }, { exp: now / 1000 - 1 }]) {
      const f = fixture(); expect((await request(f.app).get(path).set("Authorization", "Bearer " + token("password", claims))).status).toBeGreaterThanOrEqual(400);
      expect(f.read).not.toHaveBeenCalled();
    }
    for (const user of [{ id: subject, email }, { id: subject, email: "other@example.invalid", email_confirmed_at: "2026-11-17T00:00:00Z" }, null]) {
      const f = fixture({ verifyUser: async () => user });
      expect((await request(f.app).get(path).set("Authorization", "Bearer " + token())).status).toBeGreaterThanOrEqual(400);
      expect(f.read).not.toHaveBeenCalled();
    }
  });
  it("returns only aggregate metrics in configured project scope, never identity or raw source rows", async () => {
    const f = fixture(); const result = await request(f.app).get(path).set("Authorization", "Bearer " + token());
    expect(result.status).toBe(200); expect(result.body).toHaveLength(12);
    expect(result.body.every((row: { scope: string; value: unknown }) => row.scope === "authorized_project" && row.value === null)).toBe(true);
    expect(result.headers["cache-control"]).toContain("no-store");
    expect(JSON.stringify(result.body)).not.toMatch(/admin@example|10000000|20000000|"(?:access_token|contact|recipient|id|actor)"\s*:/);
    expect(f.read).toHaveBeenCalledWith({ start: "2026-11-18T06:00:00.000Z", end: "2026-11-19T06:00:00.000Z" });
  });
  it.each(["tenant=foreign", "projectId=foreign", "actor=foreign", "day=2026-11-19", "responsePopulation=buyer", "responseChannel=sms"])("rejects client hints or malformed selectors: %s", async query => {
    const f = fixture(); const result = await request(f.app).get(path + "&" + query).set("Authorization", "Bearer " + token());
    expect(result.status).toBe(400); expect(f.read).not.toHaveBeenCalled();
  });
  it("does not expose upstream errors, fabricate success on failed reads, or accept a scope header", async () => {
    const f = fixture({ readSnapshot: async () => { throw new Error("PRIVATE SQL AND CONTACT"); } });
    const result = await request(f.app).get(path).set("Authorization", "Bearer " + token());
    expect(result.status).toBe(503); expect(result.body).toEqual({ error: "analytics_unavailable" });
    const header = fixture();
    expect((await request(header.app).get(path).set("Authorization", "Bearer " + token()).set("X-Tenant-Id", "foreign")).status).toBe(400);
    expect(header.read).not.toHaveBeenCalled();
  });
});

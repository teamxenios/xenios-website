import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createCareProductionDependencies, type CareProductionAdapters } from "../../../care/production-deps";
import { canReadPendingRequestIntent, requirePendingRequestIntentRead, REQUEST_INTENT_PENDING_READ_PURPOSE } from "./staff-read-authority";

const actor = "10000000-0000-4000-8000-000000000001";
function fixture(overrides: Partial<CareProductionAdapters> = {}, enabled = true) {
  const adapters: CareProductionAdapters = {
    authenticate: vi.fn(async (token) => token === "verified-synthetic" ? { id: actor } : null),
    loadActiveRoles: vi.fn(async () => ["clinical_admin"]),
    loadPatientId: vi.fn(async () => null),
    loadCapability: vi.fn(async () => ({ state: "disabled", approved_by: null, approved_at: null })),
    writeAccessAudit: vi.fn(async () => undefined),
    ...overrides,
  };
  // Real canonical principal resolver, synthetic provider adapter only.
  // This does not establish live auth, role assignment or SQL approval.
  const care = createCareProductionDependencies(adapters, { CARE_ENABLED: "false", CARE_ENABLE_APPROVED: "false" });
  const next = vi.fn();
  const app = express();
  app.get("/pending", requirePendingRequestIntentRead(care, () => enabled), (_req, res) => {
    next();
    res.json({ actor: res.locals.requestIntentStaffPrincipal.subjectId,
      purpose: res.locals.requestIntentStaffReadContext.purpose });
  });
  return { app, adapters, next };
}
describe("proposed pending-intake read guard, separate from Care activation", () => {
  it("uses canonical verified identity and active role while whole Care remains disabled", async () => {
    const f = fixture();
    const result = await request(f.app).get("/pending").set("Authorization", "Bearer verified-synthetic");
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ actor, purpose: REQUEST_INTENT_PENDING_READ_PURPOSE });
    expect(f.adapters.authenticate).toHaveBeenCalledWith("verified-synthetic");
    expect(f.adapters.loadActiveRoles).toHaveBeenCalledWith(actor);
    expect(f.adapters.loadCapability).not.toHaveBeenCalled();
    expect(f.adapters.writeAccessAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorSubjectId: actor, permission: "care:administer", outcome: "allowed",
    }));
    expect(f.next).toHaveBeenCalledOnce();
  });
  it("stays unavailable before identity lookup when the independent scope is disabled", async () => {
    const f = fixture({}, false);
    expect((await request(f.app).get("/pending").set("Authorization", "Bearer verified-synthetic")).status).toBe(503);
    expect(f.adapters.authenticate).not.toHaveBeenCalled(); expect(f.next).not.toHaveBeenCalled();
  });
  it("denies missing, expired or unverified sessions instead of trusting supplied actor or email", async () => {
    const f = fixture();
    for (const token of ["", "expired-synthetic", "unverified-synthetic"]) {
      const query = request(f.app).get("/pending?actor=" + actor + "&email=synthetic@example.invalid");
      if (token) query.set("Authorization", "Bearer " + token);
      expect((await query).status).toBe(401);
    }
    expect(f.adapters.loadActiveRoles).not.toHaveBeenCalled(); expect(f.next).not.toHaveBeenCalled();
  });
  it("rejects provider-verified recovery-purpose sessions before role resolution", async () => {
    const token = [Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
      Buffer.from(JSON.stringify({ amr: ["otp"] })).toString("base64url"), "synthetic"].join(".");
    const f = fixture({ authenticate: vi.fn(async () => ({ id: actor })) });
    expect((await request(f.app).get("/pending").set("Authorization", "Bearer " + token)).status).toBe(401);
    expect(f.adapters.loadActiveRoles).not.toHaveBeenCalled(); expect(f.next).not.toHaveBeenCalled();
  });
  it("denies general admin, other Care roles, absent or revoked assignments", async () => {
    for (const roles of [[], ["research_admin"], ["affiliate"], ["clinician"], ["care_security_admin"], ["clinical_support"], ["pharmacy_operations"]]) {
      const f = fixture({ loadActiveRoles: vi.fn(async () => roles) });
      expect((await request(f.app).get("/pending").set("Authorization", "Bearer verified-synthetic")).status).toBe(403);
      expect(f.next).not.toHaveBeenCalled();
      expect(f.adapters.writeAccessAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "forbidden" }));
    }
    // Revoked roles are excluded by the existing production adapter query.
    // The disposable-DB qualification must independently prove revocation there.
  });
  it("fails closed on identity, role, patient-index or durable-audit failures", async () => {
    for (const key of ["authenticate", "loadActiveRoles", "loadPatientId", "writeAccessAudit"] as const) {
      const f = fixture({ [key]: vi.fn(async () => { throw new Error("private adapter diagnostic"); }) });
      const result = await request(f.app).get("/pending").set("Authorization", "Bearer verified-synthetic");
      expect(result.status).toBe(503); expect(JSON.stringify(result.body)).not.toContain("diagnostic");
      expect(f.next).not.toHaveBeenCalled();
    }
  });
  it("rejects missing, disabled, wrong-purpose or cross-actor runtime contexts", () => {
    const principal = { subjectId: actor, roles: ["clinical_admin" as const] };
    const context = { purpose: REQUEST_INTENT_PENDING_READ_PURPOSE, actorSubjectId: actor, enabled: true } as const;
    expect(canReadPendingRequestIntent(principal, context)).toBe(true);
    expect(canReadPendingRequestIntent(null, context)).toBe(false);
    expect(canReadPendingRequestIntent(principal, null)).toBe(false);
    expect(canReadPendingRequestIntent(principal, { ...context, enabled: false })).toBe(false);
    expect(canReadPendingRequestIntent(principal, { ...context, actorSubjectId: "another-actor" })).toBe(false);
    expect(canReadPendingRequestIntent(principal, { ...context, purpose: "care" as typeof context.purpose })).toBe(false);
  });
});

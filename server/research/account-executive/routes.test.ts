import express, { type Request } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerAeWorkspaceRoutes, createAeVerifiedSessionResolver, AE_WORKSPACE_API_BASE } from "./routes";
import { createAeWorkspaceService } from "./workspace";
import { createAeCanonicalAdapter } from "./canonical-adapter";
import { createAeIdentityBinding } from "./identity-binding";

const id = "90000000-0000-4000-8000-000000000001", sid = "90000000-0000-4000-8000-000000000002";
const origin = "https://ae.example.invalid", now = Date.parse("2026-11-18T22:00:00.000Z");
function token(amr: string[] = ["password"], extra: Record<string, unknown> = {}) {
  return "fixture." + Buffer.from(JSON.stringify({ sub: id, session_id: sid, exp: now / 1000 + 600, aal: "aal2", amr, ...extra })).toString("base64url") + ".verified";
}
function fixture() {
  const auth = { authenticate: vi.fn(async (): Promise<{ id: string } | null> => ({ id })),
    currentAssurance: vi.fn(async (): Promise<"aal1" | "aal2" | null> => "aal2") };
  const resolve = createAeVerifiedSessionResolver(auth, true, () => now);
  const rpc = vi.fn(async (_name?: string, _args?: Record<string, unknown>): Promise<{ data: unknown; error: { code: string } | null }> =>
    ({ data: null, error: { code: "42501" } }));
  const rateLimit = vi.fn(async () => true), original = vi.fn(async () => null);
  const app = express();
  const deps = { service: createAeWorkspaceService(createAeCanonicalAdapter({ rpc }, id)), identity: createAeIdentityBinding({ rpc }, id),
    origin, enabled: () => true, resolveSession: resolve, resolveOriginalGuestProof: original, rateLimit };
  registerAeWorkspaceRoutes(app, deps);
  return { app, auth, rpc, original, rateLimit };
}
describe("AE route boundary and canonical verified session", () => {
  it("verifies Auth before trusting JWT subject/session, and requires actual current MFA", async () => {
    const f = fixture(), req = { headers: { authorization: "Bearer " + token() } } as Request;
    const resolve = createAeVerifiedSessionResolver(f.auth, true, () => now);
    expect(await resolve(req)).toEqual({ authUserId: id, sessionId: sid, purpose: "ordinary" });
    expect(f.auth.authenticate).toHaveBeenCalledWith(token());
    f.auth.currentAssurance.mockResolvedValueOnce("aal1");
    expect(await resolve(req)).toBeNull();
    f.auth.authenticate.mockResolvedValueOnce(null);
    expect(await resolve(req)).toBeNull();
    expect(await resolve({ headers: { authorization: "Bearer " + token(["password"], { sub: sid }) } } as Request)).toBeNull();
    expect(await resolve({ headers: { authorization: "Bearer " + token(["password"], { exp: now / 1000 - 1 }) } } as Request)).toBeNull();
  });
  it("blocks recovery before backend, rate limiter or guest-custodian access", async () => {
    const f = fixture();
    const response = await request(f.app).get(AE_WORKSPACE_API_BASE + "/workspace").set("Authorization", "Bearer " + token(["password", "recovery", "mfa/totp"]));
    expect(response.status).toBe(403); expect(response.body).toEqual({ ok: false, code: "access_denied" });
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.rateLimit).not.toHaveBeenCalled(); expect(f.original).not.toHaveBeenCalled();
    expect(response.headers["cache-control"]).toContain("no-store");
  });
  it("rejects mutation origin and authority injection without reaching durable writes", async () => {
    const f = fixture(), cmd = { commandId: id, customerAuthUserId: sid, assigneeAuthUserId: id };
    const cross = await request(f.app).post(AE_WORKSPACE_API_BASE + "/assignments").set("Origin", "https://other.invalid").send(cmd);
    expect(cross.status).toBe(403); expect(f.auth.authenticate).not.toHaveBeenCalled();
    const injected = await request(f.app).post(AE_WORKSPACE_API_BASE + "/assignments").set("Origin", origin)
      .set("Authorization", "Bearer " + token()).send({ ...cmd, actorAuthUserId: id });
    expect(injected.status).toBe(400); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("does not accept guest proof or customer identity in the public claim body", async () => {
    const f = fixture();
    const response = await request(f.app).post(AE_WORKSPACE_API_BASE + "/identity-claims").set("Origin", origin)
      .set("Authorization", "Bearer " + token()).send({ commandId: id, requestId: sid, guestSessionHash: "f".repeat(64) });
    expect(response.status).toBe(400); expect(f.original).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("maps durable denials to private generic responses and enforces the Root rate limiter", async () => {
    const f = fixture();
    expect((await request(f.app).get(AE_WORKSPACE_API_BASE + "/workspace").set("Authorization", "Bearer " + token())).body)
      .toEqual({ ok: false, code: "access_denied" });
    f.rateLimit.mockResolvedValueOnce(false);
    const limited = await request(f.app).get(AE_WORKSPACE_API_BASE + "/workspace").set("Authorization", "Bearer " + token());
    expect(limited.status).toBe(429); expect(limited.body).toEqual({ ok: false, code: "unavailable" });
  });
  it.each(["complete_followup", "reschedule_followup"] as const)("uses the existing authenticated command route for %s with strict input and current MFA", async kind => {
    const f = fixture(), task = "90000000-0000-4000-8000-000000000003";
    const command = { kind, commandId: task, assignmentId: task, customerAuthUserId: sid, expectedRevision: 3, followupId: task,
      ...(kind === "reschedule_followup" ? { dueAt: "2026-11-21T12:00:00.000Z" } : {}) };
    const authority = { actorAuthUserId: id, scopeId: id, grantId: sid, grantRevision: 1, active: true,
      validFrom: "2000-01-01T00:00:00.000Z", validUntil: "2099-01-01T00:00:00.000Z", capabilities: ["followup:manage"] };
    const assignment = { id: task, scopeId: id, customerAuthUserId: sid, assigneeAuthUserId: id, revision: 3 };
    f.rpc.mockImplementation(async name => ({ error: null, data: name === "ae_workspace_authorize"
      ? { authority, assignment, openFollowupIds: [task] }
      : { authority, receipt: { commandId: task, replay: false, assignment: { ...assignment, revision: 4 }, followupTransfers: [],
        followup: { id: task, assignmentId: task, customerAuthUserId: sid, ownerAuthUserId: id, purpose: "contact_customer",
          dueAt: command.dueAt ?? "2026-11-20T12:00:00.000Z", state: kind === "complete_followup" ? "completed" : "open",
          createdAt: "2026-11-18T12:00:00.000Z" },
        audit: { id: task, commandId: task, actorAuthUserId: id, assignmentId: task, customerAuthUserId: sid,
          kind: kind === "complete_followup" ? "followup_completed" : "followup_rescheduled", occurredAt: new Date().toISOString() } } } }));
    const send = (body: unknown, bearer = token()) => request(f.app).post(AE_WORKSPACE_API_BASE + "/commands")
      .set("Origin", origin).set("Authorization", "Bearer " + bearer).send(body);
    expect((await send({ ...command, actorAuthUserId: id })).status).toBe(400);
    expect((await send({ ...command, scopeId: id })).status).toBe(400);
    expect((await send({ ...command, note: "PRIVATE_CLINICAL_SENTINEL" })).status).toBe(400);
    expect((await send(command, token(["password", "recovery", "mfa/totp"]))).status).toBe(403);
    f.auth.currentAssurance.mockResolvedValueOnce("aal1");
    expect((await send(command)).status).toBe(401);
    expect(f.rpc).not.toHaveBeenCalled();
    const result = await send(command);
    expect(result.status).toBe(200); expect(result.body).toMatchObject({ ok: true, value: {
      assignment: { revision: 4 }, followup: { id: task, state: kind === "complete_followup" ? "completed" : "open" },
    } });
    expect(f.rpc).toHaveBeenCalledWith("ae_workspace_authorize", expect.objectContaining({
      p_actor_user_id: id, p_session_id: sid, p_scope_id: id, p_capability: "followup:manage",
    }));
    expect(f.rpc).toHaveBeenCalledWith("ae_workspace_command", expect.objectContaining({ p_command: command }));
    expect(result.headers["cache-control"]).toContain("no-store");
  });
});

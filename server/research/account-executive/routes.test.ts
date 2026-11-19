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
  const rpc = vi.fn(async () => ({ data: null, error: { code: "42501" } }));
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
});

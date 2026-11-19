import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createAeProductionBoundary, type AeProductionInput } from "./production";
import { AE_WORKSPACE_API_BASE } from "./routes";

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1), scope = id(3), session = id(4), origin = "https://ae-production.example.invalid";
function token(extra: Record<string, unknown> = {}) {
  return "fixture." + Buffer.from(JSON.stringify({ sub: actor, session_id: session, exp: Date.now() / 1000 + 600,
    amr: ["password"], aal: "aal2", ...extra })).toString("base64url") + ".verified-by-injected-auth";
}
function fixture() {
  const auth = { authenticate: vi.fn(async (_token: string): Promise<{ id: string } | null> => ({ id: actor })),
    currentAssurance: vi.fn(async (_token: string): Promise<"aal1" | "aal2" | null> => "aal2") };
  const rpc = { rpc: vi.fn(async (_name: string, _args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string } | null }> => ({
    data: { authority: { actorAuthUserId: actor, scopeId: scope, grantId: id(5), grantRevision: 1, active: true,
      validFrom: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 3_600_000).toISOString(),
      capabilities: ["workspace:read"] }, completeness: "complete", customers: [] }, error: null,
  })) };
  const durableRateLimit = vi.fn(async () => true);
  const proof = { customerRef: "eac_" + "a".repeat(32), sessionHash: "b".repeat(64), expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const resolveOriginalGuestProof = vi.fn(async () => proof);
  const input: AeProductionInput = { config: { enabled: true, operationalScopeId: scope, siteOrigin: origin },
    auth, rpc, durableRateLimit, resolveOriginalGuestProof };
  const appFor = (overrides: Partial<AeProductionInput> = {}) => {
    const app = express(), boundary = createAeProductionBoundary({ ...input, ...overrides });
    const registered = boundary.register(app);
    return { app, boundary, registered };
  };
  return { input, auth, rpc, durableRateLimit, proof, resolveOriginalGuestProof, appFor };
}
describe("AE production dependency boundary", () => {
  it("defaults off without mounting routes or touching injected providers, including after input mutation", async () => {
    const f = fixture(), config = { operationalScopeId: scope, siteOrigin: origin, enabled: false };
    const { app, boundary, registered } = f.appFor({ config });
    config.enabled = true;
    expect(boundary.state).toBe("disabled"); expect(registered).toBe(false);
    expect(createAeProductionBoundary().state).toBe("disabled");
    expect((await request(app).get(AE_WORKSPACE_API_BASE + "/workspace")).status).toBe(404);
    expect(f.auth.authenticate).not.toHaveBeenCalled(); expect(f.rpc.rpc).not.toHaveBeenCalled(); expect(f.durableRateLimit).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { enabled: "true", operationalScopeId: scope, siteOrigin: origin },
    { enabled: true, operationalScopeId: "not-a-scope", siteOrigin: origin },
    { enabled: true, operationalScopeId: "00000000-0000-0000-0000-000000000000", siteOrigin: origin },
    { enabled: true, operationalScopeId: scope, siteOrigin: "http://ae-production.example.invalid" },
    { enabled: true, operationalScopeId: scope, siteOrigin: origin + "/research" },
    { enabled: true, operationalScopeId: scope, siteOrigin: "https://secret@example.invalid" },
    { enabled: true, operationalScopeId: scope, siteOrigin: origin + "?scope=other" },
    { enabled: true, operationalScopeId: scope, siteOrigin: origin, ADMIN_EMAIL: "not-authority@example.invalid" },
  ])("refuses malformed or non-origin Root configuration without a permissive fallback: %j", async config => {
    const f = fixture(), { app, boundary, registered } = f.appFor({ config });
    expect(boundary.state).toBe("unavailable"); expect(registered).toBe(false);
    expect((await request(app).get(AE_WORKSPACE_API_BASE + "/workspace")).status).toBe(404);
    expect(f.rpc.rpc).not.toHaveBeenCalled(); expect(f.auth.authenticate).not.toHaveBeenCalled();
    expect(JSON.stringify(boundary.problems)).not.toContain("secret");
  });
  it.each(["auth", "rpc", "durableRateLimit"] as const)("does not mount when required %s is absent", key => {
    const f = fixture(), { boundary, registered } = f.appFor({ [key]: null });
    expect(boundary.state).toBe("unavailable"); expect(registered).toBe(false);
    expect(f.rpc.rpc).not.toHaveBeenCalled();
  });
  it("uses the real adapter/service and verified session on each read, so a fresh revocation is observed", async () => {
    const f = fixture(), { app, boundary } = f.appFor();
    expect(boundary.state).toBe("ready");
    const bearer = token();
    const first = await request(app).get(AE_WORKSPACE_API_BASE + "/workspace").set("Authorization", "Bearer " + bearer);
    expect(first.status).toBe(200); expect(first.body.value.customers).toEqual([]);
    expect(f.auth.authenticate).toHaveBeenCalledWith(bearer); expect(f.auth.currentAssurance).toHaveBeenCalledWith(bearer);
    expect(f.rpc.rpc).toHaveBeenCalledWith("ae_workspace_read", { p_actor_user_id: actor, p_session_id: session, p_scope_id: scope });
    f.rpc.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    const revoked = await request(app).get(AE_WORKSPACE_API_BASE + "/workspace").set("Authorization", "Bearer " + token());
    expect(revoked.status).toBe(403); expect(revoked.body).toEqual({ ok: false, code: "access_denied" });
    expect(f.rpc.rpc).toHaveBeenCalledTimes(2); expect(f.auth.authenticate).toHaveBeenCalledTimes(2);
    expect(revoked.headers["cache-control"]).toContain("no-store");
  });
  it("rejects recovery AMR before the durable limiter, proof provider or authority RPC", async () => {
    const f = fixture(), { app } = f.appFor();
    const response = await request(app).get(AE_WORKSPACE_API_BASE + "/workspace")
      .set("Authorization", "Bearer " + token({ amr: ["password", "recovery", "mfa/totp"] }));
    expect(response.status).toBe(403); expect(f.durableRateLimit).not.toHaveBeenCalled();
    expect(f.resolveOriginalGuestProof).not.toHaveBeenCalled(); expect(f.rpc.rpc).not.toHaveBeenCalled();
  });
  it("requires current MFA for staff even if the verified JWT claims aal2", async () => {
    const f = fixture(), { app } = f.appFor(); f.auth.currentAssurance.mockResolvedValueOnce("aal1");
    const response = await request(app).get(AE_WORKSPACE_API_BASE + "/workspace").set("Authorization", "Bearer " + token());
    expect(response.status).toBe(401); expect(f.durableRateLimit).not.toHaveBeenCalled(); expect(f.rpc.rpc).not.toHaveBeenCalled();
  });
  it.each(["denied", "failed"])("never falls back after the durable limiter is %s", async state => {
    const f = fixture(), { app } = f.appFor();
    if (state === "denied") f.durableRateLimit.mockResolvedValueOnce(false);
    else f.durableRateLimit.mockRejectedValueOnce(new Error("PRIVATE_LIMITER_DIAGNOSTIC"));
    const response = await request(app).get(AE_WORKSPACE_API_BASE + "/workspace").set("Authorization", "Bearer " + token());
    expect(response.status).toBe(state === "denied" ? 429 : 503);
    expect(response.body).toEqual({ ok: false, code: "unavailable" }); expect(f.rpc.rpc).not.toHaveBeenCalled();
  });
  it.each(["auth", "rpc"])("contains %s provider failures without reflecting diagnostics", async provider => {
    const f = fixture(), { app } = f.appFor();
    if (provider === "auth") f.auth.authenticate.mockRejectedValueOnce(new Error("PRIVATE_PROVIDER_SECRET"));
    else f.rpc.rpc.mockResolvedValueOnce({ data: null, error: { code: "08006" } });
    const response = await request(app).get(AE_WORKSPACE_API_BASE + "/workspace").set("Authorization", "Bearer " + token());
    expect(response.status).toBe(503); expect(response.body).toEqual({ ok: false, code: "unavailable" });
    expect(JSON.stringify(response.body)).not.toContain("PRIVATE_");
  });
  it("keeps staff available but claims unavailable when the original-guest custodian is absent", async () => {
    const f = fixture(), { app, boundary } = f.appFor({ resolveOriginalGuestProof: null });
    expect(boundary.state).toBe("ready"); expect(boundary.claimState).toBe("unavailable");
    expect((await request(app).get(AE_WORKSPACE_API_BASE + "/workspace").set("Authorization", "Bearer " + token())).status).toBe(200);
    f.auth.currentAssurance.mockClear(); f.rpc.rpc.mockClear();
    const response = await request(app).post(AE_WORKSPACE_API_BASE + "/identity-claims").set("Origin", origin)
      .set("Authorization", "Bearer " + token({ aal: "aal1" })).send({ commandId: id(7), requestId: id(8) });
    expect(response.status).toBe(503); expect(f.auth.currentAssurance).not.toHaveBeenCalled();
    expect(f.rpc.rpc).not.toHaveBeenCalled(); expect(f.resolveOriginalGuestProof).not.toHaveBeenCalled();
  });
  it("refuses a failing original-guest proof provider without trying a member-hash fallback", async () => {
    const f = fixture(), { app } = f.appFor();
    f.resolveOriginalGuestProof.mockRejectedValueOnce(new Error("PRIVATE_GUEST_PROOF_DIAGNOSTIC"));
    const response = await request(app).post(AE_WORKSPACE_API_BASE + "/identity-claims").set("Origin", origin)
      .set("Authorization", "Bearer " + token({ aal: "aal1" })).send({ commandId: id(7), requestId: id(8) });
    expect(response.status).toBe(503); expect(response.body).toEqual({ ok: false, code: "unavailable" });
    expect(f.rpc.rpc).not.toHaveBeenCalled();
  });
  it("passes only server-derived original guest proof through the existing identity custodian in ordinary claim mode", async () => {
    const f = fixture(), { app } = f.appFor();
    f.rpc.rpc.mockResolvedValueOnce({ data: { requestId: id(8), claimId: id(9), replay: false }, error: null });
    const response = await request(app).post(AE_WORKSPACE_API_BASE + "/identity-claims").set("Origin", origin)
      .set("Authorization", "Bearer " + token({ aal: "aal1" })).send({ commandId: id(7), requestId: id(8) });
    expect(response.status).toBe(200); expect(f.auth.currentAssurance).not.toHaveBeenCalled();
    expect(f.resolveOriginalGuestProof).toHaveBeenCalledWith(expect.anything(), { authUserId: actor, sessionId: session, purpose: "ordinary" });
    expect(f.rpc.rpc).toHaveBeenCalledWith("ae_workspace_claim", { p_actor_user_id: actor, p_session_id: session, p_scope_id: scope,
      p_command: { commandId: id(7), requestId: id(8) }, p_guest_ref: f.proof.customerRef,
      p_guest_session_hash: f.proof.sessionHash, p_guest_expires_at: f.proof.expiresAt });
    expect(JSON.stringify(response.body)).not.toMatch(/sessionHash|customerRef|ownerHash/);
  });
});

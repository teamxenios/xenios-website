import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AE_APPLICATION_CONTEXT_PATH, aeContextEnvelopeSchema } from "../../../shared/research/account-executive/context";
import { createAeApplicationBoundary, type AeApplicationInput } from "./application";
import { AE_WORKSPACE_API_BASE } from "./routes";

const id = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1), session = id(2), scope = id(3);
const prodOrigin = "https://xeniostechnology.com", stageOrigin = "https://xenios-research-staging.onrender.com";
const productionEnv = {
  RESEARCH_AE_WORKSPACE_ENABLED: "true", RESEARCH_AE_OPERATIONAL_SCOPE_ID: scope,
  RENDER: "true", RENDER_SERVICE_ID: "srv-d8s9vej7uimc7384dfcg", IS_PULL_REQUEST: "false",
  SUPABASE_URL: "https://yvzeduaxbwgcwllhywff.supabase.co", SITE_URL: prodOrigin,
};
const stagingEnv = {
  ...productionEnv, RENDER_SERVICE_ID: "srv-d9h4f4m7r5hc73ctjng0",
  SUPABASE_URL: "https://srcphrgnxreqyirkitxd.supabase.co", SITE_URL: stageOrigin, RENDER_EXTERNAL_URL: stageOrigin,
};
function token(extra: Record<string, unknown> = {}) {
  return "fixture." + Buffer.from(JSON.stringify({ sub: actor, session_id: session, exp: Date.now() / 1000 + 600,
    amr: ["password"], aal: "aal2", ...extra })).toString("base64url") + ".injected-auth-verifies";
}
function fixture() {
  const auth = { authenticate: vi.fn(async (_token: string): Promise<{ id: string } | null> => ({ id: actor })),
    currentAssurance: vi.fn(async (_token: string): Promise<"aal1" | "aal2" | null> => "aal2") };
  const authority = { actorAuthUserId: actor, scopeId: scope, grantId: id(4), grantRevision: 1, active: true,
    validFrom: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 3_600_000).toISOString(),
    capabilities: ["workspace:read"] };
  const rpc = { rpc: vi.fn(async (name: string, _args: Record<string, unknown>): Promise<{
    data: unknown; error: { code?: string } | null;
  }> => name === "ae_workspace_read" ? { data: { authority, completeness: "complete", customers: [] }, error: null }
    : { data: null, error: { code: "42501" } }) };
  const durableRateLimit = vi.fn(async () => true);
  const proof = { customerRef: "eac_" + "a".repeat(32), sessionHash: "b".repeat(64), expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const resolveOriginalGuestProof = vi.fn(async () => proof);
  const input: AeApplicationInput = { env: { ...productionEnv }, auth, rpc, durableRateLimit, resolveOriginalGuestProof };
  const appFor = (overrides: Partial<AeApplicationInput> = {}) => {
    const app = express(), boundary = createAeApplicationBoundary({ ...input, ...overrides });
    const registered = boundary.register(app);
    return { app, boundary, registered };
  };
  return { input, auth, rpc, durableRateLimit, resolveOriginalGuestProof, proof, appFor };
}
function expectPrivate(headers: Record<string, string>) {
  expect(headers["cache-control"]).toBe("private, no-store"); expect(headers.pragma).toBe("no-cache");
  expect(headers["x-robots-tag"]).toBe("noindex"); expect(headers["referrer-policy"]).toBe("no-referrer");
}

describe("AE application boundary over frozen canonical production composition", () => {
  it.each([undefined, "false", "TRUE", "1", ""])("defaults off unless the exact enable flag is true: %j", async flag => {
    const f = fixture(), { app, boundary, registered } = f.appFor({ env: { ...productionEnv, RESEARCH_AE_WORKSPACE_ENABLED: flag } });
    expect(boundary.state).toBe("disabled"); expect(registered).toBe(false);
    expect(createAeApplicationBoundary().state).toBe("disabled");
    expect((await request(app).get(AE_APPLICATION_CONTEXT_PATH)).status).toBe(404);
    expect((await request(app).get(AE_WORKSPACE_API_BASE + "/workspace")).status).toBe(404);
    expect(f.auth.authenticate).not.toHaveBeenCalled(); expect(f.rpc.rpc).not.toHaveBeenCalled(); expect(f.durableRateLimit).not.toHaveBeenCalled();
  });
  it.each([
    { RENDER: undefined }, { RENDER: "false" }, { IS_PULL_REQUEST: "true" }, { IS_PULL_REQUEST: "TRUE" },
    { RENDER_SERVICE_ID: "srv-preview" }, { SUPABASE_URL: stagingEnv.SUPABASE_URL },
    { SUPABASE_URL: productionEnv.SUPABASE_URL + "/foreign" },
    { SITE_URL: stageOrigin }, { SITE_URL: prodOrigin + "/research" },
    { SITE_URL: "http://xeniostechnology.com" }, { SITE_URL: prodOrigin + "?scope=other" },
    { SITE_URL: "https://private@xeniostechnology.com" }, { SITE_URL: "https://xeniostechnology.com.foreign.invalid" },
  ])("does not register any routes for foreign, malformed, mixed or preview runtime: %j", async delta => {
    const f = fixture(), { app, boundary, registered } = f.appFor({ env: { ...productionEnv, ...delta } });
    expect(boundary.state).toBe("unavailable"); expect(registered).toBe(false);
    expect((await request(app).get(AE_APPLICATION_CONTEXT_PATH)).status).toBe(404);
    expect((await request(app).get(AE_WORKSPACE_API_BASE + "/workspace")).status).toBe(404);
    expect(f.auth.authenticate).not.toHaveBeenCalled(); expect(f.rpc.rpc).not.toHaveBeenCalled();
    expect(JSON.stringify(boundary.problems)).not.toContain("private@");
  });
  it("refuses a PR-number marker despite a copied valid runtime, false pull-request flag and complete dependencies", async () => {
    const f = fixture(), { app, boundary, registered } = f.appFor({ env: { ...productionEnv, IS_PULL_REQUEST: "false", RENDER_PR_NUMBER: "42" } });
    expect(boundary.state).toBe("unavailable"); expect(boundary.problems).toEqual(["runtime_not_allowed"]);
    expect(registered).toBe(false);
    expect((await request(app).get(AE_APPLICATION_CONTEXT_PATH)).status).toBe(404);
    expect((await request(app).get(AE_WORKSPACE_API_BASE + "/workspace")).status).toBe(404);
    expect(f.auth.authenticate).not.toHaveBeenCalled(); expect(f.auth.currentAssurance).not.toHaveBeenCalled();
    expect(f.rpc.rpc).not.toHaveBeenCalled(); expect(f.durableRateLimit).not.toHaveBeenCalled();
    expect(f.resolveOriginalGuestProof).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "not-a-uuid", "00000000-0000-0000-0000-000000000000"])("requires a server-selected nonzero scope before mounting: %j", async selected => {
    const f = fixture(), { app, boundary, registered } = f.appFor({ env: { ...productionEnv, RESEARCH_AE_OPERATIONAL_SCOPE_ID: selected } });
    expect(boundary.state).toBe("unavailable"); expect(registered).toBe(false);
    expect((await request(app).get(AE_APPLICATION_CONTEXT_PATH).query({ scopeId: scope })).status).toBe(404);
    expect(f.rpc.rpc).not.toHaveBeenCalled();
  });
  it.each(["auth", "rpc", "durableRateLimit"] as const)("has no fallback when critical %s is absent", async key => {
    const f = fixture(), { app, boundary, registered } = f.appFor({ [key]: null });
    expect(boundary.state).toBe("unavailable"); expect(registered).toBe(false);
    expect((await request(app).get(AE_APPLICATION_CONTEXT_PATH)).status).toBe(404);
    expect(f.auth.authenticate).not.toHaveBeenCalled();
  });
  it("accepts only the exact staging tuple, including its external origin", async () => {
    const f = fixture(), good = f.appFor({ env: stagingEnv });
    expect(good.boundary.state).toBe("ready");
    expect((await request(good.app).get(AE_APPLICATION_CONTEXT_PATH).set("Authorization", "Bearer " + token())).body)
      .toEqual({ ok: true, value: { scopeId: scope } });
    for (const external of [undefined, prodOrigin, "https://xenios-research-staging-pr-9.onrender.com"]) {
      const bad = f.appFor({ env: { ...stagingEnv, RENDER_EXTERNAL_URL: external } });
      expect(bad.boundary.state).toBe("unavailable"); expect(bad.registered).toBe(false);
    }
  });
  it("only registers explicitly, snapshots configuration and returns partition metadata without consulting grants or customer RPCs", async () => {
    const f = fixture(), env = { ...productionEnv }, input = { ...f.input, env };
    const boundary = createAeApplicationBoundary(input), app = express(), bearer = token();
    expect((await request(app).get(AE_APPLICATION_CONTEXT_PATH)).status).toBe(404);
    expect(f.auth.authenticate).not.toHaveBeenCalled(); expect(f.durableRateLimit).not.toHaveBeenCalled();
    env.RESEARCH_AE_OPERATIONAL_SCOPE_ID = id(99); env.SITE_URL = "https://foreign.invalid";
    input.durableRateLimit = async () => { throw new Error("replacement must not be used"); };
    expect(boundary.register(app)).toBe(true);
    const response = await request(app).get(AE_APPLICATION_CONTEXT_PATH).set("Authorization", "Bearer " + bearer);
    expect(response.status).toBe(200); expect(response.body).toEqual({ ok: true, value: { scopeId: scope } });
    expect(aeContextEnvelopeSchema.parse(response.body)).toEqual(response.body); expectPrivate(response.headers);
    expect(f.auth.authenticate).toHaveBeenCalledWith(bearer); expect(f.auth.currentAssurance).toHaveBeenCalledWith(bearer);
    expect(f.durableRateLimit).toHaveBeenCalledWith(expect.anything(), actor);
    expect(f.rpc.rpc).not.toHaveBeenCalled(); expect(f.resolveOriginalGuestProof).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toMatch(/capabilities|grant|role|permission|customers|session|ownerHash/);
    expect((await request(app).post(AE_APPLICATION_CONTEXT_PATH)).status).toBe(404);
  });
  it("requires fresh canonical Auth on every context request and never decodes an unverified caller into authority", async () => {
    const f = fixture(), { app } = f.appFor();
    expect((await request(app).get(AE_APPLICATION_CONTEXT_PATH)).status).toBe(401);
    expect(f.auth.authenticate).not.toHaveBeenCalled();
    expect((await request(app).get(AE_APPLICATION_CONTEXT_PATH).set("Authorization", "Bearer " + token())).status).toBe(200);
    f.auth.authenticate.mockResolvedValueOnce(null);
    const revoked = await request(app).get(AE_APPLICATION_CONTEXT_PATH).set("Authorization", "Bearer " + token());
    expect(revoked.status).toBe(401); expect(revoked.body).toEqual({ ok: false, code: "access_denied" });
    expect(f.auth.authenticate).toHaveBeenCalledTimes(2); expect(f.durableRateLimit).toHaveBeenCalledTimes(1);
    expectPrivate(revoked.headers); expect(f.rpc.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { sub: id(99) }, { session_id: "invalid" }, { exp: 1 }, { aal: "aal1" },
  ])("rejects invalid subject/session/expiry/assurance before limiter or metadata: %j", async claims => {
    const f = fixture(), { app } = f.appFor();
    const response = await request(app).get(AE_APPLICATION_CONTEXT_PATH).set("Authorization", "Bearer " + token(claims));
    expect(response.status).toBe(401); expect(response.body).toEqual({ ok: false, code: "access_denied" });
    expect(f.durableRateLimit).not.toHaveBeenCalled(); expect(f.rpc.rpc).not.toHaveBeenCalled();
  });
  it("requires current SDK assurance even after a verified aal2 token", async () => {
    const f = fixture(), { app } = f.appFor(); f.auth.currentAssurance.mockResolvedValueOnce("aal1");
    const response = await request(app).get(AE_APPLICATION_CONTEXT_PATH).set("Authorization", "Bearer " + token());
    expect(response.status).toBe(401); expect(f.durableRateLimit).not.toHaveBeenCalled();
    expect(f.rpc.rpc).not.toHaveBeenCalled();
  });
  it.each([{ amr: ["password", "recovery", "mfa/totp"] }, { amr: [{ method: "password" }, { method: "recovery" }] }])("denies recovery before limiter, assurance or SQL: %j", async ({ amr }) => {
    const f = fixture(), { app } = f.appFor();
    const response = await request(app).get(AE_APPLICATION_CONTEXT_PATH).set("Authorization", "Bearer " + token({ amr }));
    expect(response.status).toBe(403); expect(response.body).toEqual({ ok: false, code: "access_denied" });
    expect(f.auth.currentAssurance).not.toHaveBeenCalled(); expect(f.durableRateLimit).not.toHaveBeenCalled();
    expect(f.rpc.rpc).not.toHaveBeenCalled(); expectPrivate(response.headers);
  });
  it.each(["denied", "failed"])("returns a truthful private failure when the durable limiter is %s", async state => {
    const f = fixture(), { app } = f.appFor();
    if (state === "denied") f.durableRateLimit.mockResolvedValueOnce(false);
    else f.durableRateLimit.mockRejectedValueOnce(new Error("PRIVATE_LIMIT_DIAGNOSTIC"));
    const response = await request(app).get(AE_APPLICATION_CONTEXT_PATH).set("Authorization", "Bearer " + token());
    expect(response.status).toBe(state === "denied" ? 429 : 503); expect(response.body).toEqual({ ok: false, code: "unavailable" });
    expect(f.rpc.rpc).not.toHaveBeenCalled(); expectPrivate(response.headers);
  });
  it.each(["authenticate", "currentAssurance"] as const)("contains %s failures without reflecting private diagnostics", async method => {
    const f = fixture(), { app } = f.appFor(); f.auth[method].mockRejectedValueOnce(new Error("PRIVATE_AUTH_DIAGNOSTIC"));
    const response = await request(app).get(AE_APPLICATION_CONTEXT_PATH).set("Authorization", "Bearer " + token());
    expect(response.status).toBe(503); expect(response.body).toEqual({ ok: false, code: "unavailable" });
    expect(f.durableRateLimit).not.toHaveBeenCalled(); expect(f.rpc.rpc).not.toHaveBeenCalled(); expectPrivate(response.headers);
  });
  it.each([{ scopeId: id(99) }, { operationalScopeId: id(99) }, { profile: { scopeId: id(99) } }, { unknown: "input" }])("rejects all context query hints after session/limiter checks: %j", async query => {
    const f = fixture(), { app } = f.appFor();
    const response = await request(app).get(AE_APPLICATION_CONTEXT_PATH).query(query).set("Authorization", "Bearer " + token());
    expect(response.status).toBe(400); expect(response.body).toEqual({ ok: false, code: "invalid_input" });
    expect(f.durableRateLimit).toHaveBeenCalledTimes(1); expect(f.rpc.rpc).not.toHaveBeenCalled(); expectPrivate(response.headers);
  });
  it.each(["json", "text", "malformed"])("does not accept scope hints in a GET body (%s)", async format => {
    const f = fixture(), { app } = f.appFor();
    const call = request(app).get(AE_APPLICATION_CONTEXT_PATH).set("Authorization", "Bearer " + token());
    const response = format === "json" ? await call.send({ scopeId: id(99) })
      : await call.set("Content-Type", format === "text" ? "text/plain" : "application/json")
        .send(format === "text" ? "scopeId=foreign" : '{"scopeId":');
    expect(response.status).toBe(400); expect(response.body).toEqual({ ok: false, code: "invalid_input" });
    expect(f.rpc.rpc).not.toHaveBeenCalled(); expectPrivate(response.headers);
  });
  it("preserves all four canonical routes, scoped RPC arguments, current denials and original guest custodian", async () => {
    const f = fixture(), { app } = f.appFor(), bearer = token();
    const read = await request(app).get(AE_WORKSPACE_API_BASE + "/workspace").set("Authorization", "Bearer " + bearer);
    expect(read.status).toBe(200); expect(read.body.value.customers).toEqual([]);
    expect(f.rpc.rpc).toHaveBeenLastCalledWith("ae_workspace_read", { p_actor_user_id: actor, p_session_id: session, p_scope_id: scope });
    const command = { kind: "record_followup", commandId: id(6), assignmentId: id(7), customerAuthUserId: id(8), expectedRevision: 1,
      purpose: "contact_customer", dueAt: new Date(Date.now() + 60_000).toISOString() };
    const denied = await request(app).post(AE_WORKSPACE_API_BASE + "/commands").set("Origin", prodOrigin)
      .set("Authorization", "Bearer " + bearer).send(command);
    expect(denied.status).toBe(403); expect(denied.body).toEqual({ ok: false, code: "access_denied" });
    expect(f.rpc.rpc).toHaveBeenLastCalledWith("ae_workspace_authorize", { p_actor_user_id: actor, p_session_id: session, p_scope_id: scope,
      p_customer_auth_user_id: id(8), p_capability: "followup:record" });
    const assigned = await request(app).post(AE_WORKSPACE_API_BASE + "/assignments").set("Origin", prodOrigin)
      .set("Authorization", "Bearer " + bearer).send({ commandId: id(9), customerAuthUserId: id(8), assigneeAuthUserId: id(10) });
    expect(assigned.status).toBe(403);
    expect(f.rpc.rpc).toHaveBeenLastCalledWith("ae_workspace_assign", { p_actor_user_id: actor, p_session_id: session, p_scope_id: scope,
      p_command: { commandId: id(9), customerAuthUserId: id(8), assigneeAuthUserId: id(10) } });
    f.rpc.rpc.mockResolvedValueOnce({ data: { requestId: id(12), claimId: id(13), replay: false }, error: null });
    f.auth.currentAssurance.mockClear();
    const claimed = await request(app).post(AE_WORKSPACE_API_BASE + "/identity-claims").set("Origin", prodOrigin)
      .set("Authorization", "Bearer " + token({ aal: "aal1" })).send({ commandId: id(11), requestId: id(12) });
    expect(claimed.status).toBe(200); expect(f.auth.currentAssurance).not.toHaveBeenCalled();
    expect(f.rpc.rpc).toHaveBeenLastCalledWith("ae_workspace_claim", { p_actor_user_id: actor, p_session_id: session, p_scope_id: scope,
      p_command: { commandId: id(11), requestId: id(12) }, p_guest_ref: f.proof.customerRef,
      p_guest_session_hash: f.proof.sessionHash, p_guest_expires_at: f.proof.expiresAt });
  });
  it("leaves original-guest claims unavailable without that existing custodian and does not invent a member-hash fallback", async () => {
    const f = fixture(), { app, boundary } = f.appFor({ resolveOriginalGuestProof: null });
    expect(boundary.state).toBe("ready"); expect(boundary.claimState).toBe("unavailable");
    expect((await request(app).get(AE_APPLICATION_CONTEXT_PATH).set("Authorization", "Bearer " + token())).status).toBe(200);
    const response = await request(app).post(AE_WORKSPACE_API_BASE + "/identity-claims").set("Origin", prodOrigin)
      .set("Authorization", "Bearer " + token({ aal: "aal1" })).send({ commandId: id(11), requestId: id(12) });
    expect(response.status).toBe(503); expect(response.body).toEqual({ ok: false, code: "unavailable" });
    expect(f.rpc.rpc).not.toHaveBeenCalled(); expect(f.resolveOriginalGuestProof).not.toHaveBeenCalled();
  });
});

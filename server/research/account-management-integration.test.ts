import express, { type Request, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerResearchApi } from "./index";
import { registerUniversalAccountApi } from "./account-management/routes";
import type { UniversalAccountDependencies } from "./account-management/service";
import { ACCOUNT_REGISTRATION_NOTICE } from "@shared/research/account-management";
import { registerAccountLifecycleApi } from "./account-lifecycle/routes";
import { buildAccountLifecycleDependencies, buildAccountLifecycleProduction } from "./account-lifecycle/production";
import { createLifecycleRepository } from "./account-lifecycle/repository";
import { unavailableLifecycle } from "@shared/research/account-lifecycle";

const actor = "10000000-0000-4000-8000-000000000001", other = "20000000-0000-4000-8000-000000000002";
const origin = "https://fixture.example.invalid", prefix = "/api/research/account-management";
const keys = ["RESEARCH_PUBLIC", "RESEARCH_ACCESS_PASSWORD", "RESEARCH_SESSION_SECRET"] as const;
let saved: Partial<Record<(typeof keys)[number], string>>;
beforeEach(() => {
  saved = {}; for (const key of keys) { saved[key] = process.env[key]; delete process.env[key]; }
  process.env.RESEARCH_ACCESS_PASSWORD = "synthetic-reviewer-password";
  process.env.RESEARCH_SESSION_SECRET = "synthetic-session-key-for-test";
});
afterEach(() => { for (const key of keys) {
  if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
} });
function fixture() {
  const config = { registrationEnabled: true, selfEditsEnabled: true, captchaRequired: true as const,
    confirmationRedirect: `${origin}/research/sign-in?returnTo=%2Fresearch%2Faccount%2Fsettings`, deletion: "unavailable" as const };
  const deps = { origin, config: () => config, allow: vi.fn(async () => true), verifyCaptcha: vi.fn(async () => true),
    signUp: vi.fn(async (_input: unknown) => ({ data: { user: { id: "PRIVATE_PROVIDER_ID" }, session: { token: "PRIVATE_PROVIDER_SESSION" } } })),
    verifyIdentity: vi.fn(async (token: string) => ["ordinary-A", "recovery-A", "unconfirmed-A"].includes(token)
      ? { id: actor, email: "a@example.invalid", email_confirmed_at: token === "unconfirmed-A" ? null : "2026-11-19T12:00:00Z",
        user_metadata: { display_name: "Ordinary A", role: "clinical_admin" } } : null),
    isRecovery: (token: string) => token === "recovery-A", resetPassword: vi.fn(async () => ({})),
    updateSelf: vi.fn(async (_token: string, _attributes: unknown, _redirect: string) => ({ ok: true, userId: actor })),
    reauthenticate: vi.fn(async (_token: string) => ({ ok: true })),
  } satisfies UniversalAccountDependencies;
  const app = express(); app.use(express.json()); registerResearchApi(app); registerUniversalAccountApi(app, deps);
  // Existing customer/staff/partner guards remain independent downstream
  // boundaries. None is opened or reclassified by basic identity settings.
  const otherGuard = vi.fn((_req: Request, res: Response) => res.status(403).json({ ok: false, code: "domain_access_denied" }));
  app.get("/api/research/account/context", otherGuard);
  app.get("/api/research/account-executive/workspace", otherGuard);
  app.get("/api/research/partner/me", otherGuard);
  return { app, deps, config, otherGuard };
}
function privateResponse(response: { headers: Record<string, string | undefined> }) {
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(response.headers.pragma).toBe("no-cache"); expect(response.headers["referrer-policy"]).toBe("no-referrer");
  expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
  expect(response.headers["set-cookie"]).toBeUndefined();
}
describe("real reviewer wall composed with universal own-identity service", () => {
  it("lets a confirmed ordinary nonmember reach only its own closed identity projection", async () => {
    const f = fixture();
    const config = await request(f.app).get(prefix + "/config"); expect(config.status).toBe(200); privateResponse(config);
    const response = await request(f.app).get(prefix + "/me").set("Authorization", "Bearer ordinary-A");
    expect(response.status).toBe(200); privateResponse(response);
    expect(response.body).toEqual({ ok: true, identity: { userId: actor, email: "a@example.invalid", emailVerified: true, displayName: "Ordinary A", pendingEmail: null } });
    expect(f.deps.verifyIdentity).toHaveBeenCalledExactlyOnceWith("ordinary-A"); expect(f.otherGuard).not.toHaveBeenCalled();
    for (const path of ["/account/context", "/account-executive/workspace", "/partner/me"]) {
      const domain = await request(f.app).get("/api/research" + path).set("Authorization", "Bearer ordinary-A");
      expect(domain.status).toBe(403); expect(domain.body.code).toBe("domain_access_denied");
    }
    expect(f.deps.updateSelf).not.toHaveBeenCalled();
  });
  it.each([null, "forged", "recovery-A", "unconfirmed-A"])("denies %s at the real downstream boundary before self mutation", async bearer => {
    const f = fixture(); let call = request(f.app).patch(prefix + "/me").set("Origin", origin);
    if (bearer) call = call.set("Authorization", `Bearer ${bearer}`);
    const response = await call.send({ operation: "profile", displayName: "Changed" });
    expect([401, 403]).toContain(response.status); privateResponse(response);
    expect(f.deps.updateSelf).not.toHaveBeenCalled(); expect(f.deps.reauthenticate).not.toHaveBeenCalled();
  });
  it("keeps captured bearer A as the sole mutation subject and refuses requested other-user/role fields", async () => {
    const f = fixture();
    const changed = await request(f.app).patch(prefix + "/me").set("Authorization", "Bearer ordinary-A").set("Origin", origin)
      .send({ operation: "profile", displayName: "Updated A" });
    expect(changed.status).toBe(200); privateResponse(changed);
    expect(f.deps.updateSelf).toHaveBeenCalledExactlyOnceWith("ordinary-A", { data: { display_name: "Updated A" } }, f.config.confirmationRedirect);
    const forged = await request(f.app).patch(prefix + "/me").set("Authorization", "Bearer ordinary-A").set("Origin", origin)
      .send({ operation: "profile", displayName: "Other", userId: other, app_metadata: { role: "staff" } });
    expect(forged.status).toBe(400); expect(f.deps.updateSelf).toHaveBeenCalledTimes(1);
    const code = await request(f.app).post(prefix + "/reauthenticate").set("Authorization", "Bearer ordinary-A").set("Origin", origin).send({});
    expect(code.status).toBe(200); expect(f.deps.reauthenticate).toHaveBeenCalledExactlyOnceWith("ordinary-A");
  });
  it("passes signup through origin, durable limiter and one CAPTCHA check without provider identities or grants", async () => {
    const f = fixture();
    const response = await request(f.app).post(prefix + "/register").set("Origin", origin)
      .send({ email: "a@example.invalid", password: "synthetic-password", captchaToken: "synthetic-once" });
    expect(response.status).toBe(200); privateResponse(response);
    expect(response.body).toEqual({ ok: true, state: "check_email", message: ACCOUNT_REGISTRATION_NOTICE });
    expect(f.deps.verifyCaptcha).toHaveBeenCalledTimes(1); expect(f.deps.signUp).toHaveBeenCalledTimes(1);
    expect(f.deps.allow).toHaveBeenCalledTimes(2); expect(JSON.stringify(response.body)).not.toContain("PRIVATE_PROVIDER");
    expect(f.deps.verifyIdentity).not.toHaveBeenCalled(); expect(f.otherGuard).not.toHaveBeenCalled();
  });
  it.each(["origin", "limiter", "captcha", "unready"] as const)("closes actual signup for %s before provider work", async mode => {
    const f = fixture(); if (mode === "limiter") f.deps.allow.mockResolvedValue(false);
    if (mode === "captcha") f.deps.verifyCaptcha.mockResolvedValue(false);
    if (mode === "unready") f.config.registrationEnabled = false;
    const response = await request(f.app).post(prefix + "/register").set("Origin", mode === "origin" ? "https://other.invalid" : origin)
      .send({ email: "a@example.invalid", password: "synthetic-password", captchaToken: "synthetic" });
    expect([400, 403, 429, 503]).toContain(response.status); privateResponse(response); expect(f.deps.signUp).not.toHaveBeenCalled();
  });
  it.each([
    ["delete", "/me"], ["post", "/me"], ["put", "/me"], ["patch", "/users/other"],
    ["get", "/me/"], ["get", "/me/other"], ["post", "/register/"], ["get", "/register"],
  ] as const)("retains reviewer wall on ungranted U1 route %s %s", async (method, path) => {
    const f = fixture(); const response = await request(f.app)[method](prefix + path).set("Authorization", "Bearer ordinary-A");
    expect(response.status).toBe(401); expect(response.body).toEqual({ ok: false, message: "Access required." });
    expect(f.deps.verifyIdentity).not.toHaveBeenCalled(); expect(f.deps.updateSelf).not.toHaveBeenCalled();
  });
});

describe("real lifecycle mount remains isolated from basic identity and domain permissions", () => {
  const lifecycle = "/api/research/account-lifecycle", operation = "30000000-0000-4000-8000-000000000003";
  function coupled() {
    const f = fixture(), rpc = vi.fn(async () => ({ data: { ...unavailableLifecycle("dependency_unknown"),
      state: "blocked", operationId: operation, version: 1 }, error: null }));
    const verify = vi.fn(async (token: string) => token === "ordinary-A" ? { actorId: actor, ordinary: true as const,
      emailConfirmed: true as const, sessionBinding: "a".repeat(64) } : null);
    registerAccountLifecycleApi(f.app, buildAccountLifecycleDependencies({ origin, verifyOrdinary: verify,
      allow: async () => true, repository: createLifecycleRepository({ rpc }) }));
    return { ...f, rpc, verify };
  }
  it("mounts default-unavailable source without creating issuer/provider/native effects or changing U1 settings", async () => {
    const f = fixture(); registerAccountLifecycleApi(f.app, buildAccountLifecycleProduction({ SITE_URL: origin }));
    const issue = await request(f.app).post(lifecycle + "/self/attempt").set("Origin", origin)
      .set("Authorization", "Bearer ordinary-A").send({ retryKey: "frozen_retry_001" });
    expect(issue.status).toBe(503); expect(issue.body.state).toBe("unavailable"); privateResponse(issue);
    const status = await request(f.app).get(lifecycle + "/self/operations/" + operation).set("Authorization", "Bearer ordinary-A");
    expect(status.status).toBe(503); expect(status.body).toEqual({ protocol: "account-lifecycle/v1", code: "outcome_uncertain" });
    expect((await request(f.app).get(prefix + "/me").set("Authorization", "Bearer ordinary-A")).status).toBe(200);
    expect(f.deps.updateSelf).not.toHaveBeenCalled(); expect(f.deps.signUp).not.toHaveBeenCalled(); expect(f.otherGuard).not.toHaveBeenCalled();
  });
  it("passes only captured verified actor and operation to native own status, without requiring customer membership", async () => {
    const f = coupled(); const response = await request(f.app).get(lifecycle + "/self/operations/" + operation)
      .set("Authorization", "Bearer ordinary-A");
    expect(response.status).toBe(200); privateResponse(response); expect(response.body.state).toBe("blocked");
    expect(f.verify).toHaveBeenCalledExactlyOnceWith("ordinary-A");
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("account_lifecycle_status_self", { p_actor: actor, p_operation: operation });
    expect(f.deps.verifyIdentity).not.toHaveBeenCalled(); expect(f.otherGuard).not.toHaveBeenCalled();
  });
  it.each([null, "forged", "recovery-A", "unconfirmed-A"])("denies %s before native lifecycle reads or mutations", async token => {
    const f = coupled(); let call = request(f.app).get(lifecycle + "/self/operations/" + operation);
    if (token) call = call.set("Authorization", "Bearer " + token);
    const response = await call; expect([401, 403]).toContain(response.status); privateResponse(response);
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.deps.updateSelf).not.toHaveBeenCalled();
  });
  it("does not promote ordinary/member metadata into issuance or global-other-user authority", async () => {
    const f = coupled();
    const admin = await request(f.app).get(lifecycle + "/admin/operations/" + operation).set("Authorization", "Bearer ordinary-A");
    expect(admin.status).toBe(503); expect(admin.body.code).toBe("outcome_uncertain");
    const issue = await request(f.app).post(lifecycle + "/self/attempt").set("Origin", origin).set("Authorization", "Bearer ordinary-A")
      .send({ retryKey: "frozen_retry_001" });
    expect(issue.status).toBe(503); expect(issue.body.blockers).toEqual(["assurance_unavailable"]);
    const forged = await request(f.app).post(lifecycle + "/self/prepare").set("Origin", origin).set("Authorization", "Bearer ordinary-A")
      .send({ attemptCarrier: "x".repeat(40), targetId: other, role: "admin" });
    expect(forged.status).toBe(400); expect(f.rpc).not.toHaveBeenCalled();
    expect(f.deps.updateSelf).not.toHaveBeenCalled(); expect(f.deps.reauthenticate).not.toHaveBeenCalled();
  });
});

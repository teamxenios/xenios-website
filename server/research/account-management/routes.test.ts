import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerUniversalAccountApi } from "./routes";
import type { UniversalAccountDependencies } from "./service";
const root = "/api/research/account-management", actor = "10000000-0000-4000-8000-000000000001";
function fixture() {
  const config = { registrationEnabled: true, selfEditsEnabled: true, captchaRequired: true as const,
    confirmationRedirect: "https://fixture.example.invalid/research/sign-in?returnTo=%2Fresearch%2Faccount%2Fsettings", deletion: "unavailable" as const };
  const deps = { origin: "https://fixture.example.invalid", config: () => config, allow: vi.fn(async () => true), verifyCaptcha: vi.fn(async () => true),
    signUp: vi.fn(async () => ({ data: { session: { private: true } } })),
    verifyIdentity: vi.fn(async (token: string) => ["A", "recovery"].includes(token)
      ? { id: actor, email: "a@example.invalid", email_confirmed_at: "2026-11-19T12:00:00Z", user_metadata: { role: "admin" } } : null),
    isRecovery: (token: string) => token === "recovery", resetPassword: vi.fn(async () => ({})),
    updateSelf: vi.fn(async (_token: string, _body: unknown) => ({ ok: true, userId: actor })), reauthenticate: vi.fn(async (_token: string) => ({ ok: true })),
  } satisfies UniversalAccountDependencies;
  const app = express(); app.use(express.json()); registerUniversalAccountApi(app, deps); return { app, deps, config };
}
describe("literal universal-account HTTP boundary", () => {
  it("exposes only closed configuration and own verified identity with private headers", async () => {
    const f = fixture(), config = await request(f.app).get(root + "/config");
    expect(config.body).toEqual(f.config);
    const response = await request(f.app).get(root + "/me").set("Authorization", "Bearer A");
    expect(response.status).toBe(200); expect(response.body.identity.userId).toBe(actor);
    expect(response.body.identity).not.toHaveProperty("role"); expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.headers["cache-control"]).toContain("no-store"); expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
  });
  it.each([null, "bad", "recovery"])("denies %s bearer with no mutation", async token => {
    const f = fixture(), probe = request(f.app).patch(root + "/me").set("Origin", f.deps.origin!);
    if (token) probe.set("Authorization", `Bearer ${token}`);
    const response = await probe.send({ operation: "profile", displayName: "New" });
    expect([401,403]).toContain(response.status); expect(f.deps.updateSelf).not.toHaveBeenCalled();
  });
  it("binds actual PATCH and reauthentication to the bearer, never a supplied account/role", async () => {
    const f = fixture();
    const response = await request(f.app).patch(root + "/me").set("Origin", f.deps.origin!).set("Authorization", "Bearer A").send({ operation: "email", email: "new@example.invalid" });
    expect(response.body).toEqual({ ok: true, state: "accepted", operation: "email" });
    expect(f.deps.updateSelf).toHaveBeenCalledWith("A", { email: "new@example.invalid" }, f.config.confirmationRedirect);
    expect((await request(f.app).post(root + "/reauthenticate").set("Origin", f.deps.origin!).set("Authorization", "Bearer A").send({})).body).toEqual({ ok: true, state: "check_email" });
    expect(f.deps.reauthenticate).toHaveBeenCalledExactlyOnceWith("A");
    expect((await request(f.app).patch(root + "/me").set("Origin", f.deps.origin!).set("Authorization", "Bearer A").send({ operation: "profile", displayName: "New", userId: "other", role: "staff" })).status).toBe(400);
    expect(f.deps.updateSelf).toHaveBeenCalledTimes(1);
  });
  it.each(["missing-origin", "cross-site", "form"])("refuses %s mutation before provider work", async mode => {
    const f = fixture(), probe = request(f.app).patch(root + "/me").set("Authorization", "Bearer A");
    if (mode !== "missing-origin") probe.set("Origin", f.deps.origin!);
    if (mode === "cross-site") probe.set("Sec-Fetch-Site", "cross-site");
    const response = mode === "form" ? await probe.type("form").send("operation=profile") : await probe.send({ operation: "profile", displayName: "New" });
    expect(response.status).toBe(403); expect(f.deps.updateSelf).not.toHaveBeenCalled();
  });
  it("returns one generic signup outcome and never provider identifiers/session", async () => {
    const f = fixture();
    const response = await request(f.app).post(root + "/register").set("Origin", f.deps.origin!).send({ email: "a@example.invalid", password: "synthetic-password", captchaToken: "synthetic" });
    expect(response.status).toBe(200); expect(response.body.state).toBe("check_email");
    expect(JSON.stringify(response.body)).not.toContain("private"); expect(response.body).not.toHaveProperty("user");
  });
  it("redacts uncertainty without retry, and exposes no deletion or admin-other-user route", async () => {
    const f = fixture(); f.deps.updateSelf.mockRejectedValue(Error("private provider credentials"));
    const response = await request(f.app).patch(root + "/me").set("Origin", f.deps.origin!).set("Authorization", "Bearer A").send({ operation: "profile", displayName: "New" });
    expect(response.status).toBe(503); expect(response.body).toEqual({ ok: false, code: "account_outcome_unconfirmed" });
    expect(f.deps.updateSelf).toHaveBeenCalledTimes(1);
    expect((await request(f.app).delete(root + "/me")).status).toBe(404);
    expect((await request(f.app).patch(root + "/users/other").send({})).status).toBe(404);
  });
});

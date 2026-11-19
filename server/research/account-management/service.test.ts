import { describe, expect, it, vi } from "vitest";
import { ACCOUNT_REGISTRATION_NOTICE } from "@shared/research/account-management";
import { createUniversalAccountService, createUniversalRecoveryPort, type UniversalAccountDependencies } from "./service";

const a = "10000000-0000-4000-8000-000000000001", b = "20000000-0000-4000-8000-000000000002";
const redirect = "https://fixture.example.invalid/research/sign-in?returnTo=%2Fresearch%2Faccount%2Fsettings";
const recoveryRedirect = "https://fixture.example.invalid/research/reset-password";
const context = { ip: "192.0.2.1", origin: "https://fixture.example.invalid", fetchSite: "same-origin", json: true };
const input = { email: "person@example.invalid", password: "synthetic-password", displayName: "Person", captchaToken: "synthetic-captcha" };
function fixture() {
  const config = { registrationEnabled: true, selfEditsEnabled: true, captchaRequired: true as const, confirmationRedirect: redirect, deletion: "unavailable" as const };
  const user = { id: a, email: input.email, email_confirmed_at: "2026-11-19T12:00:00Z", user_metadata: { display_name: "Person", role: "admin" }, app_metadata: { private: true } };
  const deps = { origin: context.origin, config: vi.fn(() => config), allow: vi.fn(async (_key: string, _seconds: number, _maximum: number) => true),
    verifyCaptcha: vi.fn(async (_token: string, _ip: string) => true), signUp: vi.fn(async (_input: unknown): Promise<unknown> => ({ data: { session: { private: true }, user: { id: a } }, error: null })),
    verifyIdentity: vi.fn(async (_token: string): Promise<unknown> => user), isRecovery: vi.fn((token: string) => token === "recovery"),
    resetPassword: vi.fn(async (_email: string, _redirect: string) => ({})),
    updateSelf: vi.fn(async (_token: string, _attributes: unknown, _redirect: string) => ({ ok: true, userId: a })),
    reauthenticate: vi.fn(async (_token: string) => ({ ok: true })),
  } satisfies UniversalAccountDependencies;
  return { deps, config, user, service: createUniversalAccountService(deps) };
}
describe("ordinary registration with no domain grants", () => {
  it("uses the fixed confirmation target and canonical signup only, without exposing a provider account/session", async () => {
    const f = fixture(), reply = await f.service.register(input, context);
    expect(reply).toEqual({ ok: true, state: "check_email", message: ACCOUNT_REGISTRATION_NOTICE });
    expect(f.deps.signUp).toHaveBeenCalledExactlyOnceWith({ email: input.email, password: input.password,
      options: { emailRedirectTo: redirect, data: { display_name: "Person" } } });
    expect(JSON.stringify(reply)).not.toContain(a); expect(JSON.stringify(reply)).not.toContain("session");
    expect(f.deps.allow).toHaveBeenCalledTimes(2); expect(f.deps.allow.mock.calls.map(([key]) => key).join()).not.toContain(input.email);
  });
  it.each(["new", "existing", "unavailable", "thrown"])("gives the same bounded enumeration-safe projection for %s provider outcomes", async outcome => {
    const f = fixture();
    if (outcome === "existing") f.deps.signUp.mockResolvedValue({ data: { user: { id: "obfuscated" } }, error: { message: "already exists" } });
    if (outcome === "unavailable") f.deps.signUp.mockResolvedValue({ data: null, error: { message: "private provider error" } });
    if (outcome === "thrown") f.deps.signUp.mockRejectedValue(Error("private provider error"));
    expect(await f.service.register(input, context)).toEqual({ ok: true, state: "check_email", message: ACCOUNT_REGISTRATION_NOTICE });
    expect(f.deps.signUp).toHaveBeenCalledTimes(1);
  });
  it.each(["off", "origin", "fetch-site", "body", "rate", "captcha"])("stops %s before any signup", async failure => {
    const f = fixture(); let ctx = context, body: unknown = input;
    if (failure === "off") f.config.registrationEnabled = false;
    if (failure === "origin") ctx = { ...context, origin: "https://outside.invalid" };
    if (failure === "fetch-site") ctx = { ...context, fetchSite: "cross-site" };
    if (failure === "body") body = { ...input, role: "staff" };
    if (failure === "rate") f.deps.allow.mockResolvedValue(false);
    if (failure === "captcha") f.deps.verifyCaptcha.mockResolvedValue(false);
    await expect(f.service.register(body, ctx)).rejects.toBeInstanceOf(Error); expect(f.deps.signUp).not.toHaveBeenCalled();
  });
});
describe("captured ordinary subject is the sole self-mutation target", () => {
  it("projects only the verified own identity, including pending email, without needing a member", async () => {
    const f = fixture(); f.deps.verifyIdentity.mockResolvedValue({ ...f.user, new_email: "pending@example.invalid" });
    expect(await f.service.identity("A", context.ip)).toEqual({ ok: true, identity: { userId: a, email: input.email, emailVerified: true, displayName: "Person", pendingEmail: "pending@example.invalid" } });
    expect(f.deps.verifyIdentity).toHaveBeenCalledExactlyOnceWith("A");
  });
  it.each(["absent", "recovery", "unconfirmed"])("refuses %s identity before mutations or challenge", async failure => {
    const f = fixture(); if (failure === "absent") f.deps.verifyIdentity.mockResolvedValue(null);
    if (failure === "unconfirmed") f.deps.verifyIdentity.mockResolvedValue({ ...f.user, email_confirmed_at: null });
    const token = failure === "recovery" ? "recovery" : "A";
    await expect(f.service.mutate(token, { operation: "profile", displayName: "New" }, context)).rejects.toBeInstanceOf(Error);
    expect(f.deps.updateSelf).not.toHaveBeenCalled(); expect(f.deps.reauthenticate).not.toHaveBeenCalled();
  });
  it("holds verification for A across a later B login and still sends only captured A", async () => {
    const f = fixture(); let release!: (user: unknown) => void, started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    f.deps.verifyIdentity.mockImplementationOnce(() => new Promise(resolve => { release = resolve; started(); }));
    const pending = f.service.mutate("A", { operation: "profile", displayName: "New" }, context);
    await entered;
    f.deps.verifyIdentity.mockResolvedValue({ ...f.user, id: b, email: "b@example.invalid" });
    release(f.user); expect(await pending).toEqual({ ok: true, state: "accepted", operation: "profile" });
    expect(f.deps.updateSelf).toHaveBeenCalledExactlyOnceWith("A", { data: { display_name: "New" } }, redirect);
  });
  it("uses provider challenge and password nonce on the same bearer and never creates another session", async () => {
    const f = fixture(); expect(await f.service.reauthenticate("A", {}, context)).toEqual({ ok: true, state: "check_email" });
    expect(f.deps.reauthenticate).toHaveBeenCalledExactlyOnceWith("A");
    await f.service.mutate("A", { operation: "password", password: input.password, nonce: "123456" }, context);
    expect(f.deps.updateSelf).toHaveBeenCalledExactlyOnceWith("A", { password: input.password, nonce: "123456" }, redirect);
  });
  it("rejects another target, role data, unknown challenge fields and missing nonce", async () => {
    const f = fixture();
    for (const body of [{ operation: "profile", displayName: "New", userId: b }, { operation: "profile", displayName: "New", data: { role: "admin" } }, { operation: "password", password: input.password }])
      await expect(f.service.mutate("A", body, context)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(f.service.reauthenticate("A", { userId: b }, context)).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.deps.updateSelf).not.toHaveBeenCalled(); expect(f.deps.reauthenticate).not.toHaveBeenCalled();
  });
  it.each(["lost", "wrong-subject", "denied"])("keeps %s update uncertain without retry or fallback", async failure => {
    const f = fixture();
    if (failure === "lost") f.deps.updateSelf.mockRejectedValue(Error("private lost reply"));
    if (failure === "wrong-subject") f.deps.updateSelf.mockResolvedValue({ ok: true, userId: b });
    if (failure === "denied") f.deps.updateSelf.mockResolvedValue({ ok: false, userId: a });
    await expect(f.service.mutate("A", { operation: "email", email: "new@example.invalid" }, context)).rejects.toMatchObject({ code: "account_outcome_unconfirmed", status: 503 });
    expect(f.deps.updateSelf).toHaveBeenCalledTimes(1);
  });
});
describe("universal recovery is additive and enumeration safe", () => {
  it("has no membership prerequisite and reuses the exact supplied safe reset target", async () => {
    const f = fixture(), port = createUniversalRecoveryPort(f.deps);
    await port.request({ email: input.email, captchaToken: input.captchaToken, redirectTo: recoveryRedirect, context });
    expect(f.deps.resetPassword).toHaveBeenCalledExactlyOnceWith(input.email, recoveryRedirect);
    expect(f.deps.signUp).not.toHaveBeenCalled(); expect(f.deps.updateSelf).not.toHaveBeenCalled();
  });
  it.each(["off", "missing-captcha", "bad-captcha", "origin", "rate"])("refuses %s without a provider send", async failure => {
    const f = fixture(); if (failure === "off") f.config.registrationEnabled = false;
    if (failure === "bad-captcha") f.deps.verifyCaptcha.mockResolvedValue(false);
    if (failure === "rate") f.deps.allow.mockResolvedValue(false);
    await createUniversalRecoveryPort(f.deps).request({ email: input.email, captchaToken: failure === "missing-captcha" ? undefined : input.captchaToken,
      redirectTo: recoveryRedirect, context: failure === "origin" ? { ...context, origin: "https://outside.invalid" } : context }).catch(() => {});
    expect(f.deps.resetPassword).not.toHaveBeenCalled();
  });
});

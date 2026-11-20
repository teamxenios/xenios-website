import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ configured: true, url: "https://project.example.invalid", auth: {
  signUp: vi.fn(async (_input: unknown) => ({ data: { user: null, session: null }, error: null })),
  getUser: vi.fn(async (_token: string) => ({ data: { user: null }, error: null })),
  resetPasswordForEmail: vi.fn(async (_email: string, _options: unknown) => ({ error: null })),
}, verify: vi.fn(async (_token: string, _ip: string) => true), limit: vi.fn(async (_key: string, _seconds: number, _maximum: number, _options: unknown) => true) }));
vi.mock("../../supabase", () => ({ getSupabaseAnon: () => ({ auth: sdk.auth }), supabaseConfigured: () => sdk.configured,
  getSupabaseConnectionIdentity: () => ({ anonUrl: sdk.url }) }));
vi.mock("../../turnstile", () => ({ verifyTurnstile: sdk.verify }));
vi.mock("../rate-limit", () => ({ rateLimitHit: sdk.limit }));
import { buildUniversalAccountDependencies, createCapturedAccountTransport } from "./production";
const actor = "10000000-0000-4000-8000-000000000001";
const ready = { registrationQualified: true, selfEditsQualified: true, emailConfirmationRequired: true, basicPoliciesReady: true };
const env = { SITE_URL: "https://fixture.example.invalid", SUPABASE_URL: "https://project.example.invalid", SUPABASE_ANON_KEY: "synthetic-public-key",
  TURNSTILE_SECRET_KEY: "synthetic-challenge-key", TURNSTILE_SITE_KEY: "synthetic-site-key", RESEARCH_UNIVERSAL_ACCOUNTS_ENABLED: "true" };
beforeEach(() => { vi.clearAllMocks(); sdk.configured = true; sdk.url = env.SUPABASE_URL; });
describe("unavailable-by-default existing canonical production wiring", () => {
  it.each([undefined, "false", "TRUE", "1"])("never enables for flag %s or omitted qualification", flag => {
    expect(buildUniversalAccountDependencies({ ...env, RESEARCH_UNIVERSAL_ACCOUNTS_ENABLED: flag }, ready).config().registrationEnabled).toBe(false);
    expect(buildUniversalAccountDependencies(env).config().registrationEnabled).toBe(false);
    expect(buildUniversalAccountDependencies(env).config().selfEditsEnabled).toBe(false);
    expect(sdk.auth.signUp).not.toHaveBeenCalled(); expect(sdk.auth.getUser).not.toHaveBeenCalled();
  });
  it("requires real CAPTCHA configuration, confirmed-email and policy readiness; snapshots the trusted binding", async () => {
    expect(buildUniversalAccountDependencies({ ...env, TURNSTILE_SECRET_KEY: "" }, ready).config().registrationEnabled).toBe(false);
    expect(buildUniversalAccountDependencies(env, { ...ready, emailConfirmationRequired: false }).config().selfEditsEnabled).toBe(false);
    expect(buildUniversalAccountDependencies(env, { ...ready, basicPoliciesReady: false }).config().registrationEnabled).toBe(false);
    const binding = { ...ready, registrationQualified: false }, deps = buildUniversalAccountDependencies(env, binding);
    binding.registrationQualified = true; expect(deps.config().registrationEnabled).toBe(false);
    expect(await buildUniversalAccountDependencies({ ...env, TURNSTILE_SECRET_KEY: "" }, ready).verifyCaptcha("token", "192.0.2.1")).toBe(false);
    expect(sdk.verify).not.toHaveBeenCalled();
  });
  it("uses the existing supported signup/reset/verifier and deny-on-durable-failure limiter", async () => {
    const deps = buildUniversalAccountDependencies(env, ready);
    await deps.allow("hashed-budget", 600, 2);
    expect(sdk.limit).toHaveBeenCalledWith("hashed-budget", 600, 2, { durableFailurePolicy: "deny" });
    await deps.signUp({ email: "person@example.invalid", password: "synthetic-password", options: { emailRedirectTo: "https://fixture.example.invalid/research/sign-in" } });
    await deps.verifyIdentity("captured-A"); await deps.resetPassword("person@example.invalid", "https://fixture.example.invalid/research/reset-password");
    expect(sdk.auth.signUp).toHaveBeenCalledTimes(1); expect(sdk.auth.getUser).toHaveBeenCalledWith("captured-A");
    expect(sdk.auth.resetPasswordForEmail).toHaveBeenCalledWith("person@example.invalid", { redirectTo: "https://fixture.example.invalid/research/reset-password" });
  });
  it("refuses cached-project mismatch before any self-mutation request", async () => {
    sdk.url = "https://other.example.invalid";
    const deps = buildUniversalAccountDependencies(env, ready);
    await expect(Promise.resolve().then(() => deps.updateSelf("A", { data: { display_name: "New" } }, "https://fixture.example.invalid/research/sign-in")))
      .rejects.toThrow("account_unavailable");
    await expect(Promise.resolve().then(() => deps.signUp({ email: "person@example.invalid", password: "synthetic-password", options: { emailRedirectTo: "https://fixture.example.invalid/research/sign-in" } })))
      .rejects.toThrow("account_unavailable");
    expect(sdk.auth.signUp).not.toHaveBeenCalled();
  });
});
describe("supported fixed-project Auth REST with a captured bearer", () => {
  it("uses GET reauthenticate and PUT user on A even if the browser has meanwhile selected B", async () => {
    let release!: (response: Response) => void;
    const entered: string[] = [];
    const fetcher = vi.fn<typeof fetch>((url, init) => {
      entered.push(String(url));
      if (String(url).includes("/reauthenticate")) return Promise.resolve(new Response("{}", { status: 200 }));
      return new Promise(resolve => { release = resolve; });
    });
    const transport = createCapturedAccountTransport({ projectUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, fetcher });
    await transport.reauthenticate("captured-A");
    const pending = transport.updateSelf("captured-A", { password: "synthetic-password", nonce: "123456" }, "https://fixture.example.invalid/research/sign-in");
    const browserSession = { token: "newer-B" }; expect(browserSession.token).toBe("newer-B");
    release(new Response(JSON.stringify({ id: actor }), { status: 200 })); expect(await pending).toEqual({ ok: true, userId: actor });
    expect(entered[0]).toBe("https://project.example.invalid/auth/v1/reauthenticate");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", headers: { Authorization: "Bearer captured-A", apikey: env.SUPABASE_ANON_KEY }, redirect: "error" });
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "PUT", headers: { Authorization: "Bearer captured-A" }, body: JSON.stringify({ password: "synthetic-password", nonce: "123456" }) });
    expect(fetcher.mock.calls[1][1]?.headers).not.toHaveProperty("userId");
    expect(sdk.auth.signUp).not.toHaveBeenCalled();
  });
  it.each(["denied", "malformed", "oversized", "lost"])("does not retry or expose %s mutation output", async failure => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      if (failure === "lost") throw Error("private provider failure");
      return failure === "denied" ? new Response("private error", { status: 403 })
        : failure === "malformed" ? new Response("not-json") : new Response("x".repeat(16385));
    });
    const transport = createCapturedAccountTransport({ projectUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, fetcher });
    const result = await transport.updateSelf("A", { data: { display_name: "New" } }, "https://fixture.example.invalid/research/sign-in").catch(() => null);
    expect(result === null || result.ok === false).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects arbitrary project paths and header injection without fetching", () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(() => createCapturedAccountTransport({ projectUrl: env.SUPABASE_URL + "/other", anonKey: "synthetic", fetcher })).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

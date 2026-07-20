// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ auth: {} })),
  config: {
    supabaseUrl: "https://project-ref.supabase.co",
    supabaseAnonKey: "anon-test-key",
  },
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("./config", () => ({ getConfig: async () => mocks.config }));

function jwt(amr: Array<string | { method: string; timestamp: number }>): string {
  const b64 = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "user-1", amr })}.signature`;
}

const recoveryToken = () => jwt([{ method: "otp", timestamp: 1 }]);
const normalToken = () => jwt([{ method: "password", timestamp: 2 }]);
const storageKey = "sb-project-ref-auth-token";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  window.localStorage.clear();
  globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as any;
});

describe("purpose-bound Supabase recovery cleanup", () => {
  it("recognizes mixed recovery AMR and never classifies a password + MFA session as recovery", async () => {
    const { isRecoveryAccessToken, recoveryAccessTokenFromHash } = await import("./supabaseBrowser");
    expect(isRecoveryAccessToken(jwt([{ method: "otp", timestamp: 1 }, { method: "password", timestamp: 2 }]))).toBe(true);
    expect(isRecoveryAccessToken(jwt([{ method: "recovery", timestamp: 1 }, { method: "mfa/totp", timestamp: 2 }]))).toBe(true);
    expect(isRecoveryAccessToken(jwt([{ method: "mfa/totp", timestamp: 2 }]))).toBe(true);
    expect(isRecoveryAccessToken(jwt([{ method: "password", timestamp: 1 }, { method: "mfa/totp", timestamp: 2 }]))).toBe(false);
    const recovery = recoveryToken();
    expect(recoveryAccessTokenFromHash(`#access_token=${recovery}&refresh_token=secret&type=recovery`)).toBe(recovery);
    // URL purpose is cleanup context only, never server authorization. Exact
    // capture still works for a provider token whose AMR is absent/unusual.
    expect(recoveryAccessTokenFromHash(`#access_token=${normalToken()}&type=recovery`)).toBe(normalToken());
  });

  it("can clear an abandoned recovery session before async config establishes the project storage key", async () => {
    const api = await import("./supabaseBrowser");
    const recovery = recoveryToken();
    window.localStorage.setItem(storageKey, JSON.stringify({ access_token: recovery, refresh_token: "recovery-refresh" }));
    expect(api.clearPersistedRecoverySession(recovery)).toBe(true);
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("synchronously removes only the matching persisted recovery session", async () => {
    const api = await import("./supabaseBrowser");
    await api.getSupabaseBrowser();
    const recovery = recoveryToken();
    window.localStorage.setItem(storageKey, JSON.stringify({ access_token: recovery, refresh_token: "recovery-refresh" }));
    expect(api.clearPersistedRecoverySession(recovery)).toBe(true);
    expect(window.localStorage.getItem(storageKey)).toBeNull();

    const normal = normalToken();
    window.localStorage.setItem(storageKey, JSON.stringify({ access_token: normal, refresh_token: "normal-refresh" }));
    expect(api.clearPersistedRecoverySession(recovery)).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(storageKey)!).access_token).toBe(normal);
  });

  it("revokes with local scope + keepalive and cannot erase a newer normal session while the request is delayed", async () => {
    let release!: () => void;
    const network = new Promise<void>((resolve) => { release = resolve; });
    globalThis.fetch = vi.fn(async () => {
      await network;
      return new Response(null, { status: 204 });
    }) as any;
    const api = await import("./supabaseBrowser");
    await api.getSupabaseBrowser();
    const recovery = recoveryToken();
    const normal = normalToken();
    window.localStorage.setItem(storageKey, JSON.stringify({ access_token: recovery, refresh_token: "recovery-refresh" }));

    const cleanup = api.revokeRecoverySession(recovery);
    await Promise.resolve();
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    window.localStorage.setItem(storageKey, JSON.stringify({ access_token: normal, refresh_token: "normal-refresh" }));
    release();
    await cleanup;

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(call[0]).toBe("https://project-ref.supabase.co/auth/v1/logout?scope=local");
    expect(call[1]).toMatchObject({
      method: "POST",
      keepalive: true,
      headers: { apikey: "anon-test-key", Authorization: `Bearer ${recovery}` },
    });
    expect(JSON.parse(window.localStorage.getItem(storageKey)!).access_token).toBe(normal);
  });
});

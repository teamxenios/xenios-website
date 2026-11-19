// @vitest-environment jsdom
// Synthetic SDK events only. These local fences do not establish an admin role.
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const sdk = vi.hoisted(() => {
  type Listener = { callback: (event: AuthChangeEvent, session: Session | null) => void; active: boolean; unsubscribe: ReturnType<typeof vi.fn> };
  const state = { session: null as Session | null, configured: true };
  const listeners: Listener[] = [];
  const emit = (event: AuthChangeEvent, session: Session | null) => {
    state.session = session;
    for (const listener of listeners) if (listener.active) listener.callback(event, session);
  };
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
    onAuthStateChange: vi.fn((callback: Listener["callback"]) => {
      const listener: Listener = { callback, active: true, unsubscribe: vi.fn() };
      listener.unsubscribe.mockImplementation(() => { listener.active = false; });
      listeners.push(listener);
      return { data: { subscription: { unsubscribe: listener.unsubscribe } } };
    }),
    signInWithPassword: vi.fn(async (_input: { email: string; password: string }) => ({ data: { session: state.session }, error: null })),
    signOut: vi.fn(async () => { emit("SIGNED_OUT", null); return { error: null }; }),
  };
  const browser = vi.fn(async () => state.configured ? { auth } : null);
  return { state, listeners, emit, auth, browser };
});

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: sdk.browser,
  isRecoveryAccessToken: (token: string) => token.includes("-recovery"),
}));

import { careApiFetch } from "../../../care/api";
import { registerAdminPreSignOutTask, useAdminSession, type AdminSession, type AdminSessionBinding } from "./auth";

const userA = "10000000-0000-4000-8000-000000000001", userB = "10000000-0000-4000-8000-000000000002";
const credential = (token = "synthetic-admin-A", userId = userA) => ({ access_token: token, user: { id: userId } }) as Session;
const original = credential();
let current: AdminSession | null;
let root: Root | null;
let host: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
let renders: number;
const disposers: Array<() => void> = [];
function Probe() { current = useAdminSession(); renders += 1; return <output>{current.binding?.generation ?? "closed"}</output>; }
function session() { if (!current) throw new Error("session probe missing"); return current; }
function binding(): AdminSessionBinding { const value = session().binding; if (!value) throw new Error("binding missing"); return value; }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function mount(strict = false, key = "first") {
  if (!root) root = createRoot(host);
  await act(async () => root!.render(strict ? <StrictMode><Probe key={key} /></StrictMode> : <Probe key={key} />));
  await flush();
}
async function failCleanup() {
  const failure = new Error("synthetic_cleanup_failure");
  const dispose = registerAdminPreSignOutTask(() => { throw failure; });
  try { await act(async () => { await expect(session().signOut()).rejects.toBe(failure); }); }
  finally { dispose(); }
}

beforeEach(() => {
  current = null; root = null; renders = 0; sdk.listeners.length = 0;
  sdk.state.session = original; sdk.state.configured = true;
  vi.clearAllMocks();
  sdk.auth.getSession.mockImplementation(async () => ({ data: { session: sdk.state.session }, error: null }));
  sdk.auth.signInWithPassword.mockImplementation(async () => ({ data: { session: sdk.state.session }, error: null }));
  sdk.auth.signOut.mockImplementation(async () => { sdk.emit("SIGNED_OUT", null); return { error: null }; });
  sdk.browser.mockImplementation(async () => sdk.state.configured ? { auth: sdk.auth } : null);
  fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: true, email: "admin@example.test" }), {
    headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div"); document.body.appendChild(host);
});
afterEach(async () => {
  while (disposers.length) disposers.pop()?.();
  if (root) await act(async () => root!.unmount());
  root = null; host.remove(); vi.unstubAllGlobals();
});

describe("admin analytics session binding (authored, unrun)", () => {
  it("returns the existing ready/token/email contract and a fence for the actual SDK credential", async () => {
    await mount(); const captured = binding();
    expect(session()).toMatchObject({ state: "ready", token: original.access_token, email: "admin@example.test", signingIn: false, signInError: null });
    expect(captured.generation).not.toBe(""); expect(captured.isCurrent()).toBe(true);
    expect(captured.sessionFence(original)).toBe(true);
    fetcher.mockClear();
    await careApiFetch("/api/synthetic-admin-report", { method: "GET" }, captured.sessionFence);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("Authorization")).toBe(`Bearer ${original.access_token}`);
    expect(sdk.auth.signOut).not.toHaveBeenCalled();
  });
  it.each([
    null, credential("synthetic-admin-B"), credential(original.access_token, userB), credential("synthetic-admin-recovery"),
  ])("refuses dispatch when the actual SDK result differs from the displayed credential: %s", async (actual) => {
    await mount(); const captured = binding(); sdk.state.session = actual; fetcher.mockClear();
    expect(captured.sessionFence(actual)).toBe(false);
    await expect(careApiFetch("/api/synthetic-admin-report", {}, captured.sessionFence)).rejects.toThrow("current Care session");
    expect(fetcher).not.toHaveBeenCalled(); expect(sdk.auth.signOut).not.toHaveBeenCalled();
  });
  it.each([
    ["changed credential", "failure", credential("synthetic-admin-B", userB)],
    ["same-token changed user", "failure", credential(original.access_token, userB)],
    ["changed credential", "not verified", credential("synthetic-admin-B", userB)],
    ["same-token changed user", "not verified", credential(original.access_token, userB)],
  ] as const)("clears the displayed email on %s before the new lookup resolves with %s", async (_label, outcome, next) => {
    await mount(); expect(session().email).toBe("admin@example.test");
    const lookup = deferred<Response>(); fetcher.mockReturnValueOnce(lookup.promise);
    await act(async () => { sdk.emit("SIGNED_IN", next); });
    expect(session().email).toBeNull();
    expect(fetcher.mock.calls.filter(([path]) => path === "/api/admin/me")).toHaveLength(2);
    await act(async () => {
      if (outcome === "failure") lookup.reject(new Error("synthetic_new_identity_lookup_failure"));
      else lookup.resolve(new Response(JSON.stringify({ success: false, email: "unverified@example.test" })));
    });
    expect(session().email).toBeNull();
  });
  it.each([
    ["changed credential", credential("synthetic-admin-B", userB)],
    ["same-token changed user", credential(original.access_token, userB)],
  ] as const)("does not read a late prior-identity email response after %s, even before effect cleanup", async (_label, next) => {
    const lookup = deferred<Response>();
    fetcher.mockReturnValueOnce(lookup.promise).mockRejectedValueOnce(new Error("synthetic_new_identity_lookup_failure"));
    await mount();
    const oldResponse = new Response(JSON.stringify({ success: true, email: "old@example.test" }));
    const read = vi.spyOn(oldResponse, "json");
    await act(async () => {
      sdk.emit("SIGNED_IN", next); lookup.resolve(oldResponse);
      // Run the old fetch continuation inside this act callback, before React
      // flushes its queued identity change and invokes the old effect cleanup.
      await Promise.resolve(); await Promise.resolve();
      expect(read).not.toHaveBeenCalled();
    });
    expect(session().email).toBeNull();
  });
  it.each([
    ["changed credential", credential("synthetic-admin-B", userB)],
    ["same-token changed user", credential(original.access_token, userB)],
  ] as const)("rejects a late prior-identity email body after %s while the new lookup fails", async (_label, next) => {
    const body = deferred<unknown>(); const response = new Response("{}");
    const read = vi.spyOn(response, "json").mockImplementation(() => body.promise);
    fetcher.mockResolvedValueOnce(response).mockRejectedValueOnce(new Error("synthetic_new_identity_lookup_failure"));
    await mount(); expect(read).toHaveBeenCalledTimes(1);
    await act(async () => {
      sdk.emit("SIGNED_IN", next); body.resolve({ success: true, email: "old@example.test" });
      await Promise.resolve(); await Promise.resolve();
    });
    expect(session().email).toBeNull();
  });
  it.each(["SIGNED_OUT", "SIGNED_IN", "PASSWORD_RECOVERY"] as const)("ignores a late bootstrap after newer %s", async (event) => {
    const bootstrap = deferred<Awaited<ReturnType<typeof sdk.auth.getSession>>>();
    sdk.auth.getSession.mockReturnValueOnce(bootstrap.promise);
    await mount(); expect(session().state).toBe("loading");
    expect(sdk.auth.onAuthStateChange.mock.invocationCallOrder[0]).toBeLessThan(sdk.auth.getSession.mock.invocationCallOrder[0]);
    const next = event === "SIGNED_OUT" ? null : credential("synthetic-current-B", userB);
    await act(async () => { sdk.emit(event, next); });
    const newer = session().binding;
    await act(async () => { bootstrap.resolve({ data: { session: original }, error: null }); });
    expect(session().token).toBe(next?.access_token ?? null);
    if (event === "SIGNED_IN") {
      expect(binding()).toBe(newer); expect(binding().sessionFence(next)).toBe(true); expect(binding().sessionFence(original)).toBe(false);
    } else expect(session().binding).toBeNull();
  });
  it.each([credential("synthetic-admin-recovery"), { access_token: "legacy-token-without-user" } as Session])(
    "keeps legacy ready/token behavior but supplies no reporting binding for unsupported credentials: %s", async (value) => {
      sdk.state.session = value; await mount();
      expect(session().state).toBe("ready"); expect(session().token).toBe(value.access_token); expect(session().binding).toBeNull();
    },
  );
  it("synchronously revokes old references on token refresh and never reuses a prior generation", async () => {
    await mount(); const first = binding();
    await act(async () => {
      sdk.emit("TOKEN_REFRESHED", credential("synthetic-refreshed"));
      expect(first.isCurrent()).toBe(false); expect(first.sessionFence(original)).toBe(false);
    });
    const second = binding(); expect(second.generation).not.toBe(first.generation);
    await act(async () => { sdk.emit("TOKEN_REFRESHED", original); });
    const third = binding(); expect(new Set([first.generation, second.generation, third.generation]).size).toBe(3);
    expect(second.isCurrent()).toBe(false); expect(third.sessionFence(original)).toBe(true);
  });
  it("synchronously revokes a same-token binding when the observed SDK user changes", async () => {
    await mount(); const first = binding(); const replacement = credential(original.access_token, userB);
    await act(async () => { sdk.emit("SIGNED_IN", replacement); expect(first.isCurrent()).toBe(false); });
    expect(binding().generation).not.toBe(first.generation); expect(binding().sessionFence(replacement)).toBe(true);
    expect(binding().sessionFence(original)).toBe(false);
  });
  it("retains the current binding for repeated observation of the same ordinary credential", async () => {
    await mount(); const captured = binding();
    const reads = sdk.auth.getSession.mock.calls.length;
    await act(async () => { expect(sdk.listeners[0].callback("SIGNED_IN", original)).toBeUndefined(); });
    expect(binding()).toBe(captured); expect(sdk.auth.getSession).toHaveBeenCalledTimes(reads);
  });
  it.each(["SIGNED_OUT", "PASSWORD_RECOVERY"] as const)("revokes immediately on %s and refuses stale refresh/bootstrap events", async (event) => {
    await mount(); const captured = binding();
    await act(async () => {
      sdk.emit(event, event === "SIGNED_OUT" ? null : original);
      expect(captured.isCurrent()).toBe(false);
      sdk.emit("TOKEN_REFRESHED", original); sdk.emit("INITIAL_SESSION", original);
    });
    expect(session().binding).toBeNull();
    await act(async () => { sdk.emit("SIGNED_IN", credential("synthetic-new-login")); });
    expect(binding().generation).not.toBe(captured.generation);
  });
  it("revokes before awaiting pre-signout tasks and coalesces the existing signout operation", async () => {
    await mount(); const captured = binding(); const cleanup = deferred<void>(); const order: string[] = [];
    disposers.push(registerAdminPreSignOutTask(async () => { order.push("cleanup:start"); await cleanup.promise; order.push("cleanup:done"); }));
    sdk.auth.signOut.mockImplementation(async () => { order.push("auth:signout"); sdk.emit("SIGNED_OUT", null); return { error: null }; });
    let pending!: Promise<void>;
    await act(async () => {
      pending = session().signOut(); expect(captured.isCurrent()).toBe(false);
      expect(session().signOut()).toBe(pending);
    });
    expect(session().binding).toBeNull(); expect(session().token).toBe(original.access_token);
    expect(order).toEqual(["cleanup:start"]); expect(sdk.auth.signOut).not.toHaveBeenCalled();
    await act(async () => { sdk.emit("TOKEN_REFRESHED", credential("synthetic-background-refresh")); });
    expect(session().binding).toBeNull();
    await act(async () => { cleanup.resolve(); await pending; });
    expect(order).toEqual(["cleanup:start", "cleanup:done", "auth:signout"]); expect(session().state).toBe("signed_out");
  });
  it("keeps reporting revoked after cleanup failure and background refresh, while preserving a clean retry", async () => {
    await mount(); const captured = binding(); await failCleanup();
    expect(captured.isCurrent()).toBe(false); expect(session().binding).toBeNull(); expect(session().state).toBe("ready");
    expect(sdk.auth.signOut).not.toHaveBeenCalled();
    await act(async () => { sdk.emit("TOKEN_REFRESHED", credential("synthetic-after-failure")); });
    expect(session().binding).toBeNull();
    await act(async () => { await session().signOut(); }); expect(sdk.auth.signOut).toHaveBeenCalledTimes(1);
  });
  it("preserves an auth signout error without reopening the reporting binding", async () => {
    await mount(); const captured = binding(); const failure = new Error("synthetic_auth_signout_failure");
    sdk.auth.signOut.mockRejectedValueOnce(failure);
    await act(async () => { await expect(session().signOut()).rejects.toBe(failure); });
    expect(captured.isCurrent()).toBe(false); expect(session().binding).toBeNull();
    expect(session().token).toBe(original.access_token);
  });
  it("permits a fresh binding after a genuine later explicit login following cleanup failure", async () => {
    await mount(); const prior = binding(); await failCleanup(); const next = credential("synthetic-explicit-login");
    sdk.auth.signInWithPassword.mockImplementation(async () => { sdk.emit("SIGNED_IN", next); return { data: { session: next }, error: null }; });
    await act(async () => { await session().signIn("admin@example.test", "synthetic-password"); });
    expect(binding().sessionFence(next)).toBe(true); expect(binding().generation).not.toBe(prior.generation);
    expect(prior.isCurrent()).toBe(false);
  });
  it("does not reopen reporting when an older successful signIn finishes after a newer signout", async () => {
    await mount(); await failCleanup(); const pending = deferred<Awaited<ReturnType<typeof sdk.auth.signInWithPassword>>>();
    sdk.auth.signInWithPassword.mockReturnValueOnce(pending.promise); let login!: Promise<void>;
    await act(async () => { login = session().signIn("admin@example.test", "synthetic-password"); sdk.emit("SIGNED_IN", original); });
    await act(async () => { await session().signOut(); });
    await act(async () => { pending.resolve({ data: { session: original }, error: null }); await login; });
    expect(session().binding).toBeNull(); expect(session().state).toBe("signed_out");
  });
  it("does not reopen reporting when a newer SDK identity supersedes a pending explicit login", async () => {
    await mount(); await failCleanup(); const pending = deferred<Awaited<ReturnType<typeof sdk.auth.signInWithPassword>>>();
    sdk.auth.signInWithPassword.mockReturnValueOnce(pending.promise); let login!: Promise<void>;
    await act(async () => {
      login = session().signIn("admin@example.test", "synthetic-password"); sdk.emit("SIGNED_IN", original);
      sdk.emit("SIGNED_IN", credential("synthetic-other-user", userB));
    });
    await act(async () => { pending.resolve({ data: { session: original }, error: null }); await login; });
    expect(session().binding).toBeNull(); expect(session().token).toBe("synthetic-other-user");
  });
  it("lets only the latest explicit login completion release a revoked binding", async () => {
    await mount(); await failCleanup();
    const first = deferred<Awaited<ReturnType<typeof sdk.auth.signInWithPassword>>>();
    const second = deferred<Awaited<ReturnType<typeof sdk.auth.signInWithPassword>>>();
    sdk.auth.signInWithPassword.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const next = credential("synthetic-latest-login", userB); let loginA!: Promise<void>, loginB!: Promise<void>;
    await act(async () => {
      loginA = session().signIn("first@example.test", "synthetic-password"); sdk.emit("SIGNED_IN", original);
      loginB = session().signIn("second@example.test", "synthetic-password"); sdk.emit("SIGNED_IN", next);
    });
    await act(async () => { second.resolve({ data: { session: next }, error: null }); await loginB; });
    const latest = binding();
    await act(async () => { first.resolve({ data: { session: original }, error: null }); await loginA; });
    expect(binding()).toBe(latest); expect(latest.sessionFence(next)).toBe(true); expect(latest.sessionFence(original)).toBe(false);
  });
  it("revokes on unmount and ignores late login completion and saved SDK callbacks", async () => {
    await mount(); const captured = binding(); const listener = sdk.listeners[0];
    const pending = deferred<Awaited<ReturnType<typeof sdk.auth.signInWithPassword>>>();
    sdk.auth.signInWithPassword.mockReturnValueOnce(pending.promise); let login!: Promise<void>;
    await act(async () => { login = session().signIn("admin@example.test", "synthetic-password"); });
    await act(async () => { root!.unmount(); root = null; }); const afterUnmount = renders;
    expect(captured.isCurrent()).toBe(false); expect(listener.unsubscribe).toHaveBeenCalledTimes(1);
    await act(async () => { listener.callback("SIGNED_IN", original); pending.resolve({ data: { session: original }, error: null }); await login; });
    expect(renders).toBe(afterUnmount); expect(captured.sessionFence(original)).toBe(false);
  });
  it("never reuses a StrictMode-remounted generation and ignores its disposed listener", async () => {
    await mount(true); const first = binding(); const old = sdk.listeners.find((listener) => listener.active)!;
    await mount(true, "replacement"); const second = binding();
    expect(first.isCurrent()).toBe(false); expect(second.generation).not.toBe(first.generation);
    expect(old.unsubscribe).toHaveBeenCalledTimes(1); expect(sdk.listeners.filter((listener) => listener.active)).toHaveLength(1);
    await act(async () => { old.callback("PASSWORD_RECOVERY", original); });
    expect(binding()).toBe(second); expect(second.isCurrent()).toBe(true);
  });
  it("does not subscribe or update after browser discovery resolves following unmount", async () => {
    const browser = deferred<Awaited<ReturnType<typeof sdk.browser>>>(); sdk.browser.mockReturnValueOnce(browser.promise);
    await mount(); await act(async () => { root!.unmount(); root = null; }); const afterUnmount = renders;
    await act(async () => { browser.resolve({ auth: sdk.auth }); });
    expect(sdk.auth.onAuthStateChange).not.toHaveBeenCalled(); expect(renders).toBe(afterUnmount);
  });
  it("returns null binding for an unconfigured identity provider", async () => {
    sdk.state.configured = false; await mount();
    expect(session()).toMatchObject({ state: "unconfigured", token: null, binding: null });
  });
  it("fails closed on bootstrap rejection", async () => {
    sdk.auth.getSession.mockRejectedValueOnce(new Error("synthetic_sdk_failure")); await mount();
    expect(session()).toMatchObject({ state: "signed_out", token: null, binding: null });
  });
});

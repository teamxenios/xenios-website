// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AE_APPLICATION_CONTEXT_PATH, AE_PORTAL_PATH } from "@shared/research/account-executive/context";
import { researchAuthPath } from "@shared/research/auth-return-to";
import type { AeWorkspace } from "@shared/research/account-executive/workspace";

const sdk = vi.hoisted(() => ({ getClient: vi.fn(), getSession: vi.fn(), unsubscribe: vi.fn(),
  listeners: new Set<(event: string, session: Session | null) => void>(),
  callbacks: [] as Array<(event: string, session: Session | null) => void> }));
vi.mock("@/lib/supabaseBrowser", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/supabaseBrowser")>(), getSupabaseBrowser: () => sdk.getClient(),
}));
// Leave PageShell, SeoHead, the actual page, strict schemas and API untouched.
// Only the unrelated public waitlist counter is disconnected from network.
vi.mock("@/hooks/use-waitlist-count", () => ({ useWaitlistCount: () => 0 }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-11-18T14:00:00.000Z";
let sequence = 100, host: HTMLDivElement, root: Root, currentSession: Session | null, serverScope: string;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
let AePortalRoute: typeof import("./AePortalRoute").AePortalRoute;
const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function sessionIdOf(value: Session): string {
  const payload = value.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))).session_id;
}
function session(subject = id(1), sessionId = id(++sequence), suffix = "ordinary", recovery = false): Session {
  const payload = encode({ sub: subject, session_id: sessionId, amr: [{ method: recovery ? "recovery" : "password" }] });
  return { access_token: "e30." + payload + "." + suffix, refresh_token: "synthetic-only", token_type: "bearer", expires_in: 3600,
    user: { id: subject, aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: at } };
}
function workspace(subject = currentSession!.user.id, scope = serverScope): AeWorkspace {
  return { schemaVersion: 1, actorAuthUserId: subject, scopeId: scope, generatedAt: at,
    capabilities: ["workspace:read", "customer:contact", "followup:record", "customer:reassign"], customers: [{
      assignment: { id: id(3), scopeId: scope, customerAuthUserId: id(4), assigneeAuthUserId: subject, revision: 3 },
      assignmentHistory: { state: "unavailable" }, followupsCompleteness: "historical_unavailable", followups: [],
      contact: { state: "available", displayName: "Synthetic AE customer", email: "synthetic-ae@example.invalid", phone: null },
      referral: { state: "unavailable" }, requests: [],
    }] };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const context = (scope = serverScope) => json({ ok: true, value: { scopeId: scope } });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const sdkResult = (value: Session | null) => ({ data: { session: value }, error: null });
const contextCalls = () => fetcher.mock.calls.filter(([path]) => path === AE_APPLICATION_CONTEXT_PATH);
const workspaceCalls = () => fetcher.mock.calls.filter(([path]) => path === "/api/research/account-executive/workspace");
const postCalls = () => fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
function noCustomer() { expect(host.textContent).not.toContain("Synthetic AE customer"); expect(host.textContent).not.toContain("synthetic-ae@example.invalid"); }
async function mount() { await act(async () => root.render(<AePortalRoute />)); }
async function emit(event: string, value: Session | null) {
  currentSession = value; await act(async () => { for (const callback of [...sdk.listeners]) callback(event, value); });
}
const button = (text: string) => [...host.querySelectorAll("button")].find(node => node.textContent === text);
async function click(text: string) { const node = button(text); expect(node, text).toBeDefined(); await act(async () => node!.click()); }
async function reassign() {
  await click("Reassign customer"); (host.querySelector('[name="assignee"]') as HTMLInputElement).value = id(12);
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
beforeEach(async () => {
  // Each case starts a fresh browser-module lifetime. Remounts within a case
  // retain the real module journal/latch and never use a test-only reset API.
  vi.resetModules();
  currentSession = session(); serverScope = id(2); sdk.listeners.clear(); sdk.callbacks.length = 0;
  sdk.getSession.mockReset().mockImplementation(async () => sdkResult(currentSession)); sdk.unsubscribe.mockReset();
  sdk.getClient.mockReset().mockResolvedValue({ auth: { getSession: sdk.getSession,
    onAuthStateChange: (callback: (event: string, value: Session | null) => void) => {
      sdk.listeners.add(callback); sdk.callbacks.push(callback);
      return { data: { subscription: { unsubscribe: () => { sdk.unsubscribe(); sdk.listeners.delete(callback); } } } };
    } } });
  fetcher = vi.fn<typeof fetch>().mockImplementation(async path => {
    if (path === AE_APPLICATION_CONTEXT_PATH) return context();
    if (path === "/api/research/account-executive/workspace") return json({ ok: true, value: workspace() });
    throw new Error("Unexpected synthetic transport path");
  }); vi.stubGlobal("fetch", fetcher);
  vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000090");
  window.history.replaceState({}, "", AE_PORTAL_PATH);
  ({ AePortalRoute } = await import("./AePortalRoute"));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await emit("SIGNED_OUT", null); await act(async () => root.unmount()); host.remove();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("canonical AE application route shell", () => {
  it("loads only server context and the current private workspace through the actual page", async () => {
    await mount(); expect(host.textContent).toContain("Synthetic AE customer");
    expect(contextCalls()).toHaveLength(1); expect(workspaceCalls()).toHaveLength(1);
    expect(contextCalls()[0][1]).toMatchObject({ method: "GET", cache: "no-store", credentials: "same-origin", redirect: "error",
      headers: { Authorization: "Bearer " + currentSession!.access_token, Accept: "application/json" } });
    expect(contextCalls()[0][1]?.body).toBeUndefined(); expect(sdk.getClient).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll("main")).toHaveLength(1); expect(host.querySelectorAll("h1")).toHaveLength(1);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
  });
  it("renders a helpful signed-out state and the canonical closed return-to link", async () => {
    currentSession = null; await mount(); noCustomer(); expect(contextCalls()).toHaveLength(0);
    expect(host.textContent).toContain("Sign-in required"); expect(host.querySelectorAll("h1")).toHaveLength(1);
    const link = [...host.querySelectorAll("a")].find(node => node.textContent === "Sign in securely");
    expect(link?.getAttribute("href")).toBe(researchAuthPath("/research/sign-in", AE_PORTAL_PATH));
  });
  it("does not let a late bootstrap or closed-session sign-in reopen after sign-out", async () => {
    const original = currentSession!, bootstrap = deferred<ReturnType<typeof sdkResult>>(); sdk.getSession.mockReturnValueOnce(bootstrap.promise);
    await mount(); await emit("SIGNED_OUT", null); noCustomer();
    await act(async () => bootstrap.resolve(sdkResult(original)));
    await emit("INITIAL_SESSION", original); await emit("SIGNED_IN", original);
    noCustomer(); expect(contextCalls()).toHaveLength(0); expect(host.textContent).toContain("Sign-in required");
  });
  it("keeps recovery closed to old ordinary events and a delayed initial session", async () => {
    const original = currentSession!, bootstrap = deferred<ReturnType<typeof sdkResult>>(); sdk.getSession.mockReturnValueOnce(bootstrap.promise);
    await mount(); await emit("PASSWORD_RECOVERY", session(original.user.id, id(++sequence), "recovery", true));
    await act(async () => bootstrap.resolve(sdkResult(original))); await emit("TOKEN_REFRESHED", original);
    expect(host.textContent).toContain("Recovery session"); noCustomer(); expect(contextCalls()).toHaveLength(0);
  });
  it.each(["SIGNED_OUT", "PASSWORD_RECOVERY"] as const)("blocks late refresh after %s BEFORE unknown bootstrap resolves", async event => {
    const original = currentSession!, bootstrap = deferred<ReturnType<typeof sdkResult>>(); sdk.getSession.mockReturnValueOnce(bootstrap.promise);
    await mount();
    await emit(event, event === "SIGNED_OUT" ? null : session(original.user.id, id(++sequence), "different-recovery-session", true));
    // The unseen old identity has not been learned from getSession yet. This
    // exact ordering previously started context and private workspace reads.
    await emit("TOKEN_REFRESHED", original);
    expect(contextCalls()).toHaveLength(0); expect(workspaceCalls()).toHaveLength(0); noCustomer();
    expect(host.textContent).toContain(event === "SIGNED_OUT" ? "Sign-in required" : "Recovery session");
    await act(async () => bootstrap.resolve(sdkResult(original)));
    await emit("TOKEN_REFRESHED", original);
    expect(contextCalls()).toHaveLength(0); expect(workspaceCalls()).toHaveLength(0); noCustomer();
  });
  it("does not treat unseen old SIGNED_IN as fresh merely because no closed ID was known", async () => {
    const original = currentSession!, bootstrap = deferred<ReturnType<typeof sdkResult>>(); sdk.getSession.mockReturnValueOnce(bootstrap.promise);
    await mount(); await emit("SIGNED_OUT", null); await emit("SIGNED_IN", original);
    expect(contextCalls()).toHaveLength(0); noCustomer();
    await act(async () => bootstrap.resolve(sdkResult(original)));
    expect(contextCalls()).toHaveLength(0); expect(workspaceCalls()).toHaveLength(0); noCustomer();
    expect(host.textContent).toContain("Sign-in required");
  });
  it("admits a genuine different-session sign-in only after the held old identity is actually learned", async () => {
    const original = currentSession!, bootstrap = deferred<ReturnType<typeof sdkResult>>(); sdk.getSession.mockReturnValueOnce(bootstrap.promise);
    await mount(); await emit("SIGNED_OUT", null);
    const fresh = session(original.user.id); await emit("SIGNED_IN", fresh);
    const refreshed = session(fresh.user.id, sessionIdOf(fresh), "fresh-refreshed"); await emit("TOKEN_REFRESHED", refreshed);
    expect(contextCalls()).toHaveLength(0); expect(workspaceCalls()).toHaveLength(0); noCustomer();
    expect(host.textContent).toContain("Checking your session…");
    await act(async () => bootstrap.resolve(sdkResult(original)));
    expect(contextCalls()).toHaveLength(1); expect(workspaceCalls()).toHaveLength(1);
    expect(contextCalls()[0][1]?.headers).toMatchObject({ Authorization: "Bearer " + refreshed.access_token });
    expect(host.textContent).toContain("Synthetic AE customer");
  });
  it("a newer sign-out retires a still-held fresh-signin intent rather than reviving it later", async () => {
    const original = currentSession!, bootstrap = deferred<ReturnType<typeof sdkResult>>(); sdk.getSession.mockReturnValueOnce(bootstrap.promise);
    await mount(); await emit("SIGNED_OUT", null);
    const fresh = session(original.user.id); await emit("SIGNED_IN", fresh); await emit("SIGNED_OUT", null);
    await act(async () => bootstrap.resolve(sdkResult(original)));
    await emit("TOKEN_REFRESHED", fresh); await emit("SIGNED_IN", fresh);
    expect(contextCalls()).toHaveLength(0); expect(workspaceCalls()).toHaveLength(0); noCustomer();
    expect(host.textContent).toContain("Sign-in required");
  });
  it.each([["SIGNED_OUT", "reject"], ["SIGNED_OUT", "error"], ["PASSWORD_RECOVERY", "reject"],
    ["PASSWORD_RECOVERY", "error"]] as const)("keeps unknown old identity after pending signin, repeated %s and bootstrap %s, including remount", async (secondClose, failure) => {
    const original = currentSession!, bootstrap = deferred<{ data: { session: Session | null }; error: Error | null }>();
    sdk.getSession.mockReturnValueOnce(bootstrap.promise); await mount(); await emit("SIGNED_OUT", null);
    const pendingSignin = session(original.user.id); await emit("SIGNED_IN", pendingSignin);
    await emit(secondClose, secondClose === "SIGNED_OUT" ? null : session(original.user.id, id(++sequence), "different-recovery-session", true));
    expect(contextCalls()).toHaveLength(0); expect(workspaceCalls()).toHaveLength(0); noCustomer();
    await act(async () => {
      if (failure === "reject") bootstrap.reject(new Error("synthetic old bootstrap failed"));
      else bootstrap.resolve({ data: { session: null }, error: new Error("synthetic old bootstrap failed") });
    });
    // Retiring the never-admitted new intent did not reveal the original old
    // session. Its different ID must not become false freshness evidence.
    await emit("SIGNED_IN", original);
    expect(contextCalls()).toHaveLength(0); expect(workspaceCalls()).toHaveLength(0); noCustomer();
    // Unknown evidence must survive another closure, not just the first error.
    await emit(secondClose, secondClose === "SIGNED_OUT" ? null : session(original.user.id, id(++sequence), "later-recovery-session", true));
    await emit("SIGNED_IN", original);
    expect(contextCalls()).toHaveLength(0); expect(workspaceCalls()).toHaveLength(0); noCustomer();
    await act(async () => root.unmount()); root = createRoot(host); currentSession = original; await mount();
    await emit("TOKEN_REFRESHED", original); await emit("SIGNED_IN", original);
    expect(contextCalls()).toHaveLength(0); expect(workspaceCalls()).toHaveLength(0); noCustomer();
    expect(host.textContent).not.toContain("synthetic old bootstrap failed");
  });
  it("keeps the old session closed across remount and admits actual new canonical sign-in session evidence", async () => {
    const original = currentSession!, bootstrap = deferred<ReturnType<typeof sdkResult>>(); sdk.getSession.mockReturnValueOnce(bootstrap.promise);
    await mount(); await emit("SIGNED_OUT", null); await act(async () => bootstrap.resolve(sdkResult(original)));
    await act(async () => root.unmount()); root = createRoot(host); currentSession = original; await mount();
    noCustomer(); expect(contextCalls()).toHaveLength(0);
    await act(async () => root.unmount()); root = createRoot(host);
    // The global canonical sign-in completed while this route was unmounted.
    currentSession = session(original.user.id); await mount();
    expect(contextCalls()).toHaveLength(1); expect(workspaceCalls()).toHaveLength(1);
    expect(host.textContent).toContain("Synthetic AE customer");
  });
  it("does not turn a hung bootstrap or an expired fresh-signin intent into permission", async () => {
    vi.useFakeTimers(); const original = currentSession!, bootstrap = deferred<ReturnType<typeof sdkResult>>();
    sdk.getSession.mockReturnValueOnce(bootstrap.promise); await mount(); await emit("SIGNED_OUT", null);
    await emit("TOKEN_REFRESHED", original); await emit("SIGNED_IN", session(original.user.id));
    expect(contextCalls()).toHaveLength(0); expect(workspaceCalls()).toHaveLength(0); noCustomer();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(contextCalls()).toHaveLength(0); expect(workspaceCalls()).toHaveLength(0); noCustomer();
    await act(async () => bootstrap.resolve(sdkResult(original)));
    expect(contextCalls()).toHaveLength(0); noCustomer(); expect(host.textContent).toContain("Sign-in required");
  });
  it("keeps error/unknown bootstrap closed to later refresh and unproven ordinary signin", async () => {
    const original = currentSession!, bootstrap = deferred<ReturnType<typeof sdkResult>>(); sdk.getSession.mockReturnValueOnce(bootstrap.promise);
    await mount(); await emit("SIGNED_OUT", null); await emit("TOKEN_REFRESHED", original);
    await act(async () => bootstrap.reject(new Error("synthetic bootstrap failure")));
    await emit("TOKEN_REFRESHED", original); await emit("SIGNED_IN", original);
    expect(contextCalls()).toHaveLength(0); expect(workspaceCalls()).toHaveLength(0); noCustomer();
    expect(host.textContent).toContain("Sign-in required"); expect(host.textContent).not.toContain("synthetic bootstrap failure");
  });
  it("permits genuine fresh sign-in after an actual pre-closure canonical absence observation", async () => {
    currentSession = null; await mount(); await emit("SIGNED_OUT", null);
    await emit("SIGNED_IN", session());
    expect(contextCalls()).toHaveLength(1); expect(workspaceCalls()).toHaveLength(1);
    expect(host.textContent).toContain("Synthetic AE customer");
  });
  it("aborts held context and clears the private view synchronously on actual SDK credential change", async () => {
    await mount(); const old = currentSession!, held = deferred<Response>();
    fetcher.mockImplementationOnce(() => held.promise);
    await emit("TOKEN_REFRESHED", session(old.user.id, sessionIdOf(old), "token-2"));
    noCustomer(); const oldSignal = contextCalls().at(-1)![1]!.signal!;
    const newContext = deferred<Response>(); fetcher.mockImplementationOnce(() => newContext.promise);
    const next = session(old.user.id, sessionIdOf(old), "token-3");
    act(() => { currentSession = next; for (const callback of sdk.listeners) callback("TOKEN_REFRESHED", next); noCustomer(); });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => held.resolve(context())); noCustomer();
    await act(async () => newContext.resolve(context())); expect(host.textContent).toContain("Synthetic AE customer");
    expect(contextCalls().at(-1)![1]?.headers).toMatchObject({ Authorization: "Bearer " + next.access_token });
  });
  it("discards old actor context and refuses a subsequently returning closed actor", async () => {
    const original = currentSession!, held = deferred<Response>(); fetcher.mockImplementationOnce(() => held.promise);
    await mount(); const next = session(id(11)); await emit("SIGNED_IN", next);
    expect(host.textContent).toContain("Synthetic AE customer");
    await act(async () => held.resolve(context()));
    expect(workspaceCalls()).toHaveLength(1); expect(workspaceCalls()[0][1]?.headers).toMatchObject({ Authorization: "Bearer " + next.access_token });
    await emit("SIGNED_IN", original); noCustomer(); expect(contextCalls()).toHaveLength(2);
  });
  it.each(["missing-session-id", "mismatched-subject", "invalid-token"] as const)("does not dispatch for %s partition data", async kind => {
    if (kind === "missing-session-id") currentSession!.access_token = "e30." + encode({ sub: currentSession!.user.id }) + ".x";
    if (kind === "mismatched-subject") currentSession!.user.id = id(99);
    if (kind === "invalid-token") currentSession!.access_token = "not-a-token";
    await mount(); noCustomer(); expect(contextCalls()).toHaveLength(0); expect(host.textContent).toContain("AE workspace unavailable");
  });
  it.each([null, { ok: true, value: { scopeId: "00000000-0000-0000-0000-000000000000" } },
    { ok: true, value: { scopeId: id(2), role: "admin" } }, { ok: true, value: { scopeId: id(2) }, extra: true }])("refuses malformed context %j", async body => {
    fetcher.mockResolvedValueOnce(json(body)); await mount(); noCustomer(); expect(workspaceCalls()).toHaveLength(0);
    expect(host.textContent).toContain("AE workspace unavailable");
    expect(host.textContent).toContain("We couldn’t load your workspace. Try again or contact support.");
  });
  it("ignores URL scope hints and rejects a foreign-scope workspace response", async () => {
    window.history.replaceState({}, "", AE_PORTAL_PATH + "?scopeId=" + id(99));
    fetcher.mockResolvedValueOnce(context()).mockResolvedValueOnce(json({ ok: true, value: workspace(id(1), id(99)) }));
    await mount(); noCustomer(); expect(contextCalls()[0][0]).toBe(AE_APPLICATION_CONTEXT_PATH);
    expect(host.textContent).toContain("Workspace unavailable");
  });
  it.each([[401, "access_denied", "Sign-in verification required"], [403, "access_denied", "AE workspace access denied"],
    [429, "unavailable", "AE workspace unavailable"], [503, "unavailable", "AE workspace unavailable"]] as const)("honors actual context HTTP%s %s without an empty workspace", async (status, code, title) => {
    fetcher.mockResolvedValueOnce(json({ ok: false, code }, status)); await mount();
    expect(host.textContent).toContain(title); noCustomer(); expect(workspaceCalls()).toHaveLength(0);
    expect(host.textContent).not.toContain("No assigned customers");
  });
  it("offers the existing customer access exit from a denied context without opening the workspace", async () => {
    fetcher.mockResolvedValueOnce(json({ ok: false, code: "access_denied" }, 403));
    await mount();
    const link = [...host.querySelectorAll("a")].find(node => node.textContent === "Customer account access");
    expect(link?.getAttribute("href")).toBe("/research/access-state?code=account_access_required");
    expect(host.textContent).toContain("AE workspace access denied");
    expect(workspaceCalls()).toHaveLength(0); expect(postCalls()).toHaveLength(0); noCustomer();
  });
  it("keeps the same route-shell exit when context200 still leads to private workspace denial", async () => {
    fetcher.mockResolvedValueOnce(context()).mockResolvedValueOnce(json({ ok: false, code: "access_denied" }, 403));
    await mount();
    const link = [...host.querySelectorAll("a")].find(node => node.textContent === "Customer account access");
    expect(link?.getAttribute("href")).toBe("/research/access-state?code=account_access_required");
    expect(host.textContent).toContain("Workspace access denied");
    expect(contextCalls()).toHaveLength(1); expect(workspaceCalls()).toHaveLength(1);
    expect(postCalls()).toHaveLength(0); noCustomer();
  });
  it("retains the same pending/uncertain reassignment through real shell remount and token refresh", async () => {
    await mount(); const held = deferred<Response>(); fetcher.mockImplementationOnce(() => held.promise); await reassign();
    const original = String(postCalls()[0][1]!.body), old = currentSession!; noCustomer();
    await act(async () => root.unmount()); root = createRoot(host); await mount(); noCustomer();
    expect(host.textContent).toContain("An earlier command is still pending");
    await act(async () => held.reject(new Error("synthetic response lost"))); noCustomer();
    const refreshed = session(old.user.id, sessionIdOf(old), "refreshed");
    await emit("TOKEN_REFRESHED", refreshed); noCustomer(); expect(button("Retry the same command")).toBeDefined();
    fetcher.mockResolvedValueOnce(json({ ok: false, code: "not_found" }, 404)); await click("Retry the same command");
    expect(postCalls()).toHaveLength(2); expect(String(postCalls()[1][1]!.body)).toBe(original);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1); noCustomer(); expect(host.textContent).toContain("Workspace access denied");
  });
  it.each(["subject", "session-id", "scope"] as const)("destroys the old command journal on a real %s transition", async change => {
    await mount(); fetcher.mockRejectedValueOnce(new Error("response lost")); await reassign();
    expect(button("Retry the same command")).toBeDefined(); const old = currentSession!;
    if (change === "scope") serverScope = id(22);
    const next = session(change === "subject" ? id(11) : old.user.id,
      change === "session-id" || change === "subject" ? id(++sequence) : sessionIdOf(old), "new-context");
    await emit(change === "scope" ? "TOKEN_REFRESHED" : "SIGNED_IN", next);
    expect(button("Retry the same command")).toBeUndefined(); expect(button("Reassign customer")).toBeDefined();
  });
  it("unsubscribes and aborts held context; retained callbacks cannot dispatch after cleanup", async () => {
    const held = deferred<Response>(); fetcher.mockImplementationOnce(() => held.promise); await mount();
    const callback = sdk.callbacks.at(-1)!, signal = contextCalls()[0][1]!.signal!, original = currentSession!;
    await act(async () => root.unmount()); expect(signal.aborted).toBe(true); expect(sdk.listeners.size).toBe(0);
    await act(async () => { callback("SIGNED_IN", original); held.resolve(context()); });
    expect(contextCalls()).toHaveLength(1); expect(workspaceCalls()).toHaveLength(0);
    root = createRoot(host);
  });
  it("bounds a held context response and leaves late data unpublished", async () => {
    vi.useFakeTimers(); const held = deferred<Response>(); fetcher.mockImplementationOnce(() => held.promise); await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(contextCalls()[0][1]!.signal!.aborted).toBe(true); expect(host.textContent).toContain("AE workspace unavailable");
    await act(async () => held.resolve(context())); noCustomer(); expect(workspaceCalls()).toHaveLength(0);
  });
});

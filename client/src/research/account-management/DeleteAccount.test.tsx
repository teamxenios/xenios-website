// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeleteAccount, { DeleteAccountRoute, type LifecycleSession } from "./DeleteAccount";
import { unavailableLifecycle, type AccountLifecycleEnvelope } from "@shared/research/account-lifecycle";
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
type CanonicalSession = { access_token: string; user: { id: string } };
const consumer = vi.hoisted(() => {
  const listeners = new Set<(event: string, session: CanonicalSession | null) => void>();
  const state = { session: null as CanonicalSession | null };
  const auth = { getSession: vi.fn(async () => ({ data: { session: state.session }, error: null as Error | null })),
    onAuthStateChange: vi.fn((callback: (event: string, session: CanonicalSession | null) => void) => {
      listeners.add(callback); return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    }) };
  return { listeners, state, auth, client: { auth }, identity: vi.fn(), params: {} as { operationId?: string } };
});
vi.mock("wouter", () => ({ useParams: () => consumer.params }));
vi.mock("@/lib/supabaseBrowser", () => ({ getSupabaseBrowser: async () => consumer.client,
  isRecoveryAccessToken: (token: string) => token.endsWith(".recovery") }));
vi.mock("./api", () => ({ accountManagementApi: { identity: consumer.identity } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const actorId = "10000000-0000-4000-8000-000000000001", operationId = "20000000-0000-4000-8000-000000000002", hash = "a".repeat(64);
type Ready = Extract<LifecycleSession, { state: "ready" }>;
const a: Ready = { state: "ready", actorId, accessToken: "captured-A", instance: {} };
const b: Ready = { state: "ready", actorId: "30000000-0000-4000-8000-000000000003", accessToken: "captured-B", instance: {} };
let root: Root, host: HTMLDivElement, fetcher: ReturnType<typeof vi.fn<typeof fetch>>, preview: AccountLifecycleEnvelope;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function flush() { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); }
async function mount(session: LifecycleSession = a, initialOperationId?: string) { await act(async () => root.render(<DeleteAccount session={session} initialOperationId={initialOperationId} />)); await flush(); }
async function rotate(mode: "refresh" | "checking") {
  if (mode === "checking") { await mount({ state: "checking", actorId: a.actorId, instance: a.instance });
    expect(host.querySelector("button")).toBeNull(); expect(host.textContent).not.toContain(operationId); }
  const rotated: Ready = { ...a, accessToken: "rotated-A" }; await mount(rotated); return rotated;
}
async function click(text: string) { const node = [...host.querySelectorAll("button")].find(button => button.textContent === text)!;
  expect(node).toBeDefined(); await act(async () => node.click()); await flush(); }
beforeEach(() => {
  consumer.listeners.clear(); consumer.client = { auth: consumer.auth }; consumer.params = {}; consumer.state.session = null;
  consumer.auth.getSession.mockReset().mockImplementation(async () => ({ data: { session: consumer.state.session }, error: null }));
  consumer.identity.mockReset().mockImplementation(async (token: string) => ({ userId: JSON.parse(atob(token.split(".")[1])).sub }));
  preview = { ...unavailableLifecycle("policy_unavailable"), operationId, version: 1, state: "confirmation_required",
    preview: { digest: hash, expiresAt: new Date(Date.now() + 60000).toISOString(), policyRevision: hash, coverageRevision: hash }, blockers: [], nextAction: "confirm" };
  fetcher = vi.fn<typeof fetch>().mockImplementation(async path => String(path).endsWith("/attempt")
    ? json({ protocol: "account-lifecycle/v1", attemptCarrier: "x".repeat(40), expiresAt: preview.preview!.expiresAt }) : json(preview));
  vi.stubGlobal("fetch", fetcher); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});

const sessionA = "40000000-0000-4000-8000-000000000004", sessionB = "50000000-0000-4000-8000-000000000005";
function canonical(actor = actorId, sid = sessionA, suffix = "ordinary"): CanonicalSession {
  return { user: { id: actor }, access_token: "e30." + btoa(JSON.stringify({ sub: actor, session_id: sid })).replace(/=+$/u, "").replace(/\+/gu, "-").replace(/\//gu, "_") + "." + suffix };
}
async function route() { await act(async () => root.render(<DeleteAccountRoute />)); await flush(); }
async function notify(event: string, session: CanonicalSession | null, update = true) {
  if (update) consumer.state.session = session;
  await act(async () => { for (const listener of consumer.listeners) listener(event, session); }); await flush();
}

describe("actual canonical lifecycle route consumer", () => {
  it("checks the actual canonical bearer and server own identity before exposing controls, without mount-time lifecycle effects", async () => {
    consumer.state.session = canonical(); await route();
    expect(consumer.identity).toHaveBeenCalledExactlyOnceWith(consumer.state.session.access_token);
    expect(host.textContent).toContain("Review account closure"); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["SIGNED_OUT", "PASSWORD_RECOVERY", "TOKEN_REFRESHED"])("fences a retained DOM button synchronously during %s before React rerenders", async event => {
    consumer.state.session = canonical(); await route(); const oldButton = host.querySelector("button")!;
    const next = event === "SIGNED_OUT" ? null : canonical(actorId, event === "PASSWORD_RECOVERY" ? sessionB : sessionA,
      event === "PASSWORD_RECOVERY" ? "recovery" : "rotated");
    await act(async () => { consumer.state.session = next; for (const listener of consumer.listeners) listener(event, next); oldButton.click(); });
    await flush(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("retains a lost prepare's exact carrier through real same-session TOKEN_REFRESHED and concealed identity checking", async () => {
    consumer.state.session = canonical(); await route();
    fetcher.mockResolvedValueOnce(json({ protocol: "account-lifecycle/v1", attemptCarrier: "x".repeat(40), expiresAt: preview.preview!.expiresAt }));
    fetcher.mockRejectedValueOnce(Error("lost prepare reply")); await click("Review account closure");
    const held = deferred<{ userId: string }>(); consumer.identity.mockReturnValueOnce(held.promise);
    const refreshed = canonical(actorId, sessionA, "rotated"); await notify("TOKEN_REFRESHED", refreshed);
    expect(host.querySelector("button")).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(2);
    held.resolve({ userId: actorId }); await flush(); await click("Retry the same preview request");
    expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith("/attempt"))).toHaveLength(1);
    expect(fetcher.mock.calls.slice(1).map(([, options]) => options?.body)).toEqual([
      JSON.stringify({ attemptCarrier: "x".repeat(40) }), JSON.stringify({ attemptCarrier: "x".repeat(40) })]);
    expect(fetcher.mock.calls[2][1]?.headers).toMatchObject({ Authorization: `Bearer ${refreshed.access_token}` });
  });
  it("keeps a known unknown-provider operation status-only across actual canonical token refresh", async () => {
    consumer.state.session = canonical(); await route();
    const unknown: AccountLifecycleEnvelope = { ...preview, state: "auth_outcome_unknown", preview: null,
      progress: { ...preview.progress, application: "verified", authIdentity: "unknown" }, blockers: ["provider_outcome_unknown"], nextAction: "authorized_review" };
    fetcher.mockResolvedValueOnce(json({ protocol: "account-lifecycle/v1", attemptCarrier: "x".repeat(40), expiresAt: preview.preview!.expiresAt }));
    fetcher.mockResolvedValueOnce(json(unknown)); await click("Review account closure");
    const refreshed = canonical(actorId, sessionA, "rotated"); await notify("TOKEN_REFRESHED", refreshed);
    expect([...host.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Check current status"]);
    fetcher.mockResolvedValueOnce(json(unknown)); await click("Check current status");
    expect(fetcher.mock.calls[2][1]).toMatchObject({ method: "GET", headers: { Authorization: `Bearer ${refreshed.access_token}` } });
    expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith("/attempt"))).toHaveLength(1);
  });
  it.each(["SIGNED_OUT", "PASSWORD_RECOVERY"])("retires A after %s across late callbacks, changed token with same SID and remount", async event => {
    const original = canonical(); consumer.state.session = original; await route();
    await notify(event, event === "SIGNED_OUT" ? null : canonical(actorId, sessionB, "recovery"));
    const count = consumer.identity.mock.calls.length;
    for (const late of [original, canonical(actorId, sessionA, "late-rotation")]) {
      await notify("INITIAL_SESSION", late); await notify("TOKEN_REFRESHED", late);
    }
    await act(async () => root.render(<p>different route</p>)); await route();
    expect(consumer.identity).toHaveBeenCalledTimes(count); expect(host.querySelector("button")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    await notify("SIGNED_IN", canonical(actorId, "60000000-0000-4000-8000-000000000006"));
    expect(consumer.identity).toHaveBeenCalledTimes(count + 1); expect(host.textContent).toContain("Review account closure");
  });
  it.each(["null", "old", "foreign", "error", "hung"])("never trusts callback-only fresh SIGNED_IN when actual canonical probe is %s", async mode => {
    const original = canonical(); consumer.state.session = original; await route(); await notify("SIGNED_OUT", null);
    const count = consumer.identity.mock.calls.length;
    consumer.state.session = mode === "old" ? original : mode === "foreign" ? canonical(b.actorId, sessionB) : null;
    if (mode === "error") consumer.auth.getSession.mockResolvedValue({ data: { session: null }, error: Error("unavailable") });
    if (mode === "hung") consumer.auth.getSession.mockReturnValue(new Promise(() => {}));
    await notify("SIGNED_IN", canonical(actorId, sessionB), false);
    expect(consumer.identity).toHaveBeenCalledTimes(count); expect(host.querySelector("button")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["held-A", "unknown"])("keeps closure before bootstrap settlement denied through remount for %s evidence", async mode => {
    const held = deferred<{ data: { session: CanonicalSession | null }; error: Error | null }>();
    consumer.auth.getSession.mockReturnValueOnce(held.promise); await route(); await notify("SIGNED_OUT", null);
    held.resolve({ data: { session: mode === "held-A" ? canonical() : null }, error: mode === "unknown" ? Error("unknown") : null }); await flush();
    await act(async () => root.render(<p>different route</p>)); consumer.state.session = canonical(); await route();
    await notify("SIGNED_IN", canonical(actorId, sessionA, "same-SID-new-token"));
    expect(consumer.identity).not.toHaveBeenCalled(); expect(host.querySelector("button")).toBeNull();
    await notify("SIGNED_IN", canonical(actorId, sessionB));
    expect(consumer.identity).toHaveBeenCalledTimes(mode === "held-A" ? 1 : 0);
  });
  it("fences a held fresh-session proof after a newer signout, without private GET or resurrected controls", async () => {
    consumer.state.session = canonical(); await route(); await notify("SIGNED_OUT", null); consumer.identity.mockClear();
    const held = deferred<{ data: { session: CanonicalSession | null }; error: Error | null }>();
    consumer.auth.getSession.mockReturnValueOnce(held.promise); const next = canonical(actorId, sessionB);
    await notify("SIGNED_IN", next); await notify("SIGNED_OUT", null);
    held.resolve({ data: { session: next }, error: null }); await flush();
    expect(consumer.identity).not.toHaveBeenCalled(); expect(host.querySelector("button")).toBeNull();
  });
  it("conceals A while B is proven and rejects A's late identity result or callbacks", async () => {
    const held = deferred<{ userId: string }>(); consumer.identity.mockReturnValueOnce(held.promise);
    const original = canonical(); consumer.state.session = original; await route();
    await notify("SIGNED_IN", canonical(b.actorId, sessionB));
    held.resolve({ userId: actorId }); await flush(); await notify("TOKEN_REFRESHED", original, false);
    await click("Review account closure");
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: `Bearer ${canonical(b.actorId, sessionB).access_token}` });
  });
  it.each([null, "recovery", "wrong-owner", "malformed-session", "invalid-operation"])("makes no lifecycle request for %s", async mode => {
    consumer.state.session = mode === null ? null : mode === "recovery" ? canonical(actorId, sessionA, "recovery") : canonical();
    if (mode === "wrong-owner") consumer.identity.mockResolvedValue({ userId: b.actorId });
    if (mode === "malformed-session") consumer.state.session = { access_token: "not-a-session", user: { id: actorId } };
    if (mode === "invalid-operation") consumer.params = { operationId: "not-a-uuid" };
    await route(); expect(host.querySelector("button")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("resumes only an explicitly requested existing operation via status GET, without attempt or confirm on mount", async () => {
    consumer.state.session = canonical(); consumer.params = { operationId }; await route();
    expect(fetcher).not.toHaveBeenCalled(); await click("Check current status");
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("/self/operations/" + operationId),
      expect.objectContaining({ method: "GET", headers: expect.objectContaining({ Authorization: `Bearer ${consumer.state.session.access_token}` }) }));
  });
  it("offers only a safe locator after a known response and reconciles it after route departure/remount through explicit GET", async () => {
    const persist = vi.spyOn(Storage.prototype, "setItem"); consumer.state.session = canonical(); await route();
    expect(host.querySelector('a[href^="/research/account/delete/"]')).toBeNull(); await click("Review account closure");
    const link = host.querySelector<HTMLAnchorElement>('a[href="/research/account/delete/' + operationId + '"]')!;
    expect(link).not.toBeNull(); expect(link.getAttribute("referrerpolicy")).toBe("no-referrer"); expect(link.search).toBe("");
    expect(link.hash).toBe(""); expect(link.href).not.toContain("ordinary"); expect(link.href).not.toContain("x".repeat(40));
    const calls = fetcher.mock.calls.length, proofs = consumer.identity.mock.calls.length;
    await act(async () => root.render(<p>another route</p>)); consumer.params = { operationId }; await route();
    expect(consumer.identity).toHaveBeenCalledTimes(proofs + 1); expect(fetcher).toHaveBeenCalledTimes(calls);
    expect([...host.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Check current status"]);
    const unknown: AccountLifecycleEnvelope = { ...preview, state: "auth_outcome_unknown", preview: null,
      progress: { ...preview.progress, application: "verified", authIdentity: "unknown" }, blockers: ["provider_outcome_unknown"], nextAction: "authorized_review" };
    fetcher.mockResolvedValueOnce(json(unknown)); await click("Check current status");
    expect(fetcher.mock.calls[calls][1]?.method).toBe("GET"); expect(host.textContent).toContain("No second deletion will be sent");
    expect(persist).not.toHaveBeenCalled(); expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith("/attempt"))).toHaveLength(1);
  });
  it("does not turn a known locator into foreign-actor permission, failed-read clearance, or a new issue", async () => {
    consumer.state.session = canonical(b.actorId, sessionB); consumer.params = { operationId }; await route();
    fetcher.mockResolvedValueOnce(json({ protocol: "account-lifecycle/v1", code: "forbidden" }, 403)); await click("Check current status");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", headers: { Authorization: `Bearer ${consumer.state.session.access_token}` } });
    expect(host.textContent).toContain("existing operation has not been cleared or repeated");
    expect(host.querySelector('a[href="/research/account/delete/' + operationId + '"]')).toBeNull();
    expect([...host.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Check current status"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not display or request the prior operation after an explicit operation-route change", async () => {
    consumer.state.session = canonical(); consumer.params = { operationId }; await route(); await click("Check current status");
    expect(host.textContent).toContain(operationId); const next = "70000000-0000-4000-8000-000000000007";
    consumer.params = { operationId: next }; await route(); expect(host.textContent).not.toContain(operationId);
    expect(fetcher).toHaveBeenCalledTimes(1); fetcher.mockResolvedValueOnce(json({ ...preview, operationId: next }));
    await click("Check current status"); expect(String(fetcher.mock.calls[1][0])).toBe("/api/research/account-lifecycle/self/operations/" + next);
    expect(fetcher.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
  });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("self-only lifecycle presentation, never deletion authority", () => {
  it("stays unavailable without captured canonical session and never creates a provider/account effect on mount", async () => {
    await mount({ state: "unavailable" }); expect(host.querySelector("button")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
    expect(host.textContent).toContain("independently verified recent authentication");
  });
  it("posts only a retry hint then private carrier, preserving captured A and exposing no token, target or client assurance in body/URL/storage", async () => {
    const store = vi.spyOn(Storage.prototype, "setItem"); await mount(); await click("Review account closure");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const calls = fetcher.mock.calls; expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ retryKey: expect.any(String) });
    expect(JSON.parse(String(calls[1][1]?.body))).toEqual({ attemptCarrier: "x".repeat(40) });
    for (const [path, options] of calls) { expect(String(path)).not.toContain("captured-A"); expect(String(options?.body)).not.toContain("captured-A");
      expect(options).toMatchObject({ cache: "no-store", credentials: "same-origin", redirect: "error", headers: { Authorization: "Bearer captured-A" } }); }
    expect(store).not.toHaveBeenCalled(); expect(host.textContent).toContain(operationId);
  });
  it("uses only the same preview/version at confirmation and keeps uncertainty instead of claiming deletion", async () => {
    await mount(); await click("Review account closure");
    fetcher.mockResolvedValueOnce(json({ protocol: "account-lifecycle/v1", code: "outcome_uncertain" }, 503)); await click("Confirm account closure request");
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ operationId, previewDigest: hash, expectedVersion: 1, confirm: true });
    expect(host.textContent).toContain(operationId); expect(host.textContent).toContain("check its status before any further action");
    expect(host.textContent).not.toContain("All declared deletion obligations are verified");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("retries a lost prepare reply with the exact same carrier, not a new issue or attempt", async () => {
    fetcher.mockImplementationOnce(async () => json({ protocol: "account-lifecycle/v1", attemptCarrier: "x".repeat(40), expiresAt: preview.preview!.expiresAt }));
    fetcher.mockRejectedValueOnce(Error("synthetic lost committed preview reply"));
    await mount(); await click("Review account closure"); expect(host.textContent).toContain("Keep this attempt");
    await click("Retry the same preview request");
    expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith("/attempt"))).toHaveLength(1);
    expect(fetcher.mock.calls.slice(1).map(([, options]) => options?.body)).toEqual([JSON.stringify({ attemptCarrier: "x".repeat(40) }), JSON.stringify({ attemptCarrier: "x".repeat(40) })]);
  });
  it("never reissues or reconfirms an unknown provider operation, only checks its existing private status", async () => {
    const unknown: AccountLifecycleEnvelope = { ...preview, state: "auth_outcome_unknown", preview: null,
      progress: { ...preview.progress, application: "verified", authIdentity: "unknown" }, blockers: ["provider_outcome_unknown"], nextAction: "authorized_review" };
    fetcher.mockImplementation(async () => json(unknown)); await mount(a, operationId); await click("Check current status");
    expect(host.textContent).toContain("No second deletion will be sent"); expect(host.querySelectorAll("button")).toHaveLength(1);
    await click("Check current status"); expect(fetcher.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
  });
  it("conceals A operation and discards its late response after B or unmount, without claiming an issued A operation was cancelled", async () => {
    const held = deferred<Response>(); fetcher.mockReturnValueOnce(held.promise);
    await mount(a, operationId); await click("Check current status"); await mount(b);
    expect(host.textContent).not.toContain(operationId);
    held.resolve(json(preview)); await flush(); expect(host.textContent).not.toContain(operationId);
    expect(host.textContent).not.toContain("cancelled"); expect(fetcher).toHaveBeenCalledTimes(1);
    const heldAgain = deferred<Response>(); fetcher.mockReturnValueOnce(heldAgain.promise);
    await mount(a, operationId); expect(host.querySelector("button")).toBeNull(); // A's old instance was retired by B.
    await mount({ ...a, instance: {} }, operationId); await click("Check current status"); act(() => root.render(<p>Other page</p>));
    heldAgain.resolve(json(preview)); await flush(); expect(host.textContent).toBe("Other page");
  });
  it("renders retained/blocked/completed states truthfully and disables an expired preview", async () => {
    await mount(a, operationId);
    for (const state of ["blocked", "completed_with_retention", "completed"] as const) {
      const result: AccountLifecycleEnvelope = { ...preview, state, preview: null, nextAction: state === "blocked" ? "authorized_review" : "none",
        blockers: state === "blocked" ? ["replay_cleanup_unproven"] : [], progress: { application: "verified", providerSessions: "verified", eligibleData: "verified",
          authIdentity: "verified", retainedData: state === "completed_with_retention" ? "retained" : "not_applicable" } };
      fetcher.mockResolvedValueOnce(json(result)); await click("Check current status");
      if (state === "blocked") expect(host.textContent).toContain("replay cleanup unproven");
      if (state === "completed_with_retention") expect(host.textContent).toContain("Records remain under the approved retention policy");
      if (state === "completed") expect(host.textContent).toContain("All declared deletion obligations are verified");
    }
    fetcher.mockResolvedValueOnce(json({ ...preview, preview: { ...preview.preview!, expiresAt: new Date(Date.now() - 1000).toISOString() } }));
    await click("Check current status"); expect([...host.querySelectorAll("button")].find(node => node.textContent === "Confirm account closure request")!.disabled).toBe(true);
  });
  it("rejects malformed/oversized/false completion responses and retains the current operation", async () => {
    await mount(a, operationId);
    for (const reply of [json({ ...preview, state: "completed", progress: { ...preview.progress, authIdentity: "unknown" } }),
      new Response("x".repeat(17000)), new Response("not-json")]) {
      fetcher.mockResolvedValueOnce(reply); await click("Check current status");
      expect(host.textContent).toContain("existing operation has not been cleared or repeated"); expect(host.textContent).not.toContain("All declared deletion obligations are verified");
    }
  });
  it.each(["refresh", "checking"] as const)("keeps one issued attempt and exact frozen carrier after lost prepare across same-instance %s", async mode => {
    fetcher.mockResolvedValueOnce(json({ protocol: "account-lifecycle/v1", attemptCarrier: "x".repeat(40), expiresAt: preview.preview!.expiresAt }));
    fetcher.mockRejectedValueOnce(Error("lost committed prepare response"));
    await mount(); await click("Review account closure"); await rotate(mode);
    await click("Retry the same preview request");
    expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith("/attempt"))).toHaveLength(1);
    expect(fetcher.mock.calls.slice(1).map(([, options]) => options?.body)).toEqual([
      JSON.stringify({ attemptCarrier: "x".repeat(40) }), JSON.stringify({ attemptCarrier: "x".repeat(40) })]);
    expect(fetcher.mock.calls[2][1]?.headers).toMatchObject({ Authorization: "Bearer rotated-A" });
    expect(host.textContent).toContain(operationId);
  });
  it.each(["refresh", "checking"] as const)("retains a held prepare journal through %s and fences its late old-token continuation", async mode => {
    const held = deferred<Response>();
    fetcher.mockResolvedValueOnce(json({ protocol: "account-lifecycle/v1", attemptCarrier: "x".repeat(40), expiresAt: preview.preview!.expiresAt }));
    fetcher.mockReturnValueOnce(held.promise); await mount(); await click("Review account closure");
    await rotate(mode);
    const unknown: AccountLifecycleEnvelope = { ...preview, version: 2, state: "auth_outcome_unknown", preview: null,
      progress: { ...preview.progress, application: "verified", authIdentity: "unknown" }, blockers: ["provider_outcome_unknown"], nextAction: "authorized_review" };
    fetcher.mockResolvedValueOnce(json(unknown)); await click("Retry the same preview request");
    held.resolve(json(preview)); await flush();
    expect(host.textContent).toContain("No second deletion will be sent");
    expect([...host.querySelectorAll("button")].map(node => node.textContent)).toEqual(["Check current status"]);
    expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith("/attempt"))).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each(["refresh", "checking"] as const)("replays the same non-authoritative retry key after held issue across %s, without using a late carrier", async mode => {
    const held = deferred<Response>(); fetcher.mockReturnValueOnce(held.promise);
    await mount(); await click("Review account closure"); const original = fetcher.mock.calls[0][1]?.body;
    await rotate(mode); await click("Review account closure");
    const issue = fetcher.mock.calls.filter(([path]) => String(path).endsWith("/attempt"));
    expect(issue).toHaveLength(2); expect(issue.map(([, options]) => options?.body)).toEqual([original, original]);
    expect(issue[1][1]?.headers).toMatchObject({ Authorization: "Bearer rotated-A" });
    held.resolve(json({ protocol: "account-lifecycle/v1", attemptCarrier: "different_late_" + "z".repeat(40), expiresAt: preview.preview!.expiresAt })); await flush();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ attemptCarrier: "x".repeat(40) });
  });
  it.each(["refresh", "checking"] as const)("preserves known unknown-provider operation as status-only across %s without an initial route reference", async mode => {
    const unknown: AccountLifecycleEnvelope = { ...preview, state: "auth_outcome_unknown", preview: null,
      progress: { ...preview.progress, application: "verified", authIdentity: "unknown" }, blockers: ["provider_outcome_unknown"], nextAction: "authorized_review" };
    fetcher.mockResolvedValueOnce(json({ protocol: "account-lifecycle/v1", attemptCarrier: "x".repeat(40), expiresAt: preview.preview!.expiresAt }));
    fetcher.mockResolvedValueOnce(json(unknown)); await mount(); await click("Review account closure");
    await rotate(mode); expect(host.textContent).toContain(operationId);
    expect([...host.querySelectorAll("button")].map(node => node.textContent)).toEqual(["Check current status"]);
    fetcher.mockResolvedValueOnce(json(unknown)); await click("Check current status");
    expect(fetcher.mock.calls[2][1]?.method).toBe("GET"); expect(fetcher.mock.calls[2][1]?.headers).toMatchObject({ Authorization: "Bearer rotated-A" });
    expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith("/attempt"))).toHaveLength(1);
  });
  it("retires terminal unavailable and rejects stale same-instance reuse, while genuinely new ordinary instance can start its own attempt", async () => {
    await mount(); await click("Review account closure"); const calls = fetcher.mock.calls.length;
    await mount({ state: "unavailable" }); await mount(a);
    expect(host.querySelector("button")).toBeNull(); expect(host.textContent).not.toContain(operationId); expect(fetcher).toHaveBeenCalledTimes(calls);
    await mount({ ...a, instance: {}, accessToken: "genuinely-new-A" });
    expect(host.textContent).not.toContain(operationId); await click("Review account closure");
    expect(fetcher.mock.calls[calls][0]).toContain("/self/attempt");
    expect(JSON.parse(String(fetcher.mock.calls[calls][1]?.body))).toEqual({ retryKey: expect.any(String) });
    expect(fetcher.mock.calls[calls][1]?.body).not.toBe(fetcher.mock.calls[0][1]?.body);
  });
  it("retires a changed actor/instance without dispatching its old journal, and checking cannot establish an unobserved identity", async () => {
    await mount(); await click("Review account closure"); const calls = fetcher.mock.calls.length;
    await mount({ state: "checking", actorId: b.actorId, instance: b.instance }); expect(host.querySelector("button")).toBeNull();
    await mount(a); expect(host.querySelector("button")).toBeNull(); expect(host.textContent).not.toContain(operationId);
    await mount(b); expect(host.textContent).not.toContain(operationId); expect(fetcher).toHaveBeenCalledTimes(calls);
    await click("Review account closure"); expect(fetcher.mock.calls[calls][0]).toContain("/self/attempt");
    expect(fetcher.mock.calls[calls][1]?.headers).toMatchObject({ Authorization: "Bearer captured-B" });
  });
});

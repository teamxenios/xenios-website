// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
type S = { access_token: string; user: { id: string } };
const fixture = vi.hoisted(() => {
  const state = { session: null as S | null };
  const listeners = new Set<(event: string, session: S | null) => void>();
  const auth = { getSession: vi.fn(async (): Promise<{ data: { session: S | null }; error: Error | null }> => ({ data: { session: state.session }, error: null })),
    onAuthStateChange: vi.fn((callback: (event: string, session: S | null) => void) => {
      listeners.add(callback); return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    }), updateUser: vi.fn(), setSession: vi.fn(), signInWithPassword: vi.fn() };
  return { state, listeners, auth, client: { auth }, api: { config: vi.fn(), identity: vi.fn(), mutate: vi.fn(), reauthenticate: vi.fn() },
    emit(event: string, session: S | null) { state.session = session; for (const callback of listeners) callback(event, session); } };
});
vi.mock("@/lib/supabaseBrowser", () => ({ getSupabaseBrowser: async () => fixture.client, isRecoveryAccessToken: (token: string) => token === "recovery" }));
vi.mock("./api", async importOriginal => ({ ...await importOriginal<typeof import("./api")>(), accountManagementApi: fixture.api }));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
import AccountSettings from "./AccountSettings";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const a = "10000000-0000-4000-8000-000000000001", b = "20000000-0000-4000-8000-000000000002";
const sidA = "30000000-0000-4000-8000-000000000001", sidB = "30000000-0000-4000-8000-000000000002";
const sidFresh = "30000000-0000-4000-8000-000000000003";
const session = (label = "A", id = a, sessionId = id === a ? sidA : sidB): S => ({ access_token: label === "recovery" ? label
  : "synthetic." + btoa(JSON.stringify({ sub: id, session_id: sessionId, label })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_") + ".signature", user: { id } });
const identity = (id = a, email = "a@example.invalid") => ({ userId: id, email, emailVerified: true, displayName: id === a ? "Person A" : "Person B", pendingEmail: null as string | null });
let root: Root, host: HTMLDivElement;
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let round = 0; round < 6; round++) await act(async () => { await Promise.resolve(); }); }
async function mount() { await act(async () => root.render(<AccountSettings />)); await flush(); }
function change(id: string, value: string) { act(() => { const input = host.querySelector<HTMLInputElement>(id)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
function submit(label: string) { act(() => { host.querySelector(`form[aria-label="${label}"]`)!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
function button(text: string) { return [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text)!; }
beforeEach(() => {
  vi.clearAllMocks(); fixture.listeners.clear(); fixture.client = { auth: fixture.auth }; fixture.state.session = session();
  fixture.auth.getSession.mockImplementation(async () => ({ data: { session: fixture.state.session }, error: null }));
  fixture.api.config.mockResolvedValue({ registrationEnabled: true, selfEditsEnabled: true, captchaRequired: true, confirmationRedirect: location.origin + "/research/sign-in?returnTo=%2Fresearch%2Faccount%2Fsettings", deletion: "unavailable" });
  fixture.api.identity.mockImplementation(async (token: string) => JSON.parse(atob(token.split(".")[1])).sub === b ? identity(b, "b@example.invalid") : identity());
  fixture.api.mutate.mockResolvedValue({ ok: true, state: "accepted", operation: "profile" });
  fixture.api.reauthenticate.mockResolvedValue({ ok: true, state: "check_email" });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
describe("universal own settings without membership or mutable SDK writes", () => {
  it("renders a confirmed ordinary Auth-only identity, hides any fake deletion action, and edits only captured A", async () => {
    await mount(); expect(host.textContent).toContain("a@example.invalid"); expect(host.textContent).toContain("Deletion is not available");
    expect(host.querySelector('button[data-testid="delete-account"]')).toBeNull();
    change("#identity-name", "New A"); fixture.api.identity.mockResolvedValue({ ...identity(), displayName: "New A" }); submit("Display name"); await flush();
    expect(fixture.api.mutate).toHaveBeenCalledExactlyOnceWith(session().access_token, { operation: "profile", displayName: "New A" });
    expect(host.textContent).toContain("Display name updated.");
    expect(fixture.auth.updateUser).not.toHaveBeenCalled(); expect(fixture.auth.setSession).not.toHaveBeenCalled();
  });
  it("conceals A immediately on B and never applies a late A result or clears the newer view", async () => {
    await mount(); const held = deferred<unknown>(); fixture.api.mutate.mockReturnValueOnce(held.promise);
    change("#identity-name", "Private A draft"); submit("Display name"); await flush();
    expect(fixture.api.mutate).toHaveBeenCalledExactlyOnceWith(session().access_token, { operation: "profile", displayName: "Private A draft" });
    act(() => fixture.emit("SIGNED_IN", session("B", b))); await flush();
    expect(host.textContent).not.toContain("a@example.invalid"); expect(host.textContent).toContain("b@example.invalid");
    held.resolve({ ok: true, state: "accepted", operation: "profile" }); await flush();
    expect(host.textContent).not.toContain("Display name updated."); expect(host.querySelector<HTMLInputElement>("#identity-name")!.value).toBe("Person B");
    expect(fixture.api.mutate).toHaveBeenCalledTimes(1);
  });
  it("ignores a held initial A read after the canonical callback selects B", async () => {
    const held = deferred<{ data: { session: S | null }; error: null }>(); fixture.auth.getSession.mockReturnValueOnce(held.promise);
    await mount(); act(() => fixture.emit("SIGNED_IN", session("B", b))); await flush();
    held.resolve({ data: { session: session() }, error: null }); await flush();
    expect(host.textContent).toContain("b@example.invalid"); expect(host.textContent).not.toContain("a@example.invalid");
  });
  it.each(["signed-out", "recovery", "unmount"])("does not display held private data after %s", async mode => {
    const held = deferred<ReturnType<typeof identity>>(); fixture.api.identity.mockReturnValueOnce(held.promise); await mount();
    if (mode === "unmount") act(() => root.render(<p>Different page</p>));
    else act(() => fixture.emit(mode === "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_OUT", mode === "recovery" ? session("recovery") : null));
    held.resolve(identity()); await flush(); expect(host.textContent).not.toContain("a@example.invalid"); expect(fixture.api.mutate).not.toHaveBeenCalled();
  });
  it("shows pending email instead of falsely claiming confirmation or rewriting stored requests", async () => {
    await mount(); fixture.api.mutate.mockResolvedValue({ ok: true, state: "accepted", operation: "email" });
    fixture.api.identity.mockResolvedValue({ ...identity(), pendingEmail: "new@example.invalid" });
    change("#identity-email", "new@example.invalid"); submit("Email address"); await flush();
    expect(host.textContent).toContain("Current confirmed email:"); expect(host.textContent).toContain("a@example.invalid");
    expect(host.textContent).toContain("Awaiting confirmation: new@example.invalid"); expect(host.textContent).not.toContain("Your confirmed email address is updated.");
    expect(fixture.api.mutate).toHaveBeenCalledWith(session().access_token, { operation: "email", email: "new@example.invalid" });
  });
  it("requires a successful A challenge plus user-entered nonce/password, clearing secrets on failure", async () => {
    await mount(); act(() => button("Send security code").click()); await flush();
    expect(fixture.api.reauthenticate).toHaveBeenCalledExactlyOnceWith(session().access_token);
    change("#identity-code", "123456"); change("#identity-password", "synthetic-new-password"); change("#identity-confirm", "synthetic-new-password");
    fixture.api.mutate.mockRejectedValueOnce(Error("private provider diagnostic")); submit("Password"); await flush();
    expect(fixture.api.mutate).toHaveBeenCalledExactlyOnceWith(session().access_token, { operation: "password", password: "synthetic-new-password", nonce: "123456" });
    expect(host.querySelector<HTMLInputElement>("#identity-password")!.value).toBe(""); expect(host.querySelector<HTMLInputElement>("#identity-code")!.value).toBe("");
    expect(host.textContent).not.toContain("private provider diagnostic"); expect(host.textContent).toContain("may already have taken effect");
    expect(fixture.auth.signInWithPassword).not.toHaveBeenCalled(); expect(fixture.auth.updateUser).not.toHaveBeenCalled();
  });
  it("keeps absent edit readiness closed without treating an identity as permission", async () => {
    fixture.api.config.mockResolvedValue({ registrationEnabled: false, selfEditsEnabled: false, captchaRequired: true, confirmationRedirect: null, deletion: "unavailable" });
    await mount(); expect(host.textContent).toContain("a@example.invalid"); expect(button("Save display name").disabled).toBe(true);
    submit("Display name"); await flush(); expect(fixture.api.mutate).not.toHaveBeenCalled();
  });
  it.each(["SIGNED_OUT", "PASSWORD_RECOVERY"] as const)("rejects new stale callbacks and token rotations after %s, including a late canonical cache", async event => {
    await mount(); const reads = fixture.api.identity.mock.calls.length;
    act(() => fixture.emit(event, event === "SIGNED_OUT" ? null : session("recovery"))); await flush();
    for (const callback of ["INITIAL_SESSION", "TOKEN_REFRESHED", "SIGNED_IN"]) {
      act(() => fixture.emit(callback, session("rotated-but-same-session"))); await flush();
      expect(fixture.api.identity).toHaveBeenCalledTimes(reads);
      expect(host.textContent).not.toContain("a@example.invalid"); expect(host.querySelector("form")).toBeNull();
    }
    expect(fixture.api.mutate).not.toHaveBeenCalled(); expect(fixture.api.reauthenticate).not.toHaveBeenCalled();
  });
  it.each(["SIGNED_OUT", "PASSWORD_RECOVERY"] as const)("keeps unseen bootstrap A closed after %s and only admits a genuinely new same-user session", async event => {
    const held = deferred<{ data: { session: S | null }; error: null }>(); fixture.auth.getSession.mockReturnValueOnce(held.promise);
    await mount(); act(() => fixture.emit(event, event === "SIGNED_OUT" ? null : session("recovery"))); await flush();
    act(() => fixture.emit("INITIAL_SESSION", session()));
    act(() => fixture.emit("TOKEN_REFRESHED", session("old-refreshed"))); await flush();
    expect(fixture.api.identity).not.toHaveBeenCalled();
    // Even SIGNED_IN alone is not evidence when the old identity is unknown.
    act(() => fixture.emit("SIGNED_IN", session())); await flush(); expect(fixture.api.identity).not.toHaveBeenCalled();
    const fresh = session("fresh", a, sidFresh); act(() => fixture.emit("SIGNED_IN", fresh)); await flush();
    expect(fixture.api.identity).not.toHaveBeenCalled();
    const refreshed = session("fresh-rotated", a, sidFresh); act(() => fixture.emit("TOKEN_REFRESHED", refreshed)); await flush();
    held.resolve({ data: { session: session() }, error: null }); await flush();
    expect(fixture.api.identity).toHaveBeenCalledExactlyOnceWith(refreshed.access_token);
    expect(host.textContent).toContain("a@example.invalid");
  });
  it.each(["error", "reject", "hung"] as const)("never treats an %s old bootstrap as freshness, including repeated closure and remount", async failure => {
    const held = deferred<{ data: { session: S | null }; error: Error | null }>(); fixture.auth.getSession.mockReturnValueOnce(held.promise);
    await mount(); act(() => fixture.emit("SIGNED_OUT", null));
    act(() => fixture.emit("SIGNED_IN", session("unproven", a, sidFresh))); await flush();
    act(() => fixture.emit("PASSWORD_RECOVERY", session("recovery"))); await flush();
    if (failure === "error") held.resolve({ data: { session: null }, error: Error("synthetic bootstrap diagnostic") });
    else if (failure === "reject") held.reject(Error("synthetic bootstrap diagnostic"));
    await flush();
    act(() => fixture.emit("SIGNED_OUT", null)); act(() => fixture.emit("SIGNED_IN", session())); await flush();
    act(() => root.render(<p>Other page</p>)); fixture.state.session = session(); await mount();
    act(() => fixture.emit("TOKEN_REFRESHED", session("late"))); act(() => fixture.emit("SIGNED_IN", session("different-unproven", a, sidB))); await flush();
    expect(fixture.api.identity).not.toHaveBeenCalled(); expect(host.textContent).not.toContain("a@example.invalid");
    expect(host.textContent).not.toContain("synthetic bootstrap diagnostic"); expect(host.querySelector("form")).toBeNull();
    expect(fixture.api.mutate).not.toHaveBeenCalled(); expect(fixture.api.reauthenticate).not.toHaveBeenCalled();
    // Resolve a held probe only for cleanup; it is never permission by elapsed time.
    if (failure === "hung") { held.resolve({ data: { session: session() }, error: null }); await flush(); }
  });
  it("retains denied session IDs on remount, while a genuine later canonical session for the same user opens settings", async () => {
    await mount(); const reads = fixture.api.identity.mock.calls.length;
    act(() => fixture.emit("SIGNED_OUT", null)); await flush();
    act(() => root.render(<p>Other page</p>)); fixture.state.session = session("late-cached-A"); await mount();
    act(() => fixture.emit("INITIAL_SESSION", session("another-late-A"))); await flush();
    expect(fixture.api.identity).toHaveBeenCalledTimes(reads); expect(host.querySelector("form")).toBeNull();
    act(() => root.render(<p>Other page</p>)); const fresh = session("new-ordinary", a, sidFresh); fixture.state.session = fresh; await mount();
    expect(fixture.api.identity).toHaveBeenLastCalledWith(fresh.access_token); expect(host.textContent).toContain("a@example.invalid");
  });
  it("allows an actually new SIGNED_IN after a successful preclosure canonical absence", async () => {
    fixture.state.session = null; await mount(); act(() => fixture.emit("SIGNED_OUT", null)); await flush();
    expect(fixture.api.identity).not.toHaveBeenCalled();
    const fresh = session("new-ordinary", a, sidFresh); act(() => fixture.emit("SIGNED_IN", fresh)); await flush();
    expect(fixture.api.identity).toHaveBeenCalledExactlyOnceWith(fresh.access_token); expect(host.textContent).toContain("a@example.invalid");
  });
  it("preserves legitimate refresh and A-to-B changes while ignoring returning retired A without clearing B", async () => {
    await mount(); const rotated = session("normal-rotation"); act(() => fixture.emit("TOKEN_REFRESHED", rotated)); await flush();
    expect(fixture.api.identity).toHaveBeenLastCalledWith(rotated.access_token); expect(host.textContent).toContain("a@example.invalid");
    act(() => fixture.emit("SIGNED_IN", session("B", b))); await flush(); const reads = fixture.api.identity.mock.calls.length;
    act(() => fixture.emit("INITIAL_SESSION", session())); act(() => fixture.emit("TOKEN_REFRESHED", session("late-rotation"))); await flush();
    expect(fixture.api.identity).toHaveBeenCalledTimes(reads); expect(host.textContent).toContain("b@example.invalid");
    expect(host.textContent).not.toContain("a@example.invalid"); expect(fixture.api.mutate).not.toHaveBeenCalled();
  });
  it("does not admit an unpartitionable or mismatched session credential", async () => {
    fixture.state.session = { access_token: "not-a-session-identity", user: { id: a } }; await mount();
    act(() => fixture.emit("SIGNED_IN", { ...session(), user: { id: b } })); await flush();
    expect(fixture.api.identity).not.toHaveBeenCalled(); expect(host.querySelector("form")).toBeNull();
  });
});

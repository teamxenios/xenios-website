// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
type S = { access_token: string; user: { id: string } };
const fixture = vi.hoisted(() => {
  const state = { session: null as S | null };
  const listeners = new Set<(event: string, session: S | null) => void>();
  const auth = { getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
    onAuthStateChange: vi.fn((callback: (event: string, session: S | null) => void) => {
      listeners.add(callback); return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    }), updateUser: vi.fn(), setSession: vi.fn(), signInWithPassword: vi.fn() };
  return { state, listeners, auth, api: { config: vi.fn(), identity: vi.fn(), mutate: vi.fn(), reauthenticate: vi.fn() },
    emit(event: string, session: S | null) { state.session = session; for (const callback of listeners) callback(event, session); } };
});
vi.mock("@/lib/supabaseBrowser", () => ({ getSupabaseBrowser: async () => ({ auth: fixture.auth }), isRecoveryAccessToken: (token: string) => token === "recovery" }));
vi.mock("./api", async importOriginal => ({ ...await importOriginal<typeof import("./api")>(), accountManagementApi: fixture.api }));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
import AccountSettings from "./AccountSettings";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const a = "10000000-0000-4000-8000-000000000001", b = "20000000-0000-4000-8000-000000000002";
const session = (label = "A", id = a): S => ({ access_token: label, user: { id } });
const identity = (id = a, email = "a@example.invalid") => ({ userId: id, email, emailVerified: true, displayName: id === a ? "Person A" : "Person B", pendingEmail: null as string | null });
let root: Root, host: HTMLDivElement;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function flush() { for (let round = 0; round < 6; round++) await act(async () => { await Promise.resolve(); }); }
async function mount() { await act(async () => root.render(<AccountSettings />)); await flush(); }
function change(id: string, value: string) { act(() => { const input = host.querySelector<HTMLInputElement>(id)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
function submit(label: string) { act(() => { host.querySelector(`form[aria-label="${label}"]`)!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
function button(text: string) { return [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text)!; }
beforeEach(() => {
  vi.clearAllMocks(); fixture.listeners.clear(); fixture.state.session = session();
  fixture.auth.getSession.mockImplementation(async () => ({ data: { session: fixture.state.session }, error: null }));
  fixture.api.config.mockResolvedValue({ registrationEnabled: true, selfEditsEnabled: true, captchaRequired: true, confirmationRedirect: location.origin + "/research/sign-in?returnTo=%2Fresearch%2Faccount%2Fsettings", deletion: "unavailable" });
  fixture.api.identity.mockImplementation(async (token: string) => token === "B" ? identity(b, "b@example.invalid") : identity());
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
    expect(fixture.api.mutate).toHaveBeenCalledExactlyOnceWith("A", { operation: "profile", displayName: "New A" });
    expect(host.textContent).toContain("Display name updated.");
    expect(fixture.auth.updateUser).not.toHaveBeenCalled(); expect(fixture.auth.setSession).not.toHaveBeenCalled();
  });
  it("conceals A immediately on B and never applies a late A result or clears the newer view", async () => {
    await mount(); const held = deferred<unknown>(); fixture.api.mutate.mockReturnValueOnce(held.promise);
    change("#identity-name", "Private A draft"); submit("Display name"); await flush();
    expect(fixture.api.mutate).toHaveBeenCalledExactlyOnceWith("A", { operation: "profile", displayName: "Private A draft" });
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
    expect(fixture.api.mutate).toHaveBeenCalledWith("A", { operation: "email", email: "new@example.invalid" });
  });
  it("requires a successful A challenge plus user-entered nonce/password, clearing secrets on failure", async () => {
    await mount(); act(() => button("Send security code").click()); await flush();
    expect(fixture.api.reauthenticate).toHaveBeenCalledExactlyOnceWith("A");
    change("#identity-code", "123456"); change("#identity-password", "synthetic-new-password"); change("#identity-confirm", "synthetic-new-password");
    fixture.api.mutate.mockRejectedValueOnce(Error("private provider diagnostic")); submit("Password"); await flush();
    expect(fixture.api.mutate).toHaveBeenCalledExactlyOnceWith("A", { operation: "password", password: "synthetic-new-password", nonce: "123456" });
    expect(host.querySelector<HTMLInputElement>("#identity-password")!.value).toBe(""); expect(host.querySelector<HTMLInputElement>("#identity-code")!.value).toBe("");
    expect(host.textContent).not.toContain("private provider diagnostic"); expect(host.textContent).toContain("may already have taken effect");
    expect(fixture.auth.signInWithPassword).not.toHaveBeenCalled(); expect(fixture.auth.updateUser).not.toHaveBeenCalled();
  });
  it("keeps absent edit readiness closed without treating an identity as permission", async () => {
    fixture.api.config.mockResolvedValue({ registrationEnabled: false, selfEditsEnabled: false, captchaRequired: true, confirmationRedirect: null, deletion: "unavailable" });
    await mount(); expect(host.textContent).toContain("a@example.invalid"); expect(button("Save display name").disabled).toBe(true);
    submit("Display name"); await flush(); expect(fixture.api.mutate).not.toHaveBeenCalled();
  });
});

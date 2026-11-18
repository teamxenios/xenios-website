// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffSessionAssurance } from "./StaffSessionAssurance";

const provider = vi.hoisted(() => ({ getClient: vi.fn(), getSession: vi.fn(), getUser: vi.fn(),
  assurance: vi.fn(), factors: vi.fn(), challenge: vi.fn(), verify: vi.fn(),
  listeners: new Set<(event: string) => void>(),
  token: "synthetic-aal1", subject: "synthetic-staff-a", level: "aal1", verifiedSubject: "synthetic-staff-a" }));
vi.mock("@/lib/supabaseBrowser", () => ({ getSupabaseBrowser: provider.getClient,
  isRecoveryAccessToken: (token: string) => token === "synthetic-recovery" }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement, root: Root, mounted: boolean;
const completed = vi.fn(), invalid = vi.fn();
const verified = (id = "synthetic-factor-a", type = "totp", status = "verified") =>
  ({ id, factor_type: type, status, friendly_name: "Do not display provider profile data" });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
async function flush() { for (let index = 0; index < 4; index++) await act(async () => { await Promise.resolve(); }); }
async function mount(subjectId = "synthetic-staff-a", credentialRevision = 1) {
  await act(async () => { root.render(<StaffSessionAssurance subjectId={subjectId} credentialRevision={credentialRevision}
    onVerified={completed} onSessionInvalid={invalid} />); });
  await flush();
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label);
  expect(button, label).toBeTruthy();
  await act(async () => { button!.click(); }); await flush();
}
async function enterCode(value = "123456") {
  const input = container.querySelector<HTMLInputElement>("input")!;
  expect(input).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await flush();
}
async function emit(event: string) {
  await act(async () => { for (const listener of [...provider.listeners]) listener(event); }); await flush();
}
beforeEach(() => {
  vi.resetAllMocks(); provider.listeners.clear();
  provider.token = "synthetic-aal1"; provider.subject = "synthetic-staff-a";
  provider.verifiedSubject = provider.subject; provider.level = "aal1";
  provider.getSession.mockImplementation(async () => ({ data: { session: provider.token
    ? { access_token: provider.token, user: { id: provider.subject } } : null }, error: null }));
  provider.getUser.mockImplementation(async () => ({ data: { user: { id: provider.verifiedSubject } }, error: null }));
  provider.assurance.mockImplementation(async () => ({ data: { currentLevel: provider.level, nextLevel: "aal2" }, error: null }));
  provider.factors.mockResolvedValue({ data: { all: [verified()] }, error: null });
  provider.challenge.mockImplementation(async () => ({ data: { id: "synthetic-challenge-a", type: "totp",
    expires_at: Math.floor(Date.now() / 1000) + 120 }, error: null }));
  provider.verify.mockImplementation(async () => {
    provider.token = "synthetic-aal2"; provider.level = "aal2";
    return { data: { access_token: provider.token, user: { id: provider.subject } }, error: null };
  });
  provider.getClient.mockResolvedValue({ auth: { getSession: provider.getSession, getUser: provider.getUser,
    onAuthStateChange: (callback: (event: string) => void) => {
      provider.listeners.add(callback);
      // SDK subscriptions emit INITIAL_SESSION; resubscribing must not loop.
      callback("INITIAL_SESSION");
      return { data: { subscription: { unsubscribe: () => provider.listeners.delete(callback) } } };
    }, mfa: { getAuthenticatorAssuranceLevel: provider.assurance, listFactors: provider.factors,
      challenge: provider.challenge, verify: provider.verify } } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No live provider call allowed"); }));
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container); mounted = true;
});
afterEach(() => {
  if (mounted) act(() => root.unmount());
  expect(provider.listeners.size).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
  container.remove(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("staff existing-authenticator assurance (synthetic SDK only)", () => {
  it("uses the canonical SDK and verified current subject; nextLevel never counts as completed MFA", async () => {
    await mount();
    expect(provider.getUser).toHaveBeenCalledWith("synthetic-aal1");
    expect(provider.assurance).toHaveBeenCalledWith("synthetic-aal1");
    expect(container.textContent).toContain("Continue with authenticator");
    expect(container.textContent).not.toContain("verification is complete");
    expect(provider.challenge).not.toHaveBeenCalled();
    expect(completed).not.toHaveBeenCalled();
  });
  it("recognizes only current aal2 and never presents a staff authority claim", async () => {
    provider.level = "aal2"; await mount();
    expect(container.textContent).toContain("verification is complete for this session");
    expect(container.textContent).toContain("appropriate Care permissions");
    expect(container.textContent).not.toContain("verified staff");
    expect(provider.factors).not.toHaveBeenCalled(); expect(provider.challenge).not.toHaveBeenCalled();
  });
  it("offers only already verified TOTP factors with accessible generic labels", async () => {
    provider.factors.mockResolvedValue({ data: { all: [verified(), verified("synthetic-factor-b"),
      verified("pending", "totp", "unverified"), verified("phone", "phone")] }, error: null });
    await mount();
    const select = container.querySelector("select")!;
    expect(container.querySelector(`label[for="${select.id}"]`)?.textContent).toBe("Authenticator");
    expect([...select.options].map((option) => option.textContent)).toEqual(["Authenticator 1", "Authenticator 2"]);
    expect(container.textContent).not.toContain("provider profile");
    await act(async () => { select.value = "synthetic-factor-b"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await click("Continue with authenticator");
    expect(provider.challenge).toHaveBeenCalledExactlyOnceWith({ factorId: "synthetic-factor-b" });
  });
  it("explains the missing supported factor without enrolling or requesting a challenge", async () => {
    provider.factors.mockResolvedValue({ data: { all: [verified("unverified", "totp", "unverified"), verified("phone", "phone")] }, error: null });
    await mount();
    expect(container.textContent).toContain("No verified authenticator supported by this page");
    expect(container.textContent).toContain("approved setup path");
    expect(provider.challenge).not.toHaveBeenCalled();
  });
  it.each(["synthetic-recovery", ""])("denies recovery or absent sessions (%s)", async (token) => {
    provider.token = token; await mount();
    expect(invalid).toHaveBeenCalledOnce(); expect(container.querySelector("[role=alert]")).toBeTruthy();
    expect(provider.getUser).not.toHaveBeenCalled(); expect(provider.challenge).not.toHaveBeenCalled();
  });
  it("denies a provider-verified identity that does not match the current subject", async () => {
    provider.verifiedSubject = "synthetic-staff-b"; await mount();
    expect(invalid).toHaveBeenCalledOnce(); expect(provider.assurance).not.toHaveBeenCalled();
    expect(provider.factors).not.toHaveBeenCalled();
  });
  it("focuses the labelled code input, checks the current session, and verifies with a transient six-digit code", async () => {
    await mount(); await click("Continue with authenticator");
    const input = container.querySelector<HTMLInputElement>("input")!;
    expect(document.activeElement).toBe(input);
    expect(container.querySelector(`label[for="${input.id}"]`)?.textContent).toContain("Six-digit");
    expect(input.inputMode).toBe("numeric"); expect(input.autocomplete).toBe("one-time-code");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await enterCode("12x3456"); expect(input.value).toBe("123456"); await submit();
    expect(provider.verify).toHaveBeenCalledExactlyOnceWith({ factorId: "synthetic-factor-a", challengeId: "synthetic-challenge-a", code: "123456" });
    expect(container.querySelector("input")).toBeNull();
    expect(container.textContent).toContain("verification is complete"); expect(completed).toHaveBeenCalledOnce();
    expect(provider.getUser).toHaveBeenLastCalledWith("synthetic-aal2");
  });
  it("reloads canonical assurance after the real SDK event ordering, without a stale success callback", async () => {
    provider.verify.mockImplementation(async () => {
      provider.token = "synthetic-aal2"; provider.level = "aal2";
      for (const callback of [...provider.listeners]) callback("MFA_CHALLENGE_VERIFIED");
      return { data: { access_token: provider.token, user: { id: provider.subject } }, error: null };
    });
    await mount(); await click("Continue with authenticator"); await enterCode(); await submit();
    expect(container.textContent).toContain("verification is complete");
    expect(completed).not.toHaveBeenCalled(); expect(provider.assurance).toHaveBeenLastCalledWith("synthetic-aal2");
  });
  it("does not accept a successful verify envelope while canonical currentLevel is still aal1", async () => {
    provider.verify.mockResolvedValue({ data: { access_token: "synthetic-aal1", user: { id: provider.subject } }, error: null });
    await mount(); await click("Continue with authenticator"); await enterCode(); await submit();
    expect(container.querySelector("[role=alert]")).toBeTruthy(); expect(completed).not.toHaveBeenCalled();
  });
  it("ignores duplicate challenge and verification submits before React renders", async () => {
    await mount();
    const begin = [...container.querySelectorAll("button")].find((button) => button.textContent === "Continue with authenticator")!;
    await act(async () => { begin.click(); begin.click(); }); await flush();
    expect(provider.challenge).toHaveBeenCalledOnce(); await enterCode();
    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }); await flush();
    expect(provider.verify).toHaveBeenCalledOnce(); expect(completed).toHaveBeenCalledOnce();
  });
  it.each(["factor", "assurance", "challenge", "verify"])("shows safe fixed guidance after a %s failure", async (step) => {
    const error = { message: "provider secret context must not be rendered" };
    if (step === "factor") provider.factors.mockResolvedValue({ data: null, error });
    if (step === "assurance") provider.assurance.mockResolvedValue({ data: null, error });
    if (step === "challenge") provider.challenge.mockResolvedValue({ data: null, error });
    if (step === "verify") provider.verify.mockResolvedValue({ data: null, error });
    await mount();
    if (step === "challenge" || step === "verify") await click("Continue with authenticator");
    if (step === "verify") { await enterCode(); await submit(); }
    expect(container.querySelector("[role=alert]")?.textContent).toContain("could not be completed");
    expect(document.activeElement).toBe(container.querySelector("[role=alert]"));
    expect(container.textContent).not.toContain("provider secret");
    expect(container.querySelector("input")).toBeNull(); expect(completed).not.toHaveBeenCalled();
    if (step === "verify") {
      await click("Check session again"); await click("Continue with authenticator");
      expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("");
      expect(provider.challenge).toHaveBeenCalledTimes(2);
    }
  });
  it("expires a challenge and clears an entered code before another attempt", async () => {
    vi.useFakeTimers(); await mount(); await click("Continue with authenticator"); await enterCode();
    await act(async () => { vi.advanceTimersByTime(121000); });
    expect(container.textContent).toContain("verification step expired");
    expect(container.querySelector("input")).toBeNull(); expect(provider.verify).not.toHaveBeenCalled();
  });
  it("rejects an already expired challenge response", async () => {
    provider.challenge.mockResolvedValue({ data: { id: "expired", type: "totp", expires_at: 1 }, error: null });
    await mount(); await click("Continue with authenticator");
    expect(container.querySelector("[role=alert]")).toBeTruthy(); expect(provider.verify).not.toHaveBeenCalled();
  });
  it("cancels without using a challenge again or retaining its code", async () => {
    await mount(); await click("Continue with authenticator"); await enterCode();
    await click("Cancel verification");
    expect(document.activeElement?.textContent).toBe("Continue with authenticator");
    await click("Continue with authenticator");
    expect(provider.challenge).toHaveBeenCalledTimes(2);
    expect(container.querySelector<HTMLInputElement>("input")!.value).toBe(""); expect(provider.verify).not.toHaveBeenCalled();
  });
  it("clears an entered code on a same-subject credential refresh", async () => {
    await mount(); await click("Continue with authenticator"); await enterCode();
    provider.token = "synthetic-refreshed"; await emit("TOKEN_REFRESHED");
    expect(container.querySelector("input")).toBeNull(); expect(provider.verify).not.toHaveBeenCalled();
    await click("Continue with authenticator"); expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("");
  });
  it("denies PASSWORD_RECOVERY even if the event token looks ordinary", async () => {
    await mount(); await click("Continue with authenticator"); await enterCode();
    await emit("PASSWORD_RECOVERY");
    expect(container.querySelector("input")).toBeNull(); expect(invalid).toHaveBeenCalled(); expect(provider.verify).not.toHaveBeenCalled();
  });
  it("does not call verify if the canonical identity changed before submission", async () => {
    await mount(); await click("Continue with authenticator"); await enterCode();
    provider.subject = "synthetic-staff-b"; await submit();
    expect(provider.verify).not.toHaveBeenCalled(); expect(invalid).toHaveBeenCalledOnce(); expect(completed).not.toHaveBeenCalled();
  });
  it("ignores a late challenge after an identity switch and cannot expose the old code form", async () => {
    const pending = deferred<any>(); provider.challenge.mockReturnValueOnce(pending.promise);
    await mount(); await click("Continue with authenticator");
    provider.subject = "synthetic-staff-b"; provider.verifiedSubject = provider.subject;
    provider.token = "synthetic-b"; await mount(provider.subject, 2);
    await act(async () => { pending.resolve({ data: { id: "late", type: "totp", expires_at: Date.now() / 1000 + 120 }, error: null }); });
    expect(container.querySelector("input")).toBeNull(); expect(completed).not.toHaveBeenCalled(); expect(provider.verify).not.toHaveBeenCalled();
  });
  it("ignores a late verification after sign-out rather than claiming success", async () => {
    const pending = deferred<any>(); provider.verify.mockReturnValueOnce(pending.promise);
    await mount(); await click("Continue with authenticator"); await enterCode(); await submit();
    provider.token = ""; await emit("SIGNED_OUT");
    await act(async () => { pending.resolve({ data: { access_token: "synthetic-late", user: { id: "synthetic-staff-a" } }, error: null }); });
    expect(container.textContent).not.toContain("verification is complete"); expect(completed).not.toHaveBeenCalled();
    expect(container.querySelector("input")).toBeNull();
  });
  it("ignores late provider reads after unmount", async () => {
    const pending = deferred<any>(); provider.getUser.mockReturnValueOnce(pending.promise);
    await mount(); await act(async () => { root.unmount(); mounted = false; });
    await act(async () => { pending.resolve({ data: { user: { id: provider.subject } }, error: null }); });
    expect(provider.assurance).not.toHaveBeenCalled(); expect(completed).not.toHaveBeenCalled(); expect(invalid).not.toHaveBeenCalled();
  });
  it("ignores an in-flight verification after unmount and clears the entered code immediately", async () => {
    const pending = deferred<any>(); provider.verify.mockReturnValueOnce(pending.promise);
    await mount(); await click("Continue with authenticator"); await enterCode(); await submit();
    expect(container.querySelector("input")).toBeNull();
    await act(async () => { root.unmount(); mounted = false; });
    await act(async () => { pending.resolve({ data: { access_token: "synthetic-late", user: { id: provider.subject } }, error: null }); });
    expect(completed).not.toHaveBeenCalled(); expect(invalid).not.toHaveBeenCalled();
  });
});

// Characterizes an unresolved upstream/default-SDK acceptance gap. These fake
// provider responses must never be confused with production MFA qualification.
// The UI fences above suppress late private views; canonical persistence needs
// a separately owned transport guard before enabling this interaction in release.
describe("installed auth SDK concurrency boundary (fake fetch and memory storage only)", () => {
  it.each(["sign-out", "account-switch"])("documents late verify persistence after %s", async (action) => {
    const { GoTrueClient } = await vi.importActual<typeof import("@supabase/auth-js")>("@supabase/auth-js");
    const now = Math.floor(Date.now() / 1000);
    const session = (subject: string, aal: string) => ({
      access_token: btoa("{}").replace(/=/g, "") + "." + btoa(JSON.stringify({ sub: subject, aal, exp: now + 3600,
        amr: [{ method: "password" }] })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_") + ".e30",
      refresh_token: "synthetic-refresh-" + subject, token_type: "bearer", expires_in: 3600, expires_at: now + 3600,
      user: { id: subject, aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
    });
    const key = "synthetic-assurance-sdk-" + action;
    const memory = new Map([[key, JSON.stringify(session("synthetic-staff-a", "aal1"))]]);
    const started = deferred<void>(), response = deferred<Response>();
    const fakeFetch = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path.includes("/verify")) { started.resolve(); return response.promise; }
      if (path.includes("/logout")) return new Response(null, { status: 204 });
      if (path.includes("grant_type=password")) return new Response(JSON.stringify(session("synthetic-staff-b", "aal1")), { status: 200 });
      throw new Error("Unexpected synthetic request");
    });
    const sdk = new GoTrueClient({ url: "https://sdk.invalid/auth/v1", storageKey: key,
      persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storage: { getItem: (name) => memory.get(name) ?? null, setItem: (name, value) => { memory.set(name, value); },
        removeItem: (name) => { memory.delete(name); } }, fetch: fakeFetch });
    try {
      await sdk.initialize();
      const pending = sdk.mfa.verify({ factorId: "synthetic-factor-a", challengeId: "synthetic-challenge-a", code: "123456" });
      await started.promise;
      if (action === "sign-out") {
        await sdk.signOut({ scope: "local" }); expect((await sdk.getSession()).data.session).toBeNull();
      } else {
        await sdk.signInWithPassword({ email: "synthetic-b@example.invalid", password: "synthetic-password" });
        expect((await sdk.getSession()).data.session?.user.id).toBe("synthetic-staff-b");
      }
      response.resolve(new Response(JSON.stringify(session("synthetic-staff-a", "aal2")), { status: 200 }));
      await pending;
      expect((await sdk.getSession()).data.session?.user.id).toBe("synthetic-staff-a");
      expect(fakeFetch.mock.calls.every(([url]) => String(url).startsWith("https://sdk.invalid/"))).toBe(true);
    } finally { await sdk.dispose(); memory.clear(); }
  });
});

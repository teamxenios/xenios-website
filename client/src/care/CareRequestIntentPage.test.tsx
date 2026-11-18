// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CareRequestIntentPage from "./CareRequestIntentPage";

const auth = vi.hoisted(() => ({ token: null as string | null, subject: "synthetic-staff-a",
  getSession: vi.fn(),
  callback: null as null | ((event: string, session: { access_token: string; user: { id: string } } | null) => void),
  unsubscribe: vi.fn() }));
vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: {
    getSession: auth.getSession,
    onAuthStateChange: (callback: typeof auth.callback) => {
      auth.callback = callback; return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
    },
  } }),
  isRecoveryAccessToken: (token: string) => token === "synthetic-recovery",
}));
vi.mock("./StaffSessionAssurance", () => ({ StaffSessionAssurance: ({ onVerified, onSessionInvalid }: {
  onVerified: () => void; onSessionInvalid: () => void;
}) => <aside>Additional verification (synthetic)
  <button data-assurance="verified" onClick={onVerified}>Synthetic verified</button>
  <button data-assurance="invalid" onClick={onSessionInvalid}>Synthetic invalid session</button>
</aside> }));
vi.mock("@/components/PageShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/SeoHead", () => ({ default: ({ robots }: { robots: string }) => <meta name="robots" content={robots} /> }));
vi.mock("../research/assisted-order/assisted-order.css", () => ({ default: {} }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  auth.token = null; auth.callback = null; auth.unsubscribe.mockClear();
  auth.subject = "synthetic-staff-a";
  auth.getSession.mockReset().mockImplementation(async () => ({ data: { session: auth.token
    ? { access_token: auth.token, user: { id: auth.subject } } : null }, error: null }));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
    json: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) })));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function mount() {
  await act(async () => { root.render(<CareRequestIntentPage />); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function changeSession(event: string, token: string | null, subject = auth.subject) {
  await act(async () => {
    auth.token = token; auth.subject = subject;
    auth.callback?.(event, token ? { access_token: token, user: { id: subject } } : null);
  });
}
async function typeReference(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[required]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}
describe("private pending-request page (synthetic provider, real canonical transport)", () => {
  it("requires sign-in, keeps noindex and returns to the exact private page", async () => {
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    await mount();
    expect(container.querySelector("a")?.getAttribute("href"))
      .toBe("/research/sign-in?returnTo=%2Fcare%2Frequest-intents");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the existing non-recovery bearer transport, not website email or query authority", async () => {
    auth.token = "synthetic-access";
    await mount();
    const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes("/request-intents/staff?page=1"));
    expect(call).toBeTruthy();
    expect(new Headers(call![1]?.headers).get("Authorization")).toBe("Bearer synthetic-access");
    expect(call![1]?.credentials).toBe("same-origin");
    expect(call![1]?.cache).toBe("no-store");
    // A synthetic empty queue proves page composition only, not server access.
  });
  it("does not expose private readback to recovery-purpose sessions", async () => {
    auth.token = "synthetic-recovery";
    await mount();
    expect(container.textContent).toContain("Authorized Care sign-in required");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("unmounts private data on sign-out instead of retaining the old identity view", async () => {
    auth.token = "synthetic-access"; await mount();
    await act(async () => { auth.token = null; auth.callback?.("SIGNED_OUT", null); });
    expect(container.textContent).toContain("Authorized Care sign-in required");
    expect(container.querySelector("a")?.getAttribute("href")).toContain("returnTo=");
  });
  it("preserves the same person's input and child instance while refreshing canonical reads after MFA", async () => {
    auth.token = "synthetic-access"; await mount();
    const input = await typeReference("XRI-" + "A".repeat(32));
    vi.mocked(fetch).mockClear();
    await changeSession("MFA_CHALLENGE_VERIFIED", "synthetic-aal2");
    expect(container.querySelector('input[required]')).toBe(input);
    expect(input.value).toBe("XRI-" + "A".repeat(32));
    const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes("/staff?page=1"));
    expect(call).toBeTruthy();
    expect(new Headers(call![1]?.headers).get("Authorization")).toBe("Bearer synthetic-aal2");
    await changeSession("TOKEN_REFRESHED", "synthetic-refreshed");
    expect(container.querySelector('input[required]')).toBe(input);
    expect(input.value).toBe("XRI-" + "A".repeat(32));
  });
  it("clears prior-person state when the signed-in subject changes", async () => {
    auth.token = "synthetic-access"; await mount();
    const input = await typeReference("XRI-" + "A".repeat(32));
    await changeSession("SIGNED_IN", "synthetic-person-b", "synthetic-staff-b");
    const next = container.querySelector<HTMLInputElement>('input[required]')!;
    expect(next).not.toBe(input); expect(next.value).toBe("");
  });
  it("refreshes authorization reads after the verified canonical-session fallback without discarding a draft", async () => {
    auth.token = "synthetic-access"; await mount();
    const input = await typeReference("XRI-" + "A".repeat(32)); vi.mocked(fetch).mockClear();
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-assurance="verified"]')!.click(); });
    expect(container.querySelector("input")).toBe(input); expect(input.value).toBe("XRI-" + "A".repeat(32));
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/staff?page=1"))).toBe(true);
  });
  it("removes private child state when the assurance check detects a mismatched current identity", async () => {
    auth.token = "synthetic-access"; await mount(); await typeReference("XRI-" + "A".repeat(32));
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-assurance="invalid"]')!.click(); });
    expect(container.textContent).toContain("Authorized Care sign-in required"); expect(container.querySelector("input")).toBeNull();
  });
  it("denies recovery events even with an ordinary-looking token, until a new ordinary sign-in", async () => {
    auth.token = "synthetic-access"; await mount();
    await typeReference("XRI-" + "A".repeat(32));
    await changeSession("PASSWORD_RECOVERY", "synthetic-access");
    expect(container.textContent).toContain("Authorized Care sign-in required");
    await changeSession("TOKEN_REFRESHED", "synthetic-refreshed");
    expect(container.textContent).toContain("Authorized Care sign-in required");
    await changeSession("SIGNED_IN", "synthetic-new-sign-in");
    expect(container.querySelector<HTMLInputElement>('input[required]')!.value).toBe("");
  });
  it.each(["MFA_CHALLENGE_VERIFIED", "TOKEN_REFRESHED", "INITIAL_SESSION"])(
    "does not let a late %s resurrect a signed-out workspace", async (event) => {
      auth.token = "synthetic-access"; await mount();
      await changeSession("SIGNED_OUT", null);
      vi.mocked(fetch).mockClear();
      await changeSession(event, "synthetic-late-aal2");
      expect(container.textContent).toContain("Authorized Care sign-in required");
      expect(fetch).not.toHaveBeenCalled();
    });
  it("denies a late MFA result for a different subject instead of restoring the former workspace", async () => {
    auth.token = "synthetic-access"; await mount();
    await changeSession("SIGNED_IN", "synthetic-b", "synthetic-staff-b");
    await typeReference("XRI-" + "B".repeat(32));
    await changeSession("MFA_CHALLENGE_VERIFIED", "synthetic-late-a", "synthetic-staff-a");
    expect(container.textContent).toContain("Authorized Care sign-in required");
    expect(container.querySelector("input")).toBeNull();
  });
  it.each([false, true])("ignores a late initial session result or error after a newer sign-in (error=%s)", async (reject) => {
    let resolve!: (result: unknown) => void, fail!: (error: Error) => void;
    auth.getSession.mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; fail = no; }));
    await act(async () => { root.render(<CareRequestIntentPage />); });
    await changeSession("SIGNED_IN", "synthetic-new", "synthetic-staff-b");
    const input = await typeReference("XRI-" + "B".repeat(32));
    await act(async () => {
      if (reject) fail(new Error("synthetic failure"));
      else resolve({ data: { session: { access_token: "synthetic-old", user: { id: "synthetic-staff-a" } } } });
    });
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("XRI-" + "B".repeat(32));
  });
  it("requires a nonempty session subject and respects getSession refusal", async () => {
    auth.token = "synthetic-access"; auth.subject = ""; await mount();
    expect(container.textContent).toContain("Authorized Care sign-in required");
    expect(fetch).not.toHaveBeenCalled();
  });
});

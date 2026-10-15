// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CareRequestIntentPage from "./CareRequestIntentPage";

const auth = vi.hoisted(() => ({ token: null as string | null,
  callback: null as null | ((event: string, session: { access_token: string } | null) => void),
  unsubscribe: vi.fn() }));
vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: {
    getSession: async () => ({ data: { session: auth.token ? { access_token: auth.token } : null } }),
    onAuthStateChange: (callback: typeof auth.callback) => {
      auth.callback = callback; return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
    },
  } }),
  isRecoveryAccessToken: (token: string) => token === "synthetic-recovery",
}));
vi.mock("@/components/PageShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/SeoHead", () => ({ default: ({ robots }: { robots: string }) => <meta name="robots" content={robots} /> }));
vi.mock("../research/assisted-order/assisted-order.css", () => ({ default: {} }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  auth.token = null; auth.callback = null; auth.unsubscribe.mockClear();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
    json: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) })));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function mount() {
  await act(async () => { root.render(<CareRequestIntentPage />); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
describe("private pending-request page (synthetic provider, real canonical transport)", () => {
  it("requires sign-in, keeps noindex and returns to the exact private page", async () => {
    await mount();
    expect(container.querySelector("a")?.getAttribute("href"))
      .toBe("/research/sign-in?returnTo=%2Fcare%2Frequest-intents");
    expect(container.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain("noindex");
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
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => {
  const state = { session: { access_token: "ordinary-A", user: { id: "10000000-0000-4000-8000-000000000001" } } as { access_token: string; user: { id: string } } | null };
  return { state, establish: vi.fn(async () => null), auth: {
    signInWithPassword: vi.fn(async () => ({ data: { session: state.session }, error: null })),
    getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  } };
});
vi.mock("@/lib/supabaseBrowser", () => ({ getSupabaseBrowser: async () => ({ auth: fixture.auth }), isRecoveryAccessToken: (token: string) => token === "recovery" }));
vi.mock("../core", () => ({ useResearch: () => ({ establishMemberSession: fixture.establish, peekMemberDenial: () => ({ code: "account_access_required" }), recovery: "none" }) }));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
import SignIn from "./SignIn";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
async function flush() { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); }
async function mount() { await act(async () => root.render(<SignIn />)); await flush(); }
function submit() { act(() => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
beforeEach(() => { vi.clearAllMocks(); fixture.state.session = { access_token: "ordinary-A", user: { id: "10000000-0000-4000-8000-000000000001" } };
  fixture.auth.getSession.mockImplementation(async () => ({ data: { session: fixture.state.session }, error: null }));
  window.history.replaceState(null, "", "/research/sign-in?returnTo=%2Fresearch%2Faccount%2Fsettings");
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
describe("explicit settings destination for an ordinary Auth-only identity", () => {
  it("navigates to independently guarded settings without member establishment or role discovery", async () => {
    await mount(); submit(); await flush(); expect(location.pathname).toBe("/research/account/settings");
    expect(fixture.establish).not.toHaveBeenCalled(); expect(fixture.auth.onAuthStateChange).not.toHaveBeenCalled();
    expect([...host.querySelectorAll("a")].some(link => link.textContent === "Create a sign-in" && link.getAttribute("href") === "/research/register")).toBe(true);
  });
  it("does not navigate if the initial session changed subject or became recovery-purpose", async () => {
    for (const token of ["ordinary-B", "recovery"]) {
      fixture.auth.getSession.mockResolvedValueOnce({ data: { session: { access_token: token, user: { id: token === "ordinary-B" ? "20000000-0000-4000-8000-000000000002" : "10000000-0000-4000-8000-000000000001" } } }, error: null });
      await mount(); submit(); await flush(); expect(location.pathname).not.toBe("/research/account/settings");
      expect(fixture.establish).not.toHaveBeenCalled();
      window.history.replaceState(null, "", "/research/sign-in?returnTo=%2Fresearch%2Faccount%2Fsettings");
    }
  });
});

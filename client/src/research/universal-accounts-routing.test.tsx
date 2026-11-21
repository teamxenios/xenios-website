// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Route, Router, Switch } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type S = { access_token: string; user: { id: string } };
const f = vi.hoisted(() => {
  const state = { session: null as S | null, legacyOpen: false };
  const auth = { getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) };
  return { state, auth, client: { auth }, provider: vi.fn(), layout: vi.fn(), member: vi.fn(),
    api: { config: vi.fn(), identity: vi.fn(), mutate: vi.fn(), reauthenticate: vi.fn(), register: vi.fn() } };
});
vi.mock("./core", async importOriginal => ({
  ...await importOriginal<typeof import("./core")>(),
  ResearchProvider: ({ children }: { children: ReactNode }) => { f.provider(); return <>{children}</>; },
  useResearch: () => ({ member: null, memberChecking: false, recovery: "none" }),
}));
vi.mock("./layout", () => ({ default: ({ children }: { children: ReactNode }) => {
  f.layout(); return f.state.legacyOpen ? <>{children}</> : <p>Legacy reviewer gate remains closed</p>;
} }));
vi.mock("./pages/MemberArea", () => ({ RequireMember: () => { f.member(); return <p>Member authority required</p>; } }));
vi.mock("@/lib/supabaseBrowser", () => ({ getSupabaseBrowser: async () => f.client, isRecoveryAccessToken: (token: string) => token === "recovery" }));
vi.mock("./account-management/api", async importOriginal => ({
  ...await importOriginal<typeof import("./account-management/api")>(), accountManagementApi: f.api,
}));
vi.mock("@/components/Turnstile", () => ({ default: () => <p>Verification widget</p> }));
import ResearchSection from "./section";
import SeoHead, { DEFAULT_ROBOTS } from "@/components/SeoHead";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const actor = "10000000-0000-4000-8000-000000000001", sid = "30000000-0000-4000-8000-000000000001";
const token = "e30." + btoa(JSON.stringify({ sub: actor, session_id: sid })).replace(/=+$/, "") + ".synthetic";
let root: Root, host: HTMLDivElement;
async function settle() { await act(async () => { await vi.dynamicImportSettled(); });
  for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); }
function shell() { return <Router><Switch>
  <Route path="/"><SeoHead title="Public home" description="Public home" path="/" /><p>Public homepage</p></Route>
  <Route><ResearchSection /></Route>
</Switch></Router>; }
async function mount(path: string) { history.replaceState({}, "", path); await act(async () => root.render(shell())); await settle(); }
async function navigate(path: string) { await act(async () => { history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); }); await settle(); }
function privateHead() {
  expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow, noarchive");
  expect(document.head.querySelectorAll('meta[property^="og:"],meta[name^="twitter:"],script[type="application/ld+json"],link[rel="canonical"],link[hreflang]')).toHaveLength(0);
}
beforeEach(() => {
  vi.clearAllMocks(); f.state.legacyOpen = false; f.client = { auth: f.auth }; f.state.session = { access_token: token, user: { id: actor } };
  f.auth.getSession.mockImplementation(async () => ({ data: { session: f.state.session }, error: null }));
  f.api.config.mockResolvedValue({ registrationEnabled: false, selfEditsEnabled: false, captchaRequired: true,
    confirmationRedirect: location.origin + "/research/sign-in?returnTo=%2Fresearch%2Faccount%2Fsettings", deletion: "unavailable" });
  f.api.identity.mockResolvedValue({ userId: actor, email: "ordinary-only@example.invalid", emailVerified: true, displayName: "Ordinary identity", pendingEmail: null });
  document.head.innerHTML = ""; host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); document.head.innerHTML = ""; });
describe("actual ResearchSection universal account composition", () => {
  it.each(["/research/register", "/research/account/settings"])("cold-loads %s outside both legacy and membership layouts with private metadata", async path => {
    document.head.innerHTML = '<meta property="og:title" content="Previous public"><meta name="twitter:card" content="summary"><link rel="canonical" href="https://example.invalid"><script type="application/ld+json">{}</script>';
    await mount(path);
    expect(host.textContent).toContain(path.endsWith("register") ? "Create your sign-in." : "Identity and security.");
    expect(f.provider).not.toHaveBeenCalled(); expect(f.layout).not.toHaveBeenCalled(); expect(f.member).not.toHaveBeenCalled();
    privateHead();
    if (path.endsWith("settings")) { expect(host.textContent).toContain("ordinary-only@example.invalid"); expect(f.api.identity).toHaveBeenCalledExactlyOnceWith(token); }
    else { expect(host.textContent).toContain("Registration is not available"); expect(f.api.identity).not.toHaveBeenCalled(); }
    expect(f.api.register).not.toHaveBeenCalled(); expect(f.api.mutate).not.toHaveBeenCalled();
  });
  it("cleans public metadata on actual SPA entry, keeps noarchive on another identity page, and restores public Home on exit", async () => {
    await mount("/"); expect(document.head.querySelector('meta[property="og:title"]')).not.toBeNull();
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(DEFAULT_ROBOTS);
    await navigate("/research/account/settings"); expect(host.textContent).toContain("ordinary-only@example.invalid"); privateHead();
    await navigate("/research/register"); expect(host.textContent).not.toContain("ordinary-only@example.invalid"); privateHead();
    await navigate("/research/account/delete"); expect(host.textContent).toContain("Account closure"); privateHead();
    expect(f.api.register).not.toHaveBeenCalled(); expect(f.api.mutate).not.toHaveBeenCalled();
    await navigate("/"); expect(host.textContent).toContain("Public homepage");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(DEFAULT_ROBOTS);
    expect(document.head.querySelector('meta[property="og:title"]')).not.toBeNull();
    expect(document.head.querySelector('link[rel="canonical"]')).not.toBeNull();
  });
  it.each(["/research/account/delete", "/research/account/delete/20000000-0000-4000-8000-000000000002"])(
    "cold-loads actual closure/status page %s without customer membership, reviewer wall, or automatic lifecycle POST", async path => {
      const post = vi.spyOn(globalThis, "fetch"); await mount(path);
      expect(host.textContent).toContain("Account closure"); expect(host.textContent).toContain("Financial, clinical, legal or shared-account"); privateHead();
      expect(f.provider).not.toHaveBeenCalled(); expect(f.layout).not.toHaveBeenCalled(); expect(f.member).not.toHaveBeenCalled();
      expect(f.api.identity).toHaveBeenCalledExactlyOnceWith(token); expect(post).not.toHaveBeenCalled(); post.mockRestore();
      expect(host.textContent).toContain(path.endsWith("delete") ? "Review account closure" : "Check current status");
    });
  it("provides a working own-settings link to closure availability, without presenting deletion as enabled", async () => {
    await mount("/research/account/settings");
    expect(host.querySelector('a[href="/research/account/delete"]')?.textContent).toBe("Review account closure availability and status");
    expect(host.textContent).toContain("Deletion is not available in this interface yet");
    await navigate("/research/account/delete"); expect(host.textContent).toContain("Account closure");
  });
  it.each([null, { access_token: "recovery", user: { id: actor } }] as const)(
    "never promotes signed-out/recovery session %j into closure controls", async session => {
      f.state.session = session; await mount("/research/account/delete");
      expect(host.querySelector("button")).toBeNull(); expect(f.api.identity).not.toHaveBeenCalled(); privateHead();
      expect(host.querySelector('a[href="/research/sign-in?returnTo=%2Fresearch%2Faccount%2Fdelete"]')).not.toBeNull();
    });
  it("preserves stricter noarchive even when a lazy child removes and replaces robots", async () => {
    await mount("/research/account/settings"); privateHead();
    await act(async () => {
      document.head.querySelector('meta[name="robots"]')!.remove();
      const tag = document.createElement("meta"); tag.name = "robots"; tag.content = "index, noarchive"; document.head.appendChild(tag);
      await Promise.resolve();
    }); await settle(); privateHead();
  });
  it("keeps customer account and lookalike pages behind their existing layouts", async () => {
    for (const path of ["/research/account", "/research/account/settings/other", "/research/register/other", "/research/account/delete/other/extra"]) {
      await mount(path); expect(host.textContent).toBe("Legacy reviewer gate remains closed");
    }
    expect(f.api.identity).not.toHaveBeenCalled(); expect(f.api.config).not.toHaveBeenCalled();
    f.state.legacyOpen = true; await mount("/research/account");
    expect(host.textContent).toBe("Member authority required"); expect(f.member).toHaveBeenCalled();
  });
  it.each([null, { access_token: "recovery", user: { id: actor } }] as const)("does not read private settings for signed-out or recovery-purpose canonical session %j", async session => {
    f.state.session = session; await mount("/research/account/settings");
    expect(host.querySelector("form")).toBeNull(); expect(host.textContent).not.toContain("ordinary-only@example.invalid");
    expect(f.api.identity).not.toHaveBeenCalled(); expect(f.api.mutate).not.toHaveBeenCalled(); privateHead();
  });
});

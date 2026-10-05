// @vitest-environment jsdom
// Composes the existing public page, Auth authority, member provider, routing
// and partner adapter/dashboard. Only Auth and HTTP transports are synthetic;
// a destination is never a grant and no live account or service is contacted.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router, Switch } from "wouter";
import { RECOVERY_MARKER_KEY } from "@shared/research/recovery";
import { ResearchProvider } from "@/research/core";
import Dashboard from "@/research/pages/partners/Dashboard";
import { SignInAuthorityPage } from "./AccountAuthorityPages";
import { PartnersPage } from "./pages";

const supa = vi.hoisted(() => {
  const state = {
    session: null as { access_token: string; user: { id: string } } | null,
    mode: "password" as "password" | "missing" | "recovery",
  };
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: state.session } })),
    signInWithPassword: vi.fn(async () => {
      state.session = state.mode === "missing" ? null : {
        access_token: state.mode === "recovery" ? "synthetic-recovery-token" : "synthetic-partner-token",
        user: { id: "synthetic-auth-owner" },
      };
      return { data: { session: state.session }, error: null };
    }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn(async () => { state.session = null; return { error: null }; }),
  };
  return { state, auth };
});

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: supa.auth }),
  isRecoveryAccessToken: (token: string) => token.includes("recovery"),
  clearPersistedRecoverySession: vi.fn(() => true),
  revokeRecoverySession: vi.fn(async () => {}),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const destination = "/research/partners/dashboard";
const signInHref = "/sign-in?returnTo=%2Fresearch%2Fpartners%2Fdashboard";
let root: Root;
let host: HTMLDivElement;
let partnerExists: boolean;
let memberDenial: string | null;
let requests: { path: string; init: RequestInit }[];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
const calls = (path: string) => requests.filter((request) => request.path === path);
async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function mount(path = "/partners") {
  window.history.replaceState(null, "", path);
  await act(async () => root.render(
    <Router><Switch>
      <Route path="/partners" component={PartnersPage} />
      <Route path="/sign-in" component={SignInAuthorityPage} />
      <Route path={destination}><ResearchProvider><Dashboard /></ResearchProvider></Route>
      <Route path="/research/account"><p data-testid="account-destination">Account destination</p></Route>
      <Route path="/research/access-state"><p data-testid="denied-destination">Access-state destination</p></Route>
    </Switch></Router>,
  ));
  await flush();
}
function signInLinks() {
  return Array.from(host.querySelectorAll<HTMLAnchorElement>("main a"))
    .filter((link) => link.textContent === "Sign In");
}
async function followPartnerSignIn(index = 0) {
  await mount();
  const links = signInLinks();
  expect(links).toHaveLength(2);
  await act(async () => links[index].click());
  await flush();
  expect(window.location.pathname).toBe("/sign-in");
}
async function submit() {
  await act(async () => {
    for (const [selector, value] of [["#ms-email", "PARTNER@EXAMPLE.INVALID"], ["#ms-password", "synthetic-password"]]) {
      const input = host.querySelector<HTMLInputElement>(selector)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await act(async () => host.querySelector("form[data-testid='form-member-signin']")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await flush();
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear();
  supa.state.session = null; supa.state.mode = "password";
  partnerExists = true; memberDenial = null; requests = [];
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input); requests.push({ path, init });
    if (path === "/api/config") return json({ turnstileSiteKey: null });
    if (path === "/api/research/me") return json({ configured: true, authed: false, publicMode: false });
    if (path === "/api/research/member/me") return memberDenial
      ? json({ ok: false, code: memberDenial }, 403)
      : json({ ok: true, member: { firstName: "Synthetic partner", status: "active", applicationStatus: "active" } });
    if (path === "/api/admin/me") return json({ success: false }, 403);
    if (path === "/api/research/catalog") return json({ ok: false }, 503);
    if (path === "/api/research/partner/dashboard") return partnerExists ? json({ ok: true, partner: {
      partnerId: "synthetic-owned-partner", role: "affiliate", state: "active",
      leadCount: 0, conversionCount: 0, totalCommissionCents: 0, payableCents: 0,
      conversions: [], outstandingTraining: [],
    } }) : json({ ok: false, code: "partner_not_found" }, 404);
    throw new Error(`Unexpected synthetic transport: ${path}`);
  }));
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  sessionStorage.clear(); localStorage.clear(); window.history.replaceState(null, "", "/");
  // Public inquiry forms were never submitted. These component journeys read
  // fixture data only; password submission reaches only the mocked Auth SDK.
  expect(requests.every(({ init }) => !init.method || init.method === "GET")).toBe(true);
  expect(requests.filter(({ path }) => !["/api/config", "/api/research/me", "/api/research/member/me", "/api/admin/me",
    "/api/research/catalog", "/api/research/partner/dashboard"].includes(path))).toEqual([]);
});

describe("public partner sign-in destination without partner grants", () => {
  it("pins only the two partner-content links and preserves public inquiry guidance", async () => {
    await mount("/partners?returnTo=https%3A%2F%2Foutside.invalid&partnerId=foreign&role=admin");
    expect(signInLinks().map((link) => link.getAttribute("href"))).toEqual([signInHref, signInHref]);
    const shellLinks = Array.from(host.querySelectorAll("header a, footer a")).filter((link) => link.textContent === "Sign In");
    expect(shellLinks.length).toBeGreaterThan(0);
    expect(shellLinks.every((link) => link.getAttribute("href") === "/sign-in")).toBe(true);
    expect(host.textContent).toContain("An inquiry is not an application, account or approval.");
    expect(host.querySelector('a[href="/partners#inquiry"]')).not.toBeNull();
    expect(host.querySelector('a[href="/activate"]')).not.toBeNull();
    expect(calls("/api/research/partner/dashboard")).toHaveLength(0);
  });

  it.each([0, 1])("returns an approved account to its separately verified partner dashboard through link %s", async (index) => {
    await followPartnerSignIn(index);
    expect(host.querySelector('a[data-testid="link-forgot-password"]')?.getAttribute("href"))
      .toBe("/research/reset-password?returnTo=%2Fresearch%2Fpartners%2Fdashboard");
    await submit();
    expect(supa.auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({ email: "partner@example.invalid", password: "synthetic-password" });
    expect(window.location.pathname).toBe(destination);
    expect(calls("/api/research/member/me").length).toBeGreaterThan(0);
    expect(calls("/api/research/partner/dashboard")).toEqual([{ path: "/api/research/partner/dashboard", init: expect.objectContaining({
      method: "GET", cache: "no-store", headers: { Authorization: "Bearer synthetic-partner-token" },
    }) }]);
    expect(host.querySelector('[data-testid="pd-identity"]')?.textContent).toContain("Affiliate");
    expect(host.querySelector('[data-testid="pd-next-action"]')?.textContent).toContain("Partner active");
  });

  it("shows the canonical partner denial for an ordinary active customer without granting a partner", async () => {
    partnerExists = false;
    await followPartnerSignIn(); await submit();
    expect(window.location.pathname).toBe(destination);
    expect(calls("/api/research/partner/dashboard")).toHaveLength(1);
    expect(host.textContent).toContain("No partner account found.");
    expect(host.textContent).toContain("Partner access is separate from your customer account");
    expect(host.querySelector('a[href="/research/account"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="ra-metric"]')).toBeNull();
    expect(host.querySelector('[data-testid="pd-identity"]')).toBeNull();
  });

  it("stays at sign-in when Auth returns no session, without reading member or partner data", async () => {
    supa.state.mode = "missing";
    await followPartnerSignIn(); await submit();
    expect(window.location.pathname).toBe("/sign-in");
    expect(host.querySelector('[data-testid="text-signin-error"]')?.textContent).toContain("email and password don't match");
    expect(calls("/api/research/member/me")).toHaveLength(0);
    expect(calls("/api/research/partner/dashboard")).toHaveLength(0);
  });

  it.each(["marker", "token"])("does not let the destination bypass a recovery %s", async (kind) => {
    if (kind === "marker") sessionStorage.setItem(RECOVERY_MARKER_KEY, "1");
    else supa.state.mode = "recovery";
    await followPartnerSignIn(); await submit();
    expect(window.location.pathname).toBe("/research/access-state");
    expect(new URLSearchParams(window.location.search).get("code")).toBe("recovery_session");
    expect(supa.auth.signInWithPassword).toHaveBeenCalledTimes(kind === "marker" ? 0 : 1);
    expect(calls("/api/research/member/me")).toHaveLength(0);
    expect(calls("/api/research/partner/dashboard")).toHaveLength(0);
  });

  it.each(["account_access_required", "membership_inactive"])("preserves server denial %s instead of following a partner hint", async (code) => {
    memberDenial = code;
    await followPartnerSignIn(); await submit();
    expect(window.location.pathname).toBe("/research/access-state");
    expect(new URLSearchParams(window.location.search).get("code")).toBe(code);
    expect(calls("/api/research/partner/dashboard")).toHaveLength(0);
  });

  it.each(["https://outside.invalid/research/partners/dashboard", "//outside.invalid", "/admin/research",
    "/research/partners/dashboard/foreign"])("rejects hostile returnTo %s after normal sign-in", async (returnTo) => {
    await mount(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`); await submit();
    expect(window.location.pathname).toBe("/research/account");
    expect(host.querySelector('[data-testid="account-destination"]')).not.toBeNull();
    expect(calls("/api/research/partner/dashboard")).toHaveLength(0);
  });
});

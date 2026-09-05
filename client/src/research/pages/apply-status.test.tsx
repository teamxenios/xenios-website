// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApplyStatus from "./ApplyStatus";

const provider = vi.hoisted(() => ({
  token: null as string | null, error: false, available: true, recovery: "none",
  listeners: new Set<(event: string, session: { access_token: string } | null) => void>(),
  refresh: vi.fn(), updateUser: vi.fn(), signIn: vi.fn(),
}));
vi.mock("../core", () => ({ useResearch: () => ({ memberToken: null, recovery: provider.recovery, refreshMember: provider.refresh }) }));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
vi.mock("@/lib/supabaseBrowser", async (original) => ({
  ...await original<typeof import("@/lib/supabaseBrowser")>(),
  getSupabaseBrowser: async () => provider.available ? { auth: {
    getSession: async () => ({ data: { session: provider.token ? { access_token: provider.token } : null }, error: provider.error ? new Error("private provider detail") : null }),
    onAuthStateChange: (listener: (event: string, session: { access_token: string } | null) => void) => {
      provider.listeners.add(listener); return { data: { subscription: { unsubscribe: () => provider.listeners.delete(listener) } } };
    },
    updateUser: provider.updateUser, signInWithPassword: provider.signIn,
  } } : null,
}));
const TOKEN = "v2.account_claim.synthetic-signed-token";
const fixture = (status = "approved_customer") => ({
  firstName: "Synthetic", status, submittedAt: "2026-09-01T00:00:00Z", memberVisibleNote: null, approvalExpiresAt: "2099-09-05T00:00:00Z",
});
const confirmed = { ok: true, applicationId: "00000000-0000-4000-8000-000000000001", memberId: "00000000-0000-4000-8000-000000000002", state: "active", replayed: false };
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let host: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
const render = () => act(async () => { root.render(<ApplyStatus />); });
const calls = () => fetcher.mock.calls.filter(([url]) => url === "/api/research/member/claim");
async function fill(id: string, value: string) {
  await act(async () => {
    const element = host.querySelector<HTMLInputElement>("#" + id)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function passwords(password = "synthetic-password", confirm = password) { await fill("ca-password", password); await fill("ca-confirm", confirm); }
const submit = () => act(async () => { host.querySelector('[data-testid="form-claim-account"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
function emit(token: string | null, event = "SIGNED_IN") {
  provider.token = token;
  provider.listeners.forEach((listener) => listener(event, token ? { access_token: token } : null));
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.sessionStorage.clear(); window.history.replaceState({}, "", "/research/apply/status?token=" + TOKEN);
  provider.token = null; provider.error = false; provider.available = true; provider.recovery = "none"; provider.listeners.clear();
  provider.refresh.mockReset().mockResolvedValue(undefined); provider.updateUser.mockReset(); provider.signIn.mockReset();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  fetcher = vi.fn(async (url) => response(String(url).startsWith("/api/research/applications/status") ? { ok: true, application: fixture() } : confirmed));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); window.sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("approved customer account claim", () => {
  it.each(["/research/account/orders", "https://outside.invalid", "/research/account?token=SECRET"])("scrubs the approval link and preserves only a safe destination (%s)", async (returnTo) => {
    window.history.replaceState({}, "", "/research/apply/status?token=" + TOKEN + "&returnTo=" + encodeURIComponent(returnTo));
    await render();
    expect(window.location.href).not.toContain(TOKEN); expect(window.location.href).not.toContain("SECRET"); expect(window.location.href).not.toContain("outside");
    expect(window.sessionStorage.getItem("xr-application-token")).toBe(TOKEN);
    expect(host.querySelector('a[href^="/research/sign-in"]')?.getAttribute("href")).toBe("/research/sign-in?returnTo=%2Fresearch%2Fapply%2Fstatus");
    expect(calls()).toHaveLength(0);
    await passwords(); await submit();
    expect(JSON.parse(calls()[0][1].body)).toEqual({ token: TOKEN, password: "synthetic-password" });
    expect(calls()[0][1]).toMatchObject({ method: "POST", cache: "no-store", referrerPolicy: "no-referrer", headers: { "Content-Type": "application/json" } });
    expect(calls()[0][1].headers.Authorization).toBeUndefined();
    const destination = returnTo.startsWith("/research/account/orders") ? "/research/account/orders" : "/research/account";
    expect(host.querySelector('[data-testid="card-claim-success"] a')?.getAttribute("href")).toBe("/research/sign-in?returnTo=" + encodeURIComponent(destination));
    expect(document.activeElement).toBe(host.querySelector('[data-testid="card-claim-success"]'));
    expect(provider.refresh).not.toHaveBeenCalled();
    expect(provider.updateUser).not.toHaveBeenCalled(); expect(provider.signIn).not.toHaveBeenCalled();
  });
  it("resumes an Auth-only ordinary sign-in using the tab claim token and no password", async () => {
    window.sessionStorage.setItem("xr-application-token", TOKEN); window.history.replaceState({}, "", "/research/apply/status");
    provider.token = "normal-auth-without-member"; await render();
    expect(host.querySelector('input[type="password"]')).toBeNull();
    expect(host.textContent).toContain("Your password will not be changed");
    await submit();
    expect(JSON.parse(calls()[0][1].body)).toEqual({ token: TOKEN });
    expect(calls()[0][1].headers.Authorization).toBe("Bearer normal-auth-without-member");
    expect(provider.refresh).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-testid="card-claim-success"] a')?.getAttribute("href")).toBe("/research/account");
    expect(provider.updateUser).not.toHaveBeenCalled(); expect(provider.signIn).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain(TOKEN);
  });
  it("keeps the current scrubbed link in memory when tab storage rejects writes, without promising sign-in resume", async () => {
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "xr-application-token") throw new Error("storage blocked");
      return original.call(this, key, value);
    });
    await render();
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.sessionStorage.getItem("xr-application-token")).toBeNull();
    expect(host.textContent).toContain("cannot retain the account link through sign-in");
    await passwords(); await submit();
    expect(JSON.parse(calls()[0][1].body)).toEqual({ token: TOKEN, password: "synthetic-password" });
    expect(host.querySelector('[data-testid="card-claim-success"]')).not.toBeNull();
  });
  it("accepts an authoritative active replay result for an approved-customer claim without inventing another claim authority", async () => {
    provider.token = "normal-auth";
    fetcher.mockImplementation(async (url) => response(String(url).startsWith("/api/research/applications/status")
      ? { ok: true, application: fixture() } : { ...confirmed, replayed: true }));
    await render(); await submit();
    expect(host.textContent).toContain("Account access confirmed");
    expect(calls()).toHaveLength(1);
    expect(JSON.parse(calls()[0][1].body)).toEqual({ token: TOKEN });
  });
  it.each(["active", "approved_pending_payment", "approved_sponsored_b2b", "payment_pending", "paused", "expired", "declined"])("does not expose legacy claim or paid activation for %s", async (status) => {
    fetcher.mockResolvedValue(response({ ok: true, application: fixture(status) })); await render();
    expect(host.querySelector('[data-testid="form-claim-account"]')).toBeNull();
    expect(host.querySelector('input[type="password"]')).toBeNull();
    expect(calls()).toHaveLength(0);
    expect(host.textContent).not.toContain("$50"); expect(host.textContent).not.toContain("$25");
    expect(host.querySelector('a[href="/research/activate"]')).toBeNull();
    if (status === "active") expect(host.querySelector('a[href^="/research/sign-in"]')?.getAttribute("href")).toBe("/research/sign-in?returnTo=%2Fresearch%2Faccount");
  });
  it.each(["unknown_approval", "constructor", "toString"])("fails closed on unknown status %s", async (status) => {
    fetcher.mockResolvedValue(response({ ok: true, application: fixture(status) })); await render();
    expect(host.textContent).toContain("could not be verified");
    expect(host.querySelector('[data-testid="form-claim-account"]')).toBeNull();
  });
  it("does not expose a claim after expiry or from malformed status data", async () => {
    fetcher.mockResolvedValueOnce(response({ ok: true, application: { ...fixture(), approvalExpiresAt: "2000-01-01T00:00:00Z" } }));
    await render(); expect(host.textContent).toContain("This approval has expired");
    expect(host.querySelector('[data-testid="form-claim-account"]')).toBeNull();
  });
  it.each([["short", "short"], ["valid-long-password", "different-password"]])("validates new-sign-in passwords without sending them (%s)", async (password, confirm) => {
    await render(); await passwords(password, confirm); await submit();
    expect(host.querySelector('[data-testid="text-claim-error"]')).not.toBeNull(); expect(calls()).toHaveLength(0);
  });
  it.each(["existing_sign_in_required", "verified_sign_in_required", "claim_incomplete"])("requires ordinary sign-in after %s, with no password reset or blind retry", async (code) => {
    fetcher.mockImplementation(async (url) => response(String(url).startsWith("/api/research/applications/status")
      ? { ok: true, application: fixture() } : { ok: false, code, message: "private upstream detail" }, String(url).includes("/claim") ? 409 : 200));
    await render(); await passwords(); await submit();
    expect(host.querySelector('[data-testid="card-claim-success"]')).toBeNull();
    expect(host.querySelector('input[type="password"]')).toBeNull();
    expect(host.querySelector('[data-testid="button-claim-account"]')).toBeNull();
    expect(host.textContent).not.toContain("private upstream detail");
    expect(host.querySelector('a[href^="/research/sign-in"]')?.getAttribute("href")).toBe("/research/sign-in?returnTo=%2Fresearch%2Fapply%2Fstatus");
    expect(provider.updateUser).not.toHaveBeenCalled();
  });
  it.each(["identity_review_required", "approved_access_unavailable", "claim_not_available"])("does not confirm access on %s", async (code) => {
    provider.token = "normal-auth";
    fetcher.mockImplementation(async (url) => response(String(url).startsWith("/api/research/applications/status")
      ? { ok: true, application: fixture() } : { ok: false, code, message: "private upstream detail" }, String(url).includes("/claim") ? 409 : 200));
    await render(); await submit();
    expect(host.querySelector('[data-testid="card-claim-success"]')).toBeNull(); expect(provider.refresh).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="text-claim-error"]')).not.toBeNull(); expect(host.textContent).not.toContain("private upstream detail");
  });
  it("does not treat a generic ok envelope as a confirmed active customer", async () => {
    fetcher.mockImplementation(async (url) => response(String(url).startsWith("/api/research/applications/status") ? { ok: true, application: fixture() } : { ok: true }));
    await render(); await passwords(); await submit();
    expect(host.querySelector('[data-testid="card-claim-success"]')).toBeNull(); expect(provider.refresh).not.toHaveBeenCalled();
  });
  it.each(["marker", "context", "purpose"])("never sends a recovery session as normal claim authority (%s)", async (mode) => {
    if (mode === "marker") window.sessionStorage.setItem("xenios-research-recovery-pending", "1");
    if (mode === "context") provider.recovery = "pending";
    provider.token = mode === "purpose" ? "header." + btoa(JSON.stringify({ amr: [{ method: "recovery" }] })) + ".signature" : "normal-auth";
    await render();
    expect(host.textContent).toContain("Complete recovery and sign in normally");
    expect(host.querySelector('[data-testid="form-claim-account"]')).toBeNull(); expect(calls()).toHaveLength(0);
  });
  it("blocks unknown provider state instead of falling back to creating a new sign-in", async () => {
    provider.error = true; await render();
    expect(host.textContent).toContain("Your sign-in could not be checked");
    expect(host.querySelector('[data-testid="form-claim-account"]')).toBeNull(); expect(calls()).toHaveLength(0);
  });
  it("uses no password after the provider changes from signed-out to an ordinary sign-in", async () => {
    await render(); await passwords();
    await act(async () => emit("new-normal-auth"));
    expect(host.querySelector('input[type="password"]')).toBeNull(); await submit();
    expect(JSON.parse(calls()[0][1].body)).toEqual({ token: TOKEN });
    expect(calls()[0][1].headers.Authorization).toBe("Bearer new-normal-auth");
  });
  it("does not submit a stale tab token or keep its password after the link changes", async () => {
    await render(); await passwords();
    window.sessionStorage.setItem("xr-application-token", "v2.account_claim.second-synthetic-token");
    await submit();
    expect(calls()).toHaveLength(0);
    expect(host.querySelector<HTMLInputElement>("#ca-password")?.value).toBe("");
  });
  it("discards an old account's in-flight claim completion after a provider identity switch", async () => {
    provider.token = "normal-a";
    let finish!: (value: unknown) => void;
    fetcher.mockImplementation((url) => String(url).startsWith("/api/research/applications/status") ? Promise.resolve(response({ ok: true, application: fixture() }))
      : new Promise((resolve) => { finish = resolve; }));
    await render(); await submit();
    await act(async () => emit("normal-b"));
    await act(async () => finish(response(confirmed)));
    expect(host.querySelector('[data-testid="card-claim-success"]')).toBeNull();
    expect(provider.refresh).not.toHaveBeenCalled();
  });
  it("discards a late status read when a new signed-link context has replaced it", async () => {
    let finish!: (value: unknown) => void;
    fetcher.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValue(response({ ok: true, application: { ...fixture(), firstName: "Second" } }));
    await render();
    await act(async () => window.history.pushState({}, "", "/research/apply/status?token=v2.account_claim.second-context"));
    await act(async () => finish(response({ ok: true, application: fixture() })));
    expect(host.textContent).toContain("Hi Second."); expect(host.textContent).not.toContain("Hi Synthetic.");
  });
});

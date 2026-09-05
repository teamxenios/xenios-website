// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ActivationPage from "./ActivationPage";

const session = vi.hoisted(() => ({
  member: { firstName: "Synthetic", status: "active", applicationStatus: "approved_customer" } as { firstName: string; status: string; applicationStatus: string } | null,
  memberToken: "normal-member" as string | null, memberChecking: false, memberSessionStatus: "authenticated", recovery: "none",
}));
vi.mock("../core", () => ({ useResearch: () => session }));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
let host: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
const render = () => act(async () => { root.render(<ActivationPage />); });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.member = { firstName: "Synthetic", status: "active", applicationStatus: "approved_customer" };
  session.memberToken = "normal-member"; session.memberChecking = false; session.memberSessionStatus = "authenticated"; session.recovery = "none";
  fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

function noPaidActivation() {
  expect(fetcher).not.toHaveBeenCalled();
  expect(host.querySelector("form")).toBeNull();
  expect(host.textContent).not.toContain("$50"); expect(host.textContent).not.toContain("$25");
  expect(host.textContent).not.toContain("Founding Membership");
  expect(host.querySelector('[data-testid="activation-pricing"]')).toBeNull();
  expect(host.querySelector('[data-testid="payment-report-form"]')).toBeNull();
}
describe("account access at the retired paid activation route", () => {
  it("continues a canonically active customer to the normal account without billing reads or writes", async () => {
    await render();
    expect(host.textContent).toContain("Your customer account is active");
    expect(host.querySelector('a[href="/research/account"]')?.textContent).toBe("Open my account");
    expect(host.textContent).toContain("remain separate server-controlled decisions");
    noPaidActivation();
  });
  it.each(["pending_activation", "past_due", "paused", "cancelled", "closed", "unknown_status", "approved_customer"])("does not upgrade canonical status %s from an application approval label", async (status) => {
    session.member!.status = status; await render();
    expect(host.textContent).toContain("Account access needs review");
    expect(host.querySelector('a[href="/research/account"]')).toBeNull();
    expect(host.querySelector('a[href="/research/support"]')).not.toBeNull();
    noPaidActivation();
  });
  it("does not treat an absent customer record plus an Auth token as active", async () => {
    session.member = null; await render();
    expect(host.textContent).toContain("Account access needs review"); noPaidActivation();
  });
  it("uses ordinary sign-in with the account destination for signed-out visitors", async () => {
    session.member = null; session.memberToken = null; session.memberSessionStatus = "signed_out"; await render();
    expect(host.textContent).toContain("Sign in to your account");
    expect(host.querySelector('a[href^="/research/sign-in"]')?.getAttribute("href")).toBe("/research/sign-in?returnTo=%2Fresearch%2Faccount");
    expect(host.querySelector('a[href^="/research/reset-password"]')?.getAttribute("href")).toBe("/research/reset-password?returnTo=%2Fresearch%2Faccount");
    noPaidActivation();
  });
  it("shows a neutral checking state with no active or sign-in flash", async () => {
    session.memberChecking = true; await render();
    expect(host.textContent).toContain("Checking your account");
    expect(host.querySelector('a[href="/research/account"]')).toBeNull();
    expect(host.querySelector('a[href^="/research/sign-in"]')).toBeNull(); noPaidActivation();
  });
  it("preserves verification failures instead of offering activation or active access", async () => {
    session.memberSessionStatus = "verification_failed"; await render();
    expect(host.textContent).toContain("Account access could not be verified");
    expect(host.querySelector('a[href="/research/account"]')).toBeNull(); noPaidActivation();
  });
  it.each(["pending", "link_error"])("does not accept a %s recovery context as normal customer access", async (recovery) => {
    session.recovery = recovery; await render();
    expect(host.textContent).toContain("Finish account recovery first");
    expect(host.querySelector('a[href="/research/account"]')).toBeNull(); noPaidActivation();
  });
  it("also rejects recovery-purpose bearer tokens", async () => {
    session.memberToken = "header." + btoa(JSON.stringify({ amr: [{ method: "recovery" }] })) + ".signature";
    await render(); expect(host.textContent).toContain("Finish account recovery first"); noPaidActivation();
  });
  it("removes the old account action immediately during principal changes and sign-out", async () => {
    await render(); expect(host.querySelector('a[href="/research/account"]')).not.toBeNull();
    session.memberChecking = true; session.memberToken = "normal-second"; session.member = null; await render();
    expect(host.querySelector('a[href="/research/account"]')).toBeNull();
    session.memberChecking = false; session.memberSessionStatus = "signed_out"; session.memberToken = null; await render();
    expect(host.textContent).toContain("Sign in to your account"); noPaidActivation();
  });
});

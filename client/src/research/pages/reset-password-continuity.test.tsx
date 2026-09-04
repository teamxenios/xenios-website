// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { ResearchContext, type ResearchContextValue } from "../core";
import ResetPassword from "./ResetPassword";
import SignIn from "./SignIn";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const provider = vi.hoisted(() => ({
  token: null as string | null,
  auth: {
    getSession: vi.fn(), updateUser: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(),
  },
}));
vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: provider.auth }),
  isRecoveryAccessToken: (token: string) => token === "demo-recovery",
  recoveryAccessTokenFromHash: () => null,
}));

let root: Root | null = null;
let container: HTMLDivElement;
const signOutRecoverySession = vi.fn(async () => { provider.token = null; });
const clearRecovery = vi.fn();
const establishMemberSession = vi.fn(async () => ({ firstName: "Fixture", status: "active", applicationStatus: "active" }));

async function mount(page: "reset" | "signin", recovery: "none" | "pending" | "link_error" = "none") {
  if (root) await act(async () => root!.unmount());
  container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  const context = { recovery, clearRecovery, signOutRecoverySession, establishMemberSession, peekMemberDenial: () => null } as unknown as ResearchContextValue;
  await act(async () => {
    root!.render(<ResearchContext.Provider value={context}>{page === "reset" ? <ResetPassword /> : <SignIn />}</ResearchContext.Provider>);
  });
}

async function fill(values: Record<string, string>) {
  await act(async () => {
    for (const [selector, value] of Object.entries(values)) {
      const input = container.querySelector(selector) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

async function submit() {
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

beforeEach(() => {
  vi.clearAllMocks();
  provider.token = null;
  provider.auth.getSession.mockImplementation(async () => ({ data: { session: provider.token ? { access_token: provider.token } : null } }));
  provider.auth.updateUser.mockResolvedValue({ error: null });
  provider.auth.signInWithPassword.mockImplementation(async () => {
    provider.token = "demo-auth";
    return { data: { session: { access_token: provider.token } }, error: null };
  });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, message: "If a member account exists, a reset link is on its way." }) })));
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("password recovery intent continuity (synthetic provider)", () => {
  it.each([
    "/research/account/orders/XRR-Fixture_01?tab=payment",
    "/research/member/assessment?mode=checkin",
    "/research/member/catalog/research_vials/fixture-product?variant=fixture.1&qty=2&intent=buy_now",
    "/research/early-access/order-request/XRR-Fixture_01",
    "/care/schedule",
  ])("requires fresh password sign-in and returns to %s", async (destination) => {
    window.history.replaceState(null, "", researchAuthPath("/research/sign-in", destination));
    await mount("signin");
    const forgot = container.querySelector('[data-testid="link-forgot-password"]')!.getAttribute("href")!;
    window.history.replaceState(null, "", forgot);
    await mount("reset");
    await fill({ "#rp-email": "FIXTURE@EXAMPLE.INVALID" });
    await submit();
    const sent = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sent).toEqual({ email: "fixture@example.invalid", returnTo: destination });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("If a member account exists");

    // Model a fresh-tab email arrival. The backend handler's identical helper
    // invocation and trusted SITE origin are independently tested in members.
    window.history.replaceState(null, "", researchAuthPath("/research/reset-password", sent.returnTo));
    provider.token = "demo-recovery";
    await mount("reset", "pending");
    await fill({ "#rp-password": "demo-password", "#rp-confirm": "demo-password" });
    await submit();
    expect(provider.auth.updateUser).toHaveBeenCalledWith({ password: "demo-password" });
    expect(signOutRecoverySession).toHaveBeenCalledWith("demo-recovery");
    expect(provider.token).toBeNull();
    expect(establishMemberSession).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe(researchAuthPath("/research/sign-in", destination));

    await mount("signin");
    await fill({ "#ms-email": "fixture@example.invalid", "#ms-password": "demo-password" });
    await submit();
    expect(establishMemberSession).toHaveBeenCalledWith("demo-auth");
    expect(window.location.pathname + window.location.search).toBe(destination);
    expect(signOutRecoverySession).toHaveBeenCalledTimes(1);
  });

  it("strips credentials from recovery requests and recovery navigation", async () => {
    window.history.replaceState(null, "", `/research/reset-password?returnTo=${encodeURIComponent("/research/account?token=SECRET&access_token=SECRET&returnTo=https://outside.invalid")}`);
    await mount("reset");
    await fill({ "#rp-email": "fixture@example.invalid" });
    await submit();
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({ email: "fixture@example.invalid", returnTo: "/research/account" });
    expect(container.querySelector('[data-testid="link-member-login"]')!.getAttribute("href")).toBe(researchAuthPath("/research/sign-in", "/research/account"));
  });

  it("retains destination after an expired/reused link without changing a password", async () => {
    window.history.replaceState(null, "", researchAuthPath("/research/reset-password", "/research/account/security"));
    await mount("reset", "link_error");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("expired or was already used");
    expect(container.querySelector('[data-testid="form-request-reset"]')).not.toBeNull();
    expect(provider.auth.updateUser).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="link-member-login"]')!.getAttribute("href")).toBe(researchAuthPath("/research/sign-in", "/research/account/security"));
  });
});

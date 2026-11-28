// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchContext, type ResearchContextValue } from "../core";
import SignIn from "./SignIn";

const fixture = vi.hoisted(() => ({
  token: "synthetic-password-session", subject: "20000000-0000-4000-8000-000000000001",
  signIn: vi.fn(), getSession: vi.fn(),
}));
vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: { signInWithPassword: fixture.signIn, getSession: fixture.getSession } }),
  isRecoveryAccessToken: (token: string) => token.includes("synthetic-recovery"),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const REFERENCE = "XRI-30000000000040008000000000000001";
let host: HTMLDivElement, root: Root;
let establish: ReturnType<typeof vi.fn>;
const session = () => ({ access_token: fixture.token, user: { id: fixture.subject } });

beforeEach(() => {
  fixture.token = "synthetic-password-session";
  fixture.subject = "20000000-0000-4000-8000-000000000001";
  fixture.signIn.mockReset().mockImplementation(async () => ({ data: { session: session() }, error: null }));
  fixture.getSession.mockReset().mockImplementation(async () => ({ data: { session: session() }, error: null }));
  establish = vi.fn(async () => ({ firstName: "Synthetic", status: "active", applicationStatus: "active" }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected external action"); }));
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  window.history.replaceState(null, "", "/"); vi.unstubAllGlobals();
});
async function mount(destination: string, recovery: ResearchContextValue["recovery"] = "none") {
  window.history.replaceState(null, "", "/research/sign-in?returnTo=" + encodeURIComponent(destination));
  const value = { recovery, establishMemberSession: establish, peekMemberDenial: () => null } as unknown as ResearchContextValue;
  await act(async () => root.render(<ResearchContext.Provider value={value}><SignIn /></ResearchContext.Provider>));
  await act(async () => {
    for (const [id, value] of [["ms-email", "fixture@example.invalid"], ["ms-password", "synthetic-not-a-real-password"]]) {
      const control = host.querySelector<HTMLInputElement>("#" + id)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(control, value);
      control.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}
async function submit() {
  await act(async () => {
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
  });
}

describe("actual SignIn Care request return", () => {
  it("returns an ordinary Auth session directly to the same sanitized request, without customer membership or writes", async () => {
    await mount("/care/request-intents?reference=" + REFERENCE + "&role=clinical_admin&token=PRIVATE&returnTo=https://outside.invalid");
    await submit();
    expect(window.location.pathname + window.location.search).toBe("/care/request-intents?reference=" + REFERENCE);
    expect(fixture.signIn).toHaveBeenCalledWith({ email: "fixture@example.invalid", password: "synthetic-not-a-real-password" });
    expect(establish).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves the validated locator on the existing password-recovery navigation too", async () => {
    await mount("/care/request-intents?reference=" + REFERENCE);
    const link = host.querySelector<HTMLAnchorElement>('[data-testid="link-forgot-password"]')!;
    expect(new URL(link.href).pathname).toBe("/research/reset-password");
    expect(new URL(link.href).searchParams.get("returnTo")).toBe("/care/request-intents?reference=" + REFERENCE);
    expect(fixture.signIn).not.toHaveBeenCalled();
  });
  it("drops unrelated Care view hints and recognizes the sanitized base pathname without customer membership", async () => {
    await mount("/care/request-intents?tab=overview&role=clinical_admin"); await submit();
    expect(window.location.pathname + window.location.search).toBe("/care/request-intents");
    expect(establish).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["invalid", REFERENCE + "&reference=" + REFERENCE])("does not select a request from malformed or duplicate locator %s", async reference => {
    await mount("/care/request-intents?reference=" + reference);
    await submit();
    expect(window.location.pathname + window.location.search).toBe("/care/request-intents");
    expect(establish).not.toHaveBeenCalled();
  });
  it.each(["/care/request-intents/export?reference=" + REFERENCE, "/care/request-intents-evil?reference=" + REFERENCE,
    "//outside.invalid/care/request-intents?reference=" + REFERENCE,
    "/care/%72equest-intents?reference=" + REFERENCE])("does not classify a lookalike destination as Care: %s", async destination => {
    await mount(destination); await submit();
    expect(establish).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/research/account");
    expect(window.location.search).toBe("");
  });
  it("does not enter Care with a recovery session", async () => {
    await mount("/care/request-intents?reference=" + REFERENCE, "pending"); await submit();
    expect(fixture.signIn).not.toHaveBeenCalled(); expect(establish).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/research/access-state");
    expect(new URLSearchParams(window.location.search).get("code")).toBe("recovery_session");
  });
  it("does not enter Care after an unobserved principal switch during sign-in", async () => {
    await mount("/care/request-intents?reference=" + REFERENCE);
    fixture.getSession.mockResolvedValueOnce({ data: { session: { ...session(), user: { id: "20000000-0000-4000-8000-000000000002" } } } });
    await submit();
    expect(window.location.pathname).toBe("/research/sign-in");
    expect(host.textContent).toContain("Your session changed while signing in");
    expect(establish).not.toHaveBeenCalled();
  });
  it("does not navigate on rejected credentials", async () => {
    await mount("/care/request-intents?reference=" + REFERENCE);
    fixture.signIn.mockResolvedValueOnce({ data: { session: null }, error: { message: "synthetic refusal" } });
    await submit();
    expect(window.location.pathname).toBe("/research/sign-in");
    expect(host.textContent).toContain("That email and password combination is not correct.");
    expect(fixture.getSession).not.toHaveBeenCalled(); expect(establish).not.toHaveBeenCalled();
  });
});

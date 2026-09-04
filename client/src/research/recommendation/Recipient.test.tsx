// @vitest-environment jsdom
import { act, StrictMode, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_API } from "@shared/research/referral-v1";
import Recipient from "./Recipient";

const navigation = vi.hoisted(() => vi.fn());
vi.mock("wouter", () => ({ useLocation: () => ["/r/synthetic", navigation], Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("@/lib/supabaseBrowser", () => ({ getSupabaseBrowser: vi.fn().mockResolvedValue(null), isRecoveryAccessToken: (token: string) => token === "synthetic-recovery-token" }));
const code = `r1_${"A".repeat(43)}`;
let host: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const context = (destinationPath = "/care") => response({ ok: true, valid: true, sharedBy: "an approved Xenios partner", destinationPath });
const bootstrap = () => response({ ok: true, csrfToken: "synthetic-safe-csrf-value" });
const captured = (destinationPath = "/care", attribution = "recognized") => response({ ok: true, destinationPath, attribution, accountBinding: "sign_in_required" });
const render = (props: { code: string; memberToken?: string | null } = { code }) => act(async () => { root.render(<Recipient {...props} />); });
const button = (label: string) => Array.from(host.querySelectorAll("button")).find(item => item.textContent === label)!;
const click = (label: string) => act(async () => { button(label).click(); });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  fetcher = vi.fn().mockResolvedValue(context()); vi.stubGlobal("fetch", fetcher); navigation.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("recipient recommendation continuity", () => {
  it("resolves safe context without automatically capturing, binding, or navigating", async () => {
    await render();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(REFERRAL_API.resolve, expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store", body: JSON.stringify({ code }) }));
    expect(host.textContent).toContain("Care and Research are distinct");
    expect(host.textContent).toContain("not for human use");
    expect(host.textContent).toContain("does not create an account");
    expect(navigation).not.toHaveBeenCalled();
    expect(host.innerHTML).not.toContain(code);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.innerHTML).not.toContain(code);
    expect(host.querySelector('a[href="/research/support"]')).not.toBeNull();
    expect(host.querySelector('a[href="/care/support"]')).not.toBeNull();
    expect(host.textContent).not.toContain("essential");
  });
  it("bootstraps and captures only on Continue, with the CSRF token and optional canonical bearer", async () => {
    fetcher.mockResolvedValueOnce(context("/research/member/catalog")).mockResolvedValueOnce(bootstrap()).mockResolvedValueOnce(captured("/research/member/catalog"));
    await render({ code, memberToken: "synthetic-canonical-member" });
    await click("Continue with recommendation");
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([REFERRAL_API.resolve, REFERRAL_API.bootstrap, REFERRAL_API.capture]);
    expect(fetcher.mock.calls[1][1].body).toBe("{}");
    expect(fetcher.mock.calls[2][1]).toMatchObject({ body: JSON.stringify({ code }), headers: { "X-Xenios-Referral-CSRF": "synthetic-safe-csrf-value", Authorization: "Bearer synthetic-canonical-member" }, credentials: "same-origin", cache: "no-store" });
    expect(navigation).toHaveBeenCalledWith("/research/member/catalog");
    expect(fetcher.mock.calls.some(call => call[0] === REFERRAL_API.bind)).toBe(false);
    expect(host.innerHTML).not.toContain("synthetic-canonical-member");
  });
  it("requires a Health pathway choice and preserves it when prior referral context differs", async () => {
    fetcher.mockResolvedValueOnce(context("/health")).mockResolvedValueOnce(bootstrap()).mockResolvedValueOnce(captured("/care"));
    await render();
    expect(button("Continue with recommendation").disabled).toBe(true);
    await act(async () => (host.querySelector('input[value="/research"]') as HTMLInputElement).click());
    await click("Continue with recommendation");
    expect(navigation).toHaveBeenCalledWith("/research");
  });
  it("allows browsing without capture and does not claim a referral was recognized", async () => {
    await render(); await click("Continue without confirming referral");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(navigation).toHaveBeenCalledWith("/care");
  });
  it("rejects unsafe destinations and invalid code shapes before capturing", async () => {
    await render({ code: "not-a-valid-referral" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(host.textContent).toContain("not valid");
    fetcher.mockResolvedValue(context("https://outside.example.invalid/research"));
    await render();
    expect(host.textContent).toContain("could not be verified safely");
    expect(button("Continue with recommendation")).toBeUndefined();
    expect(host.querySelector('a[href="https://outside.example.invalid/research"]')).toBeNull();
    expect(navigation).not.toHaveBeenCalled();
  });
  it.each([400, 404, 410, 503])("shows an honest unavailable state for resolve status %s", async status => {
    fetcher.mockResolvedValue(response({ ok: false, message: "private upstream" }, status)); await render();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).not.toContain("private upstream");
    expect(button("Continue with recommendation")).toBeUndefined();
    expect(navigation).not.toHaveBeenCalled();
  });
  it("does not send capture without a valid bootstrap and offers an explicit browsing action", async () => {
    fetcher.mockResolvedValueOnce(context()).mockResolvedValueOnce(response({ ok: true, csrfToken: "" }));
    await render(); await click("Continue with recommendation");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("referral was not confirmed");
    expect(navigation).not.toHaveBeenCalled();
    await click("Continue without confirming referral"); expect(navigation).toHaveBeenCalledWith("/care");
  });
  it("does not attach a supplied recovery-purpose credential", async () => {
    fetcher.mockResolvedValueOnce(context()).mockResolvedValueOnce(bootstrap()).mockResolvedValueOnce(captured());
    await render({ code, memberToken: "synthetic-recovery-token" }); await click("Continue with recommendation");
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBeUndefined();
  });
  it.each(["retained_ineligible", "self_referral", "unavailable", "unknown"]) ("never reports recognition for %s", async attribution => {
    fetcher.mockResolvedValueOnce(context()).mockResolvedValueOnce(bootstrap()).mockResolvedValueOnce(captured("/care", attribution));
    await render(); await click("Continue with recommendation");
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(navigation).not.toHaveBeenCalled();
    expect(button("Continue without confirming referral")).toBeDefined();
  });
  it("does not navigate or claim success after a failed capture", async () => {
    fetcher.mockResolvedValueOnce(context()).mockResolvedValueOnce(bootstrap()).mockRejectedValueOnce(new Error("offline"));
    await render(); await click("Continue with recommendation");
    expect(host.textContent).toContain("referral was not confirmed");
    expect(navigation).not.toHaveBeenCalled();
  });
  it("ignores pending context for an earlier invitation", async () => {
    let finish!: (result: unknown) => void;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(context("/research"));
    await render(); await render({ code: `r1_${"B".repeat(43)}` });
    await act(async () => finish(context("/care")));
    expect(host.textContent).toContain("Explore nonclinical Research");
    expect(host.textContent).not.toContain("Explore the Care pathway");
  });
  it("does not capture on StrictMode remount", async () => {
    await act(async () => root.render(<StrictMode><Recipient code={code} /></StrictMode>));
    expect(fetcher.mock.calls.every(call => call[0] === REFERRAL_API.resolve)).toBe(true);
    expect(navigation).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ config: vi.fn(), clearRecovery: vi.fn(), signOut: vi.fn(), recovery: "none" as "none" | "pending" }));
vi.mock("../core", () => ({ useResearch: () => ({ recovery: fixture.recovery, clearRecovery: fixture.clearRecovery, signOutRecoverySession: fixture.signOut }) }));
vi.mock("../account-management/api", () => ({ accountManagementApi: { config: fixture.config } }));
vi.mock("@/lib/supabaseBrowser", () => ({ getSupabaseBrowser: async () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }), isRecoveryAccessToken: () => false, recoveryAccessTokenFromHash: () => null }));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
vi.mock("@/components/Turnstile", () => ({ default: ({ onToken }: { onToken(token: string): void }) => <button type="button" onClick={() => onToken("synthetic-captcha")}>Complete verification</button> }));
import ResetPassword from "./ResetPassword";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
async function flush() { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); }
async function mount(universal = true) { window.history.replaceState(null, "", "/research/reset-password" + (universal ? "?returnTo=%2Fresearch%2Faccount%2Fsettings" : "")); await act(async () => root.render(<ResetPassword />)); await flush(); }
function email() { act(() => { const input = host.querySelector<HTMLInputElement>("#rp-email")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, " Person@Example.Invalid "); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
function submit() { act(() => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
beforeEach(() => { vi.clearAllMocks(); fixture.recovery = "none"; fixture.config.mockResolvedValue({ registrationEnabled: true });
  fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ok: true, message: "If eligible, check your inbox." }), { status: 200 })); vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
describe("universal recovery widget is additive to the existing reset flow", () => {
  it("requires CAPTCHA in the explicit universal request and carries no account/role hint", async () => {
    await mount(); email(); expect(host.querySelector<HTMLButtonElement>('[data-testid="button-request-reset"]')!.disabled).toBe(true);
    act(() => [...host.querySelectorAll("button")].find(button => button.textContent === "Complete verification")!.click());
    submit(); await flush(); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ email: "person@example.invalid", returnTo: "/research/account/settings", captchaToken: "synthetic-captcha" });
    expect(fixture.signOut).not.toHaveBeenCalled(); expect(fixture.clearRecovery).not.toHaveBeenCalled();
  });
  it("does not probe U1 or add a carrier to the already-working legacy request page", async () => {
    await mount(false); email(); submit(); await flush();
    expect(fixture.config).not.toHaveBeenCalled(); expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ email: "person@example.invalid" });
    expect(host.textContent).toContain("Recover any Xenios sign-in");
  });
  it("keeps disabled-U1 legacy recovery usable without a missing-secret CAPTCHA bypass", async () => {
    fixture.config.mockResolvedValue({ registrationEnabled: false }); await mount(); email(); submit(); await flush();
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ email: "person@example.invalid", returnTo: "/research/account/settings" });
    expect(host.textContent).toContain("Existing customer and approved staff recovery");
    expect([...host.querySelectorAll("button")].some(button => button.textContent === "Complete verification")).toBe(false);
  });
});

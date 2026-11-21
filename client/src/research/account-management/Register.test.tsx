// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ config: vi.fn(), register: vi.fn() }));
vi.mock("./api", () => ({ accountManagementApi: api }));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
vi.mock("@/components/Turnstile", () => ({ default: ({ onToken }: { onToken(value: string): void }) => <button type="button" onClick={() => onToken("synthetic-captcha")}>Complete verification</button> }));
import Register from "./Register";
import { ACCOUNT_REGISTRATION_NOTICE } from "@shared/research/account-management";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
async function flush() { for (let round = 0; round < 5; round++) await act(async () => { await Promise.resolve(); }); }
function change(id: string, value: string) { act(() => { const input = host.querySelector(id)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
function submit() { act(() => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
beforeEach(() => { vi.clearAllMocks(); api.config.mockResolvedValue({ registrationEnabled: true }); api.register.mockResolvedValue({ ok: true, state: "check_email", message: ACCOUNT_REGISTRATION_NOTICE }); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
describe("ordinary registration has no user-type authority", () => {
  it("requires verification and posts only bounded sign-in fields, clearing the password and not claiming delivery", async () => {
    await act(async () => root.render(<Register />)); await flush();
    expect(host.querySelector("select")).toBeNull();
    change("#register-email", "person@example.invalid"); change("#register-password", "synthetic-password");
    expect([...host.querySelectorAll("button")].find(node => node.textContent === "Create sign-in")!.disabled).toBe(true);
    act(() => [...host.querySelectorAll("button")].find(node => node.textContent === "Complete verification")!.click());
    submit(); await flush();
    expect(api.register).toHaveBeenCalledExactlyOnceWith({ email: "person@example.invalid", password: "synthetic-password", captchaToken: "synthetic-captcha" });
    expect(host.textContent).toContain("If nothing arrives, use those options before trying again.");
    expect(host.textContent).not.toMatch(/account (?:was|has been) created|email (?:was|has been) (?:delivered|sent)/i);
    expect(host.querySelector('input[type="password"]')).toBeNull(); expect(api.register).toHaveBeenCalledTimes(1);
  });
  it("shows unavailable instead of a pretend working form when disabled", async () => {
    api.config.mockResolvedValue({ registrationEnabled: false }); await act(async () => root.render(<Register />)); await flush();
    expect(host.textContent).toContain("Registration is not available"); expect(host.querySelector("form")).toBeNull(); expect(api.register).not.toHaveBeenCalled();
  });
  it("ignores late confirmation after unmount and never navigates or stores a provider session", async () => {
    let release!: (value: unknown) => void; api.register.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    await act(async () => root.render(<Register />)); await flush();
    change("#register-email", "person@example.invalid"); change("#register-password", "synthetic-password");
    act(() => [...host.querySelectorAll("button")].find(node => node.textContent === "Complete verification")!.click()); submit(); await flush();
    expect(host.querySelector<HTMLInputElement>("#register-password")!.value).toBe("");
    act(() => root.render(<p>Different page</p>)); release({ message: "must not display" }); await flush();
    expect(host.textContent).toBe("Different page"); expect(api.register).toHaveBeenCalledTimes(1);
  });
});

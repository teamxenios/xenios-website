// @vitest-environment jsdom
import { act } from "react";
import { renderToString } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const applyPwaUpdate = vi.hoisted(() => vi.fn());
vi.mock("./register", () => ({ applyPwaUpdate }));

import { isPwaInstallLocationAllowed, PwaLifecycle } from "./PwaLifecycle";

const roots: Root[] = [];
const hosts: HTMLDivElement[] = [];
const originalUserAgent = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
const originalMatchMedia = window.matchMedia;

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, value });
}

function renderLifecycle(path = "/about") {
  act(() => window.history.replaceState(null, "", path));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root); hosts.push(host);
  act(() => root.render(<PwaLifecycle />));
  return host;
}

function installEvent() {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn(async () => {});
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
  return { event, prompt };
}

function dispatchInstall() {
  const created = installEvent();
  act(() => window.dispatchEvent(created.event));
  return created;
}

function button(host: HTMLElement, label: string): HTMLButtonElement | null {
  return [...host.querySelectorAll("button")].find((item) => item.textContent === label) ?? null;
}

beforeEach(() => {
  window.sessionStorage.clear();
  setUserAgent("Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36");
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
  applyPwaUpdate.mockClear();
});

afterEach(() => {
  while (roots.length) act(() => roots.pop()!.unmount());
  while (hosts.length) hosts.pop()!.remove();
  window.sessionStorage.clear();
  act(() => window.history.replaceState(null, "", "/"));
  if (originalUserAgent) Object.defineProperty(window.navigator, "userAgent", originalUserAgent);
  else Reflect.deleteProperty(window.navigator, "userAgent");
  Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
});

describe("PWA sensitive-workflow install policy", () => {
  it.each([
    ["/about", "", true],
    ["/product/", "", true],
    ["/health/quick-order-other", "", true],
    ["/health/quick-ordering", "", true],
    ["/RESEARCH/member", "", false],
    ["/%72esearch/member", "", false],
    ["/care/how-it-works", "", false],
    ["/C%61RE", "", false],
    ["/health", "", false],
    ["/health/quick-order", "", false],
    ["/health/quick-order/", "", false],
    ["/HEALTH/QUICK-ORDER", "", false],
    ["/%68ealth/%71uick-order", "", false],
    ["/health/quick-order?source=health#details", "", false],
    ["/health/quick-order", "#details", false],
    ["/health/quick-order%2F", "", false],
    ["/health//quick-order", "", false],
    ["/health/./quick-order", "", false],
    ["/health/%ZZquick-order", "", false],
    ["/r/r1_opaque", "", false],
    ["/%61dmin/users", "", false],
    ["/checkout/review", "", false],
    ["/about", "#type=recovery", false],
    ["/about", "#error_code=otp_expired&error_description=Recovery+link+invalid", false],
    ["/%ZZ", "", false],
    ["/about//team", "", false],
    ["/about/../admin", "", false],
    ["/admin%2Fusers", "", false],
    ["https://example.invalid/about", "", false],
  ])("classifies %s %s as allowed=%s", (path, hash, allowed) => {
    expect(isPwaInstallLocationAllowed(path, hash)).toBe(allowed);
  });

  it("uses a false server snapshot", () => {
    expect(renderToString(<PwaLifecycle />)).toBe("");
  });

  it.each([
    "/research/reset-password",
    "/health/quick-order",
    "/HEALTH/%71uick-order/",
  ])("prevents native auto-install on %s and retains the event across public and intake navigation", (path) => {
    const host = renderLifecycle(path);
    const { event, prompt } = dispatchInstall();
    expect(event.defaultPrevented).toBe(true);
    expect(button(host, "Install")).toBeNull();
    act(() => window.history.pushState(null, "", "/about"));
    expect(button(host, "Install")).not.toBeNull();
    expect(prompt).not.toHaveBeenCalled();
    act(() => window.history.pushState(null, "", "/health/quick-order"));
    expect(button(host, "Install")).toBeNull();
    expect(prompt).not.toHaveBeenCalled();
    act(() => window.history.replaceState(null, "", "/product"));
    expect(button(host, "Install")).not.toBeNull();
    act(() => button(host, "Install")!.click());
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("reacts to push, replace, pop and recovery-hash navigation", async () => {
    const host = renderLifecycle("/about");
    dispatchInstall();
    expect(button(host, "Install")).not.toBeNull();
    act(() => window.history.pushState(null, "", "/security"));
    expect(button(host, "Install")).toBeNull();
    act(() => window.history.replaceState(null, "", "/product"));
    expect(button(host, "Install")).not.toBeNull();
    act(() => window.history.pushState(null, "", "/admin"));
    expect(button(host, "Install")).toBeNull();
    await act(async () => {
      await new Promise<void>((resolve, reject) => {
        const deadline = window.setTimeout(() => reject(new Error("popstate did not fire")), 500);
        window.addEventListener("popstate", () => { window.clearTimeout(deadline); resolve(); }, { once: true });
        window.history.back();
      });
    });
    expect(window.location.pathname).toBe("/product");
    expect(button(host, "Install")).not.toBeNull();
    act(() => { window.location.hash = "#type=recovery"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(button(host, "Install")).toBeNull();
    act(() => { window.location.hash = ""; window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(button(host, "Install")).not.toBeNull();
  });

  it.each(["/care", "/health/quick-order", "/HEALTH/%71uick-order/"])("rechecks live location on click to %s and preserves a prompt refused by the race guard", (path) => {
    const host = renderLifecycle("/about");
    const { prompt } = dispatchInstall();
    const install = button(host, "Install")!;
    install.addEventListener("click", () => window.history.pushState(null, "", path), { capture: true, once: true });
    act(() => install.click());
    expect(prompt).not.toHaveBeenCalled();
    expect(button(host, "Install")).toBeNull();
    act(() => window.history.pushState(null, "", "/product"));
    expect(button(host, "Install")).not.toBeNull();
    act(() => button(host, "Install")!.click());
    expect(prompt).toHaveBeenCalledOnce();
  });

  it.each([
    ["/health", "/care/eligibility"],
    ["/health/quick-order", "/HEALTH/%71uick-order/"],
  ])("keeps iOS eligibility while dynamically hiding it on %s and %s", (initialPath, nextPath) => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1");
    const host = renderLifecycle(initialPath);
    expect(host.textContent).not.toContain("Add to Home Screen");
    act(() => window.history.pushState(null, "", "/about"));
    expect(host.textContent).toContain("Add to Home Screen");
    act(() => window.history.replaceState(null, "", nextPath));
    expect(host.textContent).not.toContain("Add to Home Screen");
    act(() => window.history.pushState(null, "", "/product"));
    expect(host.textContent).toContain("Add to Home Screen");
  });

  it.each(["/research/member/catalog", "/health/quick-order"])("shows update notice independently on %s without auto-applying it", (path) => {
    const host = renderLifecycle(path);
    const registration = { waiting: { postMessage: vi.fn() } } as unknown as ServiceWorkerRegistration;
    act(() => window.dispatchEvent(new CustomEvent("xenios:pwa-update-available", { detail: { registration } })));
    expect(host.textContent).toContain("A new version of xenios is ready.");
    expect(applyPwaUpdate).not.toHaveBeenCalled();
    act(() => button(host, "Refresh")!.click());
    expect(applyPwaUpdate).toHaveBeenCalledWith(registration);
  });

  it("dismisses install education for the session while still preventing later native events", () => {
    const host = renderLifecycle("/about");
    const first = dispatchInstall();
    const dismiss = host.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')!;
    act(() => dismiss.click());
    expect(first.prompt).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("xenios-pwa-hint-dismissed")).toBe("1");
    const second = dispatchInstall();
    expect(second.event.defaultPrevented).toBe(true);
    expect(button(host, "Install")).toBeNull();
    expect(second.prompt).not.toHaveBeenCalled();
  });
});

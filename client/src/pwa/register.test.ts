// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPwaUpdate, registerXeniosPwa } from "./register";

type Controller = { scriptURL: string };
function platform(initialController: Controller | null = null, registrationFails = false) {
  const registration = Object.assign(new EventTarget(), {
    waiting: null as { postMessage: ReturnType<typeof vi.fn> } | null,
    installing: null,
  });
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: initialController,
    register: vi.fn(() => registrationFails ? Promise.reject(new Error("unavailable")) : Promise.resolve(registration)),
  });
  const reload = vi.fn();
  const browserWindow = Object.assign(new EventTarget(), { location: { reload } });
  vi.stubGlobal("window", browserWindow);
  vi.stubGlobal("navigator", { serviceWorker });
  vi.stubEnv("PROD", true);
  return { registration, serviceWorker, browserWindow, reload,
    claim(controller: Controller | null) {
      serviceWorker.controller = controller;
      serviceWorker.dispatchEvent(new Event("controllerchange"));
    },
    async load() {
      registerXeniosPwa();
      browserWindow.dispatchEvent(new Event("load"));
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("PWA controller lifecycle", () => {
  it("keeps a fresh page intact on the first claim and refreshes only for a later replacement", async () => {
    const p = platform(), first = { scriptURL: "/sw.js" }, replacement = { scriptURL: "/sw.js" };
    await p.load();
    expect(p.serviceWorker.register).toHaveBeenCalledExactlyOnceWith("/sw.js");
    p.claim(first); p.claim(first); p.claim(null); p.claim(first);
    expect(p.reload).not.toHaveBeenCalled();
    p.claim(replacement); p.claim(replacement); p.claim({ scriptURL: "/sw.js" });
    expect(p.reload).toHaveBeenCalledTimes(1);
  });
  it("preserves a single refresh for a genuinely changed pre-existing controller", async () => {
    const initial = { scriptURL: "/sw.js" }, p = platform(initial);
    await p.load(); p.claim(initial); p.claim(null);
    expect(p.reload).not.toHaveBeenCalled();
    p.claim({ scriptURL: "/sw.js" }); p.claim({ scriptURL: "/sw.js" });
    expect(p.reload).toHaveBeenCalledTimes(1);
  });
  it("keeps registration production-only", async () => {
    const p = platform(); vi.stubEnv("PROD", false);
    await p.load(); p.claim({ scriptURL: "/sw.js" });
    expect(p.serviceWorker.register).not.toHaveBeenCalled(); expect(p.reload).not.toHaveBeenCalled();
  });
  it("retains the update notification and explicit waiting-worker promotion", async () => {
    const p = platform({ scriptURL: "/sw.js" }), postMessage = vi.fn(), notices = vi.fn();
    p.registration.waiting = { postMessage };
    p.browserWindow.addEventListener("xenios:pwa-update-available", notices);
    await p.load(); expect(notices).toHaveBeenCalledTimes(1);
    expect((notices.mock.calls[0][0] as CustomEvent).detail.registration).toBe(p.registration);
    expect(postMessage).not.toHaveBeenCalled();
    applyPwaUpdate(p.registration as unknown as ServiceWorkerRegistration);
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: "SKIP_WAITING" });
  });
  it("keeps registration failure silent without forcing a refresh", async () => {
    const p = platform(null, true); await p.load();
    expect(p.serviceWorker.register).toHaveBeenCalledTimes(1); expect(p.reload).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import App from "../../App";
import AppErrorBoundary from "../../components/AppErrorBoundary";
import { getAttribution, initAttribution } from "../../lib/attribution";
import * as publicConfig from "../../lib/config";
import { queryClient } from "../../lib/queryClient";
import {
  initTracking,
  installResearchDocumentBoundary,
  trackPageView,
  trackingBlockedHere,
} from "../../lib/tracking";
import { PwaLifecycle } from "../../pwa/PwaLifecycle";
import { CARE_MANUAL_ACCESS_STATUS_PATH } from "@shared/care/manual-access";

// Composition evidence only: render the actual default App, its actual lazy
// QuickOrderPage/PublicShell, and the actual PwaLifecycle sibling used in main.tsx.
// No page, router, shell, auth provider, privacy predicate or PWA module is mocked.
// The browser starts without credentials. All fetches are synthetic; the only
// allowed replies are credential-free public config and a paused Care status.
// This does not qualify Auth, server persistence, service-worker registration,
// real install prompts, full-document loading, or a production build of main.tsx.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const INTAKE_PATH = "/health/quick-order";
const MARKER = "SYNTHETIC-QO-COMPOSITION";
const UNAVAILABLE = "Quick Order is not available for customer requests. No information is collected here.";
const ATTRIBUTION_KEYS = ["xen_landing_page", "xen_utm", "xen_referrer", "xen_attribution_schema"];
const initialHead = document.head.innerHTML;
const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, "userAgent");
const originalBeacon = Object.getOwnPropertyDescriptor(navigator, "sendBeacon");

let root: Root;
let host: HTMLDivElement;
let frames: Map<number, FrameRequestCallback>;
let fetcher: ReturnType<typeof vi.fn>;
let beacon: ReturnType<typeof vi.fn>;
let storageWrite: MockInstance<Storage["setItem"]>;
let configRead: MockInstance<typeof publicConfig.getConfig>;
let originalPush: History["pushState"];
let originalReplace: History["replaceState"];
let documentNavigation: { assign: ReturnType<typeof vi.fn>; replace: ReturnType<typeof vi.fn> };

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  queryClient.clear();
  delete window.fbq;
  delete window._fbq;
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36",
  });
  vi.stubGlobal("matchMedia", vi.fn((media: string) => ({
    matches: false, media, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
  frames = new Map();
  let nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
  vi.stubGlobal("scrollTo", vi.fn());
  beacon = vi.fn(() => false);
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });

  fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");
    if (url.origin !== window.location.origin || method !== "GET" || url.search || url.hash) {
      throw new Error("Unexpected network request in synthetic composition test");
    }
    if (url.pathname === "/api/config") {
      return new Response(JSON.stringify({
        metaPixelId: null, turnstileSiteKey: null, calendlyUrl: "",
        supabaseUrl: null, supabaseAnonKey: null,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname === CARE_MANUAL_ACCESS_STATUS_PATH) {
      return new Response(JSON.stringify({ ok: true, acceptingRequests: false }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    throw new Error("Unexpected endpoint in synthetic composition test");
  });
  vi.stubGlobal("fetch", fetcher);
  // Spies retain the actual implementations. Checking the config call itself
  // prevents its module cache from making a broken privacy guard look quiet.
  storageWrite = vi.spyOn(Storage.prototype, "setItem");
  configRead = vi.spyOn(publicConfig, "getConfig");
  originalPush = window.history.pushState;
  originalReplace = window.history.replaceState;
  documentNavigation = { assign: vi.fn(), replace: vi.fn() };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  frames.clear();
  queryClient.clear();
  window.history.pushState = originalPush;
  window.history.replaceState = originalReplace;
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalUserAgent) Object.defineProperty(navigator, "userAgent", originalUserAgent);
  else Reflect.deleteProperty(navigator, "userAgent");
  if (originalBeacon) Object.defineProperty(navigator, "sendBeacon", originalBeacon);
  else Reflect.deleteProperty(navigator, "sendBeacon");
  delete window.fbq;
  delete window._fbq;
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.head.innerHTML = initialHead;
});

async function mountAt(path: string) {
  window.history.replaceState(null, "", path);
  // Exercise the real boundary against the real mounted router's History API.
  // Only full-document navigation is substituted: jsdom cannot load a new page.
  // The facade gives each test its own installation marker without changing the
  // production helper's non-configurable marker on the global Window.
  installResearchDocumentBoundary({ location: window.location, history: window.history } as Window, documentNavigation);
  initAttribution();
  await initTracking();
  await act(async () => {
    root.render(<AppErrorBoundary><App /><PwaLifecycle /></AppErrorBoundary>);
  });
}

async function eventually(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {});
    assertion();
  }, { timeout: 3000, interval: 15 });
}

function assertOneShell() {
  expect(host.querySelector('[data-testid="app-error-boundary"]')).toBeNull();
  expect(host.querySelectorAll(".clarity-public-shell")).toHaveLength(1);
  expect(host.querySelectorAll("header")).toHaveLength(1);
  expect(host.querySelectorAll('header[data-testid="nav-main"]')).toHaveLength(1);
  expect(host.querySelectorAll("main")).toHaveLength(1);
  expect(host.querySelectorAll("main#site-main")).toHaveLength(1);
  expect(host.querySelectorAll("footer")).toHaveLength(1);
  expect(host.querySelectorAll('footer[data-testid="footer-main"]')).toHaveLength(1);
  expect(host.querySelector('a.skip-link[href="#site-main"]')).not.toBeNull();
}

function assertUnavailable() {
  expect(window.location.pathname).toBe(INTAKE_PATH);
  assertOneShell();
  expect(host.querySelectorAll("h1")).toHaveLength(1);
  expect(host.querySelector("h1")?.textContent).toBe("Quick Order");
  expect(host.querySelector("main .qo-root")?.textContent).toContain(UNAVAILABLE);
  expect(host.querySelectorAll("form, input, textarea, select, [contenteditable='true']")).toHaveLength(0);
  expect(host.textContent).not.toContain("Review my request");
  expect(host.textContent).not.toContain("Submit request for review");
  expect(host.textContent).not.toContain(MARKER);
  expect(fetcher).not.toHaveBeenCalled();
  expect(configRead).not.toHaveBeenCalled();
  expect(beacon).not.toHaveBeenCalled();
}

function installButton() {
  return [...host.querySelectorAll("button")].find((button) => button.textContent === "Install");
}

function dispatchInstall() {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn(async () => {});
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
  act(() => { window.dispatchEvent(event); });
  return { event, prompt };
}

describe("Quick Order through the actual App and PWA sibling", () => {
  it.each(["Chromium", "iOS Safari"])("keeps the %s intake unavailable without collection, transport or install promotion", async (browser) => {
    if (browser === "iOS Safari") Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1",
    });
    // A sensitive landing must also clear previously stored marketing facts.
    for (const key of ATTRIBUTION_KEYS) sessionStorage.setItem(key, MARKER);
    storageWrite.mockClear();
    await mountAt(`${INTAKE_PATH}?ref=${MARKER}&utm_campaign=${MARKER}#review`);
    await eventually(assertUnavailable);
    expect(host.textContent).not.toContain("Add to Home Screen");
    const { event, prompt } = dispatchInstall();
    expect(event.defaultPrevented).toBe(true);
    expect(installButton()).toBeUndefined();
    expect(prompt).not.toHaveBeenCalled();
    expect(trackingBlockedHere(window.location.pathname, window.location.hash)).toBe(true);
    expect(document.querySelector('script[src*="fbevents"]')).toBeNull();
    expect(window.fbq).toBeUndefined();
    const pixel = vi.fn();
    window.fbq = pixel;
    trackPageView();
    expect(pixel).not.toHaveBeenCalled();
    expect(getAttribution()).toEqual({
      source_page: "", landing_page: "", referrer_url: "", utm_source: null,
      utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null,
    });
    for (const key of ATTRIBUTION_KEYS) expect(sessionStorage.getItem(key)).toBeNull();
    expect(storageWrite).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    assertUnavailable();
  });

  it("keeps the actual update notice usable beside the unavailable intake without applying it automatically", async () => {
    await mountAt(INTAKE_PATH);
    await eventually(assertUnavailable);
    const postMessage = vi.fn();
    const registration = { waiting: { postMessage } } as unknown as ServiceWorkerRegistration;
    act(() => { window.dispatchEvent(new CustomEvent("xenios:pwa-update-available", { detail: { registration } })); });
    expect(host.textContent).toContain("A new version of xenios is ready.");
    expect(postMessage).not.toHaveBeenCalled();
    expect(installButton()).toBeUndefined();
    const refresh = [...host.querySelectorAll("button")].find((button) => button.textContent === "Refresh");
    expect(refresh).toBeDefined();
    act(() => { refresh!.click(); });
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    assertUnavailable();
  });

  it("preserves the real header's home action through the document privacy boundary", async () => {
    await mountAt(INTAKE_PATH);
    await eventually(assertUnavailable);
    const home = host.querySelector<HTMLAnchorElement>('header a[href="/"]');
    expect(home).not.toBeNull();
    await act(async () => { home!.click(); });
    expect(documentNavigation.assign).toHaveBeenCalledTimes(1);
    expect(documentNavigation.assign).toHaveBeenCalledWith(new URL("/", window.location.origin).href);
    expect(documentNavigation.replace).not.toHaveBeenCalled();
    // The synthetic navigator records the new-document request without turning
    // it into an SPA transition or asserting that a browser navigation completed.
    assertUnavailable();
  });

  it.each([
    { path: "/", heading: "Care and research products, clearly separated.", links: ["/care/schedule", "/products", "/sign-in"], installAllowed: true },
    { path: "/research", heading: "How research orders work", links: ["/products", "/status"], installAllowed: false },
    { path: "/care", heading: "Start Care with a short request.", links: ["/care/schedule", "/care/portal"], installAllowed: false },
  ])("preserves the actual $path control and its PWA/privacy policy", async ({ path, heading, links, installAllowed }) => {
    await mountAt(path);
    await eventually(() => {
      expect(host.querySelector("h1")?.textContent).toBe(heading);
      if (path === "/care") expect(host.textContent).toContain("Care requests are paused right now.");
    });
    expect(window.location.pathname).toBe(path);
    assertOneShell();
    expect(host.querySelector(".qo-root")).toBeNull();
    for (const href of links) expect(host.querySelector(`main a[href="${href}"]`), href).not.toBeNull();
    const { event, prompt } = dispatchInstall();
    expect(event.defaultPrevented).toBe(true);
    expect(Boolean(installButton())).toBe(installAllowed);
    expect(prompt).not.toHaveBeenCalled();
    if (installAllowed) {
      act(() => { installButton()!.click(); });
      expect(prompt).toHaveBeenCalledOnce();
    }
    expect(trackingBlockedHere(path, "")).toBe(!installAllowed);
    const pixel = vi.fn();
    window.fbq = pixel;
    trackPageView();
    expect(pixel).toHaveBeenCalledTimes(installAllowed ? 1 : 0);
    for (const [input, init] of fetcher.mock.calls) {
      expect(typeof input).toBe("string");
      expect(["/api/config", CARE_MANUAL_ACCESS_STATUS_PATH]).toContain(input);
      expect(init?.method ?? "GET").toBe("GET");
      expect(init?.body).toBeUndefined();
    }
    expect(beacon).not.toHaveBeenCalled();
  });
});

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
import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import * as browserAuth from "../../lib/supabaseBrowser";
import type { QuickOrderProps } from "./QuickOrderPage";
import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "@shared/research/assisted-order/form";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Request } from "express";
import { createAssistedOrderViewerResolvers, type AssistedOrderViewerWiring } from "../../../../server/research/assisted-order/express";
import { PRIVATE_ACCESS_SESSION_ACCESS_ROLE } from "../../../../server/research/early-access/private-access-session-repository";
import { buildDisabledQuickOrderProduction, type AssistedOrderProductionWiring } from "../../../../server/research/assisted-order/production-deps";
import { QUICK_ORDER_COMMIT_RPC, QUICK_ORDER_REPLAY_RPC } from "../../../../server/research/assisted-order/quick-order-repository";
import * as quickOrderRepository from "../../../../server/research/assisted-order/quick-order-repository";
import type { CommitArguments } from "../../../../server/research/health/quick-order/ports";
import { ESTIMATE_EXCLUSIONS } from "../../../../server/research/health/quick-order/core.mjs";

// AUTHORED_NOT_RUN: a test-only page-readiness override exercises the actual
// full App/session boundary and actual page with synthetic Auth/API responses.
// Every production App call must still pass intakeEnabled=false. This override
// is NOT an application enable flag, mounted HTTP proof or live Auth evidence.
const pageControl = vi.hoisted(() => ({
  enabled: null as boolean | null,
  calls: [] as QuickOrderProps[],
}));
vi.mock("./QuickOrderPage", async (original) => {
  const actual = await original<typeof import("./QuickOrderPage")>();
  return { ...actual, default: (props: QuickOrderProps) => {
    pageControl.calls.push(props);
    return <actual.default {...props} intakeEnabled={pageControl.enabled ?? props.intakeEnabled} />;
  } };
});

// Composition evidence only: render the actual default App, its actual lazy
// QuickOrderPage/PublicShell, and the actual PwaLifecycle sibling used in main.tsx.
// Router, shell, privacy predicates and PWA remain real. The canonical browser
// Auth client is synthetic, null by default; later controls supply fake sessions.
// The default page override is absent. All fetches are synthetic. Auth's own
// config/session persistence is NOT qualified by these browser controls.
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
let browserClient: MockInstance<typeof browserAuth.getSupabaseBrowser>;

beforeEach(() => {
  pageControl.enabled = null;
  pageControl.calls = [];
  browserClient = vi.spyOn(browserAuth, "getSupabaseBrowser").mockResolvedValue(null);
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

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
function authSession(userId = ACCOUNT_A, suffix = "one", expiresAt = Math.floor(Date.now() / 1000) + 3600): Session {
  const payload = btoa(JSON.stringify({ amr: [{ method: "password" }] }));
  return { user: { id: userId }, access_token: `synthetic.${payload}.${suffix}`, expires_at: expiresAt } as Session;
}
function installAuth(initial: Session | null = authSession()) {
  let listener: (event: AuthChangeEvent, session: Session | null) => void = () => {};
  const unsubscribe = vi.fn();
  const getSession = vi.fn(async () => ({ data: { session: initial }, error: null }));
  const onAuthStateChange = vi.fn((callback: typeof listener) => {
    listener = callback;
    return { data: { subscription: { unsubscribe } } };
  });
  browserClient.mockResolvedValue({ auth: { getSession, onAuthStateChange } } as unknown as SupabaseClient);
  return { getSession, onAuthStateChange, unsubscribe,
    async emit(event: AuthChangeEvent, session: Session | null) { await act(async () => { listener(event, session); }); },
  };
}
const syntheticConfig = { enabled: true, csrfToken: "synthetic-csrf-one", agreements: [
  { kind: "terms", version: "synthetic-v1", label: "Synthetic terms", url: "/legal/synthetic-terms" },
  ...requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: false }).map(ack => ({ ...assistedOrderFormPair(ack), label: ack.copy, type: "form_acknowledgment", url: null })),
] };
const syntheticItem = { productId: "synthetic-product", variantId: "synthetic-variant", productName: "Synthetic item", specification: "Exact test variant", family: "Synthetic",
  workflowMode: "direct_order_request", unitPriceCents: 2500, currency: "USD", catalogVersion: "synthetic-catalog-v1", priceVersion: "synthetic-price-v1",
  minimumQuantity: 1, maximumQuantity: 50, quantityIncrement: 1, researchUseOnly: false, requestable: true, accessNotice: null };
const syntheticReceipt = { requestId: "454b01cd-4ce9-4a45-a5a3-454cef294c48", publicReference: "XRR-20261005-ABCDEF1234", status: "submitted", paymentStatus: "not_collected",
  commissionState: "not_authorized", attributionState: "direct_no_referrer", replayed: true,
  estimate: { knownSubtotalCents: 2500, estimateComplete: true, currency: "USD", excludes: "Synthetic estimate, not a payment quote." } };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function installIntakeReplies() {
  const posts: RequestInit[] = [];
  const api = {
    config: syntheticConfig as { enabled: boolean; csrfToken: string; agreements: unknown[] },
    post: async (): Promise<Response> => reply(syntheticReceipt),
    posts,
  };
  fetcher.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = new URL(String(input), window.location.origin);
    expect(target.origin).toBe(window.location.origin);
    expect(init?.credentials).toBe("same-origin");
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("Authorization")).toMatch(/^Bearer synthetic\./);
    if (target.pathname === "/api/health/quick-order/config") return reply(api.config);
    if (target.pathname === "/api/health/quick-order/catalog") return reply({ items: [syntheticItem], total: 1, page: 1, pageSize: 24 });
    if (target.pathname === "/api/health/quick-order/requests" && init?.method === "POST") { posts.push(init); return api.post(); }
    throw new Error("Unexpected synthetic endpoint");
  });
  return api;
}
function formInput(name: string) {
  const node = host.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  if (!node) throw new Error(`Missing synthetic field ${name}`);
  return node;
}
async function clickButton(label: string) {
  const button = [...host.querySelectorAll("button")].find(node => node.textContent === label);
  expect(button, label).toBeDefined();
  await act(async () => { button!.click(); });
}
function changeField(name: string, value: string) {
  const node = formInput(name);
  act(() => {
    const prototype = node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function prepareSyntheticRequest() {
  await eventually(() => { expect(host.textContent).toContain("Synthetic item"); });
  await clickButton("Add to request");
  for (const [name, value] of Object.entries({ fullLegalName: "Synthetic Customer", email: "synthetic@example.test", mobilePhone: "2025550123",
    "shipping.line1": "123 Example Street", "shipping.city": "Austin", "shipping.region": "TX", "shipping.postalCode": "78701",
    billingChoice: "same", sourceKind: "direct", affiliationKind: "none" })) changeField(name, value);
  for (const name of ["ageConfirmed", "referralConfirmed", "agreement-0", "agreement-1", "agreement-2", "agreement-3", "requestAcknowledged"]) {
    act(() => { formInput(name).click(); });
  }
  await clickButton("Review my request");
  expect(host.textContent).toContain("Confirm your request");
}
function assertActualAppIsDisabled() {
  expect(pageControl.calls.length).toBeGreaterThan(0);
  for (const props of pageControl.calls) expect(props.intakeEnabled).toBe(false);
}

// Synthetic clock/callback control, not elapsed wall time or a browser run.
// Capture the actual App expiry callback while leaving UI wait timers real.
function observeAuthExpiry() {
  const initialNow = 1_800_000_000_000;
  let now = initialNow;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const scheduled = vi.spyOn(globalThis, "setTimeout");
  return {
    expiresAt: (initialNow + 60_000) / 1000,
    elapse() { now = initialNow + 60_001; },
    callback() {
      const calls = scheduled.mock.calls.filter(([, delay]) => delay === 60_000);
      expect(calls).toHaveLength(1);
      const callback = calls[0][0];
      expect(callback).toBeTypeOf("function");
      return async () => { await act(async () => { (callback as () => void)(); }); };
    },
  };
}

describe("AUTHORED_NOT_RUN full-App canonical session boundary", () => {
  it("binds a canonical browser account without enabling intake or collecting fields", async () => {
    const auth = installAuth();
    await mountAt(INTAKE_PATH);
    await eventually(() => { expect(pageControl.calls.at(-1)?.sessionKey).toContain(ACCOUNT_A); });
    assertUnavailable(); assertActualAppIsDisabled();
    expect(auth.onAuthStateChange).toHaveBeenCalledOnce();
    const serialized = JSON.stringify(pageControl.calls);
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain(authSession().access_token);
    for (const field of ["rawStoredSessionHash", "configuredOwnerId", "actorScope", "requiredRole", "enteredAtMonotonicMs"]) expect(serialized).not.toContain(field);
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it.each([null, authSession(ACCOUNT_A, "expired", 1), { ...authSession(), user: { id: "synthetic@example.test" } } as Session])(
    "refuses absent, expired and email-as-identity sessions without intake transport", async (session) => {
      installAuth(session);
      await mountAt(INTAKE_PATH);
      await eventually(assertUnavailable);
      expect(pageControl.calls.at(-1)?.sessionKey).toBeNull();
      assertActualAppIsDisabled();
    },
  );

  it("does not let a stale initial session read resurrect an account after sign-out", async () => {
    const auth = installAuth();
    let resolve!: (value: Awaited<ReturnType<typeof auth.getSession>>) => void;
    auth.getSession.mockImplementation(() => new Promise(done => { resolve = done; }));
    await mountAt(INTAKE_PATH);
    await eventually(() => { expect(auth.getSession).toHaveBeenCalledOnce(); });
    await auth.emit("SIGNED_OUT", null);
    await act(async () => { resolve({ data: { session: authSession() }, error: null }); });
    assertUnavailable();
    expect(pageControl.calls.at(-1)?.sessionKey).toBeNull();
  });

  it("keeps an unknown request byte-identical across bearer refresh and disable using current CSRF", async () => {
    const auth = installAuth();
    const api = installIntakeReplies();
    pageControl.enabled = true; // TEST ONLY; actual App still passes false.
    api.post = async () => { throw new Error("synthetic lost acknowledgment"); };
    await mountAt(INTAKE_PATH);
    await prepareSyntheticRequest();
    await clickButton("Submit request for review");
    expect(host.textContent).toContain("Confirmation is unresolved");
    const key = pageControl.calls.at(-1)!.sessionKey;
    const heldBytes = api.posts[0].body;
    pageControl.enabled = false;
    api.config = { enabled: false, csrfToken: "synthetic-csrf-refreshed", agreements: [] };
    const refreshed = authSession(ACCOUNT_A, "refreshed");
    await auth.emit("TOKEN_REFRESHED", refreshed);
    await act(async () => { root.render(<AppErrorBoundary><App /><PwaLifecycle /></AppErrorBoundary>); });
    expect(pageControl.calls.at(-1)!.sessionKey).toBe(key);
    expect(host.textContent).toContain("Confirmation is unresolved");
    api.post = async () => reply(syntheticReceipt);
    await clickButton("Retry confirmation");
    expect(api.posts).toHaveLength(2);
    expect(api.posts[1].body).toBe(heldBytes);
    expect(new Headers(api.posts[1].headers).get("Authorization")).toBe(`Bearer ${refreshed.access_token}`);
    expect(new Headers(api.posts[1].headers).get("X-CSRF-Token")).toBe("synthetic-csrf-refreshed");
    expect(host.textContent).toContain(syntheticReceipt.publicReference);
    expect(host.textContent).toContain("No payment was collected");
    assertOneShell(); assertActualAppIsDisabled();
    expect(storageWrite).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  it.each(["scheduled callback", "expired same-account observation", "missing session observation"])(
    "preserves an unknown same-key attempt through %s and refresh, while unavailable transport refuses", async expiryKind => {
      const clock = observeAuthExpiry();
      const initial = authSession(ACCOUNT_A, "before-expiry", clock.expiresAt);
      const auth = installAuth(initial), api = installIntakeReplies();
      pageControl.enabled = true;
      api.post = async () => { throw new Error("synthetic lost acknowledgment"); };
      await mountAt(INTAKE_PATH); await prepareSyntheticRequest(); await clickButton("Submit request for review");
      expect(api.posts).toHaveLength(1);
      expect(host.textContent).toContain("Confirmation is unresolved");
      const before = pageControl.calls.at(-1)!;
      const heldBytes = api.posts[0].body;
      const fireExpiry = clock.callback();
      // A missing-session observation must revoke even an unexpired bearer;
      // otherwise a time check alone would make that negative vacuous.
      if (expiryKind !== "missing session observation") clock.elapse();
      if (expiryKind === "scheduled callback") await fireExpiry();
      else await auth.emit("TOKEN_REFRESHED", expiryKind === "missing session observation" ? null : initial);
      expect(pageControl.calls.at(-1)!.sessionKey).toBe(before.sessionKey);
      expect(pageControl.calls.at(-1)!.transport).toBe(before.transport);
      expect(host.textContent).toContain("Confirmation is unresolved");
      expect(formInput("fullLegalName").closest("fieldset")?.disabled).toBe(true);
      const requestsBeforeRetry = fetcher.mock.calls.length;
      await clickButton("Retry confirmation");
      expect(fetcher).toHaveBeenCalledTimes(requestsBeforeRetry);
      expect(api.posts).toHaveLength(1);
      expect(host.textContent).toContain("Confirmation is unresolved");
      const refreshed = authSession(ACCOUNT_A, "after-expiry");
      api.config = { ...syntheticConfig, csrfToken: "synthetic-csrf-after-expiry" };
      api.post = async () => reply(syntheticReceipt);
      await auth.emit("TOKEN_REFRESHED", refreshed);
      expect(pageControl.calls.at(-1)!.sessionKey).toBe(before.sessionKey);
      expect(pageControl.calls.at(-1)!.transport).toBe(before.transport);
      await clickButton("Retry confirmation");
      expect(api.posts).toHaveLength(2);
      expect(api.posts[1].body).toBe(heldBytes);
      expect(JSON.parse(String(api.posts[1].body)).idempotencyKey).toBe(JSON.parse(String(heldBytes)).idempotencyKey);
      expect(new Headers(api.posts[1].headers).get("Authorization")).toBe(`Bearer ${refreshed.access_token}`);
      expect(new Headers(api.posts[1].headers).get("X-CSRF-Token")).toBe("synthetic-csrf-after-expiry");
      expect(host.textContent).toContain(syntheticReceipt.publicReference);
      expect(storageWrite).not.toHaveBeenCalled(); expect(beacon).not.toHaveBeenCalled();
      assertActualAppIsDisabled();
    },
  );

  it("aborts an in-flight POST at expiry, ignores its late receipt after refresh, and recovers identical bytes", async () => {
    const clock = observeAuthExpiry();
    const auth = installAuth(authSession(ACCOUNT_A, "in-flight-expiry", clock.expiresAt));
    const api = installIntakeReplies();
    let resolve!: (response: Response) => void;
    api.post = () => new Promise(done => { resolve = done; });
    pageControl.enabled = true;
    await mountAt(INTAKE_PATH); await prepareSyntheticRequest(); await clickButton("Submit request for review");
    await eventually(() => { expect(api.posts).toHaveLength(1); });
    const before = pageControl.calls.at(-1)!;
    const heldBytes = api.posts[0].body;
    const fireExpiry = clock.callback();
    clock.elapse(); await fireExpiry();
    expect(api.posts[0].signal?.aborted).toBe(true);
    expect(pageControl.calls.at(-1)!.sessionKey).toBe(before.sessionKey);
    const refreshed = authSession(ACCOUNT_A, "after-in-flight-expiry");
    await auth.emit("TOKEN_REFRESHED", refreshed);
    await act(async () => { resolve(reply(syntheticReceipt)); });
    expect(host.textContent).not.toContain(syntheticReceipt.publicReference);
    expect(host.textContent).toContain("Confirmation is unresolved");
    expect(formInput("fullLegalName").closest("fieldset")?.disabled).toBe(true);
    api.config = { ...syntheticConfig, csrfToken: "synthetic-csrf-after-abort" };
    api.post = async () => reply(syntheticReceipt);
    await clickButton("Retry confirmation");
    expect(api.posts).toHaveLength(2);
    expect(api.posts[1].body).toBe(heldBytes);
    expect(new Headers(api.posts[1].headers).get("Authorization")).toBe(`Bearer ${refreshed.access_token}`);
    expect(new Headers(api.posts[1].headers).get("X-CSRF-Token")).toBe("synthetic-csrf-after-abort");
    expect(host.textContent).toContain(syntheticReceipt.publicReference);
    expect(pageControl.calls.at(-1)!.sessionKey).toBe(before.sessionKey);
    expect(pageControl.calls.at(-1)!.transport).toBe(before.transport);
    expect(storageWrite).not.toHaveBeenCalled(); expect(beacon).not.toHaveBeenCalled();
    assertActualAppIsDisabled();
  });

  it("does not let an obsolete queued expiry callback revoke a newer same-account credential", async () => {
    const clock = observeAuthExpiry();
    const auth = installAuth(authSession(ACCOUNT_A, "old-timer", clock.expiresAt));
    installIntakeReplies();
    await mountAt(INTAKE_PATH);
    await eventually(() => { expect(pageControl.calls.at(-1)?.transport).toBeTypeOf("function"); });
    const before = pageControl.calls.at(-1)!;
    const fireOldExpiry = clock.callback();
    const refreshed = authSession(ACCOUNT_A, "new-timer", clock.expiresAt + 3600);
    await auth.emit("TOKEN_REFRESHED", refreshed);
    clock.elapse(); await fireOldExpiry();
    const response = await before.transport!("/api/health/quick-order/config", {});
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(new Headers(fetcher.mock.calls[0][1].headers).get("Authorization")).toBe(`Bearer ${refreshed.access_token}`);
    expect(pageControl.calls.at(-1)!.sessionKey).toBe(before.sessionKey);
    expect(storageWrite).not.toHaveBeenCalled(); expect(beacon).not.toHaveBeenCalled();
    assertActualAppIsDisabled();
  });

  it.each(["SIGNED_OUT", "PASSWORD_RECOVERY", "account switch", "expired other account"])(
    "still discards an expired held request on %s and gives account A a new boundary", async event => {
      const clock = observeAuthExpiry();
      const auth = installAuth(authSession(ACCOUNT_A, "held-terminal", clock.expiresAt));
      const api = installIntakeReplies();
      pageControl.enabled = true;
      api.post = async () => { throw new Error("synthetic lost acknowledgment"); };
      await mountAt(INTAKE_PATH); await prepareSyntheticRequest(); await clickButton("Submit request for review");
      const before = pageControl.calls.at(-1)!;
      const fireExpiry = clock.callback();
      clock.elapse(); await fireExpiry();
      expect(host.textContent).toContain("Confirmation is unresolved");
      const otherAccount = event === "account switch" || event === "expired other account";
      await auth.emit(otherAccount ? "SIGNED_IN" : event as AuthChangeEvent,
        otherAccount ? authSession(ACCOUNT_B, "other", event === "expired other account" ? 1 : undefined) : null);
      expect(pageControl.calls.at(-1)!.sessionKey).not.toBe(before.sessionKey);
      expect(host.textContent).not.toContain("Confirmation is unresolved");
      expect(host.querySelector<HTMLInputElement>('[name="fullLegalName"]')?.value ?? "").toBe("");
      const callsBeforeOldTransport = fetcher.mock.calls.length;
      await expect(before.transport!("/api/health/quick-order/config", {})).rejects.toThrow("Request access unavailable");
      expect(fetcher).toHaveBeenCalledTimes(callsBeforeOldTransport);
      await auth.emit("SIGNED_IN", authSession(ACCOUNT_A, "returned"));
      expect(pageControl.calls.at(-1)!.sessionKey).toContain(ACCOUNT_A);
      expect(pageControl.calls.at(-1)!.sessionKey).not.toBe(before.sessionKey);
      expect(host.textContent).not.toContain("Confirmation is unresolved");
      expect(api.posts).toHaveLength(1);
      expect(storageWrite).not.toHaveBeenCalled(); expect(beacon).not.toHaveBeenCalled();
      assertActualAppIsDisabled();
    },
  );

  it.each(["SIGNED_OUT", "PASSWORD_RECOVERY", "account switch"])("aborts and discards an in-flight request on %s", async event => {
    const auth = installAuth();
    const api = installIntakeReplies();
    let resolve!: (response: Response) => void;
    api.post = () => new Promise(done => { resolve = done; });
    pageControl.enabled = true;
    await mountAt(INTAKE_PATH);
    await prepareSyntheticRequest();
    await clickButton("Submit request for review");
    await eventually(() => { expect(api.posts).toHaveLength(1); });
    const oldKey = pageControl.calls.at(-1)!.sessionKey;
    await auth.emit(event === "account switch" ? "SIGNED_IN" : event as AuthChangeEvent, event === "account switch" ? authSession(ACCOUNT_B) : null);
    expect(api.posts[0].signal?.aborted).toBe(true);
    await act(async () => { resolve(reply(syntheticReceipt)); });
    expect(host.textContent).not.toContain(syntheticReceipt.publicReference);
    expect(pageControl.calls.at(-1)!.sessionKey).not.toBe(oldKey);
    expect(host.textContent).not.toContain("Confirmation is unresolved");
    expect(host.querySelector<HTMLInputElement>('[name="fullLegalName"]')?.value ?? "").toBe("");
    expect(storageWrite).not.toHaveBeenCalled();
    assertActualAppIsDisabled();
  });

  it.each([401, 403, 503])("keeps held recovery locked on %i without falsely claiming a saved request", async status => {
    installAuth(); const api = installIntakeReplies(); pageControl.enabled = true;
    api.post = async () => reply({ code: "unavailable", rawStoredSessionHash: "private-sentinel" }, status);
    await mountAt(INTAKE_PATH); await prepareSyntheticRequest(); await clickButton("Submit request for review");
    expect(host.textContent).toContain("Confirmation is unresolved");
    expect(host.textContent).not.toContain("private-sentinel");
    expect(host.textContent).not.toContain("Request received");
    expect(formInput("fullLegalName").closest("fieldset")?.disabled).toBe(true);
    assertActualAppIsDisabled();
  });

  it("refuses non-intake and cross-origin transport targets without attaching credentials", async () => {
    installAuth(); await mountAt(INTAKE_PATH);
    await eventually(() => { expect(pageControl.calls.at(-1)?.transport).toBeTypeOf("function"); });
    const transport = pageControl.calls.at(-1)!.transport!;
    await expect(transport("https://example.invalid/api/health/quick-order/config", {})).rejects.toThrow("Request access unavailable");
    await expect(transport("/api/admin/research/assisted-orders", {})).rejects.toThrow("Request access unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("AUTHORED_NOT_RUN canonical server private context and source composition", () => {
  const storedHash = "a".repeat(64);
  const customerRef = `eac_${"b".repeat(32)}`;
  function resolverFixture(overrides: Partial<AssistedOrderViewerWiring> = {}) {
    const resolveSession = vi.fn(async (_cookie: unknown) => ({ authenticated: true }));
    const readSessionId = vi.fn((_cookie: unknown) => storedHash);
    const identity = { resolve: vi.fn(async (_input: unknown) => ({ customerRef })) };
    const wiring: AssistedOrderViewerWiring = {
      resolveMember: async () => ({ id: "canonical-member", authUserId: ACCOUNT_A, email: "synthetic@example.test" }),
      earlyAccess: () => ({ identity, resolveSession, readSessionId }),
      earlyAccessBindings: () => ({ forCustomer: async () => ({ ok: true, binding: { memberId: "canonical-member" } }) }),
      adminEmail: () => "synthetic-admin@example.test",
      privateSessionAuthority: () => ({ configuredOwnerId: ACCOUNT_B, requiredRole: PRIVATE_ACCESS_SESSION_ACCESS_ROLE }),
      ...overrides,
    };
    return { resolvers: createAssistedOrderViewerResolvers(wiring), resolveSession, readSessionId, identity };
  }
  it("captures the same cookie before member auth and binds only the exact verified viewer", async () => {
    const req = { headers: { cookie: "synthetic-original-cookie" } } as Request;
    const fixture = resolverFixture({ resolveMember: async () => {
      req.headers.cookie = "synthetic-replaced-cookie";
      return { id: "canonical-member", authUserId: ACCOUNT_A, email: "synthetic@example.test" };
    } });
    const viewer = await fixture.resolvers.customer(req);
    expect(fixture.resolveSession).toHaveBeenCalledWith("synthetic-original-cookie");
    expect(fixture.readSessionId).toHaveBeenCalledWith("synthetic-original-cookie");
    expect(fixture.identity.resolve).toHaveBeenCalledWith({ cookieHeader: "synthetic-original-cookie" });
    expect(viewer.earlyAccessSessionHash).toBe(createHash("sha256").update(storedHash).digest("hex"));
    expect(fixture.resolvers.privateContextFor(viewer)).toEqual({ rawStoredSessionHash: storedHash, configuredOwnerId: ACCOUNT_B,
      actorScope: `member:${ACCOUNT_A}`, requiredRole: PRIVATE_ACCESS_SESSION_ACCESS_ROLE });
    expect(Object.keys(fixture.resolvers.privateContextFor(viewer)!)).toHaveLength(4);
    expect(fixture.resolvers.privateContextFor({ ...viewer })).toBeNull();
    expect(JSON.stringify(viewer)).not.toContain(storedHash);
    expect(JSON.stringify(viewer)).not.toContain("configuredOwnerId");
  });
  it.each([
    { privateSessionAuthority: () => null },
    { privateSessionAuthority: () => ({ configuredOwnerId: "not-an-owner", requiredRole: PRIVATE_ACCESS_SESSION_ACCESS_ROLE }) },
    { privateSessionAuthority: () => ({ configuredOwnerId: ACCOUNT_B, requiredRole: "wrong-role" }) },
    { earlyAccessBindings: () => ({ forCustomer: async () => ({ ok: true as const, binding: { memberId: "another-member" } }) }) },
    { earlyAccessBindings: () => null },
  ])("refuses missing/invalid authority and wrong-owner bindings without email fallback", async overrides => {
    const { resolvers } = resolverFixture(overrides);
    expect(resolvers.privateContextFor(await resolvers.customer({ headers: { cookie: "synthetic-cookie" } } as Request))).toBeNull();
  });
  it("refuses a failed canonical session before reading its stored identity", async () => {
    const fixture = resolverFixture();
    fixture.resolveSession.mockResolvedValue({ authenticated: false });
    const viewer = await fixture.resolvers.customer({ headers: { cookie: "synthetic-cookie" } } as Request);
    expect(fixture.readSessionId).not.toHaveBeenCalled();
    expect(fixture.identity.resolve).not.toHaveBeenCalled();
    expect(fixture.resolvers.privateContextFor(viewer)).toBeNull();
  });
  it("binds an Early Access actor only to its canonical opaque customer, never an admin", async () => {
    const { resolvers } = resolverFixture({ resolveMember: async () => null });
    const req = { headers: { cookie: "synthetic-cookie" }, adminAuthUserId: ACCOUNT_A } as unknown as Request;
    const viewer = await resolvers.customer(req);
    expect(resolvers.privateContextFor(viewer)?.actorScope).toBe(`early_access:${customerRef}`);
    expect(resolvers.privateContextFor(await resolvers.admin(req))).toBeNull();
  });
  it("composes public session/replay only while every actual new-write gate is unavailable", async () => {
    const { resolvers } = resolverFixture();
    // The canonical resolver object is frozen. Observe it through a mutable
    // test wrapper while retaining the actual private-context implementation.
    const privateContextFor = vi.fn(resolvers.privateContextFor);
    const observedResolvers = { ...resolvers, privateContextFor };
    const createExtension = vi.spyOn(quickOrderRepository, "createQuickOrderTransactionExtension"); // Calls the real factory.
    const enteredAtMonotonicMsFor = vi.fn(() => 75), monotonicNow = vi.fn(() => 100);
    const rpc = vi.fn(async (_name: string, _args?: Readonly<Record<string, unknown>>) => ({ data: null as unknown, error: null }));
    const wiring: AssistedOrderProductionWiring = {
      env: {}, requiredAgreements: [], agreementGate: null,
      masterOfferingServiceFor: () => null, bindingFor: () => null, offeringVariantFor: () => null,
      catalogVersion: "synthetic-version", supabaseRpc: { rpc }, supabaseStorage: null, log: vi.fn(),
    };
    // Narrow service fixture; this control cannot qualify the real service/DB.
    const service = { config: async () => ({ enabled: false, requiredAgreements: [] }) } as unknown as NonNullable<Parameters<typeof buildDisabledQuickOrderProduction>[1]["service"]>;
    const ports = buildDisabledQuickOrderProduction(wiring, {
      service, viewers: observedResolvers, enteredAtMonotonicMsFor,
      monotonicNow, csrfSecret: "synthetic-csrf-secret-at-least-thirty-two-bytes",
    })!;
    expect(createExtension).toHaveBeenCalledOnce();
    const extension = createExtension.mock.results[0].value as ReturnType<typeof quickOrderRepository.createQuickOrderTransactionExtension>;
    const beginAttempt = vi.spyOn(extension, "beginAttempt"); // Pass-through, not a stub candidate.
    const dependencies = createExtension.mock.calls[0][0];
    expect(dependencies.expectedConfigurationDigest).toBeNull();
    expect(dependencies.approvedLimitsJson).toBeNull();
    expect(dependencies.notificationRecipient).toBeNull();
    expect(dependencies.runtime?.maximumDelayMs).toBe(0);
    // Explicit refusal-only callback inspection, not qualification of a working
    // scheduler. Null limits refuse earlier during the actual admission below.
    expect(() => dependencies.runtime!.schedule(1, () => {})).toThrow("Quick Order cleanup authority is not qualified");
    expect(rpc).not.toHaveBeenCalled(); // Constructing is not a readiness probe.
    expect(ports.productionReady).toBe(false);
    const session = (await ports.session({ headers: { cookie: "synthetic-cookie", authorization: "Bearer synthetic-authorized-member" } } as Request))!;
    expect(Object.keys(session).sort()).toEqual(["actorId", "csrfToken"]);
    expect(session.actorId).toBe(`member:${ACCOUNT_A}`);
    expect(JSON.stringify(session)).not.toContain(storedHash);
    expect((await ports.config(session)).enabled).toBe(false);
    const key = "synthetic-idempotency-key-123", payloadHash = "c".repeat(64);
    const clockReads = monotonicNow.mock.calls.length;
    expect(await ports.getExisting(session, key, payloadHash)).toBeNull();
    expect(enteredAtMonotonicMsFor).toHaveBeenCalledOnce();
    expect(monotonicNow).toHaveBeenCalledTimes(clockReads + 1);
    expect(beginAttempt).toHaveBeenCalledOnce();
    expect(beginAttempt).toHaveBeenCalledWith(expect.any(Object), `member:${ACCOUNT_A}`, 75);
    expect(beginAttempt.mock.results[0].value).toBeNull(); // No armed attempt, not a missing-stamp shortcut.
    expect(privateContextFor).not.toHaveBeenCalled();
    await expect(ports.commit(session, { input: { idempotencyKey: key }, payloadHash } as CommitArguments))
      .rejects.toThrow("Quick Order canonical transaction is not qualified");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe(QUICK_ORDER_REPLAY_RPC);
    rpc.mockResolvedValue({ data: {
      payloadHash,
      publicReceipt: { requestId: syntheticReceipt.requestId, publicReference: syntheticReceipt.publicReference,
        attributionState: "direct_no_referrer", estimate: { ...syntheticReceipt.estimate, excludes: ESTIMATE_EXCLUSIONS } },
    }, error: null });
    // Recovery does not require a new-attempt clock/profile or private context.
    expect((await ports.getExisting(session, key))?.publicReceipt.publicReference).toBe(syntheticReceipt.publicReference);
    await expect(ports.getExisting({ ...session }, key)).rejects.toThrow();
    // Undefined cannot be relabeled a strict-null recovery miss.
    rpc.mockResolvedValueOnce({ data: undefined, error: null });
    await expect(ports.getExisting(session, key)).rejects.toThrow();
    expect(rpc.mock.calls.every(call => call[0] === QUICK_ORDER_REPLAY_RPC)).toBe(true);
    expect(rpc.mock.calls.filter(call => call[0] === QUICK_ORDER_COMMIT_RPC)).toHaveLength(0);
    expect(beginAttempt).toHaveBeenCalledOnce();
    expect(privateContextFor).not.toHaveBeenCalled();
    expect(buildDisabledQuickOrderProduction(wiring, { service: null, viewers: resolvers,
      enteredAtMonotonicMsFor: () => null, monotonicNow: () => 100, csrfSecret: null })).toBeNull();
  });
  it("records source ordering only: one root WeakMap stamp before Express, containment before parsers", () => {
    const rootSource = readFileSync(new URL("../../../../server/index.ts", import.meta.url), "utf8");
    const entry = rootSource.slice(rootSource.indexOf("const httpServer = createServer((req, res) => {"), rootSource.indexOf("// Serve the Kairos MVP"));
    expect(entry).toContain("if (!quickOrderEntryTimes.has(req)) quickOrderEntryTimes.set(req, quickOrderMonotonicNow());");
    expect(entry.indexOf("quickOrderEntryTimes.set")).toBeLessThan(entry.indexOf("app(req, res)"));
    expect(entry.match(/quickOrderMonotonicNow\(\)/g)).toHaveLength(1);
    expect(rootSource).toContain("monotonicNow: quickOrderMonotonicNow");
    expect(rootSource).toContain("quickOrderEntryTimes.get(req) ?? null");
    expect(rootSource.indexOf("app.use(createQuickOrderContainment())")).toBeLessThan(rootSource.indexOf("express.json("));
    // Source-text contracts, not an AST analysis or mounted HTTP proof.
    expect(rootSource.match(/\bdisabledQuickOrderPorts\b/g)).toHaveLength(2);
    expect(rootSource).toMatch(/const\s+disabledQuickOrderPorts\s*=\s*buildDisabledQuickOrderProduction\(/);
    expect(rootSource).toMatch(/void\s+disabledQuickOrderPorts\s*;/);
    // Reject a handler module specifier regardless of named/default/namespace,
    // side-effect import, dynamic import or require syntax.
    expect(rootSource).not.toMatch(/["'`][^"'`\r\n]*quick-order\/handler(?:\.[cm]?[jt]s)?["'`]/);
    expect(rootSource).not.toMatch(/import\s*\{[^}]*createQuickOrderHandler/);
    expect(rootSource).not.toMatch(/\bcreateQuickOrderHandler\s*\(/);
    const deps = readFileSync(new URL("../../../../server/research/assisted-order/production-deps.ts", import.meta.url), "utf8");
    expect(deps).toContain("name !== QUICK_ORDER_REPLAY_RPC");
    expect(deps).toContain("return { data: result.data, error: result.error }");
    for (const field of ["expectedConfigurationDigest", "approvedLimitsJson", "notificationRecipient"]) expect(deps).toContain(`${field}: null`);
    expect(deps).toContain("approvedHealthAgreementPairs: []");
    expect(deps).not.toContain('transactionOutcome: "committed"');
    expect(deps).not.toContain('transactionOutcome: "aborted"');
  });
  it("records the replacement route contract: one literal-disabled route before the preserved Health redirect", () => {
    const appSource = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
    const route = '<Route path="/health/quick-order" component={QuickOrderRoutes} />';
    const redirect = '<Route path="/health"><Redirect to="/" /></Route>';
    expect(appSource.match(/<Route\b[^>]*\bpath=["']\/health\/quick-order["']/g)).toHaveLength(1);
    expect(appSource).toContain(route);
    expect(appSource).toContain(redirect);
    expect(appSource.indexOf(route)).toBeLessThan(appSource.indexOf(redirect));
    const mounts = appSource.match(/<QuickOrderPage\b[^>]*\/>/g);
    expect(mounts).toEqual(['<QuickOrderPage sessionKey={boundary?.key ?? null} transport={boundary?.transport} intakeEnabled={false} />']);
    // The old null-session expectation is superseded, not restored. The bytes
    // of App.routes.test.ts stay untouched; this binds the real-session mount.
  });
  it.each([
    ["products-diagnostics/MemberCatalogExperience.tsx", "c54db8933eb9654f55b98f163c68e5ae1d51cc3a"],
    ["products-diagnostics/MemberCatalogExperience.test.tsx", "5a9e65bed522d2687b28b5c624ea01379d1048f9"],
    ["products-diagnostics/MemberProductDetailExperience.tsx", "f1db3fa817be2e89a9bb9273301204333f274fae"],
    ["products-diagnostics/MemberProductDetailExperience.test.tsx", "78f23534fddf90a66cf2589ca323a69105e260ed"],
    ["product-subscriptions/ProductSubscriptionCreate.tsx", "b4046a7fa1ec200ff4c432c0b9a17801e3d90d99"],
    ["product-subscriptions/ProductSubscriptionCreate.test.tsx", "d094babf3592395f9a3e26f299cf24789a837dbd"],
    ["pages/member/ProductPage.tsx", "d50b467159739148ae2ecbe90689c6d8df6f6d92"],
    ["pages/member/ProductPage.subscription.test.tsx", "ce94ff421800fa3b84437038d8c7e390ceeb0401"],
  ])("preserves accepted customer blob %s (identity control, not a behavior rerun)", (path, expectedBlob) => {
    const bytes = Buffer.from(readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n"));
    expect(createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")).toBe(expectedBlob);
  });
});

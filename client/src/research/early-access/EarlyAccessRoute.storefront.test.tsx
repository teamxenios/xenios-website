// @vitest-environment jsdom
// ONE STOREFRONT: /research/early-access shows the whole canonical catalog.
//
// Before this, the page rendered the 22-product opening set and the real
// 420-row catalog lived behind a separate /order-request link, so a customer
// looking at the storefront could not see most of what Xenios sells.
//
// These render the REAL route against stubbed server answers and assert what a
// customer would actually see: both sections present, retail prices on the
// cards, and each row's call to action matching the pathway the SERVER
// assigned it rather than anything the browser inferred from a price.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import EarlyAccessRoute from "./EarlyAccessRoute";
import { resetAssistedOrderConfigCache } from "../assisted-order/api";
import { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair } from "@shared/research/assisted-order/form";
import { REQUEST_INTENT_ATTEMPT_KEY } from "../assisted-order/request-intent-attempt";
import { ASSISTED_ORDER_DRAFT_KEY } from "../assisted-order/draft-store";
import type { ResearchContextValue } from "../core";
type ResearchSnapshot = Pick<ResearchContextValue,
  "member" | "memberToken" | "memberChecking" | "memberSessionStatus" | "recovery">;
const researchStore = vi.hoisted(() => {
  let snapshot: ResearchSnapshot = { member: null, memberToken: null,
    memberChecking: false, memberSessionStatus: "signed_out", recovery: "none" };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish(next: ResearchSnapshot) {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
  };
});
vi.mock("../core", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useResearch: () => useSyncExternalStore(
    researchStore.subscribe, researchStore.getSnapshot, researchStore.getSnapshot) };
});
vi.mock("../assisted-order/assisted-order.css", () => ({ default: {} }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const POLICIES = {
  "research-use": {
    slug: "research-use",
    title: "Research Use Policy",
    updated: "July 2026",
    agreement: { kind: "early_access_terms", version: "v1" },
    sections: [{
      heading: "Purpose",
      paragraphs: ["Research materials are supplied for laboratory research only."],
      bullets: [],
    }],
  },
};

/** The curated opening set the storefront shows as Featured. */
const FEATURED_UNITS = [
  {
    productId: "pc_bpc_1",
    variantId: "pcv_bpc_5",
    sku: "XEN-BPC-5",
    displayName: "BPC-157 Research Material",
    category: "Specialty research materials",
    strength: "5 MG",
    priceCents: 5600,
    currency: "USD",
    description: "Featured research peptide.",
    availability: "AVAILABLE",
    purchasable: true,
    quantityLimit: 20,
  },
];

/**
 * The canonical catalog page, as the assisted-order door returns it. One row
 * per pathway, each carrying the action label the SERVER assigned.
 */
const CANONICAL_ITEMS = [
  {
    productId: "pc_pep_1",
    variantId: "pcv_pep_1",
    productName: "Kisspeptin",
    family: "research_peptides_materials",
    channel: "Research Peptides & Materials",
    specification: "KISSPEPTIN 10 mg",
    format: null,
    packBasis: null,
    minimumQuantity: 1,
    maximumQuantity: 100,
    quantityIncrement: 1,
    unitPriceCents: 6500,
    currency: "USD",
    workflowMode: "direct_order_request",
    actionLabel: "Add to order request",
    accessNotice: null,
    researchUseOnly: true,
    catalogVersion: "catalog-v1",
    priceVersion: "price_1",
  },
  {
    productId: "pc_care_1",
    variantId: "pcv_care_1",
    productName: "Estradiol",
    family: "clinical_formulations_503a",
    channel: "503A Clinical Formulations",
    specification: "ESTRADIOL 1MG TABLET",
    format: null,
    packBasis: null,
    minimumQuantity: 1,
    maximumQuantity: 100,
    quantityIncrement: 1,
    // PRICED, and still never a direct sale. 242 live rows are exactly this.
    unitPriceCents: 125,
    currency: "USD",
    workflowMode: "provider_request",
    actionLabel: "Start provider workflow",
    accessNotice:
      "Fulfilled through the provider pathway. Not available for direct purchase.",
    researchUseOnly: false,
    catalogVersion: "catalog-v1",
    priceVersion: "price_2",
  },
  {
    productId: "pc_pending_1",
    variantId: "pcv_pending_1",
    productName: "BDNF",
    family: "research_peptides_materials",
    channel: "Research Peptides & Materials",
    specification: "BDNF (10mg)",
    format: null,
    packBasis: null,
    minimumQuantity: 1,
    maximumQuantity: 100,
    quantityIncrement: 1,
    // Priced, classification unfinished: askable, not buyable.
    unitPriceCents: 20000,
    currency: "USD",
    workflowMode: "request_activation",
    actionLabel: "Request activation",
    accessNotice:
      "Visible while classification and documentation are completed.",
    researchUseOnly: true,
    catalogVersion: "catalog-v1",
    priceVersion: "price_3",
  },
  {
    productId: "pc_unpriced_1",
    variantId: "pcv_unpriced_1",
    productName: "BAM15",
    family: "research_peptides_materials",
    channel: "Research Peptides & Materials",
    specification: "BAM15 500 mcg",
    format: null,
    packBasis: null,
    minimumQuantity: 1,
    maximumQuantity: 100,
    quantityIncrement: 1,
    // The ONLY honest "Price on request" in the shipped catalog.
    unitPriceCents: null,
    currency: "USD",
    workflowMode: "request_pricing",
    actionLabel: "Request pricing",
    accessNotice: null,
    researchUseOnly: true,
    catalogVersion: "catalog-v1",
    priceVersion: null,
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

type AgreementFixture = "accepted" | "required" | "unverified" | "locked";

function stubFetch(options: {
  bridgeEnabled: boolean;
  mixedMode?: "off" | "on" | "unknown";
  agreement?: AgreementFixture;
  featuredUnits?: readonly unknown[];
  session?: "existing" | "fresh-open" | "locked";
  sessionReplies?: readonly Record<string, unknown>[];
  sessionStatus?: number;
  throwSessionReadsFirst?: number;
  malformedSessionReadsFirst?: number;
  unlock?: "ok" | "refused";
  recovery?: "saved" | "missing" | "malformed" | "error";
  submit?: "saved";
}) {
  let sessionIssued = false;
  let sessionReads = 0;
  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === "POST") {
      if (path.endsWith("/request-intents") && options.submit === "saved") return jsonResponse({
        kind: "unapproved_selection_request", requestId: "30000000-0000-4000-8000-000000000001",
        publicReference: "XRI-30000000000040008000000000000001", status: "pending_review",
        createdAt: "2026-10-14T12:00:00.000Z" });
      if (path.endsWith("/request-intents/recover")) {
        if (options.recovery === "error") return jsonResponse({ error: "request_intent_unavailable" }, 503);
        return jsonResponse({ receipt: options.recovery === "missing" ? null : options.recovery === "malformed"
          ? { publicReference: "invented-reference" }
          : { kind: "unapproved_selection_request", requestId: "30000000-0000-4000-8000-000000000001",
              publicReference: "XRI-30000000000040008000000000000001", status: "pending_review",
              createdAt: "2026-10-14T12:00:00.000Z" } });
      }
      if (path.endsWith("/early-access/unlock")) {
        if (options.unlock === "refused") return jsonResponse({ ok: false }, 503);
        sessionIssued = true;
        return jsonResponse({ ok: true });
      }
      if (path.endsWith("/early-access/agreements/accept")) {
        const submitted = JSON.parse(String(init.body ?? "{}")) as {
          kind?: unknown;
          version?: unknown;
        };
        return jsonResponse({
          kind: submitted.kind,
          version: submitted.version,
          alreadyAccepted: false,
        });
      }
      return jsonResponse({ ok: true });
    }
    if (path.endsWith("/early-access/session")) {
      const readIndex = sessionReads++;
      if (readIndex < (options.throwSessionReadsFirst ?? 0)) throw new TypeError("network");
      if (readIndex < (options.malformedSessionReadsFirst ?? 0)) return new Response("not JSON", { status: 200 });
      if (options.sessionStatus) return jsonResponse({ ok: false }, options.sessionStatus);
      if (options.sessionReplies?.length) {
        return jsonResponse(options.sessionReplies[Math.min(readIndex, options.sessionReplies.length - 1)]);
      }
      if (options.session === "locked") return jsonResponse({ authenticated: false, openAccess: false });
      if (options.session === "fresh-open" && !sessionIssued) {
        return jsonResponse({ authenticated: false, openAccess: true });
      }
      return jsonResponse({ authenticated: true, expiresAt: null });
    }
    if (path.endsWith("/research/policies")) return jsonResponse({ policies: POLICIES });
    if (path.endsWith("/early-access/agreements")) {
      if (options.agreement === "unverified") {
        return jsonResponse({ ok: false, code: "IDENTITY_REQUIRED" }, 403);
      }
      if (options.agreement === "locked") {
        return jsonResponse({ ok: false, code: "SESSION_REQUIRED" }, 401);
      }
      return jsonResponse({
        ok: true,
        required: [{ kind: "early_access_terms", version: "v1" }],
        accepted: options.agreement !== "required",
      });
    }
    if (path.endsWith("/early-access/catalog")) {
      return jsonResponse({ ok: true, units: options.featuredUnits ?? FEATURED_UNITS });
    }
    if (path.endsWith("/request-intents/config")) {
      if (options.mixedMode === "unknown") return jsonResponse({ enabled: false, error: "request_intent_unavailable" }, 503);
      if (options.mixedMode !== "on") return jsonResponse({ enabled: false, error: "request_intent_disabled" }, 503);
      return jsonResponse({ enabled: true, requiredAgreements: [{ kind: "early_access_terms", version: "v1" }],
        formAcknowledgments: ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((ack) => ({
          id: ack.id, scope: ack.scope, ...assistedOrderFormPair(ack), copy: ack.copy,
        })) });
    }
    if (path.includes("/request-intents/catalog")) {
      // Production closes catalog together with intake; recovery must not need it.
      if (options.mixedMode !== "on") return jsonResponse({ error: "request_intent_disabled" }, 503);
      const query = new URL(path, "https://synthetic.invalid").searchParams;
      const rows = CANONICAL_ITEMS.filter((row) => !query.get("family") || row.family === query.get("family")).map((row) => ({
        ...row, unitPriceCents: row.workflowMode === "provider_request" ? null : row.unitPriceCents,
        sourceSelection: { family: row.family, slug: row.productName.toLowerCase(), variantId: row.variantId },
        selectableForReview: true, intentExclusion: null, clinicalReviewRequired: row.workflowMode === "provider_request",
        sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access", sourceRefusal: null,
      }));
      return jsonResponse({ items: rows, total: rows.length, page: Number(query.get("page") ?? 1),
        pageSize: Number(query.get("pageSize") ?? 24), families: ["research_peptides_materials", "clinical_formulations_503a"],
        channels: [], workflowModes: [] });
    }
    if (path.includes("/assisted-orders/config")) {
      return jsonResponse({
        enabled: options.bridgeEnabled,
        code: null,
        formId: "assisted_order_form_v1",
        requiredAgreements: [],
        formAcknowledgments: [],
      });
    }
    if (path.includes("/assisted-orders/catalog")) {
      return jsonResponse({
        items: CANONICAL_ITEMS,
        total: CANONICAL_ITEMS.length,
        page: 1,
        pageSize: 24,
        families: ["research_peptides_materials", "clinical_formulations_503a"],
        channels: ["Research Peptides & Materials", "503A Clinical Formulations"],
        workflowModes: [
          "direct_order_request",
          "provider_request",
          "request_activation",
          "request_pricing",
        ],
      });
    }
    if (path.endsWith("/early-access/cart/capability")) {
      return jsonResponse({ ok: false, code: "NOT_FOUND" }, 404);
    }
    return jsonResponse({ ok: true });
  });
  vi.stubGlobal("fetch", stub);
  return stub;
}

async function settleStorefront() {
  // Let the catalog fetches and the lazy chunk settle.
  for (let tick = 0; tick < 40; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}
async function renderStorefront(requestOnly = false) {
  await act(async () => { root.render(<EarlyAccessRoute requestOnly={requestOnly} />); });
  await settleStorefront();
  return container.textContent ?? "";
}

beforeEach(() => {
  // The assisted-order config request is shared across the three components
  // that ask for it, so it is cached for the page load. Each test stubs its
  // own fetch, so the cache has to start cold or a later test reuses an
  // earlier test's answer and never calls its own stub.
  resetAssistedOrderConfigCache();
  researchStore.publish({ member: null, memberToken: null, memberChecking: false,
    memberSessionStatus: "signed_out", recovery: "none" });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/research/early-access");
});

describe("the login-free request-only entry", () => {
  async function waitForAdd() {
    let add: HTMLButtonElement | undefined;
    for (let attempt = 0; attempt < 60 && !add; attempt += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
      add = [...container.querySelectorAll("button")].find((button) =>
        button.textContent === "Add Kisspeptin to request");
    }
    expect(add).toBeTruthy();
    return add!;
  }
  function continueButton() {
    return [...container.querySelectorAll("button")].find((button) =>
      button.textContent === "Continue to contact")!;
  }
  function retryButton() {
    const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === "Try again");
    expect(button).toBeTruthy();
    return button!;
  }
  function expectOuterHelp() {
    const help = container.querySelector('[data-testid="quick-order-outer-help"]');
    expect(help?.getAttribute("aria-label")).toBe("Catalog and ordering help");
    const link = help?.querySelector("a");
    expect(link?.getAttribute("href")).toBe("sms:+17374186381");
    expect(link?.textContent).toBe("Text 737-418-6381");
    expect(container.querySelectorAll('a[href="sms:+17374186381"]')).toHaveLength(1);
    expect(help?.textContent).toContain("Sending a text does not submit this request, place an order, confirm availability or approve treatment.");
    expect(help?.textContent).toContain("Do not include medical information or payment details.");
    const support = container.querySelector('a[href="/research/support"]');
    if (support) expect(support.compareDocumentPosition(help!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
  function expectPublicSupport() {
    expectOuterHelp();
    expect(container.querySelector('a[href="/research/support"]')?.textContent).toBe("Contact support");
    expect(container.querySelector('a[href="/support"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
  }
  function sessionReads(fetch: ReturnType<typeof stubFetch>) {
    return fetch.mock.calls.filter(([url]) => String(url).endsWith("/early-access/session"));
  }
  function unlockPosts(fetch: ReturnType<typeof stubFetch>) {
    return fetch.mock.calls.filter(([url, init]) => String(url).endsWith("/early-access/unlock") && init?.method === "POST");
  }
  it.each(["session", "request-path"] as const)("shows passive outer help while %s is pending and removes it when the eligible form mounts", async (phase) => {
    const fetch = stubFetch({ bridgeEnabled: true, mixedMode: "on" });
    const original = fetch.getMockImplementation()!;
    const path = phase === "session" ? "/api/research/early-access/session" : "/api/research/early-access/request-intents/config";
    let resume!: (response: Response) => void;
    let held = false;
    const pending = new Promise<Response>((resolve) => { resume = resolve; });
    fetch.mockImplementation((input, init) => {
      if (!held && String(input) === path) {
        held = true;
        return pending;
      }
      return original(input, init);
    });
    await renderStorefront(true);
    expect(container.textContent).toContain(phase === "session" ? "Preparing the request form" : "Checking the current request path");
    expectOuterHelp();
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(container.querySelector('[data-testid="quick-order-agreement-mount"]')).toBeNull();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    const link = container.querySelector<HTMLAnchorElement>('a[href="sms:+17374186381"]')!;
    const beforeFetches = fetch.mock.calls.length;
    const beforeLocation = window.location.href;
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const open = vi.spyOn(window, "open");
    try {
      link.addEventListener("click", (event) => event.preventDefault(), { once: true });
      await act(async () => { link.click(); });
      expect(fetch).toHaveBeenCalledTimes(beforeFetches);
      expect(storageWrite).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
      expect(window.location.href).toBe(beforeLocation);
    } finally {
      storageWrite.mockRestore();
      open.mockRestore();
    }
    await act(async () => { resume(await original(path)); });
    await renderStorefront(true);
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="quick-order-agreement-mount"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="quick-order-outer-help"]')).toBeNull();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });
  it("shows a truthful retry after a refused anonymous unlock and recovers without reloading", async () => {
    window.history.replaceState(null, "", "/research/early-access/order-request");
    const options = { bridgeEnabled: true, mixedMode: "on" as const, session: "fresh-open" as const,
      unlock: "refused" as "ok" | "refused" };
    const fetch = stubFetch(options);
    await renderStorefront(true);
    expect(container.textContent).toContain("could not be confirmed right now");
    expect(container.textContent).not.toContain("is not available here yet");
    expectPublicSupport();
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(sessionReads(fetch)).toHaveLength(1);
    expect(unlockPosts(fetch)).toHaveLength(1);
    options.unlock = "ok";
    await act(async () => { retryButton().click(); });
    await renderStorefront(true);
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="quick-order-agreement-mount"]')).toBeTruthy();
    expect(sessionReads(fetch)).toHaveLength(3);
    expect(unlockPosts(fetch)).toHaveLength(2);
    expect(window.location.pathname).toBe("/research/early-access/order-request");
  });
  it.each(["network", "malformed"] as const)("recovers from a %s session answer through one explicit retry", async (fault) => {
    const fetch = stubFetch({ bridgeEnabled: true, mixedMode: "on", session: "fresh-open",
      throwSessionReadsFirst: fault === "network" ? 1 : 0,
      malformedSessionReadsFirst: fault === "malformed" ? 1 : 0 });
    await renderStorefront(true);
    expect(container.textContent).toContain("could not be confirmed right now");
    expectPublicSupport();
    expect(sessionReads(fetch)).toHaveLength(1);
    expect(unlockPosts(fetch)).toHaveLength(0);
    await act(async () => { retryButton().click(); });
    await renderStorefront(true);
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeTruthy();
    expect(sessionReads(fetch)).toHaveLength(3);
    expect(unlockPosts(fetch)).toHaveLength(1);
  });
  it.each(["network", "malformed", "server"] as const)("keeps attempt and draft context after a %s fault", async (fault) => {
    const attempt = JSON.stringify({ key: "10000000-0000-4000-8000-000000000001",
      acceptedAt: "2026-10-14T12:00:00Z", state: "in_flight" });
    const draft = JSON.stringify({ idempotencyKey: "retained-legacy-attempt", selections: [],
      acceptedAt: "2026-10-14T12:00:00Z", attemptState: "uncertain", step: "review" });
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, attempt);
    window.sessionStorage.setItem(ASSISTED_ORDER_DRAFT_KEY, draft);
    const fetch = stubFetch({ bridgeEnabled: true, mixedMode: "on",
      throwSessionReadsFirst: fault === "network" ? 1 : 0,
      malformedSessionReadsFirst: fault === "malformed" ? 1 : 0,
      sessionStatus: fault === "server" ? 500 : undefined });
    await renderStorefront(true);
    expect(container.textContent).toContain("could not be confirmed right now");
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(attempt);
    expect(window.sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBe(draft);
    expect(unlockPosts(fetch)).toHaveLength(0);
    expectPublicSupport();
  });
  it("recovers from a 503 session answer through an explicit retry without reloading", async () => {
    window.history.replaceState(null, "", "/research/early-access/order-request");
    const options = { bridgeEnabled: true, mixedMode: "on" as const, session: "fresh-open" as const,
      sessionStatus: 503 as number | undefined };
    const fetch = stubFetch(options);
    await renderStorefront(true);
    expect(container.textContent).toContain("could not be confirmed right now");
    expect(container.textContent).not.toContain("not available in this environment");
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(sessionReads(fetch)).toHaveLength(1);
    expect(unlockPosts(fetch)).toHaveLength(0);
    expectPublicSupport();
    options.sessionStatus = undefined;
    await act(async () => { retryButton().click(); });
    await renderStorefront(true);
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="quick-order-agreement-mount"]')).toBeTruthy();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(sessionReads(fetch)).toHaveLength(3);
    expect(unlockPosts(fetch)).toHaveLength(1);
    expect(window.location.pathname).toBe("/research/early-access/order-request");
    expect(container.querySelector('[data-testid="quick-order-outer-help"]')).toBeNull();
  });
  it("preserves attempt and draft through 503 recovery and retains duplicate-review protection", async () => {
    const acceptedAt = new Date().toISOString();
    const attempt = JSON.stringify({ key: "10000000-0000-4000-8000-000000000001",
      acceptedAt, state: "in_flight" });
    const draft = JSON.stringify({ idempotencyKey: "retained-legacy-attempt", selections: [],
      acceptedAt, attemptState: "uncertain", step: "review" });
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, attempt);
    window.sessionStorage.setItem(ASSISTED_ORDER_DRAFT_KEY, draft);
    const options = { bridgeEnabled: true, mixedMode: "on" as const, session: "existing" as const,
      sessionStatus: 503 as number | undefined };
    const fetch = stubFetch(options);
    await renderStorefront(true);
    expect(container.textContent).toContain("could not be confirmed right now");
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(attempt);
    expect(window.sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBe(draft);
    expect(sessionReads(fetch)).toHaveLength(1);
    expect(unlockPosts(fetch)).toHaveLength(0);
    expectPublicSupport();
    options.sessionStatus = undefined;
    await act(async () => { retryButton().click(); });
    await renderStorefront(true);
    expect(container.textContent).not.toContain("could not be confirmed right now");
    expect(container.textContent).toContain("Do not create a replacement until staff check for duplicates");
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(attempt);
    expect(window.sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBe(draft);
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Try again")).toBe(false);
    expect(sessionReads(fetch)).toHaveLength(2);
    expect(unlockPosts(fetch)).toHaveLength(0);
    expectPublicSupport();
  });
  it("keeps a deployment 404 closed without an unlock or retry loop", async () => {
    const fetch = stubFetch({ bridgeEnabled: true, mixedMode: "on", sessionStatus: 404 });
    await renderStorefront(true);
    expect(container.textContent).toContain("not available in this environment");
    expect(container.textContent).not.toContain("could not be confirmed right now");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Try again")).toBe(false);
    expect(sessionReads(fetch)).toHaveLength(1);
    expect(unlockPosts(fetch)).toHaveLength(0);
    expectPublicSupport();
  });
  it("bounds repeated open-access answers rather than retrying automatically", async () => {
    const fetch = stubFetch({ bridgeEnabled: true, mixedMode: "on",
      sessionReplies: [{ authenticated: false, openAccess: true }] });
    await renderStorefront(true);
    expect(container.textContent).toContain("could not be confirmed right now");
    expect(sessionReads(fetch)).toHaveLength(2);
    expect(unlockPosts(fetch)).toHaveLength(1);
    expectPublicSupport();
  });
  it("offers a bounded retry after repeated expired answers and reopens only on fresh authority", async () => {
    const options = { bridgeEnabled: true, mixedMode: "on" as const,
      sessionReplies: [{ authenticated: true, expiresAt: new Date(Date.now() - 60_000).toISOString() }] as Record<string, unknown>[] };
    const fetch = stubFetch(options);
    await renderStorefront(true);
    expect(container.textContent).toContain("could not be confirmed right now");
    expect(sessionReads(fetch)).toHaveLength(2);
    expectPublicSupport();
    options.sessionReplies = [{ authenticated: true, expiresAt: null }];
    await act(async () => { retryButton().click(); });
    await renderStorefront(true);
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeTruthy();
    expect(sessionReads(fetch)).toHaveLength(3);
    expect(unlockPosts(fetch)).toHaveLength(0);
  });
  it("ignores a second retry click while the first authoritative read is in flight", async () => {
    const options = { bridgeEnabled: true, mixedMode: "on" as const, session: "fresh-open" as const,
      unlock: "refused" as "ok" | "refused" };
    const fetch = stubFetch(options);
    await renderStorefront(true);
    const retry = retryButton();
    const original = fetch.getMockImplementation()!;
    let resume!: (response: Response) => void;
    let holdNextRead = true;
    const pending = new Promise<Response>((resolve) => { resume = resolve; });
    fetch.mockImplementation((input, init) => {
      if (String(input).endsWith("/early-access/session") && holdNextRead) {
        holdNextRead = false;
        return pending;
      }
      return original(input, init);
    });
    act(() => { retry.click(); retry.click(); });
    expect(sessionReads(fetch)).toHaveLength(2);
    expect(unlockPosts(fetch)).toHaveLength(1);
    expect(container.textContent).toContain("Preparing the request form");
    expectOuterHelp();
    options.unlock = "ok";
    await act(async () => { resume(jsonResponse({ authenticated: false, openAccess: true })); });
    await renderStorefront(true);
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeTruthy();
    expect(sessionReads(fetch)).toHaveLength(3);
    expect(unlockPosts(fetch)).toHaveLength(2);
  });
  it("bootstraps a fresh signed-out browser and loads the mixed catalog without account credentials", async () => {
    window.history.replaceState(null, "", "/research/early-access/order-request");
    const fetch = stubFetch({ bridgeEnabled: true, mixedMode: "on", session: "fresh-open" });
    await renderStorefront(true);
    await waitForAdd();
    expect(container.querySelector("h1")?.textContent).toBe("Quick Order");
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
    expect(container.querySelector('[data-testid="early-access-featured-catalog"]')).toBeNull();
    expect(container.querySelector('[data-testid="early-access-checkout-mount"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('a[href*="/member/login"]')).toBeNull();
    expect(container.textContent).toContain("Clinical review required. Not a prescription.");
    expect(container.textContent).toContain("does not collect payment");
    const unlocks = fetch.mock.calls.filter(([url, init]) =>
      String(url).endsWith("/early-access/unlock") && init?.method === "POST");
    expect(unlocks).toHaveLength(1);
    expect(unlocks[0][1]?.body).toBe("{}");
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/early-access/session"))).toHaveLength(2);
    expect(fetch.mock.calls.every(([, init]) => !new Headers(init?.headers).has("Authorization"))).toBe(true);
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/member/"))).toBe(false);
  });
  it("preserves the closed staging gate without presenting a customer password or bypassing it", async () => {
    const fetch = stubFetch({ bridgeEnabled: true, mixedMode: "on", session: "locked" });
    await renderStorefront(true);
    expect(container.textContent).toContain("not available in this environment");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Try again")).toBe(false);
    expect(container.querySelector('a[href="/research/support"]')?.textContent).toBe("Contact support");
    expect(container.querySelector('a[href="/support"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/early-access/unlock"))).toBe(false);
    expect(sessionReads(fetch)).toHaveLength(1);
  });
  it.each(["off", "unknown"] as const)("never falls back to legacy checkout when mixed mode is %s", async (mixedMode) => {
    stubFetch({ bridgeEnabled: true, mixedMode });
    await renderStorefront(true);
    expect(container.textContent).toContain("The request form is currently unavailable");
    expectOuterHelp();
    expect(container.querySelector('a[href="/research/support"]')?.textContent).toBe("Contact support");
    expect(container.querySelector('a[href="/support"]')).toBeNull();
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
    expect(container.querySelector('[data-testid="early-access-featured-catalog"]')).toBeNull();
    expect(container.querySelector('[data-testid="early-access-checkout-mount"]')).toBeNull();
  });
  const mixedMarker = JSON.stringify({ key: "10000000-0000-4000-8000-000000000001",
    acceptedAt: "2026-10-14T12:00:00Z", state: "uncertain" });
  function recoverButton() {
    const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === "Check saved request");
    expect(button).toBeTruthy();
    return button!;
  }
  function recoveryPosts(fetch: ReturnType<typeof stubFetch>) {
    return fetch.mock.calls.filter(([url, init]) => String(url).endsWith("/request-intents/recover") && init?.method === "POST");
  }
  function expectRecoveryOnly(fetch: ReturnType<typeof stubFetch>) {
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
    expect(container.querySelector('input[name="name"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.querySelector('[data-testid="quick-order-agreement-mount"]')).toBeNull();
    expect(container.querySelectorAll('section[aria-label="Catalog and ordering help"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="quick-order-outer-help"]')).toBeNull();
    expect(fetch.mock.calls.filter(([url]) => String(url).includes("/request-intents/catalog"))).toHaveLength(0);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toEqual(recoveryPosts(fetch));
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/early-access/agreements"))).toHaveLength(0);
  }
  it.each([
    { mixedMode: "off" as const, bridgeEnabled: false }, { mixedMode: "off" as const, bridgeEnabled: true },
    { mixedMode: "unknown" as const, bridgeEnabled: false }, { mixedMode: "unknown" as const, bridgeEnabled: true },
  ])("recovers the retained mixed attempt with $mixedMode intake and bridge $bridgeEnabled", async (options) => {
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, mixedMarker);
    const fetch = stubFetch({ ...options, agreement: "required" });
    await renderStorefront(true);
    expect(container.textContent).toContain("Check your earlier request");
    expect(container.textContent).not.toContain("The request form is currently unavailable");
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeTruthy();
    expectRecoveryOnly(fetch);
    expect(recoveryPosts(fetch)).toHaveLength(0);
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(mixedMarker);
    await act(async () => { recoverButton().click(); });
    expect(recoveryPosts(fetch)).toHaveLength(1);
    expect(JSON.parse(String(recoveryPosts(fetch)[0][1]?.body))).toEqual({ idempotencyKey: JSON.parse(mixedMarker).key });
    expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    // Parent rerenders must not replace the confirmed receipt with a closed or legacy door.
    await renderStorefront(true);
    expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
    expectRecoveryOnly(fetch);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/request-intents/config"))).toHaveLength(1);
  });
  it("keeps the required agreement reachable after a parent-driven inner remount while intake is open", async () => {
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, mixedMarker);
    const fetch = stubFetch({ bridgeEnabled: false, mixedMode: "on", agreement: "required" });
    await renderStorefront(true);
    const shell = container.querySelector('[data-testid="quick-order-request-only"]');
    expect(shell).toBeTruthy();
    expect(container.querySelector('[data-testid="quick-order-agreement-mount"]')).toBeTruthy();
    expect(recoveryPosts(fetch)).toHaveLength(0);

    await act(async () => { recoverButton().click(); });
    expect(recoveryPosts(fetch)).toHaveLength(1);
    expect(JSON.parse(String(recoveryPosts(fetch)[0][1]?.body))).toEqual({ idempotencyKey: JSON.parse(mixedMarker).key });
    expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();

    // Remount the real inner entry without replacing the outer route or owner.
    act(() => researchStore.publish({ member: null, memberToken: null, memberChecking: true,
      memberSessionStatus: "checking", recovery: "none" }));
    await renderStorefront(true);
    expect(container.textContent).toContain("Checking your existing session");
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    act(() => researchStore.publish({ member: null, memberToken: null, memberChecking: false,
      memberSessionStatus: "signed_out", recovery: "none" }));
    await renderStorefront(true);
    const add = await waitForAdd();
    expect(container.querySelector('[data-testid="quick-order-request-only"]')).toBe(shell);
    expect(sessionReads(fetch)).toHaveLength(1);
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();

    const checkbox = container.querySelector<HTMLInputElement>('[data-testid="early-access-agreement-checkbox"]');
    expect(checkbox).toBeTruthy();
    expect(checkbox!.checked).toBe(false);
    act(() => add.click());
    expect(continueButton().matches(":disabled")).toBe(true);
    expect(container.querySelector('input[name="name"]')).toBeNull();
    act(() => checkbox!.click());
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="early-access-agreement-submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const posts = fetch.mock.calls.filter(([, init]) => init?.method === "POST");
    const acceptances = posts.filter(([url]) => String(url).endsWith("/early-access/agreements/accept"));
    expect(acceptances).toHaveLength(1);
    expect(JSON.parse(String(acceptances[0][1]?.body))).toMatchObject({ kind: "early_access_terms", version: "v1" });
    expect(posts).toHaveLength(2); // One recovery and one explicit legal acceptance.
    expect(recoveryPosts(fetch)).toHaveLength(1);
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    expect(continueButton().matches(":disabled")).toBe(false);
    act(() => continueButton().click());
    expect(container.querySelector('input[name="name"]')).toBeTruthy();
  });
  it.each(["same-member verification", "owner-key change"] as const)(
    "retains the same-member receipt or reaches the agreement after an owner change: %s", async (transition) => {
      const member = { firstName: "Fixture", status: "active" as const,
        applicationStatus: null, cartScope: "a".repeat(64) };
      researchStore.publish({ member, memberToken: "synthetic-before", memberChecking: false,
        memberSessionStatus: "authenticated", recovery: "none" });
      window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, mixedMarker);
      const fetch = stubFetch({ bridgeEnabled: false, mixedMode: "on", agreement: "required" });
      const render = vi.spyOn(root, "render");
      const stableRoute = <EarlyAccessRoute requestOnly />;
      await act(async () => { root.render(stableRoute); });
      await settleStorefront();
      const shell = container.querySelector('[data-testid="quick-order-request-only"]');
      await act(async () => { recoverButton().click(); });
      expect(recoveryPosts(fetch)).toHaveLength(1);
      expect(JSON.parse(String(recoveryPosts(fetch)[0][1]?.body))).toEqual({ idempotencyKey: JSON.parse(mixedMarker).key });
      expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
      expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
      if (transition === "same-member verification") {
        await act(async () => researchStore.publish({ member: null, memberToken: null,
          memberChecking: true, memberSessionStatus: "checking", recovery: "none" }));
        await settleStorefront();
        expect(container.textContent).toContain("Checking your existing session");
        expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
        await act(async () => researchStore.publish({ member, memberToken: "synthetic-refreshed",
          memberChecking: false, memberSessionStatus: "authenticated", recovery: "none" }));
      } else {
        await act(async () => researchStore.publish({ member: null, memberToken: null,
          memberChecking: false, memberSessionStatus: "signed_out", recovery: "none" }));
      }
      // Only actual subscribers update. There is no root.render between flips.
      await settleStorefront();
      if (transition === "same-member verification") {
        expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
        expect(container.textContent).not.toContain("Request products for review");
        expect(container.querySelector('input[name="name"]')).toBeNull();
        expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
        expect(render).toHaveBeenCalledTimes(1);
        return;
      }
      const add = await waitForAdd();
      expect(render).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[data-testid="quick-order-request-only"]')).toBe(shell);
      expect(container.textContent).not.toContain("XRI-30000000000040008000000000000001");
      expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
      expect(sessionReads(fetch)).toHaveLength(1);
      const checkbox = container.querySelector<HTMLInputElement>('[data-testid="early-access-agreement-checkbox"]');
      expect(checkbox).toBeTruthy();
      expect(checkbox!.checked).toBe(false);
      act(() => add.click());
      expect(continueButton().matches(":disabled")).toBe(true);
      expect(container.querySelector('input[name="name"]')).toBeNull();
      act(() => checkbox!.click());
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-testid="early-access-agreement-submit"]')!.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const posts = fetch.mock.calls.filter(([, init]) => init?.method === "POST");
      const acceptances = posts.filter(([url]) => String(url).endsWith("/early-access/agreements/accept"));
      expect(acceptances).toHaveLength(1);
      expect(JSON.parse(String(acceptances[0][1]?.body))).toMatchObject({ kind: "early_access_terms", version: "v1" });
      expect(posts).toHaveLength(2);
      expect(recoveryPosts(fetch)).toHaveLength(1);
      expect(continueButton().matches(":disabled")).toBe(false);
      act(() => continueButton().click());
      expect(container.querySelector('input[name="name"]')).toBeTruthy();
      expect(render).toHaveBeenCalledTimes(1);
    });
  async function recoveredMember(mode: "on" | "off" | "unknown" = "on") {
    const member = { firstName: "Receipt fixture", status: "active" as const,
      applicationStatus: null, cartScope: "a".repeat(64) };
    researchStore.publish({ member, memberToken: "synthetic-before", memberChecking: false,
      memberSessionStatus: "authenticated", recovery: "none" });
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, mixedMarker);
    const fetch = stubFetch({ bridgeEnabled: false, mixedMode: mode, agreement: "accepted" });
    await act(async () => root.render(<EarlyAccessRoute requestOnly />));
    await settleStorefront();
    await act(async () => recoverButton().click());
    expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    return { member, fetch };
  }
  function checkingMember(): ResearchSnapshot {
    return { member: null, memberToken: null, memberChecking: true,
      memberSessionStatus: "checking", recovery: "none" };
  }
  it("retains a submitted member receipt after context re-verification without sending another request", async () => {
    const member = { firstName: "Submitted fixture", status: "active" as const,
      applicationStatus: null, cartScope: "a".repeat(64) };
    researchStore.publish({ member, memberToken: "synthetic-before", memberChecking: false,
      memberSessionStatus: "authenticated", recovery: "none" });
    const fetch = stubFetch({ bridgeEnabled: false, mixedMode: "on", agreement: "accepted", submit: "saved" });
    const render = vi.spyOn(root, "render");
    await act(async () => root.render(<EarlyAccessRoute requestOnly />));
    await settleStorefront();
    const add = await waitForAdd();
    act(() => add.click());
    act(() => continueButton().click());
    for (const [name, value] of Object.entries({ name: "Synthetic Customer", email: "synthetic@example.invalid",
      phone: "+15555550123", shippingLine1: "1 Synthetic Street", shippingCity: "Test",
      shippingRegion: "TX", shippingPostalCode: "00000", shippingCountryCode: "US" })) {
      await act(async () => {
        const input = container.querySelector<HTMLInputElement>('input[name="' + name + '"]')!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    act(() => container.querySelector<HTMLInputElement>('input[name="age"]')!.click());
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    act(() => container.querySelectorAll<HTMLInputElement>("fieldset input[type=checkbox]").forEach((entry) => entry.click()));
    const submit = [...container.querySelectorAll("button")].find((button) => button.textContent === "Submit for review")!;
    await act(async () => submit.click());
    expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    await act(async () => researchStore.publish(checkingMember()));
    expect(container.textContent).not.toContain("XRI-30000000000040008000000000000001");
    await act(async () => researchStore.publish({ member, memberToken: "synthetic-refreshed",
      memberChecking: false, memberSessionStatus: "authenticated", recovery: "none" }));
    await settleStorefront();
    expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
    expect(container.querySelector('input[name="name"]')).toBeNull();
    expect(container.textContent).not.toContain("Request products for review");
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(recoveryPosts(fetch)).toHaveLength(0);
    expect(render).toHaveBeenCalledTimes(1);
  });
  it("keeps deliberate surrounding-navigation focus when the same member receipt returns", async () => {
    // The route fixture omits the surrounding app navigation. Model its
    // persistent control outside this React root, without inventing an intake link.
    const navigation = document.createElement("a");
    navigation.href = "/research/support";
    navigation.textContent = "Surrounding navigation fixture";
    document.body.append(navigation);
    try {
      const render = vi.spyOn(root, "render");
      const { member, fetch } = await recoveredMember();
      navigation.focus();
      expect(document.activeElement).toBe(navigation);
      await act(async () => researchStore.publish(checkingMember()));
      expect(navigation.isConnected).toBe(true);
      expect(document.activeElement).toBe(navigation);
      expect(container.textContent).not.toContain("XRI-30000000000040008000000000000001");
      await act(async () => researchStore.publish({ member, memberToken: "synthetic-refreshed",
        memberChecking: false, memberSessionStatus: "authenticated", recovery: "none" }));
      await settleStorefront();
      expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
      expect(document.activeElement).toBe(navigation);
      expect(container.textContent).not.toContain("Request products for review");
      expect(recoveryPosts(fetch)).toHaveLength(1);
      expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
      expect(render).toHaveBeenCalledTimes(1);
    } finally {
      navigation.remove();
    }
  });
  it.each(["on", "off", "unknown"] as const)(
    "restores only the confirmed member receipt after context re-verification with %s intake", async (mode) => {
      const render = vi.spyOn(root, "render");
      const { member, fetch } = await recoveredMember(mode);
      await act(async () => researchStore.publish(checkingMember()));
      expect(container.textContent).toContain("Checking your existing session");
      expect(container.textContent).not.toContain("XRI-30000000000040008000000000000001");
      await act(async () => researchStore.publish({ member, memberToken: "synthetic-refreshed",
        memberChecking: false, memberSessionStatus: "authenticated", recovery: "none" }));
      await settleStorefront();
      expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
      expect(container.textContent).not.toContain("Request products for review");
      expect(container.textContent).not.toContain("The current request path could not be confirmed");
      expect(container.querySelector('input[name="name"]')).toBeNull();
      expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
      expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
      expect(recoveryPosts(fetch)).toHaveLength(1);
      expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
      expect(render).toHaveBeenCalledTimes(1);
    });
  it.each(["different member", "sign-out", "verification failure", "recovery", "invalid scope"] as const)(
    "permanently discards the confirmed reference on %s, including return to the former member", async (boundary) => {
      const { member, fetch } = await recoveredMember();
      await act(async () => researchStore.publish(checkingMember()));
      const changed: ResearchSnapshot = boundary === "sign-out"
        ? { member: null, memberToken: null, memberChecking: false, memberSessionStatus: "signed_out", recovery: "none" }
        : boundary === "verification failure"
          ? { member: null, memberToken: null, memberChecking: false, memberSessionStatus: "verification_failed", recovery: "none" }
          : { member: { ...member, cartScope: boundary === "different member" ? "b".repeat(64)
              : boundary === "invalid scope" ? "invalid" : member.cartScope }, memberToken: "synthetic-changed",
            memberChecking: false, memberSessionStatus: "authenticated", recovery: boundary === "recovery" ? "pending" : "none" };
      await act(async () => researchStore.publish(changed));
      expect(container.textContent).not.toContain("XRI-30000000000040008000000000000001");
      await act(async () => researchStore.publish({ member, memberToken: "synthetic-return",
        memberChecking: false, memberSessionStatus: "authenticated", recovery: "none" }));
      await settleStorefront();
      expect(container.textContent).not.toContain("XRI-30000000000040008000000000000001");
      expect(recoveryPosts(fetch)).toHaveLength(1);
      expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    });
  it("permanently discards A's receipt on a direct authenticated A to B to A switch", async () => {
    const { member, fetch } = await recoveredMember();
    await act(async () => researchStore.publish({ member: { ...member, cartScope: "b".repeat(64) },
      memberToken: "synthetic-B", memberChecking: false, memberSessionStatus: "authenticated", recovery: "none" }));
    expect(container.textContent).not.toContain("XRI-30000000000040008000000000000001");
    await act(async () => researchStore.publish({ member, memberToken: "synthetic-A-again",
      memberChecking: false, memberSessionStatus: "authenticated", recovery: "none" }));
    await settleStorefront();
    expect(container.textContent).not.toContain("XRI-30000000000040008000000000000001");
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("does not promote a recovery result that arrives after the member form unmounts", async () => {
    const member = { firstName: "Pending fixture", status: "active" as const,
      applicationStatus: null, cartScope: "a".repeat(64) };
    researchStore.publish({ member, memberToken: "synthetic-before", memberChecking: false,
      memberSessionStatus: "authenticated", recovery: "none" });
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, mixedMarker);
    const fetch = stubFetch({ bridgeEnabled: false, mixedMode: "on", agreement: "accepted" });
    const ordinary = fetch.getMockImplementation()!;
    let resolve!: (value: Response) => void;
    fetch.mockImplementation((input, init) => String(input).endsWith("/request-intents/recover")
      ? new Promise<Response>((done) => { resolve = done; }) : ordinary(input, init));
    await act(async () => root.render(<EarlyAccessRoute requestOnly />));
    await settleStorefront();
    act(() => recoverButton().click());
    await act(async () => researchStore.publish(checkingMember()));
    await act(async () => resolve(jsonResponse({ receipt: { kind: "unapproved_selection_request",
      requestId: "30000000-0000-4000-8000-000000000001", publicReference: "XRI-30000000000040008000000000000001",
      status: "pending_review", createdAt: "2026-10-14T12:00:00.000Z" } })));
    await act(async () => researchStore.publish({ member, memberToken: "synthetic-refreshed",
      memberChecking: false, memberSessionStatus: "authenticated", recovery: "none" }));
    await settleStorefront();
    expect(container.textContent).not.toContain("XRI-30000000000040008000000000000001");
    expect(container.textContent).toContain("Check your earlier request");
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(mixedMarker);
    expect(recoveryPosts(fetch)).toHaveLength(1);
  });
  it("does not reclassify a fresh mounted journey when a later marker appears before a parent rerender", async () => {
    const fetch = stubFetch({ bridgeEnabled: false, mixedMode: "on", agreement: "accepted" });
    await renderStorefront(true);
    const add = await waitForAdd();
    const agreement = container.querySelector('[data-testid="quick-order-agreement-mount"]');
    expect(agreement).toBeTruthy();
    act(() => add.click());
    expect(continueButton().matches(":disabled")).toBe(false);

    // Isolate late-marker lifecycle timing; this fixture does not submit.
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, mixedMarker);
    await renderStorefront(true);
    expect(container.querySelector('[data-testid="quick-order-agreement-mount"]')).toBe(agreement);
    expect(container.textContent).toContain("1 selected.");
    expect(continueButton().matches(":disabled")).toBe(false);
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(mixedMarker);
    expect(recoveryPosts(fetch)).toHaveLength(0);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    expect(sessionReads(fetch)).toHaveLength(1);
  });
  it("resets a confirmed closed-intake recovery door when the owning session expires", async () => {
    const expires = Date.now() + 60000;
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, mixedMarker);
    const fetch = stubFetch({ bridgeEnabled: false, mixedMode: "off", agreement: "required", sessionReplies: [
      { authenticated: true, expiresAt: new Date(expires).toISOString() },
      { authenticated: true, expiresAt: null },
    ] });
    await renderStorefront(true);
    await act(async () => { recoverButton().click(); });
    expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
    expectRecoveryOnly(fetch);
    vi.spyOn(Date, "now").mockReturnValue(expires + 1);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await renderStorefront(true);
    expect(sessionReads(fetch)).toHaveLength(2);
    expect(container.textContent).not.toContain("XRI-30000000000040008000000000000001");
    expect(container.textContent).toContain("The request form is currently unavailable");
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
    expect(container.querySelector('[data-testid="quick-order-agreement-mount"]')).toBeNull();
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    expect(recoveryPosts(fetch)).toHaveLength(1);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expectOuterHelp();
  });
  it("clears a member receipt on an actual Early Access expiry even when the member scope repeats", async () => {
    const member = { firstName: "Expiry fixture", status: "active" as const,
      applicationStatus: null, cartScope: "a".repeat(64) };
    researchStore.publish({ member, memberToken: "synthetic-before", memberChecking: false,
      memberSessionStatus: "authenticated", recovery: "none" });
    const expires = Date.now() + 60000;
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, mixedMarker);
    const fetch = stubFetch({ bridgeEnabled: false, mixedMode: "off", agreement: "required", sessionReplies: [
      { authenticated: true, expiresAt: new Date(expires).toISOString() },
      { authenticated: true, expiresAt: null },
    ] });
    const render = vi.spyOn(root, "render");
    await act(async () => root.render(<EarlyAccessRoute requestOnly />));
    await settleStorefront();
    await act(async () => recoverButton().click());
    expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
    vi.spyOn(Date, "now").mockReturnValue(expires + 1);
    await act(async () => window.dispatchEvent(new Event("focus")));
    await settleStorefront();
    expect(sessionReads(fetch)).toHaveLength(2);
    expect(container.textContent).not.toContain("XRI-30000000000040008000000000000001");
    expect(container.textContent).toContain("The request form is currently unavailable");
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    expect(recoveryPosts(fetch)).toHaveLength(1);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(render).toHaveBeenCalledTimes(1);
  });
  it("does not resurrect a member receipt when an expired Early Access session remounts an open door", async () => {
    const member = { firstName: "Open expiry fixture", status: "active" as const,
      applicationStatus: null, cartScope: "a".repeat(64) };
    researchStore.publish({ member, memberToken: "synthetic-before", memberChecking: false,
      memberSessionStatus: "authenticated", recovery: "none" });
    const expires = Date.now() + 60000;
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, mixedMarker);
    const fetch = stubFetch({ bridgeEnabled: false, mixedMode: "on", agreement: "accepted", sessionReplies: [
      { authenticated: true, expiresAt: new Date(expires).toISOString() },
      { authenticated: true, expiresAt: null },
    ] });
    const render = vi.spyOn(root, "render");
    await act(async () => root.render(<EarlyAccessRoute requestOnly />));
    await settleStorefront();
    await act(async () => recoverButton().click());
    expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
    vi.spyOn(Date, "now").mockReturnValue(expires + 1);
    await act(async () => window.dispatchEvent(new Event("focus")));
    await waitForAdd();
    expect(sessionReads(fetch)).toHaveLength(2);
    expect(container.textContent).toContain("Request products for review");
    expect(container.textContent).not.toContain("XRI-30000000000040008000000000000001");
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    expect(recoveryPosts(fetch)).toHaveLength(1);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(render).toHaveBeenCalledTimes(1);
  });
  it("reaches recovery while readiness is pending and retains the receipt after readiness closes", async () => {
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, mixedMarker);
    const fetch = stubFetch({ bridgeEnabled: false, mixedMode: "off" });
    const original = fetch.getMockImplementation()!;
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    fetch.mockImplementation((input, init) => String(input).endsWith("/request-intents/config") ? pending : original(input, init));
    await renderStorefront(true);
    await act(async () => { recoverButton().click(); });
    expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
    await act(async () => { release(jsonResponse({ enabled: false, error: "request_intent_disabled" }, 503)); });
    await renderStorefront(true);
    expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
    expectRecoveryOnly(fetch);
    expect(recoveryPosts(fetch)).toHaveLength(1);
  });
  it.each(["missing", "malformed", "error"] as const)("keeps a %s recovery unconfirmed with the same marker and no replacement", async (recovery) => {
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, mixedMarker);
    const options = { bridgeEnabled: false, mixedMode: "off" as const, recovery: recovery as "saved" | typeof recovery };
    const fetch = stubFetch(options);
    await renderStorefront(true);
    await act(async () => { recoverButton().click(); });
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(container.textContent).not.toContain("Your saved request reference");
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(mixedMarker);
    expectRecoveryOnly(fetch);
    options.recovery = "saved";
    await act(async () => { recoverButton().click(); });
    expect(recoveryPosts(fetch)).toHaveLength(2);
    for (const [, init] of recoveryPosts(fetch)) expect(JSON.parse(String(init?.body))).toEqual({ idempotencyKey: JSON.parse(mixedMarker).key });
    expect(container.textContent).toContain("XRI-30000000000040008000000000000001");
    expectRecoveryOnly(fetch);
  });
  it.each(["off", "unknown"] as const)("does not grant recovery through a closed session with %s intake", async (mixedMode) => {
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, mixedMarker);
    const fetch = stubFetch({ bridgeEnabled: true, mixedMode, session: "locked" });
    await renderStorefront(true);
    expect(container.textContent).toContain("not available in this environment");
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(recoveryPosts(fetch)).toHaveLength(0);
    expectPublicSupport();
  });
  it.each(["off", "unknown"] as const)("keeps conflicting retained door markers blocked with %s intake", async (mixedMode) => {
    const legacyMarker = JSON.stringify({ idempotencyKey: "legacy-attempt", selections: [],
      acceptedAt: "2026-10-14T12:00:00Z", attemptState: "uncertain", step: "review" });
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, mixedMarker);
    window.sessionStorage.setItem(ASSISTED_ORDER_DRAFT_KEY, legacyMarker);
    const fetch = stubFetch({ bridgeEnabled: true, mixedMode });
    await renderStorefront(true);
    expect(container.textContent).toContain("Do not create a replacement until staff check for duplicates");
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
    expect(recoveryPosts(fetch)).toHaveLength(0);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(mixedMarker);
    expect(window.sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBe(legacyMarker);
    expectOuterHelp();
  });
  it("allows browsing but enables contact only after canonical server agreement acceptance", async () => {
    const fetch = stubFetch({ bridgeEnabled: false, mixedMode: "on", agreement: "required" });
    await renderStorefront(true);
    const add = await waitForAdd();
    act(() => add.click());
    expect(continueButton().disabled).toBe(true);
    expect(container.querySelector('input[name="name"]')).toBeNull();
    act(() => container.querySelector<HTMLInputElement>('[data-testid="early-access-agreement-checkbox"]')!.click());
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="early-access-agreement-submit"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(fetch.mock.calls.filter(([url, init]) => String(url).endsWith("/early-access/agreements/accept")
      && init?.method === "POST")).toHaveLength(1);
    expect(continueButton().disabled).toBe(false);
    act(() => continueButton().click());
    expect(container.querySelector('input[name="name"]')).toBeTruthy();
  });
  it.each(["unverified", "locked"] as const)("keeps continuation closed when server standing is %s", async (agreement) => {
    stubFetch({ bridgeEnabled: false, mixedMode: "on", agreement });
    await renderStorefront(true);
    const add = await waitForAdd();
    act(() => add.click());
    expect(continueButton().disabled).toBe(true);
    expect(container.querySelector('input[name="name"]')).toBeNull();
  });
  it.each(["on", "off", "unknown"] as const)("does not switch a malformed retained attempt into a new request with %s intake", async (mixedMode) => {
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, "malformed retained attempt");
    stubFetch({ bridgeEnabled: true, mixedMode });
    await renderStorefront(true);
    expect(container.textContent).toContain("Do not create a replacement until staff check for duplicates");
    expect(container.querySelector('a[href="/research/support"]')?.textContent).toBe("Contact support");
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe("malformed retained attempt");
    expectOuterHelp();
  });
  it.each(["on", "off", "unknown"] as const)("holds a valid uncertain legacy attempt with %s intake without mounting checkout or deleting its marker", async (mixedMode) => {
    const marker = JSON.stringify({ idempotencyKey: "legacy-attempt", selections: [],
      acceptedAt: new Date().toISOString(), attemptState: "uncertain", step: "review" });
    window.sessionStorage.setItem(ASSISTED_ORDER_DRAFT_KEY, marker);
    stubFetch({ bridgeEnabled: true, mixedMode });
    await renderStorefront(true);
    expect(container.textContent).toContain("Do not create a replacement until staff check for duplicates");
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(window.sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBe(marker);
    expect(container.querySelector('a[href="/research/support"]')?.textContent).toBe("Contact support");
    expectOuterHelp();
  });
  it("rechecks expired session authority and hides the form on refusal without a password fallback", async () => {
    const expires = Date.now() + 60000;
    stubFetch({ bridgeEnabled: false, mixedMode: "on", sessionReplies: [
      { authenticated: true, expiresAt: new Date(expires).toISOString() },
      { authenticated: false, openAccess: false },
    ] });
    await renderStorefront(true);
    await waitForAdd();
    vi.spyOn(Date, "now").mockReturnValue(expires + 1);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.textContent).toContain("not available in this environment");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Try again")).toBe(false);
    expect(container.querySelector('a[href="/research/support"]')?.textContent).toBe("Contact support");
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the unified Early Access storefront", () => {
  it("shows Featured products AND the full canonical catalog on one page", async () => {
    stubFetch({ bridgeEnabled: true });
    const text = await renderStorefront();

    expect(text).toContain("Featured products");
    expect(text).toContain("All products");
    // The customer no longer has to find a separate page for the real catalog.
    const allProducts = container.querySelector('[data-testid="early-access-full-catalog"]');
    const featured = container.querySelector('[data-testid="early-access-featured-catalog"]');
    expect(allProducts).toBeTruthy();
    expect(featured).toBeTruthy();
    expect(
      featured?.querySelector("[data-testid$='-category']")?.textContent,
    ).toBe("Specialty research materials");
    // The historically faster, primary canonical surface must precede the
    // heavier Featured projection so a slow secondary fetch cannot own first
    // useful product time.
    expect(
      allProducts!.compareDocumentPosition(featured!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the actual legacy catalog and wizard when the mixed feature is explicitly off", async () => {
    const fetch = stubFetch({ bridgeEnabled: true, mixedMode: "off" });
    await renderStorefront();
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(container.textContent).not.toContain("Request intake is currently unavailable");
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/request-intents/config"))).toHaveLength(1);
  });
  it("opens the mixed catalog without depending on the old bridge and shares one readiness probe with its CTA", async () => {
    const fetch = stubFetch({ bridgeEnabled: false, mixedMode: "on" });
    await renderStorefront();
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
    expect(container.textContent).toContain("Estradiol");
    expect(container.textContent).toContain("Clinical review required. Not a prescription.");
    expect(container.textContent).toContain("Open request form");
    expect(container.querySelector('a[href="/research/early-access/order-request"]')?.textContent).toBe("Open request form");
    // A separate form config read retrieves its own current legal requirements.
    // CTA and storefront together use ONE readiness probe, not two.
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/request-intents/config"))).toHaveLength(2);
  });
  it("does not treat unavailable mixed readiness as permission to use the old submit path", async () => {
    stubFetch({ bridgeEnabled: true, mixedMode: "unknown" });
    await renderStorefront();
    expect(container.querySelector('[data-testid="request-door-held"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
  });
  it("keeps an existing intent marker on its own recovery path when the feature is off", async () => {
    const marker = JSON.stringify({ key: "10000000-0000-4000-8000-000000000001",
      acceptedAt: "2026-10-14T12:00:00Z", state: "in_flight" });
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, marker);
    stubFetch({ bridgeEnabled: true, mixedMode: "off" });
    await renderStorefront();
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(marker);
    expect(container.textContent).toContain("will not start a different request");
  });
  it("passes a clinical link to the real mixed form without adding or redirecting it", async () => {
    window.history.replaceState(null, "", "/research/early-access?family=clinical_formulations_503a&slug=estradiol&variant=pcv_care_1&qty=2&intent=care");
    stubFetch({ bridgeEnabled: true, mixedMode: "on" });
    await renderStorefront();
    expect(container.textContent).toContain("Selection from your link");
    expect(container.textContent).toContain("Requested quantity: 2");
    const add = [...container.querySelectorAll("button")].find((button) => button.textContent === "Add linked selection for review");
    expect(add).toBeTruthy();
    expect(container.textContent).toContain("0 selected.");
    act(() => add!.click());
    expect(container.textContent).toContain("1 selected.");
    expect(window.location.pathname).toBe("/research/early-access");
  });

  it("omits a malformed Featured category without hiding or changing the product", async () => {
    stubFetch({
      bridgeEnabled: true,
      featuredUnits: [{ ...FEATURED_UNITS[0], category: { private: "not display copy" } }],
    });
    const text = await renderStorefront();
    const featured = container.querySelector('[data-testid="early-access-featured-catalog"]');

    expect(featured?.querySelector("[data-testid$='-category']")).toBeNull();
    expect(text).toContain("BPC-157 Research Material");
    expect(text).toContain("$56.00 per unit");
    expect(text).toContain("Available to order");
  });

  it("shows only the assisted-order journey after the embedded catalog advances", async () => {
    stubFetch({ bridgeEnabled: true });
    await renderStorefront();
    // The embedded catalog mounts through a lazy chunk after the agreement
    // resolves and then debounces its fetch by 200 ms, so a fixed 260 ms wait
    // raced the mount and reported a missing card that was merely late. Wait
    // for the card itself, bounded, so the assertion still fails on a genuine
    // absence.
    let add: HTMLButtonElement | null = null;
    for (let attempt = 0; attempt < 60 && add === null; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      add = container.querySelector<HTMLButtonElement>(
        '[data-testid="order-card-add-pcv_pep_1"]',
      );
    }
    expect(add).toBeTruthy();
    act(() => add!.click());
    const continueButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="order-continue-contact"]',
    );
    expect(continueButton).toBeTruthy();
    act(() => continueButton!.click());

    expect(container.querySelector('[data-testid="early-access-featured-catalog"]')).toBeNull();
    const routeStepper = container.querySelector('[data-testid="early-access-stepper"]');
    expect(routeStepper).toBeTruthy();
    expect(routeStepper?.querySelectorAll("li")).toHaveLength(4);
    expect(
      routeStepper
        ?.querySelector('[data-testid="early-access-stepper-step-1"]')
        ?.getAttribute("aria-current"),
    ).toBe("step");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")?.textContent).toBe("Complete your order request");
    expect(
      container.querySelector('[data-testid="early-access-full-catalog"] h2')?.textContent,
    ).toBe("Contact and shipping");
    expect(container.querySelector('[data-testid="order-step-contact"]')).toBeNull();
    expect(container.querySelector('nav[aria-label="Order request progress"]')).toBeNull();
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it("allows browsing but unlocks Contact only after the agreement is recorded", async () => {
    stubFetch({ bridgeEnabled: true, agreement: "required" });
    await renderStorefront();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260));
    });

    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="order-card-add-pcv_pep_1"]',
      )!.click();
    });
    const continueButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="order-continue-contact"]',
    )!;
    expect(continueButton.disabled).toBe(true);
    expect(container.querySelector('[data-testid="order-contact-name"]')).toBeNull();

    act(() => {
      container.querySelector<HTMLInputElement>(
        '[data-testid="early-access-agreement-checkbox"]',
      )!.click();
    });
    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="early-access-agreement-submit"]',
      )!.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(continueButton.disabled).toBe(false);
    act(() => continueButton.click());
    expect(container.querySelector('[data-testid="order-contact-name"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="early-access-featured-catalog"]')).toBeNull();
  });

  it.each(["unverified", "locked"] as const)(
    "never exposes Contact or submit while agreement standing is %s",
    async (agreement) => {
      stubFetch({ bridgeEnabled: true, agreement });
      await renderStorefront();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 260));
      });
      act(() => {
        container.querySelector<HTMLButtonElement>(
          '[data-testid="order-card-add-pcv_pep_1"]',
        )!.click();
      });

      expect(
        container.querySelector<HTMLButtonElement>(
          '[data-testid="order-continue-contact"]',
        )?.disabled,
      ).toBe(true);
      expect(container.querySelector('[data-testid="order-contact-name"]')).toBeNull();
      expect(container.querySelector('[data-testid="order-submit"]')).toBeNull();
    },
  );

  // NOTE ON SCOPE. The price text, the Care refusal and each row's action
  // label are rendered by the catalog component itself and are already proven
  // in client/src/research/assisted-order/AssistedOrderPage.test.tsx against
  // the same payload shape. They are deliberately NOT re-asserted here: this
  // file imports the storefront, and importing the catalog component eagerly
  // pulls assisted-order.css through a tailwind/postcss version mismatch that
  // fails the whole file. Duplicating those assertions would buy nothing and
  // cost the storefront proof entirely.
  //
  // What this file uniquely proves is the CONVERGENCE: that one page offers
  // both sections, and that neither appears when the order door is shut.

  it("offers no catalog at all when the order door is closed", async () => {
    // A dark deployment must show neither a dead button nor a catalog the
    // submit door would refuse.
    stubFetch({ bridgeEnabled: false });
    const text = await renderStorefront();
    expect(container.querySelector('[data-testid="early-access-full-catalog"]')).toBeNull();
    expect(text).not.toContain("All products");
    // The featured set still renders, so the page is not empty.
    expect(text).toContain("Featured products");
  });
});

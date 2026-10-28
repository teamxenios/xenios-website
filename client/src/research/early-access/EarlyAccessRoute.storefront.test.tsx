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
vi.mock("../core", () => ({ useResearch: () => ({
  member: null, memberToken: null, memberChecking: false, memberSessionStatus: "signed_out", recovery: "none",
}) }));
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
}) {
  let sessionIssued = false;
  let sessionReads = 0;
  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === "POST") {
      if (path.endsWith("/early-access/unlock")) {
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
      if (options.sessionReplies?.length) {
        return jsonResponse(options.sessionReplies[Math.min(sessionReads++, options.sessionReplies.length - 1)]);
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

async function renderStorefront(requestOnly = false) {
  await act(async () => {
    root.render(<EarlyAccessRoute requestOnly={requestOnly} />);
  });
  // Let the catalog fetches and the lazy chunk settle.
  for (let tick = 0; tick < 40; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container.textContent ?? "";
}

beforeEach(() => {
  // The assisted-order config request is shared across the three components
  // that ask for it, so it is cached for the page load. Each test stubs its
  // own fetch, so the cache has to start cold or a later test reuses an
  // earlier test's answer and never calls its own stub.
  resetAssistedOrderConfigCache();
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
    expect(container.textContent).toContain("Request intake is not available here yet");
    expect(container.querySelector('a[href="/research/support"]')?.textContent).toBe("Contact support");
    expect(container.querySelector('a[href="/support"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/early-access/unlock"))).toBe(false);
  });
  it.each(["off", "unknown"] as const)("never falls back to legacy checkout when mixed mode is %s", async (mixedMode) => {
    stubFetch({ bridgeEnabled: true, mixedMode });
    await renderStorefront(true);
    expect(container.textContent).toContain("The request form is currently unavailable");
    expect(container.querySelector('a[href="/research/support"]')?.textContent).toBe("Contact support");
    expect(container.querySelector('a[href="/support"]')).toBeNull();
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
    expect(container.querySelector('[data-testid="early-access-featured-catalog"]')).toBeNull();
    expect(container.querySelector('[data-testid="early-access-checkout-mount"]')).toBeNull();
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
  it("does not switch a malformed retained attempt into a new mixed or legacy request", async () => {
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, "malformed retained attempt");
    stubFetch({ bridgeEnabled: true, mixedMode: "on" });
    await renderStorefront(true);
    expect(container.textContent).toContain("Do not create a replacement until staff check for duplicates");
    expect(container.querySelector('a[href="/research/support"]')?.textContent).toBe("Contact support");
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe("malformed retained attempt");
  });
  it("holds a valid uncertain legacy attempt without mounting legacy checkout or deleting its marker", async () => {
    const marker = JSON.stringify({ idempotencyKey: "legacy-attempt", selections: [],
      acceptedAt: new Date().toISOString(), attemptState: "uncertain", step: "review" });
    window.sessionStorage.setItem(ASSISTED_ORDER_DRAFT_KEY, marker);
    stubFetch({ bridgeEnabled: true, mixedMode: "on" });
    await renderStorefront(true);
    expect(container.textContent).toContain("Do not create a replacement until staff check for duplicates");
    expect(container.querySelector('[data-testid="request-door-legacy"]')).toBeNull();
    expect(container.querySelector('[data-testid="request-door-mixed"]')).toBeNull();
    expect(window.sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBe(marker);
    expect(container.querySelector('a[href="/research/support"]')?.textContent).toBe("Contact support");
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
    expect(container.textContent).toContain("Request intake is not available here yet");
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
    expect(container.textContent).toContain("Open request and recovery");
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

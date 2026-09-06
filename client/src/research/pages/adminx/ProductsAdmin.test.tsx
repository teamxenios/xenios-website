// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminProductSummary } from "@shared/research/product-admin";
import type { AdminSessionState } from "./auth";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  sessionState: "ready" as AdminSessionState,
}));

// Preserve the real resource hook, admin boundary, table, debounce and adapter.
// Only identity discovery and the network are replaced by synthetic fixtures.
vi.mock("./auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth")>()),
  useAdminSession: () => ({
    state: mocks.sessionState,
    token: mocks.sessionState === "ready" ? "synthetic-admin-token" : null,
    email: null,
    signingIn: false,
    signInError: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import ProductsAdmin from "./ProductsAdmin";

const BASE = "/api/admin/research/products";
const RECONCILIATION = "/api/admin/research/products/revenue-launch/reconciliation";
const RECONCILIATION_SHA = "b".repeat(64);
let host: HTMLDivElement;
let root: Root;
let products: AdminProductSummary[];

function product(
  index: number,
  overrides: Partial<AdminProductSummary> = {},
): AdminProductSummary {
  return {
    id: `synthetic-product-${index}`,
    productCode: `TEST-${index}`,
    slug: `synthetic-product-${index}`,
    displayName: `Synthetic product ${index}`,
    canonicalName: `Synthetic product ${index}`,
    aliases: [],
    lane: "research_material",
    category: "Synthetic fixtures",
    classification: "research_material",
    status: "in_review",
    active: false,
    visibility: "hidden",
    availability: "temporarily_unavailable",
    commerceApproval: "blocked_pending_written_approval",
    qualityDocumentState: "missing",
    variantCount: 1,
    approvedVariantCount: 0,
    missingInputCount: 3,
    updatedAt: "2026-09-05T00:00:00Z",
    publishedAt: null,
    ...overrides,
  };
}

function response(status: number, payload: unknown = { ok: true, products }) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function availableReconciliationPayload() {
  return {
    status: "AVAILABLE",
    schemaVersion: 1,
    projectedAt: "2026-09-05T12:01:00.000Z",
    source: {
      sourceSetId: "seth-phase-a",
      packageSha256: RECONCILIATION_SHA,
      manifestSha256: RECONCILIATION_SHA,
      sourceFileSha256: RECONCILIATION_SHA,
      scope: "phase_a_exceptions",
    },
    coverage: { complete: true, expectedRows: 1, returnedRows: 1 },
    rows: [{
      sourceId: "source-1",
      launchItemId: "launch-1",
      sourcePointer: "/rows/0",
      sourceRowSha256: RECONCILIATION_SHA,
      productLabel: "Seth specimen",
      configurationLabel: "Source assumption — formulation requires confirmation.",
      issueKinds: ["formulation"],
      exactIdentity: null,
      proposedIdentity: null,
      facts: {
        identity_binding: { state: "UNKNOWN", reason: "missing_binding", observedAt: null, evidence: null },
        formulation: {
          state: "PENDING",
          reason: "review_requested",
          observedAt: "2026-09-05T12:00:00.000Z",
          evidence: {
            authority: "required_input",
            recordId: "review-1",
            recordRevision: "rev-1",
            observedAt: "2026-09-05T12:00:00.000Z",
            reviewedAt: null,
            reviewerLabel: null,
            expiresAt: null,
            href: null,
          },
        },
        unit_of_sale: {
          state: "CONFIRMED",
          reason: "verified_fact",
          observedAt: "2026-09-05T12:00:00.000Z",
          evidence: {
            authority: "required_input",
            recordId: "unit-1",
            recordRevision: "rev-1",
            observedAt: "2026-09-05T12:00:00.000Z",
            reviewedAt: "2026-09-05T12:00:00.000Z",
            reviewerLabel: "reviewer",
            expiresAt: null,
            href: null,
          },
        },
        supplier: { state: "UNKNOWN", reason: "no_current_evidence", observedAt: "2026-09-05T12:00:00.000Z", evidence: null },
      },
    }],
  };
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

function select(label: string): HTMLSelectElement {
  const found = Array.from(host.querySelectorAll("label")).find(
    (item) => item.querySelector("span")?.textContent === label,
  );
  const control = found?.querySelector("select");
  if (!control) throw new Error(`Missing labelled select: ${label}`);
  return control;
}

async function changeSelect(label: string, value: string) {
  await act(async () => {
    const control = select(label);
    control.value = value;
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeInput(control: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(text: string) {
  await act(async () => button(text).click());
}

async function renderPage() {
  await act(async () => root.render(<ProductsAdmin />));
}

function requests(): Array<[string, RequestInit]> {
  return mocks.fetch.mock.calls as Array<[string, RequestInit]>;
}

function expectReadsOnly() {
  expect(requests().length).toBeGreaterThan(0);
  for (const [url, init] of requests()) {
    expect(url.startsWith(BASE) || url === RECONCILIATION).toBe(true);
    expect(init).toEqual({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Authorization: "Bearer synthetic-admin-token" },
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockReset();
  mocks.sessionState = "ready";
  products = [product(1)];
  mocks.fetch.mockImplementation(async () => response(200));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Product Control server-backed review filters", () => {
  it.each([
    ["Product lane", "lane", "research_material"],
    ["Product lane", "lane", "supplement"],
    ["Product lane", "lane", "quantum"],
    ["Product lane", "lane", "future_clinical"],
    ["Product lane", "lane", "non_product_program"],
    ["Commerce review", "commerceApproval", "approved"],
    ["Commerce review", "commerceApproval", "blocked_pending_written_approval"],
    ["Commerce review", "commerceApproval", "blocked_by_lane"],
    ["Commerce review", "commerceApproval", "blocked_by_documentation"],
    ["Quality documents", "qualityDocumentState", "approved"],
    ["Quality documents", "qualityDocumentState", "pending"],
    ["Quality documents", "qualityDocumentState", "missing"],
    ["Quality documents", "qualityDocumentState", "expired"],
  ])(
    "sends %s=%s/%s through the existing authorized GET adapter",
    async (label, key, value) => {
      await renderPage();
      expect(requests()[0][0]).toBe(BASE);
      await changeSelect(label, value);
      expect(requests().at(-1)![0]).toBe(`${BASE}?${key}=${value}`);
      expect(select(label).value).toBe(value);
      expectReadsOnly();
    },
  );

  it("combines all filters, preserves search encoding, then explicitly clears all filters", async () => {
    await renderPage();
    expect(button("Clear filters").disabled).toBe(true);
    await changeInput(
      host.querySelector<HTMLInputElement>('input[type="search"]')!,
      "Exact & source",
    );
    await act(async () => vi.advanceTimersByTimeAsync(250));
    await changeSelect("Visibility", "members_only");
    await changeSelect("Product status", "in_review");
    await changeSelect("Product lane", "research_material");
    await changeSelect("Commerce review", "blocked_by_documentation");
    await changeSelect("Quality documents", "expired");
    await act(async () =>
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );

    expect(requests().at(-1)![0]).toBe(
      `${BASE}?q=Exact+%26+source&lane=research_material&visibility=members_only&status=in_review&commerceApproval=blocked_by_documentation&qualityDocumentState=expired&missingInputs=true`,
    );
    expect(button("Clear filters").disabled).toBe(false);
    await click("Clear filters");
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(requests().at(-1)![0]).toBe(BASE);
    expect(
      host.querySelector<HTMLInputElement>('input[type="search"]')!.value,
    ).toBe("");
    expect(
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked,
    ).toBe(false);
    for (const label of [
      "Visibility",
      "Product status",
      "Product lane",
      "Commerce review",
      "Quality documents",
    ]) {
      expect(select(label).value).toBe("");
    }
    expect(button("Clear filters").disabled).toBe(true);
    expectReadsOnly();
  });

  it.each([
    ["Visibility", "public"],
    ["Product status", "published"],
    ["Product lane", "future_clinical"],
    ["Commerce review", "approved"],
    ["Quality documents", "approved"],
  ])(
    "resets page two on %s change without client-side authority",
    async (label, value) => {
      products = Array.from({ length: 25 }, (_, index) => product(index + 1));
      await renderPage();
      await click("Next");
      expect(host.textContent).toContain("Page 2 of 2");
      expect(host.querySelector("tbody")!.textContent).toContain(
        "Synthetic product 21",
      );
      await changeSelect(label, value);
      expect(host.textContent).toContain("Page 1 of 2");
      // The synthetic server intentionally returns rows not matching the filter.
      // The browser displays the authorized response, not its own derived catalog.
      expect(host.querySelector("tbody")!.textContent).toContain(
        "Synthetic product 1",
      );
      expect(host.querySelector("tbody")!.textContent).not.toContain(
        "Synthetic product 21",
      );
      expectReadsOnly();
    },
  );

  it("resets pagination on search, missing-input selection and clear", async () => {
    products = Array.from({ length: 25 }, (_, index) => product(index + 1));
    await renderPage();
    await click("Next");
    await changeInput(
      host.querySelector<HTMLInputElement>('input[type="search"]')!,
      "Synthetic",
    );
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(host.textContent).toContain("Page 1 of 2");
    await click("Next");
    await act(async () =>
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    expect(host.textContent).toContain("Page 1 of 2");
    await click("Next");
    await click("Clear filters");
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(host.textContent).toContain("Page 1 of 2");
    expect(requests().at(-1)![0]).toBe(BASE);
    expectReadsOnly();
  });

  it("shows server review facts without equating approved or no missing inputs with purchasability", async () => {
    products = [
      product(1, {
        commerceApproval: "approved",
        qualityDocumentState: "approved",
        missingInputCount: 0,
      }),
    ];
    await renderPage();
    const table = host.querySelector("table")!;
    expect(table.textContent).toContain("Commerce: Approved");
    expect(table.textContent).toContain("Documents: Approved");
    expect(table.textContent).toContain("None reported");
    expect(table.textContent).not.toMatch(
      /buy now|in stock|ready to buy|complete/i,
    );
    expect(host.textContent).toContain("not direct-buy or stock confirmation");
    expectReadsOnly();
  });

  it("loads source reconciliation only when opened and keeps an unavailable projection explicit", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === RECONCILIATION) {
        return response(200, {
          status: "UNAVAILABLE",
          schemaVersion: 1,
          reason: "projection_unavailable",
        });
      }
      return response(200);
    });
    await renderPage();
    expect(requests().map(([url]) => url)).toEqual([BASE]);
    await click("Review source reconciliation");
    expect(requests().at(-1)![0]).toBe(RECONCILIATION);
    expect(host.textContent).toContain("Source reconciliation is unavailable.");
    expect(host.textContent).toContain("Nothing here approves, activates, publishes");
    expectReadsOnly();
  });

  it("renders available mapping and formulation facts without exposing an approval action", async () => {
    mocks.fetch.mockImplementation(async (url: string) =>
      url === RECONCILIATION ? response(200, availableReconciliationPayload()) : response(200));
    await renderPage();
    await click("Review source reconciliation");
    expect(host.textContent).toContain("Seth specimen");
    expect(host.textContent).toContain("Pending");
    expect(host.textContent).toContain("Unknown");
    expect(host.textContent).toContain("do not approve a price");
    const buttonText = Array.from(host.querySelectorAll("button"), (button) => button.textContent ?? "").join(" ");
    expect(buttonText).not.toMatch(/Approve|Activate|Buy now/i);
    expectReadsOnly();
  });

  it("keeps empty results truthful", async () => {
    products = [];
    await renderPage();
    await changeSelect("Quality documents", "expired");
    expect(host.textContent).toContain("No products match these filters.");
    expect(host.querySelector("table")).toBeNull();
    expect(host.querySelector('[aria-label="Pagination"]')).toBeNull();
    expectReadsOnly();
  });

  it.each([
    [401, {}, "Your admin session has ended."],
    [403, {}, "Access denied."],
    [
      403,
      { code: "forbidden", message: "Review permission denied." },
      "You do not have access to this.",
    ],
    [404, {}, "Product administration is not connected."],
    [501, {}, "Product administration is not connected."],
    [503, {}, "Product administration is not connected."],
    [
      500,
      { message: "Synthetic service failure." },
      "Synthetic service failure.",
    ],
  ])(
    "hides previously loaded rows after a %s filtered response",
    async (status, payload, message) => {
      await renderPage();
      expect(host.querySelector("table")).not.toBeNull();
      mocks.fetch.mockImplementation(async () => response(status, payload));
      await changeSelect("Commerce review", "approved");
      expect(host.textContent).toContain(message);
      expect(host.querySelector("table")).toBeNull();
      expect(host.textContent).not.toContain("Synthetic product 1");
      expectReadsOnly();
    },
  );

  it("does not restore stale rows when an older filter response arrives after denial", async () => {
    await renderPage();
    let resolveOld!: (value: Response) => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveOld = resolve;
        }),
    );
    await changeSelect("Product lane", "supplement");
    mocks.fetch.mockImplementationOnce(async () => response(403, {}));
    await changeSelect("Product lane", "future_clinical");
    await act(async () => resolveOld(response(200)));
    expect(host.textContent).toContain("Access denied.");
    expect(host.querySelector("table")).toBeNull();
    expectReadsOnly();
  });

  it("treats an HTML catch-all as unavailable rather than a successful empty catalog", async () => {
    await renderPage();
    mocks.fetch.mockImplementation(
      async () =>
        new Response("<html>App shell</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    );
    await changeSelect("Quality documents", "missing");
    expect(host.textContent).toContain(
      "Product administration is not connected.",
    );
    expect(host.querySelector("table")).toBeNull();
    expect(host.textContent).not.toContain("No products match these filters.");
    expectReadsOnly();
  });

  it("hides previous rows on a network failure and retries the exact selected GET", async () => {
    await renderPage();
    mocks.fetch.mockRejectedValueOnce(new Error("Synthetic network failure"));
    await changeSelect("Product lane", "supplement");
    expect(host.textContent).toContain(
      "The connection failed. Please try again.",
    );
    expect(host.querySelector("table")).toBeNull();
    await click("Try again");
    expect(requests().at(-1)![0]).toBe(`${BASE}?lane=supplement`);
    expect(host.querySelector("table")).not.toBeNull();
    expectReadsOnly();
  });

  it.each(["signed_out", "unconfigured"] as const)(
    "makes no product reads or mutations while identity is %s",
    async (state) => {
      mocks.sessionState = state;
      await renderPage();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(host.querySelector('[aria-label="Filters"]')).toBeNull();
      expect(host.querySelector("table")).toBeNull();
    },
  );

  it("preserves explicit draft creation without turning review filters into mutation fields", async () => {
    await renderPage();
    await changeSelect("Commerce review", "approved");
    await click("Create product");
    expect(button("Create draft").disabled).toBe(true);
    expectReadsOnly();

    const fields = {
      productCode: "SYNTHETIC-NEW",
      slug: "synthetic-new",
      displayName: "Synthetic new product",
      canonicalName: "Synthetic new product",
      category: "Synthetic fixtures",
      classification: "research_material",
    };
    for (const [name, value] of Object.entries(fields)) {
      await changeInput(
        host.querySelector<HTMLInputElement>(`#product-create-${name}`)!,
        value,
      );
    }
    mocks.fetch.mockImplementationOnce(async () =>
      response(200, { ok: true, product: product(100) }),
    );
    await click("Create draft");
    const mutations = requests().filter(([, init]) => init.method !== "GET");
    expect(mutations).toHaveLength(1);
    const [url, init] = mutations[0];
    expect(url).toBe(BASE);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer synthetic-admin-token",
      "Content-Type": "application/json",
      "Idempotency-Key": expect.stringMatching(/^create-product:/),
    });
    expect(JSON.parse(init.body as string)).toEqual({
      ...fields,
      lane: "research_material",
      aliases: [],
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(requests().at(-1)![0]).toBe(`${BASE}?commerceApproval=approved`);
    expect(requests().at(-1)![1].method).toBe("GET");
  });
});

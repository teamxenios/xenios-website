// @vitest-environment jsdom
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminProductDetail, AdminProductPrice } from "@shared/research/product-admin";
import { ProductPriceReviewPanel, readDraftAmountCents, readDraftEffectiveAt } from "./ProductPriceReviewPanel";

vi.mock("./AdminResearchHome", async (importOriginal) => ({
  ...await importOriginal<typeof import("./AdminResearchHome")>(),
  AdminScreen: ({ children }: { children: (token: string) => ReactNode }) => children("synthetic-admin-token"),
}));
vi.mock("wouter", async (importOriginal) => ({
  ...await importOriginal<typeof import("wouter")>(),
  useParams: () => ({ id: "product-alpha" }),
}));

import ProductAdminDetail, { PricePanel } from "./ProductAdminDetail";

const timestamp = "2026-09-05T00:00:00.000Z";
function productFixture(priceChanges: Partial<AdminProductPrice> = {}): AdminProductDetail {
  return {
    id: "product-alpha", productCode: "QA-ALPHA", slug: "qa-alpha",
    displayName: "Synthetic Alpha", canonicalName: "Canonical Synthetic Alpha", aliases: [],
    lane: "research_material", category: "synthetic", classification: "RUO", status: "draft", active: false,
    visibility: "hidden", availability: "coming_soon", commerceApproval: "blocked_pending_written_approval",
    qualityDocumentState: "missing", variantCount: 1, approvedVariantCount: 0, missingInputCount: 1,
    updatedAt: timestamp, publishedAt: null,
    content: {
      shortDescription: null, longDescription: null, overview: null, specifications: null,
      researchInformation: null, storageInformation: null, handlingInformation: null,
      shippingInformation: null, returnInformation: null, disclaimers: null, citations: [], reviewDate: null,
    },
    variants: [{
      id: "variant-alpha", productId: "product-alpha", sku: "QA-ALPHA-5MG", catalogNumber: null,
      label: "5 mg vial", strength: "5 mg", size: null, format: null, presentation: null,
      shippingClass: null, memberEligible: false, status: "draft", active: false, sortOrder: 0,
      createdAt: timestamp, updatedAt: timestamp,
    }],
    prices: [{
      id: "price-alpha-v3", productId: "product-alpha", variantId: "variant-alpha", audience: "member",
      amountCents: 2501, quantityTiers: [
        { minimumQuantity: 1, amountCents: 2501 },
        { minimumQuantity: 10, amountCents: 2250 },
        { minimumQuantity: 100, amountCents: 1999 },
      ], currency: "USD", effectiveAt: timestamp, expiresAt: "2026-10-05T00:00:00.000Z",
      status: "active", approvalNote: "Synthetic review only.\nNo purchase permission.", version: 3,
      createdBy: "synthetic-admin", approvedBy: null, createdAt: timestamp, updatedAt: timestamp,
      ...priceChanges,
    }],
    media: [], history: [],
  };
}

let host: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(children: ReactNode) {
  await act(async () => { root.render(children); });
}
async function input(id: string, value: string) {
  const element = host.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function saveButton() {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) => /Save draft price|Saving/.test(button.textContent ?? ""))!;
}
async function click(button: HTMLButtonElement) {
  await act(async () => { button.click(); });
}
function facts() {
  return Array.from(host.querySelectorAll("dl > div")).map((row) => [row.querySelector("dt")?.textContent, row.querySelector("dd")?.textContent]);
}

describe("canonical read-only price presentation", () => {
  it("shows exact identity, stored status, audience, cents, windows, note and every tier without network or actions", async () => {
    await render(<StrictMode><ProductPriceReviewPanel product={productFixture()} /></StrictMode>);
    expect(facts()).toEqual(expect.arrayContaining([
      ["Product ID", "product-alpha"], ["Product code", "QA-ALPHA"],
      ["Price ID", "price-alpha-v3"], ["Price version", "3"],
      ["Recorded variant ID", "variant-alpha"], ["Exact SKU", "QA-ALPHA-5MG"],
      ["Audience", "member"], ["Stored status", "active"], ["Currency", "USD"],
      ["Base amount (integer cents)", "2501"],
      ["Approval note", "Synthetic review only.\nNo purchase permission."],
      ["Effective from", `${timestamp} (UTC)`],
      ["Expires at", "2026-10-05T00:00:00.000Z (UTC)"],
    ]));
    const tiers = Array.from(host.querySelectorAll('ol[aria-label="Canonical quantity tiers"] li')).map((row) => row.textContent);
    expect(tiers).toEqual([
      "Minimum quantity: 1Unit amount: USD 25.01 (2501 cents)",
      "Minimum quantity: 10Unit amount: USD 22.50 (2250 cents)",
      "Minimum quantity: 100Unit amount: USD 19.99 (1999 cents)",
    ]);
    expect(host.textContent).toContain("not purchase authority");
    expect(host.querySelector("button, a, input, select")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([undefined, []])("shows the canonical scalar fallback only when tiers are absent or empty (%s)", async (quantityTiers) => {
    await render(<ProductPriceReviewPanel product={productFixture({ quantityTiers, expiresAt: null, approvalNote: null })} />);
    expect(host.textContent).toContain("Scalar price; no quantity breaks recorded.");
    expect(host.querySelectorAll("ol li")).toHaveLength(1);
    expect(facts()).toContainEqual(["Expires at", "No expiry recorded"]);
    expect(facts()).toContainEqual(["Approval note", "Not recorded"]);
  });

  it.each([
    null, {}, "tiers", [{ minimumQuantity: 10, amountCents: 2501 }],
    [{ minimumQuantity: 1, amountCents: 2500 }],
    [{ minimumQuantity: 1, amountCents: 2501 }, { minimumQuantity: 10, amountCents: 2600 }],
    [{ minimumQuantity: 1, amountCents: 2501 }, { minimumQuantity: 1, amountCents: 2000 }],
    [{ minimumQuantity: 1, amountCents: 2501, extra: true }],
    [{ minimumQuantity: 1, amountCents: 2501 }, null],
  ])("refuses malformed tiers without inventing a scalar fallback (%j)", async (quantityTiers) => {
    await render(<ProductPriceReviewPanel product={productFixture({ quantityTiers: quantityTiers as AdminProductPrice["quantityTiers"] })} />);
    expect(host.textContent).toContain("Quantity-tier review unavailable — malformed canonical price data");
    expect(host.querySelector("ol")).toBeNull();
    expect(host.textContent).not.toContain("Scalar price;");
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN])("refuses invalid base cents (%s)", async (amountCents) => {
    await render(<ProductPriceReviewPanel product={productFixture({ amountCents })} />);
    expect(facts()).toContainEqual(["Base amount (integer cents)", "Unavailable — invalid amount"]);
    expect(host.querySelector("ol")).toBeNull();
  });

  it("preserves the final cent at the exact integer limit without floating-point formatting", async () => {
    await render(<ProductPriceReviewPanel product={productFixture({ amountCents: Number.MAX_SAFE_INTEGER, quantityTiers: undefined })} />);
    expect(host.textContent).toContain("USD 90071992547409.91 (9007199254740991 cents)");
  });

  it.each(["bad code", "usd", "", "<script>"])("does not crash or quote malformed currency (%s)", async (currency) => {
    await render(<ProductPriceReviewPanel product={productFixture({ currency })} />);
    expect(facts()).toContainEqual(["Currency", "Unavailable — invalid currency code"]);
    expect(host.querySelector("ol")).toBeNull();
  });

  it.each(["missing", "other-product", "duplicate", "wrong-variant-product"])("does not guess variant identity (%s)", async (kind) => {
    const product = productFixture();
    if (kind === "missing") product.prices[0].variantId = "missing";
    if (kind === "other-product") product.prices[0].productId = "other-product";
    if (kind === "duplicate") product.variants.push({ ...product.variants[0] });
    if (kind === "wrong-variant-product") product.variants[0].productId = "other-product";
    await render(<ProductPriceReviewPanel product={product} />);
    expect(host.textContent).toContain("Variant identity unavailable");
    expect(host.querySelector("ol")).toBeNull();
  });

  it("shows honest empty prices and never infers readiness", async () => {
    await render(<ProductPriceReviewPanel product={{ ...productFixture(), prices: [] }} />);
    expect(host.textContent).toContain("No prices entered. No approved price or purchase availability is inferred.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks invalid or reversed dates and invalid version unavailable without crashing", async () => {
    await render(<ProductPriceReviewPanel product={productFixture({ effectiveAt: "2026-02-30T00:00:00Z", expiresAt: "invalid", version: 0 })} />);
    expect(facts()).toContainEqual(["Effective from", "Unavailable — invalid recorded timestamp"]);
    expect(facts()).toContainEqual(["Expires at", "Unavailable — invalid recorded timestamp"]);
    expect(facts()).toContainEqual(["Price version", "Unavailable — invalid version"]);
    await render(<ProductPriceReviewPanel product={productFixture({ expiresAt: "2026-09-04T00:00:00Z" })} />);
    expect(host.textContent).toContain("expiry does not follow the effective time");
  });

  it("uses labelled sections and wrapping facts without a fixed-width table", async () => {
    const product = productFixture();
    product.variants[0].sku = "SYNTHETIC-LONG-".repeat(20);
    product.prices[0].approvalNote = "<script>synthetic only</script>";
    await render(<ProductPriceReviewPanel product={product} />);
    for (const section of host.querySelectorAll("section, article")) {
      expect(host.querySelector(`[id="${section.getAttribute("aria-labelledby")}"]`)).not.toBeNull();
    }
    expect(host.querySelector("table, script")).toBeNull();
    expect(host.textContent).toContain(product.variants[0].sku);
    expect(Array.from(host.querySelectorAll("dd")).every((row) => row.style.overflowWrap === "anywhere")).toBe(true);
  });
});

describe("existing price mutations and guarded draft form", () => {
  const onSaved = vi.fn();
  beforeEach(() => onSaved.mockClear());

  it("renders the integrated panel without writes, then sends only the existing scalar draft contract on explicit save", async () => {
    await render(<PricePanel token="synthetic-admin-token" product={productFixture()} onSaved={onSaved} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveButton().disabled).toBe(true);
    await input("price-amount", "25.01");
    await input("price-effective", "2026-09-05");
    await click(saveButton());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/research/products/product-alpha/prices");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer synthetic-admin-token");
    expect(init.headers["Idempotency-Key"]).toMatch(/^create-price:/);
    expect(JSON.parse(init.body)).toEqual({ variantId: "variant-alpha", audience: "retail", amountCents: 2501, currency: "USD", effectiveAt: timestamp });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(saveButton().disabled).toBe(true);
  });

  it.each(["", " ", "0", "0.00", "-1", "1.001", "1e2", "Infinity", "90071992547409.92"])("does not save invalid amount %j", async (amount) => {
    await render(<PricePanel token="synthetic-admin-token" product={productFixture()} onSaved={onSaved} />);
    await input("price-amount", amount);
    expect(saveButton().disabled).toBe(true);
    await click(saveButton());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty/invalid effective date and recovers after correction", async () => {
    await render(<PricePanel token="synthetic-admin-token" product={productFixture()} onSaved={onSaved} />);
    await input("price-amount", "1.01");
    await input("price-effective", "");
    expect(saveButton().disabled).toBe(true);
    await click(saveButton());
    await input("price-effective", "2026-02-30");
    expect(saveButton().disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    await input("price-effective", "2028-02-29");
    expect(saveButton().disabled).toBe(false);
    await click(saveButton());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).effectiveAt).toBe("2028-02-29T00:00:00.000Z");
  });

  it("requires an exact current-product variant before saving", async () => {
    const product = productFixture();
    product.variants[0].productId = "other-product";
    await render(<PricePanel token="synthetic-admin-token" product={product} onSaved={onSaved} />);
    await input("price-amount", "1");
    expect(saveButton().disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves the existing explicit draft approval endpoint and does not approve active records", async () => {
    await render(<PricePanel token="synthetic-admin-token" product={productFixture({ status: "draft" })} onSaved={onSaved} />);
    expect(fetchMock).not.toHaveBeenCalled();
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Approve draft price price-alpha-v3"]')!;
    await click(button);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/research/products/product-alpha/prices/price-alpha-v3/approve");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toMatch(/^approve-price:/);
    expect(JSON.parse(init.body)).toEqual({});
    expect(onSaved).toHaveBeenCalledOnce();
    await render(<PricePanel token="synthetic-admin-token" product={productFixture()} onSaved={onSaved} />);
    expect(host.querySelector('button[aria-label^="Approve draft price"]')).toBeNull();
  });

  it.each([403, 503])("shows server refusal (%s) without reporting a save or changing price records", async (status) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, code: "forbidden", message: "Synthetic policy refusal" }), { status }));
    await render(<PricePanel token="synthetic-admin-token" product={productFixture()} onSaved={onSaved} />);
    await input("price-amount", "1");
    await click(saveButton());
    expect(onSaved).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).toContain("price-alpha-v3");
    expect(saveButton().disabled).toBe(false);
  });

  it("keeps an approval refusal visible outside the collapsed draft form", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, code: "forbidden", message: "Synthetic policy refusal" }), { status: 403 }));
    await render(<PricePanel token="synthetic-admin-token" product={productFixture({ status: "draft" })} onSaved={onSaved} />);
    await click(host.querySelector<HTMLButtonElement>('button[aria-label^="Approve draft price"]')!);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Synthetic policy refusal");
    expect(host.querySelector('[role="alert"]')?.closest("details")).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("has an honest no-variant draft state", async () => {
    await render(<PricePanel token="synthetic-admin-token" product={{ ...productFixture(), variants: [], prices: [] }} onSaved={onSaved} />);
    expect(host.textContent).toContain("Create a variant first.");
    expect(host.querySelector("input, select")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("real product page read boundary", () => {
  it("mounts the canonical review on an authorized successful product read without writes", async () => {
    fetchMock.mockImplementation(async (url: string) => new Response(JSON.stringify(
      url.includes("/products/") ? { ok: true, product: productFixture() } : { ok: true, items: [] },
    ), { status: 200, headers: { "Content-Type": "application/json" } }));
    await render(<ProductAdminDetail />);
    expect(host.textContent).toContain("Pricing and history");
    expect(host.textContent).toContain("price-alpha-v3");
    expect(host.querySelectorAll('ol[aria-label="Canonical quantity tiers"] li')).toHaveLength(3);
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });

  it.each([401, 403, 503])("does not expose price data or mutation controls when product read is refused (%s)", async (status) => {
    fetchMock.mockImplementation(async (url: string) => new Response(JSON.stringify(
      url.includes("/products/") ? { ok: false, code: "forbidden", product: productFixture() } : { ok: true, inputs: [] },
    ), { status: url.includes("/products/") ? status : 200 }));
    await render(<ProductAdminDetail />);
    expect(host.textContent).not.toContain("price-alpha-v3");
    expect(host.textContent).not.toContain("Pricing and history");
    expect(host.querySelector("input, select")).toBeNull();
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
    expect(host.textContent).toMatch(/session has ended|do not have access|not connected/i);
  });
});

describe("exact draft validators", () => {
  it.each([["0.01", 1], ["12.3", 1230], ["90071992547409.91", Number.MAX_SAFE_INTEGER]])("parses %s without rounding", (value, expected) => {
    expect(readDraftAmountCents(String(value))).toBe(expected);
  });
  it.each(["", "2026-02-30", "2026-13-01", "2026-9-05", "2026-09-05T00:00:00Z", "not-a-date"])("rejects invalid date %j without throwing", (value) => {
    expect(readDraftEffectiveAt(value)).toBeNull();
  });
});

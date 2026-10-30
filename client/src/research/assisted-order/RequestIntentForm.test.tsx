// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair } from "../../../../shared/research/assisted-order/form";
import type { RequestIntentCatalogItem, RequestIntentInput } from "../../../../shared/research/assisted-order/request-intent";
import { RequestIntentHttpError, type RequestIntentApi } from "./request-intent-api";
import { REQUEST_INTENT_ATTEMPT_KEY } from "./request-intent-attempt";
import { RequestIntentForm } from "./RequestIntentForm";
import { RequestIntentStaffReadback } from "./RequestIntentStaffReadback";
import { RequestIntentService, type CreateIntent, type StoredIntent } from "../../../../server/research/assisted-order/request-intent/service";
import { sha256AssistedOrderHasher } from "../../../../server/research/assisted-order/defaults";
import type { AssistedOrderViewer } from "../../../../server/research/assisted-order/ports";
vi.mock("./assisted-order.css", () => ({ default: {} }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reference = "XRI-30000000000040008000000000000001";
const receipt = { kind: "unapproved_selection_request" as const, requestId: "30000000-0000-4000-8000-000000000001",
  publicReference: reference, status: "pending_review" as const, createdAt: "2026-10-14T12:00:00.000Z" };
function item(id: string, clinical: boolean): RequestIntentCatalogItem {
  return {
    productId: id, variantId: id + "-variant", productName: "Synthetic " + id, family: clinical ? "clinical_formulations_503a" : "research_peptides_materials",
    channel: "synthetic", specification: "Synthetic variant", format: null, packBasis: null, minimumQuantity: 1, maximumQuantity: 100, quantityIncrement: 1,
    unitPriceCents: null, currency: "USD", workflowMode: clinical ? "provider_request" : "request_pricing",
    actionLabel: "Add to request", accessNotice: null, researchUseOnly: !clinical, catalogVersion: "synthetic", priceVersion: null,
    sourceSelection: { family: "synthetic", slug: id, variantId: id + "-source" },
    selectableForReview: true, intentExclusion: null, clinicalReviewRequired: clinical,
    sourceDisplayState: clinical ? "care_pathway" : "request_access", sourceVariantDisplayState: clinical ? "care_pathway" : "request_access", sourceRefusal: null,
  };
}
function makeApi() {
  return {
    config: vi.fn(async () => ({ legal: [{ kind: "fixture-terms", version: "fixture-v1", label: "Synthetic legal requirement" }],
      form: ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((ack) => ({ id: ack.id, scope: ack.scope, copy: ack.copy, ...assistedOrderFormPair(ack) })) })),
    catalog: vi.fn(async () => ({ items: [item("clinical", true), item("research", false)],
      total: 2, page: 1, pageSize: 24, families: ["clinical_formulations_503a", "research_peptides_materials"], channels: [], workflowModes: [] })),
    submit: vi.fn(async (_input: RequestIntentInput): Promise<unknown> => receipt),
    recover: vi.fn(async (_key: string) => receipt),
    staff: vi.fn(),
    staffQueue: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 25 })),
  } satisfies RequestIntentApi;
}

function makeRoundTrip() {
  const base = makeApi(), rows = new Map<string, CreateIntent>();
  const viewer: AssistedOrderViewer = { actorType: "member", memberId: "synthetic-member",
    authUserId: "20000000-0000-4000-8000-000000000001", normalizedEmail: null,
    earlyAccessSessionHash: null, capabilities: new Set(["assisted_orders:submit"]) };
  const saved = (record: CreateIntent): StoredIntent => ({
    receipt: { kind: record.detail.kind, requestId: record.detail.requestId, publicReference: record.detail.publicReference,
      status: record.detail.status, createdAt: record.detail.createdAt }, fingerprint: record.fingerprint,
  });
  const service = new RequestIntentService({
    catalog: { list: async () => base.catalog(), resolveMany: async (_viewer, identities) =>
      identities.map((identity) => [item("clinical", true), item("research", false)]
        .find((row) => row.productId === identity.productId && row.variantId === identity.variantId) ?? null) },
    repository: {
      findAttempt: async (owner, attempt) => { const record = rows.get(owner + ":" + attempt); return record ? saved(record) : null; },
      createOrReplay: async (record) => {
        const key = record.ownerHash + ":" + record.attemptHash;
        if (!rows.has(key)) rows.set(key, record);
        return saved(rows.get(key)!);
      },
    },
    standing: { accepted: async () => true },
    legal: { requiredAgreements: async () => [{ kind: "fixture-terms", version: "fixture-v1" }] },
    hasher: sha256AssistedOrderHasher,
    ids: { uuid: () => receipt.requestId, publicReference: () => "unused", opaqueToken: () => "unused" },
    clock: { now: () => new Date() },
  });
  const api: RequestIntentApi = {
    ...base, submit: (input) => service.submit(viewer, input), recover: (key) => service.recover(viewer, key),
    staff: async (id) => {
      const result = await service.staffRead({ subjectId: "synthetic-clinical-admin", roles: ["clinical_admin"] },
        { purpose: "request_intent_pending_read", actorSubjectId: "synthetic-clinical-admin", enabled: true },
        { get: async (requestId) => [...rows.values()].find((row) => row.detail.requestId === requestId)?.detail ?? null, list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) }, id);
      if (!result) throw new Error("Not found");
      return result;
    },
  };
  return { api, rows };
}

let host: HTMLDivElement, root: Root;
beforeEach(() => { sessionStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); sessionStorage.clear(); });
async function render(api: RequestIntentApi) { await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} />)); }
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((entry) => entry.textContent === text);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function prepare(api: RequestIntentApi) {
  await render(api);
  await click("Add Synthetic clinical to request");
  await click("Add Synthetic research to request");
  const quantity = [...host.querySelectorAll("input[type=number]")][0] as HTMLInputElement;
  await type(quantity, "2");
  await click("Continue to contact");
  for (const [name, value] of Object.entries({
    name: "Synthetic Customer", email: "synthetic@example.invalid", phone: "+15555550123",
    shippingLine1: "1 Synthetic Street", shippingCity: "Test", shippingRegion: "TX", shippingPostalCode: "00000", shippingCountryCode: "US",
  })) await type(host.querySelector('input[name="' + name + '"]')!, value);
  await act(async () => (host.querySelector('input[name="age"]') as HTMLInputElement).click());
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => host.querySelectorAll<HTMLInputElement>("fieldset input[type=checkbox]").forEach((entry) => entry.click()));
}
describe("mixed private request customer form source", () => {
  it("round-trips the form through the real intent service to one memory repository and authorized staff readback", async () => {
    const { api, rows } = makeRoundTrip();
    await prepare(api); await click("Submit for review");
    expect(rows.size).toBe(1);
    expect(host.textContent).toContain(reference);
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/research/support");
    const detail = await api.staff(receipt.requestId);
    expect(detail.lines.map((line) => [line.productId, line.quantity, line.reviewState]))
      .toEqual([["clinical", 2, "pending"], ["research", 1, "pending"]]);
    // Real component/service contract, synthetic identities/repository. Not HTTP, SQL or live authorization proof.
  });
  it("submits both exact identities and quantities only after review, with explicit acknowledgment facts", async () => {
    const api = makeApi();
    await prepare(api);
    expect(host.querySelector('a[href="/research/support"]')?.textContent).toBe("Contact support");
    expect(host.querySelector('a[href="/support"]')).toBeNull();
    expect(api.submit).not.toHaveBeenCalled();
    await click("Submit for review");
    expect(api.submit).toHaveBeenCalledTimes(1);
    const payload = api.submit.mock.calls[0][0];
    expect(payload.lines).toEqual([
      { productId: "clinical", variantId: "clinical-variant", quantity: 2 },
      { productId: "research", variantId: "research-variant", quantity: 1 },
    ]);
    expect(payload.agreements.every((entry) => entry.accepted === true)).toBe(true);
    expect(host.textContent).toContain(reference);
    expect(host.textContent).toContain("Each item is pending review");
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    expect(payload).not.toHaveProperty("paymentVerificationId");
    expect(payload).not.toHaveProperty("medicalHistory");
  });
  it("marks before POST and retries a lost response using identical payload, key and acceptance timestamp", async () => {
    const api = makeApi();
    api.submit.mockImplementationOnce(async (payload) => {
      const marker = JSON.parse(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)!);
      expect(marker.key).toBe(payload.idempotencyKey);
      expect(marker.state).toBe("in_flight");
      expect(payload.agreements.every((entry) => entry.acceptedAt === marker.acceptedAt)).toBe(true);
      throw new Error("synthetic lost response");
    });
    await prepare(api);
    await click("Submit for review");
    expect(host.textContent).not.toContain(reference);
    const first = api.submit.mock.calls[0][0];
    await click("Retry same request");
    expect(api.submit.mock.calls[1][0]).toEqual(first);
    expect(host.textContent).toContain(reference);
  });
  it("refresh restores only the same attempt and recovers its real saved reference, without storing clinical selections", async () => {
    const api = makeApi();
    api.submit.mockRejectedValueOnce(new Error("synthetic lost response"));
    await prepare(api); await click("Submit for review");
    const marker = sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)!;
    expect(marker).not.toContain("clinical");
    expect(marker).not.toContain("synthetic@example");
    expect(Object.keys(JSON.parse(marker)).sort()).toEqual(["acceptedAt", "key", "state"]);
    await act(async () => root.unmount());
    root = createRoot(host);
    await render(api);
    expect(host.textContent).toContain("Check your earlier request");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/research/support");
    expect(host.querySelector('a[href="/support"]')).toBeNull();
    await click("Check saved request");
    expect(api.recover).toHaveBeenCalledWith(JSON.parse(marker).key);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain(reference);
  });
  it("malformed successful body never becomes a saved confirmation or a replacement key", async () => {
    const api = makeApi(); api.submit.mockResolvedValueOnce("<html>");
    await prepare(api); await click("Submit for review");
    expect(host.textContent).not.toContain(reference);
    expect(host.textContent).toContain("could not confirm");
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).not.toBeNull();
  });
  it("private staff display retrieves all pending lines without commercial controls", async () => {
    const api = makeApi();
    api.staff.mockResolvedValue({ ...receipt, contact: { fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid", mobilePhone: "+15555550123" },
      agreements: [], lines: [item("clinical", true), item("research", false)].map((row) => ({
        ...row, quantity: 2, reviewState: "pending", sourceVariantId: row.sourceSelection!.variantId,
        sourceRefusal: row.clinicalReviewRequired ? "provider_pathway_family" : "classification_pending",
      })) });
    await act(async () => root.render(<RequestIntentStaffReadback api={api} />));
    await type(host.querySelector("input")!, reference);
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(api.staff).toHaveBeenCalledWith(receipt.requestId);
    expect(host.textContent).toContain("Synthetic clinical");
    expect(host.textContent).toContain("Synthetic research");
    expect(host.textContent).toContain("Pending clinical review");
    expect(host.textContent).toContain("Pending internal review");
    expect(host.textContent).toContain("Source restriction: provider_pathway_family");
    expect(host.textContent).toContain("Source restriction: classification_pending");
    expect([...host.querySelectorAll("button")].some((button) => /approve|paid|fulfill/i.test(button.textContent ?? ""))).toBe(false);
  });
});

describe("customer restriction copy", () => {
  it.each([
    ["provider_pathway_family", "Provider review is required before any purchase."],
    ["care_pathway_display_state", "Provider review is required before any purchase."],
    ["family_outside_launch_scope", "This item is not offered for direct purchase."],
    ["classification_pending", "Product classification must be confirmed before purchase."],
    ["formulation_hold", "This formulation is on hold pending review."],
    ["non_merchandise_family", "This shipping or service entry is not a product request."],
  ])("explains %s without changing the server's review permission", async (code, copy) => {
    const api = makeApi();
    const clinical = code === "provider_pathway_family" || code === "care_pathway_display_state";
    const nonMerchandise = code === "non_merchandise_family";
    const entry = Object.freeze({
      ...item("restricted", clinical), sourceRefusal: code,
      selectableForReview: !nonMerchandise,
      intentExclusion: nonMerchandise ? "non_merchandise" as const : null,
      unitPriceCents: clinical || nonMerchandise ? null : 12345,
      priceVersion: clinical || nonMerchandise ? null : "synthetic-price",
    });
    const before = JSON.stringify(entry);
    api.catalog.mockResolvedValue({ items: [entry], total: 1, page: 1, pageSize: 24,
      families: [], channels: [], workflowModes: [] });
    await render(api);
    const card = host.querySelector("article")!;
    expect(card.textContent).toContain("Current restriction: " + copy);
    expect(card.textContent).toContain("Adding a request does not remove this restriction.");
    expect(card.textContent).not.toContain(code);
    expect(card.textContent).not.toContain(code.replaceAll("_", " "));
    if (clinical) {
      expect(card.textContent).toContain("Clinical review required. Not a prescription.");
      expect(card.textContent).toContain("Final price follows applicable review.");
    } else if (!nonMerchandise) {
      expect(card.textContent).toContain("$123.45 (catalog display, not a final quote)");
    }
    if (nonMerchandise) {
      expect(card.querySelector("button")).toBeNull();
      expect(card.textContent).toContain("Shipping or service entry, not a product request");
    } else {
      expect(card.querySelector("button")?.disabled).toBe(false);
      await click("Add Synthetic restricted to request");
      expect(host.querySelector('[aria-label="Selected request items"]')?.textContent)
        .toContain("1 exact variants | 1 requested units");
    }
    expect(JSON.stringify(entry)).toBe(before);
    expect(api.submit).not.toHaveBeenCalled();
  });

  it.each(["future_reason", "constructor", "__proto__"])(
    "keeps unknown reason %s distinct from an unavailable item", async (code) => {
      const api = makeApi();
      const entry = Object.freeze({ ...item("unknown", false), sourceRefusal: code });
      api.catalog.mockResolvedValue({ items: [entry], total: 1, page: 1, pageSize: 24,
        families: [], channels: [], workflowModes: [] });
      await render(api);
      const card = host.querySelector("article")!;
      expect(card.textContent).toContain("A purchase restriction applies. Its details need to be confirmed.");
      expect(card.textContent).not.toContain(code);
      expect(card.textContent).not.toMatch(/unavailable|out of stock|coming soon/i);
      expect(card.querySelector("button")?.disabled).toBe(false);
      expect(entry.sourceRefusal).toBe(code);
      expect(entry.selectableForReview).toBe(true);
      expect(api.submit).not.toHaveBeenCalled();
    },
  );

  it("keeps a coming-soon exclusion closed even when its reason is unknown", async () => {
    const api = makeApi();
    const entry = { ...item("future", false), sourceRefusal: "future_reason",
      selectableForReview: false, intentExclusion: "coming_soon" as const,
      sourceDisplayState: "coming_soon", sourceVariantDisplayState: "coming_soon" };
    api.catalog.mockResolvedValue({ items: [entry], total: 1, page: 1, pageSize: 24,
      families: [], channels: [], workflowModes: [] });
    await render(api);
    const card = host.querySelector("article")!;
    expect(card.textContent).toContain("Coming soon");
    expect(card.textContent).not.toContain("future_reason");
    expect(card.querySelector("button")).toBeNull();
    expect(api.submit).not.toHaveBeenCalled();
  });

  it("does not invent a restriction when the server returns none", async () => {
    await render(makeApi());
    expect(host.querySelector(".xenios-order-cards")?.textContent).not.toContain("Current restriction:");
  });
});

describe("mixed request mounted-entry contracts", () => {
  it("preserves the surrounding agreement focus on mount and focuses only a later step transition", async () => {
    const agreement = document.createElement("input");
    agreement.type = "checkbox";
    agreement.setAttribute("aria-label", "Surrounding agreement");
    document.body.insertBefore(agreement, host);
    try {
      agreement.focus();
      const api = makeApi();
      await render(api);
      expect(document.activeElement).toBe(agreement);
      await render(api);
      expect(document.activeElement).toBe(agreement);
      await click("Add Synthetic clinical to request");
      expect(document.activeElement).toBe(agreement);
      await click("Continue to contact");
      expect(document.activeElement).toBe(host.querySelector("h1"));
      expect(host.querySelector('input[name="name"]')).toBeTruthy();
    } finally { agreement.remove(); }
  });
  it.each([false, true])("restored recovery skips requirements, catalog and linked-selection reads (hint %s)", async (withHint) => {
    const api = makeApi();
    api.config.mockRejectedValue(new Error("intake closed"));
    api.catalog.mockRejectedValue(new Error("catalog closed"));
    const marker = JSON.stringify({ key: "10000000-0000-4000-8000-000000000001",
      acceptedAt: "2026-10-14T12:00:00Z", state: "uncertain" });
    sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, marker);
    let release!: (value: typeof receipt) => void;
    api.recover.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} continuationEnabled={false}
      entryIntent={withHint ? { family: "clinical_formulations_503a", slug: "clinical",
        variantId: "clinical-source", quantity: 2, action: "CARE" } : null} />));
    expect(host.textContent).toContain("Check your earlier request");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(api.config).not.toHaveBeenCalled();
    expect(api.catalog).not.toHaveBeenCalled();
    expect(api.submit).not.toHaveBeenCalled();
    await click("Check saved request");
    await click("Check saved request");
    expect(api.recover).toHaveBeenCalledTimes(1);
    expect(api.recover).toHaveBeenCalledWith(JSON.parse(marker).key);
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(marker);
    await act(async () => { release(receipt); });
    expect(host.textContent).toContain(reference);
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("does not continue when the existing access/standing shell is closed", async () => {
    const api = makeApi();
    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} continuationEnabled={false} />));
    await click("Add Synthetic clinical to request");
    const next = [...host.querySelectorAll("button")].find((button) => button.textContent === "Continue to contact");
    expect(next?.disabled).toBe(true);
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("resolves a clinical link through the neutral catalog without adding it or redirecting", async () => {
    const api = makeApi();
    const clinical = { ...item("clinical", true), sourceSelection: {
      family: "clinical_formulations_503a", slug: "clinical", variantId: "clinical-source",
    } };
    const catalog: RequestIntentApi["catalog"] = async (query) => ({
      items: [clinical], total: 1, page: query.page ?? 1, pageSize: query.pageSize ?? 24,
      families: ["clinical_formulations_503a"], channels: [], workflowModes: [],
    });
    const coupledApi = { ...api, catalog };
    await act(async () => root.render(<RequestIntentForm api={coupledApi} storage={sessionStorage} entryIntent={{
      family: "clinical_formulations_503a", slug: "clinical", variantId: "clinical-source", quantity: 2, action: "CARE",
    }} />));
    expect(host.querySelector('a[href="/care/schedule"]')).toBeNull();
    expect(host.textContent).toContain("0 selected");
    await click("Add linked selection for review");
    const quantity = host.querySelector<HTMLInputElement>("input[type=number]");
    expect(quantity?.value).toBe("2");
    expect(api.submit).not.toHaveBeenCalled();
  });
});

describe("request selection layout and controls (component fixtures, not viewport proof)", () => {
  it("uses the canonical base and embedded wrapper together", async () => {
    const api = makeApi();
    await act(async () => root.render(<RequestIntentForm embedded api={api} storage={sessionStorage} />));
    expect(host.firstElementChild?.classList.contains("xenios-order-page")).toBe(true);
    expect(host.firstElementChild?.classList.contains("xenios-order-page--embedded")).toBe(true);
    expect(host.querySelector('.xenios-order-summary[aria-label="Selected request items"]')).not.toBeNull();
  });
  it("steps by the canonical increment and stops at the minimum and last allowed maximum", async () => {
    const api = makeApi();
    const bounded = { ...item("bounded", false), minimumQuantity: 3, quantityIncrement: 4, maximumQuantity: 12 };
    api.catalog.mockResolvedValue({ items: [bounded], total: 1, page: 1, pageSize: 24, families: [], channels: [], workflowModes: [] });
    await render(api); await click("Add Synthetic bounded to request");
    const number = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    const decrease = host.querySelector<HTMLButtonElement>('[aria-label="Decrease requested quantity for Synthetic bounded"]')!;
    const increase = host.querySelector<HTMLButtonElement>('[aria-label="Increase requested quantity for Synthetic bounded"]')!;
    expect([number.min, number.step, number.max, number.value]).toEqual(["3", "4", "12", "3"]);
    expect(decrease.disabled).toBe(true);
    await act(async () => increase.click()); expect(number.value).toBe("7");
    await act(async () => increase.click()); expect(number.value).toBe("11"); expect(increase.disabled).toBe(true);
    await act(async () => decrease.click()); expect(number.value).toBe("7");
    await type(number, "-1"); expect(number.value).toBe("3"); expect(decrease.disabled).toBe(true);
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("applies multiple queued increment clicks to the latest selection", async () => {
    const api = makeApi(); await render(api); await click("Add Synthetic research to request");
    const increase = host.querySelector<HTMLButtonElement>('[aria-label="Increase requested quantity for Synthetic research"]')!;
    await act(async () => { increase.click(); increase.click(); });
    expect(host.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("3");
  });
  it("counts exact variants and units and removes a selected line independently", async () => {
    const api = makeApi(); await render(api);
    await click("Add Synthetic clinical to request"); await click("Add Synthetic research to request");
    const summary = host.querySelector<HTMLElement>('[aria-label="Selected request items"]')!;
    expect(summary.textContent).toContain("2 exact variants | 2 requested units");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Increase requested quantity for Synthetic clinical"]')!.click());
    expect(summary.textContent).toContain("2 exact variants | 3 requested units");
    await act(async () => summary.querySelector<HTMLButtonElement>('[aria-label="Remove selected Synthetic clinical Synthetic variant"]')!.click());
    expect(summary.textContent).toContain("1 exact variants | 1 requested units");
    expect(summary.textContent).not.toContain("Synthetic clinical");
    expect(summary.textContent).toContain("Synthetic research");
    expect(sessionStorage.length).toBe(0); expect(api.submit).not.toHaveBeenCalled();
  });
  it("keeps selected summary lines when search hides the corresponding catalog card", async () => {
    const api = makeApi(); await render(api); await click("Add Synthetic research to request");
    api.catalog.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 24, families: [], channels: [], workflowModes: [] });
    const search = [...host.querySelectorAll<HTMLInputElement>("input")].find((input) => input.closest("label")?.textContent === "Search catalog")!;
    await type(search, "no-match");
    expect(host.querySelector(".xenios-order-cards")?.textContent).not.toContain("Synthetic research");
    expect(host.querySelector('[aria-label="Selected request items"]')?.textContent).toContain("Synthetic research");
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("retains existing review-to-selection editing without persisting contact or bypassing submission", async () => {
    const api = makeApi(); await prepare(api); await click("Edit selection");
    expect(host.querySelector('[aria-label="Selected request items"]')?.textContent).toContain("2 exact variants | 3 requested units");
    expect(sessionStorage.length).toBe(0);
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("counts two variants of one product as one product and two exact variants", async () => {
    const api = makeApi();
    const first = { ...item("same", false), variantId: "first", specification: "First synthetic variant" };
    const second = { ...first, variantId: "second", specification: "Second synthetic variant" };
    api.catalog.mockResolvedValue({ items: [first, second], total: 2, page: 1, pageSize: 24, families: [], channels: [], workflowModes: [] });
    await render(api); await click("Add Synthetic same to request"); await click("Add Synthetic same to request");
    const summary = host.querySelector('[aria-label="Selected request items"]')!;
    expect(summary.textContent).toContain("1 products | 2 exact variants | 2 requested units");
    expect(summary.querySelectorAll("li")).toHaveLength(2);
    expect(summary.textContent).toContain("First synthetic variant");
    expect(summary.textContent).toContain("Second synthetic variant");
  });
  it("edits an off-page selected quantity with canonical bounds while preserving other selections", async () => {
    const api = makeApi(); await render(api);
    await click("Add Synthetic clinical to request"); await click("Add Synthetic research to request");
    api.catalog.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 24, families: [], channels: [], workflowModes: [] });
    const search = [...host.querySelectorAll<HTMLInputElement>("input")].find((input) => input.closest("label")?.textContent === "Search catalog")!;
    await type(search, "no-match");
    const summary = host.querySelector<HTMLElement>('[aria-label="Selected request items"]')!;
    await act(async () => summary.querySelector<HTMLButtonElement>('[aria-label="Edit selected quantity for Synthetic research Synthetic variant"]')!.click());
    const editor = summary.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect([editor.min, editor.max, editor.step]).toEqual(["1", "100", "1"]);
    await type(editor, "200"); expect(editor.value).toBe("100");
    await type(editor, "4");
    expect(summary.textContent).toContain("2 products | 2 exact variants | 5 requested units");
    expect(summary.querySelectorAll("li")[0].textContent).toContain("Requested quantity: 1");
    await click("Done editing quantity"); expect(summary.querySelector('input[type="number"]')).toBeNull();
    expect(sessionStorage.length).toBe(0); expect(api.submit).not.toHaveBeenCalled();
  });
});

describe("Doc163 known first refusal versus prior uncertainty", () => {
  it("shows not-saved guidance, clears the marker and lets a first refusal start a fresh explicit attempt", async () => {
    const api = makeApi();
    api.submit.mockRejectedValueOnce(new RequestIntentHttpError(400, "current_acknowledgments_required"));
    await prepare(api); await click("Submit for review");
    const first = api.submit.mock.calls[0][0];
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    expect(host.textContent).toContain("This request was not saved.");
    expect(host.textContent).toContain("Reload the current requirements");
    expect(host.textContent).not.toContain("Retry same request");
    const edit = [...host.querySelectorAll("button")].find((entry) => entry.textContent === "Edit selection");
    expect(edit?.disabled).toBe(false);
    await act(async () => host.querySelectorAll<HTMLInputElement>("fieldset input[type=checkbox]").forEach((entry) => entry.click()));
    await click("Submit for review");
    const second = api.submit.mock.calls[1][0];
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(host.textContent).toContain(receipt.publicReference);
  });
  it("retains the exact key, acceptedAt and edit lock when a lost reply is followed by a known retry refusal", async () => {
    const api = makeApi();
    api.submit.mockRejectedValueOnce(new Error("synthetic lost reply"));
    api.submit.mockRejectedValueOnce(new RequestIntentHttpError(400, "current_acknowledgments_required"));
    await prepare(api); await click("Submit for review");
    const marker = sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    await click("Retry same request");
    expect(api.submit.mock.calls[1][0]).toEqual(api.submit.mock.calls[0][0]);
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(marker);
    expect(host.textContent).not.toContain("This request was not saved.");
    expect(host.textContent).toContain("Retry same request");
    const edit = [...host.querySelectorAll("button")].find((entry) => entry.textContent === "Edit selection");
    expect(edit?.disabled).toBe(true);
  });
  it("keeps a first conflict or server failure uncertain and recoverable", async () => {
    const api = makeApi();
    api.submit.mockRejectedValueOnce(new RequestIntentHttpError(409, "attempt_conflict"));
    api.submit.mockRejectedValueOnce(new RequestIntentHttpError(503, "request_outcome_unconfirmed"));
    await prepare(api); await click("Submit for review");
    const marker = sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    expect(marker).not.toBeNull();
    await click("Retry same request");
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(marker);
    expect(host.textContent).not.toContain("This request was not saved.");
  });
});

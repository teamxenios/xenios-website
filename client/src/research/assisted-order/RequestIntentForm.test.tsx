// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "../../../../shared/research/assisted-order/form";
import type { RequestIntentCatalogItem, RequestIntentInput, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import { RequestIntentHttpError, type RequestIntentApi } from "./request-intent-api";
import { REQUEST_INTENT_ATTEMPT_KEY } from "./request-intent-attempt";
import { REQUEST_INTENT_RECEIPT_RECORD_KEY } from "./request-intent-continuation";
import { RequestIntentForm } from "./RequestIntentForm";
import { HCG_STRENGTH_REVIEW } from "../../../../shared/research/master-offerings/hcg-strength-review";
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
    actionLabel: "Add to quote cart", accessNotice: null, researchUseOnly: !clinical, catalogVersion: "synthetic", priceVersion: null,
    sourceSelection: { family: "synthetic", slug: id, variantId: id + "-source" },
    selectableForReview: true, intentExclusion: null, clinicalReviewRequired: clinical,
    sourceDisplayState: clinical ? "care_pathway" : "request_access", sourceVariantDisplayState: clinical ? "care_pathway" : "request_access", sourceRefusal: null,
  };
}
const reviewedArtwork = {
  primary: { href: "/research/product-media/synthetic-reviewed.webp", altText: "Synthetic reviewed design", width: 1024, height: 1024 },
  labelPreview: { href: "/research/product-media/synthetic-label.webp", altText: "Synthetic front label", width: 1000, height: 850 },
  packagingDesign: true,
};
const reviewedCopy = { summary: "Synthetic reviewed summary", overview: "Synthetic complete overview",
  specifications: [{ label: "Product code", value: "QA-EXACT" }] };

function makeApi() {
  return {
    config: vi.fn(async () => ({ legal: [{ kind: "fixture-terms", version: "fixture-v1", label: "Synthetic legal requirement" }],
      form: ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((ack) => ({ id: ack.id, scope: ack.scope, copy: ack.copy, ...assistedOrderFormPair(ack) })) })),
    catalog: vi.fn(async () => ({ items: [item("clinical", true), item("research", false)],
      total: 2, page: 1, pageSize: 24, families: ["clinical_formulations_503a", "research_peptides_materials"], channels: [], workflowModes: [] })),
    submit: vi.fn(async (_input: RequestIntentInput): Promise<unknown> => receipt),
    recover: vi.fn(async (_key: string) => receipt),
    staff: vi.fn(),
    staffQueue: vi.fn(async (_page: number): Promise<RequestIntentQueuePage> => ({ items: [], total: 0, page: 1, pageSize: 25 })),
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
async function render(api: RequestIntentApi, embedded = false) {
  await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} embedded={embedded} />));
}
function storedKeys() { return Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index)); }
/** After a confirmed receipt the marker is gone and only the non-secret reference record remains. */
function expectOnlyReferenceRecord(owner = "unscoped") {
  expect(storedKeys()).toEqual([REQUEST_INTENT_RECEIPT_RECORD_KEY]);
  expect(JSON.parse(sessionStorage.getItem(REQUEST_INTENT_RECEIPT_RECORD_KEY)!))
    .toEqual({ owner, publicReference: reference, createdAt: receipt.createdAt, pageLoad: expect.any(String) });
}
/** A reload evaluates the module again; the record then carries an earlier page-load id. */
function simulateReload() {
  const raw = sessionStorage.getItem(REQUEST_INTENT_RECEIPT_RECORD_KEY);
  expect(raw).not.toBeNull();
  sessionStorage.setItem(REQUEST_INTENT_RECEIPT_RECORD_KEY, JSON.stringify({ ...JSON.parse(raw!), pageLoad: "an-earlier-page-load" }));
}
async function click(text: string, accessibleName?: string) {
  const button = [...host.querySelectorAll("button")].find((entry) =>
    entry.textContent === text && (accessibleName === undefined || entry.getAttribute("aria-label") === accessibleName));
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function fillBaseContact() {
  for (const [name, value] of Object.entries({
    name: "Synthetic Customer", email: "synthetic@example.invalid", phone: "+15555550123",
    shippingLine1: "1 Synthetic Street", shippingCity: "Test", shippingRegion: "TX", shippingPostalCode: "00000", shippingCountryCode: "US",
  })) await type(host.querySelector('input[name="' + name + '"]')!, value);
}
async function prepare(api: RequestIntentApi, separateBilling = false, embedded = false) {
  await render(api, embedded);
  await click("Add Synthetic clinical to quote cart");
  await click("Add Synthetic research to quote cart");
  const quantity = [...host.querySelectorAll("input[type=number]")][0] as HTMLInputElement;
  await type(quantity, "2");
  await click("Continue to details");
  await fillBaseContact();
  if (separateBilling) {
    await type(host.querySelector<HTMLInputElement>('input[name="shippingLine2"]')!, "Suite 2");
    const billingSame = [...host.querySelectorAll("label")]
      .find((label) => label.textContent?.includes("Billing address is the same"))?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(billingSame).toBeTruthy();
    await act(async () => billingSame!.click());
    for (const [name, value] of Object.entries({
      billingLine1: "2 Synthetic Billing Street", billingLine2: "Unit 4", billingCity: "Billing Test",
      billingRegion: "CA", billingPostalCode: "00001", billingCountryCode: "US",
    })) await type(host.querySelector<HTMLInputElement>('input[name="' + name + '"]')!, value);
  }
  await act(async () => (host.querySelector('input[name="age"]') as HTMLInputElement).click());
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => host.querySelectorAll<HTMLInputElement>("fieldset input[type=checkbox]").forEach((entry) => entry.click()));
}
function expectContactInputs(contact: RequestIntentInput["contact"]) {
  const values: Record<string, string> = {
    name: contact.fullLegalName, email: contact.email, phone: contact.mobilePhone,
    shippingLine1: contact.shippingAddress.line1, shippingLine2: contact.shippingAddress.line2 ?? "",
    shippingCity: contact.shippingAddress.city, shippingRegion: contact.shippingAddress.region,
    shippingPostalCode: contact.shippingAddress.postalCode, shippingCountryCode: contact.shippingAddress.countryCode,
  };
  const billingSame = [...host.querySelectorAll("label")]
    .find((label) => label.textContent?.includes("Billing address is the same"))?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  expect(billingSame).toBeTruthy();
  expect(billingSame!.checked).toBe(contact.billingSameAsShipping);
  if (contact.billingSameAsShipping) expect(host.querySelector('input[name="billingLine1"]')).toBeNull();
  else {
    if (!contact.billingAddress) throw new Error("The separate-billing fixture must contain its address.");
    Object.assign(values, {
      billingLine1: contact.billingAddress.line1, billingLine2: contact.billingAddress.line2 ?? "",
      billingCity: contact.billingAddress.city, billingRegion: contact.billingAddress.region,
      billingPostalCode: contact.billingAddress.postalCode, billingCountryCode: contact.billingAddress.countryCode,
    });
  }
  for (const [name, value] of Object.entries(values)) {
    const input = host.querySelector<HTMLInputElement>('input[name="' + name + '"]');
    expect(input).toBeTruthy(); expect(input!.value).toBe(value);
  }
  expect(host.querySelector<HTMLInputElement>('input[name="age"]')!.checked).toBe(contact.ageConfirmed);
}
describe("mixed private request customer form source", () => {
  it("uses only the source variant for guest catalog artwork", async () => {
    const api = makeApi();
    const catalog = await api.catalog();
    const productControlVariantId = "mov_9262033fe69a14a50f1c";
    const sourceVariantId = "mov_82974ab2f9c652c2cb12";
    api.catalog.mockResolvedValue({
      ...catalog,
      items: [
        { ...item("mapped", false), variantId: productControlVariantId, unitPriceCents: 1250,
          sourceSelection: { family: "synthetic", slug: "mapped", variantId: sourceVariantId } },
        { ...item("missing-source", false), variantId: productControlVariantId, sourceSelection: undefined },
      ],
    });

    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage}
      embedded ownerKey="early-access-session" />));
    const [mapped, missingSource] = host.querySelectorAll(".xenios-order-card");
    const mappedImage = mapped.querySelector("img");
    expect(mappedImage?.getAttribute("src")).toBe("/research/product-media/capsule.svg");
    expect(mappedImage?.getAttribute("alt")).toBe("Synthetic mapped illustration, capsule");
    expect(mapped.querySelector(".xenios-order-card-intro > .xenios-order-card-media > figure"))
      .toBe(mappedImage?.closest("figure"));
    const fallbackImage = missingSource.querySelector("img");
    expect(fallbackImage?.getAttribute("src")).toBe("/research/product-media/unknown.svg");
    expect(fallbackImage?.getAttribute("alt")).toBe("Synthetic missing-source illustration, format unconfirmed");
    expect(missingSource.querySelector("figcaption")).toBeNull();
    expect(mapped.textContent).toContain("$12.50");
    await click("Add to quote cart", "Add to quote cart: Synthetic mapped, Synthetic variant");
    expect(mapped.querySelector('input[type="number"]')).not.toBeNull();
    expect(host.querySelector('aside img')).toBeNull();

    await render(api, true);
    expect(host.querySelector(".xenios-order-card img")).toBeNull();
  });

  it("opens exact guest catalog details without changing the request or leaving the catalog", async () => {
    const api = makeApi();
    const catalog = await api.catalog();
    const row = { ...item("mapped", false), variantId: "mov_9262033fe69a14a50f1c",
      specification: "Synthetic 10 mg", format: "Synthetic capsule", packBasis: "Synthetic single pack",
      reviewedContent: { brand: "Synthetic brand", summary: "Synthetic card summary", overview: "Synthetic variant overview" },
      sourceSelection: { family: "synthetic", slug: "mapped", variantId: "mov_82974ab2f9c652c2cb12" } };
    api.catalog.mockResolvedValue({ ...catalog, items: [row], total: 1 });

    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage}
      embedded ownerKey="early-access-session" />));
    await click("Add to quote cart", "Add to quote cart: Synthetic mapped, Synthetic 10 mg");
    const quantity = host.querySelector<HTMLInputElement>(".xenios-order-card input[type=number]")!;
    await type(quantity, "3");
    expect(host.querySelector(".xenios-order-card")?.textContent).toContain(row.reviewedContent.summary);
    expect(host.querySelector(".xenios-order-card")?.textContent).not.toContain(row.reviewedContent.overview);
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="View details for Synthetic mapped, Synthetic 10 mg"]')!;
    const reads = api.catalog.mock.calls.length;
    const url = window.location.href;

    trigger.focus();
    await act(async () => trigger.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.querySelector("h2")?.textContent).toBe(row.productName);
    expect(dialog?.textContent).toContain(row.reviewedContent.overview);
    for (const fact of [row.specification, row.format, row.packBasis]) {
      expect(dialog?.textContent).toContain(fact);
    }
    expect(dialog?.querySelector("img")?.getAttribute("src")).toBe("/research/product-media/capsule.svg");
    expect(dialog?.contains(document.activeElement)).toBe(true);

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => trigger.click());
    const back = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((button) => button.textContent?.trim() === "Back to catalog");
    expect(back).toBeTruthy();
    await act(async () => back!.click());
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(quantity.value).toBe("3");
    expect(window.location.href).toBe(url);
    expect(api.catalog).toHaveBeenCalledTimes(reads);
    expect(api.submit).not.toHaveBeenCalled();
    expect(api.recover).not.toHaveBeenCalled();
    expect(storedKeys()).toEqual([]);
  });

  it("shows approved art and complete details for a confirmed member without changing the request", async () => {
    const api = makeApi();
    const catalog = await api.catalog();
    api.catalog.mockResolvedValue({ ...catalog, items: [
      { ...item("reviewed", false), reviewedMedia: reviewedArtwork, reviewedContent: reviewedCopy,
        sourceSelection: { family: "research_peptides_materials", slug: "reviewed", variantId: "mov_82974ab2f9c652c2cb12" } },
      { ...item("clinical", true), reviewedMedia: reviewedArtwork, reviewedContent: reviewedCopy },
    ] });
    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} embedded ownerKey={"a".repeat(64)} />));
    const [card, clinical] = host.querySelectorAll(".xenios-order-card");
    expect(card.querySelector("img")?.getAttribute("src")).toBe(reviewedArtwork.primary.href);
    expect(card.textContent).toContain(reviewedCopy.summary);
    expect(card.textContent).not.toContain(reviewedCopy.overview);
    expect(clinical.querySelector("img")).toBeNull();
    expect(clinical.querySelector('button[aria-label^="View details"]')).toBeNull();
    expect(clinical.textContent).toContain("Clinical review required. Not a prescription.");
    expect(clinical.textContent).toContain("Final price follows applicable review.");

    await click("Add Synthetic reviewed to quote cart");
    const quantity = card.querySelector<HTMLInputElement>('input[type="number"]')!;
    await type(quantity, "3");
    const trigger = card.querySelector<HTMLButtonElement>('button[aria-label^="View details"]')!;
    const reads = api.catalog.mock.calls.length;
    const url = window.location.href;
    trigger.focus();
    await act(async () => trigger.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(reviewedCopy.overview);
    expect(dialog.textContent).toContain("QA-EXACT");
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe(reviewedArtwork.primary.href);
    expect(dialog.querySelector("a")?.getAttribute("href")).toBe(reviewedArtwork.labelPreview.href);
    expect(dialog.querySelector('button[aria-label^="Add "]')).toBeNull();
    await act(async () => dialog.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe("/research/product-media/capsule.svg");
    expect(dialog.querySelector("a")).toBeNull();
    expect(dialog.textContent).toContain(reviewedCopy.overview);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(quantity.value).toBe("3");
    expect(host.querySelector('aside[aria-label="Selected request items"]')?.textContent).toContain("Requested quantity: 3");
    expect(window.location.href).toBe(url);
    expect(api.catalog).toHaveBeenCalledTimes(reads);
    expect(api.submit).not.toHaveBeenCalled();
    expect(api.recover).not.toHaveBeenCalled();
    expect(storedKeys()).toEqual([]);
  });

  it("keeps member copy-only and art-only details honest and excludes rows without an exact source", async () => {
    const api = makeApi();
    const catalog = await api.catalog();
    api.catalog.mockResolvedValue({ ...catalog, total: 4, items: [
      { ...item("copy-only", false), reviewedContent: reviewedCopy },
      { ...item("art-only", false), reviewedMedia: reviewedArtwork, selectableForReview: false, intentExclusion: "coming_soon" },
      { ...item("unreviewed", false) },
      { ...item("unbound", false), reviewedMedia: reviewedArtwork, reviewedContent: reviewedCopy, sourceSelection: undefined },
    ] });
    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} embedded ownerKey={"a".repeat(64)} />));
    const [copy, art, unreviewed, unbound] = host.querySelectorAll(".xenios-order-card");
    expect(copy.querySelector("img")).toBeNull();
    expect(art.querySelector("img")?.getAttribute("src")).toBe(reviewedArtwork.primary.href);
    expect(art.textContent).toContain("Coming soon");
    expect(art.querySelector('button[aria-label^="Add "]')).toBeNull();
    for (const card of [unreviewed, unbound]) {
      expect(card.querySelector("img")).toBeNull();
      expect(card.querySelector('button[aria-label^="View details"]')).toBeNull();
    }

    await act(async () => copy.querySelector<HTMLButtonElement>('button[aria-label^="View details"]')!.click());
    let dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(reviewedCopy.overview);
    expect(dialog.querySelector("img")).toBeNull();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());

    await act(async () => art.querySelector<HTMLButtonElement>('button[aria-label^="View details"]')!.click());
    dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe(reviewedArtwork.primary.href);
    expect(dialog.querySelector('section[aria-label="Product information"]')).toBeNull();
    expect(dialog.textContent).toContain("Return to the catalog for this listing’s current availability and request options.");
    expect(api.submit).not.toHaveBeenCalled();
    expect(api.recover).not.toHaveBeenCalled();
  });

  it.each([undefined, "unscoped", "owner-a"])("keeps exact details closed for an unconfirmed owner (%s)", async (ownerKey) => {
    const api = makeApi();
    const catalog = await api.catalog();
    api.catalog.mockResolvedValue({ ...catalog, total: 1, items: [
      { ...item("reviewed", false), reviewedMedia: reviewedArtwork, reviewedContent: reviewedCopy },
    ] });
    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} embedded ownerKey={ownerKey} />));
    const card = host.querySelector(".xenios-order-card")!;
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelector('button[aria-label^="View details"]')).toBeNull();
    expect(card.textContent).not.toContain(reviewedCopy.overview);
  });

  it.each(["submission", "recovery"] as const)("publishes a confirmed %s receipt only after clearing its owned marker", async (path) => {
    const api = makeApi();
    const markerAtConfirmation: Array<string | null> = [];
    const confirmed = vi.fn(() => { markerAtConfirmation.push(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)); });
    if (path === "submission") await prepare(api);
    else sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, JSON.stringify({
      key: "10000000-0000-4000-8000-000000000001", acceptedAt: "2026-10-14T12:00:00Z", state: "uncertain" }));
    const props = { api, storage: sessionStorage, onConfirmedReceipt: confirmed };
    await act(async () => root.render(<RequestIntentForm {...props} />));
    await click(path === "submission" ? "Request a quote" : "Check saved request");
    expect(host.textContent).toContain(reference);
    expect(confirmed).toHaveBeenCalledTimes(1);
    if (path === "submission") {
      expect(confirmed).toHaveBeenCalledWith(receipt);
    } else {
      expect(confirmed).toHaveBeenCalledWith(receipt, true);
      expect(host.querySelector("h1")?.textContent).toBe("Your submitted request");
      expect(host.querySelector('[data-testid="request-next-steps"]')).toBeNull();
    }
    expect(markerAtConfirmation).toEqual([null]);
  });
  it("does not publish confirmation when recovery loses ownership of its marker", async () => {
    const api = makeApi(), confirmed = vi.fn();
    let resolve!: (value: typeof receipt) => void;
    api.recover.mockImplementation(() => new Promise((done) => { resolve = done; }));
    sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, JSON.stringify({
      key: "10000000-0000-4000-8000-000000000001", acceptedAt: "2026-10-14T12:00:00Z", state: "uncertain" }));
    const props = { api, storage: sessionStorage, onConfirmedReceipt: confirmed };
    await act(async () => root.render(<RequestIntentForm {...props} />));
    act(() => [...host.querySelectorAll("button")].find((button) => button.textContent === "Check saved request")!.click());
    const replacement = JSON.stringify({ key: "10000000-0000-4000-8000-000000000002",
      acceptedAt: "2026-10-14T12:00:01Z", state: "uncertain" });
    sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, replacement);
    await act(async () => resolve(receipt));
    expect(confirmed).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(REQUEST_INTENT_RECEIPT_RECORD_KEY)).toBeNull();
    expect(host.textContent).not.toContain(reference);
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(replacement);
    expect(host.querySelector('[role="alert"]')).toBeTruthy();
  });
  it("round-trips the form through the real intent service to one memory repository and authorized staff readback", async () => {
    const { api, rows } = makeRoundTrip();
    await prepare(api); await click("Request a quote");
    expect(rows.size).toBe(1);
    expect(host.textContent).toContain(reference);
    const hrefs = [...host.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));
    expect(hrefs).toContain("/research/support");
    expect(hrefs).toContain("/research/early-access/order-request/confirmation/" + reference);
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
    await click("Request a quote");
    expect(api.submit).toHaveBeenCalledTimes(1);
    const payload = api.submit.mock.calls[0][0];
    expect(payload.lines).toEqual([
      { productId: "clinical", variantId: "clinical-variant", quantity: 2 },
      { productId: "research", variantId: "research-variant", quantity: 1 },
    ]);
    expect(payload.agreements.every((entry) => entry.accepted === true)).toBe(true);
    expect(host.textContent).toContain(reference);
    expect(host.textContent).toContain("Final availability, quantities, pricing and delivery are confirmed separately.");
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
    await click("Request a quote");
    expect(host.textContent).not.toContain(reference);
    const first = api.submit.mock.calls[0][0];
    expect(host.textContent).toContain("choose Retry same request to send the original details again");
    await click("Retry same request");
    expect(api.submit.mock.calls[1][0]).toEqual(first);
    expect(host.textContent).toContain(reference);
  });
  it("refresh restores only the same attempt and recovers its real saved reference, without storing clinical selections", async () => {
    const api = makeApi();
    api.submit.mockRejectedValueOnce(new Error("synthetic lost response"));
    await prepare(api); await click("Request a quote");
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
    await prepare(api); await click("Request a quote");
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

describe("mixed catalog family labels", () => {
  it("shows a neutral clinical option and queries with the original family key", async () => {
    const api = makeApi();
    await render(api, true);
    const family = "clinical_formulations_503a";
    const filter = host.querySelector<HTMLSelectElement>("select");
    expect(filter).not.toBeNull();
    expect(filter?.querySelector('option[value="clinical_formulations_503a"]')?.textContent)
      .toBe("Clinical formulations");
    expect(filter?.querySelector('option[value="research_peptides_materials"]')?.textContent)
      .toBe("research peptides materials");
    expect(host.textContent).not.toMatch(/503a/i);

    await act(async () => {
      filter!.value = family;
      filter!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(api.catalog).toHaveBeenLastCalledWith({ search: "", family, page: 1, pageSize: 24 });
    expect([...host.querySelectorAll("button")].some((button) => button.textContent === "Add Synthetic clinical to quote cart"))
      .toBe(true);
    expect(api.submit).not.toHaveBeenCalled();
    expect(api.recover).not.toHaveBeenCalled();
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
      await click("Add Synthetic restricted to quote cart");
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
      await click("Add Synthetic clinical to quote cart");
      expect(document.activeElement).toBe(agreement);
      await click("Continue to details");
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
    await click("Add Synthetic clinical to quote cart");
    const next = [...host.querySelectorAll("button")].find((button) => button.textContent === "Continue to details");
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

describe("an embedded form inside a page with its own h1", () => {
  const headings = () => [...host.querySelectorAll("h1, h2, h3, h4")].map((node) => node.tagName + " " + node.textContent);
  it("puts its top heading one level below the page heading at every step and on the receipt, and still moves focus to it", async () => {
    const api = makeApi();
    await render(api, true);
    expect(headings()).toEqual(["H2 Build your request", "H2 Synthetic clinical", "H2 Synthetic research", "H2 Your request"]);
    await prepare(api, false, true);
    expect(headings()).toEqual(["H2 Build your request", "H2 Submit your request"]);
    expect(document.activeElement).toBe(host.querySelector("h2"));
    await click("Request a quote");
    expect(headings()).toEqual(["H2 Request submitted", "H3 What happens next"]);
    expect(document.activeElement).toBe(host.querySelector("h2"));
  });
  it("puts the earlier-request check below the page heading too", async () => {
    const api = makeApi();
    api.submit.mockRejectedValueOnce(new Error("synthetic lost response"));
    await prepare(api, false, true); await click("Request a quote");
    await act(async () => root.unmount());
    root = createRoot(host);
    await render(api, true);
    expect(headings()).toEqual(["H2 Check your earlier request"]);
  });
  it("keeps its h1 when the form is the page", async () => {
    const api = makeApi();
    await render(api);
    expect(headings()).toEqual(["H1 Build your request", "H2 Synthetic clinical", "H2 Synthetic research", "H2 Your request"]);
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
    await render(api); await click("Add Synthetic bounded to quote cart");
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
    const api = makeApi(); await render(api); await click("Add Synthetic research to quote cart");
    const increase = host.querySelector<HTMLButtonElement>('[aria-label="Increase requested quantity for Synthetic research"]')!;
    await act(async () => { increase.click(); increase.click(); });
    expect(host.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("3");
  });
  it("counts exact variants and units and removes a selected line independently", async () => {
    const api = makeApi(); await render(api);
    await click("Add Synthetic clinical to quote cart"); await click("Add Synthetic research to quote cart");
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
    const api = makeApi(); await render(api); await click("Add Synthetic research to quote cart");
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
    await click("Continue to details");
    expectContactInputs({ fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid", mobilePhone: "+15555550123",
      ageConfirmed: true, shippingAddress: { line1: "1 Synthetic Street", city: "Test", region: "TX", postalCode: "00000", countryCode: "US" },
      billingSameAsShipping: true });
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const checks = [...host.querySelectorAll<HTMLInputElement>(".xenios-order-acknowledgments input[type=checkbox]")];
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((checkbox) => !checkbox.checked)).toBe(true);
    expect([...host.querySelectorAll("button")].find((button) => button.textContent === "Request a quote")!.disabled).toBe(true);
    expect(sessionStorage.length).toBe(0); expect(api.submit).not.toHaveBeenCalled();
  });
  it.each([false, true])("retains an unfinished contact draft across a quantity edit (previous review %s)", async (previouslyReviewed) => {
    const api = makeApi(), storageWrites = vi.spyOn(Storage.prototype, "setItem");
    try {
      if (previouslyReviewed) {
        await prepare(api, true);
        await click("Edit selection");
      } else {
        await render(api);
        await click("Add Synthetic research to quote cart");
      }
      await click("Continue to details");
      const billingSame = () => [...host.querySelectorAll("label")]
        .find((label) => label.textContent?.includes("Billing address is the same"))!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      if (!previouslyReviewed) await act(async () => billingSame().click());
      expect(billingSame().checked).toBe(false);
      // Both fixtures are deliberately incomplete, and the second replaces an
      // older valid review snapshot without reviewing these newer edits.
      const draft = {
        name: "  Synthetic unfinished draft  ", email: "draft@example.invalid", phone: "+15555550199",
        shippingLine1: "3 Synthetic Draft Street", shippingLine2: "Suite 7", shippingCity: "",
        shippingRegion: "NY", shippingPostalCode: "00003", shippingCountryCode: "US",
        billingLine1: "4 Synthetic Draft Street", billingLine2: "Unit 8", billingCity: "Draft Billing",
        billingRegion: "WA", billingPostalCode: "", billingCountryCode: "US",
      };
      for (const [name, value] of Object.entries(draft)) {
        await type(host.querySelector<HTMLInputElement>('input[name="' + name + '"]')!, value);
      }
      // Fresh input explicitly checks age; a previously reviewed customer
      // explicitly unchecks it. Neither choice may revert during navigation.
      await act(async () => host.querySelector<HTMLInputElement>('input[name="age"]')!.click());
      const expectDraft = () => {
        for (const [name, value] of Object.entries(draft)) {
          expect(host.querySelector<HTMLInputElement>('input[name="' + name + '"]')!.value).toBe(value);
        }
        expect(billingSame().checked).toBe(false);
        expect(host.querySelector<HTMLInputElement>('input[name="age"]')!.checked).toBe(!previouslyReviewed);
      };
      expectDraft();
      expect(api.submit).not.toHaveBeenCalled(); expect(api.recover).not.toHaveBeenCalled();
      expect(storageWrites).not.toHaveBeenCalled(); expect(sessionStorage.length).toBe(0);

      await click("Back to products");
      await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Increase requested quantity for Synthetic research"]')!.click());
      expect(host.querySelector('[aria-label="Selected request items"]')?.textContent)
        .toContain(previouslyReviewed ? "2 exact variants | 4 requested units" : "1 exact variants | 2 requested units");
      await click("Continue to details");
      expectDraft();
      expect(api.submit).not.toHaveBeenCalled(); expect(api.recover).not.toHaveBeenCalled();
      expect(storageWrites).not.toHaveBeenCalled(); expect(sessionStorage.length).toBe(0);

      // Direct submit dispatch exercises component validation, not native
      // browser constraint validation. Retention must not turn incomplete
      // addresses or an unchecked age into a review.
      await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(host.querySelector('input[name="name"]')).not.toBeNull();
      expect(host.textContent).toContain("Complete the required contact and address fields.");
      expect(host.textContent).not.toContain("Submit your request");
      await type(host.querySelector<HTMLInputElement>('input[name="shippingCity"]')!, "Draft Delivery");
      await type(host.querySelector<HTMLInputElement>('input[name="billingPostalCode"]')!, "00004");
      if (previouslyReviewed) {
        await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
        expect(host.querySelector('input[name="age"]')).not.toBeNull();
        expect(host.querySelector<HTMLInputElement>('input[name="age"]')!.checked).toBe(false);
        expect(host.textContent).not.toContain("Submit your request");
        await act(async () => host.querySelector<HTMLInputElement>('input[name="age"]')!.click());
      }
      await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(host.textContent).toContain("Submit your request");
      expect(host.textContent).toContain("Synthetic unfinished draft");
      expect(host.textContent).toContain("draft@example.invalid");
      const checks = [...host.querySelectorAll<HTMLInputElement>(".xenios-order-acknowledgments input[type=checkbox]")];
      expect(checks.length).toBeGreaterThan(0);
      expect(checks.every((checkbox) => !checkbox.checked)).toBe(true);
      expect([...host.querySelectorAll("button")].find((button) => button.textContent === "Request a quote")!.disabled).toBe(true);
      expect(api.submit).not.toHaveBeenCalled(); expect(api.recover).not.toHaveBeenCalled();
      expect(storageWrites).not.toHaveBeenCalled(); expect(sessionStorage.length).toBe(0);
    } finally { storageWrites.mockRestore(); }
  });
  it.each([
    ["fresh separate address", false, false],
    ["newer edits to a reviewed address", true, false],
    ["hidden address across product navigation", false, true],
  ] as const)("retains raw billing input when toggled off and on: %s", async (_scenario, previouslyReviewed, visitProducts) => {
    const api = makeApi(), storageWrites = vi.spyOn(Storage.prototype, "setItem");
    try {
      const shippingAddress = { line1: "1 Synthetic Street", line2: "Suite 2", city: "Test",
        region: "TX", postalCode: "00000", countryCode: "US" };
      const billingAddress = { line1: "  6 Synthetic Billing Lane  ", line2: "", city: "",
        region: "WA", postalCode: "00006", countryCode: "US" };
      const contact: RequestIntentInput["contact"] = { fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid", mobilePhone: "+15555550123",
        ageConfirmed: true, shippingAddress, billingSameAsShipping: false, billingAddress };
      const billingSame = () => [...host.querySelectorAll("label")]
        .find((label) => label.textContent?.includes("Billing address is the same"))!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      if (previouslyReviewed) {
        await prepare(api, true); await click("Edit selection"); await click("Continue to details");
      } else {
        await render(api); await click("Add Synthetic research to quote cart"); await click("Continue to details");
        for (const [name, value] of Object.entries({
          name: contact.fullLegalName, email: contact.email, phone: contact.mobilePhone,
          shippingLine1: shippingAddress.line1, shippingLine2: shippingAddress.line2, shippingCity: shippingAddress.city,
          shippingRegion: shippingAddress.region, shippingPostalCode: shippingAddress.postalCode, shippingCountryCode: shippingAddress.countryCode,
        })) await type(host.querySelector<HTMLInputElement>('input[name="' + name + '"]')!, value);
        await act(async () => host.querySelector<HTMLInputElement>('input[name="age"]')!.click());
        await act(async () => billingSame().click());
      }
      expect(billingSame().checked).toBe(false);
      // Explicit blanks must replace the old reviewed Unit 4 / Billing Test,
      // while whitespace remains raw until a successful contact review.
      for (const [name, value] of Object.entries({
        billingLine1: billingAddress.line1, billingLine2: billingAddress.line2, billingCity: billingAddress.city,
        billingRegion: billingAddress.region, billingPostalCode: billingAddress.postalCode, billingCountryCode: billingAddress.countryCode,
      })) await type(host.querySelector<HTMLInputElement>('input[name="' + name + '"]')!, value);
      expectContactInputs(contact);

      await act(async () => billingSame().click());
      expect(billingSame().checked).toBe(true);
      expect(host.querySelector('input[name="billingLine1"]')).toBeNull();
      if (visitProducts) {
        await click("Back to products");
        await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Increase requested quantity for Synthetic research"]')!.click());
        expect(host.querySelector('[aria-label="Selected request items"]')?.textContent).toContain("1 exact variants | 2 requested units");
        await click("Continue to details");
        expect(billingSame().checked).toBe(true);
        expect(host.querySelector('input[name="billingLine1"]')).toBeNull();
      }
      await act(async () => billingSame().click());
      expectContactInputs(contact);
      expect(api.submit).not.toHaveBeenCalled(); expect(api.recover).not.toHaveBeenCalled();
      expect(storageWrites).not.toHaveBeenCalled(); expect(sessionStorage.length).toBe(0);

      // Direct dispatch checks component validation, not native browser validity.
      await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(host.textContent).toContain("Complete the required contact and address fields.");
      expect(host.textContent).not.toContain("Submit your request");
      expectContactInputs(contact);
      // Choosing shipping explicitly must ignore the incomplete inactive draft.
      await act(async () => billingSame().click());
      await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(host.textContent).toContain("Submit your request");
      const checks = [...host.querySelectorAll<HTMLInputElement>(".xenios-order-acknowledgments input[type=checkbox]")];
      expect(checks.length).toBeGreaterThan(0); expect(checks.every((checkbox) => !checkbox.checked)).toBe(true);
      expect([...host.querySelectorAll("button")].find((button) => button.textContent === "Request a quote")!.disabled).toBe(true);
      expect(api.submit).not.toHaveBeenCalled(); expect(api.recover).not.toHaveBeenCalled();
      expect(storageWrites).not.toHaveBeenCalled();
      await act(async () => checks.forEach((checkbox) => checkbox.click()));
      await click("Request a quote");
      expect(api.submit).toHaveBeenCalledTimes(1);
      const submitted = api.submit.mock.calls[0][0].contact;
      expect(submitted.billingSameAsShipping).toBe(true);
      expect(submitted.shippingAddress).toEqual(shippingAddress);
      expect(submitted.billingAddress).toEqual(shippingAddress);
      expect(api.recover).not.toHaveBeenCalled(); expect(host.textContent).toContain(reference);
      // Submission may persist only its existing non-contact retry marker and,
      // once confirmed, the non-secret reference record. Never any contact data.
      expect(storageWrites.mock.calls.length).toBeGreaterThan(0);
      for (const [key, value] of storageWrites.mock.calls) {
        const fields = Object.keys(JSON.parse(value)).sort();
        if (key === REQUEST_INTENT_RECEIPT_RECORD_KEY) expect(fields).toEqual(["createdAt", "owner", "pageLoad", "publicReference"]);
        else { expect(key).toBe(REQUEST_INTENT_ATTEMPT_KEY); expect(fields).toEqual(["acceptedAt", "key", "state"]); }
        expect(value).not.toMatch(/Synthetic|Billing|Street|@example|Unit 4/);
      }
      expectOnlyReferenceRecord();
    } finally { storageWrites.mockRestore(); }
  });
  it("counts two variants of one product as one product and two exact variants", async () => {
    const api = makeApi();
    const first = { ...item("same", false), variantId: "first", specification: "First synthetic variant" };
    const second = { ...first, variantId: "second", specification: "Second synthetic variant" };
    api.catalog.mockResolvedValue({ items: [first, second], total: 2, page: 1, pageSize: 24, families: [], channels: [], workflowModes: [] });
    await render(api); await click("Add Synthetic same to quote cart"); await click("Add Synthetic same to quote cart");
    const summary = host.querySelector('[aria-label="Selected request items"]')!;
    expect(summary.textContent).toContain("1 products | 2 exact variants | 2 requested units");
    expect(summary.querySelectorAll("li")).toHaveLength(2);
    expect(summary.textContent).toContain("First synthetic variant");
    expect(summary.textContent).toContain("Second synthetic variant");
  });
  it("edits an off-page selected quantity with canonical bounds while preserving other selections", async () => {
    const api = makeApi(); await render(api);
    await click("Add Synthetic clinical to quote cart"); await click("Add Synthetic research to quote cart");
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
  function updatedRequirements() {
    return {
      legal: [{ kind: "fixture-terms", version: "fixture-v2", label: "Version 2 synthetic legal requirement" }],
      form: ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((ack) => ({
        id: ack.id, scope: ack.scope, copy: ack.copy, ...assistedOrderFormPair(ack),
      })),
    };
  }
  function versionCheckedApi() {
    const api = makeApi();
    const catalogItems = [item("clinical", true), item("research", false)];
    api.submit.mockImplementation(async (input) => {
      const resolved = input.lines.map((line) => catalogItems.find((candidate) =>
        candidate.productId === line.productId && candidate.variantId === line.variantId));
      if (resolved.some((candidate) => candidate === undefined)) throw new RequestIntentHttpError(400, "selection_requires_refresh");
      const expected = [
        ...updatedRequirements().legal.map(({ kind, version }) => ({ kind, version })),
        ...requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: resolved.some((candidate) => candidate?.researchUseOnly === true) })
          .map(assistedOrderFormPair),
      ];
      const pair = (agreement: { kind: string; version: string }) => JSON.stringify([agreement.kind, agreement.version]);
      const expectedPairs = new Set(expected.map(pair)), actualPairs = new Set(input.agreements.map(pair));
      if (input.agreements.some((agreement) => agreement.accepted !== true) || actualPairs.size !== input.agreements.length
        || actualPairs.size !== expectedPairs.size || [...expectedPairs].some((entry) => !actualPairs.has(entry))) {
        throw new RequestIntentHttpError(400, "current_acknowledgments_required");
      }
      return receipt;
    });
    return api;
  }
  function buttonNamed(text: string): HTMLButtonElement {
    const button = [...host.querySelectorAll("button")].find((entry) => entry.textContent === text);
    expect(button).toBeTruthy();
    return button!;
  }
  async function confirmFreshRequirements() {
    const checks = [...host.querySelectorAll<HTMLInputElement>("fieldset input[type=checkbox]")];
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((entry) => !entry.checked && !entry.disabled)).toBe(true);
    await act(async () => checks.forEach((entry) => entry.click()));
  }
  it("preserves separate billing and contact through selection editing and an explicit requirements refresh", async () => {
    const api = versionCheckedApi();
    await prepare(api, true); await click("Request a quote");
    expect(api.submit).toHaveBeenCalledTimes(1);
    const first = api.submit.mock.calls[0][0];
    expect(first.contact.billingSameAsShipping).toBe(false);
    expect(sessionStorage.length).toBe(0);
    expect(host.querySelectorAll(".xenios-order-acknowledgments input[type=checkbox]")).toHaveLength(0);
    await click("Edit selection");
    expect(buttonNamed("Continue to details").disabled).toBe(true);
    expect(host.querySelector('[aria-label="Refresh request requirements"]')).not.toBeNull();
    await click("Remove Synthetic research");
    const increase = host.querySelector<HTMLButtonElement>('[aria-label="Increase requested quantity for Synthetic clinical"]');
    expect(increase).toBeTruthy(); await act(async () => increase!.click());
    api.config.mockResolvedValueOnce(updatedRequirements());
    await click("Refresh requirements");
    expect(api.config).toHaveBeenCalledTimes(2); expect(api.submit).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0);
    expect(host.querySelector('[aria-label="Refresh request requirements"]')).toBeNull();
    expect(host.querySelector('.xenios-order-error[role="alert"]')).toBeNull();
    await click("Continue to details"); expectContactInputs(first.contact);
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const clinicalRequirements = requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: false });
    const checks = [...host.querySelectorAll<HTMLInputElement>(".xenios-order-acknowledgments input[type=checkbox]")];
    expect(checks).toHaveLength(clinicalRequirements.length + updatedRequirements().legal.length);
    expect(checks.every((checkbox) => !checkbox.checked)).toBe(true);
    expect(buttonNamed("Request a quote").disabled).toBe(true);
    expect(api.submit).toHaveBeenCalledTimes(1); expect(sessionStorage.length).toBe(0);
    await confirmFreshRequirements(); await click("Request a quote");
    expect(api.submit).toHaveBeenCalledTimes(2);
    const second = api.submit.mock.calls[1][0];
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(second.contact).toEqual(first.contact);
    expect(second.lines).toEqual([{ productId: "clinical", variantId: "clinical-variant", quantity: 3 }]);
    const expectedPairs = [
      ...updatedRequirements().legal.map(({ kind, version }) => JSON.stringify([kind, version])),
      ...clinicalRequirements.map((ack) => { const { kind, version } = assistedOrderFormPair(ack); return JSON.stringify([kind, version]); }),
    ];
    expect(new Set(second.agreements.map(({ kind, version }) => JSON.stringify([kind, version])))).toEqual(new Set(expectedPairs));
    expect(host.textContent).toContain(receipt.publicReference); expectOnlyReferenceRecord();
  });
  it("refreshes obsolete requirements explicitly before a fresh version-valid submission", async () => {
    const api = versionCheckedApi();
    await prepare(api); await click("Request a quote");
    const first = api.submit.mock.calls[0][0];
    expect(first.agreements.find((entry) => entry.kind === "fixture-terms")?.version).toBe("fixture-v1");
    expect(api.config).toHaveBeenCalledTimes(1);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(host.textContent).toContain("This request was not saved.");
    expect(host.querySelectorAll(".xenios-order-acknowledgments input[type=checkbox]")).toHaveLength(0);
    expect(host.textContent).not.toContain("Synthetic legal requirement");
    expect(host.querySelector('[aria-label="Refresh request requirements"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Retry same request");
    expect(buttonNamed("Edit selection").disabled).toBe(false);
    expect(buttonNamed("Refresh requirements").disabled).toBe(false);
    expect(buttonNamed("Request a quote").disabled).toBe(true);
    await click("Request a quote");
    expect(api.submit).toHaveBeenCalledTimes(1);

    api.config.mockResolvedValueOnce(updatedRequirements());
    await click("Refresh requirements");
    expect(api.config).toHaveBeenCalledTimes(2);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Version 2 synthetic legal requirement");
    expect(host.textContent).not.toContain("Synthetic legal requirement");
    expect(host.querySelector('[aria-label="Refresh request requirements"]')).toBeNull();
    expect(host.querySelector('.xenios-order-error[role="alert"]')).toBeNull();
    expect(host.textContent).toContain("Synthetic Customer");
    expect(host.textContent).toContain("synthetic@example.invalid");
    expect(host.textContent).toContain("Synthetic clinical");
    expect(host.textContent).toContain("Synthetic research");
    expect(sessionStorage.length).toBe(0);
    expect(buttonNamed("Request a quote").disabled).toBe(true);
    await click("Request a quote");
    expect(api.submit).toHaveBeenCalledTimes(1);
    await confirmFreshRequirements();
    expect(buttonNamed("Request a quote").disabled).toBe(false);
    await click("Request a quote");
    expect(api.submit).toHaveBeenCalledTimes(2);
    const second = api.submit.mock.calls[1][0];
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(second.contact).toEqual(first.contact);
    expect(second.lines).toEqual(first.lines);
    expect(second.agreements.filter((entry) => entry.kind === "fixture-terms")).toEqual([
      expect.objectContaining({ kind: "fixture-terms", version: "fixture-v2", accepted: true }),
    ]);
    expect(second.agreements.filter((entry) => entry.kind !== "fixture-terms")
      .map(({ kind, version, accepted }) => ({ kind, version, accepted })))
      .toEqual(first.agreements.filter((entry) => entry.kind !== "fixture-terms")
        .map(({ kind, version, accepted }) => ({ kind, version, accepted })));
    expect(host.textContent).toContain(receipt.publicReference);
    expectOnlyReferenceRecord();
  });
  it("keeps submission closed after refresh failure and permits an explicit successful refresh retry", async () => {
    const api = versionCheckedApi();
    await prepare(api); await click("Request a quote");
    const first = api.submit.mock.calls[0][0];
    api.config.mockRejectedValueOnce(new Error("Synthetic configuration failure"))
      .mockResolvedValueOnce(updatedRequirements());
    await click("Refresh requirements");
    expect(api.config).toHaveBeenCalledTimes(2);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("could not be refreshed");
    expect(host.querySelectorAll(".xenios-order-acknowledgments input[type=checkbox]")).toHaveLength(0);
    expect(host.textContent).not.toContain("Synthetic legal requirement");
    expect(host.querySelector('[aria-label="Refresh request requirements"]')).not.toBeNull();
    expect(host.textContent).not.toContain(receipt.publicReference);
    expect(buttonNamed("Request a quote").disabled).toBe(true);
    expect(buttonNamed("Refresh requirements").disabled).toBe(false);
    expect(sessionStorage.length).toBe(0);
    await click("Request a quote");
    expect(api.submit).toHaveBeenCalledTimes(1);

    await click("Refresh requirements");
    expect(api.config).toHaveBeenCalledTimes(3);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Version 2 synthetic legal requirement");
    expect(host.querySelector('[aria-label="Refresh request requirements"]')).toBeNull();
    expect(host.querySelector('.xenios-order-error[role="alert"]')).toBeNull();
    expect(buttonNamed("Request a quote").disabled).toBe(true);
    expect(sessionStorage.length).toBe(0);
    await confirmFreshRequirements(); await click("Request a quote");
    expect(api.submit).toHaveBeenCalledTimes(2);
    const second = api.submit.mock.calls[1][0];
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(second.contact).toEqual(first.contact);
    expect(second.lines).toEqual(first.lines);
    expect(second.agreements.find((entry) => entry.kind === "fixture-terms")?.version).toBe("fixture-v2");
    expect(host.textContent).toContain(receipt.publicReference);
    expectOnlyReferenceRecord();
  });
  it("deduplicates refresh clicks while configuration is pending without posting a request", async () => {
    const api = versionCheckedApi();
    await prepare(api); await click("Request a quote");
    type Config = Awaited<ReturnType<typeof api.config>>;
    let resolveRefresh!: (value: Config) => void;
    const pending = new Promise<Config>((resolve) => { resolveRefresh = resolve; });
    api.config.mockImplementationOnce(() => pending);
    const refresh = buttonNamed("Refresh requirements");
    // Both clicks precede React's disabled-button rerender.
    await act(async () => { refresh.click(); refresh.click(); });
    expect(api.config).toHaveBeenCalledTimes(2);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(buttonNamed("Refresh requirements").disabled).toBe(true);
    expect(buttonNamed("Request a quote").disabled).toBe(true);
    expect(host.textContent).not.toMatch(/Submitting request/);
    expect(host.querySelectorAll(".xenios-order-acknowledgments input[type=checkbox]")).toHaveLength(0);
    expect(host.querySelector('[aria-label="Refresh request requirements"]')).not.toBeNull();
    expect(sessionStorage.length).toBe(0);
    await click("Request a quote");
    expect(api.submit).toHaveBeenCalledTimes(1);
    await act(async () => { resolveRefresh(updatedRequirements()); await pending; });
    expect(api.config).toHaveBeenCalledTimes(2);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Version 2 synthetic legal requirement");
    expect(buttonNamed("Request a quote").disabled).toBe(true);
    expect(sessionStorage.length).toBe(0);
    await confirmFreshRequirements();
    expect(buttonNamed("Request a quote").disabled).toBe(false);
    await click("Request a quote");
    expect(api.submit).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain(receipt.publicReference);
  });
  it.each([
    [400, "selection_requires_refresh", "Reload the current catalog"],
    [429, "rate_limited", "Wait before submitting a new attempt"],
    [503, "request_intent_unavailable", "Request intake is unavailable right now. Your selections and contact details are still on this page, but they are not stored and will be cleared if you leave or reload it."],
  ] as const)("preserves first-refusal guidance for %s %s and uses fresh consent and a new key without config refresh", async (status, code, guidance) => {
    const api = makeApi(); let submissionAdmitted = false;
    api.submit.mockImplementation(async () => {
      if (!submissionAdmitted) throw new RequestIntentHttpError(status, code);
      return receipt;
    });
    await prepare(api); await click("Request a quote");
    expect(api.submit).toHaveBeenCalledTimes(1);
    const first = api.submit.mock.calls[0][0];
    expect(host.textContent).toContain("This request was not saved."); expect(host.textContent).toContain(guidance);
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull(); expect(sessionStorage.length).toBe(0);
    expect(api.config).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[aria-label="Refresh request requirements"]')).toBeNull();
    expect([...host.querySelectorAll("button")].some((button) => button.textContent === "Refresh requirements")).toBe(false);
    expect(buttonNamed("Edit selection").disabled).toBe(false); expect(buttonNamed("Request a quote").disabled).toBe(true);
    const checks = [...host.querySelectorAll<HTMLInputElement>(".xenios-order-acknowledgments input[type=checkbox]")];
    expect(checks.length).toBeGreaterThan(0); expect(checks.every((checkbox) => !checkbox.checked)).toBe(true);
    expect(checks.every((checkbox) => !checkbox.matches(":disabled"))).toBe(true);
    await click("Request a quote"); expect(api.submit).toHaveBeenCalledTimes(1);
    submissionAdmitted = true;
    // A controlled clock proves the new attempt records its own confirmation time.
    const fresh = new Date(Date.parse(first.agreements[0].acceptedAt) + 60_000);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(fresh);
    try { await confirmFreshRequirements(); await click("Request a quote"); } finally { vi.useRealTimers(); }
    expect(api.submit).toHaveBeenCalledTimes(2);
    const second = api.submit.mock.calls[1][0];
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(second.contact).toEqual(first.contact); expect(second.lines).toEqual(first.lines);
    expect(second.agreements.map(({ kind, version }) => ({ kind, version })))
      .toEqual(first.agreements.map(({ kind, version }) => ({ kind, version })));
    expect(second.agreements.every((entry) => entry.acceptedAt === fresh.toISOString())).toBe(true);
    expect(api.config).toHaveBeenCalledTimes(1); expect(host.textContent).toContain(receipt.publicReference);
    expectOnlyReferenceRecord();
  });
  it("retains the exact key, acceptedAt and edit lock when a lost reply is followed by a known retry refusal", async () => {
    const api = makeApi();
    api.submit.mockRejectedValueOnce(new Error("synthetic lost reply"));
    api.submit.mockRejectedValueOnce(new RequestIntentHttpError(400, "current_acknowledgments_required"));
    await prepare(api); await click("Request a quote");
    const marker = sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    await click("Retry same request");
    expect(api.submit).toHaveBeenCalledTimes(2);
    expect(api.submit.mock.calls[1][0]).toEqual(api.submit.mock.calls[0][0]);
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(marker);
    expect(host.querySelector('[aria-label="Refresh request requirements"]')).toBeNull();
    const frozenChecks = [...host.querySelectorAll<HTMLInputElement>(".xenios-order-acknowledgments input[type=checkbox]")];
    expect(frozenChecks.length).toBeGreaterThan(0);
    expect(frozenChecks.every((checkbox) => checkbox.matches(":disabled"))).toBe(true);
    expect(host.textContent).not.toContain("This request was not saved.");
    expect(host.textContent).toContain("Retry same request");
    const edit = [...host.querySelectorAll("button")].find((entry) => entry.textContent === "Edit selection");
    expect(edit?.disabled).toBe(true);
    expect(api.config).toHaveBeenCalledTimes(1);
    expect([...host.querySelectorAll("button")].some((entry) => /Refresh requirements/.test(entry.textContent ?? ""))).toBe(false);
  });
  it("keeps a first conflict or server failure uncertain and recoverable", async () => {
    const api = makeApi();
    api.submit.mockRejectedValueOnce(new RequestIntentHttpError(409, "attempt_conflict"));
    api.submit.mockRejectedValueOnce(new RequestIntentHttpError(503, "request_outcome_unconfirmed"));
    await prepare(api); await click("Request a quote");
    const marker = sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    expect(marker).not.toBeNull();
    await click("Retry same request");
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(marker);
    expect(host.textContent).not.toContain("This request was not saved.");
    expect(api.config).toHaveBeenCalledTimes(1);
    expect([...host.querySelectorAll("button")].some((entry) => /Refresh requirements/.test(entry.textContent ?? ""))).toBe(false);
  });
  it("keeps a lost reply uncertain when its retry meets closed intake", async () => {
    const api = makeApi();
    api.submit.mockRejectedValueOnce(new Error("synthetic lost reply"));
    api.submit.mockRejectedValueOnce(new RequestIntentHttpError(503, "request_intent_unavailable"));
    await prepare(api); await click("Request a quote");
    const marker = sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    expect(marker).not.toBeNull();
    const notice = host.querySelector(".xenios-order-error")?.textContent;
    expect(notice).toBeTruthy();
    await click("Retry same request");
    expect(api.submit).toHaveBeenCalledTimes(2);
    expect(api.submit.mock.calls[1][0]).toEqual(api.submit.mock.calls[0][0]);
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(marker);
    expect(host.querySelector(".xenios-order-error")?.textContent).toBe(notice);
    expect(host.textContent).not.toContain("This request was not saved.");
    expect(host.textContent).not.toContain("Request intake is unavailable right now");
    expect(host.textContent).toContain("Retry same request");
    expect(buttonNamed("Edit selection").disabled).toBe(true);
    const frozenChecks = [...host.querySelectorAll<HTMLInputElement>(".xenios-order-acknowledgments input[type=checkbox]")];
    expect(frozenChecks.length).toBeGreaterThan(0);
    expect(frozenChecks.every((checkbox) => checkbox.matches(":disabled"))).toBe(true);
    expect(api.config).toHaveBeenCalledTimes(1);
  });
  it("keeps an earlier attempt on its recovery path after a reload, even when its check meets closed intake", async () => {
    const api = makeApi();
    api.submit.mockRejectedValueOnce(new Error("synthetic lost reply"));
    api.recover.mockRejectedValueOnce(new RequestIntentHttpError(503, "request_intent_unavailable"));
    await prepare(api); await click("Request a quote");
    const marker = sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    expect(marker).not.toBeNull();
    await act(async () => root.unmount());
    root = createRoot(host);
    await render(api);
    expect(host.textContent).toContain("Check your earlier request");
    // The restored view offers only the saved-request check; no new attempt can start from it.
    expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Check saved request"]);
    await click("Check saved request");
    expect(api.recover).toHaveBeenCalledWith(JSON.parse(marker!).key);
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(marker);
    expect(host.textContent).not.toContain("This request was not saved.");
    expect(host.textContent).not.toContain("Request intake is unavailable right now");
    expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Check saved request"]);
    expect(api.submit).toHaveBeenCalledTimes(1); expect(api.config).toHaveBeenCalledTimes(1);
  });
  it.each(["config", "catalog"] as const)("keeps closed intake on the %s read out of submission cleanup", async (read) => {
    // GET /config and GET /catalog can answer the same 503 code; only a first submit may call it "not saved".
    const api = makeApi();
    (read === "config" ? api.config : api.catalog).mockRejectedValue(new RequestIntentHttpError(503, "request_intent_unavailable"));
    await render(api);
    expect(host.textContent).toContain(read === "config"
      ? "Current request requirements are unavailable. Submission remains closed." : "The current catalog could not be confirmed.");
    expect(host.textContent).not.toContain("This request was not saved.");
    expect(host.textContent).not.toContain("Request intake is unavailable right now");
    expect(sessionStorage.length).toBe(0); expect(api.submit).not.toHaveBeenCalled();
  });
});

describe("private request queue pagination", () => {
  function page(number: number): RequestIntentQueuePage {
    return { page: number, pageSize: 25, total: 51,
      items: Array.from({ length: number === 3 ? 1 : 25 }, (_, index) => {
        const requestId = "41000000-0000-4000-8000-" + String((number - 1) * 25 + index + 1).padStart(12, "0");
        return { ...receipt, requestId, publicReference: "XRI-" + requestId.replaceAll("-", "").toUpperCase(), lineCount: 2 };
      }) };
  }
  function deferredPage() {
    let resolve!: (value: RequestIntentQueuePage) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<RequestIntentQueuePage>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  }
  function navigation(text: string) {
    return [...host.querySelectorAll<HTMLButtonElement>('nav[aria-label="Private request pages"] button')]
      .find((button) => button.textContent === text)!;
  }
  async function mountStaff(api: RequestIntentApi) {
    await act(async () => root.render(<RequestIntentStaffReadback api={api} />));
  }
  it("distinguishes a pending first page from a confirmed empty private queue", async () => {
    const api = makeApi(), pending = deferredPage();
    api.staffQueue.mockReturnValueOnce(pending.promise);
    await mountStaff(api);
    expect(host.textContent).toContain("Loading pending requests...");
    expect(host.textContent).not.toContain("Pending requests (0)");
    expect(navigation("Previous requests").disabled).toBe(true);
    expect(navigation("Next requests").disabled).toBe(true);
    expect(host.querySelector('input')).toBeTruthy();
    await act(async () => pending.resolve({ items: [], total: 0, page: 1, pageSize: 25 }));
    expect(host.textContent).not.toContain("Loading pending requests...");
    expect(host.textContent).toContain("No pending requests were returned for this page.");
    expect(navigation("Next requests").disabled).toBe(true);
    expect(api.staffQueue.mock.calls.map(([requested]) => requested)).toEqual([1]);
  });
  it("removes old rows and prevents skipped pages while the next private page is pending", async () => {
    const api = makeApi(), pending = deferredPage();
    api.staffQueue.mockResolvedValueOnce(page(1)).mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(page(3));
    await mountStaff(api);
    expect(host.textContent).toContain(page(1).items[0].publicReference);
    await click("Next requests");
    expect(host.textContent).not.toContain(page(1).items[0].publicReference);
    expect(host.textContent).toContain("Loading pending requests...");
    expect(navigation("Previous requests").disabled).toBe(true);
    expect(navigation("Next requests").disabled).toBe(true);
    await click("Next requests");
    expect(api.staffQueue.mock.calls.map(([requested]) => requested)).toEqual([1, 2]);
    await act(async () => pending.resolve(page(2)));
    expect(host.textContent).toContain(page(2).items[0].publicReference);
    expect(host.textContent).not.toContain(page(1).items[0].publicReference);
    expect(navigation("Previous requests").disabled).toBe(false);
    expect(navigation("Next requests").disabled).toBe(false);
    await click("Next requests");
    expect(host.textContent).toContain(page(3).items[0].publicReference);
    expect(navigation("Next requests").disabled).toBe(true);
    expect(api.staffQueue.mock.calls.map(([requested]) => requested)).toEqual([1, 2, 3]);
  });
  it("retries only the failed page without retaining old rows or advancing it", async () => {
    const api = makeApi(), retry = deferredPage();
    api.staffQueue.mockResolvedValueOnce(page(1)).mockRejectedValueOnce(new Error("synthetic unavailable"))
      .mockReturnValueOnce(retry.promise);
    await mountStaff(api);
    await click("Next requests");
    expect(host.textContent).not.toContain(page(1).items[0].publicReference);
    expect(host.textContent).toContain("Private queue access could not be confirmed.");
    expect(navigation("Previous requests").disabled).toBe(false);
    expect(navigation("Next requests").disabled).toBe(true);
    await click("Retry this page");
    expect(host.textContent).toContain("Loading pending requests...");
    expect(host.textContent).not.toContain("Private queue access could not be confirmed.");
    expect(api.staffQueue.mock.calls.map(([requested]) => requested)).toEqual([1, 2, 2]);
    expect(navigation("Previous requests").disabled).toBe(true);
    await act(async () => retry.resolve(page(2)));
    expect(host.textContent).toContain(page(2).items[0].publicReference);
    expect(host.textContent).not.toContain(page(1).items[0].publicReference);
    expect(api.submit).not.toHaveBeenCalled();
    expect(api.recover).not.toHaveBeenCalled();
  });
  it("keeps queue failure separate from saved-reference validation and detail retrieval", async () => {
    const api = makeApi();
    api.staffQueue.mockRejectedValueOnce(new Error("synthetic denied")).mockResolvedValueOnce(page(1));
    api.staff.mockResolvedValue({ ...receipt, contact: { fullLegalName: "Synthetic private readback",
      email: "fixture@example.invalid", mobilePhone: "+15555550123" }, lines: [], agreements: [] });
    await mountStaff(api);
    await type(host.querySelector("input")!, "invalid");
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(host.textContent).toContain("Enter the saved request reference.");
    expect(host.textContent).toContain("Private queue access could not be confirmed.");
    await type(host.querySelector("input")!, reference);
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(host.textContent).toContain("Synthetic private readback");
    expect(host.textContent).toContain("Private queue access could not be confirmed.");
    expect(api.staff).toHaveBeenCalledTimes(1);
    expect(api.staff).toHaveBeenCalledWith(receipt.requestId);
    await click("Retry this page");
    expect(host.textContent).not.toContain("Private queue access could not be confirmed.");
    expect(host.textContent).toContain("Synthetic private readback");
    expect(api.staff).toHaveBeenCalledTimes(1);
    // Choosing a queue row fills the reference; detail access still needs Retrieve.
    await click(page(1).items[0].publicReference);
    expect(host.querySelector<HTMLInputElement>("input")!.value).toBe(page(1).items[0].publicReference);
    expect(host.textContent).not.toContain("Synthetic private readback");
    expect(api.staff).toHaveBeenCalledTimes(1);
  });
  it("ignores an obsolete queue response after the existing staff view is unmounted", async () => {
    const api = makeApi(), old = deferredPage(), replacement = makeApi();
    api.staffQueue.mockReturnValueOnce(old.promise);
    await mountStaff(api);
    await act(async () => root.render(<p>Session boundary fixture</p>));
    await mountStaff(replacement);
    await act(async () => old.resolve(page(1)));
    expect(host.textContent).not.toContain(page(1).items[0].publicReference);
    expect(replacement.staffQueue).toHaveBeenCalledTimes(1);
    expect(replacement.staffQueue).toHaveBeenCalledWith(1);
    expect(api.staff).not.toHaveBeenCalled();
  });
});

describe("confirmed reference continuation", () => {
  const uncertainMarker = JSON.stringify({ key: "10000000-0000-4000-8000-000000000001", acceptedAt: "2026-10-14T12:00:00Z", state: "uncertain" });
  async function remount(element: Parameters<Root["render"]>[0]) {
    await act(async () => root.unmount()); host.remove();
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root.render(element));
  }
  it("keeps only the non-secret reference record, under the mount's owner, after a confirmed submission and after a recovered one", async () => {
    const api = makeApi();
    await prepare(api);
    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} ownerKey="owner-a" />));
    await click("Request a quote");
    expect(host.textContent).toContain(reference); expectOnlyReferenceRecord("owner-a");
    expect(host.textContent).not.toContain("confirmed earlier in this browser tab");
    sessionStorage.clear(); sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, uncertainMarker);
    await remount(<RequestIntentForm api={makeApi()} storage={sessionStorage} ownerKey="owner-b" />);
    await click("Check saved request");
    expect(host.textContent).toContain(reference); expectOnlyReferenceRecord("owner-b");
    expect(host.textContent).not.toContain("confirmed earlier in this browser tab");
  });
  it("shows a fresh form on an in-page remount of the same page load and keeps the record for a later load", async () => {
    const api = makeApi();
    await prepare(api); await click("Request a quote");
    const replacement = makeApi();
    await remount(<RequestIntentForm api={replacement} storage={sessionStorage} />);
    expect(host.textContent).toContain("Build your request");
    expect(host.textContent).not.toContain(reference);
    expect(replacement.catalog).toHaveBeenCalledTimes(1);
    expectOnlyReferenceRecord();
  });
  it("reopens the confirmed reference for the same owner after a reload without reading or publishing again", async () => {
    const api = makeApi();
    await prepare(api); await click("Request a quote");
    simulateReload();
    const replacement = makeApi(), confirmed = vi.fn(), steps = vi.fn();
    await remount(<RequestIntentForm api={replacement} storage={sessionStorage} onConfirmedReceipt={confirmed} onStepChange={steps}
      entryIntent={{ family: "research_peptides_materials", slug: "research", variantId: "research-source", quantity: 1, action: "REQUEST_QUOTE" }} />);
    expect(host.textContent).toContain("Your submitted request");
    expect(steps).toHaveBeenLastCalledWith("review");
    expect(host.textContent).toContain(reference);
    expect(host.textContent).toContain("This reference was confirmed earlier in this browser tab. Nothing was sent again.");
    expect(replacement.config).not.toHaveBeenCalled(); expect(replacement.catalog).not.toHaveBeenCalled();
    expect(replacement.recover).not.toHaveBeenCalled(); expect(replacement.submit).not.toHaveBeenCalled();
    expect(confirmed).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
    expectOnlyReferenceRecord();
  });
  it("discards another owner's record and renders a fresh form", async () => {
    const api = makeApi();
    await prepare(api); await click("Request a quote");
    simulateReload();
    const replacement = makeApi();
    await remount(<RequestIntentForm api={replacement} storage={sessionStorage} ownerKey="owner-b" />);
    expect(host.textContent).toContain("Build your request");
    expect(host.textContent).not.toContain(reference);
    expect(replacement.catalog).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0);
  });
  it("lets an uncertain attempt take precedence over a reopened reference", async () => {
    const api = makeApi();
    await prepare(api); await click("Request a quote");
    simulateReload(); sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, uncertainMarker);
    const replacement = makeApi();
    await remount(<RequestIntentForm api={replacement} storage={sessionStorage} />);
    expect(host.textContent).toContain("Check your earlier request");
    expect(host.textContent).not.toContain("confirmed earlier in this browser tab");
    expect(replacement.catalog).not.toHaveBeenCalled(); expect(replacement.recover).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(REQUEST_INTENT_RECEIPT_RECORD_KEY)).not.toBeNull();
  });
  it("starts another request from a clean session with a new attempt key", async () => {
    const api = makeApi();
    await prepare(api); await click("Request a quote");
    const first = api.submit.mock.calls[0][0];
    await click("Start another request");
    expect(host.textContent).toContain("Build your request");
    expect(document.activeElement).toBe(host.querySelector("h1"));
    expect(host.textContent).toContain("0 products | 0 exact variants | 0 requested units");
    expect(host.textContent).not.toContain(reference);
    expect(sessionStorage.length).toBe(0);
    expect(api.catalog).toHaveBeenCalledTimes(2); expect(api.config).toHaveBeenCalledTimes(2);
    await prepare(api); await click("Request a quote");
    expect(api.submit).toHaveBeenCalledTimes(2);
    expect(api.submit.mock.calls[1][0].idempotencyKey).not.toBe(first.idempotencyKey);
    expect(host.textContent).toContain(reference); expectOnlyReferenceRecord();
  });
  it("starts another request from a reopened receipt too, forgetting the record and focusing the fresh form", async () => {
    const api = makeApi();
    await prepare(api); await click("Request a quote");
    simulateReload();
    const replacement = makeApi();
    await remount(<RequestIntentForm api={replacement} storage={sessionStorage} />);
    expect(host.textContent).toContain("confirmed earlier in this browser tab");
    await click("Start another request");
    expect(host.textContent).toContain("Build your request");
    expect(document.activeElement).toBe(host.querySelector("h1"));
    expect(sessionStorage.length).toBe(0);
    expect(replacement.catalog).toHaveBeenCalledTimes(1); expect(replacement.config).toHaveBeenCalledTimes(1);
  });
  it("shows the confirmation even when the reference record cannot be stored", async () => {
    const api = makeApi(), confirmed = vi.fn();
    const original = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === REQUEST_INTENT_RECEIPT_RECORD_KEY) throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, key, value);
    });
    try {
      await prepare(api);
      await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} onConfirmedReceipt={confirmed} />));
      await click("Request a quote");
      expect(host.textContent).toContain(reference);
      expect(confirmed).toHaveBeenCalledWith(receipt);
      expect(sessionStorage.length).toBe(0);
    } finally { setItem.mockRestore(); }
  });
});


describe("agreement-standing refresh preserves the current request", () => {
  it("notifies once after a proven first refusal and keeps the exact draft", async () => {
    const api = makeApi();
    await prepare(api, true, true);
    const refresh = vi.fn();
    const renderSameForm = async (enabled: boolean) => {
      await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage}
        embedded continuationEnabled={enabled} onAgreementStandingRequired={refresh} />));
    };
    await renderSameForm(true);
    api.submit.mockRejectedValueOnce(new RequestIntentHttpError(403, "agreement_standing_required"));
    await click("Request a quote");
    const first = api.submit.mock.calls[0][0];
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    expect(host.textContent).toContain("Your selections and contact details are still on this page");
    expect(host.textContent).toContain("Synthetic Customer");
    expect(host.textContent).toContain("Requested quantity: 2");
    expect([...host.querySelectorAll<HTMLInputElement>("fieldset input[type=checkbox]")]
      .every((input) => !input.checked)).toBe(true);
    await renderSameForm(false);
    const submit = [...host.querySelectorAll("button")].find((button) => button.textContent === "Request a quote");
    expect(submit?.disabled).toBe(true);
    await renderSameForm(true);
    expect(api.submit).toHaveBeenCalledTimes(1);
    const newConfig = await api.config();
    api.config.mockResolvedValue({ ...newConfig,
      legal: [{ kind: "fixture-terms", version: "fixture-v2", label: "Current synthetic legal requirement" }] });
    await click("Refresh requirements");
    // Reacceptance alone is insufficient: the request acknowledgments remain unchecked.
    expect([...host.querySelectorAll("button")].find((button) => button.textContent === "Request a quote")?.disabled).toBe(true);
    await act(async () => host.querySelectorAll<HTMLInputElement>("fieldset input[type=checkbox]").forEach((input) => input.click()));
    await click("Request a quote");
    const second = api.submit.mock.calls[1][0];
    expect(second.contact).toEqual(first.contact);
    expect(second.lines).toEqual(first.lines);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(second.agreements.find((entry) => entry.kind === "fixture-terms")?.version).toBe("fixture-v2");
    expect(api.submit).toHaveBeenCalledTimes(2);
  });

  it("never refreshes or replaces a previously uncertain request", async () => {
    const api = makeApi();
    await prepare(api);
    const refresh = vi.fn();
    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage}
      onAgreementStandingRequired={refresh} />));
    api.submit.mockRejectedValueOnce(new Error("Synthetic lost reply"));
    await click("Request a quote");
    const first = api.submit.mock.calls[0][0];
    const marker = sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    expect(marker).not.toBeNull();
    api.submit.mockRejectedValueOnce(new RequestIntentHttpError(403, "agreement_standing_required"));
    await click("Retry same request");
    expect(refresh).not.toHaveBeenCalled();
    expect(api.submit.mock.calls[1][0]).toBe(first);
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(marker);
    expect(host.textContent).toContain("Retry same request");
  });

  it.each([
    [403, "access_denied"], [401, "session_required"], [429, "rate_limited"],
    [400, "current_acknowledgments_required"], [503, "request_intent_unavailable"],
  ])("does not treat %s/%s as a policy-refresh signal", async (status, code) => {
    const api = makeApi();
    await prepare(api);
    const refresh = vi.fn();
    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage}
      onAgreementStandingRequired={refresh} />));
    api.submit.mockRejectedValueOnce(new RequestIntentHttpError(status, code));
    await click("Request a quote");
    expect(refresh).not.toHaveBeenCalled();
    expect(api.submit).toHaveBeenCalledTimes(1);
  });
});

it("replaces a stale selected HCG row after a catalog hold, keeps it in the request with the strength withheld, and submits it", async () => {
  const api = makeApi();
  const hcg: RequestIntentCatalogItem = {
    ...item("stale-hcg", false), productName: "HCG", specification: "HCG(120000iu)",
    sourceSelection: {
      family: HCG_STRENGTH_REVIEW.family, slug: HCG_STRENGTH_REVIEW.legacySlug,
      variantId: HCG_STRENGTH_REVIEW.variantId,
    },
  };
  const sibling = item("sibling", false);
  const firstPage = { ...await api.catalog(), items: [hcg, sibling] };
  api.catalog.mockResolvedValue(firstPage);
  await render(api);
  await click("Add HCG to quote cart");
  await click("Add Synthetic sibling to quote cart");
  await click("Continue to details");
  await fillBaseContact();
  await act(async () => host.querySelector<HTMLInputElement>('input[name="age"]')!.click());

  api.catalog.mockResolvedValue({
    ...firstPage, items: [{
      // Held is a review reason, not a refusal: the server still lists the row as selectable.
      ...hcg, specification: HCG_STRENGTH_REVIEW.specification, selectableForReview: true,
      intentExclusion: "specification_review", actionLabel: HCG_STRENGTH_REVIEW.actionLabel,
      sourceSelection: { family: HCG_STRENGTH_REVIEW.family, slug: HCG_STRENGTH_REVIEW.slug,
        variantId: HCG_STRENGTH_REVIEW.variantId },
    }, sibling],
  });
  await render({ ...api });
  const contactForm = host.querySelector("form")!;
  expect(contactForm.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  await click("Back to products");
  const summary = host.querySelector('aside[aria-label="Selected request items"]')!;
  expect(summary.textContent).toContain(HCG_STRENGTH_REVIEW.actionLabel);
  expect(summary.textContent).not.toContain("120000");
  expect(summary.textContent).toContain("Synthetic sibling");
  expect(summary.textContent).not.toContain("Remove this selection to continue");
  expect([...summary.querySelectorAll("button")]
    .find((button) => button.textContent === "Continue to details")?.disabled).toBe(false);
  // The request bar offers the same continue action; it takes a held selection forward too.
  const barContinue = document.querySelector<HTMLButtonElement>('[data-testid="request-action-bar-primary"]')!;
  expect(barContinue.textContent).toBe("Continue to details");
  await act(async () => barContinue.click());
  expect(host.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe("Synthetic Customer");
  const age = host.querySelector<HTMLInputElement>('input[name="age"]')!;
  if (!age.checked) await act(async () => age.click());
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => host.querySelectorAll<HTMLInputElement>("fieldset input[type=checkbox]").forEach((entry) => entry.click()));
  expect(host.textContent).toContain(HCG_STRENGTH_REVIEW.actionLabel);
  expect(host.textContent).not.toContain("120000");
  await click("Request a quote");
  // One request carries both lines: the held listing and its sibling.
  expect(api.submit).toHaveBeenCalledTimes(1);
  const sent = api.submit.mock.calls[0][0] as { lines: readonly { productId: string; quantity: number }[] };
  expect(sent.lines.map((line) => line.productId)).toEqual([hcg.productId, sibling.productId]);
  expect(JSON.stringify(sent)).not.toContain("120000");
});

it.each(["cached", "in-flight"] as const)(
  "keeps a %s HCG link requestable in its held form after a first selection refusal",
  async (linkTiming) => {
    const api = makeApi();
    const basePage = await api.catalog();
    const sourceSelection = {
      family: HCG_STRENGTH_REVIEW.family, slug: HCG_STRENGTH_REVIEW.legacySlug,
      variantId: HCG_STRENGTH_REVIEW.variantId,
    };
    const hcg = { ...item("research", false), specification: "HCG(120000iu)", sourceSelection };
    const firstPage = { ...basePage, items: [item("clinical", true), hcg] };
    const linkPage = { ...basePage, items: [hcg], total: 1, pageSize: 100 };
    let resolveLink!: (page: typeof linkPage) => void;
    const pendingLink = new Promise<typeof linkPage>((resolve) => { resolveLink = resolve; });
    const linkedApi: RequestIntentApi = {
      ...api,
      catalog: async (query) => query.pageSize === 100
        ? (linkTiming === "in-flight" ? pendingLink : linkPage) : firstPage,
    };
    api.submit.mockRejectedValueOnce(new RequestIntentHttpError(400, "selection_requires_refresh"));
    await act(async () => root.render(<RequestIntentForm api={linkedApi} storage={sessionStorage}
      entryIntent={{ ...sourceSelection, quantity: 2, action: "ASSISTED_ORDER" }} />));
    await click("Add Synthetic clinical to quote cart");
    await click(linkTiming === "cached" ? "Add linked selection for review" : "Add Synthetic research to quote cart");
    await click("Continue to details");
    await fillBaseContact();
    await act(async () => host.querySelector<HTMLInputElement>('input[name="age"]')!.click());
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => host.querySelectorAll<HTMLInputElement>("fieldset input[type=checkbox]").forEach((entry) => entry.click()));
    await click("Request a quote");

    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    expect(host.textContent).not.toContain("120000");
    await click("Edit selection");
    expect(host.textContent).not.toContain("120000");
    expect(host.textContent).toContain(HCG_STRENGTH_REVIEW.actionLabel);
    // The held listing stays in the request; nothing forces the customer to remove it.
    const summary = host.querySelector('aside[aria-label="Selected request items"]')!;
    expect(summary.textContent).toContain("Synthetic research");
    expect(summary.textContent).toContain(HCG_STRENGTH_REVIEW.specification);
    await click("Remove", "Remove selected Synthetic research " + HCG_STRENGTH_REVIEW.specification);
    expect(summary.textContent).not.toContain("Synthetic research");
    if (linkTiming === "in-flight") await act(async () => resolveLink(linkPage));
    // The link still offers the listing, in its held form.
    const link = host.querySelector('section[aria-label="Selection from your link"]')!;
    expect(link.textContent).toContain(HCG_STRENGTH_REVIEW.actionLabel);
    expect(link.textContent).not.toContain("120000");
    await act(async () => link.querySelector("button")!.click());
    expect(summary.textContent).toContain("Synthetic research");
    expect(summary.textContent).toContain(HCG_STRENGTH_REVIEW.specification);
    expect(summary.textContent).toContain("Synthetic clinical");
    expect(host.textContent).not.toContain("120000");
    await click("Continue to details");
    expect(host.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe("Synthetic Customer");
    expect(api.submit).toHaveBeenCalledTimes(1);
  },
);

it("shows Details under review for a row whose action label the quote-only list replaced", async () => {
  const api = makeApi();
  const underReview: RequestIntentCatalogItem = {
    ...item("review", false), intentExclusion: "specification_review",
    // What the quote-only list sends for this workflow: the quote wording, not the status.
    actionLabel: "Request a quote", reviewMessage: "A synthetic reviewed sentence for this listing.",
  };
  api.catalog.mockResolvedValue({ ...await api.catalog(), items: [underReview] });
  await render(api);
  const card = host.querySelector("article")!;
  expect(card.textContent).toContain("Details under review.");
  expect(card.textContent).toContain("A synthetic reviewed sentence for this listing.");
  await click("Add Synthetic review to quote cart");
  const summary = host.querySelector('aside[aria-label="Selected request items"]')!;
  expect(summary.textContent).toContain("Details under review");
  expect(summary.textContent).toContain("Synthetic review");
});

it("shows the reviewed sentence on a row that cannot be added yet", async () => {
  const api = makeApi();
  const comingSoon: RequestIntentCatalogItem = {
    ...item("later", false), selectableForReview: false, intentExclusion: "coming_soon",
    actionLabel: "Coming soon", reviewMessage: "A synthetic reviewed sentence for a listing that is coming soon.",
  };
  api.catalog.mockResolvedValue({ ...await api.catalog(), items: [comingSoon] });
  await render(api);
  const card = host.querySelector("article")!;
  expect(card.textContent).toContain("Coming soon");
  // The status and the sentence read as two sentences, not one run-on.
  expect(card.textContent).toContain("Coming soon. A synthetic reviewed sentence for a listing that is coming soon.");
  // It still cannot be added.
  expect([...card.querySelectorAll("button")].some((button) => button.textContent?.startsWith("Add "))).toBe(false);
});

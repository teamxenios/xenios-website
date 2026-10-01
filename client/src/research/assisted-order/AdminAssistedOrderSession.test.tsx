// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistedOrderAdminDetail, AssistedOrderAdminListItem } from "../../../../shared/research/assisted-order/contract";
import type { AssistedOrderAdminListPage } from "./api";

const session = vi.hoisted(() => ({
  state: "ready" as "ready" | "loading" | "unconfigured" | "signed_out",
  token: "synthetic-admin-a" as string | null,
}));
const api = vi.hoisted(() => ({
  loadAssistedOrderAdminDetail: vi.fn(),
  loadAssistedOrderAdminList: vi.fn(),
  updateAssistedOrderStatus: vi.fn(),
  createAssistedOrderDocumentDownload: vi.fn(),
}));

// Keep the mounted page real. Only the existing browser session and canonical
// API boundaries are synthetic. This does not verify hosted Auth, JWTs, RLS or
// server authorization, and no document URL is actually opened.
vi.mock("../pages/adminx/auth", () => ({ useAdminSession: () => session }));
vi.mock("./api", async (original) => ({ ...await original<typeof import("./api")>(), ...api }));
vi.mock("./assisted-order.css", () => ({}));

import { AdminAssistedOrderDetailPage } from "./AdminAssistedOrderDetail";
import { AdminAssistedOrderQueue } from "./AdminAssistedOrderQueue";
import { AssistedOrderApiError } from "./api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const requestId = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
const detailA: AssistedOrderAdminDetail = {
  requestId,
  publicReference: "XRR-20261001-ABCDEF1234",
  status: "submitted",
  source: "early_access_manual_order_bridge",
  actorMemberId: null,
  fullLegalName: "Synthetic Customer A",
  email: "synthetic-customer-a@example.invalid",
  mobilePhone: "+1 555 010 0101",
  organizationName: "Synthetic Organization A",
  shippingAddress: { line1: "Synthetic address A", city: "Test City", region: "MA", postalCode: "00000", countryCode: "US" },
  billingAddress: { line1: "Synthetic address A", city: "Test City", region: "MA", postalCode: "00000", countryCode: "US" },
  lines: [],
  estimatedTotalCents: null,
  currency: "USD",
  generalNotes: "Synthetic private customer note A",
  agreements: [],
  affiliateAttributionRef: null,
  declaredAffiliateCode: null,
  declaredAffiliateCodeState: "not_provided",
  timeline: [],
  documents: [{ documentId, documentType: "government_id", side: "front", fileName: "synthetic-id-a.pdf", status: "accepted", uploadedAt: "2026-10-01T12:00:00.000Z" }],
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
};
const ticketA = { url: "https://example.invalid/synthetic-document-a", expiresAt: "2026-10-01T12:05:00.000Z" };
const detailB: AssistedOrderAdminDetail = {
  ...detailA,
  publicReference: "XRR-20261001-BBBBBB1234",
  fullLegalName: "Synthetic Customer B",
  email: "synthetic-customer-b@example.invalid",
  organizationName: "Synthetic Organization B",
  shippingAddress: { ...detailA.shippingAddress, line1: "Synthetic address B" },
  generalNotes: "Synthetic private customer note B",
  documents: [{ ...detailA.documents[0], fileName: "synthetic-id-b.pdf" }],
};

function queuePage(detail: AssistedOrderAdminDetail, total = 1, page = 1): AssistedOrderAdminListPage {
  const item: AssistedOrderAdminListItem = {
    requestId: detail.requestId,
    publicReference: detail.publicReference,
    status: detail.status,
    fullLegalName: detail.fullLegalName,
    email: detail.email,
    mobilePhone: detail.mobilePhone,
    organizationName: detail.organizationName,
    lineCount: 1,
    totalQuantity: 1,
    estimatedTotalCents: detail.estimatedTotalCents,
    workflowModes: ["direct_order_request"],
    identityDocumentStatus: "accepted",
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
  return { items: [item], total, page, pageSize: 25 };
}

let host: HTMLDivElement;
let root: Root;
let mounted: boolean;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function renderDetail() {
  await act(async () => { root.render(<AdminAssistedOrderDetailPage />); });
  await flush();
}

async function renderQueue() {
  await act(async () => { root.render(<AdminAssistedOrderQueue />); });
  await flush();
}

async function advanceQueue() {
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  await flush();
}

function unmountSurface() {
  act(() => root.unmount());
  mounted = false;
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll("button")).find((node) => node.textContent === label);
}

function click(label: string) {
  const target = button(label);
  expect(target).toBeDefined();
  act(() => { target!.click(); });
}

function field<T extends HTMLElement>(label: string, selector: string): T {
  const owner = Array.from(host.querySelectorAll("label")).find((node) => node.firstChild?.textContent?.trim() === label);
  const control = owner?.querySelector<T>(selector);
  expect(control).toBeDefined();
  expect(control).not.toBeNull();
  return control!;
}

function change(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  expect(setter).toBeDefined();
  act(() => {
    setter!.call(control, value);
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

function submitTwice() {
  const form = host.querySelector("form");
  expect(form).not.toBeNull();
  act(() => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function expectNoCustomerA() {
  expect(host.textContent).not.toContain(detailA.fullLegalName);
  expect(host.textContent).not.toContain(detailA.email);
  expect(host.textContent).not.toContain(detailA.shippingAddress.line1);
  expect(host.textContent).not.toContain("synthetic-id-a.pdf");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  session.state = "ready";
  session.token = "synthetic-admin-a";
  api.loadAssistedOrderAdminDetail.mockResolvedValue(detailA);
  api.loadAssistedOrderAdminList.mockResolvedValue(queuePage(detailA));
  api.updateAssistedOrderStatus.mockResolvedValue({ ...detailA, status: "reviewing" });
  api.createAssistedOrderDocumentDownload.mockResolvedValue(ticketA);
  vi.spyOn(window, "open").mockReturnValue(null);
  window.history.replaceState({}, "", `/admin/research/assisted-orders/${requestId}`);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mounted = true;
});

afterEach(() => {
  if (mounted) unmountSurface();
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe("mounted assisted-order admin session isolation", () => {
  it("removes loaded customer contact and document data when the session becomes signed out", async () => {
    await renderDetail();
    expect(host.textContent).toContain(detailA.fullLegalName);
    expect(host.textContent).toContain(detailA.email);
    expect(button("Open securely")).toBeDefined();

    session.state = "signed_out";
    session.token = null;
    await renderDetail();

    expect(host.textContent).not.toContain(detailA.fullLegalName);
    expect(host.textContent).not.toContain(detailA.email);
    expect(host.textContent).not.toContain(detailA.shippingAddress.line1);
    expect(host.textContent).not.toContain("synthetic-id-a.pdf");
    expect(host.querySelector("form")).toBeNull();
    expect(button("Open securely")).toBeUndefined();
    expect(api.loadAssistedOrderAdminDetail).toHaveBeenCalledTimes(1);
  });

  it("does not open a delayed identity-document ticket after sign-out", async () => {
    const pendingTicket = deferred<typeof ticketA>();
    api.createAssistedOrderDocumentDownload.mockReturnValue(pendingTicket.promise);
    await renderDetail();
    const open = button("Open securely");
    expect(open).toBeDefined();
    act(() => { open!.click(); });
    expect(api.createAssistedOrderDocumentDownload).toHaveBeenCalledWith("synthetic-admin-a", requestId, documentId);

    session.state = "signed_out";
    session.token = null;
    await renderDetail();
    pendingTicket.resolve(ticketA);
    await flush();

    expect(window.open).not.toHaveBeenCalled();
  });

  it.each([
    { state: "ready" as const, token: null },
    { state: "loading" as const, token: "synthetic-stale-token" },
    { state: "unconfigured" as const, token: "synthetic-stale-token" },
    { state: "signed_out" as const, token: "synthetic-stale-token" },
  ])("requires both ready state and a token on each surface: $state/$token", async (unavailable) => {
    session.state = unavailable.state;
    session.token = unavailable.token;
    await renderDetail();
    expectNoCustomerA();
    expect(host.querySelector("form")).toBeNull();
    expect(button("Open securely")).toBeUndefined();
    await renderQueue();
    await advanceQueue();
    expectNoCustomerA();
    expect(host.querySelector('input[type="search"]')).toBeNull();
    expect(api.loadAssistedOrderAdminDetail).not.toHaveBeenCalled();
    expect(api.loadAssistedOrderAdminList).not.toHaveBeenCalled();
    expect(api.updateAssistedOrderStatus).not.toHaveBeenCalled();
    expect(api.createAssistedOrderDocumentDownload).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)("discards an old detail GET that later %ss after token rotation and denial", async (outcome) => {
    const oldRead = deferred<AssistedOrderAdminDetail>();
    const newRead = deferred<AssistedOrderAdminDetail>();
    api.loadAssistedOrderAdminDetail.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise);
    await renderDetail();
    session.token = "synthetic-admin-b";
    await renderDetail();
    expectNoCustomerA();
    expect(api.loadAssistedOrderAdminDetail).toHaveBeenLastCalledWith("synthetic-admin-b", requestId);
    newRead.reject(new AssistedOrderApiError(403, "forbidden", "Synthetic private denial B"));
    await flush();
    if (outcome === "resolve") oldRead.resolve(detailA);
    else oldRead.reject(new Error("Synthetic stale detail error A"));
    await flush();
    expectNoCustomerA();
    expect(host.textContent).not.toContain("Synthetic stale detail error A");
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("does not revive an old generation when the token changes A to B to A", async () => {
    const firstA = deferred<AssistedOrderAdminDetail>();
    const b = deferred<AssistedOrderAdminDetail>();
    const secondA = deferred<AssistedOrderAdminDetail>();
    api.loadAssistedOrderAdminDetail.mockReturnValueOnce(firstA.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(secondA.promise);
    await renderDetail();
    session.token = "synthetic-admin-b";
    await renderDetail();
    session.token = "synthetic-admin-a";
    await renderDetail();
    const fresh = { ...detailB, fullLegalName: "Synthetic fresh A generation" };
    secondA.resolve(fresh);
    await flush();
    firstA.resolve(detailA);
    b.reject(new Error("Synthetic abandoned B error"));
    await flush();
    expect(host.textContent).toContain(fresh.fullLegalName);
    expectNoCustomerA();
    expect(host.textContent).not.toContain("Synthetic abandoned B error");
    expect(api.loadAssistedOrderAdminDetail).toHaveBeenCalledTimes(3);
  });

  it.each(["resolve", "reject"] as const)("keeps the new session draft and busy state when an old PATCH %ss", async (outcome) => {
    const oldPatch = deferred<AssistedOrderAdminDetail>();
    const newPatch = deferred<AssistedOrderAdminDetail>();
    api.loadAssistedOrderAdminDetail.mockResolvedValueOnce(detailA).mockResolvedValueOnce(detailB);
    api.updateAssistedOrderStatus.mockReturnValueOnce(oldPatch.promise).mockReturnValueOnce(newPatch.promise);
    await renderDetail();
    change(field<HTMLTextAreaElement>("Customer message", "textarea"), "Synthetic old session draft");
    click("Update status");

    session.token = "synthetic-admin-b";
    await renderDetail();
    expectNoCustomerA();
    expect(field<HTMLTextAreaElement>("Customer message", "textarea").value).toBe("");
    change(field<HTMLTextAreaElement>("Customer message", "textarea"), "Synthetic new session draft");
    click("Update status");
    expect(button("Updating…")?.disabled).toBe(true);
    if (outcome === "resolve") oldPatch.resolve({ ...detailA, status: "reviewing" });
    else oldPatch.reject(new AssistedOrderApiError(403, "forbidden", "Synthetic stale PATCH denial A"));
    await flush();

    expectNoCustomerA();
    expect(host.textContent).toContain(detailB.fullLegalName);
    expect(host.textContent).not.toContain("Synthetic stale PATCH denial A");
    expect(field<HTMLTextAreaElement>("Customer message", "textarea").value).toBe("Synthetic new session draft");
    expect(button("Updating…")?.disabled).toBe(true);
    expect(api.updateAssistedOrderStatus.mock.calls.map((call) => call[0])).toEqual(["synthetic-admin-a", "synthetic-admin-b"]);
    newPatch.resolve({ ...detailB, status: "reviewing" });
    await flush();
    expect(button("Update status")?.disabled).toBe(false);
    expect(field<HTMLTextAreaElement>("Customer message", "textarea").value).toBe("");
  });

  it.each(["resolve", "reject"] as const)("ignores a document ticket that %ss for an old token", async (outcome) => {
    const oldTicket = deferred<typeof ticketA>();
    api.createAssistedOrderDocumentDownload.mockReturnValue(oldTicket.promise);
    api.loadAssistedOrderAdminDetail.mockResolvedValueOnce(detailA).mockResolvedValueOnce(detailB);
    await renderDetail();
    click("Open securely");
    session.token = "synthetic-admin-b";
    await renderDetail();
    if (outcome === "resolve") oldTicket.resolve(ticketA);
    else oldTicket.reject(new AssistedOrderApiError(401, "unauthorized", "Synthetic stale document error A"));
    await flush();
    expect(window.open).not.toHaveBeenCalled();
    expectNoCustomerA();
    expect(host.textContent).toContain(detailB.fullLegalName);
    expect(host.textContent).not.toContain("Synthetic stale document error A");
    expect(button("Update status")).toBeDefined();
  });

  it.each([
    { status: 401, deniedOperation: "patch" },
    { status: 403, deniedOperation: "ticket" },
  ] as const)("latches HTTP $status from $deniedOperation and invalidates parallel work until session changes", async ({ status, deniedOperation }) => {
    const patch = deferred<AssistedOrderAdminDetail>();
    const ticket = deferred<typeof ticketA>();
    api.updateAssistedOrderStatus.mockReturnValue(patch.promise);
    api.createAssistedOrderDocumentDownload.mockReturnValue(ticket.promise);
    await renderDetail();
    click("Open securely");
    click("Update status");
    const refusal = new AssistedOrderApiError(status, "denied", "Synthetic private authority failure");
    if (deniedOperation === "patch") patch.reject(refusal);
    else ticket.reject(refusal);
    await flush();
    expectNoCustomerA();
    expect(host.querySelector("form")).toBeNull();
    expect(button("Open securely")).toBeUndefined();

    if (deniedOperation === "patch") ticket.resolve(ticketA);
    else patch.resolve({ ...detailA, status: "reviewing" });
    await flush();
    await renderDetail();
    expectNoCustomerA();
    expect(window.open).not.toHaveBeenCalled();
    expect(api.loadAssistedOrderAdminDetail).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    api.loadAssistedOrderAdminDetail.mockResolvedValueOnce(detailB);
    session.token = "synthetic-admin-b";
    await renderDetail();
    expect(host.textContent).toContain(detailB.fullLegalName);
    expect(button("Update status")).toBeDefined();
  });

  it("preserves authorized reads, exact update evidence, single submit and secure document opening", async () => {
    const patch = deferred<AssistedOrderAdminDetail>();
    api.updateAssistedOrderStatus.mockReturnValue(patch.promise);
    await renderDetail();
    expect(api.loadAssistedOrderAdminDetail).toHaveBeenCalledWith("synthetic-admin-a", requestId);
    change(field<HTMLSelectElement>("New status", "select"), "shipped");
    change(field<HTMLTextAreaElement>("Customer message", "textarea"), "Synthetic customer update");
    change(field<HTMLTextAreaElement>("Internal note", "textarea"), "Synthetic operator note");
    change(field<HTMLInputElement>("Required canonical evidence or reason", "input"), "synthetic-tracking-reference");
    submitTwice();
    expect(api.updateAssistedOrderStatus).toHaveBeenCalledTimes(1);
    expect(api.updateAssistedOrderStatus).toHaveBeenCalledWith("synthetic-admin-a", requestId, {
      status: "shipped",
      customerMessage: "Synthetic customer update",
      internalNote: "Synthetic operator note",
      evidence: { trackingId: "synthetic-tracking-reference" },
    });
    patch.resolve({ ...detailA, status: "shipped" });
    await flush();
    expect(field<HTMLTextAreaElement>("Customer message", "textarea").value).toBe("");
    expect(field<HTMLTextAreaElement>("Internal note", "textarea").value).toBe("");
    expect(field<HTMLInputElement>("Required canonical evidence or reason", "input").value).toBe("");
    click("Open securely");
    await flush();
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledWith(ticketA.url, "_blank", "noopener,noreferrer");
    expect(host.innerHTML).not.toContain(ticketA.url);
    expect(host.innerHTML).not.toContain("synthetic-admin-a");
  });

  it("discards pending GET, PATCH and ticket callbacks when their mounted detail is gone", async () => {
    const patch = deferred<AssistedOrderAdminDetail>();
    const ticket = deferred<typeof ticketA>();
    const nextRead = deferred<AssistedOrderAdminDetail>();
    api.updateAssistedOrderStatus.mockReturnValue(patch.promise);
    api.createAssistedOrderDocumentDownload.mockReturnValue(ticket.promise);
    api.loadAssistedOrderAdminDetail.mockResolvedValueOnce(detailA).mockReturnValueOnce(nextRead.promise);
    await renderDetail();
    click("Open securely");
    click("Update status");
    session.token = "synthetic-admin-b";
    await renderDetail();
    unmountSurface();
    patch.reject(new Error("Synthetic unmounted PATCH error"));
    ticket.resolve(ticketA);
    nextRead.resolve(detailB);
    await flush();
    expect(host.textContent).toBe("");
    expect(window.open).not.toHaveBeenCalled();
  });

  it("loads the new request path and discards a previous request's PATCH and document ticket", async () => {
    const patch = deferred<AssistedOrderAdminDetail>();
    const ticket = deferred<typeof ticketA>();
    const secondRequestId = "33333333-3333-4333-8333-333333333333";
    api.updateAssistedOrderStatus.mockReturnValue(patch.promise);
    api.createAssistedOrderDocumentDownload.mockReturnValue(ticket.promise);
    api.loadAssistedOrderAdminDetail.mockResolvedValueOnce(detailA).mockResolvedValueOnce({ ...detailB, requestId: secondRequestId });
    await renderDetail();
    click("Open securely");
    click("Update status");
    act(() => { window.history.pushState({}, "", `/admin/research/assisted-orders/${secondRequestId}`); });
    await renderDetail();
    expect(api.loadAssistedOrderAdminDetail).toHaveBeenLastCalledWith("synthetic-admin-a", secondRequestId);
    patch.resolve({ ...detailA, status: "reviewing" });
    ticket.resolve(ticketA);
    await flush();
    expectNoCustomerA();
    expect(host.textContent).toContain(detailB.fullLegalName);
    expect(window.open).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)("discards an old queue result that %ss across session changes", async (outcome) => {
    const oldList = deferred<AssistedOrderAdminListPage>();
    api.loadAssistedOrderAdminList.mockReturnValueOnce(oldList.promise).mockResolvedValueOnce(queuePage(detailB));
    await renderQueue();
    await advanceQueue();
    session.token = "synthetic-admin-b";
    await renderQueue();
    expectNoCustomerA();
    await advanceQueue();
    expect(host.textContent).toContain(detailB.fullLegalName);
    if (outcome === "resolve") oldList.resolve(queuePage(detailA));
    else oldList.reject(new AssistedOrderApiError(403, "forbidden", "Synthetic stale queue denial A"));
    await flush();
    expectNoCustomerA();
    expect(host.textContent).toContain(detailB.fullLegalName);
    expect(host.textContent).not.toContain("Synthetic stale queue denial A");
    expect(api.loadAssistedOrderAdminList.mock.calls.map((call) => call[0])).toEqual(["synthetic-admin-a", "synthetic-admin-b"]);
  });

  it("hides loaded queue rows immediately on sign-out or token rotation before the new result", async () => {
    const pendingB = deferred<AssistedOrderAdminListPage>();
    api.loadAssistedOrderAdminList.mockResolvedValueOnce(queuePage(detailA)).mockReturnValueOnce(pendingB.promise);
    await renderQueue();
    await advanceQueue();
    expect(host.textContent).toContain(detailA.email);
    session.state = "signed_out";
    session.token = null;
    await renderQueue();
    expectNoCustomerA();
    session.state = "ready";
    session.token = "synthetic-admin-b";
    await renderQueue();
    expectNoCustomerA();
    await advanceQueue();
    expectNoCustomerA();
    pendingB.reject(new AssistedOrderApiError(401, "unauthorized", "Synthetic denied B queue"));
    await flush();
    expectNoCustomerA();
    expect(host.querySelector('input[type="search"]')).toBeNull();
  });

  it.each(["resolve", "reject"] as const)("keeps the newest same-session queue search when an older query %ss", async (outcome) => {
    const olderQuery = deferred<AssistedOrderAdminListPage>();
    api.loadAssistedOrderAdminList.mockResolvedValueOnce(queuePage(detailA))
      .mockReturnValueOnce(olderQuery.promise).mockResolvedValueOnce(queuePage(detailB));
    await renderQueue();
    await advanceQueue();
    change(field<HTMLInputElement>("Search", "input"), "older-query");
    expectNoCustomerA();
    await advanceQueue();
    change(field<HTMLInputElement>("Search", "input"), "newer-query");
    await advanceQueue();
    expect(host.textContent).toContain(detailB.fullLegalName);
    if (outcome === "resolve") olderQuery.resolve(queuePage(detailA));
    else olderQuery.reject(new Error("Synthetic stale query failure"));
    await flush();
    expectNoCustomerA();
    expect(host.textContent).toContain(detailB.fullLegalName);
    expect(host.textContent).not.toContain("Synthetic stale query failure");
    expect(field<HTMLInputElement>("Search", "input").value).toBe("newer-query");
  });

  it("preserves authorized queue filters, pagination and exact detail links", async () => {
    api.loadAssistedOrderAdminList.mockResolvedValue(queuePage(detailA, 60));
    await renderQueue();
    await advanceQueue();
    expect(host.querySelector(`a[href="/admin/research/assisted-orders/${requestId}"]`)).not.toBeNull();
    change(field<HTMLInputElement>("Search", "input"), "Synthetic Customer A");
    change(field<HTMLSelectElement>("Status", "select"), "reviewing");
    await advanceQueue();
    expect(api.loadAssistedOrderAdminList).toHaveBeenLastCalledWith("synthetic-admin-a", {
      search: "Synthetic Customer A", status: "reviewing", page: 1, pageSize: 25,
    });
    click("Next");
    expectNoCustomerA();
    await advanceQueue();
    expect(api.loadAssistedOrderAdminList).toHaveBeenLastCalledWith("synthetic-admin-a", {
      search: "Synthetic Customer A", status: "reviewing", page: 2, pageSize: 25,
    });
    expect(button("Previous")?.disabled).toBe(false);
    expect(api.updateAssistedOrderStatus).not.toHaveBeenCalled();
    expect(api.createAssistedOrderDocumentDownload).not.toHaveBeenCalled();
  });

  it("cancels queue debounce and ignores an in-flight list after unmount", async () => {
    const pending = deferred<AssistedOrderAdminListPage>();
    api.loadAssistedOrderAdminList.mockReturnValue(pending.promise);
    await renderQueue();
    await advanceQueue();
    change(field<HTMLInputElement>("Search", "input"), "not-dispatched");
    unmountSurface();
    pending.reject(new Error("Synthetic unmounted queue error"));
    await advanceQueue();
    expect(host.textContent).toBe("");
    expect(api.loadAssistedOrderAdminList).toHaveBeenCalledTimes(1);
  });

  it("loads both mounted surfaces under StrictMode and discards the first simulated detail lifetime", async () => {
    const firstRead = deferred<AssistedOrderAdminDetail>();
    api.loadAssistedOrderAdminDetail.mockReturnValueOnce(firstRead.promise).mockResolvedValueOnce(detailB);
    await act(async () => { root.render(<StrictMode><AdminAssistedOrderDetailPage /></StrictMode>); });
    await flush();
    expect(api.loadAssistedOrderAdminDetail).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain(detailB.fullLegalName);
    firstRead.resolve(detailA);
    await flush();
    expectNoCustomerA();
    expect(button("Update status")).toBeDefined();

    api.loadAssistedOrderAdminList.mockResolvedValue(queuePage(detailB));
    await act(async () => { root.render(<StrictMode><AdminAssistedOrderQueue /></StrictMode>); });
    await advanceQueue();
    expect(api.loadAssistedOrderAdminList).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain(detailB.email);
    expect(host.querySelector(`a[href="/admin/research/assisted-orders/${requestId}"]`)).not.toBeNull();
  });
});

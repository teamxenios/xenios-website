// @vitest-environment jsdom
// Real request form + dock. No transaction reaches a server; every API is synthetic.
// The dock is portaled to the end of the document, after every catalog row, so a
// keyboard customer otherwise tabs past each row to reach it. One control, shown
// only while the dock exists, moves focus to the dock's first usable control.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair } from "../../../../shared/research/assisted-order/form";
import type { RequestIntentCatalogItem, RequestIntentInput, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import { RequestIntentForm } from "./RequestIntentForm";
import type { RequestIntentApi } from "./request-intent-api";
vi.mock("./assisted-order.css", () => ({}));
vi.mock("./persistent-request-bar.css", () => ({}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const item: RequestIntentCatalogItem = { productId: "synthetic", variantId: "synthetic-variant",
  productName: "Synthetic product", family: "research_peptides_materials", channel: "synthetic", specification: "Synthetic selection",
  format: null, packBasis: null, minimumQuantity: 1, maximumQuantity: 10, quantityIncrement: 1,
  unitPriceCents: null, currency: "USD", workflowMode: "request_pricing", actionLabel: "Add to quote cart", accessNotice: null,
  researchUseOnly: true, catalogVersion: "synthetic", priceVersion: null,
  selectableForReview: true, intentExclusion: null, clinicalReviewRequired: false,
  sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access", sourceRefusal: null };
const receipt = { kind: "unapproved_selection_request" as const, requestId: "30000000-0000-4000-8000-000000000001",
  publicReference: "XRI-30000000000040008000000000000001", status: "pending_review" as const, createdAt: "2026-11-05T12:00:00Z" };
function makeApi() {
  return { config: vi.fn(async () => ({ legal: [{ kind: "fixture", version: "v1", label: "Synthetic terms" }],
      form: ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map(ack => ({ id: ack.id, scope: ack.scope, copy: ack.copy, ...assistedOrderFormPair(ack) })) })),
    catalog: vi.fn(async () => ({ items: [item], total: 1, page: 1, pageSize: 24, families: [item.family], channels: [], workflowModes: [] })),
    submit: vi.fn(async (_input: RequestIntentInput): Promise<unknown> => receipt),
    recover: vi.fn(async (_key: string) => receipt), staff: vi.fn(),
    staffQueue: vi.fn(async (): Promise<RequestIntentQueuePage> => ({ items: [], total: 0, page: 1, pageSize: 25 }))
  } satisfies RequestIntentApi;
}
let host: HTMLDivElement, root: Root;
beforeEach(() => { sessionStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); sessionStorage.clear(); vi.restoreAllMocks(); });
const skip = () => host.querySelector<HTMLButtonElement>('[data-testid="skip-to-request-actions"]');
const dock = () => document.querySelector<HTMLElement>('[data-testid="request-action-bar"]');
const primary = () => document.querySelector<HTMLButtonElement>('[data-testid="request-action-bar-primary"]')!;
const summary = () => document.querySelector<HTMLButtonElement>('[data-testid="request-action-bar-summary"]')!;
async function mountGuest() {
  await act(async () => root.render(<RequestIntentForm api={makeApi()} storage={sessionStorage} embedded
    ownerKey="early-access-session" continuationEnabled />));
}
async function mountMember() {
  await act(async () => root.render(<RequestIntentForm api={makeApi()} storage={sessionStorage} embedded ownerKey="synthetic-member" />));
}
async function add() {
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Add to quote cart: Synthetic product, Synthetic selection"]')!.click());
}
/** The customer reaches the control by keyboard and activates it. jsdom has no
 * native Enter-to-click, so this focuses the button and then clicks it. */
async function activate(control: HTMLButtonElement) {
  control.focus(); expect(document.activeElement).toBe(control);
  await act(async () => control.click());
}
/** The dock's first enabled, tabbable control in document order, read from the actual dock. */
function firstUsableDockControl() {
  return Array.from(dock()!.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea"))
    .find(node => !(node as HTMLButtonElement).disabled && node.tabIndex >= 0) ?? null;
}

describe("skip to request actions", () => {
  it("is absent while a guest has no selection and no dock exists", async () => {
    await mountGuest();
    expect(host.querySelector(".xenios-order-card")).not.toBeNull();
    expect(dock()).toBeNull(); expect(skip()).toBeNull();
    expect(host.textContent).not.toContain("Skip to request actions");
  });
  it("appears with the dock, before the catalog rows, as a native button hidden until focused", async () => {
    await mountGuest(); await add();
    expect(dock()).not.toBeNull();
    const control = skip()!;
    expect(control).not.toBeNull();
    expect(control.tagName).toBe("BUTTON"); expect(control.type).toBe("button"); expect(control.disabled).toBe(false);
    expect(control.textContent).toBe("Skip to request actions"); expect(control.tabIndex).toBe(0);
    expect(control.classList.contains("sr-only")).toBe(true); expect(control.classList.contains("focus:not-sr-only")).toBe(true);
    const firstRow = host.querySelector(".xenios-order-card")!;
    expect(control.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The dock itself still comes after every row.
    expect(firstRow.compareDocumentPosition(dock()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("moves focus to the dock's first usable control, and selects nothing", async () => {
    await mountGuest(); await add();
    const before = summary().textContent;
    const target = firstUsableDockControl();
    expect(target).not.toBeNull(); expect(dock()!.contains(target)).toBe(true);
    await activate(skip()!);
    expect(document.activeElement).toBe(target);
    expect(summary().textContent).toBe(before);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('input[name="email"]')).toBeNull();
  });
  it("skips a disabled dock control and leaves focus alone when none is usable", async () => {
    await mountMember();
    expect(dock()).not.toBeNull(); expect(primary().disabled).toBe(true);
    await activate(skip()!);
    expect(document.activeElement).toBe(summary());
    // No usable dock control: focus stays on the skip control instead of falling anywhere else.
    summary().disabled = true;
    await activate(skip()!);
    expect(document.activeElement).toBe(skip());
  });
  it("goes away with the dock when the last selection is removed", async () => {
    await mountGuest(); await add();
    expect(skip()).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label^="Remove Synthetic product"]')!.click());
    expect(dock()).toBeNull(); expect(skip()).toBeNull();
  });
  it("is not shown after the products step, where the form is short", async () => {
    await mountGuest(); await add();
    await act(async () => primary().click());
    expect(host.querySelector('input[name="email"]')).not.toBeNull();
    expect(dock()).not.toBeNull(); expect(skip()).toBeNull();
  });
});

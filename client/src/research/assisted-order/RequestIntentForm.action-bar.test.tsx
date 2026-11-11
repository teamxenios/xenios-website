// @vitest-environment jsdom
// Real request form + dock. No transaction reaches a server; every API is synthetic.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair } from "../../../../shared/research/assisted-order/form";
import type { RequestIntentCatalogItem, RequestIntentInput, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import { RequestIntentForm } from "./RequestIntentForm";
import { RequestIntentHttpError, type RequestIntentApi } from "./request-intent-api";
import { REQUEST_INTENT_ATTEMPT_KEY } from "./request-intent-attempt";
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
beforeEach(() => { sessionStorage.clear(); host=document.createElement("div"); document.body.append(host); root=createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); sessionStorage.clear(); vi.restoreAllMocks(); });
const primary = () => document.querySelector<HTMLButtonElement>('[data-testid="request-action-bar-primary"]')!;
async function mount(api: RequestIntentApi, continuationEnabled=true) {
  await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} embedded
    ownerKey="early-access-session" continuationEnabled={continuationEnabled} />));
}
async function click(button: HTMLButtonElement) { await act(async () => button.click()); }
async function add() { await click(host.querySelector<HTMLButtonElement>('button[aria-label="Add to request: Synthetic product, Synthetic selection"]')!); }
async function prepareReview(api: RequestIntentApi) {
  await mount(api); await add(); await click(primary());
  const values={name:"Synthetic Person",email:"test@example.invalid",phone:"+15555550123",shippingLine1:"1 Test Lane",shippingCity:"Test",shippingRegion:"TX",shippingPostalCode:"00000",shippingCountryCode:"US"};
  for(const [name,value] of Object.entries(values)) {
    const input=host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value); input.dispatchEvent(new Event("input",{bubbles:true})); });
  }
  await act(async () => host.querySelector<HTMLInputElement>('input[name="age"]')!.click());
  // Native validation/form= behavior is also tested in the separate Chromium HTML fixture.
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  await act(async () => host.querySelectorAll<HTMLInputElement>("fieldset input[type=checkbox]").forEach(el=>el.click()));
}
describe("actual request form persistent action wiring", () => {
  it("keeps an empty request accessible without enabling continuation", async () => {
    const api=makeApi();await mount(api);expect(primary().disabled).toBe(true);
    expect(document.querySelector('[data-testid="request-action-bar-summary"]')?.textContent).toContain("(0)");expect(api.submit).not.toHaveBeenCalled();
  });
  it("updates the dock from the existing selected map and reaches contact", async () => {
    const api=makeApi();await mount(api);await add();expect(primary().disabled).toBe(false);
    expect(document.querySelector('[data-testid="request-action-bar-summary"]')?.textContent).toContain("(1)");
    await click(primary());expect(host.querySelector('input[name="email"]')).not.toBeNull();expect(primary().form).toBe(host.querySelector("form"));
  });
  it("continues from the open selection summary and focuses contact details", async () => {
    const api = makeApi();
    await mount(api);
    await add();
    const trigger = document.querySelector<HTMLButtonElement>('[data-testid="request-action-bar-summary"]')!;
    await click(trigger);
    const dialog = document.querySelector('[role="dialog"]')!;
    const next = [...dialog.querySelectorAll("button")].find(button => button.textContent === "Continue to details")!;
    expect(next.disabled).toBe(false);
    await click(next);
    const heading = host.querySelector("form h2");
    expect(heading?.textContent).toBe("Contact details");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(heading));
    expect(primary().form).toBe(host.querySelector("form"));
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("does not bypass the policy gate after a selection", async () => {
    const api=makeApi();await mount(api,false);await add();expect(primary().disabled).toBe(true);expect(api.submit).not.toHaveBeenCalled();
  });
  it("can inspect the request without destroying unsubmitted contact text", async () => {
    const api=makeApi();await mount(api);await add();await click(primary());
    const email=host.querySelector<HTMLInputElement>('input[name="email"]')!;email.value="saved@example.invalid";
    await click(document.querySelector<HTMLButtonElement>('[data-testid="request-action-bar-summary"]')!);
    const dialog=document.querySelector('[role="dialog"]')!;
    await click([...dialog.querySelectorAll("button")].find(b=>b.textContent==="Return to request")!);
    expect(host.querySelector('input[name="email"]')).toBe(email);expect(email.value).toBe("saved@example.invalid");
  });
  it("uses the existing explicit submit and removes the dock on the receipt", async () => {
    const api=makeApi();await prepareReview(api);await click(primary());expect(api.submit).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="request-action-bar"]')).toBeNull();expect(host.textContent).toContain(receipt.publicReference);
  });
  it("retries the identical frozen request after a lost response", async () => {
    const api=makeApi();api.submit.mockRejectedValueOnce(new Error("synthetic lost reply"));
    await prepareReview(api);await click(primary());const first=api.submit.mock.calls[0][0];
    expect(primary().textContent).toBe("Retry same request");await click(primary());expect(api.submit.mock.calls[1][0]).toEqual(first);
  });
  it("cannot create a new submit on a restored uncertain attempt", async () => {
    sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY,JSON.stringify({key:"40000000-0000-4000-8000-000000000001",acceptedAt:"2026-11-05T12:00:00Z",state:"uncertain"}));
    const api=makeApi();await mount(api);expect(document.querySelector('[data-testid="request-action-bar"]')).toBeNull();expect(api.submit).not.toHaveBeenCalled();
  });
  it("blocks the dock after current acknowledgments are refused", async () => {
    const api=makeApi();api.submit.mockRejectedValueOnce(new RequestIntentHttpError(400,"current_acknowledgments_required"));
    await prepareReview(api);await click(primary());expect(primary().disabled).toBe(true);
    expect(document.querySelector('[data-testid="request-action-bar"]')?.textContent).toContain("Refresh");expect(api.submit).toHaveBeenCalledTimes(1);
  });
});

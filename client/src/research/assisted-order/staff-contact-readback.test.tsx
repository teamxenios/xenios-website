// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { RequestIntentDetail } from "../../../../shared/research/assisted-order/request-intent";
import type { RequestIntentApi } from "./request-intent-api";
import { RequestIntentStaffReadback } from "./RequestIntentStaffReadback";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
function detail(suffix = "1", same = false): RequestIntentDetail {
  const requestId = "30000000-0000-4000-8000-00000000000" + suffix;
  return { kind: "unapproved_selection_request", requestId, publicReference: "XRI-" + requestId.replace(/-/g, "").toUpperCase(),
    status: "pending_review", createdAt: "2026-11-02T10:00:00.000Z", agreements: [], lines: [],
    contact: { fullLegalName: "Synthetic requester " + suffix, email: "fixture@example.invalid", mobilePhone: "+15555550123",
      organizationName: "Synthetic organization", ageConfirmed: true, billingSameAsShipping: same,
      shippingAddress: { line1: "10 Synthetic Delivery Lane " + suffix, line2: "Delivery Suite " + suffix, city: "Delivery City", region: "TX", postalCode: "00001", countryCode: "US" },
      billingAddress: same ? undefined : { line1: "20 Synthetic Billing Lane " + suffix, line2: "Billing Unit " + suffix, city: "Billing City", region: "ON", postalCode: "A1A 1A1", countryCode: "CA" } } };
}
function deferred() {
  let resolve!: (value: RequestIntentDetail) => void;
  const promise = new Promise<RequestIntentDetail>(yes => { resolve = yes; });
  return { promise, resolve };
}
function apiFor(row: RequestIntentDetail) {
  return { config: vi.fn(), catalog: vi.fn(), submit: vi.fn(), recover: vi.fn(),
    staff: vi.fn<RequestIntentApi["staff"]>(async () => row),
    staffQueue: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 25 })),
  } satisfies RequestIntentApi;
}
let host: HTMLDivElement, root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external effect"); })); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function mount(api: RequestIntentApi) { await act(async () => root.render(<RequestIntentStaffReadback api={api} />)); }
async function reference(value: string) {
  await act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function retrieve() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
function noWrites(api: ReturnType<typeof apiFor>) {
  expect(api.submit).not.toHaveBeenCalled(); expect(api.recover).not.toHaveBeenCalled();
  expect(api.config).not.toHaveBeenCalled(); expect(api.catalog).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
}

describe("private request contact readback", () => {
  it("shows exact requested delivery and separate billing addresses only after successful detail retrieval", async () => {
    const row = detail(), api = apiFor(row); await mount(api);
    expect(host.textContent).not.toContain("10 Synthetic Delivery Lane");
    await reference(row.publicReference); await retrieve();
    const delivery = host.querySelector('[aria-label="Requested delivery address"]');
    const billing = host.querySelector('[aria-label="Requested billing address"]');
    expect(delivery).not.toBeNull(); expect(billing).not.toBeNull();
    for (const value of Object.values(row.contact.shippingAddress)) expect(delivery!.textContent).toContain(value);
    for (const value of Object.values(row.contact.billingAddress!)) expect(billing!.textContent).toContain(value);
    expect(delivery!.textContent).not.toContain("20 Synthetic Billing Lane");
    expect(billing!.textContent).not.toContain("10 Synthetic Delivery Lane");
    expect(host.textContent).toContain("Synthetic organization");
    expect(api.staff).toHaveBeenCalledExactlyOnceWith(row.requestId); noWrites(api);
  });
  it("states same-as-delivery without inventing a separate billing address", async () => {
    const row = detail("1", true), api = apiFor(row); await mount(api); await reference(row.publicReference); await retrieve();
    expect(host.querySelector('[aria-label="Requested billing address"]')?.textContent).toContain("Same as requested delivery address.");
    expect(host.textContent).not.toContain("undefined"); expect(host.textContent).not.toContain("20 Synthetic Billing Lane"); noWrites(api);
  });
  it("omits optional address lines and organization when absent", async () => {
    const row = detail(); const clean = { ...row, contact: { ...row.contact, organizationName: undefined,
      shippingAddress: { ...row.contact.shippingAddress, line2: undefined }, billingAddress: { ...row.contact.billingAddress!, line2: undefined } } };
    const api = apiFor(clean); await mount(api); await reference(row.publicReference); await retrieve();
    expect(host.querySelector('[aria-label="Requested delivery address"]')?.textContent).toContain("10 Synthetic Delivery Lane");
    expect(host.textContent).not.toContain("Delivery Suite"); expect(host.textContent).not.toContain("Billing Unit");
    expect(host.textContent).not.toContain("Organization:"); expect(host.textContent).not.toMatch(/undefined|null/); noWrites(api);
  });
  it("does not leave addresses visible after the reference changes or a later read is refused", async () => {
    const row = detail(), api = apiFor(row); await mount(api); await reference(row.publicReference); await retrieve();
    expect(host.textContent).toContain("10 Synthetic Delivery Lane");
    await reference(detail("2").publicReference);
    expect(host.textContent).not.toContain("10 Synthetic Delivery Lane");
    api.staff.mockRejectedValueOnce(new Error("private diagnostic")); await retrieve();
    expect(host.querySelector('[aria-label="Requested delivery address"]')).toBeNull();
    expect(host.textContent).not.toContain("private diagnostic"); noWrites(api);
  });
  it("never renders addresses from an obsolete detail result", async () => {
    const a = detail(), b = detail("2"), old = deferred(), api = apiFor(b); api.staff.mockReturnValueOnce(old.promise);
    await mount(api); await reference(a.publicReference); await retrieve();
    await reference(b.publicReference); await retrieve();
    await act(async () => old.resolve(a));
    expect(host.textContent).toContain("10 Synthetic Delivery Lane 2");
    expect(host.textContent).not.toContain("10 Synthetic Delivery Lane 1"); noWrites(api);
  });
  it("renders address text as text rather than markup", async () => {
    const row = detail(); const hostile = { ...row, contact: { ...row.contact,
      shippingAddress: { ...row.contact.shippingAddress, line1: '<img src=x onerror="alert(1)">' } } };
    const api = apiFor(hostile); await mount(api); await reference(row.publicReference); await retrieve();
    expect(host.querySelector('[aria-label="Requested delivery address"]')?.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(host.querySelector("img")).toBeNull(); noWrites(api);
  });
});

// The existing HTTP adapter confirms contact presence but does not validate
// each address; partial older responses must not take down the detail view.
describe("partial address compatibility", () => {
  it.each([undefined, null])("keeps a missing delivery address (%s) explicit without losing the request", async shippingAddress => {
    const source = detail();
    const row = { ...source, contact: { ...source.contact, shippingAddress, billingSameAsShipping: false, billingAddress: undefined } } as unknown as RequestIntentDetail;
    const api = apiFor(row); await mount(api); await reference(row.publicReference); await retrieve();
    expect(host.textContent).toContain(row.publicReference);
    expect(host.textContent).toContain(row.contact.fullLegalName);
    expect(host.querySelector('[aria-label="Requested delivery address"]')?.textContent).toContain("Address not provided.");
    expect(host.querySelector('[aria-label="Requested billing address"]')?.textContent).toContain("Separate billing address not provided.");
    expect(host.textContent).not.toContain("10 Synthetic Delivery Lane");
    expect(host.textContent).not.toMatch(/undefined|null/);
    noWrites(api);
  });
});

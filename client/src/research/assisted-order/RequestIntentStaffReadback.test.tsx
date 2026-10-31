// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestIntentDetail, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import type { RequestIntentApi } from "./request-intent-api";
import { RequestIntentStaffReadback } from "./RequestIntentStaffReadback";
vi.mock("./assisted-order.css", () => ({ default: {} }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function detail(suffix: "1" | "2"): RequestIntentDetail {
  const requestId = "30000000-0000-4000-8000-00000000000" + suffix;
  const address = { line1: "1 Synthetic Street", city: "Test", region: "TX", postalCode: "00000", countryCode: "US" };
  return { kind: "unapproved_selection_request", requestId, publicReference: "XRI-" + requestId.replace(/-/g, "").toUpperCase(),
    status: "pending_review", createdAt: "2026-10-31T12:00:00.000Z", agreements: [], lines: [],
    contact: { fullLegalName: "Synthetic private fixture " + suffix, email: "fixture" + suffix + "@example.invalid",
      mobilePhone: "+15555550123", ageConfirmed: true, shippingAddress: address, billingSameAsShipping: true, billingAddress: address } };
}
const A = detail("1"), B = detail("2");
function deferred() {
  let resolve!: (value: RequestIntentDetail) => void, reject!: (error: Error) => void;
  const promise = new Promise<RequestIntentDetail>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  return {
    config: vi.fn(async () => ({ legal: [], form: [] })),
    catalog: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 24, families: [], channels: [], workflowModes: [] })),
    submit: vi.fn(async () => null), recover: vi.fn(async () => null),
    staff: vi.fn(async (_id: string): Promise<RequestIntentDetail> => A),
    staffQueue: vi.fn(async (_page: number): Promise<RequestIntentQueuePage> => ({ items: [{ kind: B.kind,
      requestId: B.requestId, publicReference: B.publicReference, status: B.status, createdAt: B.createdAt, lineCount: 1 }],
      total: 1, page: 1, pageSize: 25 })),
  } satisfies RequestIntentApi;
}
let host: HTMLDivElement, root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function mount(api: RequestIntentApi) { await act(async () => root.render(<RequestIntentStaffReadback api={api} />)); }
async function reference(value: string) {
  await act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function submit() { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }
function retrieve() { return [...host.querySelectorAll("button")].find((button) => button.textContent === "Retrieve private request")!; }
function pending() { return [...host.querySelectorAll('[role="status"]')].find((entry) => entry.textContent === "Retrieving private request..."); }
function noUnrelatedCalls(api: ReturnType<typeof fixture>) {
  expect(api.config).not.toHaveBeenCalled(); expect(api.catalog).not.toHaveBeenCalled();
  expect(api.submit).not.toHaveBeenCalled(); expect(api.recover).not.toHaveBeenCalled();
  expect(api.staffQueue).toHaveBeenCalledTimes(1); expect(api.staffQueue).toHaveBeenCalledWith(1);
}

describe("private request detail pending feedback", () => {
  it("announces one pending read and suppresses duplicate submits before React renders", async () => {
    const api = fixture(), result = deferred(); api.staff.mockReturnValueOnce(result.promise);
    await mount(api); await reference(A.publicReference);
    act(() => { submit(); submit(); });
    expect(api.staff).toHaveBeenCalledTimes(1); expect(api.staff).toHaveBeenCalledWith(A.requestId);
    expect(pending()).toBeTruthy(); expect(retrieve().disabled).toBe(true);
    expect(host.textContent).not.toContain(A.contact.fullLegalName);
    await act(async () => result.resolve(A));
    expect(host.textContent).toContain(A.contact.fullLegalName);
    expect(pending()).toBeUndefined(); expect(retrieve().disabled).toBe(false); noUnrelatedCalls(api);
  });
  it("clears pending after refusal and waits for an explicit retry", async () => {
    const api = fixture(), result = deferred(); api.staff.mockReturnValueOnce(result.promise).mockResolvedValueOnce(A);
    await mount(api); await reference(A.publicReference); act(() => submit());
    expect(pending()).toBeTruthy(); expect(retrieve().disabled).toBe(true);
    await act(async () => result.reject(new Error("Synthetic private diagnostic")));
    expect(host.textContent).toContain("Private request access could not be confirmed. No authorization was bypassed.");
    expect(host.textContent).not.toContain("Synthetic private diagnostic");
    expect(pending()).toBeUndefined(); expect(retrieve().disabled).toBe(false);
    expect(api.staff).toHaveBeenCalledTimes(1);
    await act(async () => submit());
    expect(api.staff).toHaveBeenCalledTimes(2); expect(host.textContent).toContain(A.contact.fullLegalName);
    expect(host.textContent).not.toContain("Private request access could not be confirmed."); noUnrelatedCalls(api);
  });
  it("keeps invalid reference validation local without starting pending or a read", async () => {
    const api = fixture(); await mount(api); await reference("invalid"); act(() => submit());
    expect(host.textContent).toContain("Enter the saved request reference.");
    expect(api.staff).not.toHaveBeenCalled(); expect(pending()).toBeUndefined();
    expect(retrieve().disabled).toBe(false); noUnrelatedCalls(api);
  });
  it.each([
    { via: "input", obsolete: "success" }, { via: "input", obsolete: "refusal" },
    { via: "queue", obsolete: "success" }, { via: "queue", obsolete: "refusal" },
  ])("keeps B pending when obsolete A completes with $obsolete after a $via change", async ({ via, obsolete }) => {
    const api = fixture(), a = deferred(), b = deferred();
    api.staff.mockImplementation((id) => id === A.requestId ? a.promise : b.promise);
    await mount(api); await reference(A.publicReference); act(() => submit());
    if (via === "input") await reference(B.publicReference);
    else act(() => [...host.querySelectorAll("button")].find((button) => button.textContent === B.publicReference)!.click());
    expect(host.querySelector<HTMLInputElement>("input")!.value).toBe(B.publicReference);
    expect(pending()).toBeUndefined(); expect(retrieve().disabled).toBe(false);
    expect(api.staff).toHaveBeenCalledTimes(1);
    act(() => submit());
    expect(api.staff).toHaveBeenCalledTimes(2); expect(api.staff).toHaveBeenLastCalledWith(B.requestId);
    await act(async () => obsolete === "success" ? a.resolve(A) : a.reject(new Error("Obsolete synthetic refusal")));
    expect(pending()).toBeTruthy(); expect(retrieve().disabled).toBe(true);
    expect(host.textContent).not.toContain(A.contact.fullLegalName);
    expect(host.textContent).not.toContain("Private request access could not be confirmed.");
    await act(async () => b.resolve(B));
    expect(host.textContent).toContain(B.contact.fullLegalName); expect(host.textContent).not.toContain(A.contact.fullLegalName);
    expect(pending()).toBeUndefined(); expect(retrieve().disabled).toBe(false); noUnrelatedCalls(api);
  });
  it("ignores the old detail result after the staff view unmounts at its session boundary", async () => {
    const api = fixture(), result = deferred(), replacement = fixture(); api.staff.mockReturnValueOnce(result.promise);
    await mount(api); await reference(A.publicReference); act(() => submit());
    expect(api.staff).toHaveBeenCalledTimes(1); expect(api.staff).toHaveBeenCalledWith(A.requestId);
    await act(async () => root.render(<p>Session boundary fixture</p>)); await mount(replacement);
    await act(async () => result.resolve(A));
    expect(host.textContent).not.toContain(A.contact.fullLegalName);
    expect(host.textContent).not.toContain("Private request access could not be confirmed."); expect(pending()).toBeUndefined();
    expect(replacement.staff).not.toHaveBeenCalled(); noUnrelatedCalls(api); noUnrelatedCalls(replacement);
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestIntentDetail, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import type { RequestIntentApi } from "./request-intent-api";
import { RequestIntentStaffReadback, type RequestIntentStaffReviewSession } from "./RequestIntentStaffReadback";
import { createStaffReviewCommandJournal } from "./StaffStartReviewControl";
import type { RequestWorkflowV1, StartReviewV1 } from "../../../../shared/research/assisted-order/request-intent-workflow";
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
async function mount(api: RequestIntentApi, reviewSession?: RequestIntentStaffReviewSession) {
  await act(async () => root.render(<RequestIntentStaffReadback api={api} reviewSession={reviewSession} />));
}
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

describe("private quote desk", () => {
  const desk = () => host.querySelector<HTMLElement>('[aria-label="Private quote desk"]');
  function body() { return desk()?.querySelector<HTMLTextAreaElement>("textarea")?.value; }
  function field(label: string) {
    const control = [...desk()!.querySelectorAll("label")].find(l=>(l.textContent || "").trim().startsWith(label))?.querySelector("input");
    if (!control) throw new Error("Missing quote field: " + label);
    return control;
  }
  async function enter(label:string,text:string) {
    const input=field(label);
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,text);
      input.dispatchEvent(new Event("input",{bubbles:true}));
      input.dispatchEvent(new Event("change",{bubbles:true}));
    });
  }
  it("refuses a response for another saved request before showing its contact or draft", async()=>{
    const api=fixture(); api.staff.mockResolvedValueOnce(B);
    await mount(api); await reference(A.publicReference); await act(async()=>submit());
    expect(desk()).toBeNull(); expect(host.textContent).not.toContain(B.contact.email);
    expect(host.textContent).toContain("Private request access could not be confirmed.");
  });
  it("withholds composition after a malformed stored contact",async()=>{
    const api=fixture(); api.staff.mockResolvedValueOnce({...A,contact:{...A.contact,email:""}});
    await mount(api); await reference(A.publicReference); await act(async()=>submit());
    expect(desk()).toBeNull(); expect(host.textContent).toContain("No draft is available");
  });
  it("previews only a matched private quote, invalidates it on edit and forgets it on a request change", async()=>{
    const api=fixture(); await mount(api); expect(desk()).toBeNull();
    await reference(A.publicReference); await act(async()=>submit());
    await enter("Request reference on issued quote",A.publicReference);
    await enter("Recipient email on issued quote",A.contact.email);
    await enter("Issued quote number","EA-TEST-2");
    await enter("Final total","1.25"); await enter("Valid through","2099-12-31");
    await act(async()=>{ field("I matched").click(); });
    await act(async()=>{ desk()!.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})); });
    expect(body()).toContain("$1.25 USD"); expect(body()).not.toContain("1 Synthetic Street");
    expect(desk()!.querySelector("a[href]")).toBeNull(); noUnrelatedCalls(api);
    await enter("Final total","1.50"); expect(body()).toBeUndefined(); expect(field("I matched").checked).toBe(false);
    await reference(B.publicReference); expect(desk()).toBeNull();
    api.staff.mockResolvedValueOnce(B); await act(async()=>submit());
    expect(field("Final total").value).toBe(""); expect(body()).toBeUndefined();
  });
});


describe("staff review mount binding", () => {
  const at = "2026-11-18T03:00:00.000Z";
  const queued: RequestWorkflowV1 = { schemaVersion: 1, requestId: A.requestId, publicReference: A.publicReference,
    state: "queued", revision: 1, changedAt: at, customerNotice: "pending", events: [
      { id: "40000000-0000-4000-8000-000000000001", revision: 0, kind: "received", occurredAt: at },
      { id: "40000000-0000-4000-8000-000000000002", revision: 1, kind: "queued", occurredAt: at },
    ] };
  function processingFixture() {
    const startReview = vi.fn(async (_id: string, _command: StartReviewV1) => ({ replay: false, workflow: { ...queued, state: "reviewing" as const, revision: 2,
      events: [...queued.events, { id: "40000000-0000-4000-8000-000000000003", revision: 2, kind: "review_started" as const, occurredAt: at }] } }));
    const staffWorkflow = vi.fn(async () => ({ status: "ready" as const, value: { workflow: queued, canStartReview: true } }));
    return { ...fixture(), startReview, staffWorkflow };
  }
  const control = (name: string) => [...host.querySelectorAll("button")].find(node => node.textContent === name);
  it("keeps existing callers read-only without a parent session journal", async () => {
    const api = processingFixture(); await mount(api); await reference(A.publicReference); await act(async () => submit());
    expect(control("Start review")).toBeUndefined(); expect(api.startReview).not.toHaveBeenCalled();
  });
  it("wires the parent's journal and explicit command port only after a trusted detail and workflow read", async () => {
    const api = processingFixture(), sessionInstance = {};
    await mount(api, { sessionInstance, journal: createStaffReviewCommandJournal(sessionInstance) });
    expect(control("Start review")).toBeUndefined(); await reference(A.publicReference); await act(async () => submit());
    expect(api.staffWorkflow).toHaveBeenCalledWith(A.requestId); expect(api.startReview).not.toHaveBeenCalled();
    await act(async () => control("Start review")!.click()); expect(api.startReview).not.toHaveBeenCalled();
    await act(async () => control("Confirm start review")!.click());
    expect(api.startReview).toHaveBeenCalledTimes(1); expect(api.startReview.mock.calls[0][0]).toBe(A.requestId);
  });
  it("retains the input across an API renewal while discarding the prior private response", async () => {
    const oldApi = fixture(), renewed = fixture(), pending = deferred(); oldApi.staff.mockReturnValueOnce(pending.promise);
    await mount(oldApi); await reference(A.publicReference); act(() => submit()); const savedInput = host.querySelector("input");
    await mount(renewed); expect(host.querySelector("input")).toBe(savedInput); expect(savedInput?.value).toBe(A.publicReference);
    await act(async () => pending.resolve(A)); expect(host.textContent).not.toContain(A.contact.fullLegalName);
    expect(renewed.staff).not.toHaveBeenCalled(); await act(async () => submit());
    expect(renewed.staff).toHaveBeenCalledTimes(1); expect(host.textContent).toContain(A.contact.fullLegalName);
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseStaffRequestWorkflow, type RequestWorkflowV1, type StartReviewResultV1 } from "../../../../shared/research/assisted-order/request-intent-workflow";
import { RequestIntentHttpError } from "./request-intent-api";
import { createStaffReviewCommandJournal, StaffStartReviewControl, type StaffReviewCommandJournal, type StaffReviewSnapshot, type StaffStartReviewControlProps } from "./StaffStartReviewControl";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const A = "30000000-0000-4000-8000-000000000001";
const B = "30000000-0000-4000-8000-000000000002";
const at = "2026-11-18T03:00:00.000Z";
function workflow(requestId = A, reviewing = false): RequestWorkflowV1 {
  return { schemaVersion: 1, requestId, publicReference: "XRI-" + requestId.replaceAll("-", "").toUpperCase(),
    state: reviewing ? "reviewing" : "queued", revision: reviewing ? 2 : 1, changedAt: at, customerNotice: "pending", events: [
      { id: "40000000-0000-4000-8000-000000000001", revision: 0, kind: "received", occurredAt: at },
      { id: "40000000-0000-4000-8000-000000000002", revision: 1, kind: "queued", occurredAt: at },
      ...(reviewing ? [{ id: "40000000-0000-4000-8000-000000000003", revision: 2, kind: "review_started" as const, occurredAt: at }] : []),
    ] };
}
function fixture() {
  return { readStaffWorkflow: vi.fn(async (id: string): Promise<unknown> => ({ workflow: workflow(id), canStartReview: true })),
    startReview: vi.fn(async (id: string, _command: unknown): Promise<unknown> => ({ replay: false, workflow: workflow(id, true) })) };
}
function snapshot(api: ReturnType<typeof fixture>, id = A, allowed = true, reviewing = false): StaffReviewSnapshot {
  return { api, requestId: id, value: parseStaffRequestWorkflow({ workflow: workflow(id, reviewing), canStartReview: allowed }) };
}
function deferred() {
  let resolve!: (value: unknown) => void, reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let host: HTMLDivElement, root: Root;
let sessionInstance: object, journal: StaffReviewCommandJournal;
beforeEach(() => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  sessionInstance = {}; journal = createStaffReviewCommandJournal(sessionInstance);
  let sequence = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => `70000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
type FixtureProps = Omit<StaffStartReviewControlProps, "sessionInstance" | "journal"> & Partial<Pick<StaffStartReviewControlProps, "sessionInstance" | "journal">>;
async function mount(props: FixtureProps) { await act(async () => root.render(<StaffStartReviewControl sessionInstance={sessionInstance} journal={journal} {...props} />)); }
function button(text: string) { return [...host.querySelectorAll("button")].find(b => b.textContent === text); }
async function click(text: string) { const value = button(text); expect(value, text).toBeDefined(); await act(async () => value!.click()); }
async function confirm() { await click("Start review"); await click("Confirm start review"); }
function noNewCommand(api: ReturnType<typeof fixture>) {
  expect(button("Start review")).toBeUndefined(); expect(button("Confirm start review")).toBeUndefined();
  expect(api.startReview).not.toHaveBeenCalled();
}

describe("manual staff start-review control", () => {
  it("does not read or write merely on render, and requires a separate confirmation", async () => {
    const api = fixture(); await mount({ requestId: A, api, current: snapshot(api) });
    expect(api.readStaffWorkflow).not.toHaveBeenCalled(); expect(api.startReview).not.toHaveBeenCalled();
    await click("Start review"); expect(api.startReview).not.toHaveBeenCalled();
    expect(host.querySelector('[role="group"][aria-label="Confirm start review"]')).toBeTruthy();
    expect(button("Start review")?.getAttribute("aria-expanded")).toBe("true");
    expect(host.textContent).toContain(workflow().publicReference);
    await click("Cancel"); expect(button("Confirm start review")).toBeUndefined();
    expect(document.activeElement).toBe(button("Start review"));
    expect(api.startReview).not.toHaveBeenCalled(); expect(crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each(["missing", "permission", "reviewing", "request", "api", "extra", "invalid-id"])("fails closed for %s eligibility", async kind => {
    const api = fixture(), other = fixture(); let current: StaffReviewSnapshot | null = snapshot(api);
    let requestId = A;
    if (kind === "missing") current = null;
    if (kind === "permission") current = snapshot(api, A, false);
    if (kind === "reviewing") current = snapshot(api, A, true, true);
    if (kind === "request") current = snapshot(api, B);
    if (kind === "api") current = snapshot(other);
    if (kind === "extra") current = { ...current!, value: { ...current!.value, untrustedPermission: true } as StaffReviewSnapshot["value"] };
    if (kind === "invalid-id") requestId = "invalid";
    await mount({ requestId, api, current }); noNewCommand(api);
    expect(api.readStaffWorkflow).not.toHaveBeenCalled();
  });

  it("sends exactly the shared command once under synchronous double confirmation and accepts only a real result", async () => {
    const api = fixture(), pending = deferred(), onConfirmed = vi.fn(); api.startReview.mockReturnValueOnce(pending.promise);
    await mount({ requestId: A, api, current: snapshot(api), onConfirmed }); await click("Start review");
    const control = button("Confirm start review")!;
    act(() => { control.click(); control.click(); });
    expect(api.startReview).toHaveBeenCalledTimes(1);
    expect(api.startReview).toHaveBeenCalledWith(A, { commandId: "70000000-0000-4000-8000-000000000001", expectedRevision: 1 });
    expect(host.textContent).toContain("Confirming start-review outcome"); expect(host.textContent).not.toContain("Review started.");
    expect(button("Refresh review availability")?.disabled).toBe(true);
    const result = { replay: false, workflow: workflow(A, true) };
    await act(async () => pending.resolve(result));
    expect(onConfirmed).toHaveBeenCalledExactlyOnceWith(result);
    expect(host.textContent).toContain("saved request receipt remains pending review");
    expect(host.textContent).toContain("does not approve clinical care, a price, payment or fulfillment");
    expect(button("Retry the same start-review attempt")).toBeUndefined();
    expect(document.activeElement).toBe(button("Refresh review availability"));
    expect(api.readStaffWorkflow).not.toHaveBeenCalled();
  });

  it("retains a lost-response command and revision across explicit refresh and a fenced same-attempt retry", async () => {
    const api = fixture(), pending = deferred(); api.startReview.mockRejectedValueOnce(new Error("private provider diagnostic"));
    const current = snapshot(api); await mount({ requestId: A, api, current }); await confirm();
    expect(host.textContent).toContain("outcome is unconfirmed"); expect(host.textContent).not.toContain("private provider diagnostic");
    expect(api.startReview).toHaveBeenCalledTimes(1); expect(api.readStaffWorkflow).not.toHaveBeenCalled();
    await click("Refresh review availability"); expect(button("Start review")).toBeUndefined();
    expect(button("Retry the same start-review attempt")).toBeDefined();
    api.startReview.mockReturnValueOnce(pending.promise);
    const retry = button("Retry the same start-review attempt")!; act(() => { retry.click(); retry.click(); });
    expect(api.startReview).toHaveBeenCalledTimes(2);
    expect(api.startReview.mock.calls[1]).toEqual(api.startReview.mock.calls[0]);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ replay: true, workflow: workflow(A, true) }));
    expect(host.textContent).toContain("Review started.");
  });

  it.each(["null", "extra", "wrong-id", "queued", "revision", "history", "replay"])("retains the same attempt after %s malformed success", async kind => {
    const api = fixture(), onConfirmed = vi.fn();
    let result: unknown = { replay: false, workflow: workflow(A, true) };
    if (kind === "null") result = null;
    if (kind === "extra") result = { ...result as object, secret: "private result" };
    if (kind === "wrong-id") result = { replay: false, workflow: workflow(B, true) };
    if (kind === "queued") result = { replay: false, workflow: workflow() };
    if (kind === "revision") result = { replay: false, workflow: { ...workflow(A, true), revision: 3 } };
    if (kind === "history") result = { replay: false, workflow: { ...workflow(A, true), events: [] } };
    if (kind === "replay") result = { replay: "true", workflow: workflow(A, true) };
    api.startReview.mockResolvedValueOnce(result);
    await mount({ requestId: A, api, current: snapshot(api), onConfirmed }); await confirm();
    expect(onConfirmed).not.toHaveBeenCalled(); expect(host.textContent).not.toContain("Review started.");
    expect(host.textContent).not.toContain("private result"); expect(button("Start review")).toBeUndefined();
    await click("Retry the same start-review attempt");
    expect(api.startReview.mock.calls[1]).toEqual(api.startReview.mock.calls[0]); expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("uses authorized GET after a strict 409 and requires an explicit new confirmation, with a new command only then", async () => {
    const api = fixture(), read = deferred();
    api.startReview.mockRejectedValueOnce(new RequestIntentHttpError(409, "workflow_revision_conflict"));
    api.readStaffWorkflow.mockReturnValueOnce(read.promise);
    const current = snapshot(api); await mount({ requestId: A, api, current }); await confirm();
    expect(api.readStaffWorkflow).toHaveBeenCalledExactlyOnceWith(A); expect(api.startReview).toHaveBeenCalledTimes(1);
    expect(button("Start review")).toBeUndefined(); expect(button("Retry the same start-review attempt")).toBeUndefined();
    await mount({ requestId: A, api, current }); expect(button("Start review")).toBeUndefined();
    await act(async () => read.resolve({ workflow: workflow(), canStartReview: true }));
    expect(api.startReview).toHaveBeenCalledTimes(1); expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(button("Confirm start review")).toBeUndefined(); expect(document.activeElement).toBe(button("Start review"));
    await click("Start review"); expect(api.startReview).toHaveBeenCalledTimes(1);
    await click("Confirm start review");
    expect(api.startReview).toHaveBeenCalledTimes(2); expect(crypto.randomUUID).toHaveBeenCalledTimes(2);
    expect(api.startReview.mock.calls[1][1]).toEqual({ commandId: "70000000-0000-4000-8000-000000000002", expectedRevision: 1 });
  });

  it.each(["failed", "other-request", "malformed"])("does not revive old eligibility when conflict refresh is %s", async kind => {
    const api = fixture(); api.startReview.mockRejectedValueOnce(new RequestIntentHttpError(409, "workflow_revision_conflict"));
    if (kind === "failed") api.readStaffWorkflow.mockRejectedValueOnce(new Error("private read error"));
    else api.readStaffWorkflow.mockResolvedValueOnce(kind === "other-request" ? { workflow: workflow(B), canStartReview: true } : { workflow: workflow(), canStartReview: true, extra: true });
    const current = snapshot(api); await mount({ requestId: A, api, current }); await confirm();
    await mount({ requestId: A, api, current: { ...current } });
    expect(button("Start review")).toBeUndefined(); expect(button("Retry the same start-review attempt")).toBeUndefined();
    expect(host.textContent).not.toContain("private read error");
    await click("Refresh review availability"); expect(button("Start review")).toBeDefined();
    expect(api.startReview).toHaveBeenCalledTimes(1); expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("does not offer a command after 409 refresh returns reviewing=%s without permission", async reviewing => {
    const api = fixture(); api.startReview.mockRejectedValueOnce(new RequestIntentHttpError(409, "workflow_revision_conflict"));
    api.readStaffWorkflow.mockResolvedValueOnce({ workflow: workflow(A, reviewing), canStartReview: false });
    await mount({ requestId: A, api, current: snapshot(api) }); await confirm();
    expect(api.startReview).toHaveBeenCalledTimes(1); expect(button("Start review")).toBeUndefined();
    expect(button("Retry the same start-review attempt")).toBeUndefined();
  });

  it.each([new RequestIntentHttpError(409, "different_conflict"), { status: 409, code: "workflow_revision_conflict" }, new Error("409")])("treats unverified errors as uncertain, without automatic GET or a fresh UUID", async error => {
    const api = fixture(); api.startReview.mockRejectedValueOnce(error);
    await mount({ requestId: A, api, current: snapshot(api) }); await confirm();
    expect(api.readStaffWorkflow).not.toHaveBeenCalled(); await click("Retry the same start-review attempt");
    expect(api.startReview.mock.calls[1]).toEqual(api.startReview.mock.calls[0]); expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("invalidates eligibility and confirmation synchronously on refresh and suppresses duplicate reads", async () => {
    const api = fixture(), read = deferred(); api.readStaffWorkflow.mockReturnValueOnce(read.promise);
    await mount({ requestId: A, api, current: snapshot(api) }); await click("Start review");
    const refresh = button("Refresh review availability")!, confirmButton = button("Confirm start review")!;
    act(() => { refresh.click(); refresh.click(); confirmButton.click(); });
    expect(api.readStaffWorkflow).toHaveBeenCalledTimes(1); expect(api.startReview).not.toHaveBeenCalled();
    expect(button("Confirm start review")).toBeUndefined();
    await act(async () => read.resolve({ workflow: workflow(), canStartReview: true }));
    expect(button("Start review")).toBeDefined(); expect(button("Confirm start review")).toBeUndefined();
  });

  it("clears an old confirmation when a newly supplied current wrapper revokes permission", async () => {
    const api = fixture(); await mount({ requestId: A, api, current: snapshot(api) }); await click("Start review");
    await mount({ requestId: A, api, current: snapshot(api, A, false) }); noNewCommand(api);
    await mount({ requestId: A, api, current: snapshot(api) });
    expect(button("Confirm start review")).toBeUndefined(); expect(button("Start review")).toBeDefined();
  });

  it.each(["request", "api"])("ignores a late GET after %s identity changes", async kind => {
    const api = fixture(), other = fixture(), read = deferred(); api.readStaffWorkflow.mockReturnValueOnce(read.promise);
    const current = snapshot(api); await mount({ requestId: A, api, current });
    act(() => button("Refresh review availability")!.click());
    await mount({ requestId: kind === "request" ? B : A, api: kind === "api" ? other : api, current });
    await act(async () => read.resolve({ workflow: workflow(), canStartReview: true }));
    expect(button("Start review")).toBeUndefined(); expect(host.textContent).not.toContain(workflow().publicReference);
    await click("Refresh review availability"); expect(button("Start review")).toBeDefined();
    expect(api.startReview).not.toHaveBeenCalled(); expect(other.startReview).not.toHaveBeenCalled();
  });

  it("does not notify an obsolete view after POST, or issue another command on returning to its old queued snapshot", async () => {
    const api = fixture(), pending = deferred(), onConfirmed = vi.fn(); api.startReview.mockReturnValueOnce(pending.promise);
    const current = snapshot(api); await mount({ requestId: A, api, current, onConfirmed }); await confirm();
    await mount({ requestId: B, api, current: snapshot(api, B), onConfirmed });
    await act(async () => pending.resolve({ replay: false, workflow: workflow(A, true) }));
    expect(onConfirmed).not.toHaveBeenCalled(); expect(host.textContent).not.toContain("Review started.");
    await mount({ requestId: A, api, current, onConfirmed });
    expect(button("Start review")).toBeUndefined(); expect(button("Retry the same start-review attempt")).toBeUndefined();
    expect(api.startReview).toHaveBeenCalledTimes(1);
    api.readStaffWorkflow.mockResolvedValueOnce({ workflow: workflow(A, true), canStartReview: false });
    await click("Refresh review availability"); expect(host.textContent).toContain("Review is already in progress.");
  });

  it("keeps an uncertain command across API changes within the same canonical session and requires fresh API-scoped availability", async () => {
    const api = fixture(), other = fixture(); api.startReview.mockRejectedValueOnce(new Error("response lost"));
    const current = snapshot(api); await mount({ requestId: A, api, current }); await confirm();
    await mount({ requestId: A, api: other, current }); expect(button("Start review")).toBeUndefined();
    expect(button("Retry the same start-review attempt")).toBeUndefined();
    await click("Refresh review availability"); expect(button("Start review")).toBeUndefined();
    await click("Retry the same start-review attempt");
    expect(other.startReview.mock.calls[0]).toEqual(api.startReview.mock.calls[0]); expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("resolves uncertain state from a strict refreshed reviewing workflow without posting again", async () => {
    const api = fixture(), onConfirmed = vi.fn(); api.startReview.mockRejectedValueOnce(new Error("response lost"));
    await mount({ requestId: A, api, current: snapshot(api), onConfirmed }); await confirm();
    api.readStaffWorkflow.mockResolvedValueOnce({ workflow: workflow(A, true), canStartReview: false });
    await click("Refresh review availability"); expect(host.textContent).toContain("Review is already in progress.");
    expect(onConfirmed).not.toHaveBeenCalled(); expect(api.startReview).toHaveBeenCalledTimes(1);
    expect(button("Retry the same start-review attempt")).toBeUndefined();
  });

  it("ignores unmounted completion while retaining its confirmed command in the external journal", async () => {
    const api = fixture(), pending = deferred(), onConfirmed = vi.fn(); api.startReview.mockReturnValueOnce(pending.promise);
    await mount({ requestId: A, api, current: snapshot(api), onConfirmed }); await confirm();
    await act(async () => root.render(<p>Signed out</p>));
    await act(async () => pending.resolve({ replay: false, workflow: workflow(A, true) }));
    expect(onConfirmed).not.toHaveBeenCalled(); expect(host.textContent).toBe("Signed out");
    expect(journal.read(A)?.status).toBe("confirmed");
  });

  it("contains a throwing parent callback without retrying a confirmed command", async () => {
    const second = fixture(), throwing = vi.fn((_value: StartReviewResultV1) => { throw new Error("private callback failure"); });
    await mount({ requestId: A, api: second, current: snapshot(second), onConfirmed: throwing }); await confirm();
    expect(throwing).toHaveBeenCalledTimes(1); expect(host.textContent).toContain("Review started.");
    expect(host.textContent).not.toContain("private callback failure"); expect(button("Retry the same start-review attempt")).toBeUndefined();
  });

  it("uses native button semantics and cannot implicitly submit an enclosing form", async () => {
    const api = fixture(), submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    await act(async () => root.render(<form onSubmit={submit}><StaffStartReviewControl requestId={A} sessionInstance={sessionInstance} journal={journal} api={api} current={snapshot(api)} /></form>));
    for (const control of host.querySelectorAll("button")) expect(control.type).toBe("button");
    button("Start review")!.focus(); expect(document.activeElement).toBe(button("Start review"));
    await click("Start review");
    for (const control of host.querySelectorAll("button")) expect(control.type).toBe("button");
    button("Confirm start review")!.focus(); expect(document.activeElement).toBe(button("Confirm start review"));
    await click("Cancel"); expect(submit).not.toHaveBeenCalled(); expect(api.startReview).not.toHaveBeenCalled();
  });

  it.each(["permission", "reviewing", "missing"])("immediately reconciles parent %s after local refresh and invalidates confirmation", async kind => {
    const api = fixture(); await mount({ requestId: A, api, current: snapshot(api) });
    await click("Refresh review availability"); await click("Start review");
    const next = kind === "missing" ? null : snapshot(api, A, false, kind === "reviewing");
    await mount({ requestId: A, api, current: next }); noNewCommand(api);
    expect(button("Retry the same start-review attempt")).toBeUndefined();
    if (kind === "reviewing") expect(host.textContent).toContain("Review is already in progress.");
    await mount({ requestId: A, api, current: snapshot(api) });
    expect(button("Start review")).toBeUndefined(); expect(button("Confirm start review")).toBeUndefined();
    await click("Refresh review availability"); expect(button("Start review")).toBeDefined();
    expect(button("Confirm start review")).toBeUndefined(); expect(api.startReview).not.toHaveBeenCalled();
  });

  it("does not overwrite a newer parent denial with an older in-flight GET", async () => {
    const api = fixture(), read = deferred(); api.readStaffWorkflow.mockReturnValueOnce(read.promise);
    await mount({ requestId: A, api, current: snapshot(api) }); act(() => button("Refresh review availability")!.click());
    await mount({ requestId: A, api, current: snapshot(api, A, false) });
    await act(async () => read.resolve({ workflow: workflow(), canStartReview: true })); noNewCommand(api);
  });

  it("retains lost-response command across a real child unmount/remount with the required external journal", async () => {
    const api = fixture(), pending = deferred(), onConfirmed = vi.fn(); api.startReview.mockReturnValueOnce(pending.promise);
    await mount({ requestId: A, api, current: snapshot(api), onConfirmed }); await confirm();
    const first = api.startReview.mock.calls[0];
    await act(async () => root.render(<p>Auth-event child remount fixture</p>));
    await act(async () => pending.reject(new Error("response lost after child unmount")));
    const renewedApi = fixture();
    await mount({ requestId: A, api: renewedApi, current: snapshot(api), onConfirmed });
    expect(button("Start review")).toBeUndefined(); expect(button("Retry the same start-review attempt")).toBeUndefined();
    await click("Refresh review availability"); await click("Retry the same start-review attempt");
    expect(renewedApi.startReview).toHaveBeenCalledExactlyOnceWith(...first);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1); expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("fences a still-pending command across child remount and permits only the same command after uncertainty settles", async () => {
    const api = fixture(), pending = deferred(); api.startReview.mockReturnValueOnce(pending.promise);
    const current = snapshot(api); await mount({ requestId: A, api, current }); await confirm();
    await act(async () => root.render(<p>Canonical child remount</p>)); await mount({ requestId: A, api, current });
    expect(button("Start review")).toBeUndefined(); expect(button("Retry the same start-review attempt")).toBeUndefined();
    await click("Refresh review availability"); expect(api.startReview).toHaveBeenCalledTimes(1);
    await act(async () => pending.reject(new Error("synthetic lost reply")));
    await click("Refresh review availability"); await click("Retry the same start-review attempt");
    expect(api.startReview.mock.calls[1]).toEqual(api.startReview.mock.calls[0]); expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("denies a journal from another exact canonical session scope without reading or posting", async () => {
    const api = fixture(); await mount({ requestId: A, api, current: snapshot(api), sessionInstance: {} }); noNewCommand(api);
    expect(button("Refresh review availability")?.disabled).toBe(true);
    expect(api.readStaffWorkflow).not.toHaveBeenCalled(); expect(host.textContent).toContain("current review session could not be confirmed");
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });

  it("preserves request separation in one session journal and confirmed state across remount", async () => {
    const api = fixture(); await mount({ requestId: A, api, current: snapshot(api) }); await confirm();
    await act(async () => root.render(<p>Child replaced</p>)); await mount({ requestId: B, api, current: snapshot(api, B) }); await confirm();
    expect(api.startReview).toHaveBeenCalledTimes(2); expect(api.startReview.mock.calls.map(call => call[0])).toEqual([A, B]);
    await act(async () => root.render(<p>Child replaced again</p>)); await mount({ requestId: A, api, current: snapshot(api) });
    expect(button("Start review")).toBeUndefined(); expect(button("Retry the same start-review attempt")).toBeUndefined();
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2);
  });

  it("uses the shared journal as a synchronous fence across two mounted controls", async () => {
    const api = fixture(), pending = deferred(); api.startReview.mockReturnValueOnce(pending.promise);
    const props = { requestId: A, api, current: snapshot(api), sessionInstance, journal };
    await act(async () => root.render(<><StaffStartReviewControl {...props} /><StaffStartReviewControl {...props} /></>));
    await act(async () => { for (const control of [...host.querySelectorAll("button")].filter(b => b.textContent === "Start review")) control.click(); });
    const confirmations = [...host.querySelectorAll("button")].filter(b => b.textContent === "Confirm start review");
    expect(confirmations).toHaveLength(2); act(() => { confirmations[0].click(); confirmations[1].click(); });
    expect(api.startReview).toHaveBeenCalledTimes(1); expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ replay: false, workflow: workflow(A, true) }));
  });

  it("does not downgrade a strict reviewing readback when an older ambiguous reply arrives", async () => {
    const api = fixture(), pending = deferred(); api.startReview.mockReturnValueOnce(pending.promise);
    await mount({ requestId: A, api, current: snapshot(api) }); await confirm();
    await act(async () => root.render(<p>Child remounted</p>)); await mount({ requestId: A, api, current: snapshot(api) });
    api.readStaffWorkflow.mockResolvedValueOnce({ workflow: workflow(A, true), canStartReview: false });
    await click("Refresh review availability");
    await act(async () => pending.reject(new Error("old lost reply")));
    await act(async () => root.render(<p>Child remounted again</p>)); await mount({ requestId: A, api, current: snapshot(api) });
    expect(button("Start review")).toBeUndefined(); expect(button("Retry the same start-review attempt")).toBeUndefined();
    expect(journal.read(A)?.status).toBe("confirmed"); expect(api.startReview).toHaveBeenCalledTimes(1);
  });
});

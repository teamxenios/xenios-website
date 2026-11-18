// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AeWorkspace } from "@shared/research/account-executive/workspace";
import { AeWorkspacePage, type AePortalSession, type AeWorkspacePageProps } from "./AeWorkspacePage";
import { createAeCommandJournal } from "./workspace-api";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-11-18T14:00:00.000Z";
function workspace(actor = id(1), scope = id(2)): AeWorkspace {
  return { schemaVersion: 1, actorAuthUserId: actor, scopeId: scope, generatedAt: at,
    capabilities: ["workspace:read", "customer:contact", "followup:record", "customer:reassign"], customers: [{
      assignment: { id: id(3), scopeId: scope, customerAuthUserId: id(4), assigneeAuthUserId: actor, revision: 3 },
      assignmentHistory: { state: "unavailable" },
      contact: { state: "available", displayName: "Synthetic customer", email: "fixture@example.invalid", phone: null },
      referral: { state: "unresolved" }, followups: [], requests: [{ requestId: id(8),
        publicReference: "XRI-" + id(8).replaceAll("-", "").toUpperCase(), receiptStatus: "pending_review", submittedAt: at,
        originalReferralInput: { state: "redacted" }, workflow: null }],
    }] };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const loaded = (value = workspace()) => json({ ok: true, value });
function deferred() { let resolve!: (value: Response) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
let host: HTMLDivElement, root: Root, fetcher: ReturnType<typeof vi.fn<typeof fetch>>, props: AeWorkspacePageProps;
beforeEach(() => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const sessionInstance = {}; const session: AePortalSession = { state: "ready", actorAuthUserId: id(1), accessToken: "ordinary-A", sessionInstance };
  props = { session, scopeId: id(2), scopeLabel: "Synthetic operations", journal: createAeCommandJournal(sessionInstance, id(1), id(2)) };
  fetcher = vi.fn<typeof fetch>().mockImplementation(async () => loaded()); vi.stubGlobal("fetch", fetcher);
  vi.spyOn(crypto, "randomUUID").mockReturnValue(id(90));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(next = props) { props = next; await act(async () => root.render(<AeWorkspacePage {...next} />)); }
const button = (text: string) => [...host.querySelectorAll("button")].find(value => value.textContent === text);
async function click(text: string) { const value = button(text); expect(value, text).toBeDefined(); await act(async () => value!.click()); }
async function submitForm() {
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
async function followup() {
  await click("Record follow-up");
  (host.querySelector('[name="dueAt"]') as HTMLInputElement).value = "2026-11-19T14:30";
  await submitForm();
}
function noCustomer() { expect(host.textContent).not.toContain("Synthetic customer"); expect(host.textContent).not.toContain("fixture@example.invalid"); }
function postCalls() { return fetcher.mock.calls.filter(([, init]) => init?.method === "POST"); }
function followupReceipt(body: string) {
  const command = JSON.parse(body);
  return json({ ok: true, value: { commandId: command.commandId, replay: false,
    assignment: { ...workspace().customers[0].assignment, revision: 4 },
    followup: { id: id(91), customerAuthUserId: id(4), assignmentId: id(3), ownerAuthUserId: id(1),
      purpose: command.purpose, dueAt: command.dueAt, state: "open", createdAt: at },
    audit: { id: id(92), commandId: command.commandId, actorAuthUserId: id(1), assignmentId: id(3), customerAuthUserId: id(4),
      kind: "followup_recorded", occurredAt: at }, followupTransfers: [] } });
}

describe("connected assigned AE page", () => {
  it("loads real API facts, preserves unknown metadata, and never invents clinical or commercial detail", async () => {
    await render(); expect(fetcher).toHaveBeenCalledTimes(1); expect(postCalls()).toHaveLength(0);
    expect(host.textContent).toContain("Synthetic customer"); expect(host.textContent).toContain("Request received; processing status unavailable");
    expect(host.textContent).toContain("Referrer unresolved"); expect(host.textContent).toContain("Original referral input recorded (redacted)");
    expect(host.textContent).toContain("Assignment history unavailable"); expect(host.textContent).not.toMatch(/supplier cost|commission|clinical notes/i);
  });
  it.each(["checking", "signed_out", "recovery", "unavailable"] as const)("keeps %s separate and sends no request", async state => {
    await render({ ...props, session: { state } }); expect(fetcher).not.toHaveBeenCalled(); noCustomer();
    expect(host.textContent).toContain({ checking: "Checking your session", signed_out: "Sign-in required", recovery: "Recovery session", unavailable: "Workspace unavailable" }[state]);
  });
  it("also rejects a recovery-purpose bearer incorrectly supplied as ready", async () => {
    const token = "x." + btoa(JSON.stringify({ amr: [{ method: "recovery" }] })) + ".x";
    await render({ ...props, session: { ...props.session, state: "ready", actorAuthUserId: id(1), accessToken: token, sessionInstance: {} } });
    expect(host.textContent).toContain("Recovery session"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("distinguishes a validated empty list from service failure and denial", async () => {
    fetcher.mockResolvedValueOnce(loaded({ ...workspace(), customers: [] })); await render();
    expect(host.textContent).toContain("No assigned customers");
    fetcher.mockResolvedValueOnce(json({ ok: false, code: "unavailable" }, 503)); await click("Refresh assigned customers");
    expect(host.textContent).toContain("Workspace unavailable"); expect(host.textContent).not.toContain("No assigned customers");
    fetcher.mockResolvedValueOnce(json({ ok: false, code: "access_denied" }, 403)); await click("Refresh assigned customers");
    expect(host.textContent).toContain("Workspace access denied"); noCustomer();
    fetcher.mockResolvedValueOnce(json({ ok: false, code: "access_denied" }, 401)); await click("Refresh assigned customers");
    expect(host.textContent).toContain("Session expired");
  });
  it.each(["actor", "scope", "session", "token"] as const)("hides old data synchronously and ignores late results on %s change", async kind => {
    await render(); const late = deferred(); fetcher.mockReturnValueOnce(late.promise);
    await click("Refresh assigned customers"); noCustomer();
    const nextRead = deferred(); fetcher.mockReturnValueOnce(nextRead.promise);
    const old = props.session as Extract<AePortalSession, { state: "ready" }>;
    const session = { ...old, ...(kind === "actor" ? { actorAuthUserId: id(11) } : kind === "session" ? { sessionInstance: {} } : kind === "token" ? { accessToken: "ordinary-A-refreshed" } : {}) };
    await render({ ...props, session, scopeId: kind === "scope" ? id(12) : props.scopeId }); noCustomer();
    await act(async () => late.resolve(loaded())); noCustomer();
    await act(async () => nextRead.resolve(loaded({ ...workspace(session.actorAuthUserId, kind === "scope" ? id(12) : id(2)), customers: [] })));
    expect(host.textContent).toContain("No assigned customers");
  });
  it("requires matching command coordination and actual capabilities", async () => {
    await render({ ...props, journal: createAeCommandJournal({}, id(1), id(2)) });
    expect(host.textContent).toContain("read-only"); expect(button("Record follow-up")).toBeUndefined();
    fetcher.mockImplementation(async () => loaded({ ...workspace(), capabilities: ["workspace:read"], customers: [{ ...workspace().customers[0], contact: { state: "not_permitted" } }] }));
    await render({ ...props, journal: undefined });
    expect(host.textContent).toContain("Contact access not granted"); expect(host.textContent).not.toContain("fixture@example.invalid");
    expect(button("Reassign customer")).toBeUndefined();
  });
  it("requires explicit confirmation and fences synchronous double submit", async () => {
    await render(); await click("Record follow-up"); expect(postCalls()).toHaveLength(0);
    (host.querySelector('[name="dueAt"]') as HTMLInputElement).value = "2026-11-19T14:30";
    const pending = deferred(); fetcher.mockReturnValueOnce(pending.promise); const form = host.querySelector("form")!;
    act(() => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(postCalls()).toHaveLength(1); noCustomer(); expect(host.textContent).toContain("Confirming command outcome");
    const body = String(postCalls()[0][1]!.body); await act(async () => pending.resolve(followupReceipt(body)));
    expect(host.textContent).toContain("Follow-up recorded"); noCustomer(); expect(button("Retry the same command")).toBeUndefined();
  });
  it("keeps a lost-response command exact through remount and manual retry", async () => {
    await render(); fetcher.mockRejectedValueOnce(new Error("PRIVATE_TRANSPORT_SENTINEL")); await followup();
    const original = String(postCalls()[0][1]!.body); expect(host.textContent).toContain("Command outcome unconfirmed"); noCustomer();
    expect(host.textContent).not.toContain("PRIVATE_TRANSPORT_SENTINEL");
    await act(async () => root.unmount()); root = createRoot(host); await render();
    expect(button("Record follow-up")).toBeUndefined(); expect(button("Retry the same command")).toBeDefined();
    fetcher.mockImplementationOnce(async (_url, init) => followupReceipt(String(init!.body))); await click("Retry the same command");
    expect(postCalls()).toHaveLength(2); expect(String(postCalls()[1][1]!.body)).toBe(original); expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Follow-up recorded");
  });
  it("does not restore old customer contact after a committed-reassignment reply is lost and retry is denied", async () => {
    await render(); await click("Reassign customer");
    (host.querySelector('[name="assignee"]') as HTMLInputElement).value = id(12);
    fetcher.mockRejectedValueOnce(new Error("response lost")); await submitForm(); noCustomer();
    const original = String(postCalls()[0][1]!.body);
    fetcher.mockResolvedValueOnce(json({ ok: false, code: "not_found" }, 404)); await click("Retry the same command");
    expect(String(postCalls()[1][1]!.body)).toBe(original); expect(host.textContent).toContain("Workspace access denied"); noCustomer();
    expect(button("Retry the same command")).toBeUndefined(); expect(host.textContent).not.toContain("Reassignment recorded");
  });
  it("does not automatically mutate after a revision conflict and fresh read", async () => {
    await render(); fetcher.mockResolvedValueOnce(json({ ok: false, code: "revision_conflict" }, 409)); await followup();
    expect(host.textContent).toContain("Assignment changed"); expect(postCalls()).toHaveLength(1); noCustomer();
    await click("Refresh assigned customers"); expect(button("Record follow-up")).toBeDefined(); expect(postCalls()).toHaveLength(1);
  });
  it("discards a successful command result after sign-out", async () => {
    await render(); const response = deferred(); fetcher.mockReturnValueOnce(response.promise); await followup();
    const body = String(postCalls()[0][1]!.body); await render({ ...props, session: { state: "signed_out" } }); noCustomer();
    await act(async () => response.resolve(followupReceipt(body)));
    expect(host.textContent).toContain("Sign-in required"); expect(host.textContent).not.toContain("Follow-up recorded"); noCustomer();
  });
});

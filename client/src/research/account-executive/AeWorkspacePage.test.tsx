// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AE_OPERATION_CAPABILITIES, aeWorkspaceCommandSchema, type AeWorkspace } from "@shared/research/account-executive/workspace";
import { AE_PORTAL_PATH } from "@shared/research/account-executive/context";
import { researchAuthPath } from "@shared/research/auth-return-to";
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
      referral: { state: "unresolved" }, followups: [], followupsCompleteness: "historical_unavailable", requests: [{ requestId: id(8),
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
  vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000090");
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
  it("moves focus into an opened command form and back to its button on Cancel", async () => {
    await render();
    await click("Record follow-up");
    expect(document.activeElement).toBe(host.querySelector('[name="purpose"]'));
    await click("Cancel");
    expect(host.querySelector("form")).toBeNull();
    expect(document.activeElement).toBe(button("Record follow-up"));
    await click("Reassign customer");
    expect(document.activeElement).toBe(host.querySelector('[name="assignee"]'));
    await click("Cancel");
    expect(document.activeElement).toBe(button("Reassign customer"));
    expect(postCalls()).toHaveLength(0);
  });
  it("keeps both assigned customers visible when one customer's past followups are unavailable", async () => {
    const value = workspace(), partial = value.customers[0];
    value.customers.push({ ...partial,
      assignment: { ...partial.assignment, id: id(13), customerAuthUserId: id(14) },
      assignmentHistory: { state: "available", events: [{ id: id(15), assignmentId: id(13), scopeId: id(2),
        customerAuthUserId: id(14), revision: 1, actorAuthUserId: id(1), assigneeAuthUserId: id(1),
        previousAssigneeAuthUserId: null, kind: "assigned", occurredAt: at }] },
      contact: { state: "available", displayName: "Second assigned customer", email: "second@example.invalid", phone: null },
      followupsCompleteness: "complete", requests: [],
    });
    fetcher.mockResolvedValueOnce(loaded(value)); await render();
    const customers = host.querySelectorAll(".ae-customer"); expect(customers).toHaveLength(2);
    expect(customers[0].textContent).toContain("Synthetic customer");
    expect(customers[0].textContent).toContain("Past followups unavailable");
    expect(customers[0].textContent).toContain("No follow-ups are visible in this view.");
    expect(customers[0].textContent).not.toContain("No follow-ups are recorded.");
    expect(customers[1].textContent).toContain("Second assigned customer");
    expect(customers[1].textContent).toContain("No follow-ups are recorded.");
    expect(customers[1].textContent).not.toContain("Past followups unavailable");
    expect(host.textContent).not.toContain("Workspace unavailable");
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
  it.each(["remount", "token-refresh"] as const)("conceals a held reassignment through %s, old GET, uncertainty and terminal denial", async transition => {
    await render(); await click("Reassign customer");
    (host.querySelector('[name="assignee"]') as HTMLInputElement).value = id(12);
    const held = deferred(); fetcher.mockReturnValueOnce(held.promise); await submitForm(); noCustomer();
    const original = String(postCalls()[0][1]!.body), attempt = props.journal!.entries()[0];
    expect(attempt.status).toBe("pending");
    if (transition === "remount") {
      await act(async () => root.unmount()); root = createRoot(host); await render();
    } else {
      const session = props.session as Extract<AePortalSession, { state: "ready" }>;
      await render({ ...props, session: { ...session, accessToken: "ordinary-A-refreshed" } });
    }
    // This real page GET completed with the original assigned customer while
    // the original POST is still held; current GET data alone is insufficient.
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "GET")).toHaveLength(2);
    expect(attempt.status).toBe("pending"); noCustomer();
    expect(host.querySelector(".ae-customer")).toBeNull();
    expect(host.textContent).not.toContain("No assigned customers");
    await act(async () => held.reject(new Error("committed response lost")));
    expect(attempt.status).toBe("uncertain"); noCustomer();
    await click("Refresh assigned customers"); noCustomer();
    expect(props.journal!.entries()[0]).toBe(attempt);
    expect(JSON.stringify(attempt.command)).toBe(original);
    fetcher.mockResolvedValueOnce(json({ ok: false, code: "not_found" }, 404)); await click("Retry the same command");
    expect(postCalls()).toHaveLength(2); expect(String(postCalls()[1][1]!.body)).toBe(original);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1); expect(attempt.status).toBe("denied");
    expect(host.textContent).toContain("Workspace access denied"); noCustomer();
    expect(button("Retry the same command")).toBeUndefined();
    await click("Refresh assigned customers"); noCustomer();
    expect(host.querySelector(".ae-customer")).toBeNull();
    expect(props.journal!.entries()[0]).toBe(attempt);
  });
  it("does not automatically mutate after a revision conflict and fresh read", async () => {
    await render(); fetcher.mockResolvedValueOnce(json({ ok: false, code: "revision_conflict" }, 409)); await followup();
    expect(host.textContent).toContain("Assignment changed"); expect(postCalls()).toHaveLength(1); noCustomer();
    await click("Refresh assigned customers"); expect(button("Record follow-up")).toBeDefined(); expect(postCalls()).toHaveLength(1);
  });
  it("recovers a denied target after a fresh exact owned read and permits only a new explicit command", async () => {
    await render(); await click("Reassign customer");
    (host.querySelector('[name="assignee"]') as HTMLInputElement).value = id(12);
    fetcher.mockResolvedValueOnce(json({ ok: false, code: "access_denied" }, 403)); await submitForm();
    const original = JSON.parse(String(postCalls()[0][1]!.body)), denied = props.journal!.entries()[0];
    expect(denied.status).toBe("denied"); noCustomer();
    const fresh = deferred(); fetcher.mockReturnValueOnce(fresh.promise); await click("Refresh assigned customers");
    noCustomer(); expect(props.journal!.entries()).toEqual([denied]);
    await act(async () => fresh.resolve(loaded()));
    expect(host.textContent).toContain("Synthetic customer"); expect(props.journal!.entries()).toEqual([]);
    expect(postCalls()).toHaveLength(1); expect(button("Retry the same command")).toBeUndefined();
    await click("Reassign customer");
    (host.querySelector('[name="assignee"]') as HTMLInputElement).value = id(13);
    vi.mocked(crypto.randomUUID).mockReturnValueOnce("00000000-0000-4000-8000-000000000094");
    fetcher.mockResolvedValueOnce(json({ ok: false, code: "not_found" }, 404)); await submitForm();
    const corrected = JSON.parse(String(postCalls()[1][1]!.body));
    expect(corrected).toEqual({ ...original, commandId: id(94), nextAssigneeAuthUserId: id(13) });
    expect(postCalls()).toHaveLength(2); expect(crypto.randomUUID).toHaveBeenCalledTimes(2); noCustomer();
  });
  it("allows correcting an invalid followup only after a fresh authoritative read", async () => {
    await render(); fetcher.mockResolvedValueOnce(json({ ok: false, code: "invalid_input" }, 400)); await followup();
    const original = JSON.parse(String(postCalls()[0][1]!.body));
    expect(props.journal!.entries()[0].status).toBe("denied"); noCustomer();
    await click("Refresh assigned customers");
    expect(props.journal!.entries()).toEqual([]); expect(button("Record follow-up")).toBeDefined();
    expect(postCalls()).toHaveLength(1);
    vi.mocked(crypto.randomUUID).mockReturnValueOnce("00000000-0000-4000-8000-000000000095");
    fetcher.mockImplementationOnce(async (_url, init) => followupReceipt(String(init!.body))); await followup();
    const corrected = JSON.parse(String(postCalls()[1][1]!.body));
    expect(corrected).toEqual({ ...original, commandId: id(95) });
    expect(host.textContent).toContain("Follow-up recorded"); expect(postCalls()).toHaveLength(2);
  });
  it.each(["revoked", "expired", "missing", "other-actor", "other-scope", "other-assignee", "newer-revision"])(
    "does not release a denied reassign from %s readback", async kind => {
      await render(); await click("Reassign customer");
      (host.querySelector('[name="assignee"]') as HTMLInputElement).value = id(12);
      fetcher.mockResolvedValueOnce(json({ ok: false, code: "access_denied" }, 403)); await submitForm();
      const denied = props.journal!.entries()[0], value = workspace();
      if (kind === "missing") value.customers = [];
      if (kind === "other-actor") value.actorAuthUserId = id(11);
      if (kind === "other-scope") value.scopeId = id(12);
      if (kind === "other-assignee") value.customers[0].assignment.assigneeAuthUserId = id(13);
      if (kind === "newer-revision") value.customers[0].assignment.revision = 4;
      fetcher.mockResolvedValueOnce(kind === "revoked" || kind === "expired"
        ? json({ ok: false, code: "access_denied" }, kind === "revoked" ? 403 : 401) : loaded(value));
      await click("Refresh assigned customers"); noCustomer();
      expect(props.journal!.entries()).toEqual([denied]); expect(postCalls()).toHaveLength(1);
      expect(button("Retry the same command")).toBeUndefined(); expect(button("Reassign customer")).toBeUndefined();
      if (kind === "revoked") expect(host.textContent).toContain("Workspace access denied");
      if (kind === "expired") expect(host.textContent).toContain("Session expired");
    });
  it("discards a successful command result after sign-out", async () => {
    await render(); const response = deferred(); fetcher.mockReturnValueOnce(response.promise); await followup();
    const body = String(postCalls()[0][1]!.body); await render({ ...props, session: { state: "signed_out" } }); noCustomer();
    await act(async () => response.resolve(followupReceipt(body)));
    expect(host.textContent).toContain("Sign-in required"); expect(host.textContent).not.toContain("Follow-up recorded"); noCustomer();
  });
});

describe("AE page keyboard and session recovery", () => {
  it("keeps keyboard focus on Refresh while the list reloads, and ignores a second press (A3)", async () => {
    await render(); const refresh = button("Refresh assigned customers")!; refresh.focus();
    const next = deferred(); fetcher.mockReturnValueOnce(next.promise);
    await act(async () => refresh.click());
    expect(refresh.disabled).toBe(false); expect(refresh.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(refresh);
    await act(async () => refresh.click()); expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => next.resolve(loaded()));
    expect(button("Refresh assigned customers")).toBe(refresh); expect(document.activeElement).toBe(refresh);
    expect(refresh.hasAttribute("aria-disabled")).toBe(false); expect(host.textContent).toContain("Synthetic customer");
  });
  it("links an expired session to the canonical sign-in with the workspace as return (A4)", async () => {
    fetcher.mockResolvedValueOnce(json({ ok: false, code: "access_denied" }, 401)); await render();
    expect(host.textContent).toContain("Session expired"); noCustomer();
    const link = [...host.querySelectorAll("a")].find(value => value.textContent === "Sign in again");
    expect(link?.getAttribute("href")).toBe(researchAuthPath("/research/sign-in", AE_PORTAL_PATH));
  });
  it("shows no completion or due-date control without the server followup:manage capability", async () => {
    const value = workspace(), customer = value.customers[0];
    customer.followups = [{ id: id(20), customerAuthUserId: id(4), assignmentId: id(3), ownerAuthUserId: id(1),
      purpose: "contact_customer", dueAt: "2026-11-19T15:00:00.000Z", state: "open", createdAt: at }];
    fetcher.mockResolvedValueOnce(loaded(value)); await render();
    expect(host.textContent).toContain("Open · Due");
    expect(button("Mark complete")).toBeUndefined(); expect(button("Change due date")).toBeUndefined();
  });
});

// Runs only once A's shared contract lists followup:manage and accepts the two
// commands Root stated in KAN-225/13949. Before that the strict workspace parse
// rejects the capability, so these controls cannot render at all.
const lifecycleContract = (AE_OPERATION_CAPABILITIES as readonly string[]).includes("followup:manage")
  && aeWorkspaceCommandSchema.safeParse({ kind: "complete_followup", commandId: id(90), assignmentId: id(3),
    customerAuthUserId: id(4), expectedRevision: 3, followupId: id(20) }).success
  && aeWorkspaceCommandSchema.safeParse({ kind: "reschedule_followup", commandId: id(90), assignmentId: id(3),
    customerAuthUserId: id(4), expectedRevision: 3, followupId: id(20), dueAt: "2026-11-20T15:00:00.000Z" }).success;
const openDue = "2026-11-19T15:00:00.000Z";
function managed(): AeWorkspace {
  const value = workspace();
  value.capabilities = [...value.capabilities, "followup:manage"] as AeWorkspace["capabilities"];
  value.customers[0].followups = [
    { id: id(20), customerAuthUserId: id(4), assignmentId: id(3), ownerAuthUserId: id(1),
      purpose: "contact_customer", dueAt: openDue, state: "open", createdAt: at },
    { id: id(21), customerAuthUserId: id(4), assignmentId: id(3), ownerAuthUserId: id(1),
      purpose: "documentation_followup", dueAt: at, state: "completed", createdAt: at },
  ];
  return value;
}
const fieldValue = (value: string) => {
  const due = new Date(value), pad = (n: number) => String(n).padStart(2, "0");
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(due.getMinutes())}`;
};
const base = { commandId: id(90), assignmentId: id(3), customerAuthUserId: id(4), expectedRevision: 3 };

describe.runIf(lifecycleContract)("AE follow-up completion and rescheduling", () => {
  beforeEach(() => { fetcher.mockImplementation(async () => loaded(managed())); });
  it("offers both controls only on the open follow-up owned by this assignee, named for that follow-up", async () => {
    await render();
    const complete = [...host.querySelectorAll("button")].filter(value => value.textContent === "Mark complete");
    const reschedule = [...host.querySelectorAll("button")].filter(value => value.textContent === "Change due date");
    expect(complete).toHaveLength(1); expect(reschedule).toHaveLength(1);
    expect(complete[0].getAttribute("aria-label")).toMatch(/^Mark complete: Contact customer, due /);
    expect(reschedule[0].getAttribute("aria-label")).toMatch(/^Change due date: Contact customer, due /);
    expect(complete[0].closest("li")!.textContent).toContain("Open");
    expect(postCalls()).toHaveLength(0);
  });
  it("hides both controls while another command is unresolved", async () => {
    await render(); fetcher.mockRejectedValueOnce(new Error("lost")); await followup();
    expect(host.textContent).toContain("Command outcome unconfirmed");
    await click("Refresh assigned customers");
    expect(button("Mark complete")).toBeUndefined(); expect(button("Change due date")).toBeUndefined();
  });
  it("moves focus into the completion form and back to its own button on Cancel", async () => {
    await render(); await click("Mark complete");
    // Focus lands on the heading, so the key that opened the form cannot also confirm it.
    expect(document.activeElement).toBe(host.querySelector("form h3"));
    expect(document.activeElement).not.toBe(button("Confirm completion")); expect(postCalls()).toHaveLength(0);
    expect(host.querySelector("form")!.getAttribute("aria-label")).toBe("Confirm completion");
    await click("Cancel"); expect(host.querySelector("form")).toBeNull();
    expect(document.activeElement).toBe(button("Mark complete")); expect(postCalls()).toHaveLength(0);
  });
  it("sends the exact complete_followup command and retries the same body after a lost reply", async () => {
    await render(); await click("Mark complete");
    fetcher.mockRejectedValueOnce(new Error("lost")); await submitForm();
    expect(postCalls()).toHaveLength(1);
    const original = String(postCalls()[0][1]!.body);
    expect(JSON.parse(original)).toEqual({ ...base, kind: "complete_followup", followupId: id(20) });
    expect(host.textContent).toContain("Command outcome unconfirmed"); noCustomer();
    const held = deferred(); fetcher.mockReturnValueOnce(held.promise); await click("Retry the same command");
    expect(postCalls()).toHaveLength(2); expect(String(postCalls()[1][1]!.body)).toBe(original);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1); expect(host.textContent).toContain("Confirming command outcome");
    await act(async () => held.reject(new Error("lost again")));
  });
  it("prefills the current due time, refuses an unchanged time, and sends reschedule_followup with the new instant", async () => {
    await render(); await click("Change due date");
    const input = host.querySelector('[name="dueAt"]') as HTMLInputElement;
    expect(document.activeElement).toBe(input); expect(input.value).toBe(fieldValue(openDue));
    await submitForm();
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Choose a different due date and time.");
    expect(postCalls()).toHaveLength(0);
    input.value = "2026-11-20T09:15";
    fetcher.mockResolvedValueOnce(json({ ok: false, code: "revision_conflict" }, 409)); await submitForm();
    expect(JSON.parse(String(postCalls()[0][1]!.body))).toEqual({ ...base, kind: "reschedule_followup", followupId: id(20),
      dueAt: new Date("2026-11-20T09:15").toISOString() });
    expect(host.textContent).toContain("Assignment changed"); expect(postCalls()).toHaveLength(1); noCustomer();
  });
  // A real receipt through the shared client check (A's 08468e53/8f9bdfc2).
  // Completion carries the native microsecond dueAt that 8f9bdfc2 writes.
  function lifecycleReceipt(body: string, kind: "followup_completed" | "followup_rescheduled", followup: { state: "open" | "completed"; dueAt: string }) {
    const command = JSON.parse(body);
    return json({ ok: true, value: { commandId: command.commandId, replay: false,
      assignment: { ...workspace().customers[0].assignment, revision: 4 },
      followup: { id: command.followupId, customerAuthUserId: id(4), assignmentId: id(3), ownerAuthUserId: id(1),
        purpose: "contact_customer", createdAt: at, ...followup },
      audit: { id: id(93), commandId: command.commandId, actorAuthUserId: id(1), assignmentId: id(3), customerAuthUserId: id(4),
        kind, occurredAt: "2026-11-19T16:00:00.000Z" }, followupTransfers: [] } });
  }
  it("confirms a completed follow-up from a valid receipt and returns focus to Refresh", async () => {
    await render(); await click("Mark complete");
    fetcher.mockImplementationOnce(async (_url, init) =>
      lifecycleReceipt(String(init!.body), "followup_completed", { state: "completed", dueAt: "2026-11-19T15:00:00.123456Z" }));
    await submitForm();
    expect(postCalls()).toHaveLength(1);
    expect(host.textContent).toContain("Follow-up marked complete. Refresh to load the current assignment.");
    expect(document.activeElement).toBe(button("Refresh assigned customers"));
    expect(button("Retry the same command")).toBeUndefined(); noCustomer();
  });
  it("confirms a rescheduled follow-up only when the receipt repeats the sent due time", async () => {
    await render(); await click("Change due date");
    (host.querySelector('[name="dueAt"]') as HTMLInputElement).value = "2026-11-20T09:15";
    fetcher.mockImplementationOnce(async (_url, init) => lifecycleReceipt(String(init!.body), "followup_rescheduled",
      { state: "open", dueAt: JSON.parse(String(init!.body)).dueAt }));
    await submitForm();
    expect(JSON.parse(String(postCalls()[0][1]!.body)).dueAt).toBe(new Date("2026-11-20T09:15").toISOString());
    expect(host.textContent).toContain("Follow-up due date changed. Refresh to load the current assignment.");
    expect(document.activeElement).toBe(button("Refresh assigned customers")); noCustomer();
  });
  it("does not report completion when the receipt records a different operation", async () => {
    await render(); await click("Mark complete");
    fetcher.mockImplementationOnce(async (_url, init) =>
      lifecycleReceipt(String(init!.body), "followup_rescheduled", { state: "open", dueAt: openDue }));
    await submitForm();
    expect(postCalls()).toHaveLength(1);
    expect(host.textContent).not.toContain("Follow-up marked complete"); noCustomer();
  });
});

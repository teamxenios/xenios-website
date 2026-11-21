import { afterEach, describe, expect, it, vi } from "vitest";
import type { AeCommandReceipt, AeWorkspace, AeWorkspaceCommand } from "@shared/research/account-executive/workspace";
import { AeWorkspaceApiError, createAeCommandJournal, createAeWorkspaceApi, type AeSessionBinding } from "./workspace-api";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-11-18T14:00:00.000Z";
const binding: AeSessionBinding = { actorAuthUserId: id(1), scopeId: id(2), accessToken: "ordinary-session-bearer", sessionInstance: {} };
function workspace(): AeWorkspace {
  return { schemaVersion: 1, actorAuthUserId: id(1), scopeId: id(2), generatedAt: at,
    capabilities: ["workspace:read", "customer:contact", "followup:record", "customer:reassign"], customers: [{
      assignment: { id: id(3), scopeId: id(2), customerAuthUserId: id(4), assigneeAuthUserId: id(1), revision: 3 },
      assignmentHistory: { state: "unavailable" }, contact: { state: "available", displayName: "Synthetic customer", email: "fixture@example.invalid", phone: null },
      referral: { state: "unresolved" }, requests: [], followups: [], followupsCompleteness: "historical_unavailable",
    }] };
}
const command = (): AeWorkspaceCommand => ({ kind: "record_followup", commandId: id(5), assignmentId: id(3), customerAuthUserId: id(4),
  expectedRevision: 3, purpose: "contact_customer", dueAt: at });
function receipt(input = command()) {
  const audit = { id: id(7), commandId: input.commandId, actorAuthUserId: id(1), assignmentId: id(3), customerAuthUserId: id(4),
    kind: input.kind === "record_followup" ? "followup_recorded" : "assignment_reassigned", occurredAt: at };
  return { commandId: input.commandId, replay: false,
    assignment: { ...workspace().customers[0].assignment, revision: 4, assigneeAuthUserId: input.kind === "reassign" ? input.nextAssigneeAuthUserId : id(1) }, audit,
    followup: input.kind === "record_followup" ? { id: id(6), assignmentId: id(3), customerAuthUserId: id(4), ownerAuthUserId: id(1),
      purpose: input.purpose, dueAt: input.dueAt, createdAt: at, state: "open" } : null, followupTransfers: [],
  };
}
type LifecycleCommand = Extract<AeWorkspaceCommand, { kind: "complete_followup" | "reschedule_followup" }>;
function lifecycleCommand(kind: LifecycleCommand["kind"]): LifecycleCommand {
  const base = { commandId: id(50), assignmentId: id(3), customerAuthUserId: id(4), expectedRevision: 3, followupId: id(6) };
  return kind === "complete_followup" ? { ...base, kind }
    : { ...base, kind, dueAt: "2026-11-20T14:00:00.000Z" };
}
function lifecycleReceipt(input: LifecycleCommand, replay = false): AeCommandReceipt {
  return { commandId: input.commandId, replay,
    assignment: { ...workspace().customers[0].assignment, revision: input.expectedRevision + 1 },
    audit: { id: id(51), commandId: input.commandId, actorAuthUserId: id(1), assignmentId: input.assignmentId,
      customerAuthUserId: input.customerAuthUserId, occurredAt: "2026-11-18T14:01:00.000Z",
      kind: input.kind === "complete_followup" ? "followup_completed" : "followup_rescheduled" },
    followup: { id: input.followupId, assignmentId: input.assignmentId, customerAuthUserId: input.customerAuthUserId,
      ownerAuthUserId: id(1), purpose: "documentation_followup", createdAt: at,
      dueAt: input.kind === "reschedule_followup" ? input.dueAt : "2026-11-19T14:00:00.000Z",
      state: input.kind === "complete_followup" ? "completed" : "open" }, followupTransfers: [],
  };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("connected AE API boundary", () => {
  it("uses the fixed private endpoint and ordinary bearer, without browser-selected authority", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true, value: workspace() }));
    const api = createAeWorkspaceApi(binding, () => true, fetcher);
    expect(await api.read()).toEqual(workspace());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual(["/api/research/account-executive/workspace", expect.objectContaining({
      method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { Authorization: "Bearer ordinary-session-bearer", Accept: "application/json" }, body: undefined,
    })]);
  });
  it.each(["actor", "scope", "extra", "raw-referral"])("rejects %s contamination instead of showing fallback customers", async kind => {
    const value = workspace();
    if (kind === "actor") value.actorAuthUserId = id(99);
    if (kind === "scope") value.scopeId = id(99);
    if (kind === "extra") Object.assign(value, { supplierCost: 100, clinicalNotes: "PRIVATE_SENTINEL" });
    if (kind === "raw-referral") Object.assign(value.customers[0].referral, { rawInput: "PRIVATE_SENTINEL" });
    const api = createAeWorkspaceApi(binding, () => true, vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true, value })));
    await expect(api.read()).rejects.toMatchObject({ kind: "unavailable" });
  });
  it.each([[401, "access_denied", "session_expired"], [403, "access_denied", "denied"], [404, "not_found", "not_found"],
    [409, "revision_conflict", "conflict"], [409, "idempotency_conflict", "conflict"], [400, "invalid_input", "invalid_input"],
    [503, "unavailable", "unavailable"], [500, "access_denied", "unavailable"]] as const)("handles exact HTTP%s/%s safely", async (status, code, kind) => {
    const api = createAeWorkspaceApi(binding, () => true, vi.fn<typeof fetch>().mockResolvedValue(json({ ok: false, code }, status)));
    await expect(api.read()).rejects.toMatchObject({ kind });
  });
  it("does not trust a failure envelope with reflected diagnostics", async () => {
    const api = createAeWorkspaceApi(binding, () => true, vi.fn<typeof fetch>().mockResolvedValue(json({ ok: false, code: "access_denied", detail: "PRIVATE_SENTINEL" }, 403)));
    await expect(api.read()).rejects.toMatchObject({ kind: "unavailable", message: "AE operation could not be confirmed." });
  });
  it("posts only the frozen command and binds the actual follow-up receipt", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true, value: receipt() }));
    const api = createAeWorkspaceApi(binding, () => true, fetcher);
    expect(await api.command(command(), [])).toEqual(receipt());
    expect(fetcher.mock.calls[0][0]).toBe("/api/research/account-executive/commands");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(command());
    await expect(api.command({ ...command(), actorAuthUserId: id(1) } as AeWorkspaceCommand, [])).rejects.toMatchObject({ kind: "invalid_input" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["actor", "scope", "revision", "command", "customer", "followup", "extra"])("rejects a mismatched %s receipt", async kind => {
    const value = receipt();
    if (kind === "actor") value.audit.actorAuthUserId = id(99);
    if (kind === "scope") value.assignment.scopeId = id(99);
    if (kind === "revision") value.assignment.revision = 5;
    if (kind === "command") value.audit.commandId = id(99);
    if (kind === "customer") value.assignment.customerAuthUserId = id(99);
    if (kind === "followup") value.followup!.ownerAuthUserId = id(99);
    if (kind === "extra") Object.assign(value, { contact: { email: "PRIVATE_SENTINEL" } });
    const api = createAeWorkspaceApi(binding, () => true, vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true, value })));
    await expect(api.command(command(), [])).rejects.toMatchObject({ kind: "unavailable" });
  });
  it("requires exact open-task transfer evidence on reassignment", async () => {
    const input: AeWorkspaceCommand = { kind: "reassign", commandId: id(5), assignmentId: id(3), customerAuthUserId: id(4), expectedRevision: 3, nextAssigneeAuthUserId: id(8) };
    const value = { ...receipt(input), followupTransfers: [{ followupId: id(9), fromOwnerAuthUserId: id(1), toOwnerAuthUserId: id(8), auditId: id(7), occurredAt: at }] };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ ok: true, value })).mockResolvedValueOnce(json({ ok: true, value: receipt(input) }));
    const api = createAeWorkspaceApi(binding, () => true, fetcher);
    expect(await api.command(input, [id(9)])).toEqual(value);
    await expect(api.command(input, [id(9)])).rejects.toMatchObject({ kind: "unavailable" });
  });
  it("fences dispatch and a late parsed result after the starting session changes", async () => {
    let current = false;
    const fetcher = vi.fn<typeof fetch>(); const api = createAeWorkspaceApi(binding, () => current, fetcher);
    await expect(api.read()).rejects.toMatchObject({ kind: "stale" }); expect(fetcher).not.toHaveBeenCalled();
    current = true; const body = deferred<unknown>();
    fetcher.mockResolvedValue({ status: 200, json: () => body.promise } as Response);
    const result = api.read(); await Promise.resolve(); current = false; body.resolve({ ok: true, value: workspace() });
    await expect(result).rejects.toMatchObject({ kind: "stale" });
  });
  it("bounds a lost response and never repeats the POST automatically", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const result = createAeWorkspaceApi(binding, () => true, fetcher).command(command(), []);
    const failure = expect(result).rejects.toMatchObject({ kind: "unavailable" });
    await vi.advanceTimersByTimeAsync(30_000); await failure; expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("redacts transport diagnostics and never substitutes an anonymous request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("PRIVATE_SENTINEL"));
    await expect(createAeWorkspaceApi(binding, () => true, fetcher).read()).rejects.toEqual(new AeWorkspaceApiError("unavailable"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("session-scoped AE command coordination", () => {
  it.each(["record_followup", "reassign"] as const)("reconciles an eligible denied %s only after a new exact owned read", kind => {
    const journal = createAeCommandJournal(binding.sessionInstance, id(1), id(2));
    const input = kind === "record_followup" ? command() : { kind, commandId: id(5), assignmentId: id(3),
      customerAuthUserId: id(4), expectedRevision: 3, nextAssigneeAuthUserId: id(8) };
    const attempt = journal.prepare(input, [])!;
    journal.settle(attempt, "denied", true);
    expect(journal.prepare({ ...input, commandId: id(9) }, [])).toBeNull();
    journal.readback(workspace()); expect(journal.entries()).toEqual([attempt]);
    journal.beginReadback()(workspace()); expect(journal.entries()).toEqual([]);
    expect(journal.prepare({ ...input, commandId: id(9) }, [])?.command.commandId).toBe(id(9));
  });
  it("does not use a read begun before terminal denial to clear the attempt", () => {
    const journal = createAeCommandJournal(binding.sessionInstance, id(1), id(2));
    const attempt = journal.prepare(command(), [])!, alreadyReading = journal.beginReadback();
    journal.settle(attempt, "denied", true); alreadyReading(workspace());
    expect(journal.entries()).toEqual([attempt]);
    journal.beginReadback()(workspace()); expect(journal.entries()).toEqual([]);
  });
  it.each(["actor", "scope", "customer", "assignment", "assignee", "assignment-scope", "older-revision", "newer-revision", "missing"])(
    "keeps denied reconciliation closed for %s readback", kind => {
      const journal = createAeCommandJournal(binding.sessionInstance, id(1), id(2));
      const attempt = journal.prepare(command(), [])!; journal.settle(attempt, "denied", true);
      const value = workspace();
      if (kind === "actor") value.actorAuthUserId = id(99);
      if (kind === "scope") value.scopeId = id(99);
      if (kind === "customer") value.customers[0].assignment.customerAuthUserId = id(99);
      if (kind === "assignment") value.customers[0].assignment.id = id(99);
      if (kind === "assignee") value.customers[0].assignment.assigneeAuthUserId = id(99);
      if (kind === "assignment-scope") value.customers[0].assignment.scopeId = id(99);
      if (kind === "older-revision") value.customers[0].assignment.revision = 2;
      if (kind === "newer-revision") value.customers[0].assignment.revision = 4;
      if (kind === "missing") value.customers = [];
      journal.beginReadback()(value); expect(journal.entries()).toEqual([attempt]);
    });
  it.each(["pending", "uncertain", "terminal-denied"] as const)("never clears %s from a current owned read", kind => {
    const journal = createAeCommandJournal(binding.sessionInstance, id(1), id(2));
    const attempt = journal.prepare(command(), [])!;
    if (kind === "uncertain") journal.settle(attempt, "uncertain");
    if (kind === "terminal-denied") journal.settle(attempt, "denied");
    journal.beginReadback()(workspace()); expect(journal.entries()).toEqual([attempt]);
  });
  it("freezes the original fields and keeps uncertainty through remount/readback, without customer data", () => {
    const journal = createAeCommandJournal(binding.sessionInstance, id(1), id(2));
    const input = command(), ids = [id(9)]; const attempt = journal.prepare(input, ids)!;
    expect(Object.isFrozen(attempt.command)).toBe(true); input.expectedRevision = 99; ids.push(id(10));
    journal.settle(attempt, "uncertain"); journal.readback(workspace());
    expect(journal.entries()[0]).toBe(attempt); expect(attempt.command.expectedRevision).toBe(3); expect(attempt.openFollowupIds).toEqual([id(9)]);
    expect(journal.prepare({ ...command(), assignmentId: id(22), commandId: id(23) }, [])).toBeNull();
    expect(journal.retry(attempt)).toBe(true); expect(journal.retry(attempt)).toBe(false);
    journal.settle(attempt, "confirmed"); journal.settle(attempt, "uncertain"); expect(attempt.status).toBe("confirmed");
    expect(JSON.stringify(journal.entries())).not.toMatch(/"(?:accessToken|email|displayName|contact|receipt)"\s*:/);
    expect(journal.matches(binding.sessionInstance, id(1), id(2))).toBe(true);
    expect(journal.matches({}, id(1), id(2))).toBe(false); expect(journal.matches(binding.sessionInstance, id(1), id(99))).toBe(false);
  });
});

describe("lifecycle receipts through the real API validator and command journal", () => {
  it.each(["complete_followup", "reschedule_followup"] as const)("accepts fresh and recorded %s receipts without reassignment evidence", async kind => {
    const input = lifecycleCommand(kind);
    for (const replay of [false, true]) {
      const value = lifecycleReceipt(input, replay), fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true, value }));
      const api = createAeWorkspaceApi(binding, () => true, fetcher);
      expect(await api.command(input, [])).toEqual(value);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe("/api/research/account-executive/commands");
      expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(input);
    }
  });
  it.each(["complete_followup", "reschedule_followup"] as const)("refuses forged %s receipt identity, state, audit or transfer evidence", async kind => {
    const input = lifecycleCommand(kind);
    for (const field of ["command", "audit-command", "audit-actor", "audit-customer", "audit-assignment", "scope", "customer",
      "revision", "assignee", "task", "task-assignment", "task-customer", "owner", "null-task", "audit-kind", "state", "transfer", "creation", "extra"]) {
      const value = lifecycleReceipt(input), followup = value.followup!;
      if (field === "command") value.commandId = id(99);
      if (field === "audit-command") value.audit.commandId = id(99);
      if (field === "audit-actor") value.audit.actorAuthUserId = id(99);
      if (field === "audit-customer") value.audit.customerAuthUserId = id(99);
      if (field === "audit-assignment") value.audit.assignmentId = id(99);
      if (field === "scope") value.assignment.scopeId = id(99);
      if (field === "customer") value.assignment.customerAuthUserId = id(99);
      if (field === "revision") value.assignment.revision++;
      if (field === "assignee") value.assignment.assigneeAuthUserId = id(99);
      if (field === "task") followup.id = id(99);
      if (field === "task-assignment") followup.assignmentId = id(99);
      if (field === "task-customer") followup.customerAuthUserId = id(99);
      if (field === "owner") followup.ownerAuthUserId = id(99);
      if (field === "null-task") value.followup = null;
      if (field === "audit-kind") value.audit.kind = "assignment_reassigned";
      if (field === "state") followup.state = kind === "complete_followup" ? "open" : "completed";
      if (field === "transfer") value.followupTransfers = [{ followupId: input.followupId, fromOwnerAuthUserId: id(1),
        toOwnerAuthUserId: id(8), auditId: value.audit.id, occurredAt: value.audit.occurredAt }];
      if (field === "creation") followup.createdAt = "2026-11-19T14:00:00.000Z";
      if (field === "extra") Object.assign(value, { contact: { email: "PRIVATE_SENTINEL" } });
      const api = createAeWorkspaceApi(binding, () => true, vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true, value })));
      await expect(api.command(input, [])).rejects.toMatchObject({ kind: "unavailable", message: "AE operation could not be confirmed." });
    }
  });
  it("requires the exact rescheduled due instant string from the saved command", async () => {
    const input = lifecycleCommand("reschedule_followup"), value = lifecycleReceipt(input);
    value.followup!.dueAt = "2026-11-21T14:00:00.000Z";
    const api = createAeWorkspaceApi(binding, () => true, vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true, value })));
    await expect(api.command(input, [])).rejects.toMatchObject({ kind: "unavailable" });
  });
  it.each(["complete_followup", "reschedule_followup"] as const)("recovers a lost %s reply with the same saved command across API recreation", async kind => {
    const journal = createAeCommandJournal(binding.sessionInstance, id(1), id(2)), input = lifecycleCommand(kind);
    const attempt = journal.prepare(input, [])!, original = structuredClone(attempt.command);
    const value = lifecycleReceipt(attempt.command as LifecycleCommand, true);
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("PRIVATE_TRANSPORT_SENTINEL"))
      .mockResolvedValueOnce(json({ ok: true, value }));
    const first = createAeWorkspaceApi(binding, () => true, fetcher);
    await expect(first.command(attempt.command, attempt.openFollowupIds)).rejects.toMatchObject({ kind: "unavailable" });
    journal.settle(attempt, "uncertain");
    input.expectedRevision = 99; input.followupId = id(99);
    const current = workspace(); current.capabilities.push("followup:manage");
    current.generatedAt = "2026-11-18T14:02:00.000Z";
    current.customers[0].assignment.revision = value.assignment.revision;
    current.customers[0].followups = [structuredClone(value.followup!)];
    // Completion may now be closed; a later read cannot erase an uncertain POST.
    if (kind === "reschedule_followup") current.customers[0].followups[0].state = "completed";
    journal.beginReadback()(current);
    expect(attempt.status).toBe("uncertain"); expect(journal.entries()).toEqual([attempt]);
    expect(journal.prepare({ ...original, commandId: id(90), assignmentId: id(91) }, [])).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const refreshedBinding = { ...binding, accessToken: "refreshed-ordinary-bearer" };
    expect(journal.matches(refreshedBinding.sessionInstance, refreshedBinding.actorAuthUserId, refreshedBinding.scopeId)).toBe(true);
    const remounted = createAeWorkspaceApi(refreshedBinding, () => true, fetcher);
    expect(journal.retry(attempt)).toBe(true);
    const recorded = await remounted.command(attempt.command, attempt.openFollowupIds);
    expect(recorded).toEqual(value); journal.settle(attempt, "confirmed");
    expect(attempt.status).toBe("confirmed"); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual(original);
    expect(JSON.stringify(journal.entries())).not.toMatch(/accessToken|bearer|email|contact|receipt|displayName/);
    journal.beginReadback()(current); expect(journal.entries()).toEqual([]);
    expect(journal.prepare({ ...command(), commandId: id(90), expectedRevision: value.assignment.revision }, [])).not.toBeNull();
  });
  it.each(["complete_followup", "reschedule_followup"] as const)("keeps a malformed %s success uncertain until an explicit exact receipt retry", async kind => {
    const input = lifecycleCommand(kind), malformed = lifecycleReceipt(input), valid = lifecycleReceipt(input, true);
    malformed.followup!.id = id(99);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ ok: true, value: malformed }))
      .mockResolvedValueOnce(json({ ok: true, value: valid }));
    const api = createAeWorkspaceApi(binding, () => true, fetcher), journal = createAeCommandJournal(binding.sessionInstance, id(1), id(2));
    const attempt = journal.prepare(input, [])!;
    await expect(api.command(attempt.command, [])).rejects.toMatchObject({ kind: "unavailable" });
    journal.settle(attempt, "uncertain"); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(journal.retry(attempt)).toBe(true);
    expect(await api.command(attempt.command, [])).toEqual(valid); journal.settle(attempt, "confirmed");
    expect(attempt.status).toBe("confirmed"); expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
  });
  it.each(["complete_followup", "reschedule_followup"] as const)("refuses a late %s receipt after the starting session changes", async kind => {
    let current = true;
    const input = lifecycleCommand(kind), body = deferred<unknown>();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue({ status: 200, json: () => body.promise } as Response);
    const pending = createAeWorkspaceApi(binding, () => current, fetcher).command(input, []);
    await Promise.resolve(); current = false; body.resolve({ ok: true, value: lifecycleReceipt(input) });
    await expect(pending).rejects.toMatchObject({ kind: "stale" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["complete_followup", "reschedule_followup"] as const)("preserves known HTTP denials for %s instead of turning them into uncertain success", async kind => {
    const input = lifecycleCommand(kind);
    for (const [status, code, failure] of [[401, "access_denied", "session_expired"], [403, "access_denied", "denied"],
      [404, "not_found", "not_found"], [409, "revision_conflict", "conflict"], [409, "idempotency_conflict", "conflict"],
      [400, "invalid_input", "invalid_input"]] as const) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: false, code }, status));
      await expect(createAeWorkspaceApi(binding, () => true, fetcher).command(input, [])).rejects.toMatchObject({ kind: failure });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects unsupported command kinds before transport rather than assuming reassignment", async () => {
    const fetcher = vi.fn<typeof fetch>(), api = createAeWorkspaceApi(binding, () => true, fetcher);
    await expect(api.command({ ...lifecycleCommand("complete_followup"), kind: "future_followup" } as unknown as AeWorkspaceCommand, []))
      .rejects.toMatchObject({ kind: "invalid_input" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

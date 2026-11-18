import { describe, expect, it, vi } from "vitest";
import { REQUEST_INTENT_KIND } from "../../../shared/research/assisted-order/request-intent";
import {
  type AeWorkspaceCommand, type AeCommandReceipt,
} from "../../../shared/research/account-executive/workspace";
import {
  createAeWorkspaceService, type AeWorkspaceAuthorityPort, type AeOperationAuthority,
  type AeAuthorizedSnapshot, type AeAtomicCommandResult,
} from "./workspace";
import { memberOwnerHash } from "./identity-binding";
import { sha256AssistedOrderHasher } from "../assisted-order/defaults";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1), other = id(2), customer = id(3), partner = id(4), scope = id(5), assignmentId = id(6);
const session = { authUserId: actor, purpose: "ordinary" as const, sessionId: id(70) };
const at = "2026-11-18T14:00:00.000Z", submittedAt = "2026-11-18T13:30:00.000Z";
const ref = (requestId: string) => `XRI-${requestId.replaceAll("-", "").toUpperCase()}`;
const clone = <T,>(value: T): T => structuredClone(value);
function authority(): AeOperationAuthority {
  return { actorAuthUserId: actor, scopeId: scope, grantId: id(7), grantRevision: 1, active: true,
    validFrom: "2026-11-18T13:00:00.000Z", validUntil: "2026-11-18T16:00:00.000Z",
    capabilities: ["workspace:read", "customer:contact", "followup:record", "customer:reassign"] };
}
function snapshot(): AeAuthorizedSnapshot {
  return { authority: authority(), completeness: "complete", customers: [{
    assignment: { id: assignmentId, scopeId: scope, customerAuthUserId: customer, assigneeAuthUserId: actor, revision: 3 },
    contact: { customerAuthUserId: customer, displayName: "Fictional customer", email: "fictional@example.invalid", phone: null },
    referral: { state: "recorded", binding: { accountKey: `auth:${customer}`, partnerId: partner,
      linkId: id(10), touchId: id(11), boundAt: submittedAt, availability: "ready" } },
    requests: [{ ownerHash: memberOwnerHash(customer), receipt: { kind: REQUEST_INTENT_KIND, requestId: id(8),
      publicReference: ref(id(8)), status: "pending_review", createdAt: submittedAt }, workflow: null }], followups: [],
  }] };
}
function assignmentHistory(): NonNullable<AeAuthorizedSnapshot["customers"][number]["assignmentHistory"]> {
  return { state: "available", events: [
    { id: id(50), assignmentId, scopeId: scope, customerAuthUserId: customer, revision: 1,
      actorAuthUserId: id(40), previousAssigneeAuthUserId: null, assigneeAuthUserId: other,
      kind: "assigned", occurredAt: submittedAt },
    { id: id(51), assignmentId, scopeId: scope, customerAuthUserId: customer, revision: 2,
      actorAuthUserId: id(40), previousAssigneeAuthUserId: other, assigneeAuthUserId: actor,
      kind: "reassigned", occurredAt: at },
  ] };
}
function followup(): AeWorkspaceCommand {
  return { kind: "record_followup", commandId: id(9), assignmentId, customerAuthUserId: customer,
    expectedRevision: 3, purpose: "contact_customer", dueAt: "2026-11-19T14:00:00.000Z" };
}
function committed(command: AeWorkspaceCommand): AeAtomicCommandResult {
  const assignment = { ...snapshot().customers[0].assignment, revision: command.expectedRevision + 1,
    assigneeAuthUserId: command.kind === "reassign" ? command.nextAssigneeAuthUserId : actor };
  const receipt: AeCommandReceipt = { commandId: command.commandId, replay: false, assignment, followupTransfers: [],
    audit: { id: id(12), commandId: command.commandId, actorAuthUserId: actor, assignmentId,
      customerAuthUserId: customer, kind: command.kind === "reassign" ? "assignment_reassigned" : "followup_recorded", occurredAt: at },
    followup: command.kind === "record_followup" ? { id: id(13), customerAuthUserId: customer, assignmentId,
      ownerAuthUserId: actor, purpose: command.purpose, dueAt: command.dueAt, state: "open", createdAt: at } : null };
  return { authority: authority(), receipt };
}
function ports(source = snapshot()) {
  const port: AeWorkspaceAuthorityPort = {
    readAssignedSnapshot: vi.fn(async () => ({ ok: true as const, value: clone(source) })),
    authorizeCustomerOperation: vi.fn(async () => ({ ok: true as const,
      value: { authority: clone(source.authority), assignment: clone(source.customers[0].assignment), openFollowupIds: source.customers[0].followups.filter(row => row.state === "open").map(row => row.id) } })),
    commitAuthorizedCommand: vi.fn(async ({ command }) => ({ ok: true as const, value: committed(command) })),
  };
  return { port, service: createAeWorkspaceService(port, () => Date.parse(at)) };
}

describe("explicit-scoped AE workspace source service", () => {
  it("keeps referral attribution distinct from assignment and never infers queued from a receipt", async () => {
    const { service } = ports();
    const result = await service.read(session);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.value.customers[0];
    expect(row.assignment.assigneeAuthUserId).toBe(actor);
    expect(row.referral).toMatchObject({ state: "recorded", partnerId: partner });
    expect(row.requests[0]).toMatchObject({ receiptStatus: "pending_review", workflow: null });
    expect(row.contact).toMatchObject({ state: "available", email: "fictional@example.invalid" });
  });
  it("projects four distinct records without revealing or resolving original referral input", async () => {
    const source = snapshot(), row = source.customers[0];
    row.requests[0].originalReferralInput = { requestId: id(8), state: "recorded" };
    Object.assign(row.requests[0].originalReferralInput, { rawText: "PRIVATE_ORIGINAL_REFERRAL" });
    row.assignmentHistory = assignmentHistory();
    const result = await ports(source).service.read(session);
    expect(result).toMatchObject({ ok: true, value: { customers: [{
      assignment: { assigneeAuthUserId: actor }, assignmentHistory: assignmentHistory(),
      referral: { state: "recorded", partnerId: partner },
      requests: [{ originalReferralInput: { state: "redacted" } }],
    }] } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_ORIGINAL_REFERRAL");
    expect(row.referral).toMatchObject({ state: "recorded", binding: { partnerId: partner } });
  });
  it("keeps unresolved attribution usable under ordinary AE ownership without claiming empty history", async () => {
    const source = snapshot(); source.customers[0].referral = { state: "unresolved" };
    const result = await ports(source).service.read(session);
    expect(result).toMatchObject({ ok: true, value: { customers: [{
      assignment: { assigneeAuthUserId: actor }, referral: { state: "unresolved" },
      assignmentHistory: { state: "unavailable" }, requests: [{ originalReferralInput: { state: "unavailable" } }],
    }] } });
    const { service, port } = ports(source);
    expect((await service.command(session, followup())).ok).toBe(true);
    expect(port.commitAuthorizedCommand).toHaveBeenCalledTimes(1);
  });
  it("distinguishes a canonical no-input result and genuinely empty audit read from missing source", async () => {
    const source = snapshot();
    source.customers[0].requests[0].originalReferralInput = { requestId: id(8), state: "none" };
    source.customers[0].assignmentHistory = { state: "available", events: [] };
    expect(await ports(source).service.read(session)).toMatchObject({ ok: true, value: { customers: [{
      assignmentHistory: { state: "available", events: [] }, requests: [{ originalReferralInput: { state: "none" } }],
    }] } });
  });
  it("refuses original-input metadata attached to another request without leaking the source", async () => {
    const source = snapshot();
    source.customers[0].requests[0].originalReferralInput = { requestId: id(99), state: "recorded" };
    expect(await ports(source).service.read(session)).toEqual({ ok: false, code: "unavailable" });
  });
  it.each(["customer", "scope", "assignment", "revision", "actor_chain", "current_assignee", "duplicate", "partial", "future"])(
    "denies %s assignment history without reopening another AE's scope", async field => {
      const source = snapshot(), history = assignmentHistory();
      if (history.state !== "available") throw new Error("fictional_fixture_invalid");
      if (field === "customer") history.events[0].customerAuthUserId = id(99);
      if (field === "scope") history.events[0].scopeId = id(99);
      if (field === "assignment") history.events[0].assignmentId = id(99);
      if (field === "revision") history.events[1].revision = 4;
      if (field === "actor_chain") history.events[1].previousAssigneeAuthUserId = id(99);
      if (field === "current_assignee") history.events[1].assigneeAuthUserId = id(99);
      if (field === "duplicate") history.events[1].id = history.events[0].id;
      if (field === "partial") history.events.shift();
      if (field === "future") history.events[1].occurredAt = "2026-11-19T14:00:00.000Z";
      source.customers[0].assignmentHistory = history;
      const result = await ports(source).service.read(session);
      expect(result).toEqual({ ok: false, code: "unavailable" });
      expect(JSON.stringify(result)).not.toContain("fictional@example.invalid");
    },
  );
  it("requires a real port and a canonical actor id, not editable role/domain claims", async () => {
    expect(await createAeWorkspaceService(null).read(session)).toEqual({ ok: false, code: "unavailable" });
    const { port, service } = ports();
    expect(await service.read({ role: "research_rep", email: "rep@xeniostechnology.com" })).toEqual({ ok: false, code: "access_denied" });
    expect(port.readAssignedSnapshot).not.toHaveBeenCalled();
  });
  it("requires current explicit authority even when a source returned people", async () => {
    const source = snapshot(); source.authority.active = false;
    expect(await ports(source).service.read(session)).toEqual({ ok: false, code: "access_denied" });
    source.authority.active = true; source.authority.capabilities = ["customer:contact"];
    expect(await ports(source).service.read(session)).toEqual({ ok: false, code: "access_denied" });
  });
  it("denies recovery before any port even if a user-keyed authority claims ordinary purpose", async () => {
    const source = snapshot(); Object.assign(source.authority, { authenticationPurpose: "ordinary" });
    const { service, port } = ports(source);
    const recovery = { ...session, purpose: "recovery" };
    expect(await service.read(recovery)).toEqual({ ok: false, code: "access_denied" });
    expect(await service.command(recovery, followup())).toEqual({ ok: false, code: "access_denied" });
    expect(port.readAssignedSnapshot).not.toHaveBeenCalled();
    expect(port.authorizeCustomerOperation).not.toHaveBeenCalled();
    expect(port.commitAuthorizedCommand).not.toHaveBeenCalled();
  });
  it("rejects bare actor IDs and sessions without their verified session identity before any port", async () => {
    const { service, port } = ports();
    expect(await service.read(actor)).toEqual({ ok: false, code: "access_denied" });
    expect(await service.command({ authUserId: actor, purpose: "ordinary" }, followup())).toEqual({ ok: false, code: "access_denied" });
    expect(port.readAssignedSnapshot).not.toHaveBeenCalled();
    expect(port.authorizeCustomerOperation).not.toHaveBeenCalled();
  });
  it("denies a guest-session request with identical contact facts instead of accepting an attested customer UUID", async () => {
    const source = snapshot(), request = source.customers[0].requests[0];
    request.ownerHash = sha256AssistedOrderHasher.stableHash(["request-intent-owner", "session", "synthetic-customer", "synthetic-session"]);
    Object.assign(request, { ownerAuthUserId: customer, contact: clone(source.customers[0].contact) });
    const result = await ports(source).service.read(session);
    expect(result).toEqual({ ok: false, code: "unavailable" });
    expect(JSON.stringify(result)).not.toContain(request.receipt.requestId);
  });
  it("resolves authority anew and blocks the operation after revocation", async () => {
    const { port, service } = ports();
    vi.mocked(port.readAssignedSnapshot).mockResolvedValueOnce({ ok: true, value: snapshot() })
      .mockResolvedValueOnce({ ok: false, code: "access_denied" });
    expect((await service.read(session)).ok).toBe(true);
    expect(await service.read(session)).toEqual({ ok: false, code: "access_denied" });
    expect(port.readAssignedSnapshot).toHaveBeenCalledTimes(2);
  });
  it("denies a grant that expires while the source is awaited", async () => {
    let now = Date.parse(at); const { port } = ports();
    vi.mocked(port.readAssignedSnapshot).mockImplementation(async () => { now = Date.parse(authority().validUntil); return { ok: true, value: snapshot() }; });
    expect(await createAeWorkspaceService(port, () => now).read(session)).toEqual({ ok: false, code: "access_denied" });
  });
  it.each(["actor", "scope", "assignee", "contact", "referral", "request"])("refuses a mismatched %s binding without returning contact data", async field => {
    const source = snapshot(), row = source.customers[0];
    if (field === "actor") source.authority.actorAuthUserId = other;
    if (field === "scope") row.assignment.scopeId = id(99);
    if (field === "assignee") row.assignment.assigneeAuthUserId = other;
    if (field === "contact" && row.contact) row.contact.customerAuthUserId = other;
    if (field === "referral" && row.referral.state === "recorded") row.referral.binding.accountKey = `auth:${other}`;
    if (field === "request") row.requests = [{ ...row.requests[0], ownerHash: memberOwnerHash(other) }];
    const result = await ports(source).service.read(session);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("fictional@example.invalid");
  });
  it("strips private source additions and suppresses contact without its explicit capability", async () => {
    const source = snapshot();
    Object.assign(source.customers[0].requests[0].receipt, { optionalIntake: "PRIVATE_INTAKE_SENTINEL", lines: ["PRIVATE_PRODUCT_SENTINEL"] });
    Object.assign(source.customers[0].contact!, { clinicalNotes: "PRIVATE_NOTES_SENTINEL", wholesaleCost: 123 });
    const result = await ports(source).service.read(session);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|clinicalNotes|wholesaleCost|optionalIntake/);
    source.authority.capabilities = ["workspace:read"];
    expect((await ports(source).service.read(session))).toMatchObject({ ok: true, value: { customers: [{ contact: { state: "not_permitted" } }] } });
  });
  it("treats partial, duplicate and failed sources as unavailable, never a genuine empty list", async () => {
    const source = snapshot(); source.customers.push(clone(source.customers[0]));
    expect(await ports(source).service.read(session)).toEqual({ ok: false, code: "unavailable" });
    const partial = { ...snapshot(), completeness: "partial" } as unknown as AeAuthorizedSnapshot;
    expect(await ports(partial).service.read(session)).toEqual({ ok: false, code: "unavailable" });
    const { port, service } = ports();
    vi.mocked(port.readAssignedSnapshot).mockRejectedValue(new Error("PRIVATE_SOURCE_ERROR"));
    expect(await service.read(session)).toEqual({ ok: false, code: "unavailable" });
  });
  it("keeps canonical workflow history and refuses a workflow for another request", async () => {
    const source = snapshot(), request = source.customers[0].requests[0];
    request.workflow = { schemaVersion: 1, requestId: id(8), publicReference: ref(id(8)), state: "queued", revision: 1,
      changedAt: submittedAt, customerNotice: "unavailable", events: [
        { id: id(20), revision: 0, kind: "received", occurredAt: submittedAt },
        { id: id(21), revision: 1, kind: "queued", occurredAt: submittedAt },
      ] };
    expect((await ports(source).service.read(session))).toMatchObject({ ok: true, value: { customers: [{ requests: [{ workflow: { state: "queued" } }] }] } });
    request.workflow.requestId = id(99); request.workflow.publicReference = ref(id(99));
    expect(await ports(source).service.read(session)).toEqual({ ok: false, code: "unavailable" });
  });
});

describe("AE command boundary over a durable atomic authority port", () => {
  it("transfers open followups with audited receipt evidence and retains completed historical custody after A to B", async () => {
    const source = snapshot(), row = source.customers[0];
    row.assignmentHistory = assignmentHistory();
    row.followups = [
      { id: id(60), assignmentId, customerAuthUserId: customer, ownerAuthUserId: actor,
        purpose: "contact_customer", dueAt: at, createdAt: at, state: "open" },
      { id: id(61), assignmentId, customerAuthUserId: customer, ownerAuthUserId: actor,
        purpose: "documentation_followup", dueAt: at, createdAt: at, state: "completed" },
    ];
    const { port, service } = ports(source);
    const command: AeWorkspaceCommand = { kind: "reassign", commandId: id(9), assignmentId,
      customerAuthUserId: customer, expectedRevision: 3, nextAssigneeAuthUserId: other };
    vi.mocked(port.commitAuthorizedCommand).mockImplementationOnce(async input => {
      const result = committed(input.command);
      result.receipt.followupTransfers = [{ followupId: id(60), fromOwnerAuthUserId: actor,
        toOwnerAuthUserId: other, auditId: result.receipt.audit.id, occurredAt: result.receipt.audit.occurredAt }];
      row.followups = row.followups.map(task => task.state === "open" ? { ...task, ownerAuthUserId: other } : task);
      row.assignment = clone(result.receipt.assignment);
      if (row.assignmentHistory?.state !== "available") throw new Error("fictional_history_missing");
      row.assignmentHistory.events.push({ id: id(52), assignmentId, scopeId: scope, customerAuthUserId: customer,
        revision: 4, actorAuthUserId: actor, previousAssigneeAuthUserId: actor, assigneeAuthUserId: other,
        kind: "reassigned", occurredAt: at });
      source.authority.actorAuthUserId = other;
      return { ok: true, value: result };
    });
    expect(await service.command(session, command)).toMatchObject({ ok: true, value: { followup: null,
      followupTransfers: [{ followupId: id(60), fromOwnerAuthUserId: actor, toOwnerAuthUserId: other }] } });
    const read = await service.read({ ...session, authUserId: other, sessionId: id(71) });
    expect(read).toMatchObject({ ok: true, value: { customers: [{ assignment: { assigneeAuthUserId: other }, followups: [
      { id: id(60), ownerAuthUserId: other, state: "open" }, { id: id(61), ownerAuthUserId: actor, state: "completed" },
    ] }] } });
    expect(row.followups).toHaveLength(2);
    expect(port.commitAuthorizedCommand).toHaveBeenCalledTimes(1);
  });
  it("rejects a reassignment receipt that silently omits an open task transfer", async () => {
    const source = snapshot(); source.customers[0].followups = [{ id: id(60), assignmentId,
      customerAuthUserId: customer, ownerAuthUserId: actor, purpose: "contact_customer", dueAt: at, createdAt: at, state: "open" }];
    const { service } = ports(source);
    const command: AeWorkspaceCommand = { kind: "reassign", commandId: id(9), assignmentId,
      customerAuthUserId: customer, expectedRevision: 3, nextAssigneeAuthUserId: other };
    expect(await service.command(session, command)).toEqual({ ok: false, code: "unavailable" });
  });
  it("preflights an explicit customer scope and forwards immutable command identity to the atomic authority", async () => {
    const { port, service } = ports(), command = followup();
    const result = await service.command(session, command);
    expect(result).toMatchObject({ ok: true, value: { commandId: command.commandId, assignment: { revision: 4 }, audit: { kind: "followup_recorded" } } });
    expect(port.authorizeCustomerOperation).toHaveBeenCalledWith({ actorAuthUserId: actor, customerAuthUserId: customer, capability: "followup:record", at, sessionId: session.sessionId });
    expect(port.commitAuthorizedCommand).toHaveBeenCalledWith({ actorAuthUserId: actor, at, command, sessionId: session.sessionId,
      expectedAuthority: { scopeId: scope, grantId: id(7), grantRevision: 1 } });
  });
  it("refuses another AE's assignment before invoking the mutation port", async () => {
    const source = snapshot(); source.customers[0].assignment.assigneeAuthUserId = other;
    const { port, service } = ports(source);
    expect(await service.command(session, followup())).toEqual({ ok: false, code: "not_found" });
    expect(port.commitAuthorizedCommand).not.toHaveBeenCalled();
  });
  it("blocks missing capability, revoked grant and injected actor/scope claims", async () => {
    const source = snapshot(); source.authority.capabilities = ["workspace:read"];
    const { port, service } = ports(source);
    expect(await service.command(session, followup())).toEqual({ ok: false, code: "access_denied" });
    expect(await service.command(session, { ...followup(), actorAuthUserId: other })).toEqual({ ok: false, code: "invalid_input" });
    expect(await service.command(session, { ...followup(), scopeId: scope })).toEqual({ ok: false, code: "invalid_input" });
    expect(port.commitAuthorizedCommand).not.toHaveBeenCalled();
  });
  it("does not auto-retry an unknown outcome; an explicit retry preserves the same command and audit", async () => {
    const { port, service } = ports(), command = followup(), value = committed(command);
    vi.mocked(port.commitAuthorizedCommand).mockRejectedValueOnce(new Error("PRIVATE_UNCERTAIN_RESULT"))
      .mockResolvedValueOnce({ ok: true, value: { ...value, receipt: { ...value.receipt, replay: true } } });
    expect(await service.command(session, command)).toEqual({ ok: false, code: "unavailable" });
    expect(port.commitAuthorizedCommand).toHaveBeenCalledTimes(1);
    expect(await service.command(session, command)).toMatchObject({ ok: true, value: { commandId: command.commandId, replay: true, audit: value.receipt.audit } });
    expect(vi.mocked(port.commitAuthorizedCommand).mock.calls.map(([input]) => input.command)).toEqual([command, command]);
  });
  it.each(["revision_conflict", "idempotency_conflict", "access_denied"] as const)("preserves atomic %s refusal without an automatic second attempt", async code => {
    const { port, service } = ports(); vi.mocked(port.commitAuthorizedCommand).mockResolvedValue({ ok: false, code });
    expect(await service.command(session, followup())).toEqual({ ok: false, code });
    expect(port.commitAuthorizedCommand).toHaveBeenCalledTimes(1);
  });
  it("does not accept a replay after a fresh revocation denial", async () => {
    const { port, service } = ports(); vi.mocked(port.authorizeCustomerOperation).mockResolvedValue({ ok: false, code: "access_denied" });
    expect(await service.command(session, followup())).toEqual({ ok: false, code: "access_denied" });
    expect(port.commitAuthorizedCommand).not.toHaveBeenCalled();
  });
  it("reports a post-commit grant expiry as uncertain instead of asserting the mutation was denied", async () => {
    let now = Date.parse(at); const { port } = ports();
    vi.mocked(port.commitAuthorizedCommand).mockImplementation(async ({ command }) => {
      now = Date.parse(authority().validUntil); return { ok: true, value: committed(command) };
    });
    expect(await createAeWorkspaceService(port, () => now).command(session, followup())).toEqual({ ok: false, code: "unavailable" });
    expect(port.commitAuthorizedCommand).toHaveBeenCalledTimes(1);
  });
  it("does not recover a lost committed reassign through the former assignee's same or changed command", async () => {
    const source = snapshot(), originalReferral = clone(source.customers[0].referral);
    const { port, service } = ports(source);
    const command: AeWorkspaceCommand = { kind: "reassign", commandId: id(9), assignmentId,
      customerAuthUserId: customer, expectedRevision: 3, nextAssigneeAuthUserId: other };
    const recordedReceipts: AeCommandReceipt[] = [];
    vi.mocked(port.commitAuthorizedCommand).mockImplementationOnce(async input => {
      const result = committed(input.command);
      // Simulate the durable transaction committing before the reply is lost.
      recordedReceipts.push(clone(result.receipt));
      source.customers[0].assignment = clone(result.receipt.assignment);
      throw new Error("FICTIONAL_REPLY_LOST_AFTER_COMMIT");
    });
    expect(await service.command(session, command)).toEqual({ ok: false, code: "unavailable" });
    expect(source.authority.active).toBe(true);
    expect(source.customers[0].assignment.assigneeAuthUserId).toBe(other);
    expect(await service.command(session, command)).toEqual({ ok: false, code: "not_found" });
    // Neither an unchanged command nor an altered same-id payload restores
    // customer authority or reaches the atomic receipt/write port a second time.
    for (const changed of [{ ...command, nextAssigneeAuthUserId: id(99) }, { ...command, expectedRevision: 4 }]) {
      expect(await service.command(session, changed)).toEqual({ ok: false, code: "not_found" });
    }
    expect(port.authorizeCustomerOperation).toHaveBeenCalledTimes(4);
    expect(port.commitAuthorizedCommand).toHaveBeenCalledTimes(1);
    expect(recordedReceipts).toHaveLength(1);
    expect(recordedReceipts[0]).toMatchObject({ commandId: command.commandId,
      assignment: { revision: 4, assigneeAuthUserId: other }, audit: { kind: "assignment_reassigned" } });
    expect(source.customers[0].referral).toEqual(originalReferral);
  });
  it("requires a fresh active AE grant after a committed reassign loses its reply", async () => {
    const source = snapshot(), { port, service } = ports(source);
    const command: AeWorkspaceCommand = { kind: "reassign", commandId: id(9), assignmentId,
      customerAuthUserId: customer, expectedRevision: 3, nextAssigneeAuthUserId: other };
    let committedAudits = 0;
    vi.mocked(port.commitAuthorizedCommand).mockImplementationOnce(async input => {
      const result = committed(input.command); committedAudits += 1;
      source.customers[0].assignment = clone(result.receipt.assignment);
      throw new Error("FICTIONAL_REPLY_LOST_AFTER_COMMIT");
    });
    expect(await service.command(session, command)).toEqual({ ok: false, code: "unavailable" });
    source.authority.active = false;
    expect(await service.command(session, command)).toEqual({ ok: false, code: "access_denied" });
    expect(port.authorizeCustomerOperation).toHaveBeenCalledTimes(2);
    expect(port.commitAuthorizedCommand).toHaveBeenCalledTimes(1);
    expect(committedAudits).toBe(1);
  });
  it.each(["command", "actor", "audit", "revision", "scope", "grant"])("rejects a mismatched atomic %s receipt", async field => {
    const { port, service } = ports(), value = committed(followup());
    if (field === "command") value.receipt.commandId = id(99);
    if (field === "actor") value.receipt.audit.actorAuthUserId = other;
    if (field === "audit") value.receipt.audit.kind = "assignment_reassigned";
    if (field === "revision") value.receipt.assignment.revision = 3;
    if (field === "scope") value.receipt.assignment.scopeId = id(99);
    if (field === "grant") value.authority.grantRevision = 2;
    vi.mocked(port.commitAuthorizedCommand).mockResolvedValue({ ok: true, value });
    expect(await service.command(session, followup())).toEqual({ ok: false, code: "unavailable" });
  });
  it("reassigns only operational assignment, with an audit and no referral or commission payload", async () => {
    const { port, service } = ports(), command: AeWorkspaceCommand = { kind: "reassign", commandId: id(9),
      assignmentId, customerAuthUserId: customer, expectedRevision: 3, nextAssigneeAuthUserId: other };
    const result = await service.command(session, command);
    expect(result).toMatchObject({ ok: true, value: { assignment: { assigneeAuthUserId: other }, followup: null, audit: { kind: "assignment_reassigned" } } });
    expect(JSON.stringify(vi.mocked(port.commitAuthorizedCommand).mock.calls)).not.toMatch(/partnerId|commission|binding|clinical/);
    expect(snapshot().customers[0].referral).toMatchObject({ state: "recorded", binding: { partnerId: partner } });
    expect(await service.command(session, { ...command, nextAssigneeAuthUserId: actor })).toEqual({ ok: false, code: "invalid_input" });
  });
});

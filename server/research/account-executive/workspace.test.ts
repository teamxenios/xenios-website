import { describe, expect, it, vi } from "vitest";
import { REQUEST_INTENT_KIND } from "../../../shared/research/assisted-order/request-intent";
import {
  type AeWorkspaceCommand, type AeCommandReceipt,
} from "../../../shared/research/account-executive/workspace";
import {
  createAeWorkspaceService, type AeWorkspaceAuthorityPort, type AeOperationAuthority,
  type AeAuthorizedSnapshot, type AeAtomicCommandResult,
} from "./workspace";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1), other = id(2), customer = id(3), partner = id(4), scope = id(5), assignmentId = id(6);
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
    requests: [{ ownerAuthUserId: customer, receipt: { kind: REQUEST_INTENT_KIND, requestId: id(8),
      publicReference: ref(id(8)), status: "pending_review", createdAt: submittedAt }, workflow: null }], followups: [],
  }] };
}
function followup(): AeWorkspaceCommand {
  return { kind: "record_followup", commandId: id(9), assignmentId, customerAuthUserId: customer,
    expectedRevision: 3, purpose: "contact_customer", dueAt: "2026-11-19T14:00:00.000Z" };
}
function committed(command: AeWorkspaceCommand): AeAtomicCommandResult {
  const assignment = { ...snapshot().customers[0].assignment, revision: command.expectedRevision + 1,
    assigneeAuthUserId: command.kind === "reassign" ? command.nextAssigneeAuthUserId : actor };
  const receipt: AeCommandReceipt = { commandId: command.commandId, replay: false, assignment,
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
      value: { authority: clone(source.authority), assignment: clone(source.customers[0].assignment) } })),
    commitAuthorizedCommand: vi.fn(async ({ command }) => ({ ok: true as const, value: committed(command) })),
  };
  return { port, service: createAeWorkspaceService(port, () => Date.parse(at)) };
}

describe("explicit-scoped AE workspace source service", () => {
  it("keeps referral attribution distinct from assignment and never infers queued from a receipt", async () => {
    const { service } = ports();
    const result = await service.read(actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.value.customers[0];
    expect(row.assignment.assigneeAuthUserId).toBe(actor);
    expect(row.referral).toMatchObject({ state: "recorded", partnerId: partner });
    expect(row.requests[0]).toMatchObject({ receiptStatus: "pending_review", workflow: null });
    expect(row.contact).toMatchObject({ state: "available", email: "fictional@example.invalid" });
  });
  it("requires a real port and a canonical actor id, not editable role/domain claims", async () => {
    expect(await createAeWorkspaceService(null).read(actor)).toEqual({ ok: false, code: "unavailable" });
    const { port, service } = ports();
    expect(await service.read({ role: "research_rep", email: "rep@xeniostechnology.com" })).toEqual({ ok: false, code: "access_denied" });
    expect(port.readAssignedSnapshot).not.toHaveBeenCalled();
  });
  it("requires current explicit authority even when a source returned people", async () => {
    const source = snapshot(); source.authority.active = false;
    expect(await ports(source).service.read(actor)).toEqual({ ok: false, code: "access_denied" });
    source.authority.active = true; source.authority.capabilities = ["customer:contact"];
    expect(await ports(source).service.read(actor)).toEqual({ ok: false, code: "access_denied" });
  });
  it("resolves authority anew and blocks the operation after revocation", async () => {
    const { port, service } = ports();
    vi.mocked(port.readAssignedSnapshot).mockResolvedValueOnce({ ok: true, value: snapshot() })
      .mockResolvedValueOnce({ ok: false, code: "access_denied" });
    expect((await service.read(actor)).ok).toBe(true);
    expect(await service.read(actor)).toEqual({ ok: false, code: "access_denied" });
    expect(port.readAssignedSnapshot).toHaveBeenCalledTimes(2);
  });
  it("denies a grant that expires while the source is awaited", async () => {
    let now = Date.parse(at); const { port } = ports();
    vi.mocked(port.readAssignedSnapshot).mockImplementation(async () => { now = Date.parse(authority().validUntil); return { ok: true, value: snapshot() }; });
    expect(await createAeWorkspaceService(port, () => now).read(actor)).toEqual({ ok: false, code: "access_denied" });
  });
  it.each(["actor", "scope", "assignee", "contact", "referral", "request"])("refuses a mismatched %s binding without returning contact data", async field => {
    const source = snapshot(), row = source.customers[0];
    if (field === "actor") source.authority.actorAuthUserId = other;
    if (field === "scope") row.assignment.scopeId = id(99);
    if (field === "assignee") row.assignment.assigneeAuthUserId = other;
    if (field === "contact" && row.contact) row.contact.customerAuthUserId = other;
    if (field === "referral" && row.referral.state === "recorded") row.referral.binding.accountKey = `auth:${other}`;
    if (field === "request") row.requests = [{ ...row.requests[0], ownerAuthUserId: other }];
    const result = await ports(source).service.read(actor);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("fictional@example.invalid");
  });
  it("strips private source additions and suppresses contact without its explicit capability", async () => {
    const source = snapshot();
    Object.assign(source.customers[0].requests[0].receipt, { optionalIntake: "PRIVATE_INTAKE_SENTINEL", lines: ["PRIVATE_PRODUCT_SENTINEL"] });
    Object.assign(source.customers[0].contact!, { clinicalNotes: "PRIVATE_NOTES_SENTINEL", wholesaleCost: 123 });
    const result = await ports(source).service.read(actor);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|clinicalNotes|wholesaleCost|optionalIntake/);
    source.authority.capabilities = ["workspace:read"];
    expect((await ports(source).service.read(actor))).toMatchObject({ ok: true, value: { customers: [{ contact: { state: "not_permitted" } }] } });
  });
  it("treats partial, duplicate and failed sources as unavailable, never a genuine empty list", async () => {
    const source = snapshot(); source.customers.push(clone(source.customers[0]));
    expect(await ports(source).service.read(actor)).toEqual({ ok: false, code: "unavailable" });
    const partial = { ...snapshot(), completeness: "partial" } as unknown as AeAuthorizedSnapshot;
    expect(await ports(partial).service.read(actor)).toEqual({ ok: false, code: "unavailable" });
    const { port, service } = ports();
    vi.mocked(port.readAssignedSnapshot).mockRejectedValue(new Error("PRIVATE_SOURCE_ERROR"));
    expect(await service.read(actor)).toEqual({ ok: false, code: "unavailable" });
  });
  it("keeps canonical workflow history and refuses a workflow for another request", async () => {
    const source = snapshot(), request = source.customers[0].requests[0];
    request.workflow = { schemaVersion: 1, requestId: id(8), publicReference: ref(id(8)), state: "queued", revision: 1,
      changedAt: submittedAt, customerNotice: "unavailable", events: [
        { id: id(20), revision: 0, kind: "received", occurredAt: submittedAt },
        { id: id(21), revision: 1, kind: "queued", occurredAt: submittedAt },
      ] };
    expect((await ports(source).service.read(actor))).toMatchObject({ ok: true, value: { customers: [{ requests: [{ workflow: { state: "queued" } }] }] } });
    request.workflow.requestId = id(99); request.workflow.publicReference = ref(id(99));
    expect(await ports(source).service.read(actor)).toEqual({ ok: false, code: "unavailable" });
  });
});

describe("AE command boundary over a durable atomic authority port", () => {
  it("preflights an explicit customer scope and forwards immutable command identity to the atomic authority", async () => {
    const { port, service } = ports(), command = followup();
    const result = await service.command(actor, command);
    expect(result).toMatchObject({ ok: true, value: { commandId: command.commandId, assignment: { revision: 4 }, audit: { kind: "followup_recorded" } } });
    expect(port.authorizeCustomerOperation).toHaveBeenCalledWith({ actorAuthUserId: actor, customerAuthUserId: customer, capability: "followup:record", at });
    expect(port.commitAuthorizedCommand).toHaveBeenCalledWith({ actorAuthUserId: actor, at, command,
      expectedAuthority: { scopeId: scope, grantId: id(7), grantRevision: 1 } });
  });
  it("refuses another AE's assignment before invoking the mutation port", async () => {
    const source = snapshot(); source.customers[0].assignment.assigneeAuthUserId = other;
    const { port, service } = ports(source);
    expect(await service.command(actor, followup())).toEqual({ ok: false, code: "not_found" });
    expect(port.commitAuthorizedCommand).not.toHaveBeenCalled();
  });
  it("blocks missing capability, revoked grant and injected actor/scope claims", async () => {
    const source = snapshot(); source.authority.capabilities = ["workspace:read"];
    const { port, service } = ports(source);
    expect(await service.command(actor, followup())).toEqual({ ok: false, code: "access_denied" });
    expect(await service.command(actor, { ...followup(), actorAuthUserId: other })).toEqual({ ok: false, code: "invalid_input" });
    expect(await service.command(actor, { ...followup(), scopeId: scope })).toEqual({ ok: false, code: "invalid_input" });
    expect(port.commitAuthorizedCommand).not.toHaveBeenCalled();
  });
  it("does not auto-retry an unknown outcome; an explicit retry preserves the same command and audit", async () => {
    const { port, service } = ports(), command = followup(), value = committed(command);
    vi.mocked(port.commitAuthorizedCommand).mockRejectedValueOnce(new Error("PRIVATE_UNCERTAIN_RESULT"))
      .mockResolvedValueOnce({ ok: true, value: { ...value, receipt: { ...value.receipt, replay: true } } });
    expect(await service.command(actor, command)).toEqual({ ok: false, code: "unavailable" });
    expect(port.commitAuthorizedCommand).toHaveBeenCalledTimes(1);
    expect(await service.command(actor, command)).toMatchObject({ ok: true, value: { commandId: command.commandId, replay: true, audit: value.receipt.audit } });
    expect(vi.mocked(port.commitAuthorizedCommand).mock.calls.map(([input]) => input.command)).toEqual([command, command]);
  });
  it.each(["revision_conflict", "idempotency_conflict", "access_denied"] as const)("preserves atomic %s refusal without an automatic second attempt", async code => {
    const { port, service } = ports(); vi.mocked(port.commitAuthorizedCommand).mockResolvedValue({ ok: false, code });
    expect(await service.command(actor, followup())).toEqual({ ok: false, code });
    expect(port.commitAuthorizedCommand).toHaveBeenCalledTimes(1);
  });
  it("does not accept a replay after a fresh revocation denial", async () => {
    const { port, service } = ports(); vi.mocked(port.authorizeCustomerOperation).mockResolvedValue({ ok: false, code: "access_denied" });
    expect(await service.command(actor, followup())).toEqual({ ok: false, code: "access_denied" });
    expect(port.commitAuthorizedCommand).not.toHaveBeenCalled();
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
    expect(await service.command(actor, followup())).toEqual({ ok: false, code: "unavailable" });
  });
  it("reassigns only operational assignment, with an audit and no referral or commission payload", async () => {
    const { port, service } = ports(), command: AeWorkspaceCommand = { kind: "reassign", commandId: id(9),
      assignmentId, customerAuthUserId: customer, expectedRevision: 3, nextAssigneeAuthUserId: other };
    const result = await service.command(actor, command);
    expect(result).toMatchObject({ ok: true, value: { assignment: { assigneeAuthUserId: other }, followup: null, audit: { kind: "assignment_reassigned" } } });
    expect(JSON.stringify(vi.mocked(port.commitAuthorizedCommand).mock.calls)).not.toMatch(/partnerId|commission|binding|clinical/);
    expect(snapshot().customers[0].referral).toMatchObject({ state: "recorded", binding: { partnerId: partner } });
    expect(await service.command(actor, { ...command, nextAssigneeAuthUserId: actor })).toEqual({ ok: false, code: "invalid_input" });
  });
});

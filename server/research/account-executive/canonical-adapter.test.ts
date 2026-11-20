import { describe, expect, it, vi } from "vitest";
import { createAeCanonicalAdapter } from "./canonical-adapter";
import { createAeWorkspaceService, type AeAuthorizedSnapshot } from "./workspace";
import { memberOwnerHash, type AeCanonicalRpc } from "./identity-binding";
import { REQUEST_INTENT_KIND } from "../../../shared/research/assisted-order/request-intent";

const id = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-11-18T22:00:00.000Z", actor = id(1), customer = id(2), scope = id(3);
const session = { authUserId: actor, sessionId: id(4), purpose: "ordinary" as const };
function snapshot(): AeAuthorizedSnapshot {
  return { authority: { actorAuthUserId: actor, scopeId: scope, grantId: id(5), grantRevision: 1, active: true,
    validFrom: "2026-11-18T21:00:00.000Z", validUntil: "2026-11-18T23:00:00.000Z", capabilities: ["workspace:read"] },
  completeness: "complete", customers: [{ assignment: { id: id(6), scopeId: scope, customerAuthUserId: customer,
    assigneeAuthUserId: actor, revision: 1 }, contact: null, referral: { state: "unavailable" }, followups: [],
    requests: [{ ownerHash: memberOwnerHash(customer), receipt: { kind: REQUEST_INTENT_KIND, requestId: id(7),
      publicReference: "XRI-" + id(7).replaceAll("-", "").toUpperCase(), status: "pending_review", createdAt: now }, workflow: null }] }] };
}
describe("concrete canonical AE RPC adapter", () => {
  it("uses only the scoped AE reader with the exact verified actor/session and trusted scope", async () => {
    const rpc = vi.fn(async () => ({ data: snapshot(), error: null }));
    const service = createAeWorkspaceService(createAeCanonicalAdapter({ rpc }, scope), () => Date.parse(now));
    expect((await service.read(session)).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("ae_workspace_read", { p_actor_user_id: actor, p_session_id: session.sessionId, p_scope_id: scope });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not turn a transport failure into a successful empty list or reflect a diagnostic", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "08006", message: "PRIVATE_CONTACT_SENTINEL" } }));
    const result = await createAeWorkspaceService(createAeCanonicalAdapter({ rpc }, scope)).read(session);
    expect(result).toEqual({ ok: false, code: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_");
  });
  it("requires a fresh canonical guest-claim proof instead of changing a guest hash to a member hash", async () => {
    const source = snapshot(), request = source.customers[0].requests[0]; request.ownerHash = "f".repeat(64);
    const rpc = vi.fn(async (name: string): Promise<{ data: unknown; error: null }> => ({ data: name === "ae_workspace_read" ? structuredClone(source) : null, error: null }));
    const service = createAeWorkspaceService(createAeCanonicalAdapter({ rpc }, scope), () => Date.parse(now));
    expect(await service.read(session)).toEqual({ ok: false, code: "unavailable" });
    rpc.mockImplementation(async name => ({ data: name === "ae_workspace_read" ? structuredClone(source)
      : { claimId: id(8), requestId: request.receipt.requestId, customerAuthUserId: customer, ownerHash: request.ownerHash }, error: null }));
    const result = await service.read(session);
    expect(result).toMatchObject({ ok: true, value: { customers: [{ requests: [{ requestId: id(7) }] }] } });
    expect(JSON.stringify(result)).not.toMatch(/ownerHash|claimId|ownershipEvidence/);
  });
  it.each(["P0002", "42501", "23505", "40001"])("preserves a closed durable %s failure", async code => {
    const client: AeCanonicalRpc = { rpc: vi.fn(async () => ({ data: null, error: { code } })) };
    const port = createAeCanonicalAdapter(client, scope);
    const result = await port.authorizeCustomerOperation({ actorAuthUserId: actor, sessionId: session.sessionId,
      customerAuthUserId: customer, capability: "followup:record", at: now });
    expect(result).toEqual({ ok: false, code: code === "P0002" ? "not_found" : code === "42501" ? "access_denied" : code === "23505" ? "idempotency_conflict" : "revision_conflict" });
  });
  it.each(["complete_followup", "reschedule_followup"] as const)("keeps %s on the same canonical session/scope command RPC without a new task backend", async kind => {
    const rpc = vi.fn(async () => ({ data: {}, error: null })), port = createAeCanonicalAdapter({ rpc }, scope);
    const base = { commandId: id(20), assignmentId: id(6), customerAuthUserId: customer, expectedRevision: 3, followupId: id(21) };
    const command = kind === "complete_followup" ? { ...base, kind }
      : { ...base, kind, dueAt: "2026-11-20T12:00:00.000Z" };
    await port.commitAuthorizedCommand({ actorAuthUserId: actor, sessionId: session.sessionId, at: now, command,
      expectedAuthority: { scopeId: scope, grantId: id(5), grantRevision: 1 } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("ae_workspace_command", { p_actor_user_id: actor,
      p_session_id: session.sessionId, p_scope_id: scope, p_command: command, p_grant_id: id(5), p_grant_revision: 1 });
  });
});

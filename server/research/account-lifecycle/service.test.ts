import { describe, expect, it, vi } from "vitest";
import { unavailableLifecycle } from "@shared/research/account-lifecycle";
import { createAccountLifecycleService, executeReservedAuthDeletion, LifecycleUnavailable,
  type LifecycleActor, type LifecycleAttemptBinding, type LifecycleDependencies, type LifecycleExecutionBridge, type LifecycleProviderEvidence } from "./service";
const actorId = "10000000-0000-4000-8000-000000000001", targetId = "20000000-0000-4000-8000-000000000002";
const operationId = "30000000-0000-4000-8000-000000000003", executionId = "40000000-0000-4000-8000-000000000004", hash = "a".repeat(64);
const actor: LifecycleActor = { actorId, sessionBinding: hash, ordinary: true, emailConfirmed: true };
const http = { ip: "192.0.2.1", origin: "https://fixture.invalid", fetchSite: "same-origin", json: true };
const context = { policyRevision: hash, assuranceRef: hash, sessionBinding: hash, assuranceNotAfter: "2026-11-19T23:59:00.123456Z", prepareNotAfter: "2026-11-19T23:58:00.654321Z" };
const binding: LifecycleAttemptBinding = { actorId, targetId: actorId, mode: "self", reason: "self_requested", attemptId: executionId, context };
const known = () => ({ ...unavailableLifecycle("dependency_unknown"), operationId, version: 1, state: "blocked" as const });
function fixture() {
  const repository = { prepareSelf: vi.fn(async () => known()), prepareAdmin: vi.fn(async () => known()),
    confirmSelf: vi.fn(async () => known()), confirmAdmin: vi.fn(async () => known()), statusSelf: vi.fn(async () => known()), statusAdmin: vi.fn(async () => known()) };
  const deps = { origin: http.origin, repository, verifyOrdinary: vi.fn(async (_token: string): Promise<LifecycleActor | null> => actor), allow: vi.fn(async () => true),
    attempts: { issue: vi.fn(async (_input: unknown) => ({ carrier: "signed_" + "x".repeat(40), binding })), verify: vi.fn(async (_input: unknown): Promise<LifecycleAttemptBinding | null> => binding) },
    currentAuthority: { resolve: vi.fn(async (_input: unknown) => ({ assuranceRef: hash, sessionBinding: hash })) } } satisfies LifecycleDependencies;
  return { deps, repository, service: createAccountLifecycleService(deps) };
}
describe("canonical lifecycle coordinator has no body or inferred role authority", () => {
  it("issues only through trusted authority/issuer and reuses the bound carrier context on exact prepare replay", async () => {
    const f = fixture(); await f.service.issue("self", "A", { retryKey: "synthetic_retry_01" }, http);
    expect(f.deps.attempts.issue).toHaveBeenCalledWith({ actor, mode: "self", targetLocator: actorId, reason: "self_requested", retryKey: "synthetic_retry_01" });
    for (let i = 0; i < 2; i++) await f.service.prepare("self", "A", { attemptCarrier: "x".repeat(40) }, http);
    expect(f.repository.prepareSelf).toHaveBeenNthCalledWith(1, actorId, executionId, context);
    expect(f.repository.prepareSelf).toHaveBeenNthCalledWith(2, actorId, executionId, context);
    expect(f.deps.currentAuthority.resolve).not.toHaveBeenCalled(); // Native saved replay is first; no renewed TTL/preview.
  });
  it.each(["actorId", "targetId", "assuranceRef", "mode", "clear", "role"])("rejects customer body field %s before authority or persistence", async field => {
    const f = fixture(); await expect(f.service.issue("self", "A", { retryKey: "synthetic_retry_01", [field]: actorId }, http)).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.deps.attempts.issue).not.toHaveBeenCalled(); expect(f.repository.prepareSelf).not.toHaveBeenCalled();
  });
  it.each([null, "", "A\r\nB"])("refuses absent/header-unsafe bearer %j", async token => {
    const f = fixture(); await expect(f.service.status("self", token, operationId, http)).rejects.toMatchObject({ code: "authentication_required" });
    expect(f.deps.verifyOrdinary).not.toHaveBeenCalled(); expect(f.repository.statusSelf).not.toHaveBeenCalled();
  });
  it("refuses recovery/unconfirmed/foreign session bindings without deriving permissions from identity", async () => {
    const f = fixture(); f.deps.verifyOrdinary.mockResolvedValueOnce({ ...actor, ordinary: false } as never);
    await expect(f.service.prepare("self", "recovery", { attemptCarrier: "x".repeat(40) }, http)).rejects.toMatchObject({ code: "forbidden" });
    f.deps.attempts.verify.mockResolvedValueOnce({ ...binding, context: { ...context, sessionBinding: "b".repeat(64) } });
    await expect(f.service.prepare("self", "B", { attemptCarrier: "x".repeat(40) }, http)).rejects.toMatchObject({ code: "forbidden" });
    expect(f.repository.prepareSelf).not.toHaveBeenCalled();
  });
  it("never substitutes an admin target/carrier or falls through to self", async () => {
    const f = fixture(); await expect(f.service.prepare("admin", "A", { attemptCarrier: "x".repeat(40) }, http)).rejects.toMatchObject({ code: "forbidden" });
    const admin: LifecycleAttemptBinding = { ...binding, targetId, mode: "admin", reason: "privacy_request" };
    f.deps.attempts.verify.mockResolvedValueOnce(admin);
    await f.service.prepare("admin", "A", { attemptCarrier: "x".repeat(40) }, http);
    expect(f.repository.prepareAdmin).toHaveBeenCalledExactlyOnceWith(actorId, targetId, executionId, "privacy_request", context);
    expect(f.repository.prepareSelf).not.toHaveBeenCalled();
  });
  it("keeps missing issuance/current/admin authority unavailable, without manufacturing assurance or a blocked native write", async () => {
    const f = fixture(), service = createAccountLifecycleService({ ...f.deps, attempts: undefined, currentAuthority: undefined });
    await expect(service.issue("self", "A", { retryKey: "synthetic_retry_01" }, http)).rejects.toMatchObject({ blocker: "assurance_unavailable" });
    await expect(service.issue("admin", "A", { retryKey: "synthetic_retry_01" }, http, targetId, "privacy_request")).rejects.toMatchObject({ blocker: "admin_authority_unavailable" });
    await expect(service.confirm("self", "A", { operationId, previewDigest: hash, expectedVersion: 1, confirm: true }, http)).rejects.toBeInstanceOf(LifecycleUnavailable);
    expect(f.repository.confirmSelf).not.toHaveBeenCalled();
    await service.status("self", "A", operationId, http); expect(f.repository.statusSelf).toHaveBeenCalledWith(actorId, operationId);
  });
  it.each(["origin", "fetch-site", "content", "budget"])("closes %s without native mutation", async mode => {
    const f = fixture(); if (mode === "budget") f.deps.allow.mockResolvedValue(false);
    const request = { ...http, ...(mode === "origin" ? { origin: "https://other.invalid" } : {}),
      ...(mode === "fetch-site" ? { fetchSite: "cross-site" } : {}), ...(mode === "content" ? { json: false } : {}) };
    await expect(f.service.prepare("self", "A", { attemptCarrier: "x".repeat(40) }, request)).rejects.toThrow();
    expect(f.repository.prepareSelf).not.toHaveBeenCalled();
  });
});
describe("unmounted trusted provider coordinator no-repeat contract", () => {
  it("does nothing while real native execution/evidence bridge is absent", async () => {
    await expect(executeReservedAuthDeletion(operationId, 1)).rejects.toMatchObject({ blocker: "provider_unqualified" });
  });
  it("keeps a reserved uncertain provider operation consumed on retry and rejects forged evidence", async () => {
    let consumed = false; const reservation = { operationId, executionId, targetId, softDelete: false };
    const bridge: LifecycleExecutionBridge = { claim: vi.fn(async () => { if (consumed) return null; consumed = true; return reservation; }),
      finish: vi.fn(async () => ({ ...known(), state: "auth_outcome_unknown", progress: { ...known().progress, application: "verified", authIdentity: "unknown" }, blockers: ["provider_outcome_unknown"], nextAction: "authorized_review" })) };
    const evidence: LifecycleProviderEvidence = { protocol: "account-lifecycle/provider-evidence/v1", operationId, executionId, targetId, softDelete: false,
      projectBinding: hash, evidenceDigest: hash, outcome: "uncertain" };
    const provider = { deleteReserved: vi.fn(async () => evidence), verifyEvidence: vi.fn(() => true) };
    expect((await executeReservedAuthDeletion(operationId, 1, bridge, provider))?.state).toBe("auth_outcome_unknown");
    expect(await executeReservedAuthDeletion(operationId, 1, bridge, provider)).toBeNull(); expect(provider.deleteReserved).toHaveBeenCalledTimes(1);
    consumed = false; provider.verifyEvidence.mockReturnValue(false);
    await expect(executeReservedAuthDeletion(operationId, 1, bridge, provider)).rejects.toMatchObject({ code: "outcome_uncertain" });
    expect(bridge.finish).toHaveBeenCalledTimes(1);
  });
  it("never repeats the provider when final native evidence reply is lost", async () => {
    let consumed = false; const reservation = { operationId, executionId, targetId, softDelete: false };
    const bridge: LifecycleExecutionBridge = { claim: async () => { if (consumed) return null; consumed = true; return reservation; }, finish: async () => { throw Error("lost committed finish reply"); } };
    const provider = { deleteReserved: vi.fn(async () => ({ protocol: "account-lifecycle/provider-evidence/v1", ...reservation, projectBinding: hash, evidenceDigest: hash, outcome: "uncertain" } as LifecycleProviderEvidence)), verifyEvidence: () => true };
    await expect(executeReservedAuthDeletion(operationId, 1, bridge, provider)).rejects.toThrow();
    expect(await executeReservedAuthDeletion(operationId, 1, bridge, provider)).toBeNull(); expect(provider.deleteReserved).toHaveBeenCalledTimes(1);
  });
});

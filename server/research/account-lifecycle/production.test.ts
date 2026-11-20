import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ get: vi.fn(), identity: { adminUrl: "https://project.invalid" }, limit: vi.fn(async () => false) }));
vi.mock("../../supabase", () => ({ getSupabaseAdmin: f.get, getSupabaseConnectionIdentity: () => f.identity }));
vi.mock("../rate-limit", () => ({ rateLimitHit: f.limit }));
import { buildAccountLifecycleDependencies, canonicalLifecycleRepository, createSupportedLifecycleProvider } from "./production";
import { createAccountLifecycleService } from "./service";
const operationId = "10000000-0000-4000-8000-000000000001", executionId = "20000000-0000-4000-8000-000000000002", targetId = "30000000-0000-4000-8000-000000000003";
const qualification = { projectUrl: "https://project.invalid", revision: "a".repeat(64), softDelete: false };
const reservation = { operationId, executionId, targetId, softDelete: false };
beforeEach(() => { vi.clearAllMocks(); f.identity.adminUrl = qualification.projectUrl; });
describe("production lifecycle remains unavailable without actual canonical adapters", () => {
  it("constructs no SDK client/role/secret reader and publishes no issuer or dispatch bridge by default", async () => {
    const deps = buildAccountLifecycleDependencies(); expect(deps.origin).toBeNull(); expect(deps.attempts).toBeUndefined(); expect(deps.currentAuthority).toBeUndefined();
    expect(createSupportedLifecycleProvider()).toBeNull(); expect(f.get).not.toHaveBeenCalled();
    await expect(deps.verifyOrdinary("A")).rejects.toMatchObject({ blocker: "assurance_unavailable" });
    await expect(deps.repository.statusSelf(targetId, operationId)).rejects.toMatchObject({ blocker: "policy_unavailable" });
    expect(f.get).not.toHaveBeenCalled();
  });
  it("does not turn origin/config or plain ordinary identity into recent assurance or admin permission", async () => {
    const deps = buildAccountLifecycleDependencies({ origin: "https://site.invalid", verifyOrdinary: async () => ({ actorId: targetId,
      ordinary: true, emailConfirmed: true, sessionBinding: "a".repeat(64) }), allow: async () => true });
    await expect(createAccountLifecycleService(deps).issue("self", "A", { retryKey: "synthetic_retry_01" }, { ip: "192.0.2.1", origin: "https://site.invalid", json: true }))
      .rejects.toMatchObject({ blocker: "assurance_unavailable" }); expect(f.get).not.toHaveBeenCalled();
  });
  it("uses only canonical fixed-project RPC, rejects cached project drift before query and never falls back", async () => {
    const rpc = vi.fn(); f.get.mockReturnValue({ rpc }); f.identity.adminUrl = "https://other.invalid";
    const repo = canonicalLifecycleRepository(qualification.projectUrl);
    await expect(repo.statusSelf(targetId, operationId)).rejects.toMatchObject({ code: "outcome_uncertain" });
    expect(rpc).not.toHaveBeenCalled(); expect(() => canonicalLifecycleRepository("https://project.invalid/path")).toThrow();
  });
});
describe("unmounted supported Auth admin provider boundary", () => {
  function adapter() {
    const sdk = { deleteUser: vi.fn(async (_target: string, _soft: boolean) => ({ data: { user: { id: targetId } as { id: string } | null }, error: null as unknown })),
      getUserById: vi.fn(async (_target: string) => ({ data: { user: { id: targetId } as { id: string } | null }, error: null as unknown })) };
    return { sdk, provider: createSupportedLifecycleProvider(qualification, () => sdk)! };
  }
  it("calls deleteUser only with the reserved UUID/mode, never signOut(UUID), and does not claim all-session revocation", async () => {
    const { sdk, provider } = adapter(), receipt = await provider.deleteReserved(reservation);
    expect(sdk.deleteUser).toHaveBeenCalledExactlyOnceWith(targetId, false);
    expect(receipt.outcome).toBe("provider_confirmed"); expect(provider.verifyEvidence(reservation, receipt)).toBe(true);
    expect(provider.verifyEvidence(reservation, { ...receipt })).toBe(false);
    expect(provider.verifyEvidence({ ...reservation, executionId: operationId }, receipt)).toBe(false);
    expect(receipt).not.toHaveProperty("providerSessions"); expect(sdk.getUserById).not.toHaveBeenCalled();
  });
  it.each(["throw", "error", "wrong-target"])("keeps provider %s uncertain without automatic retry or soft-delete fallback", async mode => {
    const { sdk, provider } = adapter();
    if (mode === "throw") sdk.deleteUser.mockRejectedValueOnce(Error("private provider detail"));
    if (mode === "error") sdk.deleteUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 500 } });
    if (mode === "wrong-target") sdk.deleteUser.mockResolvedValueOnce({ data: { user: { id: executionId } }, error: null });
    const receipt = await provider.deleteReserved(reservation);
    expect(receipt.outcome).toBe("uncertain"); expect(sdk.deleteUser).toHaveBeenCalledTimes(1);
    expect(sdk.getUserById).not.toHaveBeenCalled(); expect(JSON.stringify(receipt)).not.toContain("private provider detail");
  });
  it("reconciles only actual target-specific provider absence, not any404, null/error or a ban", async () => {
    const { sdk, provider } = adapter();
    for (const error of [{ status: 404 }, { status: 500, code: "user_not_found" }, null]) {
      sdk.getUserById.mockResolvedValueOnce({ data: { user: null }, error });
      expect((await provider.reconcile(reservation)).outcome).toBe("uncertain");
    }
    sdk.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 404, code: "user_not_found" } });
    expect((await provider.reconcile(reservation)).outcome).toBe("auth_absent_verified");
    expect(sdk.deleteUser).not.toHaveBeenCalled();
  });
  it("refuses invalid qualification or reservation before supported provider calls", async () => {
    const { sdk, provider } = adapter();
    expect(createSupportedLifecycleProvider({ ...qualification, revision: "not-a-digest" }, () => sdk)).toBeNull();
    await expect(provider.deleteReserved({ ...reservation, softDelete: true })).rejects.toMatchObject({ blocker: "provider_unqualified" });
    expect(sdk.deleteUser).not.toHaveBeenCalled();
  });
});

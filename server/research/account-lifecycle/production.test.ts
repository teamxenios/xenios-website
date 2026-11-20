import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ get: vi.fn(), identity: { adminUrl: "https://project.invalid" }, limit: vi.fn(async () => false) }));
vi.mock("../../supabase", () => ({ getSupabaseAdmin: f.get, getSupabaseConnectionIdentity: () => f.identity }));
vi.mock("../rate-limit", () => ({ rateLimitHit: f.limit }));
import { buildAccountLifecycleDependencies, buildAccountLifecycleProduction, canonicalLifecycleRepository, createSupportedLifecycleProvider,
  type AccountLifecycleReadiness, type AccountLifecycleProductionBindings } from "./production";
import { createAccountLifecycleService, type LifecycleActor } from "./service";
import { unavailableLifecycle } from "@shared/research/account-lifecycle";
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

describe("trusted lifecycle production composition, never readiness from a flag", () => {
  const env = { SITE_URL: "https://site.invalid", SUPABASE_URL: "https://project.invalid", RESEARCH_ACCOUNT_LIFECYCLE_ENABLED: "true" };
  function inputs() {
    const readiness: AccountLifecycleReadiness = { protocol: "account-lifecycle/readiness/v1", sourceRevision: "b".repeat(40),
      projectUrl: env.SUPABASE_URL, siteOrigin: env.SITE_URL, notAfter: "2099-01-01T00:00:00.000001Z",
      nativeSourceDigest: "a".repeat(64), policyRevision: "c".repeat(64), assuranceRevision: "d".repeat(64),
      issuanceRevision: "e".repeat(64), domainCoverageRevision: "f".repeat(64), guardCoverageRevision: "1".repeat(64),
      providerEvidenceRevision: "2".repeat(64), finiteCleanupRevision: "3".repeat(64) };
    const actor: LifecycleActor = { actorId: targetId, ordinary: true, emailConfirmed: true, sessionBinding: "4".repeat(64) };
    const context = { policyRevision: readiness.policyRevision, assuranceRef: "5".repeat(64), sessionBinding: actor.sessionBinding,
      assuranceNotAfter: readiness.notAfter, prepareNotAfter: readiness.notAfter };
    const binding = { actorId: targetId, targetId, mode: "self" as const, attemptId: executionId, reason: "self_requested" as const, context };
    const bindings = { verifyOrdinary: vi.fn(async () => actor),
      attempts: { issue: vi.fn(async () => ({ carrier: "x".repeat(40), binding })), verify: vi.fn(async () => binding) },
      currentAuthority: { resolve: vi.fn(async () => ({ assuranceRef: context.assuranceRef, sessionBinding: actor.sessionBinding })) } } satisfies AccountLifecycleProductionBindings;
    return { readiness, actor, context, binding, bindings };
  }
  it.each([undefined, "false", "1", "TRUE"])("keeps flag %s unavailable even with complete synthetic supplied ports", async flag => {
    const i = inputs(), deps = buildAccountLifecycleProduction({ ...env, RESEARCH_ACCOUNT_LIFECYCLE_ENABLED: flag }, i.bindings, i.readiness);
    expect(deps.attempts).toBeUndefined(); await expect(deps.verifyOrdinary("A")).rejects.toMatchObject({ blocker: "assurance_unavailable" });
    expect(i.bindings.verifyOrdinary).not.toHaveBeenCalled(); expect(f.get).not.toHaveBeenCalled();
  });
  it.each(["omitted-readiness", "omitted-bindings", "wrong-origin", "wrong-project", "expired", "unknown-field", "bad-source", "missing-digest"])(
    "closes %s before touching SDK or issuer", async mode => {
      const i = inputs(); let readiness: AccountLifecycleReadiness | undefined = i.readiness;
      if (mode === "omitted-readiness") readiness = undefined;
      if (mode === "wrong-origin") readiness = { ...i.readiness, siteOrigin: "https://other.invalid" };
      if (mode === "wrong-project") readiness = { ...i.readiness, projectUrl: "https://other.invalid" };
      if (mode === "expired") readiness = { ...i.readiness, notAfter: "2000-01-01T00:00:00.000001Z" };
      if (mode === "unknown-field") readiness = { ...i.readiness, approved: true } as AccountLifecycleReadiness;
      if (mode === "bad-source") readiness = { ...i.readiness, sourceRevision: "not-an-exact-source" };
      if (mode === "missing-digest") readiness = { ...i.readiness, domainCoverageRevision: "" };
      const deps = buildAccountLifecycleProduction(env, mode === "omitted-bindings" ? undefined : i.bindings, readiness);
      await expect(deps.verifyOrdinary("A")).rejects.toBeDefined(); expect(i.bindings.verifyOrdinary).not.toHaveBeenCalled();
      expect(i.bindings.attempts.issue).not.toHaveBeenCalled(); expect(f.get).not.toHaveBeenCalled();
    });
  it("requires every actual port and a canonical HTTPS project/origin rather than digest-shaped placeholders", async () => {
    const i = inputs();
    for (const candidate of [{ ...env, SITE_URL: "http://site.invalid" }, { ...env, SUPABASE_URL: env.SUPABASE_URL + "/auth/v1" }]) {
      const deps = buildAccountLifecycleProduction(candidate, i.bindings, i.readiness);
      expect(deps.attempts).toBeUndefined();
    }
    const incomplete = { verifyOrdinary: i.bindings.verifyOrdinary, attempts: {}, currentAuthority: {} };
    // Exercise the runtime boundary without weakening its public static type.
    const deps = Reflect.apply(buildAccountLifecycleProduction, undefined, [env, incomplete, i.readiness]);
    expect(deps.attempts).toBeUndefined(); expect(f.get).not.toHaveBeenCalled();
  });
  it("captures approved input/function references, verifies exact bearer and reaches only the pinned canonical project on explicit read", async () => {
    const i = inputs(), rpc = vi.fn(async () => ({ data: { ...unavailableLifecycle("policy_unavailable"), state: "blocked", operationId, version: 0 }, error: null }));
    f.get.mockReturnValue({ rpc }); const deps = buildAccountLifecycleProduction(env, i.bindings, i.readiness);
    expect(f.get).not.toHaveBeenCalled(); const original = i.bindings.verifyOrdinary;
    i.bindings.verifyOrdinary = vi.fn(async () => { throw Error("replaced"); }); i.readiness.projectUrl = "https://other.invalid";
    expect(await deps.verifyOrdinary("captured-A")).toEqual(i.actor); expect(original).toHaveBeenCalledExactlyOnceWith("captured-A");
    await deps.repository.statusSelf(targetId, operationId);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("account_lifecycle_status_self", { p_actor: targetId, p_operation: operationId });
    expect(deps).not.toHaveProperty("provider"); expect(deps).not.toHaveProperty("execution");
    f.identity.adminUrl = "https://wrong-project.invalid";
    await expect(deps.repository.statusSelf(targetId, operationId)).rejects.toMatchObject({ code: "outcome_uncertain" }); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["policy", "prepare-bound", "assurance-bound"])("refuses returned issuer %s drift before any native write", async mode => {
    const i = inputs(), deps = buildAccountLifecycleProduction(env, i.bindings, i.readiness);
    if (mode === "policy") i.binding.context.policyRevision = "9".repeat(64);
    if (mode === "prepare-bound") i.binding.context.prepareNotAfter = "2099-01-01T00:00:00.000002Z";
    if (mode === "assurance-bound") i.binding.context.assuranceNotAfter = "2099-01-01T00:00:00.000002Z";
    await expect(deps.attempts!.issue({ actor: i.actor, mode: "self", targetLocator: targetId, reason: "self_requested", retryKey: "same_retry_001" }))
      .rejects.toMatchObject({ blocker: "policy_unavailable" });
    await expect(deps.attempts!.verify({ actor: i.actor, mode: "self", carrier: "x".repeat(40) }))
      .rejects.toMatchObject({ blocker: "policy_unavailable" });
    expect(f.get).not.toHaveBeenCalled();
  });
  it("preserves actual issued attempt and database microseconds rather than renewing TTL or minting a second attempt", async () => {
    const i = inputs(), deps = buildAccountLifecycleProduction(env, i.bindings, i.readiness);
    const first = await deps.attempts!.issue({ actor: i.actor, mode: "self", targetLocator: targetId, reason: "self_requested", retryKey: "same_retry_001" });
    const replay = await deps.attempts!.verify({ actor: i.actor, mode: "self", carrier: first.carrier });
    expect(first.binding.attemptId).toBe(executionId); expect(replay).toBe(first.binding);
    expect(replay?.context.prepareNotAfter).toBe("2099-01-01T00:00:00.000001Z"); expect(f.get).not.toHaveBeenCalled();
    expect(i.bindings.attempts.issue).toHaveBeenCalledTimes(1);
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

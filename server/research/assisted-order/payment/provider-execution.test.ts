import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistedProviderExecutionService, buildAssistedProviderExecution, type AssistedProviderExecutionSource } from "./provider-execution";
import type { AssistedOrderViewer } from "../ports";
import type { SupabaseRpcClient } from "../supabase-repository";

const id = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const REQUEST = id(1), ATTEMPT = id(2), QUOTE = id(3), ACCEPTANCE = id(4), ACTOR = id(5), CLAIM = id(6);
const WHEN = "2026-10-01T10:30:00.000Z", UNTIL = "2026-10-01T10:31:00.000Z", LEASE = "2026-10-01T10:30:10.000Z";
const scope = { provider: "synthetic", accountId: "synthetic-account", mode: "test" as const };
const policy = { revision: "synthetic-policy-v1", replayGuarantee: "same_key_same_body" as const, createReplaySeconds: 60 };
const viewer: AssistedOrderViewer = { actorType: "admin", authUserId: ACTOR, memberId: null, earlyAccessSessionHash: null,
  normalizedEmail: null, capabilities: new Set(["assisted_orders:manage"]) };
const authority = { schemaVersion: "assisted_order_provider_execution_v1", transactionIsolation: "read_committed_only",
  dispatchTiming: "database_budget_monotonic_v1",
  durableCreateOwnership: true, providerIdentityBinding: "write_once", settlementEnabled: false, refundEnabled: false, liveExecutionEnabled: false };
const evidenceAuthority = { schemaVersion: "assisted_order_provider_execution_v2", transactionIsolation: "read_committed_only",
  dispatchTiming: "database_budget_monotonic_v1", durableCreateOwnership: true, providerIdentityBinding: "write_once",
  settlementPolicy: "separate_scoped_admin_capture_v1", refundPolicy: "record_and_hold_only_v1",
  dispatchPolicy: "explicit_source_create_policy_and_grant_v1" };
const context = { schemaVersion: "assisted_order_provider_execution_context_v1", requestId: REQUEST, attemptId: ATTEMPT,
  sourceId: "synthetic-source", adapterRevision: "synthetic-v1", scope, policyRevision: policy.revision,
  replayGuarantee: policy.replayGuarantee, createReplaySeconds: policy.createReplaySeconds,
  quoteId: QUOTE, quoteVersion: 1, acceptanceId: ACCEPTANCE, expectedAmountCents: 16927, currency: "USD",
  creationKey: "c".repeat(64), creationStartedAt: null, creationReplayUntil: null, providerPaymentId: null,
  providerSessionId: null, state: "held", nextAction: "create", claimId: null, leaseExpiresAt: null };
const claim = { ...context, creationStartedAt: WHEN, creationReplayUntil: UNTIL, claimId: CLAIM,
  leaseExpiresAt: LEASE, claimIssuedAt: WHEN, dispatchBudgetMs: 10_000, authorized: true, replayed: false };
const object = { ...scope, requestId: REQUEST, attemptId: ATTEMPT, quoteId: QUOTE, quoteVersion: 1, acceptanceId: ACCEPTANCE,
  canonicalOrderId: null, observedAmountCents: 16927, currency: "USD", providerPaymentId: "synthetic-payment",
  providerSessionId: "synthetic-session", state: "pending" };
const receipt = { schemaVersion: "assisted_order_provider_create_result_receipt_v1", resultId: id(7), claimId: CLAIM,
  requestId: REQUEST, attemptId: ATTEMPT, state: "held", classification: "bound", reason: "exact_binding",
  providerPaymentId: object.providerPaymentId, providerSessionId: object.providerSessionId, recordedAt: WHEN, replayed: false };
const PREFIX = "research_assisted_order_provider_";

function setup(options: { authority?: unknown; context?: unknown; claim?: unknown; object?: unknown; receipt?: unknown;
  noSource?: boolean; now?: number; failAt?: string; errorDetail?: string } = {}) {
  const calls: string[] = [];
  const rpc = vi.fn<SupabaseRpcClient["rpc"]>(async (name, args) => {
    calls.push(name.replace(PREFIX, ""));
    if (name === PREFIX + options.failAt) return { data: null, error: { code: "P0001", details: options.errorDetail,
      message: "synthetic private database information" } };
    let data: unknown;
    if (name.endsWith("execution_authority")) data = options.authority ?? authority;
    else if (name.endsWith("create_context")) data = options.context ?? context;
    else if (name.endsWith("create_claim")) data = options.claim ?? claim;
    else {
      const result = args!.p_result as Record<string, unknown>;
      data = options.receipt ?? (result.outcome === "unknown" ? { ...receipt, classification: "unknown", reason: result.reason,
        providerPaymentId: null, providerSessionId: null } : receipt);
    }
    return { data, error: null };
  });
  const create = vi.fn<AssistedProviderExecutionSource["create"]>(async () => {
    calls.push("create"); return { ok: true, value: options.object ?? object };
  });
  const retrieve = vi.fn<AssistedProviderExecutionSource["retrieve"]>(async () => {
    calls.push("retrieve"); return { ok: true, value: options.object ?? object };
  });
  const source: AssistedProviderExecutionSource = { sourceId: "synthetic-source", adapterRevision: "synthetic-v1",
    scope: { ...scope }, policy: { ...policy }, create, retrieve };
  const service = new AssistedProviderExecutionService({ rpc }, options.noSource ? null : source,
    { now: () => options.now ?? Date.parse(WHEN), timeoutMs: 20 });
  return { service, rpc, source, create, retrieve, calls };
}
const prepare = (h: ReturnType<typeof setup>, body: unknown = {}) => h.service.prepare(viewer, REQUEST, ATTEMPT, body);
const results = (h: ReturnType<typeof setup>) => h.rpc.mock.calls.filter(([name]) => name.endsWith("create_result_append"));
afterEach(() => vi.useRealTimers());

describe("durable provider execution coordinator, synthetic transport only", () => {
  it.each([authority, evidenceAuthority])("supports each complete reviewed authority without marking paid %#", async (capability) => {
    const h = setup({ authority: capability });
    expect(await prepare(h)).toMatchObject({ state: "held", outcome: "recorded" });
    expect(h.calls).toEqual(["execution_authority", "create_context", "create_claim", "create", "create_result_append"]);
  });
  it.each([
    { ...evidenceAuthority, transactionIsolation: undefined }, { ...evidenceAuthority, dispatchTiming: undefined },
    { ...evidenceAuthority, dispatchTiming: "application_wall_clock" }, { ...evidenceAuthority, durableCreateOwnership: false },
    { ...evidenceAuthority, providerIdentityBinding: "replaceable" }, { ...evidenceAuthority, settlementPolicy: undefined },
    { ...evidenceAuthority, settlementPolicy: "automatic" }, { ...evidenceAuthority, refundPolicy: "execute" },
    { ...evidenceAuthority, dispatchPolicy: undefined }, { ...evidenceAuthority, dispatchPolicy: "reservation_grant" },
    { ...evidenceAuthority, settlementEnabled: false }, { ...evidenceAuthority, schemaVersion: "assisted_order_provider_execution_v1" },
    { ...authority, schemaVersion: "assisted_order_provider_execution_v2" },
    { ...evidenceAuthority, schemaVersion: "assisted_order_provider_execution_v3" },
  ])("refuses incomplete or mixed evidence-scoped execution capability %#", async (capability) => {
    const h = setup({ authority: capability });
    await expect(prepare(h)).rejects.toMatchObject({ code: "provider_execution_unavailable" });
    expect(h.calls).toEqual(["execution_authority"]);
    expect(h.create).not.toHaveBeenCalled(); expect(h.retrieve).not.toHaveBeenCalled();
  });

  it("requires explicit source composition and does not configure a provider", async () => {
    const h = setup();
    expect(buildAssistedProviderExecution({ enabled: false, rpc: { rpc: h.rpc }, source: h.source })).toBeNull();
    expect(buildAssistedProviderExecution({ enabled: true, rpc: null, source: h.source })).toBeNull();
    expect(buildAssistedProviderExecution({ enabled: true, rpc: { rpc: h.rpc }, source: null })).toBeNull();
    expect(buildAssistedProviderExecution({ enabled: true, rpc: { rpc: h.rpc }, source: h.source })).toBeInstanceOf(AssistedProviderExecutionService);
    const off = setup({ noSource: true });
    await expect(prepare(off)).rejects.toMatchObject({ code: "provider_execution_unavailable" });
    expect(off.rpc).not.toHaveBeenCalled(); expect(off.create).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...policy, replayGuarantee: "probably" }, { ...policy, createReplaySeconds: 0 },
    { ...policy, createReplaySeconds: 86401 }, { ...policy, createReplaySeconds: 1.5 }])("refuses absent or invented replay policy %#", (badPolicy) => {
    const h = setup();
    expect(buildAssistedProviderExecution({ enabled: true, rpc: { rpc: h.rpc }, source: { ...h.source, policy: badPolicy } as never })).toBeNull();
  });
  it.each([{ actorType: "member" }, { capabilities: new Set() }, { authUserId: null }, { authUserId: "typed-admin" }])(
    "refuses an unverified actor before SQL %#", async (patch) => {
      const h = setup();
      await expect(h.service.prepare({ ...viewer, ...patch } as AssistedOrderViewer, REQUEST, ATTEMPT, {})).rejects.toMatchObject({ name: "AssistedOrderAuthorizationError" });
      expect(h.rpc).not.toHaveBeenCalled();
    });
  it.each([null, [], { amount: 1 }, { currency: "USD" }, { actorAuthUserId: ACTOR }, { providerPaymentId: "invented" },
    { sourceId: "synthetic-source" }, { claimId: CLAIM }, { creationKey: "key" }, { policyRevision: policy.revision }, { verified: true }])(
    "refuses browser authority %#", async (body) => {
      const h = setup(); await expect(prepare(h, body)).rejects.toMatchObject({ name: "AssistedOrderValidationError" });
      expect(h.rpc).not.toHaveBeenCalled();
    });
  it.each([{ ...authority, schemaVersion: "assisted_order_provider_journal_v2" }, { ...authority, transactionIsolation: "repeatable_read" },
    { ...authority, dispatchTiming: undefined }, { ...authority, dispatchTiming: "application_wall_clock" },
    { ...authority, durableCreateOwnership: false }, { ...authority, settlementEnabled: true }, { ...authority, extra: true }])(
    "requires the exact new authority before context or network %#", async (badAuthority) => {
      const h = setup({ authority: badAuthority }); await expect(prepare(h)).rejects.toThrow();
      expect(h.calls).toEqual(["execution_authority"]);
    });
  it.each(["execution_authority", "create_context", "create_claim"])("does not dispatch after %s fails", async (failAt) => {
    const h = setup({ failAt }); await expect(prepare(h)).rejects.toMatchObject({ code: "provider_execution_unavailable" });
    expect(h.create).not.toHaveBeenCalled(); expect(results(h)).toHaveLength(0);
  });
  it.each(["execution_authority", "create_context", "create_claim"])("sanitizes a rejected %s RPC promise", async (failAt) => {
    const h = setup(), original = h.rpc.getMockImplementation()!;
    h.rpc.mockImplementation(async (name, args) => {
      if (name === PREFIX + failAt) throw new Error("private database URL and token");
      return original(name, args);
    });
    const error = await prepare(h).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "provider_execution_unavailable", message: "Provider payment processing remains on hold." });
    expect(String(error)).not.toContain("private"); expect(h.create).not.toHaveBeenCalled();
  });
  it("maps only the exact independent create-grant denial", async () => {
    const h = setup({ failAt: "create_claim", errorDetail: "ASSISTED_ORDER_PROVIDER_EXECUTION_GRANT_REQUIRED" });
    await expect(prepare(h)).rejects.toMatchObject({ name: "AssistedOrderAuthorizationError" });
    expect(h.create).not.toHaveBeenCalled();
  });
  it("commits the claim before calling transport and durably binds before the redacted response", async () => {
    const h = setup(); const response = await prepare(h);
    expect(h.calls).toEqual(["execution_authority", "create_context", "create_claim", "create", "create_result_append"]);
    expect(h.rpc.mock.calls[2][1]).toEqual({ p_request_id: REQUEST, p_attempt_id: ATTEMPT, p_source_id: h.source.sourceId,
      p_adapter_revision: h.source.adapterRevision, p_expected_scope: scope, p_policy_revision: policy.revision,
      p_actor_auth_user_id: ACTOR, p_claim_key: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(h.create.mock.calls[0][0]).toEqual({ body: { requestId: REQUEST, attemptId: ATTEMPT, quoteId: QUOTE,
      quoteVersion: 1, acceptanceId: ACCEPTANCE, canonicalOrderId: null, amountCents: 16927, currency: "USD" },
      idempotencyKey: context.creationKey, signal: expect.any(AbortSignal) });
    expect(response).toEqual({ schemaVersion: "assisted_order_provider_execution_receipt_v1", requestId: REQUEST,
      attemptId: ATTEMPT, state: "held", outcome: "recorded", replayed: false });
    expect(JSON.stringify(response)).not.toMatch(/synthetic-payment|synthetic-session|claimId|sourceId|creationKey|clientSecret|paid/);
    expect(h.retrieve).not.toHaveBeenCalled();
  });
  it.each([{ requestId: id(99) }, { attemptId: id(99) }, { sourceId: "other" }, { adapterRevision: "other" },
    { scope: { ...scope, mode: "live" } }, { policyRevision: "other" }, { createReplaySeconds: 2 },
    { expectedAmountCents: 0 }, { creationKey: "browser" }, { providerSessionId: "unbound" },
    { nextAction: "retrieve" }, { secret: "untrusted" }])("refuses malformed/misbound context before claim %#", async (patch) => {
    const h = setup({ context: { ...context, ...patch } }); await expect(prepare(h)).rejects.toThrow();
    expect(h.calls).toEqual(["execution_authority", "create_context"]);
  });
  it.each([{ quoteId: id(99) }, { quoteVersion: 2 }, { acceptanceId: id(99) }, { expectedAmountCents: 1 },
    { currency: "EUR" }, { creationKey: "d".repeat(64) }, { creationReplayUntil: "2026-10-01T10:32:00.000Z" },
    { claimId: null }, { leaseExpiresAt: null }])("refuses changed or incomplete durable claim %#", async (patch) => {
    const h = setup({ claim: { ...claim, ...patch } }); await expect(prepare(h)).rejects.toThrow();
    expect(h.create).not.toHaveBeenCalled();
  });
  it.each([{ claimIssuedAt: null }, { dispatchBudgetMs: 0 }, { dispatchBudgetMs: -1 }, { dispatchBudgetMs: 300001 },
    { dispatchBudgetMs: 1.5 }, { dispatchBudgetMs: 10001 }, { dispatchBudgetMs: 9999 },
    { claimIssuedAt: "2026-10-01T10:30:01.000Z" }, { claimIssuedAt: "2026-10-01T10:29:59.000Z", dispatchBudgetMs: 11000 },
    { claimIssuedAt: "2026-10-01T10:30:00Z" }])("refuses absent, malformed or inconsistent database timing %#", async (patch) => {
    const h = setup({ claim: { ...claim, ...patch } });
    await expect(prepare(h)).rejects.toMatchObject({ code: "provider_execution_unavailable" });
    expect(h.create).not.toHaveBeenCalled(); expect(h.retrieve).not.toHaveBeenCalled();
  });
  it.each([{ claimIssuedAt: WHEN, dispatchBudgetMs: 0 }, { claimIssuedAt: null, dispatchBudgetMs: 10_000 }])(
    "a refused or replayed claim cannot retain dispatch timing %#", async (timing) => {
      const h = setup({ claim: { ...claim, authorized: false, replayed: true, ...timing } });
      await expect(prepare(h)).rejects.toMatchObject({ code: "provider_execution_unavailable" });
      expect(h.create).not.toHaveBeenCalled();
    });
  it.each(["wait", "reconciliation_required"])("does not claim or dispatch when context is %s", async (nextAction) => {
    const h = setup({ context: { ...context, nextAction } });
    expect((await prepare(h)).outcome).toBe(nextAction === "wait" ? "waiting" : "reconciliation_required");
    expect(h.calls).toEqual(["execution_authority", "create_context"]);
  });
  it("a durable claim replay never dispatches twice", async () => {
    const h = setup({ claim: { ...claim, authorized: false, replayed: true, claimIssuedAt: null, dispatchBudgetMs: 0 } });
    expect(await prepare(h)).toMatchObject({ outcome: "waiting", replayed: true }); expect(h.create).not.toHaveBeenCalled();
  });
  it("retrieves an established binding even after the creation window, never creates another object", async () => {
    const binding = { providerPaymentId: object.providerPaymentId, providerSessionId: object.providerSessionId, nextAction: "retrieve" };
    const h = setup({ context: { ...context, ...binding, creationStartedAt: WHEN, creationReplayUntil: UNTIL },
      claim: { ...claim, ...binding, claimIssuedAt: "2026-10-01T10:35:00.000Z", leaseExpiresAt: "2026-10-01T10:35:10.000Z" }, now: Date.parse("2026-10-01T10:35:00.000Z") });
    expect((await prepare(h)).outcome).toBe("recorded"); expect(h.create).not.toHaveBeenCalled();
    expect(h.retrieve).toHaveBeenCalledWith(expect.objectContaining(bindingFields()));
  });
  it.each([Date.parse(WHEN) - 1, Date.parse(LEASE), Date.parse(UNTIL), Number.NaN])(
    "records uncertainty without dispatch for unusable local time %s", async (now) => {
      const h = setup({ now }); expect((await prepare(h)).outcome).toBe("reconciliation_required");
      expect(h.create).not.toHaveBeenCalled(); expect(results(h)[0][1]?.p_result).toMatchObject({ outcome: "unknown", reason: "transport_uncertain" });
    });
  it.each([Date.parse(WHEN) - 1, Date.parse(LEASE), Number.NaN])("rechecks time immediately before dispatch %s", async (lateNow) => {
    const h = setup();
    const now = vi.fn().mockReturnValueOnce(Date.parse(WHEN)).mockReturnValue(lateNow);
    const service = new AssistedProviderExecutionService({ rpc: h.rpc }, h.source, { now, timeoutMs: 20 });
    expect((await service.prepare(viewer, REQUEST, ATTEMPT, {})).outcome).toBe("reconciliation_required");
    expect(h.create).not.toHaveBeenCalled(); expect(h.retrieve).not.toHaveBeenCalled();
    expect(results(h)[0][1]?.p_result).toMatchObject({ outcome: "unknown", reason: "transport_uncertain" });
  });
  it.each(["behind", "backward jump"])("clock-skew regression: %s wall clock cannot outlive the database replay deadline", async (clockMode) => {
    vi.useFakeTimers();
    const databaseClaimTime = Date.parse(UNTIL) - 10;
    let databaseNow = databaseClaimTime, elapsed = 0;
    let applicationNow = clockMode === "behind" ? Date.parse(WHEN) + 30_000 : databaseClaimTime;
    const monotonic = vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const h = setup({ context: { ...context, creationStartedAt: WHEN, creationReplayUntil: UNTIL },
      claim: { ...claim, claimIssuedAt: new Date(databaseClaimTime).toISOString(), dispatchBudgetMs: 10, leaseExpiresAt: UNTIL } });
    const original = h.rpc.getMockImplementation()!;
    h.rpc.mockImplementation(async (name, args) => {
      if (name.endsWith("create_claim")) {
        // The database issues the claim with only 10ms left. Its response is
        // delayed 20ms; local wall time is not evidence of the remaining budget.
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
        elapsed += 20; databaseNow += 20;
        applicationNow = Date.parse(WHEN) + 30_000;
      }
      return original(name, args);
    });
    const service = new AssistedProviderExecutionService({ rpc: h.rpc }, h.source, { now: () => applicationNow, timeoutMs: 20 });
    try {
      const pending = service.prepare(viewer, REQUEST, ATTEMPT, {});
      await vi.advanceTimersByTimeAsync(21); await pending;
      expect(databaseNow).toBeGreaterThanOrEqual(Date.parse(UNTIL));
      expect(h.create).not.toHaveBeenCalled(); expect(h.retrieve).not.toHaveBeenCalled();
      expect(results(h)[0][1]?.p_result).toMatchObject({ outcome: "unknown", reason: "transport_uncertain" });
    } finally { monotonic.mockRestore(); }
  });
  it.each([[100, 99], [100, Number.NaN], [100, 120, 115], [100, 120, Number.POSITIVE_INFINITY],
    [100, 10100], [100, 101, 10100]].map((readings) => ({ readings })))("invalid or elapsed monotonic budget cannot dispatch %#", async ({ readings }) => {
    const h = setup(); let index = 0;
    const monotonic = vi.spyOn(performance, "now").mockImplementation(() => readings[Math.min(index++, readings.length - 1)]);
    try {
      expect((await prepare(h)).outcome).toBe("reconciliation_required");
      expect(h.create).not.toHaveBeenCalled(); expect(results(h)[0][1]?.p_result).toMatchObject({ outcome: "unknown" });
    } finally { monotonic.mockRestore(); }
  });
  it("subtracts the entire claim roundtrip from the transport timeout budget", async () => {
    vi.useFakeTimers(); let elapsed = 0;
    const monotonic = vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const h = setup({ claim: { ...claim, claimIssuedAt: "2026-10-01T10:30:59.990Z", dispatchBudgetMs: 10, leaseExpiresAt: UNTIL } });
    const original = h.rpc.getMockImplementation()!;
    h.rpc.mockImplementation(async (name, args) => {
      if (name.endsWith("create_claim")) { await new Promise<void>((resolve) => setTimeout(resolve, 6)); elapsed = 6; }
      return original(name, args);
    });
    h.create.mockImplementation(() => new Promise(() => undefined));
    try {
      let acknowledged = false;
      const pending = prepare(h).then((response) => { acknowledged = true; return response; });
      await vi.advanceTimersByTimeAsync(9); expect(h.create).toHaveBeenCalledOnce(); expect(acknowledged).toBe(false);
      await vi.advanceTimersByTimeAsync(1); expect((await pending).outcome).toBe("reconciliation_required");
      expect(h.create.mock.calls[0][0].signal.aborted).toBe(true);
    } finally { monotonic.mockRestore(); }
  });
  it.each([{ provider: "other" }, { accountId: "other" }, { mode: "live" }, { requestId: id(90) }, { attemptId: id(90) },
    { quoteId: id(90) }, { quoteVersion: 2 }, { acceptanceId: id(90) }, { observedAmountCents: 10 }, { currency: "EUR" }])(
    "persists actual well-formed mismatches as conflicts, never repairs from input %#", async (patch) => {
      const h = setup({ object: { ...object, ...patch }, receipt: { ...receipt, classification: "conflict", reason: "binding_mismatch",
        providerPaymentId: null, providerSessionId: null } });
      expect((await prepare(h)).outcome).toBe("reconciliation_required"); expect(results(h)[0][1]?.p_result).toMatchObject(patch);
    });
  it.each([{ state: "captured" }, { providerPaymentId: "\nsecret" }, { observedAmountCents: "16927" },
    { providerSessionId: undefined }, { canonicalOrderId: id(90) }, { acceptanceId: null }, { currency: "usd" }])(
    "stores malformed/unsupported provider output only as uncertainty %#", async (patch) => {
      const h = setup({ object: { ...object, ...patch } }); expect((await prepare(h)).outcome).toBe("reconciliation_required");
      const stored = results(h)[0][1]?.p_result as Record<string, unknown>;
      expect(stored).toMatchObject({ outcome: "unknown", reason: "invalid_response" });
      expect(Object.entries(stored).filter(([key]) => !["schemaVersion", "outcome", "reason"].includes(key)).every(([, value]) => value === null)).toBe(true);
    });
  it("stores only allowlisted provider facts", async () => {
    const h = setup({ object: { ...object, clientSecret: "private", rawBody: "private", signatures: "private", payerEmail: "private" } });
    await prepare(h); expect(JSON.stringify(results(h))).not.toContain("private");
    expect(Object.keys((results(h)[0][1]?.p_result as object))).toHaveLength(16);
  });
  it.each(["throw", "failure"])("does not interpret provider %s as no funds", async (mode) => {
    const h = setup();
    h.create.mockImplementation(async () => { if (mode === "throw") throw new Error("private provider information");
      return { ok: false, code: "REJECTED", message: "private", retryable: false }; });
    expect((await prepare(h)).outcome).toBe("reconciliation_required");
    expect(results(h)[0][1]?.p_result).toMatchObject({ outcome: "unknown", reason: "transport_uncertain" });
    expect(JSON.stringify(results(h))).not.toContain("private");
  });
  it.each([{ requestId: id(99) }, { claimId: id(99) }, { state: "paid" }, { extra: "secret" },
    { providerPaymentId: "other" }, { reason: "transport_uncertain" }])("never acknowledges an invalid durable result receipt %#", async (patch) => {
    const h = setup({ receipt: { ...receipt, ...patch } }); await expect(prepare(h)).rejects.toMatchObject({ code: "provider_execution_unavailable" });
  });
  it("does not accept a SQL bound receipt for mismatched returned economics", async () => {
    const h = setup({ object: { ...object, observedAmountCents: 1 } });
    await expect(prepare(h)).rejects.toMatchObject({ code: "provider_execution_unavailable" });
    expect(results(h)[0][1]?.p_result).toMatchObject({ observedAmountCents: 1 });
  });
  it("cannot ACK a successful transport until persistence succeeds", async () => {
    const h = setup({ failAt: "create_result_append" });
    await expect(prepare(h)).rejects.toMatchObject({ code: "provider_execution_unavailable" }); expect(h.create).toHaveBeenCalledOnce();
  });
  it("does not misclassify slow persistence after transport settled as transport uncertainty", async () => {
    vi.useFakeTimers(); const h = setup();
    const original = h.rpc.getMockImplementation()!;
    let release!: () => void;
    h.rpc.mockImplementation(async (name, args) => {
      if (name.endsWith("create_result_append")) await new Promise<void>((resolve) => { release = resolve; });
      return original(name, args);
    });
    let acknowledged = false;
    const pending = prepare(h).then((value) => { acknowledged = true; return value; });
    await vi.advanceTimersByTimeAsync(100);
    expect(acknowledged).toBe(false); expect(results(h)).toHaveLength(1);
    expect(results(h)[0][1]?.p_result).toMatchObject({ outcome: "object" });
    release(); expect((await pending).outcome).toBe("recorded");
  });
  it("allows SQL to bind the previously absent optional session once", async () => {
    const bound = { providerPaymentId: object.providerPaymentId, providerSessionId: null, nextAction: "retrieve" };
    const h = setup({ context: { ...context, ...bound }, claim: { ...claim, ...bound } });
    expect((await prepare(h)).outcome).toBe("recorded"); expect(h.create).not.toHaveBeenCalled();
  });
  it.each([{ providerPaymentId: "changed-payment" }, { providerSessionId: "changed-session" }])(
    "rejects a changed established identity between context and claim %#", async (patch) => {
      const bound = { ...bindingFields(), nextAction: "retrieve" };
      const h = setup({ context: { ...context, ...bound }, claim: { ...claim, ...bound, ...patch } });
      await expect(prepare(h)).rejects.toMatchObject({ code: "provider_execution_unavailable" });
      expect(h.create).not.toHaveBeenCalled(); expect(h.retrieve).not.toHaveBeenCalled(); expect(results(h)).toHaveLength(0);
    });
  it("never replaces an already established session even if a malformed receipt claims bound", async () => {
    const bound = { providerPaymentId: object.providerPaymentId, providerSessionId: "original-session", nextAction: "retrieve" };
    const h = setup({ context: { ...context, ...bound }, claim: { ...claim, ...bound } });
    await expect(prepare(h)).rejects.toMatchObject({ code: "provider_execution_unavailable" });
    expect(results(h)[0][1]?.p_result).toMatchObject({ providerSessionId: object.providerSessionId });
  });
  it("commits timeout uncertainty before responding, and appends a late result without a fresh grant", async () => {
    vi.useFakeTimers(); const h = setup();
    let resolve!: (value: { ok: true; value: typeof object }) => void;
    h.create.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const pending = prepare(h); await vi.advanceTimersByTimeAsync(21);
    expect((await pending).outcome).toBe("reconciliation_required");
    expect(results(h)).toHaveLength(1); expect(h.create.mock.calls[0][0].signal.aborted).toBe(true);
    resolve({ ok: true, value: object }); await vi.advanceTimersByTimeAsync(0);
    expect(results(h)).toHaveLength(2); expect(results(h)[1][1]?.p_result).toMatchObject({ outcome: "object" });
    expect(h.rpc.mock.calls.filter(([name]) => name.endsWith("create_claim"))).toHaveLength(1);
  });
  it("a late object cannot acknowledge before the already-started timeout append commits", async () => {
    vi.useFakeTimers(); const h = setup(), original = h.rpc.getMockImplementation()!;
    let commitUnknown!: () => void;
    h.rpc.mockImplementation(async (name, args) => {
      if (name.endsWith("create_result_append") && (args!.p_result as { outcome: string }).outcome === "unknown") {
        await new Promise<void>((resolve) => { commitUnknown = resolve; });
      }
      return original(name, args);
    });
    let resolveProvider!: (value: { ok: true; value: typeof object }) => void;
    h.create.mockImplementation(() => new Promise((done) => { resolveProvider = done; }));
    let acknowledged = false;
    const pending = prepare(h).then((response) => { acknowledged = true; return response; });
    await vi.advanceTimersByTimeAsync(21);
    resolveProvider({ ok: true, value: object }); await vi.advanceTimersByTimeAsync(0);
    expect(results(h)).toHaveLength(2); expect(acknowledged).toBe(false);
    commitUnknown(); expect((await pending).outcome).toBe("reconciliation_required");
  });
  it("does not ACK a timeout if unknown persistence fails, and consumes late rejection safely", async () => {
    vi.useFakeTimers(); const h = setup({ failAt: "create_result_append" });
    let reject!: (reason: Error) => void;
    h.create.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    const checked = expect(prepare(h)).rejects.toMatchObject({ code: "provider_execution_unavailable" });
    await vi.advanceTimersByTimeAsync(21); await checked;
    reject(new Error("private late failure")); await vi.advanceTimersByTimeAsync(0);
    expect(results(h)).toHaveLength(2);
  });
  it("keeps the durable timeout held when a late object's append fails without an unhandled rejection", async () => {
    vi.useFakeTimers(); const h = setup(), original = h.rpc.getMockImplementation()!;
    h.rpc.mockImplementation(async (name, args) => {
      if (name.endsWith("create_result_append") && (args!.p_result as { outcome: string }).outcome === "object") {
        throw new Error("private late persistence failure");
      }
      return original(name, args);
    });
    let resolve!: (value: { ok: true; value: typeof object }) => void;
    h.create.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const pending = prepare(h); await vi.advanceTimersByTimeAsync(21);
    const response = await pending; expect(response.outcome).toBe("reconciliation_required");
    resolve({ ok: true, value: object }); await vi.advanceTimersByTimeAsync(0);
    expect(results(h)).toHaveLength(2); expect(response.outcome).toBe("reconciliation_required");
    expect(h.rpc.mock.calls.filter(([name]) => name.endsWith("create_claim"))).toHaveLength(1);
  });
  it("a new coordinator after lost result commit reads the binding and retrieves, not creates", async () => {
    const first = setup({ failAt: "create_result_append" }); await expect(prepare(first)).rejects.toThrow();
    // Simulated durable response-loss state. Real commit atomicity is SQL proof.
    const bound = { ...bindingFields(), creationStartedAt: WHEN, creationReplayUntil: UNTIL, nextAction: "retrieve" };
    const next = setup({ context: { ...context, ...bound }, claim: { ...claim, ...bound }, receipt: { ...receipt, replayed: true } });
    expect((await prepare(next)).replayed).toBe(true); expect(next.create).not.toHaveBeenCalled(); expect(next.retrieve).toHaveBeenCalledOnce();
  });
  it("a restarted unbound coordinator uses the same durable body/key and refuses renewal of the first window", async () => {
    const first = setup(); await prepare(first);
    const second = setup({ context: { ...context, creationStartedAt: WHEN, creationReplayUntil: UNTIL } }); await prepare(second);
    expect(second.create.mock.calls[0][0].body).toEqual(first.create.mock.calls[0][0].body);
    expect(second.create.mock.calls[0][0].idempotencyKey).toBe(first.create.mock.calls[0][0].idempotencyKey);
    const renewed = setup({ context: { ...context, creationStartedAt: WHEN, creationReplayUntil: UNTIL },
      claim: { ...claim, creationStartedAt: "2026-10-01T10:30:01.000Z", creationReplayUntil: "2026-10-01T10:31:01.000Z" } });
    await expect(prepare(renewed)).rejects.toThrow(); expect(renewed.create).not.toHaveBeenCalled();
  });
  it("snapshots source authority before any asynchronous boundary", async () => {
    const h = setup(); Object.assign(h.source.scope, { accountId: "changed" }); Object.assign(h.source.policy, { revision: "changed" });
    Object.assign(h.source, { sourceId: "changed", adapterRevision: "changed" });
    expect((await prepare(h)).outcome).toBe("recorded");
    expect(h.rpc.mock.calls[1][1]).toMatchObject({ p_source_id: "synthetic-source", p_adapter_revision: "synthetic-v1",
      p_expected_scope: scope, p_policy_revision: policy.revision });
  });
});

function bindingFields() { return { providerPaymentId: object.providerPaymentId, providerSessionId: object.providerSessionId }; }

import { describe, expect, it, vi } from "vitest";
import type { CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import type { UnattendedOutcome } from "./durable-checkout-executor";
import type { RecoveryEntryCode } from "./checkout-recovery-sweep";
import {
  RECOVERY_OPERATION_AUTHORITY, type RecoveryIntent, type RecoveryOperationState, type RecoveryOperationStore,
} from "./checkout-recovery-operation-contract";
import { createCheckoutRecoveryOperation, type CheckoutRecoveryOperationDeps } from "./checkout-recovery-operation";

const owner = "11111111-1111-4111-8111-111111111111";
const otherOwner = "22222222-2222-4222-8222-222222222222";
const cycleId = "33333333-3333-4333-8333-333333333333";
const executionId = "44444444-4444-4444-8444-444444444444";
const orderId = "55555555-5555-4555-8555-555555555555";
const memberId = "66666666-6666-4666-8666-666666666666";
const intentId = "77777777-7777-4777-8777-777777777777";
const oldTime = "2026-09-10T11:00:00.123456+00:00";
const horizon = "2026-09-10T11:55:00.000Z";
const nowTime = "2026-09-10T12:00:00.000Z";
const copy = <T,>(value: T): T => structuredClone(value);

function row(overrides: Partial<CheckoutExecutionRecord> = {}): CheckoutExecutionRecord {
  return {
    executionId, memberId, orderId, requestKey: "request_fixture_0001", phase: "reserved", version: 1,
    amountCents: 1000, currency: "usd", paymentMethodReference: "pm_fixture", quoteFingerprint: "fixture-quote",
    providerReference: null, authorizationKey: "fixture-authorize", captureKey: "fixture-capture", cancelKey: "fixture-cancel",
    reservationIds: ["res-1"], createdAt: oldTime, updatedAt: oldTime, authorizationAttemptedAt: null,
    settledAt: null, committedAt: null, localCommitFailure: null, lastProviderResult: null, ...overrides,
  };
}
function intent(overrides: Partial<RecoveryIntent> = {}): RecoveryIntent {
  return {
    intentId, executionId, memberId, orderId, requestKey: "request_fixture_0001", observedUpdatedAt: oldTime,
    observedPhase: "reserved", decision: "settle", ...overrides,
  };
}
function initial(overrides: Partial<RecoveryOperationState> = {}): RecoveryOperationState {
  return { schemaVersion: 1, owner: null, fence: "1", leaseUntil: null, cycleId, before: horizon, after: null, exhausted: false, pending: null, ...overrides };
}

/** Local stateful contract ports only: no imported database/client/provider or network. */
function fixture(options: { records?: CheckoutExecutionRecord[]; state?: RecoveryOperationState; enabled?: boolean } = {}) {
  let clock = Date.parse(nowTime);
  let current = copy(options.state ?? initial());
  let serial = 0;
  const rows = new Map((options.records ?? [row()]).map(record => [record.executionId, copy(record)]));
  const trace: string[] = [];
  const outcomes: Array<{ intent: RecoveryIntent; code: RecoveryEntryCode }> = [];
  const store = {
    authority: RECOVERY_OPERATION_AUTHORITY, durable: true as const,
    read: vi.fn(async () => { trace.push("read"); return copy(current); }),
    claim: vi.fn(async (nextOwner: string) => {
      trace.push("claim");
      if (current.owner !== null && current.owner !== nextOwner && Date.parse(current.leaseUntil!) > clock) return { status: "busy" as const };
      current = { ...current, owner: nextOwner, fence: String(BigInt(current.fence) + 1n), leaseUntil: new Date(clock + 120_000).toISOString() };
      return { status: "acquired" as const, state: copy(current) };
    }),
    renew: vi.fn(async (_owner: string, _fence: string) => {
      trace.push("renew"); current.leaseUntil = new Date(clock + 120_000).toISOString(); return copy(current);
    }),
    begin: vi.fn<RecoveryOperationStore["begin"]>(async (_owner, _fence, input) => {
      trace.push("begin");
      const record = rows.get(input.executionId)!;
      current.pending = { ...input, memberId: record.memberId, orderId: record.orderId, requestKey: record.requestKey };
      return copy(current);
    }),
    complete: vi.fn<RecoveryOperationStore["complete"]>(async (_owner, _fence, _intentId, code) => {
      trace.push("complete");
      const pending = current.pending!;
      outcomes.push({ intent: copy(pending), code });
      current.after = { executionId: pending.executionId, updatedAt: pending.observedUpdatedAt };
      current.pending = null;
      return copy(current);
    }),
    exhaust: vi.fn(async (_owner: string, _fence: string) => {
      trace.push("exhaust"); current.exhausted = true; return copy(current);
    }),
    release: vi.fn(async (_owner: string, _fence: string) => {
      trace.push("release"); current.owner = null; current.leaseUntil = null; return copy(current);
    }),
  } satisfies RecoveryOperationStore;
  const getForMember = vi.fn(async (member: string, key: string) => {
    trace.push("get");
    return copy([...rows.values()].find(record => record.memberId === member && record.requestKey === key) ?? null);
  });
  const listRecoverable = vi.fn<CheckoutRecoveryOperationDeps["executions"]["listRecoverable"]>(async request => {
    trace.push("list");
    return [...rows.values()].filter(record => record.phase !== "committed" && !(record.phase === "cancelled" && record.settledAt !== null))
      .filter(record => Date.parse(record.updatedAt!) < request.before.getTime())
      .filter(record => !request.after || Date.parse(record.updatedAt!) > Date.parse(request.after.updatedAt)
        || (Date.parse(record.updatedAt!) === Date.parse(request.after.updatedAt) && record.executionId > request.after.executionId))
      .sort((a, b) => Date.parse(a.updatedAt!) - Date.parse(b.updatedAt!) || (a.executionId < b.executionId ? -1 : 1))
      .slice(0, request.limit).map(copy);
  });
  const settleUnattended = vi.fn<CheckoutRecoveryOperationDeps["settleUnattended"]>(async (member, key) => {
    trace.push("settle");
    const record = [...rows.values()].find(item => item.memberId === member && item.requestKey === key)!;
    rows.set(record.executionId, { ...record, phase: "committed", committedAt: new Date(clock).toISOString(), updatedAt: new Date(clock).toISOString() });
    return { kind: "committed", orderId: record.orderId };
  });
  const deps: CheckoutRecoveryOperationDeps = {
    enabled: options.enabled ?? true, store, executions: { getForMember, listRecoverable }, settleUnattended,
    now: () => new Date(clock), newId: () => `77777777-7777-4777-8777-${String(++serial).padStart(12, "0")}`,
  };
  return {
    deps, store, rows, trace, outcomes, getForMember, listRecoverable, settleUnattended,
    state: () => copy(current), advance: (ms: number) => { clock += ms; },
    operation: () => createCheckoutRecoveryOperation(deps),
  };
}

describe("durable recovery effect gate and request bounds", () => {
  it.each([undefined, false, "true", 1, null])("refuses non-explicit enabled authority before any port (%#)", async enabled => {
    const f = fixture();
    f.deps.enabled = enabled as boolean;
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, status: "disabled", considered: 0, recorded: 0 });
    expect(f.trace).toEqual([]);
  });
  it.each([
    { owner: "bad" }, { owner, maxAttempts: 0 }, { owner, maxAttempts: 201 }, { owner, maxAttempts: 1.5 },
    { owner, maxAttempts: NaN }, { owner, maxPages: 51 }, { owner, pageSize: 0 }, { owner, pageSize: Infinity },
    { owner, pageSize: "2" }, { owner, maxAttempts: null }, { owner, mode: "preview" }, null,
  ])("refuses invalid operation options before lease (%#)", async options => {
    const f = fixture();
    expect(await f.operation().run(options as Parameters<ReturnType<typeof createCheckoutRecoveryOperation>["run"]>[0]))
      .toMatchObject({ ok: false, status: "failed", code: "invalid_request" });
    expect(f.trace).toEqual([]);
  });
  it.each([{ durable: false }, { authority: "other-authority" }])("refuses noncanonical or nondurable store (%#)", async patch => {
    const f = fixture();
    Object.assign(f.store, patch);
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, status: "failed", code: "unavailable" });
    expect(f.trace).toEqual([]);
  });
  it("refuses invalid clock before acquisition", async () => {
    const f = fixture(); f.deps.now = () => new Date(NaN);
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "invalid_request" });
    expect(f.trace).toEqual([]);
  });
  it("reports busy without reads or effects", async () => {
    const f = fixture({ state: initial({ owner: otherOwner, leaseUntil: "2026-09-10T12:02:00Z" }) });
    expect(await f.operation().run({ owner })).toMatchObject({ ok: true, status: "busy", attempted: 0 });
    expect(f.trace).toEqual(["claim"]);
  });
});

describe("durable recovery intent and completion ordering", () => {
  it("persists begin, rereads exact identity, renews, settles, then completes before exhaustion/release", async () => {
    const f = fixture();
    expect(await f.operation().run({ owner })).toEqual({
      ok: true, status: "exhausted", considered: 1, attempted: 1, recorded: 1, settled: 1,
      skipped: 0, escalated: 0, deferred: 0, pages: 1, resumed: 0,
    });
    expect(f.trace).toEqual(["claim", "list", "renew", "begin", "get", "renew", "settle", "complete", "renew", "exhaust", "release"]);
    expect(f.store.begin).toHaveBeenCalledWith(owner, "2", {
      intentId: "77777777-7777-4777-8777-000000000001", executionId, observedUpdatedAt: oldTime, observedPhase: "reserved", decision: "settle",
    });
    expect(f.settleUnattended).toHaveBeenCalledWith(memberId, "request_fixture_0001", { updatedAt: oldTime });
    expect(f.outcomes[0].code).toBe("settled_committed");
    expect(f.state()).toMatchObject({ owner: null, pending: null, exhausted: true, after: { updatedAt: oldTime, executionId } });
  });
  it("recovers crash after terminal settlement before completion, even when discovery is empty", async () => {
    const f = fixture();
    f.store.complete.mockRejectedValueOnce(new Error("synthetic completion write uncertainty"));
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "completion_failed", attempted: 1, recorded: 0, settled: 0 });
    expect(f.rows.get(executionId)?.phase).toBe("committed");
    expect(f.state().pending).not.toBeNull();
    expect(f.state().after).toBeNull();
    f.trace.length = 0;
    expect(await f.operation().run({ owner })).toMatchObject({ ok: true, status: "exhausted", resumed: 1, attempted: 0, recorded: 1, settled: 1 });
    expect(f.trace.slice(0, 4)).toEqual(["claim", "get", "complete", "list"]);
    expect(f.settleUnattended).toHaveBeenCalledTimes(1);
    expect(f.outcomes).toHaveLength(1);
  });
  it("resumes a cancelled terminal execution without any second settlement call", async () => {
    const f = fixture({ state: initial({ pending: intent() }), records: [row({ phase: "cancelled", settledAt: nowTime, updatedAt: nowTime })] });
    expect(await f.operation().run({ owner })).toMatchObject({ ok: true, recorded: 1, settled: 1, attempted: 0, resumed: 1 });
    expect(f.outcomes[0].code).toBe("settled_cancelled");
    expect(f.settleUnattended).not.toHaveBeenCalled();
  });
  it("retains uncertain settlement as a pending intent and never claims durable completion", async () => {
    const f = fixture(); f.settleUnattended.mockRejectedValueOnce(new Error("private synthetic provider error"));
    const result = await f.operation().run({ owner });
    expect(result).toMatchObject({ ok: false, status: "failed", code: "settlement_failed", recorded: 0, attempted: 1 });
    expect(f.state().pending).not.toBeNull();
    expect(f.state().after).toBeNull();
    expect(f.store.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private synthetic provider error");
  });
  it("persists grace-period skips and never changes a resumed skip into settlement", async () => {
    const f = fixture({ records: [row({ updatedAt: "2026-09-10T11:50:00Z" })] });
    f.store.complete.mockRejectedValueOnce(new Error("fixture interruption"));
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "completion_failed" });
    expect(f.state().pending?.decision).toBe("skip");
    f.advance(60 * 60_000);
    expect(await f.operation().run({ owner })).toMatchObject({ ok: true, resumed: 1, skipped: 1, attempted: 0 });
    expect(f.settleUnattended).not.toHaveBeenCalled();
    expect(f.outcomes[0].code).toBe("skipped");
  });
  it("records disappeared pending intent from canonical absence before listing", async () => {
    const f = fixture({ state: initial({ pending: intent() }), records: [] });
    expect(await f.operation().run({ owner })).toMatchObject({ ok: true, resumed: 1, recorded: 1, deferred: 1, attempted: 0 });
    expect(f.outcomes[0].code).toBe("vanished");
    expect(f.trace.indexOf("complete")).toBeLessThan(f.trace.indexOf("list"));
  });
  it.each([
    { executionId: otherOwner }, { memberId: otherOwner }, { orderId: otherOwner }, { requestKey: "request_other_0001" },
    { updatedAt: null },
  ])("refuses changed canonical pending identity/projection (%#)", async mismatch => {
    const f = fixture({ state: initial({ pending: intent() }) });
    f.getForMember.mockResolvedValueOnce(row(mismatch));
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "state_invalid", recorded: 0 });
    expect(f.settleUnattended).not.toHaveBeenCalled();
    expect(f.store.complete).not.toHaveBeenCalled();
    expect(f.listRecoverable).not.toHaveBeenCalled();
  });
  it.each([{ updatedAt: "2026-09-10T11:00:00.123457Z" }, { phase: "authorizing" as const }])(
    "records contention instead of settling a changed pending execution (%#)", async changed => {
      const f = fixture({ state: initial({ pending: intent() }), records: [row(changed)] });
      // Keep the post-cursor discovery empty; this case tests only pending recovery.
      f.listRecoverable.mockResolvedValue([]);
      expect(await f.operation().run({ owner })).toMatchObject({ ok: true, attempted: 0, recorded: 1, deferred: 1 });
      expect(f.outcomes[0].code).toBe("contended");
      expect(f.settleUnattended).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["pending", "left_pending"], ["contended", "contended"], ["escalated", "needs_person"],
  ] as const)("records only closed outcome code for %s", async (kind, code) => {
    const f = fixture();
    f.settleUnattended.mockResolvedValue({ kind, orderId, ...(kind === "escalated" ? { reason: "synthetic private detail not for output" } : {}) } as UnattendedOutcome);
    const result = await f.operation().run({ owner });
    expect(result).toMatchObject({ ok: true, recorded: 1 });
    expect(f.outcomes[0].code).toBe(code);
    expect(Object.keys(result).sort()).toEqual(["attempted", "considered", "deferred", "escalated", "ok", "pages", "recorded", "resumed", "settled", "skipped", "status"].sort());
    expect(JSON.stringify(result)).not.toContain(orderId);
    expect(JSON.stringify(result)).not.toContain("synthetic private detail");
  });
  it.each([{ kind: "committed", orderId: otherOwner }, { kind: "bogus" }, null])("refuses malformed or wrong-order coordinator outcome (%#)", async outcome => {
    const f = fixture(); f.settleUnattended.mockResolvedValueOnce(outcome as UnattendedOutcome);
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "settlement_failed", recorded: 0 });
    expect(f.state().pending).not.toBeNull();
  });
});

describe("recovery fences, response binding and failure visibility", () => {
  it("preserves fencing values beyond JavaScript safe integers exactly", async () => {
    const f = fixture({ state: initial({ fence: "9007199254740993" }) });
    expect(await f.operation().run({ owner })).toMatchObject({ ok: true });
    for (const call of [...f.store.renew.mock.calls, ...f.store.complete.mock.calls, ...f.store.release.mock.calls]) {
      expect(call[1]).toBe("9007199254740994");
    }
  });
  it.each([
    { owner: otherOwner }, { fence: "3" }, { cycleId: otherOwner }, { before: "2026-09-10T11:54:00.000Z" },
    { leaseUntil: "2026-09-10T11:59:59Z" }, { exhausted: true }, { pending: intent() },
  ])("refuses drift in renewed state before an effect (%#)", async drift => {
    const f = fixture();
    f.store.renew.mockImplementationOnce(async () => ({ ...f.state(), ...drift }));
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, recorded: 0 });
    expect(f.store.begin).not.toHaveBeenCalled();
    expect(f.settleUnattended).not.toHaveBeenCalled();
  });
  it("checks and renews the same lease after canonical read immediately before settlement", async () => {
    const f = fixture();
    f.store.renew.mockImplementationOnce(async () => f.state());
    f.store.renew.mockImplementationOnce(async () => ({ ...f.state(), owner: otherOwner }));
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "lease_lost", recorded: 0, attempted: 0 });
    expect(f.getForMember).toHaveBeenCalledTimes(1);
    expect(f.settleUnattended).not.toHaveBeenCalled();
  });
  it("does not act after the lease expires during canonical read", async () => {
    const f = fixture();
    f.getForMember.mockImplementationOnce(async () => { f.advance(120_001); return row(); });
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "lease_lost", attempted: 0 });
    expect(f.settleUnattended).not.toHaveBeenCalled();
  });
  it("retains pending if the effect outlasts the lease rather than claiming recorded success", async () => {
    const f = fixture();
    f.settleUnattended.mockImplementationOnce(async () => { f.advance(120_001); return { kind: "pending", orderId }; });
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "lease_lost", attempted: 1, recorded: 0 });
    expect(f.state().pending).not.toBeNull();
    expect(f.store.complete).not.toHaveBeenCalled();
  });
  it.each(["memberId", "orderId", "executionId", "requestKey", "observedUpdatedAt", "observedPhase", "decision"])(
    "binds begin result's exact %s before settlement", async field => {
      const f = fixture();
      const original = f.store.begin.getMockImplementation()!;
      f.store.begin.mockImplementationOnce(async (...args) => {
        const value = await original(...args);
        const replacement = field === "requestKey" ? "request_other_0001" : field === "observedUpdatedAt" ? "2026-09-10T11:00:00.123457Z"
          : field === "observedPhase" ? "authorizing" : field === "decision" ? "skip" : otherOwner;
        return { ...value, pending: { ...value.pending!, [field]: replacement } };
      });
      expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "state_invalid", recorded: 0 });
      expect(f.settleUnattended).not.toHaveBeenCalled();
    },
  );
  it("accepts PostgreSQL JSONB field ordering without relaxing field identity", async () => {
    const f = fixture();
    const original = f.store.begin.getMockImplementation()!;
    f.store.begin.mockImplementationOnce(async (...args) => {
      const value = await original(...args);
      value.pending = Object.fromEntries(Object.entries(value.pending!).reverse()) as unknown as RecoveryIntent;
      return value;
    });
    expect(await f.operation().run({ owner })).toMatchObject({ ok: true, recorded: 1 });
  });
  it.each([
    { after: null }, { pending: intent() }, { exhausted: true }, { fence: "9" },
  ])("never counts an incorrectly acknowledged completion as durable (%#)", async drift => {
    const f = fixture();
    const original = f.store.complete.getMockImplementation()!;
    f.store.complete.mockImplementationOnce(async (...args) => ({ ...await original(...args), ...drift }));
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "state_invalid", recorded: 0, settled: 0 });
  });
  it.each(["claim", "renew", "begin", "complete", "exhaust", "release"] as const)("surfaces %s persistence failure as failed, not an ordinary report", async method => {
    const f = fixture(); f.store[method].mockRejectedValue(new Error("fixture persistence unavailable"));
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, status: "failed" });
  });
  it("does not mask an earlier failure if lease release also fails", async () => {
    const f = fixture();
    f.getForMember.mockRejectedValue(new Error("fixture read unavailable"));
    f.store.release.mockRejectedValue(new Error("fixture release unavailable"));
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "read_failed", releaseFailed: true, recorded: 0 });
  });
  it.each([
    { schemaVersion: 2 }, { fence: "01" }, { fence: "9223372036854775808" }, { before: "2026-09-10T11:55:00.000001Z" },
    { before: "2026-02-30T00:00:00Z" }, { pending: { ...intent(), observedUpdatedAt: "2026-09-10T11:00:00.1234567Z" } },
    { pending: { ...intent(), observedPhase: "committed" } },
    { after: { executionId, updatedAt: horizon } },
  ])("refuses malformed persisted state without inventing a new horizon (%#)", async malformed => {
    const f = fixture();
    f.store.claim.mockResolvedValueOnce({ status: "acquired", state: { ...initial({ owner, leaseUntil: "2026-09-10T12:02:00Z" }), ...malformed } as RecoveryOperationState });
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "state_invalid", attempted: 0 });
    expect(f.listRecoverable).not.toHaveBeenCalled();
  });
});

describe("bounded discovery and exact recovery cursors", () => {
  it("uses durable fixed horizon and cursor, not a newly computed local cycle", async () => {
    const after = { executionId: otherOwner, updatedAt: "2026-09-10T10:30:00.123456+00:00" };
    const f = fixture({ state: initial({ after }) });
    expect(await f.operation().run({ owner })).toMatchObject({ ok: true });
    expect(f.listRecoverable).toHaveBeenCalledWith({ before: new Date(horizon), after, limit: 25 });
  });
  it("advances only to completed rows when attempt budget stops a larger page", async () => {
    const second = row({ executionId: otherOwner, memberId: otherOwner, orderId: otherOwner, requestKey: "request_fixture_0002", updatedAt: "2026-09-10T11:01:00Z" });
    const f = fixture({ records: [row(), second] });
    expect(await f.operation().run({ owner, maxAttempts: 1, pageSize: 2 })).toMatchObject({ ok: true, status: "bounded", attempted: 1, recorded: 1, pages: 1 });
    expect(f.state().after).toEqual({ executionId, updatedAt: oldTime });
    expect(f.rows.get(otherOwner)?.phase).toBe("reserved");
    expect(f.store.exhaust).not.toHaveBeenCalled();
  });
  it("bounds skip-only discovery by page count", async () => {
    const first = row({ updatedAt: "2026-09-10T11:50:00Z" });
    const second = row({ executionId: otherOwner, requestKey: "request_fixture_0002", updatedAt: "2026-09-10T11:51:00Z" });
    const f = fixture({ records: [first, second] });
    expect(await f.operation().run({ owner, maxPages: 1, pageSize: 1 })).toMatchObject({ ok: true, status: "bounded", pages: 1, skipped: 1, attempted: 0 });
    expect(f.store.exhaust).not.toHaveBeenCalled();
  });
  it("requires explicit exhaust acknowledgement even after an empty page", async () => {
    const f = fixture({ records: [] });
    f.store.exhaust.mockImplementationOnce(async () => f.state());
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "state_invalid", recorded: 0 });
  });
  it.each([null, {}, [row(), row()], [row({ phase: "committed" })], [row({ updatedAt: horizon })], [row({ updatedAt: null })]])(
    "rejects malformed discovery page as a whole before any begin/effect (%#)", async batch => {
      const f = fixture(); f.listRecoverable.mockResolvedValueOnce(batch as CheckoutExecutionRecord[]);
      expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "discovery_failed", attempted: 0, recorded: 0 });
      expect(f.store.begin).not.toHaveBeenCalled();
      expect(f.settleUnattended).not.toHaveBeenCalled();
    },
  );
  it("treats offset-equivalent microseconds as unchanged, but passes canonical raw read timestamp to the coordinator", async () => {
    const alternate = "2026-09-10T12:00:00.123456+01:00";
    const f = fixture({ state: initial({ pending: intent() }), records: [row({ updatedAt: alternate })] });
    expect(await f.operation().run({ owner })).toMatchObject({ ok: true, resumed: 1, attempted: 1, recorded: 1 });
    expect(f.settleUnattended).toHaveBeenCalledWith(memberId, "request_fixture_0001", { updatedAt: alternate });
    expect(f.state().after).toEqual({ executionId, updatedAt: oldTime });
  });
  it("does not collapse adjacent microseconds when validating a page or its cursor", async () => {
    const secondId = "88888888-8888-4888-8888-888888888888";
    const second = row({ executionId: secondId, requestKey: "request_fixture_0002", updatedAt: "2026-09-10T11:00:00.123457Z" });
    const f = fixture({ records: [row(), second] });
    f.listRecoverable.mockResolvedValueOnce([row(), second]);
    expect(await f.operation().run({ owner, pageSize: 3 })).toMatchObject({ ok: true, recorded: 2, attempted: 2 });
    expect(f.state().after).toEqual({ executionId: secondId, updatedAt: second.updatedAt });
  });
  it("refuses reversed microsecond order before any effect", async () => {
    const f = fixture();
    f.listRecoverable.mockResolvedValueOnce([row({ updatedAt: "2026-09-10T11:00:00.123457Z" }), row({ executionId: otherOwner })]);
    expect(await f.operation().run({ owner })).toMatchObject({ ok: false, code: "discovery_failed", attempted: 0 });
    expect(f.store.begin).not.toHaveBeenCalled();
  });
});

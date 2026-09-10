import type { CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import type { UnattendedOutcome } from "./durable-checkout-executor";
import { shouldAttempt, type RecoveryCursor, type RecoveryEntryCode, type RecoveryListRequest } from "./checkout-recovery-sweep";
import {
  RECOVERY_OPERATION_AUTHORITY,
  type RecoveryBeginInput,
  type RecoveryIntent,
  type RecoveryOperationState,
  type RecoveryOperationStore,
} from "./checkout-recovery-operation-contract";

export interface CheckoutRecoveryOperationDeps {
  /** Explicit effect authority; constructing the operation never acquires it. */
  enabled?: boolean;
  store: RecoveryOperationStore;
  executions: {
    getForMember(memberId: string, requestKey: string): Promise<CheckoutExecutionRecord | null>;
    listRecoverable(request: RecoveryListRequest): Promise<CheckoutExecutionRecord[]>;
  };
  /** Deliberately no normal checkout, provider, receipt or notification port. */
  settleUnattended(memberId: string, requestKey: string, expected?: { updatedAt: string | null }): Promise<UnattendedOutcome>;
  now(): Date;
  newId(): string;
}

export interface CheckoutRecoveryOperationOptions {
  owner: string;
  maxAttempts?: number;
  maxPages?: number;
  pageSize?: number;
}

export interface RecoveryOperationCounts {
  considered: number;
  attempted: number;
  recorded: number;
  settled: number;
  skipped: number;
  escalated: number;
  deferred: number;
  pages: number;
  resumed: number;
}

export type RecoveryOperationFailure =
  | "invalid_request" | "unavailable" | "claim_failed" | "state_invalid" | "lease_lost"
  | "renew_failed" | "discovery_failed" | "begin_failed" | "read_failed"
  | "settlement_failed" | "completion_failed" | "exhaustion_failed" | "release_failed";

/** Counts and closed codes only. No private identities, payment evidence or raw errors. */
export type CheckoutRecoveryOperationResult = RecoveryOperationCounts & (
  | { ok: true; status: "busy" | "bounded" | "exhausted" }
  | { ok: false; status: "disabled" }
  | { ok: false; status: "failed"; code: RecoveryOperationFailure; releaseFailed: boolean }
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PHASES = ["reserved", "authorizing", "action_required", "authorized", "capturing", "captured", "committed", "cancelling", "cancelled", "reconciliation_required"];
const INTENT_KEYS = ["intentId", "executionId", "memberId", "orderId", "requestKey", "observedUpdatedAt", "observedPhase", "decision"];
const STATE_KEYS = ["schemaVersion", "owner", "fence", "leaseUntil", "cycleId", "before", "after", "exhausted", "pending"];
const codes: Record<UnattendedOutcome["kind"], RecoveryEntryCode> = {
  committed: "settled_committed", cancelled: "settled_cancelled", pending: "left_pending",
  contended: "contended", escalated: "needs_person", missing: "vanished",
};

class OperationRefusal extends Error {
  constructor(readonly code: RecoveryOperationFailure) { super(code); }
}
const refuse = (code: RecoveryOperationFailure): never => { throw new OperationRefusal(code); };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** Parse PostgreSQL timestamp spellings without losing the original microseconds. */
function instant(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|z|[+-]\d{2}(?::?\d{2})?)$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year! % 4 === 0 && (year! % 100 !== 0 || year! % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year! < 1 || month! < 1 || month! > 12 || day! < 1 || day! > days[month! - 1]! || hour! > 23 || minute! > 59 || second! > 59) return null;
  const rawZone = match[8]!;
  const digits = rawZone.slice(1).replace(":", "");
  const zone = /^[Zz]$/.test(rawZone) ? "Z" : `${rawZone[0]}${digits.slice(0, 2)}:${digits.slice(2) || "00"}`;
  const whole = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${zone}`);
  return Number.isFinite(whole) ? BigInt(whole) * 1000n + BigInt((match[7] ?? "").padEnd(6, "0")) : null;
}
function cursor(value: unknown): value is RecoveryCursor {
  return object(value) && keys(value, ["updatedAt", "executionId"]) && uuid(value.executionId) && instant(value.updatedAt) !== null;
}
function compare(left: RecoveryCursor, right: RecoveryCursor): number {
  const a = instant(left.updatedAt)!;
  const b = instant(right.updatedAt)!;
  return a < b ? -1 : a > b ? 1 : left.executionId < right.executionId ? -1 : left.executionId > right.executionId ? 1 : 0;
}
const position = (intent: RecoveryIntent): RecoveryCursor => ({ updatedAt: intent.observedUpdatedAt, executionId: intent.executionId });
function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  return object(left) && object(right) && Object.keys(left).length === Object.keys(right).length
    && Object.keys(left).every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
}

/** The adapter validates the wire; these checks additionally bind every response to this operation. */
function snapshot(value: unknown): RecoveryOperationState {
  if (!object(value) || !keys(value, STATE_KEYS) || value.schemaVersion !== 1
    || (value.owner !== null && !uuid(value.owner)) || !uuid(value.cycleId)
    || typeof value.fence !== "string" || !/^[1-9]\d{0,18}$/.test(value.fence) || BigInt(value.fence) > 9223372036854775807n
    || typeof value.exhausted !== "boolean") return refuse("state_invalid");
  const horizon = instant(value.before);
  if (horizon === null || horizon % 1000n !== 0n
    || (value.owner === null ? value.leaseUntil !== null : instant(value.leaseUntil) === null)
    || (value.after !== null && (!cursor(value.after) || instant(value.after.updatedAt)! >= horizon))) return refuse("state_invalid");
  if (value.pending !== null) {
    const pending = value.pending;
    if (!object(pending) || !keys(pending, INTENT_KEYS) || value.exhausted
      || !uuid(pending.intentId) || !uuid(pending.executionId) || !uuid(pending.memberId) || !uuid(pending.orderId)
      || typeof pending.requestKey !== "string" || pending.requestKey.length < 8 || pending.requestKey.length > 120
      || !PHASES.includes(pending.observedPhase as string) || pending.observedPhase === "committed"
      || !["settle", "skip"].includes(pending.decision as string)
      || instant(pending.observedUpdatedAt) === null || instant(pending.observedUpdatedAt)! >= horizon) return refuse("state_invalid");
    const at = position(pending as unknown as RecoveryIntent);
    if (value.after !== null && compare(at, value.after as unknown as RecoveryCursor) <= 0) return refuse("state_invalid");
  }
  // Copy at the boundary: an injected port must not mutate the held snapshot later.
  return JSON.parse(JSON.stringify(value)) as RecoveryOperationState;
}

export function createCheckoutRecoveryOperation(deps: CheckoutRecoveryOperationDeps) {
  return {
    async run(options: CheckoutRecoveryOperationOptions): Promise<CheckoutRecoveryOperationResult> {
      const counts: RecoveryOperationCounts = { considered: 0, attempted: 0, recorded: 0, settled: 0, skipped: 0, escalated: 0, deferred: 0, pages: 0, resumed: 0 };
      if (deps.enabled !== true) return { ...counts, ok: false, status: "disabled" };
      let state: RecoveryOperationState | null = null;
      let stage: RecoveryOperationFailure = "invalid_request";
      let owner = "";
      const clock = () => {
        const now = deps.now();
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return refuse("invalid_request");
        return now;
      };
      const held = (next: RecoveryOperationState) => {
        if (next.owner !== owner || instant(next.leaseUntil)! <= BigInt(clock().getTime()) * 1000n) refuse("lease_lost");
        if (instant(next.before)! >= BigInt(clock().getTime()) * 1000n) refuse("state_invalid");
      };
      const adopt = (raw: RecoveryOperationState, action: "renew" | "begin" | "complete" | "exhaust" | "release", pending?: RecoveryIntent) => {
        const prior = state!;
        const next = snapshot(raw);
        const after = action === "complete" ? position(prior.pending!) : prior.after;
        const expectedPending = action === "begin" ? pending : action === "complete" ? null : prior.pending;
        if (next.fence !== prior.fence || next.cycleId !== prior.cycleId || next.before !== prior.before
          || !equal(next.after, after) || !equal(next.pending, expectedPending)
          || next.exhausted !== (action === "exhaust" ? true : prior.exhausted)) refuse("state_invalid");
        if (action === "release") {
          if (next.owner !== null || next.leaseUntil !== null) refuse("state_invalid");
        } else {
          held(next);
          if (instant(next.leaseUntil)! < instant(prior.leaseUntil)!) refuse("lease_lost");
        }
        state = next;
      };
      const renew = async () => {
        held(state!);
        stage = "renew_failed";
        adopt(await deps.store.renew(owner, state!.fence), "renew");
      };
      const complete = async (code: RecoveryEntryCode) => {
        held(state!);
        stage = "completion_failed";
        adopt(await deps.store.complete(owner, state!.fence, state!.pending!.intentId, code), "complete");
        counts.recorded += 1;
        if (code === "settled_committed" || code === "settled_cancelled") counts.settled += 1;
        else if (code === "skipped") counts.skipped += 1;
        else if (code === "needs_person") counts.escalated += 1;
        else counts.deferred += 1;
      };
      const resolvePending = async () => {
        const intent = state!.pending!;
        counts.considered += 1;
        held(state!);
        stage = "read_failed";
        const record = await deps.executions.getForMember(intent.memberId, intent.requestKey);
        if (record !== null && (!object(record) || record.executionId !== intent.executionId || record.memberId !== intent.memberId
          || record.orderId !== intent.orderId || record.requestKey !== intent.requestKey || instant(record.updatedAt) === null)) refuse("state_invalid");
        let code: RecoveryEntryCode;
        if (intent.decision === "skip") code = "skipped";
        else if (record === null) code = "vanished";
        else if (record.phase === "committed") code = "settled_committed";
        else if (record.phase === "cancelled" && record.settledAt !== null) code = "settled_cancelled";
        else if (instant(record.updatedAt) !== instant(intent.observedUpdatedAt) || record.phase !== intent.observedPhase) code = "contended";
        else {
          await renew();
          stage = "settlement_failed";
          counts.attempted += 1;
          let outcome: UnattendedOutcome;
          try {
            outcome = await deps.settleUnattended(intent.memberId, intent.requestKey, { updatedAt: record.updatedAt! });
          } catch {
            // The financial outcome may be uncertain; leave the durable intent
            // pending so the next owner first re-reads canonical truth.
            return refuse("settlement_failed");
          }
          if (!object(outcome) || !Object.hasOwn(codes, outcome.kind)
            || (outcome.kind !== "missing" && outcome.orderId !== intent.orderId)) refuse("settlement_failed");
          code = codes[outcome.kind];
        }
        await complete(code);
      };
      const release = async () => {
        stage = "release_failed";
        adopt(await deps.store.release(owner, state!.fence), "release");
      };
      try {
        if (!object(options) || !uuid(options.owner)
          || Object.keys(options).some(key => !["owner", "maxAttempts", "maxPages", "pageSize"].includes(key))) refuse("invalid_request");
        owner = options.owner;
        const limits = [options.maxAttempts === undefined ? 25 : options.maxAttempts,
          options.maxPages === undefined ? 10 : options.maxPages, options.pageSize === undefined ? 25 : options.pageSize];
        if (limits.some((value, index) => typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > (index === 1 ? 50 : 200))) refuse("invalid_request");
        const [maxAttempts, maxPages, pageSize] = limits as [number, number, number];
        clock();
        if (deps.store?.durable !== true || deps.store.authority !== RECOVERY_OPERATION_AUTHORITY) refuse("unavailable");
        stage = "claim_failed";
        const claim = await deps.store.claim(owner);
        if (object(claim) && keys(claim, ["status"]) && claim.status === "busy") return { ...counts, ok: true, status: "busy" };
        if (!object(claim) || !keys(claim, ["status", "state"]) || claim.status !== "acquired") return refuse("state_invalid");
        state = snapshot(claim.state);
        held(state);
        if (state.exhausted) refuse("state_invalid");
        const seen = new Set<string>();
        if (state.pending) {
          counts.resumed += 1;
          seen.add(state.pending.executionId);
          await resolvePending();
        }
        let exhausted = false;
        while (counts.pages < maxPages && counts.attempted < maxAttempts) {
          held(state);
          stage = "discovery_failed";
          const after = state.after;
          const batch = await deps.executions.listRecoverable({ before: new Date(Number(instant(state.before)! / 1000n)), limit: pageSize, after });
          counts.pages += 1;
          if (!Array.isArray(batch) || batch.length > pageSize) refuse("discovery_failed");
          let previous = after;
          const pageIds = new Set<string>();
          for (const record of batch) {
            if (!object(record) || !uuid(record.executionId) || !uuid(record.memberId) || !uuid(record.orderId)
              || typeof record.requestKey !== "string" || record.requestKey.length < 8 || record.requestKey.length > 120
              || !PHASES.includes(record.phase) || record.phase === "committed" || (record.phase === "cancelled" && record.settledAt !== null)
              || instant(record.updatedAt) === null || instant(record.updatedAt)! >= instant(state.before)! || pageIds.has(record.executionId)) refuse("discovery_failed");
            const current = { updatedAt: record.updatedAt!, executionId: record.executionId };
            if (previous && compare(current, previous) <= 0) refuse("discovery_failed");
            previous = current;
            pageIds.add(record.executionId);
          }
          for (const record of batch) {
            if (counts.attempted >= maxAttempts) break;
            await renew();
            const input: RecoveryBeginInput = {
              intentId: deps.newId(), executionId: record.executionId, observedUpdatedAt: record.updatedAt!, observedPhase: record.phase,
              decision: !seen.has(record.executionId) && shouldAttempt(record, clock()).attempt ? "settle" : "skip",
            };
            if (!uuid(input.intentId)) refuse("invalid_request");
            const expected: RecoveryIntent = { ...input, memberId: record.memberId, orderId: record.orderId, requestKey: record.requestKey };
            stage = "begin_failed";
            adopt(await deps.store.begin(owner, state.fence, input), "begin", expected);
            seen.add(record.executionId);
            await resolvePending();
          }
          if (counts.attempted < maxAttempts && batch.length < pageSize) {
            await renew();
            stage = "exhaustion_failed";
            adopt(await deps.store.exhaust(owner, state.fence), "exhaust");
            exhausted = true;
            break;
          }
        }
        await release();
        return { ...counts, ok: true, status: exhausted ? "exhausted" : "bounded" };
      } catch (error) {
        const code = error instanceof OperationRefusal ? error.code : stage;
        let releaseFailed = false;
        if (state?.owner === owner) {
          try { await release(); } catch { releaseFailed = true; }
        }
        return { ...counts, ok: false, status: "failed", code, releaseFailed };
      }
    },
  };
}

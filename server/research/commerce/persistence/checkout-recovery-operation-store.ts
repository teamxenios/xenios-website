import {
  RECOVERY_OPERATION_AUTHORITY, RECOVERY_OPERATION_RPC,
  type RecoveryBeginInput, type RecoveryIntent, type RecoveryOperationState, type RecoveryOperationStore,
} from "../checkout-recovery-operation-contract";

type Action = "read" | "claim" | "renew" | "begin" | "complete" | "exhaust" | "release";
interface RpcArgs {
  p_action: Action;
  p_owner: string | null;
  p_fence: string | null;
  p_data: Record<string, unknown>;
}

/** A thenable matches the installed SDK without requiring its broader client authority. */
export interface RecoveryOperationRpcClient {
  rpc(name: string, args: RpcArgs): PromiseLike<{ data: unknown; error: unknown }>;
}

export class RecoveryOperationStoreError extends Error {
  constructor(readonly code: "recovery_request_invalid" | "recovery_rpc_failed" | "recovery_response_invalid") {
    super(code);
    this.name = "RecoveryOperationStoreError";
  }
}

const invalid = (): never => { throw new RecoveryOperationStoreError("recovery_request_invalid"); };
const malformed = (): never => { throw new RecoveryOperationStoreError("recovery_response_invalid"); };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const fence = (value: unknown): value is string => typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const PHASES = ["reserved", "authorizing", "action_required", "authorized", "capturing", "captured", "cancelling", "cancelled", "reconciliation_required"];
const CODES = ["settled_committed", "settled_cancelled", "left_pending", "contended", "needs_person", "vanished", "skipped", "attempt_failed"];
const BEGIN_KEYS = ["intentId", "executionId", "observedUpdatedAt", "observedPhase", "decision"];
const INTENT_KEYS = [...BEGIN_KEYS, "memberId", "orderId", "requestKey"];
const STATE_KEYS = ["schemaVersion", "owner", "fence", "leaseUntil", "cycleId", "before", "after", "exhausted", "pending"];

/** Validates SQL timestamp spelling/calendar and retains microseconds for ordering. */
function micros(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year! % 4 === 0 && (year! % 100 !== 0 || year! % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year! < 1 || month! < 1 || month! > 12 || day! < 1 || day! > days[month! - 1]! || hour! > 23 || minute! > 59 || second! > 59) return null;
  const zone = match[8]!;
  const digits = zone.slice(1).replace(":", "");
  // PostgreSQL permits displacement hours through 15; minutes remain 0..59.
  if (zone !== "Z" && (Number(digits.slice(0, 2)) > 15 || Number(digits.slice(2) || "00") > 59)) return null;
  const normalizedZone = zone === "Z" ? "Z" : `${zone[0]}${digits.slice(0, 2)}:${digits.slice(2) || "00"}`;
  const whole = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${normalizedZone}`);
  return Number.isFinite(whole) ? BigInt(whole) * 1000n + BigInt((match[7] ?? "").padEnd(6, "0")) : null;
}

function beginShape(value: Record<string, unknown>): boolean {
  return uuid(value.intentId) && uuid(value.executionId) && micros(value.observedUpdatedAt) !== null
    && typeof value.observedPhase === "string" && PHASES.includes(value.observedPhase)
    && (value.decision === "settle" || value.decision === "skip");
}
function parseState(value: unknown): RecoveryOperationState {
  if (!object(value) || !exactKeys(value, STATE_KEYS) || value.schemaVersion !== 1 || !fence(value.fence)
    || !uuid(value.cycleId) || typeof value.exhausted !== "boolean") return malformed();
  const before = micros(value.before);
  if (before === null || before % 1000n !== 0n) return malformed();
  if (value.owner === null ? value.leaseUntil !== null : !uuid(value.owner) || micros(value.leaseUntil) === null) return malformed();
  let after: RecoveryOperationState["after"] = null;
  if (value.after !== null) {
    if (!object(value.after) || !exactKeys(value.after, ["updatedAt", "executionId"]) || !uuid(value.after.executionId)
      || micros(value.after.updatedAt) === null || micros(value.after.updatedAt)! >= before) return malformed();
    after = { updatedAt: value.after.updatedAt as string, executionId: value.after.executionId };
  }
  let pending: RecoveryIntent | null = null;
  if (value.pending !== null) {
    const item = value.pending;
    if (!object(item) || !exactKeys(item, INTENT_KEYS) || !beginShape(item) || !uuid(item.memberId) || !uuid(item.orderId)
      || typeof item.requestKey !== "string" || [...item.requestKey].length < 8 || [...item.requestKey].length > 120
      || value.exhausted || micros(item.observedUpdatedAt)! >= before) return malformed();
    if (after) {
      const observed = micros(item.observedUpdatedAt)!;
      const cursorAt = micros(after.updatedAt)!;
      if (observed < cursorAt || (observed === cursorAt && (item.executionId as string) <= after.executionId)) return malformed();
    }
    pending = {
      intentId: item.intentId as string, executionId: item.executionId as string, memberId: item.memberId, orderId: item.orderId,
      requestKey: item.requestKey, observedUpdatedAt: item.observedUpdatedAt as string,
      observedPhase: item.observedPhase as RecoveryIntent["observedPhase"], decision: item.decision as RecoveryIntent["decision"],
    };
  }
  // Explicit copy isolates the caller from a later mutation of transport-owned data.
  return {
    schemaVersion: 1, owner: value.owner as string | null, fence: value.fence, leaseUntil: value.leaseUntil as string | null,
    cycleId: value.cycleId, before: value.before as string, after, exhausted: value.exhausted, pending,
  };
}

/** Injected RPC adapter only. Construction does not verify deployment or make any call. */
export function createSupabaseCheckoutRecoveryOperationStore(client: RecoveryOperationRpcClient): RecoveryOperationStore {
  if (!client || typeof client.rpc !== "function") invalid();

  async function call(action: Action, owner: string | null, token: string | null, data: Record<string, unknown> = {}): Promise<unknown> {
    if (action === "read" ? owner !== null || token !== null : !uuid(owner) || (action === "claim" ? token !== null : !fence(token))) invalid();
    let response: unknown;
    try {
      response = await client.rpc(RECOVERY_OPERATION_RPC, { p_action: action, p_owner: owner, p_fence: token, p_data: data });
    } catch {
      // Do not retain a cause, provider error, SQL text or transport URL.
      throw new RecoveryOperationStoreError("recovery_rpc_failed");
    }
    if (!object(response) || !Object.hasOwn(response, "data") || !Object.hasOwn(response, "error")) return malformed();
    if (response.error !== null) throw new RecoveryOperationStoreError("recovery_rpc_failed");
    return response.data;
  }
  function stateResponse(data: unknown, status: "read" | "acquired" | "ok"): RecoveryOperationState {
    if (!object(data) || !exactKeys(data, ["status", "state"]) || data.status !== status) return malformed();
    return parseState(data.state);
  }
  async function mutate(action: Exclude<Action, "read" | "claim">, owner: string, token: string, data?: Record<string, unknown>) {
    const state = stateResponse(await call(action, owner, token, data), "ok");
    // No historical transition inference here: the operation owns cycle/cursor
    // comparison. These are the immediate acknowledgement facts of this RPC.
    if (state.fence !== token || (action === "release" ? state.owner !== null || state.leaseUntil !== null : state.owner !== owner)) return malformed();
    if ((action === "begin" && state.pending === null) || (action === "complete" && state.pending !== null)
      || (action === "exhaust" && (!state.exhausted || state.pending !== null))) return malformed();
    return state;
  }
  return {
    authority: RECOVERY_OPERATION_AUTHORITY,
    durable: true,
    async read() {
      const data = await call("read", null, null);
      if (object(data) && exactKeys(data, ["status"]) && data.status === "absent") return null;
      return stateResponse(data, "read");
    },
    async claim(owner) {
      const data = await call("claim", owner, null);
      if (object(data) && exactKeys(data, ["status"]) && data.status === "busy") return { status: "busy" };
      const state = stateResponse(data, "acquired");
      if (state.owner !== owner) return malformed();
      return { status: "acquired", state };
    },
    renew: (owner, token) => mutate("renew", owner, token),
    async begin(owner, token, input: RecoveryBeginInput) {
      if (!object(input) || !exactKeys(input, BEGIN_KEYS) || !beginShape(input)) invalid();
      const data = {
        intentId: input.intentId, executionId: input.executionId, observedUpdatedAt: input.observedUpdatedAt,
        observedPhase: input.observedPhase, decision: input.decision,
      };
      return mutate("begin", owner, token, data);
    },
    async complete(owner, token, intentId, code) {
      if (!uuid(intentId) || typeof code !== "string" || !CODES.includes(code)) invalid();
      return mutate("complete", owner, token, { intentId, code });
    },
    exhaust: (owner, token) => mutate("exhaust", owner, token),
    release: (owner, token) => mutate("release", owner, token),
  };
}

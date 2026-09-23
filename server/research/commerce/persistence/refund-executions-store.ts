import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../supabase";
import {
  RefundExecutionConflict,
  type DurableRefundExecutionStore,
  type RefundExecutionIntent,
  type RefundExecutionRecord,
  type RefundExecutionState,
} from "../refund-executions";

const TABLE = "research_refund_executions";
const COLUMNS = "id, scope, claim_id, order_id, admin_id, payment_reference, amount_cents, currency, state, version, provider_refund_reference, first_attempted_at, created_at, updated_at, committed_at";
const UNIQUE_VIOLATION = "23505";
const STATES: readonly RefundExecutionState[] = ["prepared", "calling_provider", "provider_succeeded", "reconciliation_required", "committed"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const REFUND_EXECUTION_CAPABILITY = "durable_checkout_money_v2:20260923.1";

type Row = Record<string, unknown>;

function instantMicros(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value);
  if (!match) return null;
  const milliseconds = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${(match[7] ?? "").padEnd(3, "0").slice(0, 3)}Z`);
  if (!Number.isFinite(milliseconds)) return null;
  const canonical = new Date(milliseconds).toISOString().slice(0, 19);
  if (canonical !== `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`) return null;
  return BigInt(milliseconds) * 1000n + BigInt((match[7] ?? "").padEnd(6, "0").slice(3, 6) || "0");
}

export function refundExecutionRowToRecord(row: Row): RefundExecutionRecord | null {
  const amount = Number(row.amount_cents);
  const state = row.state as RefundExecutionState;
  const created = instantMicros(row.created_at);
  const updated = instantMicros(row.updated_at);
  const attempted = row.first_attempted_at === null ? null : instantMicros(row.first_attempted_at);
  const committed = row.committed_at === null ? null : instantMicros(row.committed_at);
  if (!UUID.test(String(row.id)) || !UUID.test(String(row.claim_id)) || !UUID.test(String(row.order_id)) ||
      typeof row.scope !== "string" || row.scope.length < 8 || row.scope.length > 200 || typeof row.admin_id !== "string" || row.admin_id.length === 0 ||
      typeof row.payment_reference !== "string" || !/^pi_[A-Za-z0-9_]+$/.test(row.payment_reference) ||
      !Number.isSafeInteger(amount) || amount <= 0 || row.currency !== "usd" ||
      !STATES.includes(state) || !Number.isSafeInteger(Number(row.version)) || Number(row.version) < 1 ||
      (row.provider_refund_reference !== null && (typeof row.provider_refund_reference !== "string" || !/^re_[A-Za-z0-9_]+$/.test(row.provider_refund_reference))) ||
      created === null || updated === null || updated < created ||
      (row.first_attempted_at !== null && attempted === null) || (attempted !== null && (attempted < created || attempted > updated)) ||
      (row.committed_at !== null && committed === null) || (committed !== null && (committed < created || committed > updated)) ||
      ((state === "prepared") !== (attempted === null)) ||
      ((state === "provider_succeeded" || state === "committed") !== (row.provider_refund_reference !== null)) ||
      ((state === "committed") !== (committed !== null))) return null;
  return {
    executionId: row.id as string,
    scope: row.scope,
    claimId: row.claim_id as string,
    orderId: row.order_id as string,
    adminId: row.admin_id,
    paymentReference: row.payment_reference,
    amountCents: amount,
    currency: "usd",
    state,
    version: Number(row.version),
    providerRefundReference: row.provider_refund_reference as string | null,
    firstAttemptedAt: row.first_attempted_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    committedAt: row.committed_at as string | null,
  };
}

function intentMatches(record: RefundExecutionRecord, intent: RefundExecutionIntent): boolean {
  return record.scope === intent.scope && record.claimId === intent.claimId && record.orderId === intent.orderId &&
    record.adminId === intent.adminId && record.paymentReference === intent.paymentReference &&
    record.amountCents === intent.amountCents && record.currency === intent.currency;
}

export function createSupabaseRefundExecutionStore(
  client: SupabaseClient = getSupabaseAdmin(),
): DurableRefundExecutionStore {
  const fail = (operation: string, message = "unknown") => new Error(`refund execution ${operation} failed: ${message}`);
  const map = (operation: string, data: unknown): RefundExecutionRecord | null => {
    const candidate = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data;
    if (candidate === null || typeof candidate !== "object") return null;
    const record = refundExecutionRowToRecord(candidate as Row);
    if (!record) throw fail(operation, "unavailable projection");
    return record;
  };
  const rpc = async (name: string, args: Row): Promise<RefundExecutionRecord | null> => {
    const result = await client.rpc(name, args);
    if (result.error) throw fail(name, result.error.message);
    return map(name, result.data);
  };
  return {
    authority: "durable_refund_execution_v1",
    async preflight() {
      try {
        const result = await client.rpc("research_checkout_money_capability");
        return result.error === null && result.data === REFUND_EXECUTION_CAPABILITY;
      } catch {
        return false;
      }
    },
    async getById(executionId) {
      const loaded = await client.from(TABLE).select(COLUMNS).eq("id", executionId).maybeSingle();
      if (loaded.error) throw fail("id lookup", loaded.error.message);
      return map("id lookup", loaded.data);
    },
    async getByScope(scope) {
      const loaded = await client.from(TABLE).select(COLUMNS).eq("scope", scope).maybeSingle();
      if (loaded.error) throw fail("scope lookup", loaded.error.message);
      return map("scope lookup", loaded.data);
    },
    async prepare(intent) {
      const prepared = await client.rpc("research_refund_execution_prepare", {
        p_execution_id: intent.executionId,
        p_scope: intent.scope,
        p_claim_id: intent.claimId,
        p_order_id: intent.orderId,
        p_admin_id: intent.adminId,
        p_payment_reference: intent.paymentReference,
        p_amount_cents: intent.amountCents,
        p_currency: intent.currency,
        p_created_at: intent.createdAt,
      });
      if (prepared.error) {
        if (prepared.error.code === UNIQUE_VIOLATION || prepared.error.code === "P0001") throw new RefundExecutionConflict();
        throw fail("prepare", prepared.error.message);
      }
      const record = map("prepare", prepared.data);
      if (!record || !intentMatches(record, intent)) throw new RefundExecutionConflict();
      return record;
    },
    claim(executionId, expectedVersion, attemptedAt) {
      return rpc("research_refund_execution_claim", {
        p_execution_id: executionId,
        p_expected_version: expectedVersion,
        p_attempted_at: attemptedAt.toISOString(),
      });
    },
    recordProvider(executionId, expectedVersion, refund) {
      return rpc("research_refund_execution_record_provider", {
        p_execution_id: executionId,
        p_expected_version: expectedVersion,
        p_refund_reference: refund.providerReference,
        p_payment_reference: refund.paymentReference,
        p_amount_cents: refund.refundedAmountCents,
        p_currency: refund.currency,
      });
    },
    requireReconciliation(executionId, expectedVersion) {
      return rpc("research_refund_execution_require_reconciliation", {
        p_execution_id: executionId,
        p_expected_version: expectedVersion,
      });
    },
    commit(executionId, expectedVersion) {
      return rpc("research_refund_execution_commit", {
        p_execution_id: executionId,
        p_expected_version: expectedVersion,
      });
    },
  };
}

export function refundExecutionAuthorityEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.RESEARCH_REFUND_EXECUTION_ENABLED === "true" && Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

// Production activation-payment commit boundary.
//
// The Supabase RPC performs every financial and membership effect in one
// Postgres transaction. A transport/RPC failure is reported as commit_failed;
// Postgres rolls the function invocation back, so the application never
// continues with the former sequence of independent REST writes.

import { getSupabaseAdmin } from "../../supabase";
import type {
  AtomicActivationCommitFn,
  AtomicActivationCommitResult,
} from "./activation";

type RpcClient = {
  rpc: (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

const SAFE_REFUSALS = new Set([
  "not_found",
  "already_verified",
  "illegal_transition",
  "validation_failed",
  "amount_mismatch",
  "method_mismatch",
  "not_permitted",
]);

function parseResult(data: unknown): AtomicActivationCommitResult {
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) {
    const code = typeof row.code === "string" && SAFE_REFUSALS.has(row.code)
      ? row.code
      : "commit_failed";
    return { ok: false, code: code as Extract<AtomicActivationCommitResult, { ok: false }>["code"] };
  }
  const required = [
    "obligation_id",
    "period_id",
    "renewal_obligation_id",
    "receipt_id",
    "ledger_entry_id",
    "effective_at",
  ] as const;
  if (required.some((key) => typeof row[key] !== "string" || (row[key] as string).length === 0)) {
    return { ok: false, code: "commit_state_uncertain" };
  }
  return {
    ok: true,
    replayed: row.replayed === true,
    obligationId: row.obligation_id as string,
    periodId: row.period_id as string,
    renewalObligationId: row.renewal_obligation_id as string,
    receiptId: row.receipt_id as string,
    ledgerEntryId: row.ledger_entry_id as string,
    effectiveAt: row.effective_at as string,
  };
}

export function createSupabaseActivationCommit(client?: RpcClient): AtomicActivationCommitFn {
  return async (input) => {
    const db = client ?? (getSupabaseAdmin() as unknown as RpcClient);
    try {
      const { data, error } = await db.rpc("research_fm_activation_verify_commit", {
        p_obligation_id: input.obligationId,
        p_idempotency_key: input.idempotencyKey,
        p_admin_id: input.admin.adminId,
        p_admin_role: input.admin.role,
        p_amount_received_cents: input.fields.amountReceivedCents,
        p_date_received: input.fields.dateReceived,
        p_receiving_destination_ref: input.fields.receivingDestinationRef,
        p_method_id: input.fields.methodId,
        p_external_ref: input.fields.externalRef,
        p_reconciliation_date: input.fields.reconciliationDate,
        p_note: input.fields.note,
        p_confirmed_received: input.fields.confirmedReceived,
        p_verified_at: input.verifiedAt,
        p_renewal_human_ref: input.renewalHumanRef,
        p_renewal_agreements: input.renewalAgreements,
        p_ip_hash: input.ipHash,
        p_user_agent_hash: input.userAgentHash,
      });
      if (error) {
        console.error(
          "[founding-activation] atomic verification RPC failed:",
          error.code ?? "database_error",
        );
        // PostgREST can surface a gateway/transport failure through `error`
        // after the request reached PostgreSQL. Never claim rollback unless a
        // structured RPC refusal did so; require a queue reload/reconciliation.
        return { ok: false, code: "commit_state_uncertain" };
      }
      return parseResult(data);
    } catch {
      console.error("[founding-activation] atomic verification RPC failed: transport_error");
      return { ok: false, code: "commit_state_uncertain" };
    }
  };
}

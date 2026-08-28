import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "../../../supabase";
import type {
  RefundCommand,
  RefundCommandOutcome,
  RefundCommandResult,
  RefundCommandState,
  RefundCommandStore,
} from "../refunds";

/** Exact runtime-to-candidate binding. A same-name or older RPC is not authority. */
export const RESEARCH_COMMERCE_REFUND_COMMAND_CAPABILITY =
  "research_commerce_refund_command/v1" as const;

export const RESEARCH_COMMERCE_REFUND_COMMAND_RPC =
  "research_commerce_refund_command_v1" as const;

type RefundCommandAction = "prepare" | "claim_provider" | "record_outcome" | "complete";

interface RefundCommandRpcError {
  code?: string;
  message?: string;
}

export interface RefundCommandRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RefundCommandRpcError | null }>;
}

interface RefundCommandRpcArgs extends Record<string, unknown> {
  p_action: RefundCommandAction;
  p_claim_id: string | null;
  p_admin_id: string | null;
  p_amount_cents: number | null;
  p_client_idempotency_key: string | null;
  p_provider_name: string | null;
  p_command_id: string | null;
  p_provider_idempotency_key: string | null;
  p_attempt: number | null;
  p_provider_outcome: string | null;
  p_failure_code: string | null;
  p_provider_refund_reference: string | null;
  p_provider_refunded_cents: number | null;
  p_as_of: string;
}

const COMMAND_STATES = new Set<RefundCommandState>([
  "prepared",
  "provider_in_flight",
  "provider_retryable",
  "reconciliation_required",
  "terminal_refused",
  "applied",
]);

const OUTCOMES = new Set<RefundCommandOutcome>([
  "ready",
  "execute",
  "applied",
  "safe_retryable",
  "terminal_refused",
  "reconciliation_required",
  "refund_pending",
  "order_not_found",
  "order_state_invalid",
  "payment_failed",
  "idempotency_conflict",
  "capability_disabled",
]);

const COMMAND_KEYS = [
  "amountCents",
  "attempt",
  "claimId",
  "clientIdempotencyKey",
  "commandId",
  "memberId",
  "orderId",
  "paymentReference",
  "providerIdempotencyKey",
  "providerName",
  "state",
] as const;

function bounded(value: unknown, max = 255): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function exactCommand(value: unknown): RefundCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const command = value as Record<string, unknown>;
  if (Object.keys(command).sort().join("|") !== [...COMMAND_KEYS].sort().join("|")) return null;
  if (
    !bounded(command.commandId) ||
    !bounded(command.claimId) ||
    !bounded(command.orderId) ||
    !bounded(command.memberId) ||
    !bounded(command.clientIdempotencyKey) ||
    !bounded(command.providerIdempotencyKey) ||
    !bounded(command.providerName, 80) ||
    !bounded(command.paymentReference) ||
    !Number.isSafeInteger(command.amountCents) ||
    (command.amountCents as number) <= 0 ||
    !Number.isSafeInteger(command.attempt) ||
    (command.attempt as number) < 0 ||
    typeof command.state !== "string" ||
    !COMMAND_STATES.has(command.state as RefundCommandState)
  ) {
    return null;
  }
  return command as unknown as RefundCommand;
}

function exactResult(
  value: unknown,
  action: RefundCommandAction,
): RefundCommandResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  if (
    Object.keys(envelope).sort().join("|") !== "action|capability|command|outcome" ||
    envelope.capability !== RESEARCH_COMMERCE_REFUND_COMMAND_CAPABILITY ||
    envelope.action !== action ||
    typeof envelope.outcome !== "string" ||
    !OUTCOMES.has(envelope.outcome as RefundCommandOutcome)
  ) {
    return null;
  }
  if (envelope.command === null) {
    return { outcome: envelope.outcome as RefundCommandOutcome };
  }
  const command = exactCommand(envelope.command);
  return command ? { outcome: envelope.outcome as RefundCommandOutcome, command } : null;
}

function absentCandidate(error: RefundCommandRpcError): boolean {
  return new Set(["PGRST202", "42883", "42P01", "42703"]).has(error.code ?? "");
}

function baseArgs(action: RefundCommandAction, asOf: Date): RefundCommandRpcArgs {
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new Error("invalid refund command timestamp");
  }
  return {
    p_action: action,
    p_claim_id: null,
    p_admin_id: null,
    p_amount_cents: null,
    p_client_idempotency_key: null,
    p_provider_name: null,
    p_command_id: null,
    p_provider_idempotency_key: null,
    p_attempt: null,
    p_provider_outcome: null,
    p_failure_code: null,
    p_provider_refund_reference: null,
    p_provider_refunded_cents: null,
    p_as_of: asOf.toISOString(),
  };
}

export function createSupabaseRefundCommandStore(
  client: RefundCommandRpcClient = getSupabaseAdmin() as unknown as RefundCommandRpcClient,
): RefundCommandStore {
  async function call(action: RefundCommandAction, args: RefundCommandRpcArgs): Promise<RefundCommandResult> {
    const response = await client.rpc(RESEARCH_COMMERCE_REFUND_COMMAND_RPC, args);
    if (response.error) {
      if (absentCandidate(response.error)) return { outcome: "capability_disabled" };
      throw new Error(`refund command RPC failed: ${response.error.code ?? "dependency_unavailable"}`);
    }
    return exactResult(response.data, action) ?? { outcome: "capability_disabled" };
  }

  return {
    prepare(input) {
      if (
        !bounded(input.claimId) ||
        !bounded(input.adminId) ||
        !bounded(input.clientIdempotencyKey) ||
        !bounded(input.providerName, 80) ||
        !Number.isSafeInteger(input.amountCents) ||
        input.amountCents <= 0
      ) {
        return Promise.resolve({ outcome: "idempotency_conflict" });
      }
      return call("prepare", {
        ...baseArgs("prepare", input.asOf),
        p_claim_id: input.claimId,
        p_admin_id: input.adminId,
        p_amount_cents: input.amountCents,
        p_client_idempotency_key: input.clientIdempotencyKey,
        p_provider_name: input.providerName,
      });
    },

    claimProviderExecution(input) {
      if (!bounded(input.commandId) || !bounded(input.providerIdempotencyKey)) {
        return Promise.resolve({ outcome: "idempotency_conflict" });
      }
      return call("claim_provider", {
        ...baseArgs("claim_provider", input.asOf),
        p_command_id: input.commandId,
        p_provider_idempotency_key: input.providerIdempotencyKey,
      });
    },

    recordProviderOutcome(input) {
      if (
        !bounded(input.commandId) ||
        !bounded(input.providerIdempotencyKey) ||
        !Number.isSafeInteger(input.attempt) ||
        input.attempt <= 0 ||
        (input.providerRefundReference !== null && !bounded(input.providerRefundReference)) ||
        (input.providerRefundedAmountCents !== null &&
          (!Number.isSafeInteger(input.providerRefundedAmountCents) || input.providerRefundedAmountCents <= 0))
      ) {
        return Promise.resolve({ outcome: "idempotency_conflict" });
      }
      return call("record_outcome", {
        ...baseArgs("record_outcome", input.asOf),
        p_command_id: input.commandId,
        p_provider_idempotency_key: input.providerIdempotencyKey,
        p_attempt: input.attempt,
        p_provider_outcome: input.outcome,
        p_failure_code: input.failureCode,
        p_provider_refund_reference: input.providerRefundReference,
        p_provider_refunded_cents: input.providerRefundedAmountCents,
      });
    },

    complete(input) {
      if (
        !bounded(input.commandId) ||
        !bounded(input.providerIdempotencyKey) ||
        !bounded(input.providerRefundReference) ||
        !Number.isSafeInteger(input.attempt) ||
        input.attempt <= 0 ||
        !Number.isSafeInteger(input.providerRefundedAmountCents) ||
        input.providerRefundedAmountCents <= 0
      ) {
        return Promise.resolve({ outcome: "idempotency_conflict" });
      }
      return call("complete", {
        ...baseArgs("complete", input.asOf),
        p_command_id: input.commandId,
        p_provider_idempotency_key: input.providerIdempotencyKey,
        p_attempt: input.attempt,
        p_provider_refund_reference: input.providerRefundReference,
        p_provider_refunded_cents: input.providerRefundedAmountCents,
      });
    },
  };
}

/**
 * Opt-in is exact and off by default. The candidate lives outside the applied
 * migration DAG, and every response must repeat the same capability id.
 */
export function resolveSupabaseRefundCommandStore(
  env: NodeJS.ProcessEnv = process.env,
  client?: SupabaseClient,
): RefundCommandStore | undefined {
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    env.RESEARCH_COMMERCE_REFUND_COMMAND_CAPABILITY !==
      RESEARCH_COMMERCE_REFUND_COMMAND_CAPABILITY
  ) {
    return undefined;
  }
  return createSupabaseRefundCommandStore(
    client as unknown as RefundCommandRpcClient | undefined,
  );
}

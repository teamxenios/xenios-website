import { getSupabaseAdmin } from "../../../supabase";
import {
  CHECKOUT_SAGA_PROTOCOL,
  checkoutSha256,
  unavailableCheckoutSagaStore,
  type CheckoutSagaCommand,
  type CheckoutSagaMutationResult,
  type CheckoutSagaReadResult,
  type CheckoutSagaSnapshot,
  type CheckoutSagaState,
  type CheckoutSagaStore,
} from "../checkout-saga";

/**
 * Deliberately tiny structural type. Checkout uses service-role-only RPCs and
 * never mutates the private saga tables through PostgREST table endpoints.
 */
export interface CheckoutSagaRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

const STATES = new Set<CheckoutSagaState>([
  "authorization_pending",
  "authorization_reconciliation_pending",
  "capture_pending",
  "capture_reconciliation_pending",
  "cancellation_pending",
  "cancellation_reconciliation_pending",
  "completed",
  "rejected",
]);

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item === "")) return null;
  return [...value];
}

function commandOf(value: unknown): CheckoutSagaCommand | null {
  const row = object(value);
  if (
    !row ||
    row.protocol !== CHECKOUT_SAGA_PROTOCOL ||
    typeof row.commandId !== "string" ||
    typeof row.orderId !== "string" ||
    typeof row.memberId !== "string" ||
    typeof row.checkoutIdempotencyKey !== "string" ||
    typeof row.checkoutIdempotencyKeyHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(row.checkoutIdempotencyKeyHash) ||
    typeof row.providerAuthorizationKey !== "string" ||
    typeof row.providerCaptureKey !== "string" ||
    typeof row.providerCancellationKey !== "string" ||
    typeof row.placedAt !== "string" ||
    !object(row.request) ||
    !object(row.activation) ||
    !object(row.cart) ||
    !object(row.shippingQuote) ||
    !object(row.totals) ||
    !Array.isArray(row.reviewTriggers)
  ) return null;
  const totals = row.totals as Record<string, unknown>;
  if (
    totals.currency !== "usd" ||
    !safeInteger(totals.subtotalCents) ||
    !safeInteger(totals.shippingCents) ||
    !safeInteger(totals.storeCreditAppliedCents) ||
    !safeInteger(totals.totalCents) ||
    totals.totalCents <= 0 ||
    totals.totalCents !== totals.subtotalCents + totals.shippingCents - totals.storeCreditAppliedCents
  ) return null;
  return row as unknown as CheckoutSagaCommand;
}

function coherentOrder(
  value: unknown,
  command: CheckoutSagaCommand,
  reservations: readonly string[],
  providerReference: string | null,
  capturedAmountCents: number | null,
): value is NonNullable<CheckoutSagaSnapshot["order"]> {
  const order = object(value);
  return Boolean(
    order &&
    order.orderId === command.orderId &&
    order.memberId === command.memberId &&
    order.state === "payment_captured" &&
    order.placedAt === command.placedAt &&
    order.subtotalCents === command.totals.subtotalCents &&
    order.shippingCents === command.totals.shippingCents &&
    order.storeCreditAppliedCents === command.totals.storeCreditAppliedCents &&
    order.totalCents === command.totals.totalCents &&
    order.paymentReference === providerReference &&
    order.captured === true &&
    order.idempotencyKey === command.checkoutIdempotencyKey &&
    capturedAmountCents === command.totals.totalCents &&
    Array.isArray(order.lines) &&
    Array.isArray(order.shipmentGroups) &&
    Array.isArray(order.reviewTriggers) &&
    Array.isArray(order.reservationIds) &&
    JSON.stringify(order.reservationIds) === JSON.stringify(reservations)
  );
}

function snapshotOf(value: unknown): CheckoutSagaSnapshot | null {
  const row = object(value);
  if (!row) return null;
  const command = commandOf(row.command);
  const reservations = strings(row.reservationIds);
  if (
    !command ||
    typeof row.commandDigest !== "string" ||
    row.commandDigest !== `sha256:${checkoutSha256(command)}` ||
    typeof row.state !== "string" ||
    !STATES.has(row.state as CheckoutSagaState) ||
    !reservations ||
    (row.providerReference !== null && typeof row.providerReference !== "string") ||
    (row.authorizedAmountCents !== null && !safeInteger(row.authorizedAmountCents)) ||
    (row.capturedAmountCents !== null && !safeInteger(row.capturedAmountCents)) ||
    (row.lastReconciliationPhase !== null &&
      row.lastReconciliationPhase !== "authorization" &&
      row.lastReconciliationPhase !== "capture" &&
      row.lastReconciliationPhase !== "cancellation") ||
    (row.order !== null && !object(row.order))
  ) return null;
  if (
    (row.state === "completed" && !coherentOrder(
      row.order,
      command,
      reservations,
      row.providerReference as string | null,
      row.capturedAmountCents as number | null,
    )) ||
    (row.state !== "completed" && row.order !== null) ||
    (row.state === "completed" && row.authorizedAmountCents !== command.totals.totalCents) ||
    (row.state === "rejected" && row.capturedAmountCents !== null)
  ) return null;
  return {
    command,
    commandDigest: row.commandDigest,
    state: row.state as CheckoutSagaState,
    reservationIds: reservations,
    providerReference: row.providerReference as string | null,
    authorizedAmountCents: row.authorizedAmountCents as number | null,
    capturedAmountCents: row.capturedAmountCents as number | null,
    order: row.order as CheckoutSagaSnapshot["order"],
    lastReconciliationPhase: row.lastReconciliationPhase as CheckoutSagaSnapshot["lastReconciliationPhase"],
  };
}

const STORE_CODES = new Set([
  "capability_unavailable",
  "not_found",
  "idempotency_conflict",
  "command_invalid",
  "activation_unavailable",
  "inventory_unavailable",
  "credit_unavailable",
  "state_conflict",
]);

function mutationOf(data: unknown): CheckoutSagaMutationResult {
  const envelope = object(data);
  if (!envelope) return { ok: false, code: "capability_unavailable" };
  if (envelope.ok === true) {
    const snapshot = snapshotOf(envelope.snapshot);
    if (!snapshot || typeof envelope.idempotent !== "boolean") {
      return { ok: false, code: "capability_unavailable" };
    }
    return { ok: true, snapshot, idempotent: envelope.idempotent };
  }
  if (envelope.ok !== false || typeof envelope.code !== "string" || !STORE_CODES.has(envelope.code)) {
    return { ok: false, code: "capability_unavailable" };
  }
  const refusals = envelope.reservationRefusals === undefined
    ? undefined
    : strings(envelope.reservationRefusals);
  if (envelope.reservationRefusals !== undefined && !refusals) {
    return { ok: false, code: "capability_unavailable" };
  }
  return {
    ok: false,
    code: envelope.code as Exclude<CheckoutSagaMutationResult, { ok: true }>["code"],
    ...(refusals ? { reservationRefusals: refusals as Exclude<CheckoutSagaMutationResult, { ok: true }>["reservationRefusals"] } : {}),
  };
}

async function rpc(
  client: CheckoutSagaRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  try {
    const response = await client.rpc(name, args);
    return response.error ? null : response.data;
  } catch {
    return null;
  }
}

/** Service-role RPC adapter. Any malformed/error response fails unavailable. */
export function createSupabaseCheckoutSagaStore(client: CheckoutSagaRpcClient): CheckoutSagaStore {
  const mutate = async (name: string, args: Record<string, unknown>): Promise<CheckoutSagaMutationResult> => {
    const data = await rpc(client, name, args);
    return data === null ? { ok: false, code: "capability_unavailable" } : mutationOf(data);
  };
  return {
    async find(memberId, checkoutIdempotencyKeyHash): Promise<CheckoutSagaReadResult> {
      const data = await rpc(client, "research_checkout_command_find_v1", {
        p_member_id: memberId,
        p_checkout_idempotency_key_hash: checkoutIdempotencyKeyHash,
      });
      if (data === null) return { ok: false, code: "capability_unavailable" };
      const envelope = object(data);
      if (!envelope || envelope.ok !== true) return { ok: false, code: "capability_unavailable" };
      if (envelope.snapshot === null) return { ok: true, snapshot: null };
      const snapshot = snapshotOf(envelope.snapshot);
      return snapshot ? { ok: true, snapshot } : { ok: false, code: "capability_unavailable" };
    },
    begin: (command) => mutate("research_checkout_command_begin_v1", { p_command: command }),
    recordAuthorization: (input) => mutate("research_checkout_command_record_authorization_v1", {
      p_command_id: input.commandId,
      p_provider_reference: input.providerReference,
      p_authorized_amount_cents: input.authorizedAmountCents,
      p_at: input.at,
    }),
    markReconciliation: (input) => mutate("research_checkout_command_mark_reconciliation_v1", {
      p_command_id: input.commandId,
      p_phase: input.phase,
      p_provider_reference: input.providerReference,
      p_provider_code: input.providerCode,
      p_at: input.at,
    }),
    markCancellationPending: (input) => mutate("research_checkout_command_mark_cancellation_pending_v1", {
      p_command_id: input.commandId,
      p_provider_reference: input.providerReference,
      p_at: input.at,
    }),
    completeCaptured: (input) => mutate("research_checkout_command_complete_v1", {
      p_command_id: input.commandId,
      p_provider_reference: input.providerReference,
      p_captured_amount_cents: input.capturedAmountCents,
      p_at: input.at,
    }),
    compensate: (input) => mutate("research_checkout_command_compensate_v1", {
      p_command_id: input.commandId,
      p_at: input.at,
      p_reason: input.reason,
    }),
  };
}

/**
 * Candidate protocol is opt-in and defaults OFF. It remains unavailable unless
 * both the explicit flag and service-role database configuration are present.
 */
export function resolveCheckoutSagaStore(
  env: NodeJS.ProcessEnv = process.env,
  client?: CheckoutSagaRpcClient,
): CheckoutSagaStore {
  if (
    env.RESEARCH_CHECKOUT_ATOMIC_SAGA_ENABLED !== "true" ||
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY
  ) return unavailableCheckoutSagaStore;
  return createSupabaseCheckoutSagaStore(client ?? (getSupabaseAdmin() as unknown as CheckoutSagaRpcClient));
}

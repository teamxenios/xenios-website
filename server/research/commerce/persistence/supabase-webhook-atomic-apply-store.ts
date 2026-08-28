import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderState } from "@shared/research/commerce";

import { getSupabaseAdmin } from "../../../supabase";
import type {
  WebhookAtomicApplyResult,
  WebhookAtomicApplyStore,
  WebhookAtomicEvent,
  WebhookAtomicIntent,
} from "../webhooks";

/**
 * This exact value binds runtime wiring to the reviewed SQL contract. Merely
 * having a similarly named function or an older response shape is not enough
 * to turn webhook mutation on.
 */
export const RESEARCH_COMMERCE_WEBHOOK_ATOMIC_APPLY_CAPABILITY =
  "research_commerce_webhook_atomic_apply/v1" as const;

export const RESEARCH_COMMERCE_WEBHOOK_ATOMIC_APPLY_RPC =
  "research_commerce_webhook_claim_and_apply_v1" as const;

const ATOMIC_TARGET_STATES: ReadonlySet<OrderState> = new Set<OrderState>([
  "payment_authorized",
  "payment_captured",
  "refunded",
  "exception",
  "fulfilled",
  "delivered",
]);

const ATOMIC_OUTCOMES: ReadonlySet<WebhookAtomicApplyResult["outcome"]> = new Set<
  WebhookAtomicApplyResult["outcome"]
>([
  "applied",
  "acknowledged",
  "duplicate",
  "conflict",
  "unknown_order",
  "retryable",
  "capability_disabled",
]);

interface AtomicRpcError {
  code?: string;
  message?: string;
}

export interface WebhookAtomicRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: AtomicRpcError | null }>;
}

export interface WebhookAtomicRpcArgs extends Record<string, unknown> {
  p_provider_name: string;
  p_event_id: string;
  p_event_type: string;
  p_payload_sha256: string;
  p_received_at: string;
  p_order_id: string | null;
  p_intent_kind: "acknowledge" | "transition";
  p_target_state: OrderState | null;
  p_provider_confirmation: string | null;
  p_shipment_status: string | null;
  p_tracking_number: string | null;
  p_carrier: string | null;
}

function validBoundedText(value: string, max: number): boolean {
  return value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}

/** The one closed RPC argument projection; no raw body or signature crosses it. */
export function webhookAtomicRpcArgs(
  event: WebhookAtomicEvent,
  intent: WebhookAtomicIntent,
): WebhookAtomicRpcArgs {
  if (
    !validBoundedText(event.providerName, 80) ||
    !validBoundedText(event.eventId, 255) ||
    !validBoundedText(event.eventType, 160) ||
    !/^[0-9a-f]{64}$/.test(event.payloadSha256) ||
    !(event.receivedAt instanceof Date) ||
    !Number.isFinite(event.receivedAt.getTime())
  ) {
    throw new Error("invalid webhook atomic event");
  }

  if (intent.kind === "acknowledge") {
    if (event.orderId !== null) {
      throw new Error("acknowledged webhook event must not address an order");
    }
    return {
      p_provider_name: event.providerName,
      p_event_id: event.eventId,
      p_event_type: event.eventType,
      p_payload_sha256: event.payloadSha256,
      p_received_at: event.receivedAt.toISOString(),
      p_order_id: null,
      p_intent_kind: "acknowledge",
      p_target_state: null,
      p_provider_confirmation: null,
      p_shipment_status: null,
      p_tracking_number: null,
      p_carrier: null,
    };
  }

  if (
    event.orderId === null ||
    intent.orderId !== event.orderId ||
    !validBoundedText(intent.orderId, 255) ||
    !ATOMIC_TARGET_STATES.has(intent.to) ||
    (intent.providerConfirmation !== null &&
      !validBoundedText(intent.providerConfirmation, 255))
  ) {
    throw new Error("invalid webhook atomic transition intent");
  }

  const shipment = intent.shipmentUpdate;
  if (
    shipment &&
    (!validBoundedText(shipment.status, 80) ||
      (shipment.trackingNumber !== null &&
        !validBoundedText(shipment.trackingNumber, 160)) ||
      (shipment.carrier !== null && !validBoundedText(shipment.carrier, 120)))
  ) {
    throw new Error("invalid webhook atomic shipment intent");
  }

  return {
    p_provider_name: event.providerName,
    p_event_id: event.eventId,
    p_event_type: event.eventType,
    p_payload_sha256: event.payloadSha256,
    p_received_at: event.receivedAt.toISOString(),
    p_order_id: intent.orderId,
    p_intent_kind: "transition",
    p_target_state: intent.to,
    p_provider_confirmation: intent.providerConfirmation,
    p_shipment_status: shipment?.status ?? null,
    p_tracking_number: shipment?.trackingNumber ?? null,
    p_carrier: shipment?.carrier ?? null,
  };
}

function missingExactCapability(error: AtomicRpcError): boolean {
  return new Set(["PGRST202", "42883", "42P01", "42703"]).has(error.code ?? "");
}

function exactResult(
  data: unknown,
  event: WebhookAtomicEvent,
): WebhookAtomicApplyResult | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const result = data as Record<string, unknown>;
  if (
    Object.keys(result).length !== 5 ||
    result.capability !== RESEARCH_COMMERCE_WEBHOOK_ATOMIC_APPLY_CAPABILITY ||
    result.providerName !== event.providerName ||
    result.eventId !== event.eventId ||
    result.payloadSha256 !== event.payloadSha256 ||
    typeof result.outcome !== "string" ||
    !ATOMIC_OUTCOMES.has(result.outcome as WebhookAtomicApplyResult["outcome"])
  ) {
    return null;
  }
  return { outcome: result.outcome as WebhookAtomicApplyResult["outcome"] };
}

export function createSupabaseWebhookAtomicApplyStore(
  client: WebhookAtomicRpcClient = getSupabaseAdmin() as unknown as WebhookAtomicRpcClient,
): WebhookAtomicApplyStore {
  return {
    async claimAndApply(event, intent) {
      const response = await client.rpc(
        RESEARCH_COMMERCE_WEBHOOK_ATOMIC_APPLY_RPC,
        webhookAtomicRpcArgs(event, intent),
      );
      if (response.error) {
        if (missingExactCapability(response.error)) {
          return { outcome: "capability_disabled" };
        }
        throw new Error(
          `webhook atomic apply failed: ${response.error.code ?? "dependency_unavailable"}`,
        );
      }

      // A missing, older, or otherwise ambiguous function response is not the
      // exact reviewed capability. Refuse it instead of interpreting by shape.
      return exactResult(response.data, event) ?? { outcome: "capability_disabled" };
    },
  };
}

/**
 * Production opt-in requires both ordinary Supabase configuration and the exact
 * reviewed capability id. The candidate SQL is unapplied and this variable is
 * unset by default, so current production remains retryably capability-disabled.
 * Even after opt-in, the RPC response must attest the same id on every call.
 */
export function resolveSupabaseWebhookAtomicApplyStore(
  env: NodeJS.ProcessEnv = process.env,
  client?: SupabaseClient,
): WebhookAtomicApplyStore | undefined {
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    env.RESEARCH_COMMERCE_WEBHOOK_ATOMIC_APPLY_CAPABILITY !==
      RESEARCH_COMMERCE_WEBHOOK_ATOMIC_APPLY_CAPABILITY
  ) {
    return undefined;
  }
  return createSupabaseWebhookAtomicApplyStore(
    client as unknown as WebhookAtomicRpcClient | undefined,
  );
}

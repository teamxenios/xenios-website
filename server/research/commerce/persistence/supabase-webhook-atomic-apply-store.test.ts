import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { WebhookAtomicApplyResult, WebhookAtomicEvent } from "../webhooks";
import {
  createSupabaseWebhookAtomicApplyStore,
  RESEARCH_COMMERCE_WEBHOOK_ATOMIC_APPLY_CAPABILITY,
  RESEARCH_COMMERCE_WEBHOOK_ATOMIC_APPLY_RPC,
  resolveSupabaseWebhookAtomicApplyStore,
  webhookAtomicRpcArgs,
  type WebhookAtomicRpcClient,
} from "./supabase-webhook-atomic-apply-store";

const EVENT: WebhookAtomicEvent = {
  providerName: "stripe",
  eventId: "evt_atomic_1",
  eventType: "payment.captured",
  payloadSha256: "a".repeat(64),
  receivedAt: new Date("2026-08-28T08:00:00.000Z"),
  orderId: "4c5ac7d0-c506-49cb-9a27-72545d197d21",
};

const INTENT = {
  kind: "transition" as const,
  orderId: EVENT.orderId!,
  to: "payment_captured" as const,
  providerConfirmation: "pi_confirmed_1",
};

function attested(outcome: WebhookAtomicApplyResult["outcome"]): Record<string, unknown> {
  return {
    capability: RESEARCH_COMMERCE_WEBHOOK_ATOMIC_APPLY_CAPABILITY,
    providerName: EVENT.providerName,
    eventId: EVENT.eventId,
    payloadSha256: EVENT.payloadSha256,
    outcome,
  };
}

function clientReturning(data: unknown, error: { code?: string; message?: string } | null = null) {
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data, error }));
  return { client: { rpc } as WebhookAtomicRpcClient, rpc };
}

describe("the Supabase webhook atomic-apply adapter", () => {
  it("sends the closed verified-fact projection to the exact v1 RPC", async () => {
    const { client, rpc } = clientReturning(attested("applied"));
    const store = createSupabaseWebhookAtomicApplyStore(client);

    await expect(store.claimAndApply(EVENT, INTENT)).resolves.toEqual({ outcome: "applied" });
    expect(rpc).toHaveBeenCalledWith(RESEARCH_COMMERCE_WEBHOOK_ATOMIC_APPLY_RPC, {
      p_provider_name: "stripe",
      p_event_id: "evt_atomic_1",
      p_event_type: "payment.captured",
      p_payload_sha256: "a".repeat(64),
      p_received_at: "2026-08-28T08:00:00.000Z",
      p_order_id: "4c5ac7d0-c506-49cb-9a27-72545d197d21",
      p_intent_kind: "transition",
      p_target_state: "payment_captured",
      p_provider_confirmation: "pi_confirmed_1",
      p_shipment_status: null,
      p_tracking_number: null,
      p_carrier: null,
    });
    const sent = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("rawBody");
    expect(sent).not.toHaveProperty("signature");
  });

  it.each([
    "acknowledged",
    "duplicate",
    "conflict",
    "unknown_order",
    "retryable",
    "capability_disabled",
  ] as const)("preserves the attested %s outcome", async (outcome) => {
    const { client } = clientReturning(attested(outcome));
    await expect(
      createSupabaseWebhookAtomicApplyStore(client).claimAndApply(EVENT, INTENT),
    ).resolves.toEqual({ outcome });
  });

  it("projects an acknowledgement with no order or mutation fields", () => {
    const event = { ...EVENT, eventType: "payment.future", orderId: null };
    expect(webhookAtomicRpcArgs(event, { kind: "acknowledge" })).toMatchObject({
      p_order_id: null,
      p_intent_kind: "acknowledge",
      p_target_state: null,
      p_provider_confirmation: null,
      p_shipment_status: null,
    });
  });

  it("projects verified shipment facts without inventing missing tracking data", () => {
    expect(
      webhookAtomicRpcArgs(
        { ...EVENT, providerName: "mitch", eventType: "delivered" },
        {
          kind: "transition",
          orderId: EVENT.orderId!,
          to: "delivered",
          providerConfirmation: null,
          shipmentUpdate: { status: "delivered", trackingNumber: null, carrier: "ups" },
        },
      ),
    ).toMatchObject({
      p_shipment_status: "delivered",
      p_tracking_number: null,
      p_carrier: "ups",
    });
  });

  it.each(["PGRST202", "42883", "42P01", "42703"])(
    "treats absent or incomplete candidate schema %s as capability_disabled",
    async (code) => {
      const { client } = clientReturning(null, { code, message: "schema detail omitted" });
      await expect(
        createSupabaseWebhookAtomicApplyStore(client).claimAndApply(EVENT, INTENT),
      ).resolves.toEqual({ outcome: "capability_disabled" });
    },
  );

  it("refuses a similarly shaped but unattested response", async () => {
    const { client } = clientReturning({ ...attested("applied"), capability: "older/v0" });
    await expect(
      createSupabaseWebhookAtomicApplyStore(client).claimAndApply(EVENT, INTENT),
    ).resolves.toEqual({ outcome: "capability_disabled" });
  });

  it("refuses an attestation with unreviewed extra fields", async () => {
    const { client } = clientReturning({ ...attested("applied"), detail: "unexpected" });
    await expect(
      createSupabaseWebhookAtomicApplyStore(client).claimAndApply(EVENT, INTENT),
    ).resolves.toEqual({ outcome: "capability_disabled" });
  });

  it("throws a sanitized retryable dependency error without claiming success", async () => {
    const { client } = clientReturning(null, { code: "57014", message: "statement timeout with details" });
    await expect(
      createSupabaseWebhookAtomicApplyStore(client).claimAndApply(EVENT, INTENT),
    ).rejects.toThrow("webhook atomic apply failed: 57014");
  });

  it("rejects a cross-order intent before calling the database", async () => {
    const { client, rpc } = clientReturning(attested("applied"));
    await expect(
      createSupabaseWebhookAtomicApplyStore(client).claimAndApply(EVENT, {
        ...INTENT,
        orderId: "a-different-order",
      }),
    ).rejects.toThrow("invalid webhook atomic transition intent");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("production webhook atomic capability resolution", () => {
  const configured = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-only-placeholder",
  };

  it("stays absent when the exact capability id is unset or mismatched", () => {
    expect(resolveSupabaseWebhookAtomicApplyStore(configured)).toBeUndefined();
    expect(
      resolveSupabaseWebhookAtomicApplyStore({
        ...configured,
        RESEARCH_COMMERCE_WEBHOOK_ATOMIC_APPLY_CAPABILITY: "research_commerce_webhook_atomic_apply/v0",
      }),
    ).toBeUndefined();
  });

  it("constructs only for the exact configured capability and still requires RPC attestation", async () => {
    const { client } = clientReturning(attested("applied"));
    const resolved = resolveSupabaseWebhookAtomicApplyStore(
      {
        ...configured,
        RESEARCH_COMMERCE_WEBHOOK_ATOMIC_APPLY_CAPABILITY:
          RESEARCH_COMMERCE_WEBHOOK_ATOMIC_APPLY_CAPABILITY,
      },
      client as unknown as SupabaseClient,
    );
    expect(resolved).toBeDefined();
    await expect(resolved!.claimAndApply(EVENT, INTENT)).resolves.toEqual({ outcome: "applied" });
  });
});

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { RefundCommand, RefundCommandOutcome } from "../refunds";
import {
  createSupabaseRefundCommandStore,
  RESEARCH_COMMERCE_REFUND_COMMAND_CAPABILITY,
  RESEARCH_COMMERCE_REFUND_COMMAND_RPC,
  resolveSupabaseRefundCommandStore,
  type RefundCommandRpcClient,
} from "./supabase-refund-command-store";

const AS_OF = new Date("2026-08-28T09:00:00.000Z");
const COMMAND: RefundCommand = {
  commandId: "refund_command_0123456789abcdef0123456789abcdef",
  claimId: "11111111-1111-4111-8111-111111111111",
  orderId: "22222222-2222-4222-8222-222222222222",
  memberId: "33333333-3333-4333-8333-333333333333",
  clientIdempotencyKey: "admin-request-1",
  providerIdempotencyKey: `xrrf_v1_${"a".repeat(64)}`,
  providerName: "stripe",
  paymentReference: "pi_captured_1",
  amountCents: 1250,
  state: "prepared",
  attempt: 0,
};

function envelope(
  action: "prepare" | "claim_provider" | "record_outcome" | "complete",
  outcome: RefundCommandOutcome,
  command: RefundCommand | null = COMMAND,
): Record<string, unknown> {
  return {
    capability: RESEARCH_COMMERCE_REFUND_COMMAND_CAPABILITY,
    action,
    outcome,
    command,
  };
}

function clientReturning(data: unknown, error: { code?: string; message?: string } | null = null) {
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data, error }));
  return { client: { rpc } as RefundCommandRpcClient, rpc };
}

describe("Supabase durable refund command adapter", () => {
  it("sends the closed prepare projection to the exact v1 RPC", async () => {
    const { client, rpc } = clientReturning(envelope("prepare", "ready"));
    const store = createSupabaseRefundCommandStore(client);
    await expect(
      store.prepare({
        claimId: COMMAND.claimId,
        adminId: "admin_1",
        amountCents: COMMAND.amountCents,
        clientIdempotencyKey: COMMAND.clientIdempotencyKey,
        providerName: "stripe",
        asOf: AS_OF,
      }),
    ).resolves.toEqual({ outcome: "ready", command: COMMAND });
    expect(rpc).toHaveBeenCalledWith(RESEARCH_COMMERCE_REFUND_COMMAND_RPC, {
      p_action: "prepare",
      p_claim_id: COMMAND.claimId,
      p_admin_id: "admin_1",
      p_amount_cents: 1250,
      p_client_idempotency_key: "admin-request-1",
      p_provider_name: "stripe",
      p_command_id: null,
      p_provider_idempotency_key: null,
      p_attempt: null,
      p_provider_outcome: null,
      p_failure_code: null,
      p_provider_refund_reference: null,
      p_provider_refunded_cents: null,
      p_as_of: AS_OF.toISOString(),
    });
  });

  it("uses only the durable command identity to claim provider execution", async () => {
    const executing = { ...COMMAND, state: "provider_in_flight" as const, attempt: 1 };
    const { client, rpc } = clientReturning(envelope("claim_provider", "execute", executing));
    const result = await createSupabaseRefundCommandStore(client).claimProviderExecution({
      commandId: COMMAND.commandId,
      providerIdempotencyKey: COMMAND.providerIdempotencyKey,
      asOf: AS_OF,
    });
    expect(result).toEqual({ outcome: "execute", command: executing });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_action: "claim_provider",
      p_command_id: COMMAND.commandId,
      p_provider_idempotency_key: COMMAND.providerIdempotencyKey,
      p_claim_id: null,
      p_client_idempotency_key: null,
    });
  });

  it.each(["PGRST202", "42883", "42P01", "42703"])(
    "keeps refunds capability-disabled when candidate schema is absent (%s)",
    async (code) => {
      const { client } = clientReturning(null, { code, message: "details omitted" });
      await expect(
        createSupabaseRefundCommandStore(client).prepare({
          claimId: COMMAND.claimId,
          adminId: "admin_1",
          amountCents: 1250,
          clientIdempotencyKey: "key_1",
          providerName: "stripe",
          asOf: AS_OF,
        }),
      ).resolves.toEqual({ outcome: "capability_disabled" });
    },
  );

  it("refuses a similarly shaped response without exact capability attestation", async () => {
    const { client } = clientReturning({
      ...envelope("prepare", "ready"),
      capability: "research_commerce_refund_command/v0",
    });
    await expect(
      createSupabaseRefundCommandStore(client).prepare({
        claimId: COMMAND.claimId,
        adminId: "admin_1",
        amountCents: 1250,
        clientIdempotencyKey: "key_1",
        providerName: "stripe",
        asOf: AS_OF,
      }),
    ).resolves.toEqual({ outcome: "capability_disabled" });
  });

  it("refuses an attested envelope or command with unreviewed extra fields", async () => {
    const extraEnvelope = { ...envelope("prepare", "ready"), detail: "unexpected" };
    const extraCommand = envelope("prepare", "ready", { ...COMMAND, secret: "no" } as RefundCommand);
    for (const data of [extraEnvelope, extraCommand]) {
      const { client } = clientReturning(data);
      await expect(
        createSupabaseRefundCommandStore(client).prepare({
          claimId: COMMAND.claimId,
          adminId: "admin_1",
          amountCents: 1250,
          clientIdempotencyKey: "key_1",
          providerName: "stripe",
          asOf: AS_OF,
        }),
      ).resolves.toEqual({ outcome: "capability_disabled" });
    }
  });

  it("does not leak database messages in a dependency exception", async () => {
    const { client } = clientReturning(null, { code: "57014", message: "secret row detail" });
    await expect(
      createSupabaseRefundCommandStore(client).claimProviderExecution({
        commandId: COMMAND.commandId,
        providerIdempotencyKey: COMMAND.providerIdempotencyKey,
        asOf: AS_OF,
      }),
    ).rejects.toThrow("refund command RPC failed: 57014");
  });
});

describe("production refund command capability resolution", () => {
  const configured = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-only-placeholder",
  };

  it("is absent unless the exact reviewed capability id is configured", () => {
    expect(resolveSupabaseRefundCommandStore(configured)).toBeUndefined();
    expect(
      resolveSupabaseRefundCommandStore({
        ...configured,
        RESEARCH_COMMERCE_REFUND_COMMAND_CAPABILITY: "research_commerce_refund_command/v0",
      }),
    ).toBeUndefined();
  });

  it("constructs for the exact opt-in but still requires every RPC response to attest", async () => {
    const { client } = clientReturning(envelope("prepare", "ready"));
    const store = resolveSupabaseRefundCommandStore(
      {
        ...configured,
        RESEARCH_COMMERCE_REFUND_COMMAND_CAPABILITY:
          RESEARCH_COMMERCE_REFUND_COMMAND_CAPABILITY,
      },
      client as unknown as SupabaseClient,
    );
    expect(store).toBeDefined();
    await expect(
      store!.prepare({
        claimId: COMMAND.claimId,
        adminId: "admin_1",
        amountCents: 1250,
        clientIdempotencyKey: "key_1",
        providerName: "stripe",
        asOf: AS_OF,
      }),
    ).resolves.toMatchObject({ outcome: "ready" });
  });
});

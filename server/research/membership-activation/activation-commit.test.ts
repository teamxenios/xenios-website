import { describe, expect, it, vi } from "vitest";
import { createSupabaseActivationCommit } from "./activation-commit";
import type { AtomicActivationCommitInput } from "./activation";

const input: AtomicActivationCommitInput = {
  admin: { adminId: "admin-test", role: "owner", ip: null, userAgent: null },
  obligationId: "11111111-1111-4111-8111-111111111111",
  fields: {
    amountReceivedCents: 5000,
    dateReceived: "2026-07-24",
    receivingDestinationRef: "checked-destination",
    methodId: "cashapp-test",
    externalRef: null,
    reconciliationDate: "2026-07-24",
    note: null,
    confirmedReceived: true,
  },
  idempotencyKey: "verify-once",
  verifiedAt: "2026-07-24T18:30:00.000Z",
  renewalHumanRef: "XRM-ABCDEFGH",
  renewalAgreements: { capturedAt: "2026-07-24T18:30:00.000Z", agreements: [] },
  ipHash: "a".repeat(64),
  userAgentHash: "b".repeat(64),
};

describe("createSupabaseActivationCommit", () => {
  it("sends the exact scalar schema to the single atomic RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        replayed: false,
        obligation_id: input.obligationId,
        period_id: "22222222-2222-4222-8222-222222222222",
        renewal_obligation_id: "33333333-3333-4333-8333-333333333333",
        receipt_id: "44444444-4444-4444-8444-444444444444",
        ledger_entry_id: "55555555-5555-4555-8555-555555555555",
        effective_at: input.verifiedAt,
      },
      error: null,
    }));
    const result = await createSupabaseActivationCommit({ rpc })(input);

    expect(result).toMatchObject({ ok: true, replayed: false, obligationId: input.obligationId });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "research_fm_activation_verify_commit",
      expect.objectContaining({
        p_obligation_id: input.obligationId,
        p_amount_received_cents: 5000,
        p_date_received: "2026-07-24",
        p_reconciliation_date: "2026-07-24",
        p_confirmed_received: true,
        p_method_id: "cashapp-test",
        p_idempotency_key: "verify-once",
      }),
    );
  });

  it("treats an error envelope as uncertain because it may represent a lost response", async () => {
    const result = await createSupabaseActivationCommit({
      rpc: async () => ({
        data: null,
        error: { code: "23505", message: "private database detail" },
      }),
    })(input);
    expect(result).toEqual({ ok: false, code: "commit_state_uncertain" });
  });

  it("preserves safe refusal codes and rejects malformed success payloads", async () => {
    const refused = await createSupabaseActivationCommit({
      rpc: async () => ({ data: { ok: false, code: "amount_mismatch" }, error: null }),
    })(input);
    expect(refused).toEqual({ ok: false, code: "amount_mismatch" });

    const malformed = await createSupabaseActivationCommit({
      rpc: async () => ({ data: { ok: true }, error: null }),
    })(input);
    expect(malformed).toEqual({ ok: false, code: "commit_state_uncertain" });
  });

  it("treats a transport loss as uncertain so the UI requires a reload", async () => {
    const result = await createSupabaseActivationCommit({
      rpc: async () => {
        throw new Error("connection lost after request");
      },
    })(input);
    expect(result).toEqual({ ok: false, code: "commit_state_uncertain" });
  });
});

import { describe, expect, it } from "vitest";
import { SupabaseEarlyAccessCartStore } from "./supabase-store";

function queryReturning(value: unknown, calls: { fn: string; args: Record<string, unknown> }[]) {
  return async (call: { fn: string; args: Record<string, unknown> }) => {
    calls.push(call);
    return value;
  };
}

describe("Supabase Early Access cart store", () => {
  it("issues the exact durable quote-read RPC", async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const store = new SupabaseEarlyAccessCartStore(queryReturning(null, calls) as never);
    expect(await store.get("xeaq_1234567890123456")).toBeNull();
    expect(calls).toEqual([{ fn: "research_early_access_cart_quote_record", args: { p_quote_id: "xeaq_1234567890123456" } }]);
  });

  it("issues the settlement RPC with no browser-supplied actor substitution", async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const settlement = {
      cartCheckoutNumber: "XEC-0123456789ABCDEF",
      externalTransactionId: "txn-1",
      reviewedEvidenceRef: "eaext.1234567890123456",
      verifiedAmountCents: 100,
      verifiedCurrency: "USD",
      settledAt: "2026-08-08T00:00:00.000Z",
      settledBy: "admin@example.com",
      receipt: {},
      childReleases: [],
    };
    const store = new SupabaseEarlyAccessCartStore(queryReturning({ committed: true, settlement }, calls) as never);
    const result = await store.commitSettlement({
      checkout: { cartCheckoutNumber: "XEC-0123456789ABCDEF" } as never,
      evidenceRef: "eaext.1234567890123456",
      externalTransactionId: "txn-1",
      verifiedAmountCents: 100,
      verifiedCurrency: "USD",
      actorId: "admin@example.com",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
      at: "2026-08-08T00:00:00.000Z",
    });
    expect(result.committed).toBe(true);
    expect(calls[0]?.fn).toBe("research_early_access_commit_cart_settlement");
    expect(calls[0]?.args).toEqual({
      p_checkout_number: "XEC-0123456789ABCDEF",
      p_external_transaction_id: "txn-1",
      p_evidence_ref: "eaext.1234567890123456",
      p_verified_amount_cents: 100,
      p_verified_currency: "USD",
      p_actor_id: "admin@example.com",
      p_confirmed_funds_received: true,
      p_confirmed_amount_and_reference: true,
      p_at: "2026-08-08T00:00:00.000Z",
    });
  });

  it("preserves M62 current-package refusals from the authoritative RPC", async () => {
    const store = new SupabaseEarlyAccessCartStore(async () => ({
      committed: false,
      reason: "agreements_not_current",
      settlement: null,
    }));
    await expect(store.commitSettlement({
      checkout: { cartCheckoutNumber: "XEC-0123456789ABCDEF" } as never,
      evidenceRef: "eaext.1234567890123456",
      externalTransactionId: "txn-1",
      verifiedAmountCents: 100,
      verifiedCurrency: "USD",
      actorId: "admin@example.com",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
      at: "2026-08-08T00:00:00.000Z",
    })).resolves.toEqual({
      committed: false,
      reason: "agreements_not_current",
      settlement: null,
    });
  });
});

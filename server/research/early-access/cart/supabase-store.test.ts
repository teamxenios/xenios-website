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

  it("issues the candidate settlement-with-commission RPC with the accrual attached", async () => {
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
    const commission = {
      accrualId: "early-access-commission-accrual:XEC-0123456789ABCDEF",
      orderReference: "XEC-0123456789ABCDEF",
      commissionPolicyId: "xenios-subtotal-less-discount",
      commissionPolicyVersion: "v",
      basis: "subtotal_less_discount",
      commissionBasisCents: 47_760,
      commissionRate: 1_500,
      commissionAmountCents: 7_164,
      currency: "USD",
      affiliateId: "aff_partner_7",
      affiliateCustomerRef: "eac_" + "f".repeat(32),
      referralCode: "XEN-PARTNER-7",
      verificationIdempotencyKey: "xea-cart-settlement:XEC-0123456789ABCDEF",
      accruedAt: "2026-08-08T00:00:00.000Z",
      payout: false,
    };
    const store = new SupabaseEarlyAccessCartStore(queryReturning({ committed: true, settlement }, calls) as never);
    const result = await store.commitSettlementWithCommission({
      checkout: { cartCheckoutNumber: "XEC-0123456789ABCDEF" } as never,
      evidenceRef: "eaext.1234567890123456",
      externalTransactionId: "txn-1",
      canonicalTransactionId: "TXN1",
      verifiedAmountCents: 100,
      verifiedCurrency: "USD",
      actorId: "admin@example.com",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
      at: "2026-08-08T00:00:00.000Z",
      commission: commission as never,
    });
    expect(result.committed).toBe(true);
    // The candidate function's name and argument names, pinned byte for byte,
    // so the code path and the founder-gated SQL cannot drift apart silently.
    expect(calls[0]?.fn).toBe("research_early_access_commit_cart_settlement_with_commission");
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
      p_commission: commission,
    });
  });

  it("an absent candidate RPC surfaces as the named opaque failure, writing nothing", async () => {
    // Until the founder applies the candidate SQL, PostgREST answers 404 for
    // the function and the driver throws. The store must surface the named
    // opaque error — a refusal — never a settlement that quietly lost its
    // commission.
    const store = new SupabaseEarlyAccessCartStore(async () => {
      throw new Error("PGRST202: function not found");
    });
    await expect(
      store.commitSettlementWithCommission({
        checkout: { cartCheckoutNumber: "XEC-0123456789ABCDEF" } as never,
        evidenceRef: "eaext.1234567890123456",
        externalTransactionId: "txn-1",
        canonicalTransactionId: "TXN1",
        verifiedAmountCents: 100,
        verifiedCurrency: "USD",
        actorId: "admin@example.com",
        confirmedFundsReceived: true,
        confirmedAmountAndReference: true,
        at: "2026-08-08T00:00:00.000Z",
        commission: {} as never,
      }),
    ).rejects.toThrow(
      "early-access persistence call failed: research_early_access_commit_cart_settlement_with_commission",
    );
  });

  it("preserves the RPC's commission_invalid refusal, which settles nothing", async () => {
    const store = new SupabaseEarlyAccessCartStore(async () => ({
      committed: false,
      reason: "commission_invalid",
      settlement: null,
    }));
    await expect(
      store.commitSettlementWithCommission({
        checkout: { cartCheckoutNumber: "XEC-0123456789ABCDEF" } as never,
        evidenceRef: "eaext.1234567890123456",
        externalTransactionId: "txn-1",
        canonicalTransactionId: "TXN1",
        verifiedAmountCents: 100,
        verifiedCurrency: "USD",
        actorId: "admin@example.com",
        confirmedFundsReceived: true,
        confirmedAmountAndReference: true,
        at: "2026-08-08T00:00:00.000Z",
        commission: {} as never,
      }),
    ).resolves.toEqual({ committed: false, reason: "commission_invalid", settlement: null });
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

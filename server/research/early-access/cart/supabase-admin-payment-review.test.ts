import { describe, expect, it } from "vitest";
import { SupabaseEarlyAccessAdminPaymentReviewStore } from "./supabase-admin-payment-review";

describe("Supabase founder payment review projections", () => {
  it("compares the active attestation to the current package", async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const store = new SupabaseEarlyAccessAdminPaymentReviewStore(async (call) => {
      calls.push(call);
      if (call.fn === "research_early_access_current_agreement_package") {
        return { packageVersion: "ea-legal-v2" };
      }
      return { packageVersion: "ea-legal-v2" };
    });

    await expect(store.forCheckout("XEC-0123456789ABCDEF")).resolves.toEqual({
      satisfied: true,
      packageVersion: "ea-legal-v2",
    });
    expect(calls).toEqual([
      { fn: "research_early_access_current_agreement_package", args: {} },
      { fn: "research_early_access_active_agreement_attestation", args: { p_checkout_number: "XEC-0123456789ABCDEF" } },
    ]);
  });
});

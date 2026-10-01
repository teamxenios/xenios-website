import { describe, expect, it, vi } from "vitest";
import { SupabaseAssistedOrderRepository } from "./supabase-repository";

describe("provider settlement and separate fulfillment repository boundary", () => {
  it("keeps the historical financial projection unchanged when fulfillment is held", async () => {
    const rpc = vi.fn(async (name: string) => name === "research_assisted_order_financial_state"
      ? { data: { hasObservation: true, paymentVerified: true }, error: null }
      : { data: null, error: { code: "P0001", details: "ASSISTED_ORDER_PROVIDER_FULFILLMENT_HELD",
        message: "synthetic-private-provider-account-and-event" } });
    const repository = new SupabaseAssistedOrderRepository({ rpc });
    expect(await repository.getFinancialState("a0000000-0000-4000-8000-000000000001"))
      .toEqual({ hasObservation: true, paymentVerified: true });
    const pending = repository.updateStatus({
      requestId: "a0000000-0000-4000-8000-000000000001", fromStatus: "paid", toStatus: "supplier_processing",
      actorId: "synthetic-admin", actorType: "admin", customerMessage: null, internalNote: null,
      evidence: {}, occurredAt: "2026-10-01T12:00:00.000Z",
    });
    await expect(pending).rejects.toMatchObject({ name: "AssistedOrderConflictError",
      code: "provider_fulfillment_on_hold",
      message: "Payment verification is recorded, but fulfillment remains on hold while provider activity is reviewed." });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "research_assisted_order_financial_state", "research_assisted_order_set_status",
    ]);
  });
});

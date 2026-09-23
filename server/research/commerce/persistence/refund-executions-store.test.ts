import { describe, expect, it, vi } from "vitest";
import { createSupabaseRefundExecutionStore, REFUND_EXECUTION_CAPABILITY, refundExecutionRowToRecord } from "./refund-executions-store";

const row = {
  id: "00000000-0000-4000-8000-000000000001",
  scope: "xr-refund-v1-abcdef",
  claim_id: "00000000-0000-4000-8000-000000000002",
  order_id: "00000000-0000-4000-8000-000000000003",
  admin_id: "admin-1",
  payment_reference: "pi_12345678",
  amount_cents: 12000,
  currency: "usd",
  state: "calling_provider",
  version: 2,
  provider_refund_reference: null,
  first_attempted_at: "2026-09-21T12:00:01.123456Z",
  created_at: "2026-09-21T12:00:00.000000Z",
  updated_at: "2026-09-21T12:00:01.123456Z",
  committed_at: null,
};

describe("refund execution managed projection", () => {
  it("accepts only the exact complete checkout-money managed capability", async () => {
    const exactRpc = vi.fn(async () => ({ data: REFUND_EXECUTION_CAPABILITY, error: null }));
    const exact = createSupabaseRefundExecutionStore({ rpc: exactRpc } as never);
    await expect(exact.preflight()).resolves.toBe(true);
    expect(exactRpc).toHaveBeenCalledWith("research_checkout_money_capability");
    for (const result of [
      { data: "durable_refund_execution_v1", error: null },
      { data: null, error: null },
      { data: REFUND_EXECUTION_CAPABILITY, error: { message: "RPC missing" } },
    ]) {
      const store = createSupabaseRefundExecutionStore({ rpc: async () => result } as never);
      await expect(store.preflight()).resolves.toBe(false);
    }
    const throwing = createSupabaseRefundExecutionStore({ rpc: async () => { throw new Error("offline"); } } as never);
    await expect(throwing.preflight()).resolves.toBe(false);
  });
  it("accepts the complete canonical calling-provider row", () => {
    expect(refundExecutionRowToRecord(row)).toMatchObject({ state: "calling_provider", version: 2, amountCents: 12000 });
  });

  it.each([
    ["uuid version", { id: "00000000-0000-0000-0000-000000000001" }],
    ["noncanonical instant", { updated_at: "September 21 2026" }],
    ["time reversal", { updated_at: "2026-09-21T11:59:59.000000Z" }],
    ["calling without first attempt", { first_attempted_at: null }],
    ["prepared with first attempt", { state: "prepared" }],
    ["success without evidence", { state: "provider_succeeded" }],
    ["evidence before success", { provider_refund_reference: "re_12345678" }],
    ["committed without stamp", { state: "committed", provider_refund_reference: "re_12345678" }],
    ["stamp before commit", { committed_at: "2026-09-21T12:00:01.123456Z" }],
  ])("drops a corrupted PostgREST projection: %s", (_case, corruption) => {
    expect(refundExecutionRowToRecord({ ...row, ...corruption })).toBeNull();
  });

  it("accepts only a fully bound committed projection", () => {
    expect(refundExecutionRowToRecord({
      ...row,
      state: "committed",
      version: 4,
      provider_refund_reference: "re_12345678",
      committed_at: "2026-09-21T12:00:01.123456Z",
    })).toMatchObject({ state: "committed", providerRefundReference: "re_12345678" });
  });
});

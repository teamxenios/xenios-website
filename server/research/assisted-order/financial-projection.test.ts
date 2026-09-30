import { describe, expect, it, vi } from "vitest";
import { SupabaseAssistedOrderRepository } from "./supabase-repository";

const requestId = "10000000-0000-4000-8000-000000000011";
const reference = "XRR-20260930-ABCDEF0011";
const authorization = { publicReference: reference, memberId: "member", earlyAccessSessionHash: null, statusTokenHash: null };
const view = { requestId, publicReference: reference, status: "paid", createdAt: "2026-09-30T12:00:00Z",
  updatedAt: "2026-09-30T12:00:00Z", estimatedTotalCents: 5000, currency: "USD",
  lines: [], timeline: [], documents: [], actionRequired: null, trackingReference: null,
  paymentVerified: true };
const ok = (data: unknown) => ({ data, error: null });

describe("assisted status financial projection", () => {
  it("does not query evidence before owner authorization", async () => {
    const rpc = vi.fn().mockResolvedValue(ok(null));
    expect(await new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization)).toBeNull();
    expect(rpc).toHaveBeenCalledOnce();
  });
  it.each([null, { hasObservation: false, paymentVerified: false }, { hasObservation: true, paymentVerified: false }])(
    "does not trust paid labels or raw status-response flags", async (financial) => {
      const rpc = vi.fn().mockResolvedValueOnce(ok(view)).mockResolvedValueOnce(ok(financial));
      expect((await new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization))?.paymentVerified).toBe(false);
      expect(rpc).toHaveBeenLastCalledWith("research_assisted_order_financial_state", { p_request_id: requestId });
    });
  it("requires a consistent canonical verified record", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(ok(view)).mockResolvedValueOnce(ok({ hasObservation: true, paymentVerified: true }));
    expect((await new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization))?.paymentVerified).toBe(true);
  });
  it.each([{}, { paymentVerified: true }, { hasObservation: false, paymentVerified: true }, { hasObservation: true, paymentVerified: "true" }])(
    "refuses malformed financial projections", async (financial) => {
      const rpc = vi.fn().mockResolvedValueOnce(ok(view)).mockResolvedValueOnce(ok(financial));
      await expect(new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization)).rejects.toThrow("Financial state projection unavailable");
    });
  it("keeps missing pending schema neutral but does not hide other database faults", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(ok(view)).mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    expect((await new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization))?.paymentVerified).toBe(false);
    rpc.mockResolvedValueOnce(ok(view)).mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    await expect(new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization)).rejects.toThrow();
  });
  it("maps guarded financial cancellation refusals to a conflict", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", details: "ASSISTED_ORDER_REFUND_AUTHORITY_NOT_READY" } });
    await expect(new SupabaseAssistedOrderRepository({ rpc }).updateStatus({ requestId,
      fromStatus: "supplier_processing", toStatus: "cancelled", actorId: "synthetic", actorType: "admin",
      customerMessage: null, internalNote: null, evidence: { cancellationReason: "Request" }, occurredAt: "2026-09-30T12:00:00Z",
    })).rejects.toMatchObject({ code: "financial_resolution_required" });
  });
});

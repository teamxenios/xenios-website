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
  it("retains durable payment verification after the order advances past paid", async () => {
    const progressed = { ...view, status: "supplier_processing", timeline: [
      { status: "paid", occurredAt: view.updatedAt, customerMessage: "Historical payment message" },
    ] };
    const rpc = vi.fn().mockResolvedValueOnce(ok(progressed))
      .mockResolvedValueOnce(ok({ hasObservation: true, paymentVerified: true }));
    const result = await new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization);
    expect(result?.paymentVerified).toBe(true);
    expect(result?.status).toBe("supplier_processing");
    expect(result?.timeline).toEqual(progressed.timeline);
    expect(rpc).toHaveBeenLastCalledWith("research_assisted_order_financial_state", { p_request_id: requestId });
  });
  it.each(["supplier_processing", "shipped", "delivered", "closed", "cancelled", "reviewing"])(
    "uses durable evidence for a historical paid event while current status is %s", async (status) => {
      const progressed = { ...view, status, timeline: [
        { status: "paid", occurredAt: view.updatedAt, customerMessage: "Historical payment message" },
      ] };
      for (const paymentVerified of [true, false]) {
        const rpc = vi.fn().mockResolvedValueOnce(ok(progressed))
          .mockResolvedValueOnce(ok({ hasObservation: true, paymentVerified }));
        const result = await new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization);
        expect(result?.paymentVerified).toBe(paymentVerified);
        expect(result?.status).toBe(status);
        expect(result?.timeline).toEqual(progressed.timeline);
        expect(rpc).toHaveBeenCalledTimes(2);
      }
    });
  it.each(["supplier_processing", "shipped", "delivered"])(
    "reads evidence for %s even when the projected timeline omits paid", async (status) => {
      const rpc = vi.fn().mockResolvedValueOnce(ok({ ...view, status }))
        .mockResolvedValueOnce(ok({ hasObservation: true, paymentVerified: true }));
      expect((await new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization))?.paymentVerified).toBe(true);
      expect(rpc).toHaveBeenCalledTimes(2);
    });
  it.each(["submitted", "reviewing", "payment_pending", "payment_review", "closed", "cancelled"])(
    "does not trust unsolicited flags or read evidence for %s without a paid event", async (status) => {
      const rpc = vi.fn().mockResolvedValueOnce(ok({ ...view, status }));
      expect((await new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization))?.paymentVerified).toBeUndefined();
      expect(rpc).toHaveBeenCalledOnce();
    });
  it("waits for owner authorization and rejects a wrong-reference result before reading evidence", async () => {
    let resolve!: (value: ReturnType<typeof ok>) => void;
    const rpc = vi.fn().mockReturnValueOnce(new Promise<ReturnType<typeof ok>>((done) => { resolve = done; }));
    const result = new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization);
    expect(rpc).toHaveBeenCalledOnce();
    resolve(ok({ ...view, status: "shipped", publicReference: "XRR-20260930-ABCDEF0022" }));
    await expect(result).rejects.toThrow("Status reference mismatch");
    expect(rpc).toHaveBeenCalledOnce();
  });
  it("keeps later historical paid records neutral without evidence and fails closed on evidence errors", async () => {
    const progressed = { ...view, status: "delivered" };
    for (const financial of [ok(null), ok({ hasObservation: false, paymentVerified: false }),
      { data: null, error: { code: "PGRST202" } }]) {
      const rpc = vi.fn().mockResolvedValueOnce(ok(progressed)).mockResolvedValueOnce(financial);
      expect((await new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization))?.paymentVerified).toBe(false);
    }
    const rpc = vi.fn().mockResolvedValueOnce(ok(progressed)).mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization)).rejects.toThrow();
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
  it("holds writes with a controlled conflict when the financial authority is not installed", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    await expect(new SupabaseAssistedOrderRepository({ rpc }).getFinancialState(requestId))
      .rejects.toMatchObject({ code: "payment_verification_not_ready" });
    expect(rpc).toHaveBeenCalledOnce();
  });
});

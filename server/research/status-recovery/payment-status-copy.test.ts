import { describe, expect, it, vi } from "vitest";
import { assistedOrderPaymentStatusCopy } from "../../../shared/research/assisted-order/payment-status-copy";
import { buildStatusRecoveryView } from "./status-copy";
import { SupabaseStatusRecoveryStore } from "./supabase-store";

const reference = "XRR-20260930-ABCDEF1234";
const now = "2026-09-30T23:00:00Z";
const paid = { publicReference: reference, status: "paid", updatedAt: now, timeline: [
  { status: "paid", occurredAt: now, customerMessage: "Old unsupported paid and fulfillment promise" },
] };
const response = (data: unknown, error: null | { code?: string; message?: string } = null) => ({ data, error });

describe("evidence-bound common customer payment copy", () => {
  it.each([undefined, false, "true", 1, null])("does not upgrade a paid label using %s", (flag) => {
    const common = assistedOrderPaymentStatusCopy("paid", flag as boolean | undefined)!;
    expect(common.label).toBe("Payment record under review");
    const view = buildStatusRecoveryView({ reference, status: "paid", updatedAt: now, timeline: paid.timeline,
      paymentVerified: flag as boolean | undefined });
    expect(view.statusLabel).toBe(common.label);
    expect(view.whatHappened).toBe(common.happened);
    expect(view.nextStep).toBe(common.nextStep);
    expect(view.timeline[0]).toEqual({ status: common.label, occurredAt: now, customerMessage: common.line });
    expect(JSON.stringify(view)).not.toMatch(/Old unsupported|Payment verified|coordinate fulfillment/);
  });

  it("shows verified only with true authority and keeps fulfillment eligibility separate", () => {
    const view = buildStatusRecoveryView({ reference, status: "paid", updatedAt: now, timeline: paid.timeline, paymentVerified: true });
    const common = assistedOrderPaymentStatusCopy("paid", true)!;
    expect(view.statusLabel).toBe("Payment verified");
    expect(view.whatHappened).toBe(common.happened);
    expect(view.nextStep).toContain("fulfillment eligibility separately");
    expect(view.timeline[0].customerMessage).toBe(common.line);
    expect(JSON.stringify(view)).not.toContain("Old unsupported");
  });

  it.each(["payment_pending", "payment_review"])("uses the common neutral %s guidance even with an unrelated true flag", (status) => {
    const view = buildStatusRecoveryView({ reference, status, updatedAt: now, timeline: [], paymentVerified: true });
    const common = assistedOrderPaymentStatusCopy(status)!;
    expect(view.statusLabel).toBe(common.label);
    expect(view.whatHappened).toBe(common.happened);
    expect(view.nextStep).toBe(common.nextStep);
    expect(JSON.stringify(view)).not.toMatch(/Payment verified|payment instructions sent/);
  });

  it("preserves nonfinancial status messages and stored timeline objects", () => {
    const timeline = [{ status: "reviewing", occurredAt: now, customerMessage: "Your request is being reviewed." }];
    const view = buildStatusRecoveryView({ reference, status: "reviewing", updatedAt: now, timeline });
    expect(view.statusLabel).toBe("In review");
    expect(view.timeline).toEqual(timeline);
    expect(view.timeline[0]).not.toBe(timeline[0]);
    expect(paid.timeline[0].customerMessage).toBe("Old unsupported paid and fulfillment promise");
  });
});

describe("P-17 financial projection occurs only after subject authorization", () => {
  it("retains durable payment verification after the order advances past paid", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(response({ ...paid, status: "supplier_processing" }))
      .mockResolvedValueOnce(response({ hasObservation: true, paymentVerified: true }));
    const view = await new SupabaseStatusRecoveryStore({ rpc }).getStatus("session-digest", now);
    expect(view?.statusLabel).toBe("Processing");
    expect(view?.timeline[0].status).toBe("Payment verified");
    expect(view?.timeline[0].customerMessage).toBe(assistedOrderPaymentStatusCopy("paid", true)?.line);
    expect(rpc).toHaveBeenNthCalledWith(2, "research_assisted_order_financial_state_by_reference", { p_public_reference: reference });
  });

  it("waits for the owner status result, then binds the financial read to its returned reference", async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    const statusPromise = new Promise<ReturnType<typeof response>>((done) => { resolve = done; });
    const rpc = vi.fn().mockReturnValueOnce(statusPromise).mockResolvedValueOnce(response({ hasObservation: true, paymentVerified: true }));
    const result = new SupabaseStatusRecoveryStore({ rpc }).getStatus("session-digest", now);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenNthCalledWith(1, "research_status_recovery_status", { p_session_digest: "session-digest", p_now: now });
    resolve(response(paid));
    const view = await result;
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(2, "research_assisted_order_financial_state_by_reference", { p_public_reference: reference });
    expect(view?.statusLabel).toBe("Payment verified");
  });

  it("does not query financial existence for an expired, unrelated or absent session", async () => {
    const rpc = vi.fn().mockResolvedValue(response(null));
    expect(await new SupabaseStatusRecoveryStore({ rpc }).getStatus("invalid-session", now)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("does not query financial existence after a session RPC error", async () => {
    const rpc = vi.fn().mockResolvedValue(response(null, { code: "42501", message: "denied" }));
    await expect(new SupabaseStatusRecoveryStore({ rpc }).getStatus("session-digest", now)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["submitted", "reviewing", "payment_pending", "payment_review", "closed", "cancelled"])(
    "never calls the evidence RPC for status %s without paid history or trusts an unsolicited status-response flag", async (status) => {
      const rpc = vi.fn().mockResolvedValue(response({ ...paid, status, timeline: [], paymentVerified: true }));
      const view = await new SupabaseStatusRecoveryStore({ rpc }).getStatus("session-digest", now);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(view?.statusLabel).not.toBe("Payment verified");
      expect(view?.timeline).toEqual([]);
    });

  it.each(["supplier_processing", "shipped", "delivered", "closed", "cancelled", "reviewing"])(
    "preserves historical paid evidence without changing the current %s status", async (status) => {
      for (const paymentVerified of [true, false]) {
        const source = { ...paid, status, paymentVerified: !paymentVerified };
        const rpc = vi.fn().mockResolvedValueOnce(response(source))
          .mockResolvedValueOnce(response({ hasObservation: true, paymentVerified }));
        const view = await new SupabaseStatusRecoveryStore({ rpc }).getStatus("session-digest", now);
        expect(view?.status).toBe(status);
        expect(view?.statusLabel).not.toBe("Payment verified");
        expect(view?.timeline[0].status).toBe(assistedOrderPaymentStatusCopy("paid", paymentVerified)?.label);
        expect(view?.timeline[0].customerMessage).toBe(assistedOrderPaymentStatusCopy("paid", paymentVerified)?.line);
        expect(rpc).toHaveBeenCalledTimes(2);
        expect(source.timeline[0].customerMessage).toBe("Old unsupported paid and fulfillment promise");
      }
    });

  it.each(["supplier_processing", "shipped", "delivered"])(
    "reads evidence for %s even if the status timeline omits paid", async (status) => {
      const rpc = vi.fn().mockResolvedValueOnce(response({ ...paid, status, timeline: [] }))
        .mockResolvedValueOnce(response({ hasObservation: true, paymentVerified: true }));
      const view = await new SupabaseStatusRecoveryStore({ rpc }).getStatus("session-digest", now);
      expect(view?.status).toBe(status);
      expect(view?.timeline).toEqual([]);
      expect(rpc).toHaveBeenNthCalledWith(2, "research_assisted_order_financial_state_by_reference", { p_public_reference: reference });
    });

  it("keeps later historical paid records neutral without evidence and fails closed on evidence errors", async () => {
    const progressed = { ...paid, status: "delivered", paymentVerified: true };
    for (const financial of [response(null), response({ hasObservation: false, paymentVerified: false }),
      response(null, { code: "PGRST202" })]) {
      const rpc = vi.fn().mockResolvedValueOnce(response(progressed)).mockResolvedValueOnce(financial);
      const view = await new SupabaseStatusRecoveryStore({ rpc }).getStatus("session-digest", now);
      expect(view?.timeline[0].status).toBe("Payment record under review");
    }
    const rpc = vi.fn().mockResolvedValueOnce(response(progressed)).mockResolvedValueOnce(response(null, { code: "42501" }));
    await expect(new SupabaseStatusRecoveryStore({ rpc }).getStatus("session-digest", now)).rejects.toThrow();
  });

  it.each([null, { hasObservation: false, paymentVerified: false }, { hasObservation: true, paymentVerified: false }])(
    "keeps a paid record neutral when canonical evidence is absent or unverified", async (financial) => {
      const rpc = vi.fn().mockResolvedValueOnce(response({ ...paid, paymentVerified: true })).mockResolvedValueOnce(response(financial));
      const view = await new SupabaseStatusRecoveryStore({ rpc }).getStatus("session-digest", now);
      expect(view?.statusLabel).toBe("Payment record under review");
      expect(JSON.stringify(view)).not.toContain("Old unsupported");
    });

  it("keeps neutral status when the source-only financial RPC is not installed", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(response(paid)).mockResolvedValueOnce(response(null, { code: "PGRST202" }));
    const view = await new SupabaseStatusRecoveryStore({ rpc }).getStatus("session-digest", now);
    expect(view?.statusLabel).toBe("Payment record under review");
  });

  it.each(["42501", "PGRST301", "XX000"])("fails closed on financial RPC error %s instead of claiming clean evidence", async (code) => {
    const rpc = vi.fn().mockResolvedValueOnce(response(paid)).mockResolvedValueOnce(response(null, { code }));
    await expect(new SupabaseStatusRecoveryStore({ rpc }).getStatus("session-digest", now)).rejects.toThrow();
  });

  it.each([{}, { hasObservation: false, paymentVerified: true }, { hasObservation: true, paymentVerified: "true" },
    { paymentVerified: true }, []])("rejects a malformed canonical financial projection", async (financial) => {
    const rpc = vi.fn().mockResolvedValueOnce(response(paid)).mockResolvedValueOnce(response(financial));
    await expect(new SupabaseStatusRecoveryStore({ rpc }).getStatus("session-digest", now)).rejects.toThrow("financial projection is invalid");
  });
});

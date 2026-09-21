import { describe, expect, it, vi } from "vitest";
import { SupabaseAssistedOrderRepository } from "./supabase-repository";

const reference = "XRR-20260921-ABCDEF1234";
const authorization = { publicReference: reference, memberId: "10000000-0000-4000-8000-000000000001", earlyAccessSessionHash: null, statusTokenHash: null };
const view = () => ({ requestId: "20000000-0000-4000-8000-000000000001", publicReference: reference, status: "shipped",
  createdAt: "2026-09-21T10:00:00Z", updatedAt: "2026-09-21T11:00:00Z", estimatedTotalCents: null,
  lines: [], timeline: [], documents: [], actionRequired: null, trackingReference: "OPAQUE-REFERENCE" });

describe("additive customer status reader", () => {
  it("uses the canonical authorization arguments unchanged and projects only trackingReference", async () => {
    const rpc = vi.fn(async () => ({ data: { ...view(), internalNote: "not-visible" }, error: null }));
    const result = await new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("research_assisted_order_customer_status", {
      p_public_reference: reference, p_member_id: authorization.memberId,
      p_early_access_session_hash: null, p_status_token_hash: null,
    });
    expect(result?.trackingReference).toBe("OPAQUE-REFERENCE");
    expect(result).not.toHaveProperty("internalNote");
  });

  it("never falls back to the vulnerable legacy function when the candidate is missing", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Missing candidate function" } });
    await expect(new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization)).rejects.toThrow();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["research_assisted_order_customer_status"]);
  });

  it.each(["42501", "42883", "PGRST301", "XX000", undefined])("does not hide %s behind fallback", async (code) => {
    const rpc = vi.fn(async () => ({ data: null, error: { code, message: "source failed" } }));
    await expect(new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("does not retry authorization denials or transport failures", async () => {
    const denied = vi.fn(async () => ({ data: null, error: null }));
    expect(await new SupabaseAssistedOrderRepository({ rpc: denied }).getStatus(authorization)).toBeNull();
    expect(denied).toHaveBeenCalledTimes(1);
    const failed = vi.fn(async () => { throw new Error("network"); });
    await expect(new SupabaseAssistedOrderRepository({ rpc: failed }).getStatus(authorization)).rejects.toThrow();
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it.each([{}, [], 2, "", " padded ", "bad\nreference"])("rejects malformed tracking %j", async (trackingReference) => {
    const rpc = vi.fn(async () => ({ data: { ...view(), trackingReference }, error: null }));
    await expect(new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects missing new projection evidence without consulting the legacy function", async () => {
    const { trackingReference: _ignored, ...oldView } = view();
    const rpc = vi.fn(async () => ({ data: oldView, error: null }));
    await expect(new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization)).rejects.toThrow(/projection unavailable/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects reference mismatch without a second read", async () => {
    const rpc = vi.fn(async () => ({ data: { ...view(), publicReference: "XRR-20260921-0000000000" }, error: null }));
    await expect(new SupabaseAssistedOrderRepository({ rpc }).getStatus(authorization)).rejects.toThrow(/reference mismatch/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ configured: true, rpc: vi.fn() }));
vi.mock("../../supabase", () => ({ supabaseConfigured: () => db.configured, getSupabaseAdmin: () => ({ rpc: db.rpc }) }));
import { createPartnerLifecycleDependencies } from "./lifecycle-production";
beforeEach(() => { vi.clearAllMocks(); db.configured = true; db.rpc.mockResolvedValue({ data: { ok: true }, error: null }); });
describe("durable partner operation production adapter", () => {
  it("uses the exact service-only canonical RPC with the trusted actor", async () => {
    const deps = createPartnerLifecycleDependencies();
    const operation = { action: "activate" as const, partnerId: "00000000-0000-4000-8000-000000000002", expectedUpdatedAt: "2026-09-05T00:00:00Z", reason: "Reviewed partner requirements", idempotencyKey: "synthetic-operation-0001" };
    const actor = "00000000-0000-4000-8000-000000000001";
    await deps.authority(); await deps.operate(actor, operation);
    expect(db.rpc.mock.calls).toEqual([["research_partner_lifecycle_authority", undefined], ["research_admin_partner_operation", { p_actor_auth_user_id: actor, p_operation: operation }]]);
  });
  it("has no fallback without configuration and sanitizes provider errors", async () => {
    db.configured = false; await expect(createPartnerLifecycleDependencies().authority()).rejects.toThrow(/^partner authority unavailable$/); expect(db.rpc).not.toHaveBeenCalled();
    db.configured = true; db.rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE" } });
    await expect(createPartnerLifecycleDependencies().authority()).rejects.toThrow(/^partner authority unavailable$/);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ configured: true, rpc: vi.fn(), createUser: vi.fn(), getUser: vi.fn(), tick: vi.fn() }));
vi.mock("../supabase", () => ({ supabaseConfigured: () => db.configured,
  getSupabaseAdmin: () => ({ rpc: db.rpc, auth: { admin: { createUser: db.createUser } } }),
  getSupabaseAnon: () => ({ auth: { getUser: db.getUser } }),
}));
vi.mock("./outbox", () => ({ runOutboxTick: db.tick }));
import { createApprovedCustomerAccessDependencies } from "./approved-customer-access-production";
const user = { id: "00000000-0000-4000-8000-000000000001", email: "customer@example.invalid", email_confirmed_at: "2026-09-05T00:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); db.configured = true; db.rpc.mockResolvedValue({ data: { ok: true }, error: null }); });
describe("approved customer production ports", () => {
  it("uses only the exact canonical RPC arguments", async () => {
    const deps = createApprovedCustomerAccessDependencies();
    await deps.authority();
    await deps.approve({ actorAuthUserId: user.id, email: user.email, firstName: "Customer", lastName: "A", reason: "Customer access approval", expectedApplicationId: null, expectedUpdatedAt: null, idempotencyKey: "synthetic-operation-1" });
    await deps.claim(user.id, user.id);
    expect(db.rpc.mock.calls).toEqual([
      ["research_approved_customer_access_authority", undefined],
      ["research_admin_approve_customer_access", { p_actor_auth_user_id: user.id, p_email: user.email, p_first_name: "Customer", p_last_name: "A", p_reason: "Customer access approval", p_expected_application_id: null, p_expected_updated_at: null, p_idempotency_key: "synthetic-operation-1" }],
      ["research_claim_approved_customer_access", { p_application_id: user.id, p_auth_user_id: user.id }],
    ]);
  });
  it("fails closed without configuration and sanitizes source errors", async () => {
    db.configured = false; await expect(createApprovedCustomerAccessDependencies().authority()).rejects.toThrow("account access unavailable"); expect(db.rpc).not.toHaveBeenCalled();
    db.configured = true; db.rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE provider detail" } });
    await expect(createApprovedCustomerAccessDependencies().authority()).rejects.toThrow(/^account access unavailable$/);
  });
  it("projects created Auth verification without metadata and classifies duplicate identity without reset", async () => {
    const deps = createApprovedCustomerAccessDependencies(); db.createUser.mockResolvedValue({ data: { user: { ...user, user_metadata: "PRIVATE" } }, error: null });
    expect(await deps.createAuth(user.email, "synthetic-password-only")).toEqual({ kind: "created", userId: user.id, email: user.email, emailVerified: true });
    expect(db.createUser).toHaveBeenCalledWith({ email: user.email, password: "synthetic-password-only", email_confirm: true });
    db.createUser.mockResolvedValue({ data: { user: null }, error: { code: "email_exists" } }); expect(await deps.createAuth(user.email, "synthetic-password-only")).toEqual({ kind: "exists" });
  });
  it("uses provider-verified Auth and refuses recovery credentials before normal sign-in inspection", async () => {
    const deps = createApprovedCustomerAccessDependencies(); db.getUser.mockResolvedValue({ data: { user }, error: null });
    expect(await deps.verifySignIn("Bearer synthetic-normal")).toEqual({ userId: user.id, email: user.email, emailVerified: true });
    const recovery = `synthetic.${Buffer.from(JSON.stringify({ amr: [{ method: "recovery", timestamp: 1 }] })).toString("base64url")}.test`;
    expect(await deps.verifySignIn(`Bearer ${recovery}`)).toBeNull(); expect(db.getUser).toHaveBeenCalledTimes(1);
    db.getUser.mockResolvedValue({ data: { user }, error: { message: "invalid token" } }); expect(await deps.verifySignIn("Bearer invalid")).toBeNull();
  });
});

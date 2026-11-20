import { describe, expect, it, vi } from "vitest";
import { createLifecycleRepository } from "./repository";
import { unavailableLifecycle } from "@shared/research/account-lifecycle";
const actor = "10000000-0000-4000-8000-000000000001", target = "20000000-0000-4000-8000-000000000002";
const operation = "30000000-0000-4000-8000-000000000003", attempt = "40000000-0000-4000-8000-000000000004", hash = "a".repeat(64);
const context = { policyRevision: hash, assuranceRef: hash, sessionBinding: hash,
  assuranceNotAfter: "2026-11-19T23:59:00.123456Z", prepareNotAfter: "2026-11-19T23:58:00.654321Z" };
const current = { assuranceRef: hash, sessionBinding: hash };
const known = () => ({ ...unavailableLifecycle("dependency_unknown"), operationId: operation, version: 2, state: "blocked" as const });
function fixture() { const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: known() as unknown, error: null as unknown }));
  return { rpc, repo: createLifecycleRepository({ rpc }) }; }
describe("six literal backend-only lifecycle RPC interfaces", () => {
  it("preserves exact arguments, native microseconds and self/admin separation", async () => {
    const f = fixture(); await f.repo.prepareSelf(actor, attempt, context);
    expect(f.rpc).toHaveBeenLastCalledWith("account_lifecycle_prepare_self", { p_actor: actor, p_attempt: attempt, p_context: context });
    await f.repo.prepareAdmin(actor, target, attempt, "privacy_request", context);
    expect(f.rpc).toHaveBeenLastCalledWith("account_lifecycle_prepare_admin", { p_actor: actor, p_target: target, p_attempt: attempt, p_reason: "privacy_request", p_context: context });
    for (const mode of ["Self", "Admin"] as const) {
      await f.repo[`confirm${mode}`](actor, operation, hash, 1, current);
      expect(f.rpc).toHaveBeenLastCalledWith(`account_lifecycle_confirm_${mode.toLowerCase()}`, { p_actor: actor, p_operation: operation,
        p_preview_sha256: hash, p_expected_version: 1, p_context: current });
    }
    await f.repo.statusSelf(actor, operation); expect(f.rpc).toHaveBeenLastCalledWith("account_lifecycle_status_self", { p_actor: actor, p_operation: operation });
    await f.repo.statusAdmin(actor, operation, current); expect(f.rpc).toHaveBeenLastCalledWith("account_lifecycle_status_admin", { p_actor: actor, p_operation: operation, p_context: current });
    expect(Object.keys(f.repo).sort()).toEqual(["confirmAdmin", "confirmSelf", "prepareAdmin", "prepareSelf", "statusAdmin", "statusSelf"]);
  });
  it.each([["23505", "account_lifecycle_attempt_conflict", "attempt_conflict"], ["P0001", "account_lifecycle_version_conflict", "version_conflict"],
    ["42501", "account_lifecycle_forbidden", "forbidden"], ["22023", "account_lifecycle_invalid", "invalid_input"]])("maps only exact native refusal %s/%s", async (code, message, expected) => {
    const f = fixture(); f.rpc.mockResolvedValue({ data: null, error: { code, message } });
    await expect(f.repo.statusSelf(actor, operation)).rejects.toMatchObject({ code: expected }); expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["40001", "40P01", "57014", "55000", "PGRST202", "23505"])("keeps %s or ambiguous conflict uncertain without retry", async code => {
    const f = fixture(); f.rpc.mockResolvedValue({ data: null, error: { code, message: "unreviewed private detail" } });
    await expect(f.repo.prepareSelf(actor, attempt, context)).rejects.toMatchObject({ code: "outcome_uncertain", status: 503 }); expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed/mismatched response or lost reply without clearing a known operation", async () => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({ data: { ...known(), operationId: target }, error: null });
    await expect(f.repo.statusSelf(actor, operation)).rejects.toMatchObject({ code: "outcome_uncertain" });
    f.rpc.mockRejectedValueOnce(Error("lost committed response"));
    await expect(f.repo.confirmSelf(actor, operation, hash, 1, current)).rejects.toMatchObject({ code: "outcome_uncertain" });
  });
  it("rejects added authority/context keys before RPC and preserves exact time bounds", async () => {
    const f = fixture();
    expect(() => f.repo.prepareSelf(actor, attempt, { ...context, clear: true } as never)).toThrow("invalid_input");
    expect(() => f.repo.prepareSelf(actor, attempt, { ...context, prepareNotAfter: "2026-11-20T00:00:00Z" })).toThrow("invalid_input");
    expect(() => f.repo.statusSelf("A0000000-0000-4000-8000-000000000001", operation)).toThrow("invalid_input");
    expect(f.rpc).not.toHaveBeenCalled();
  });
});

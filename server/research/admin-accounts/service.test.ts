import { describe, expect, it, vi } from "vitest";
import { createAdminAccountService, type AdminAccountDependencies } from "./service";
import type { AdminAccount } from "../../../shared/research/admin-accounts";
const actorId = "10000000-0000-4000-8000-000000000001", targetId = "10000000-0000-4000-8000-000000000002";
const account: AdminAccount = { userId: targetId, emailHint: "withheld", displayLabel: null, displayLabelSource: "user_supplied_not_authority",
  emailConfirmation: "confirmed", pendingEmailChange: false, lastSignInAt: null, providerBan: "not_reported" };
const page = { ok: true as const, kind: "CANONICAL_AUTH_ACCOUNT_PAGE_V1" as const, accounts: [account], page: 1, perPage: 20, nextPage: null, total: 1 };
function fixture() {
  let current = true;
  const deps = {
    available: () => true, verifyIdentity: vi.fn(async () => ({ id: actorId })), isRecovery: () => false,
    admission: { admit: vi.fn<NonNullable<AdminAccountDependencies["admission"]>["admit"]>(async scope => ({ ...scope, purpose: "ordinary", isCurrent: () => current })), audit: vi.fn(async () => {}) },
    reader: { list: vi.fn<AdminAccountDependencies["reader"]["list"]>(async () => page), detail: vi.fn<AdminAccountDependencies["reader"]["detail"]>(async () => account) },
  } satisfies AdminAccountDependencies;
  return { deps, service: createAdminAccountService(deps), revoke: () => { current = false; } };
}
describe("canonical account directory/detail service", () => {
  it("authorizes exact operation before one bounded provider read and emits only minimal audit", async () => {
    const f = fixture(); expect(await f.service.list("ordinary", {})).toEqual(page);
    expect(f.deps.reader.list).toHaveBeenCalledExactlyOnceWith({ page: 1, perPage: 20 });
    expect(f.deps.admission.audit).toHaveBeenCalledExactlyOnceWith({ actorId, capability: "accountRead", operation: "directory", targetId: null, outcome: "provided" });
    expect(await f.service.detail("ordinary", targetId)).toEqual({ ok: true, kind: "CANONICAL_AUTH_ACCOUNT_DETAIL_V1", account });
    expect(f.deps.reader.detail).toHaveBeenCalledExactlyOnceWith(targetId);
    expect(JSON.stringify(f.deps.admission.audit.mock.calls)).not.toMatch(/token|email|displayLabel|metadata/u);
  });
  it("refuses denied/malformed/paging inputs before account existence reads", async () => {
    const f = fixture(); vi.mocked(f.deps.admission.admit).mockResolvedValue(null);
    await expect(f.service.list("ordinary", {})).rejects.toMatchObject({ status: 403 });
    await expect(f.service.detail("ordinary", targetId)).rejects.toMatchObject({ status: 403 });
    await expect(f.service.detail("ordinary", "not-a-uuid")).rejects.toMatchObject({ status: 400 });
    expect(f.deps.reader.list).not.toHaveBeenCalled(); expect(f.deps.reader.detail).not.toHaveBeenCalled();
    const allowed = fixture();
    for (const query of [{ page: "0" }, { perPage: "51" }, { page: ["1", "2"] }, { actorId }]) await expect(allowed.service.list("ordinary", query)).rejects.toMatchObject({ status: 400 });
    expect(allowed.deps.reader.list).not.toHaveBeenCalled();
  });
  it("does not turn provider failures, incomplete pages or wrong identities into empty/success", async () => {
    const f = fixture(); f.deps.reader.list.mockRejectedValue(Error("private provider email/token"));
    await expect(f.service.list("ordinary", {})).rejects.toMatchObject({ message: "account_read_unavailable" });
    expect(f.deps.reader.list).toHaveBeenCalledTimes(1); expect(f.deps.admission.audit).not.toHaveBeenCalled();
    f.deps.reader.list.mockResolvedValue({ ...page, accounts: [] });
    await expect(f.service.list("ordinary", {})).rejects.toMatchObject({ status: 503 });
    f.deps.reader.detail.mockResolvedValue({ ...account, userId: actorId });
    await expect(f.service.detail("ordinary", targetId)).rejects.toMatchObject({ status: 503 });
  });
  it("permits not-found only after authorized exact lookup and matching minimal audit", async () => {
    const f = fixture(); f.deps.reader.detail.mockResolvedValue(null);
    await expect(f.service.detail("ordinary", targetId)).rejects.toMatchObject({ status: 404, code: "account_not_found" });
    expect(f.deps.admission.audit).toHaveBeenCalledExactlyOnceWith({ actorId, capability: "accountRead", operation: "detail", targetId, outcome: "not_found" });
  });
  it("withholds data if authority changes during the provider read or audit fails", async () => {
    const f = fixture(); f.deps.reader.list.mockImplementation(async () => { f.revoke(); return page; });
    await expect(f.service.list("ordinary", {})).rejects.toMatchObject({ status: 403 }); expect(f.deps.admission.audit).not.toHaveBeenCalled();
    const g = fixture(); g.deps.admission.audit.mockRejectedValue(Error("private audit failure"));
    await expect(g.service.detail("ordinary", targetId)).rejects.toMatchObject({ status: 503, message: "account_read_unavailable" });
  });
  it("times out a stuck provider exactly once without retry or success audit", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(); f.deps.reader.list.mockImplementation(() => new Promise(() => {}));
      const assertion = expect(f.service.list("ordinary", {})).rejects.toMatchObject({ status: 503 });
      await vi.advanceTimersByTimeAsync(5_001); await assertion;
      expect(f.deps.reader.list).toHaveBeenCalledTimes(1); expect(f.deps.admission.audit).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});

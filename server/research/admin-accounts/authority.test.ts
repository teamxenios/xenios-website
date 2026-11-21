import { describe, expect, it, vi } from "vitest";
import { createAccountReadAuthority, type AccountReadAdmission, type AccountReadPrincipal } from "./authority";
const actorId = "10000000-0000-4000-8000-000000000001", targetId = "10000000-0000-4000-8000-000000000002";
function fixture() {
  let current = true;
  const admission: AccountReadAdmission = {
    admit: vi.fn<AccountReadAdmission["admit"]>(async input => ({ actorId: input.actorId, capability: "accountRead", operation: input.operation,
      targetId: input.targetId, purpose: "ordinary", isCurrent: () => current })), audit: vi.fn(async () => {}),
  };
  const deps = { available: vi.fn(() => true), verifyIdentity: vi.fn(async (_token: string) => ({ id: actorId })),
    isRecovery: vi.fn((token: string) => token === "recovery"), admission };
  return { deps, authority: createAccountReadAuthority(deps), revoke: () => { current = false; } };
}
describe("verified UUID ordinary accountRead authority", () => {
  it("mints a local principal only after actual canonical identity and executable ordinary admission", async () => {
    const f = fixture(), principal = await f.authority.authorize("synthetic-bearer", "detail", targetId);
    expect(principal).toEqual({ actorId, capability: "accountRead", operation: "detail", targetId });
    expect(f.deps.verifyIdentity).toHaveBeenCalledExactlyOnceWith("synthetic-bearer");
    expect(await f.authority.requireCurrent(principal, "detail", targetId)).toBe(principal);
    expect(JSON.stringify(principal)).not.toContain("bearer");
  });
  it.each([null, "", "Bearer value", "a,b", "a".repeat(8193)])("refuses malformed bearer %# before canonical verification", async token => {
    const f = fixture(); await expect(f.authority.authorize(token, "directory", null)).rejects.toMatchObject({ status: 401 });
    expect(f.deps.verifyIdentity).not.toHaveBeenCalled(); expect(f.deps.admission.admit).not.toHaveBeenCalled();
  });
  it("denies recovery and malformed canonical identity despite suggestive external role text", async () => {
    const f = fixture(); await expect(f.authority.authorize("recovery", "directory", null)).rejects.toMatchObject({ code: "recovery_session" });
    expect(f.deps.admission.admit).not.toHaveBeenCalled();
    f.deps.verifyIdentity.mockResolvedValue({ id: "admin@example.invalid" });
    await expect(f.authority.authorize("ordinary", "directory", null)).rejects.toMatchObject({ status: 401 });
    expect(f.deps.admission.admit).not.toHaveBeenCalled();
  });
  it("keeps missing configuration/admission unavailable, not permitted by a boolean", async () => {
    const f = fixture(); f.deps.available.mockReturnValue(false);
    await expect(f.authority.authorize("ordinary", "directory", null)).rejects.toMatchObject({ status: 503 });
    const authority = createAccountReadAuthority({ ...f.deps, available: () => true, admission: undefined });
    await expect(authority.authorize("ordinary", "directory", null)).rejects.toMatchObject({ status: 503 });
    expect(f.deps.verifyIdentity).not.toHaveBeenCalled();
  });
  it("refuses a trusted callback's wrong actor, target, operation, purpose or capability", async () => {
    for (const change of [{ actorId: targetId }, { targetId: actorId }, { operation: "directory" }, { purpose: "recovery" }, { capability: "tenantRead" }]) {
      const f = fixture(); vi.mocked(f.deps.admission.admit).mockImplementation(async input => ({ ...input, purpose: "ordinary", isCurrent: () => true, ...change } as never));
      await expect(f.authority.authorize("ordinary", "detail", targetId)).rejects.toMatchObject({ status: 403 });
    }
  });
  it("rejects cloned, foreign-instance, cross-target and cross-operation principals and revocation", async () => {
    const f = fixture(), principal = await f.authority.authorize("ordinary", "detail", targetId);
    await expect(f.authority.requireCurrent({ ...principal } as AccountReadPrincipal, "detail", targetId)).rejects.toMatchObject({ status: 403 });
    await expect(fixture().authority.requireCurrent(principal, "detail", targetId)).rejects.toMatchObject({ status: 403 });
    await expect(f.authority.requireCurrent(principal, "directory", null)).rejects.toMatchObject({ status: 403 });
    await expect(f.authority.requireCurrent(principal, "detail", actorId)).rejects.toMatchObject({ status: 403 });
    f.revoke(); await expect(f.authority.requireCurrent(principal, "detail", targetId)).rejects.toMatchObject({ status: 403 });
  });
  it("redacts verification/admission exceptions instead of inferring authority", async () => {
    const f = fixture(); f.deps.verifyIdentity.mockRejectedValue(Error("private provider token"));
    await expect(f.authority.authorize("ordinary", "directory", null)).rejects.toMatchObject({ message: "account_read_unavailable", status: 503 });
    expect(f.deps.admission.admit).not.toHaveBeenCalled();
  });
});

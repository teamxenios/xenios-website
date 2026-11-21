import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, type User } from "@supabase/supabase-js";
import { buildAdminAccountDependencies, createCanonicalAccountReader, projectCanonicalAccount, type CanonicalAdminAccountReads } from "./production";
import { createAdminAccountService } from "./service";
import type { AccountReadAdmission } from "./authority";
const hooks = vi.hoisted(() => ({ admin: vi.fn(), anon: vi.fn(), identity: vi.fn(), configured: vi.fn() }));
vi.mock("../../supabase", () => ({ getSupabaseAdmin: hooks.admin, getSupabaseAnon: hooks.anon,
  getSupabaseConnectionIdentity: hooks.identity, supabaseConfigured: hooks.configured }));
const userId = "10000000-0000-4000-8000-000000000001", actorId = "10000000-0000-4000-8000-000000000002";
const user = (id = userId): User => ({ id, aud: "authenticated", created_at: "2026-11-20T00:00:00Z",
  email: "private@example.invalid", app_metadata: { role: "admin", private: "app-secret" },
  user_metadata: { display_name: "User-supplied label", clinical: "private-health", role: "owner" } });
const admission: AccountReadAdmission = { admit: async scope => ({ ...scope, purpose: "ordinary", isCurrent: () => true }), audit: async () => {} };
function provider() {
  return { listUsers: vi.fn<CanonicalAdminAccountReads["listUsers"]>(async () => ({ data: { users: [user()], aud: "authenticated", nextPage: null, lastPage: 1, total: 1 }, error: null })),
    getUserById: vi.fn<CanonicalAdminAccountReads["getUserById"]>(async () => ({ data: { user: user() }, error: null })) };
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://fixture.example.invalid"); vi.stubEnv("SUPABASE_ANON_KEY", "synthetic-unused");
  hooks.configured.mockReturnValue(true); hooks.identity.mockReturnValue({ configuredUrl: "https://fixture.example.invalid", anonUrl: "https://fixture.example.invalid", adminUrl: "https://fixture.example.invalid" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
describe("existing canonical Supabase Auth read adapter", () => {
  it("projects only approved identity observations and withholds email/metadata/credentials", () => {
    const projected = projectCanonicalAccount({ ...user(), new_email: "pending@example.invalid", email_confirmed_at: "2026-11-20T01:00:00Z", banned_until: "2026-11-22T00:00:00Z" }, Date.parse("2026-11-21T00:00:00Z"));
    expect(projected).toMatchObject({ userId, emailHint: "withheld", emailConfirmation: "confirmed", pendingEmailChange: true, providerBan: "active", displayLabelSource: "user_supplied_not_authority" });
    const wire = JSON.stringify(projected);
    for (const secret of ["private@example", "pending@example", "private-health", "app-secret", '"role"', "user_metadata", "app_metadata"]) expect(wire).not.toContain(secret);
    expect(projectCanonicalAccount({ ...user(), email: "", new_email: "", email_confirmed_at: null, banned_until: null }).emailConfirmation).toBe("no_email");
    expect(projectCanonicalAccount({ ...user(), user_metadata: { display_name: "unsafe\nname" } }).displayLabel).toBeNull();
  });
  it("reads one exact provider page and verifies counts before computing the next ordinal", async () => {
    const p = provider(), reader = createCanonicalAccountReader(p);
    expect((await reader.list({ page: 1, perPage: 20 })).accounts).toHaveLength(1);
    expect(p.listUsers).toHaveBeenCalledExactlyOnceWith({ page: 1, perPage: 20 }); expect(p.getUserById).not.toHaveBeenCalled();
    const ids = Array.from({ length: 20 }, (_, n) => user(`10000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`));
    p.listUsers.mockResolvedValue({ data: { users: ids, aud: "authenticated", nextPage: 1, lastPage: 1, total: 201 }, error: null });
    expect((await reader.list({ page: 9, perPage: 20 })).nextPage).toBe(10); // SDK link-ordinal truncation cannot misroute this page.
  });
  it("refuses missing pagination, contradictory counts, duplicate IDs and provider errors rather than empty success", async () => {
    const p = provider(), reader = createCanonicalAccountReader(p);
    for (const data of [
      { users: [], aud: "authenticated", nextPage: null, lastPage: 0, total: 0 },
      { users: [], aud: "authenticated", nextPage: null, lastPage: 1, total: 1 },
      { users: [user(), user()], aud: "authenticated", nextPage: null, lastPage: 1, total: 2 },
    ]) { p.listUsers.mockResolvedValue({ data, error: null }); await expect(reader.list({ page: 1, perPage: 20 })).rejects.toBeTruthy(); }
    p.listUsers.mockResolvedValue({ data: { users: [] }, error: new AuthApiError("private provider credential", 403, "not_admin") });
    await expect(reader.list({ page: 1, perPage: 20 })).rejects.toMatchObject({ message: "account_read_unavailable" });
    expect(p.listUsers).toHaveBeenCalledTimes(4);
  });
  it("distinguishes exact authorized provider not-found from failures and never probes malformed locators", async () => {
    const p = provider(), reader = createCanonicalAccountReader(p);
    await expect(reader.detail("malformed")).rejects.toMatchObject({ status: 503 }); expect(p.getUserById).not.toHaveBeenCalled();
    p.getUserById.mockResolvedValue({ data: { user: null }, error: new AuthApiError("private", 404, "user_not_found") });
    expect(await reader.detail(userId)).toBeNull();
    p.getUserById.mockResolvedValue({ data: { user: null }, error: new AuthApiError("private email", 500, "unexpected_failure") });
    await expect(reader.detail(userId)).rejects.toMatchObject({ message: "account_read_unavailable" });
    p.getUserById.mockResolvedValue({ data: { user: user(actorId) }, error: null });
    await expect(reader.detail(userId)).rejects.toMatchObject({ status: 503 });
  });
  it("keeps omission of actual ready/admission bindings unavailable without constructing clients", async () => {
    const deps = buildAdminAccountDependencies(), service = createAdminAccountService(deps);
    expect(deps.available()).toBe(false);
    await expect(service.list("ordinary", {})).rejects.toMatchObject({ status: 503 });
    expect(hooks.admin).not.toHaveBeenCalled(); expect(hooks.anon).not.toHaveBeenCalled();
  });
  it("uses canonical getUser before admin reads and refuses cached-client project mismatch", async () => {
    const p = provider(), getUser = vi.fn(async () => ({ data: { user: user(actorId) }, error: null }));
    hooks.anon.mockReturnValue({ auth: { getUser } }); hooks.admin.mockReturnValue({ auth: { admin: p } });
    const deps = buildAdminAccountDependencies({ ready: () => true, admission });
    expect(await deps.verifyIdentity("ordinary")).toEqual({ id: actorId }); expect(hooks.admin).not.toHaveBeenCalled();
    expect(getUser).toHaveBeenCalledExactlyOnceWith("ordinary");
    hooks.anon.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null }, error: new AuthApiError("private", 401, "bad_jwt") }) } });
    expect(await deps.verifyIdentity("bad-token")).toBeNull();
    hooks.anon.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null }, error: new AuthApiError("private", 500, "unexpected_failure") }) } });
    await expect(deps.verifyIdentity("ordinary")).rejects.toMatchObject({ message: "account_read_unavailable" });
    hooks.identity.mockReturnValue({ configuredUrl: "https://fixture.example.invalid", anonUrl: "https://other.example.invalid", adminUrl: "https://other.example.invalid" });
    await expect(deps.verifyIdentity("ordinary")).rejects.toMatchObject({ status: 503 });
    await expect(deps.reader.list({ page: 1, perPage: 20 })).rejects.toMatchObject({ status: 503 }); expect(p.listUsers).not.toHaveBeenCalled();
  });
});

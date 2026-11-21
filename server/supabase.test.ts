import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ create: vi.fn<(url: string, key: string, options: unknown) => unknown>(),
  listUsers: vi.fn<() => Promise<{ error: null }>>() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: sdk.create }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://srcphrgnxreqyirkitxd.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-private-key-not-a-credential");
  vi.stubEnv("SUPABASE_ANON_KEY", "synthetic-public-key-not-a-credential");
  sdk.listUsers.mockResolvedValue({ error: null });
  sdk.create.mockImplementation(() => ({ auth: { admin: { listUsers: sdk.listUsers } } }));
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("canonical lazy connection provenance", () => {
  it("reports configuration without constructing a client or exposing credentials", async () => {
    const module = await import("./supabase"), value = module.getSupabaseConnectionIdentity();
    expect(value).toEqual({ configuredUrl: "https://srcphrgnxreqyirkitxd.supabase.co", adminUrl: null, anonUrl: null });
    expect(Object.isFrozen(value)).toBe(true); expect(sdk.create).not.toHaveBeenCalled();
    expect(JSON.stringify(value)).not.toContain("synthetic-private-key"); expect(JSON.stringify(value)).not.toContain("synthetic-public-key");
  });
  it("records the URL actually used by each unchanged cached client", async () => {
    const module = await import("./supabase"), first = module.getSupabaseAnon();
    expect(module.getSupabaseConnectionIdentity().anonUrl).toBe("https://srcphrgnxreqyirkitxd.supabase.co");
    vi.stubEnv("SUPABASE_URL", "https://yvzeduaxbwgcwllhywff.supabase.co");
    expect(module.getSupabaseAnon()).toBe(first); expect(sdk.create).toHaveBeenCalledTimes(1);
    const value = module.getSupabaseConnectionIdentity();
    expect(value.configuredUrl).toBe("https://yvzeduaxbwgcwllhywff.supabase.co");
    expect(value.anonUrl).toBe("https://srcphrgnxreqyirkitxd.supabase.co"); expect(value.adminUrl).toBeNull();
  });
  it("tracks the existing admin singleton without replacing its key self-check", async () => {
    const module = await import("./supabase"), first = module.getSupabaseAdmin();
    expect(module.getSupabaseAdmin()).toBe(first); expect(sdk.create).toHaveBeenCalledTimes(1);
    expect(sdk.listUsers).toHaveBeenCalledTimes(1);
    expect(module.getSupabaseConnectionIdentity().adminUrl).toBe("https://srcphrgnxreqyirkitxd.supabase.co");
  });
});

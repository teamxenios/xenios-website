import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRow } from "../member-auth";
import { MemberCatalogService } from "./member-catalog-service";

const MEMBER: MemberRow = {
  id: "member-1",
  application_id: "application-1",
  auth_user_id: "auth-1",
  email: "member@example.invalid",
  first_name: "Member",
  status: "active",
  billing_state: "active",
  created_at: "2026-07-27T12:00:00.000Z",
  updated_at: "2026-07-27T12:30:00.000Z",
};

function dependencies(configured = true) {
  return {
    configured: () => configured,
    db: () =>
      ({
        storage: {
          from: vi.fn(() => ({
            createSignedUrl: vi.fn(),
          })),
        },
      }) as unknown as SupabaseClient,
    products: {
      readCatalog: vi.fn(async () => []),
    },
    requiredInputs: {
      list: vi.fn(async () => []),
      readinessAll: vi.fn(async () => []),
    },
    now: () => new Date("2026-07-27T13:00:00.000Z"),
  };
}

describe("MemberCatalogService", () => {
  it("returns all truthful V3 previews without manufacturing Product Control or inventory facts", async () => {
    const deps = dependencies();
    const service = new MemberCatalogService(deps);
    const catalog = await service.list({ member: MEMBER });
    expect(catalog.audience).toBe("member");
    expect(catalog.items).toHaveLength(49);
    expect(catalog.items.every((item) => item.selection === null)).toBe(true);
    expect(catalog.items.every((item) => item.price === null)).toBe(true);
    expect(catalog.items.every((item) => item.media === null)).toBe(true);
    expect(deps.products.readCatalog).toHaveBeenCalledTimes(1);
    expect(deps.requiredInputs.list).toHaveBeenCalledTimes(1);
    expect(deps.requiredInputs.readinessAll).toHaveBeenCalledTimes(1);
  });

  it("falls back to the nontransactional preview before reads when persistence is unavailable", async () => {
    const deps = dependencies(false);
    const service = new MemberCatalogService(deps);
    const catalog = await service.list({ member: MEMBER });
    expect(catalog.items).toHaveLength(49);
    expect(catalog.items.filter((item) => item.selection !== null)).toEqual([]);
    expect(deps.products.readCatalog).not.toHaveBeenCalled();
  });
});

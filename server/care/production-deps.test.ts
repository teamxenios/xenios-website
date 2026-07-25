import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  createCareProductionDependencies,
  type CareProductionAdapters,
} from "./production-deps";

function adapters(
  overrides: Partial<CareProductionAdapters> = {},
): CareProductionAdapters {
  return {
    authenticate: vi.fn(async () => ({ id: "user-1" })),
    loadActiveRoles: vi.fn(async () => ["care_patient"]),
    loadCapability: vi.fn(async () => ({
      state: "disabled",
      approved_by: null,
      approved_at: null,
    })),
    writeAccessAudit: vi.fn(async () => undefined),
    ...overrides,
  };
}

function requestWithAuthorization(value?: string): Request {
  return {
    headers: value ? { authorization: value } : {},
  } as Request;
}

describe("Care production dependencies", () => {
  it("fails closed when the capability record does not exist", async () => {
    const deps = createCareProductionDependencies(
      adapters({ loadCapability: vi.fn(async () => null) }),
      {},
    );

    await expect(deps.loadCapabilityStatus()).resolves.toMatchObject({
      state: "disabled",
      enabled: false,
    });
  });

  it("requires database approval and both deployment approvals before enabling", async () => {
    const approved = adapters({
      loadCapability: vi.fn(async () => ({
        state: "enabled",
        approved_by: "security-admin",
        approved_at: "2026-07-25T00:00:00.000Z",
      })),
    });

    await expect(
      createCareProductionDependencies(approved, {}).loadCapabilityStatus(),
    ).resolves.toMatchObject({ state: "pending_qa", enabled: false });
    await expect(
      createCareProductionDependencies(approved, {
        CARE_ENABLED: "true",
        CARE_ENABLE_APPROVED: "true",
      }).loadCapabilityStatus(),
    ).resolves.toMatchObject({ state: "enabled", enabled: true });
  });

  it("never trusts malformed capability state", async () => {
    const deps = createCareProductionDependencies(
      adapters({
        loadCapability: vi.fn(async () => ({
          state: "available_everywhere",
          approved_by: "user-1",
          approved_at: "2026-07-25T00:00:00.000Z",
        })),
      }),
      { CARE_ENABLED: "true", CARE_ENABLE_APPROVED: "true" },
    );

    await expect(deps.loadCapabilityStatus()).resolves.toMatchObject({
      state: "disabled",
      enabled: false,
    });
  });

  it("requires a verified bearer token and discards every non-Care role", async () => {
    const authenticate = vi.fn(async (token: string) =>
      token === "valid" ? { id: "user-1" } : null,
    );
    const deps = createCareProductionDependencies(
      adapters({
        authenticate,
        loadActiveRoles: vi.fn(async () => [
          "care_patient",
          "affiliate",
          "mitch",
          "fulfillment",
          "trainer",
          "research_admin",
        ]),
      }),
      {},
    );

    await expect(deps.resolvePrincipal(requestWithAuthorization())).resolves.toBeNull();
    await expect(
      deps.resolvePrincipal(requestWithAuthorization("Bearer invalid")),
    ).resolves.toBeNull();
    await expect(
      deps.resolvePrincipal(requestWithAuthorization("Bearer valid")),
    ).resolves.toEqual({ subjectId: "user-1", roles: ["care_patient"] });
    expect(authenticate).toHaveBeenCalledWith("valid");
  });
});

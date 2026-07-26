import { describe, expect, it, vi } from "vitest";
import type {
  PrelaunchAccessStatus,
  PrelaunchRole,
} from "@shared/research/prelaunch";
import {
  WEBSITE3_PRELAUNCH_ROLES,
  Website3PrelaunchBoundaryError,
  buildWebsite3PrelaunchRepositoryScope,
  resolveWebsite3RepositoryBoundary,
} from "./prelaunch-application";

function access(
  roles: PrelaunchRole[],
  options: {
    dataOrigin?: "real" | "internal_seed";
    providerMode?: "disabled" | "capture" | "live";
  } = {},
): PrelaunchAccessStatus {
  const dataContext =
    options.dataOrigin === "internal_seed"
      ? {
          dataOrigin: "internal_seed" as const,
          seedNamespace: "website3-review",
          seedVersion: 1,
          resetGroup: "website3-review",
          releaseEligible: false as const,
        }
      : {
          dataOrigin: "real" as const,
          seedNamespace: null,
          seedVersion: null,
          resetGroup: null,
          releaseEligible: true as const,
        };
  return {
    roles,
    dataContext,
    providerMode: options.providerMode ?? "disabled",
    launchStatus: "internal_build",
  };
}

describe("Website 3 canonical pre-launch repository boundary", () => {
  it("uses only the canonical Website 3 roles", () => {
    expect(WEBSITE3_PRELAUNCH_ROLES).toEqual([
      "product_admin",
      "internal_team",
      "approved_internal_reviewer",
    ]);

    for (const role of WEBSITE3_PRELAUNCH_ROLES) {
      expect(
        resolveWebsite3RepositoryBoundary(access([role]), "read").role,
      ).toBe(role);
    }
  });

  it("rejects unrelated canonical roles instead of creating a parallel role", () => {
    expect(() =>
      resolveWebsite3RepositoryBoundary(
        access(["operations_admin", "clinical_admin"]),
        "read",
      ),
    ).toThrowError(
      new Website3PrelaunchBoundaryError(
        "website3_prelaunch_role_required",
      ),
    );
  });

  it("keeps the approved internal reviewer read-only", () => {
    expect(() =>
      resolveWebsite3RepositoryBoundary(
        access(["approved_internal_reviewer"]),
        "write",
      ),
    ).toThrowError(
      new Website3PrelaunchBoundaryError(
        "website3_prelaunch_write_role_required",
      ),
    );
  });

  it("uses the canonical provider-mode downgrade for seed activity", () => {
    const boundary = resolveWebsite3RepositoryBoundary(
      access(["product_admin"], {
        dataOrigin: "internal_seed",
        providerMode: "live",
      }),
      "external_action",
    );

    expect(boundary.providerMode).toBe("capture");
    expect(boundary.externalActionMode).toBe("capture");
  });

  it("rejects seed activity before constructing any repository", () => {
    const buildRepositories = vi.fn(() => ({ reachable: true }));

    expect(() =>
      buildWebsite3PrelaunchRepositoryScope(
        access(["internal_team"], { dataOrigin: "internal_seed" }),
        "read",
        buildRepositories,
      ),
    ).toThrowError(
      new Website3PrelaunchBoundaryError(
        "website3_seed_context_not_approved",
      ),
    );
    expect(buildRepositories).not.toHaveBeenCalled();
  });

  it("fails closed before construction when the provider is disabled", () => {
    const buildRepositories = vi.fn(() => ({ reachable: true }));

    expect(() =>
      buildWebsite3PrelaunchRepositoryScope(
        access(["product_admin"], { providerMode: "disabled" }),
        "external_action",
        buildRepositories,
      ),
    ).toThrowError(
      new Website3PrelaunchBoundaryError("website3_provider_disabled"),
    );
    expect(buildRepositories).not.toHaveBeenCalled();
  });

  it("requires Website 2's canonical capture adapter before capture actions", () => {
    const buildRepositories = vi.fn(() => ({ reachable: true }));

    expect(() =>
      buildWebsite3PrelaunchRepositoryScope(
        access(["product_admin"], { providerMode: "capture" }),
        "external_action",
        buildRepositories,
      ),
    ).toThrowError(
      new Website3PrelaunchBoundaryError(
        "website3_capture_adapter_required",
      ),
    );
    expect(buildRepositories).not.toHaveBeenCalled();
  });

  it("constructs real-data repositories for a live provider action", () => {
    const buildRepositories = vi.fn(() => ({ reachable: true }));
    const scope = buildWebsite3PrelaunchRepositoryScope(
      access(["product_admin"], { providerMode: "live" }),
      "external_action",
      buildRepositories,
    );

    expect(scope.boundary).toMatchObject({
      role: "product_admin",
      dataContext: { dataOrigin: "real", releaseEligible: true },
      providerMode: "live",
      operation: "external_action",
      externalActionMode: "live",
    });
    expect(scope.repositories).toEqual({ reachable: true });
    expect(buildRepositories).toHaveBeenCalledWith(scope.boundary);
  });
});

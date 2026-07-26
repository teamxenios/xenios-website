import {
  effectiveProviderMode,
  type PrelaunchAccessStatus,
  type PrelaunchDataContext,
  type PrelaunchLaunchStatus,
  type PrelaunchProviderMode,
  type PrelaunchRole,
} from "@shared/research/prelaunch";

export const WEBSITE3_PRELAUNCH_ROLES = [
  "product_admin",
  "internal_team",
  "approved_internal_reviewer",
] as const satisfies readonly PrelaunchRole[];

export type Website3PrelaunchRole =
  (typeof WEBSITE3_PRELAUNCH_ROLES)[number];

export type Website3RepositoryOperation =
  | "read"
  | "write"
  | "external_action";

export type Website3ExternalActionMode =
  | "not_requested"
  | "disabled"
  | "capture"
  | "live";

export type Website3RepositoryBoundary = {
  role: Website3PrelaunchRole;
  dataContext: PrelaunchDataContext;
  providerMode: PrelaunchProviderMode;
  launchStatus: PrelaunchLaunchStatus;
  operation: Website3RepositoryOperation;
  externalActionMode: Website3ExternalActionMode;
};

export type Website3PrelaunchBoundaryErrorCode =
  | "website3_prelaunch_role_required"
  | "website3_prelaunch_write_role_required"
  | "website3_seed_context_not_approved"
  | "website3_provider_disabled"
  | "website3_capture_adapter_required";

export class Website3PrelaunchBoundaryError extends Error {
  constructor(readonly code: Website3PrelaunchBoundaryErrorCode) {
    super(code);
    this.name = "Website3PrelaunchBoundaryError";
  }
}

function website3Role(
  roles: readonly PrelaunchRole[],
): Website3PrelaunchRole | null {
  return (
    WEBSITE3_PRELAUNCH_ROLES.find((role) => roles.includes(role)) ?? null
  );
}

/**
 * Resolves Website 3's domain-local repository contract from the canonical
 * server-authoritative pre-launch status. This function does not grant access:
 * callers must receive the status from Website 2's verified pre-launch guard.
 */
export function resolveWebsite3RepositoryBoundary(
  access: PrelaunchAccessStatus,
  operation: Website3RepositoryOperation,
): Website3RepositoryBoundary {
  const role = website3Role(access.roles);
  if (!role) {
    throw new Website3PrelaunchBoundaryError(
      "website3_prelaunch_role_required",
    );
  }
  if (
    operation !== "read" &&
    role === "approved_internal_reviewer"
  ) {
    throw new Website3PrelaunchBoundaryError(
      "website3_prelaunch_write_role_required",
    );
  }

  const providerMode = effectiveProviderMode(
    access.providerMode,
    access.dataContext.dataOrigin,
  );
  return {
    role,
    dataContext: access.dataContext,
    providerMode,
    launchStatus: access.launchStatus,
    operation,
    externalActionMode:
      operation === "external_action" ? providerMode : "not_requested",
  };
}

/**
 * Website 3 has no approved seed namespace, origin columns, reset path, or
 * domain isolation migration yet. Reject the seed context before a production
 * repository or provider is constructed so it cannot fall through to real
 * product, lot, COA, diagnostics, analytics, outbox, or Storage records.
 */
export function requireApprovedWebsite3DataContext(
  boundary: Website3RepositoryBoundary,
): asserts boundary is Website3RepositoryBoundary & {
  dataContext: Extract<PrelaunchDataContext, { dataOrigin: "real" }>;
} {
  if (boundary.dataContext.dataOrigin !== "real") {
    throw new Website3PrelaunchBoundaryError(
      "website3_seed_context_not_approved",
    );
  }
}

/**
 * The canonical capture table is Website 2-owned and no shared capture writer
 * is exported by the frozen contract yet. Do not let an external action fall
 * through to a live provider while that adapter is unavailable.
 */
export function requireWebsite3ExternalActionProvider(
  boundary: Website3RepositoryBoundary,
): void {
  if (boundary.operation !== "external_action") return;
  if (boundary.providerMode === "disabled") {
    throw new Website3PrelaunchBoundaryError("website3_provider_disabled");
  }
  if (boundary.providerMode === "capture") {
    throw new Website3PrelaunchBoundaryError(
      "website3_capture_adapter_required",
    );
  }
}

export type Website3PrelaunchRepositoryScope<T> = {
  boundary: Website3RepositoryBoundary & {
    dataContext: Extract<PrelaunchDataContext, { dataOrigin: "real" }>;
  };
  repositories: T;
};

/**
 * Constructs domain repositories only after role, operation, origin, and
 * provider mode have been resolved from the shared contract.
 */
export function buildWebsite3PrelaunchRepositoryScope<T>(
  access: PrelaunchAccessStatus,
  operation: Website3RepositoryOperation,
  buildRepositories: (
    boundary: Website3RepositoryBoundary & {
      dataContext: Extract<PrelaunchDataContext, { dataOrigin: "real" }>;
    },
  ) => T,
): Website3PrelaunchRepositoryScope<T> {
  const boundary = resolveWebsite3RepositoryBoundary(access, operation);
  requireApprovedWebsite3DataContext(boundary);
  requireWebsite3ExternalActionProvider(boundary);
  return {
    boundary,
    repositories: buildRepositories(boundary),
  };
}

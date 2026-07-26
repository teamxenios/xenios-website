// Canonical Xenios private pre-launch contracts.
//
// This file is deliberately dependency-free so every domain can consume the
// same authorization, seed-origin, provider-mode, and launch-state vocabulary.
// Domain modules may extend these contracts additively; they must not create a
// parallel preview role system or infer internal access in the browser.

export const PRELAUNCH_ROLES = [
  "super_admin",
  "internal_team",
  "product_admin",
  "operations_admin",
  "clinical_admin",
  "approved_internal_reviewer",
] as const;
export type PrelaunchRole = (typeof PRELAUNCH_ROLES)[number];

export const PRELAUNCH_LAUNCH_STATUSES = [
  "internal_build",
  "internal_review",
  "ready_for_real_data",
  "real_data_entered",
  "release_review",
  "public_enabled",
  "paused",
  "disabled",
] as const;
export type PrelaunchLaunchStatus = (typeof PRELAUNCH_LAUNCH_STATUSES)[number];

export const DATA_ORIGINS = ["real", "internal_seed"] as const;
export type DataOrigin = (typeof DATA_ORIGINS)[number];

export const PRELAUNCH_PROVIDER_MODES = ["disabled", "capture", "live"] as const;
export type PrelaunchProviderMode = (typeof PRELAUNCH_PROVIDER_MODES)[number];

export type PrelaunchSeedContext = {
  dataOrigin: "internal_seed";
  seedNamespace: string;
  seedVersion: number;
  resetGroup: string;
  releaseEligible: false;
};

export type RealDataContext = {
  dataOrigin: "real";
  seedNamespace: null;
  seedVersion: null;
  resetGroup: null;
  releaseEligible: true;
};

export type PrelaunchDataContext = PrelaunchSeedContext | RealDataContext;

export type PrelaunchAccessStatus = {
  roles: PrelaunchRole[];
  dataContext: PrelaunchDataContext;
  providerMode: PrelaunchProviderMode;
  launchStatus: PrelaunchLaunchStatus;
};

export type PrelaunchRoleAssignmentView = {
  id: string;
  authUserId: string;
  role: PrelaunchRole;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

export function isPrelaunchRole(value: unknown): value is PrelaunchRole {
  return (
    typeof value === "string" &&
    (PRELAUNCH_ROLES as readonly string[]).includes(value)
  );
}

export function isPrelaunchProviderMode(
  value: unknown,
): value is PrelaunchProviderMode {
  return (
    typeof value === "string" &&
    (PRELAUNCH_PROVIDER_MODES as readonly string[]).includes(value)
  );
}

// Internal seed activity can never reach a live external provider. "capture"
// records the intended action for review; "disabled" rejects it. Real records
// may use live providers only when the domain's own readiness validator agrees.
export function effectiveProviderMode(
  configured: PrelaunchProviderMode,
  dataOrigin: DataOrigin,
): PrelaunchProviderMode {
  if (dataOrigin === "internal_seed" && configured === "live") return "capture";
  return configured;
}

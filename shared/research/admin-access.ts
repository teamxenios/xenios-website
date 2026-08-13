import type { PrelaunchRole } from "./prelaunch";

export const ADMIN_LANDING_ROLE_PRIORITY = [
  "super_admin",
  "internal_team",
  "operations_admin",
  "product_admin",
  "clinical_admin",
  "approved_internal_reviewer",
] as const satisfies readonly PrelaunchRole[];

export type AuthenticatedExperience = "admin" | "member";
export type AuthenticatedLandingDestination =
  | "/admin"
  | "/research/member"
  | "/research/activate";

export type AuthenticatedLandingResponse = {
  ok: true;
  destination: AuthenticatedLandingDestination;
  defaultExperience: AuthenticatedExperience;
  selectedExperience: AuthenticatedExperience;
  availableExperiences: AuthenticatedExperience[];
  primaryAdminRole: PrelaunchRole | null;
  persistedPreference: AuthenticatedExperience | null;
};

export type AuthenticatedLandingErrorCode =
  | "sign_in_required"
  | "recovery_session"
  | "authenticated_access_unavailable"
  | "experience_unavailable"
  | "administrator_role_required"
  | "administrator_access_unavailable";

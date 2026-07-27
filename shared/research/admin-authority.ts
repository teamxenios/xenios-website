export const ADMIN_AUTHORITY_MODES = ["legacy", "dual", "durable"] as const;
export type AdminAuthorityMode = (typeof ADMIN_AUTHORITY_MODES)[number];

export const AUTHENTICATED_EXPERIENCES = ["admin", "member"] as const;
export type AuthenticatedExperience = (typeof AUTHENTICATED_EXPERIENCES)[number];

export type AdminAuthoritySource = "persisted_super_admin" | "legacy_cutover";

export type AuthenticatedLandingResponse = {
  ok: true;
  authUserId: string;
  destination: "/admin" | "/research/member" | "/research/activate";
  preferredExperience: AuthenticatedExperience;
  preferenceVersion: number;
  adminAuthorized: boolean;
  memberAuthorized: boolean;
  authoritySource: AdminAuthoritySource | null;
};

export type AuthenticatedExperienceCommand = {
  experience: AuthenticatedExperience;
  expectedVersion: number;
  idempotencyKey: string;
};

export function isAuthenticatedExperience(
  value: unknown,
): value is AuthenticatedExperience {
  return (
    typeof value === "string" &&
    (AUTHENTICATED_EXPERIENCES as readonly string[]).includes(value)
  );
}


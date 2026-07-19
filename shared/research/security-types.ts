// xenios research: privacy/security/identity shared contract (Super Mega V1).
// The interface CODEX_UI builds trust/consent/security surfaces against.
// All flags default FALSE; UI must render disabled/preview states from these
// real contracts and never invent backend security states.

export const SECURITY_FLAGS = [
  "RESEARCH_IDENTITY_VERIFICATION_ENABLED",
  "RESEARCH_AGE_VERIFICATION_ENABLED",
  "RESEARCH_MEMBER_COVENANT_ENABLED",
  "RESEARCH_MFA_REQUIRED",
  "RESEARCH_PASSKEYS_ENABLED",
  "RESEARCH_PRIVACY_CENTER_ENABLED",
  "RESEARCH_HEALTH_DATA_ENABLED",
  "RESEARCH_LAB_UPLOADS_ENABLED",
  "RESEARCH_WEARABLES_ENABLED",
  "RESEARCH_QUANTUM_COMMERCE_ENABLED",
  "RESEARCH_DRIVE_HEALTH_EXPORTS_ENABLED",
] as const;

export type ConsentKind =
  | "application_terms"
  | "marketing_email"
  | "membership_covenant"
  | "research_use_policy"
  | "age_attestation"
  | "identity_verification"
  | "health_data_collection"
  | "data_export_archival";

// What a signed-in member's security settings page consumes. Booleans only;
// never tokens, secrets, or vendor identifiers.
export type MemberSecurityState = {
  mfaAvailable: boolean;
  mfaEnrolled: boolean;
  passkeysAvailable: boolean;
  identityVerificationRequired: boolean;
  identityVerified: boolean;
  covenantRequired: boolean;
  covenantAcceptedVersion: string | null;
  consents: Array<{ kind: ConsentKind; granted: boolean; policyVersion: string; at: string }>;
};

// Data zones (Super Mega V1 section 10). Every new field/table must declare one.
export type DataZone =
  | "public"          // marketing copy, published education
  | "internal"        // operational metadata, aggregates
  | "confidential"    // applicant/member identity, applications, consent
  | "restricted"      // identity documents, payment references (NOT collected today)
  | "prohibited";     // health data, biometrics: blocked until flags + legal gates

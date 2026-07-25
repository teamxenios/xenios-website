export const CARE_CAPABILITY_STATES = [
  "disabled",
  "pending_contract",
  "pending_coverage",
  "pending_credentials",
  "pending_content",
  "pending_pharmacy",
  "pending_clinicians",
  "pending_qa",
  "enabled",
] as const;

export type CareCapabilityState = (typeof CARE_CAPABILITY_STATES)[number];

export const CARE_ROLES = [
  "care_patient",
  "clinician",
  "clinical_admin",
  "pharmacy_operations",
  "lab_reviewer",
  "clinical_support",
  "care_security_admin",
] as const;

export type CareRole = (typeof CARE_ROLES)[number];

export const CARE_PERMISSIONS = [
  "care:read_self",
  "care:intake_self",
  "care:appointments_self",
  "care:message_self",
  "care:review_assigned",
  "care:prescribe_assigned",
  "care:administer",
  "care:pharmacy_assigned",
  "care:labs_assigned",
  "care:support_assigned",
  "care:security_audit",
] as const;

export type CarePermission = (typeof CARE_PERMISSIONS)[number];

export const CARE_ROLE_PERMISSIONS: Readonly<Record<CareRole, readonly CarePermission[]>> = {
  care_patient: ["care:read_self", "care:intake_self", "care:appointments_self", "care:message_self"],
  clinician: ["care:review_assigned", "care:prescribe_assigned"],
  clinical_admin: ["care:administer"],
  pharmacy_operations: ["care:pharmacy_assigned"],
  lab_reviewer: ["care:labs_assigned"],
  clinical_support: ["care:support_assigned"],
  care_security_admin: ["care:security_audit"],
};

export const NON_CARE_ROLES = [
  "affiliate",
  "mitch",
  "fulfillment",
  "trainer",
  "research_admin",
] as const;

export type NonCareRole = (typeof NON_CARE_ROLES)[number];
export type AnyPlatformRole = CareRole | NonCareRole;

export const CARE_RAILS = ["care", "research", "diagnostics", "lifestyle"] as const;
export type PlatformRail = (typeof CARE_RAILS)[number];

declare const careRecordBrand: unique symbol;
declare const researchRecordBrand: unique symbol;

export type CareRecordId = string & { readonly [careRecordBrand]: "care" };
export type ResearchRecordId = string & { readonly [researchRecordBrand]: "research" };

export interface CarePrincipal {
  subjectId: string;
  roles: readonly AnyPlatformRole[];
  patientId?: string;
  clinicianId?: string;
}

export interface CareCapabilityStatus {
  rail: "care";
  state: CareCapabilityState;
  enabled: boolean;
  publicMessage: string;
  checkedAt: string;
}

export interface ResearchToCareDiscovery {
  sourceRail: "research";
  destinationRail: "care";
  intent: "learn_about_care";
  subjectId: string;
  consentedAt: string;
}

export const CARE_ROUTE_CONTRACTS = {
  publicShell: "/care",
  status: "/api/care/status",
  eligibility: "/api/care/eligibility",
  intake: "/api/care/intake",
  appointments: "/api/care/appointments",
  reviews: "/api/care/reviews",
  prescriptions: "/api/care/prescriptions",
  pharmacy: "/api/care/pharmacy",
  instructions: "/api/care/instructions",
  supplies: "/api/care/supplies",
  labs: "/api/care/labs",
  messages: "/api/care/messages",
  support: "/api/care/support",
  adverseEvents: "/api/care/adverse-events",
  audit: "/api/care/audit",
  discovery: "/api/care/discovery",
} as const;

export function isCareRole(role: string): role is CareRole {
  return (CARE_ROLES as readonly string[]).includes(role);
}

export function hasCarePermission(
  principal: Pick<CarePrincipal, "roles">,
  permission: CarePermission,
): boolean {
  return principal.roles.some(
    (role) => isCareRole(role) && CARE_ROLE_PERMISSIONS[role].includes(permission),
  );
}

export function createResearchToCareDiscovery(
  subjectId: string,
  consentedAt: string,
): ResearchToCareDiscovery {
  return {
    sourceRail: "research",
    destinationRail: "care",
    intent: "learn_about_care",
    subjectId,
    consentedAt,
  };
}

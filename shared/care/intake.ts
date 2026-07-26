import type { CareRecordId } from "./contracts";
import type { CareConsentStatus } from "./consent";
import type { CareEligibilityDecision } from "./eligibility";

export const CARE_INTAKE_FIELD_KINDS = [
  "text",
  "boolean",
  "date",
  "single_select",
  "multi_select",
] as const;

export type CareIntakeFieldKind = (typeof CARE_INTAKE_FIELD_KINDS)[number];

export interface CareIntakeFieldDefinition {
  key: string;
  kind: CareIntakeFieldKind;
  required: boolean;
  options: readonly string[];
}

export interface CareIntakeDefinition {
  id: CareRecordId;
  version: string;
  status: "draft" | "approved" | "superseded";
  schemaHash: string;
  fields: readonly CareIntakeFieldDefinition[];
  approvedAt: string | null;
}

export type CareIntakeResponseValue =
  | string
  | boolean
  | readonly string[];

export interface CareClinicalIntake {
  id: CareRecordId;
  patientId: CareRecordId;
  definitionId: CareRecordId;
  definitionVersion: string;
  telehealthConsentEventId: CareRecordId;
  privacyConsentEventId: CareRecordId;
  status: "draft" | "submitted";
  version: number;
  createdAt: string;
  submittedAt: string | null;
}

export interface CareIntakeRevision {
  id: CareRecordId;
  intakeId: CareRecordId;
  patientId: CareRecordId;
  version: number;
  responses: Readonly<Record<string, CareIntakeResponseValue>>;
  idempotencyKey: string;
  createdAt: string;
}

export interface CareIntakeStartContext {
  eligibility: CareEligibilityDecision;
  definition: CareIntakeDefinition | null;
  telehealthConsent: CareConsentStatus;
  privacyConsent: CareConsentStatus;
}

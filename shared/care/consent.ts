import type { CareRecordId } from "./contracts";

export const CARE_CONSENT_KINDS = ["telehealth", "privacy_notice"] as const;
export type CareConsentKind = (typeof CARE_CONSENT_KINDS)[number];

export interface CareConsentDocument {
  id: CareRecordId;
  kind: CareConsentKind;
  version: string;
  contentHash: string;
  status: "draft" | "approved" | "superseded";
  approvedAt: string | null;
  effectiveAt: string | null;
}

export interface CareConsentEvent {
  id: CareRecordId;
  patientId: CareRecordId;
  documentId: CareRecordId;
  kind: CareConsentKind;
  documentVersion: string;
  action: "granted" | "revoked";
  occurredAt: string;
}

export interface CareConsentStatus {
  kind: CareConsentKind;
  requiredDocument: CareConsentDocument | null;
  activeEvent: CareConsentEvent | null;
  satisfied: boolean;
  reason:
    | "document_unavailable"
    | "not_granted"
    | "revoked"
    | "wrong_version"
    | "active";
}

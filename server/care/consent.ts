import type {
  CareConsentDocument,
  CareConsentEvent,
  CareConsentKind,
  CareConsentStatus,
} from "@shared/care/consent";
import type { CareRecordId } from "@shared/care/contracts";

export function resolveCareConsentStatus(
  kind: CareConsentKind,
  requiredDocument: CareConsentDocument | null,
  events: readonly CareConsentEvent[],
  expectedPatientId?: CareRecordId,
): CareConsentStatus {
  if (
    !requiredDocument ||
    requiredDocument.kind !== kind ||
    requiredDocument.status !== "approved" ||
    !requiredDocument.approvedAt ||
    !requiredDocument.effectiveAt
  ) {
    return {
      kind,
      requiredDocument: null,
      activeEvent: null,
      satisfied: false,
      reason: "document_unavailable",
    };
  }

  const latest = [...events]
    .filter(
      (event) =>
        event.kind === kind &&
        (!expectedPatientId || event.patientId === expectedPatientId),
    )
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];

  if (!latest) {
    return {
      kind,
      requiredDocument,
      activeEvent: null,
      satisfied: false,
      reason: "not_granted",
    };
  }
  if (latest.action === "revoked") {
    return {
      kind,
      requiredDocument,
      activeEvent: null,
      satisfied: false,
      reason: "revoked",
    };
  }
  if (
    latest.documentId !== requiredDocument.id ||
    latest.documentVersion !== requiredDocument.version
  ) {
    return {
      kind,
      requiredDocument,
      activeEvent: null,
      satisfied: false,
      reason: "wrong_version",
    };
  }
  return {
    kind,
    requiredDocument,
    activeEvent: latest,
    satisfied: true,
    reason: "active",
  };
}

export function createCareConsentEvent(input: {
  id: string;
  patientId: CareRecordId;
  document: CareConsentDocument;
  action: "granted" | "revoked";
  occurredAt: Date;
}): CareConsentEvent {
  if (
    input.document.status !== "approved" ||
    !input.document.approvedAt ||
    !input.document.effectiveAt
  ) {
    throw new Error("care_consent_document_unavailable");
  }
  return {
    id: input.id as CareRecordId,
    patientId: input.patientId,
    documentId: input.document.id,
    kind: input.document.kind,
    documentVersion: input.document.version,
    action: input.action,
    occurredAt: input.occurredAt.toISOString(),
  };
}

import type { CareConsentKind, CareConsentStatus } from "@shared/care/consent";
import type { CareRecordId } from "@shared/care/contracts";
import type { CareEligibilityRepository } from "./eligibility-repository";

export interface CareConsentRepository {
  recordConsent(input: {
    patientId: CareRecordId;
    kind: CareConsentKind;
    documentVersion: string;
    action: "granted" | "revoked";
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<CareConsentStatus>;
}

export function careConsentRepositoryFromEligibility(
  repository: CareEligibilityRepository,
): CareConsentRepository {
  return { recordConsent: repository.recordConsent.bind(repository) };
}

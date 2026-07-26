import { describe, expect, it } from "vitest";
import type {
  CareConsentDocument,
  CareConsentEvent,
} from "@shared/care/consent";
import type { CareRecordId } from "@shared/care/contracts";
import { createCareConsentEvent, resolveCareConsentStatus } from "./consent";

const patientId = "patient-1" as CareRecordId;
const document: CareConsentDocument = {
  id: "document-1" as CareRecordId,
  kind: "telehealth",
  version: "approved-v1",
  contentHash: "sha256:approved",
  status: "approved",
  approvedAt: "2026-07-25T18:00:00.000Z",
  effectiveAt: "2026-07-25T18:00:00.000Z",
};

function event(
  overrides: Partial<CareConsentEvent> = {},
): CareConsentEvent {
  return {
    id: "event-1" as CareRecordId,
    patientId,
    documentId: document.id,
    kind: "telehealth",
    documentVersion: document.version,
    action: "granted",
    occurredAt: "2026-07-25T19:00:00.000Z",
    ...overrides,
  };
}

describe("Care PR 2 consent foundation", () => {
  it("fails closed without an exact approved effective document", () => {
    expect(resolveCareConsentStatus("telehealth", null, [])).toMatchObject({
      satisfied: false,
      reason: "document_unavailable",
    });
    expect(
      resolveCareConsentStatus(
        "telehealth",
        { ...document, status: "draft", approvedAt: null },
        [],
      ),
    ).toMatchObject({
      satisfied: false,
      reason: "document_unavailable",
    });
  });

  it("rejects stale versions and treats revocation as a later immutable event", () => {
    expect(
      resolveCareConsentStatus("telehealth", document, [
        event({ documentVersion: "old-v1" }),
      ]),
    ).toMatchObject({ satisfied: false, reason: "wrong_version" });

    expect(
      resolveCareConsentStatus("telehealth", document, [
        event(),
        event({
          id: "event-2" as CareRecordId,
          action: "revoked",
          occurredAt: "2026-07-25T19:30:00.000Z",
        }),
      ]),
    ).toMatchObject({ satisfied: false, reason: "revoked" });
  });

  it("never accepts another patient's consent event", () => {
    expect(
      resolveCareConsentStatus(
        "telehealth",
        document,
        [
          event({
            patientId: "other-patient" as CareRecordId,
          }),
        ],
        patientId,
      ),
    ).toMatchObject({ satisfied: false, reason: "not_granted" });
  });

  it("binds a new event to the exact approved version", () => {
    const created = createCareConsentEvent({
      id: "event-3",
      patientId,
      document,
      action: "granted",
      occurredAt: new Date("2026-07-25T20:00:00.000Z"),
    });
    expect(created).toMatchObject({
      patientId,
      documentId: document.id,
      documentVersion: "approved-v1",
      action: "granted",
    });
  });
});

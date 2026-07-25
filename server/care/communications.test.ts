import { describe, expect, it } from "vitest";
import type {
  CareAdverseEvent,
  CareConsent,
  CareLabShare,
} from "@shared/care/communications";
import { CARE_EMERGENCY_BOUNDARY } from "@shared/care/communications";
import type { CareRecordId } from "@shared/care/contracts";
import {
  affiliateCompensationAllowed,
  canShareLab,
  createCareAuditEvent,
  createSecureCareMessage,
  revokeLabShare,
  transitionAdverseEvent,
} from "./communications";

const rid = (value: string) => value as CareRecordId;
const labConsent: CareConsent = {
  id: rid("care-consent-lab-1"),
  patientId: "patient-1",
  kind: "lab_share",
  grantedAt: "2026-07-25T12:00:00Z",
  revokedAt: null,
  version: 1,
};
const labShare: CareLabShare = {
  id: rid("care-lab-share-1"),
  patientId: "patient-1",
  labOrderId: rid("care-lab-order-1"),
  consentId: labConsent.id,
  recipientRole: "lab_reviewer",
  recipientId: "reviewer-1",
  status: "prepared",
};

describe("consent-bound lab sharing", () => {
  it("allows only the exact clinician/lab recipient and denies trainers", () => {
    expect(canShareLab({
      patientId: "patient-1",
      consent: labConsent,
      share: labShare,
      requestingRole: "lab_reviewer",
      requestingSubjectId: "reviewer-1",
    })).toBe(true);
    expect(canShareLab({
      patientId: "patient-1",
      consent: labConsent,
      share: labShare,
      requestingRole: "trainer",
      requestingSubjectId: "trainer-1",
    })).toBe(false);
  });

  it("stops access after consent revocation", () => {
    const revokedConsent = { ...labConsent, revokedAt: "2026-07-25T13:00:00Z" };
    const revokedShare = revokeLabShare(labShare, revokedConsent);
    expect(revokedShare.status).toBe("revoked");
    expect(canShareLab({
      patientId: "patient-1",
      consent: revokedConsent,
      share: revokedShare,
      requestingRole: "lab_reviewer",
      requestingSubjectId: "reviewer-1",
    })).toBe(false);
  });
});

describe("secure clinical messaging", () => {
  const messagingConsent: CareConsent = {
    ...labConsent,
    id: rid("care-consent-message-1"),
    kind: "secure_messaging",
  };

  it("records only portal messages with active patient consent", () => {
    expect(createSecureCareMessage({
      id: "care-message-1",
      patientId: "patient-1",
      threadId: rid("care-thread-1"),
      senderSubjectId: "patient-1",
      channel: "care_portal",
      consent: messagingConsent,
      body: "Please review my Care question.",
      createdAt: new Date("2026-07-25T12:00:00Z"),
    }).channel).toBe("care_portal");
  });

  it("never treats email or Telegram as the clinical record", () => {
    for (const channel of ["email", "telegram"] as const) {
      expect(() => createSecureCareMessage({
        id: "care-message-2",
        patientId: "patient-1",
        threadId: rid("care-thread-1"),
        senderSubjectId: "patient-1",
        channel,
        consent: messagingConsent,
        body: "Sensitive message",
        createdAt: new Date(),
      })).toThrow("notification_channel_not_clinical_record");
    }
  });
});

describe("adverse event routing and emergency boundary", () => {
  const event: CareAdverseEvent = {
    id: rid("care-ae-1"),
    patientId: "patient-1",
    prescriptionId: null,
    state: "reported",
    urgency: "unassessed",
    assignedClinicianId: null,
    pharmacyAssignmentId: null,
    auditRequired: true,
  };

  it("requires triage before closure and explicit clinician/pharmacy routing", () => {
    expect(() => transitionAdverseEvent(event, "closed")).toThrow("invalid_adverse_event_transition");
    const triaged = transitionAdverseEvent(event, "triaged", { urgency: "urgent" });
    expect(() => transitionAdverseEvent(triaged, "clinician_routed")).toThrow("adverse_event_clinician_required");
    const routed = transitionAdverseEvent(triaged, "clinician_routed", { assignedClinicianId: "clinician-1" });
    const noticed = transitionAdverseEvent(routed, "pharmacy_notified", { pharmacyAssignmentId: rid("care-pharmacy-1") });
    expect(transitionAdverseEvent(noticed, "closed").state).toBe("closed");
  });

  it("publishes an accessible emergency boundary without pretending to triage", () => {
    expect(CARE_EMERGENCY_BOUNDARY).toContain("local emergency services");
    expect(CARE_EMERGENCY_BOUNDARY).toContain("Do not wait");
  });
});

describe("privacy, audit, and affiliate boundaries", () => {
  it("creates metadata-only audit records without accepting a clinical payload", () => {
    const event = createCareAuditEvent({
      action: "lab_share_revoked",
      actorSubjectId: "security-1",
      patientId: "patient-1",
      recordId: rid("care-lab-share-1"),
      occurredAt: "2026-07-25T13:00:00Z",
    });
    expect(event).not.toHaveProperty("body");
    expect(event).not.toHaveProperty("labResult");
    expect(event).not.toHaveProperty("message");
  });

  it("denies affiliate compensation for every clinical value event", () => {
    for (const event of [
      "prescription",
      "treatment_approval",
      "diagnosis",
      "medication_value",
      "pharmacy_fill",
      "lab_result",
    ]) {
      expect(affiliateCompensationAllowed(event)).toBe(false);
    }
  });
});

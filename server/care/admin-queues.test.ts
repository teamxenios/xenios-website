import { describe, expect, it } from "vitest";
import type { CareAppointment } from "@shared/care/appointments";
import {
  CARE_ADMIN_ACTIONS,
  careAdminAppointmentActionStates,
  careAdminAppointmentBucket,
  careAdminPharmacyOrderActionStates,
  careAdminPharmacyOrderBucket,
  careAdminPrescriptionActionStates,
  summarizeCareAdminAppointmentQueue,
  summarizeCareAdminPharmacyOrderQueue,
  summarizeCareAdminPrescriptionQueue,
  type CareAdminAction,
} from "@shared/care/admin-queues";
import {
  CARE_CLINICAL_CAPABILITIES_DISABLED,
  type CareClinicalCapabilityFlags,
} from "@shared/care/clinical-actions";
import type { CareRecordId } from "@shared/care/contracts";
import type {
  CarePharmacyOrder,
  CarePrescription,
} from "@shared/care/prescriptions";
import {
  sortCareAdminAppointmentQueue,
  sortCareAdminPharmacyOrderQueue,
  sortCareAdminPrescriptionQueue,
  toCareAdminAppointmentQueueItem,
  toCareAdminPharmacyOrderQueueItem,
  toCareAdminPrescriptionQueueItem,
  type CareAdminPrescriptionFacts,
} from "./admin-queues";

const NOW = "2026-07-26T18:00:00.000Z";
const PATIENT_ID = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const APPOINTMENT_ID = "22222222-2222-4222-8222-222222222222" as CareRecordId;
const INTAKE_ID = "33333333-3333-4333-8333-333333333333" as CareRecordId;
const LOCATION_ID = "77777777-7777-4777-8777-777777777777" as CareRecordId;
const CLINICIAN_ID = "55555555-5555-4555-8555-555555555555";
const PRESCRIPTION_ID = "66666666-6666-4666-8666-666666666666" as CareRecordId;
const REVIEW_ID = "44444444-4444-4444-8444-444444444444" as CareRecordId;
const ORDER_ID = "99999999-9999-4999-8999-999999999999" as CareRecordId;
const PHARMACY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as CareRecordId;
const CONTENT_SOURCE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as CareRecordId;

const ALL_ON: CareClinicalCapabilityFlags = {
  provider_actions: true,
  prescribing: true,
  clinical_fulfillment: true,
  external_communications: true,
  real_patient_data: true,
};

function appointment(
  overrides: Partial<CareAppointment> = {},
): CareAppointment {
  return {
    id: APPOINTMENT_ID,
    patientId: PATIENT_ID,
    intakeId: INTAKE_ID,
    patientLocationId: LOCATION_ID,
    patientStateCode: "IL",
    assignedClinicianUserId: null,
    clinicianCoverageId: null,
    status: "requested",
    startsAt: null,
    endsAt: null,
    telehealthReady: false,
    version: 0,
    createdAt: "2026-07-25T20:00:00.000Z",
    updatedAt: "2026-07-25T20:00:00.000Z",
    ...overrides,
  };
}

function prescription(
  overrides: Partial<CarePrescription> = {},
): CarePrescription {
  return {
    id: PRESCRIPTION_ID,
    patientId: PATIENT_ID,
    appointmentId: APPOINTMENT_ID,
    clinicianReviewId: REVIEW_ID,
    prescribingClinicianUserId: CLINICIAN_ID,
    status: "signed",
    formulation: null,
    concentration: null,
    route: null,
    quantity: null,
    directions: null,
    refills: null,
    verifiedContentSourceId: CONTENT_SOURCE_ID,
    version: 1,
    signedAt: "2026-07-25T21:00:00.000Z",
    supersedesPrescriptionId: null,
    createdAt: "2026-07-25T20:00:00.000Z",
    updatedAt: "2026-07-25T21:00:00.000Z",
    ...overrides,
  };
}

function facts(
  overrides: Partial<CareAdminPrescriptionFacts> = {},
): CareAdminPrescriptionFacts {
  return { prescription: prescription(), pharmacyOrderId: null, ...overrides };
}

function order(overrides: Partial<CarePharmacyOrder> = {}): CarePharmacyOrder {
  return {
    id: ORDER_ID,
    patientId: PATIENT_ID,
    prescriptionId: PRESCRIPTION_ID,
    assignedPharmacyId: PHARMACY_ID,
    patientStateCode: "IL",
    status: "pending_pharmacy",
    clarificationOpen: false,
    trackingReferencePresent: false,
    version: 0,
    createdAt: "2026-07-25T22:00:00.000Z",
    updatedAt: "2026-07-25T22:00:00.000Z",
    ...overrides,
  };
}

describe("Care admin appointment bucketing", () => {
  it("puts an unassigned request in front of the assignment control", () => {
    expect(
      careAdminAppointmentBucket({
        status: "requested",
        clinicianAssigned: false,
        endsAt: null,
        now: NOW,
      }),
    ).toBe("needs_assignment");
  });

  it("moves an assigned request to scheduling", () => {
    expect(
      careAdminAppointmentBucket({
        status: "requested",
        clinicianAssigned: true,
        endsAt: null,
        now: NOW,
      }),
    ).toBe("needs_scheduling");
  });

  it("keeps a future scheduled appointment out of the no show bucket", () => {
    expect(
      careAdminAppointmentBucket({
        status: "scheduled",
        clinicianAssigned: true,
        endsAt: "2026-07-26T19:00:00.000Z",
        now: NOW,
      }),
    ).toBe("scheduled");
  });

  it("flags a scheduled appointment whose booked time has passed", () => {
    expect(
      careAdminAppointmentBucket({
        status: "scheduled",
        clinicianAssigned: true,
        endsAt: "2026-07-26T17:00:00.000Z",
        now: NOW,
      }),
    ).toBe("no_show_candidate");
  });

  it("never calls a checked in appointment a no show candidate", () => {
    expect(
      careAdminAppointmentBucket({
        status: "checked_in",
        clinicianAssigned: true,
        endsAt: "2026-07-26T17:00:00.000Z",
        now: NOW,
      }),
    ).toBe("awaiting_completion");
  });

  it.each(["completed", "cancelled", "no_show"] as const)(
    "leaves a %s appointment with no admin action",
    (status) => {
      expect(
        careAdminAppointmentBucket({
          status,
          clinicianAssigned: true,
          endsAt: "2026-07-26T17:00:00.000Z",
          now: NOW,
        }),
      ).toBe("no_action_needed");
    },
  );
});

describe("Care admin appointment projection", () => {
  it("drops the patient id, clinician id, and state code", () => {
    const item = toCareAdminAppointmentQueueItem(
      appointment({ assignedClinicianUserId: CLINICIAN_ID }),
      NOW,
    );
    const serialized = JSON.stringify(item);
    for (const secret of [PATIENT_ID, CLINICIAN_ID, INTAKE_ID, LOCATION_ID, "IL"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(item.clinicianAssigned).toBe(true);
  });

  it("keeps the id and version the write contracts require", () => {
    const item = toCareAdminAppointmentQueueItem(
      appointment({ version: 4 }),
      NOW,
    );
    expect(item.appointmentId).toBe(APPOINTMENT_ID);
    expect(item.version).toBe(4);
  });

  it("reports scheduled only when both ends of the booking exist", () => {
    expect(
      toCareAdminAppointmentQueueItem(
        appointment({ startsAt: "2026-07-26T19:00:00.000Z", endsAt: null }),
        NOW,
      ).scheduled,
    ).toBe(false);
  });

  it("orders decisions first and is stable within a bucket", () => {
    const first = toCareAdminAppointmentQueueItem(appointment(), NOW);
    const later = toCareAdminAppointmentQueueItem(
      appointment({
        id: "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b" as CareRecordId,
        createdAt: "2026-07-25T23:00:00.000Z",
      }),
      NOW,
    );
    const scheduled = toCareAdminAppointmentQueueItem(
      appointment({
        id: "2c2c2c2c-2c2c-4c2c-8c2c-2c2c2c2c2c2c" as CareRecordId,
        status: "scheduled",
        assignedClinicianUserId: CLINICIAN_ID,
        startsAt: "2026-07-26T19:00:00.000Z",
        endsAt: "2026-07-26T19:30:00.000Z",
      }),
      NOW,
    );
    const sorted = sortCareAdminAppointmentQueue([scheduled, later, first]);
    expect(sorted.map((item) => item.bucket)).toEqual([
      "needs_assignment",
      "needs_assignment",
      "scheduled",
    ]);
    expect(sorted[0].appointmentId).toBe(APPOINTMENT_ID);
    expect(sortCareAdminAppointmentQueue(sorted)).toEqual(sorted);
  });

  it("counts each bucket plainly and invents no total", () => {
    expect(summarizeCareAdminAppointmentQueue([])).toEqual({
      total: 0,
      needsAssignment: 0,
      needsScheduling: 0,
      scheduled: 0,
      awaitingCompletion: 0,
      noShowCandidates: 0,
    });
  });
});

describe("Care admin prescription projection", () => {
  it("carries no prescription content", () => {
    const item = toCareAdminPrescriptionQueueItem(facts());
    expect(item).not.toHaveProperty("formulation");
    expect(item).not.toHaveProperty("directions");
    expect(JSON.stringify(item)).not.toContain(PATIENT_ID);
  });

  it("separates prescriptions that still need a pharmacy", () => {
    expect(toCareAdminPrescriptionQueueItem(facts()).bucket).toBe(
      "awaiting_pharmacy_assignment",
    );
    expect(
      toCareAdminPrescriptionQueueItem(facts({ pharmacyOrderId: ORDER_ID }))
        .bucket,
    ).toBe("pharmacy_assigned");
  });

  it("puts unassigned prescriptions first", () => {
    const assigned = toCareAdminPrescriptionQueueItem(
      facts({
        prescription: prescription({
          id: "6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b" as CareRecordId,
          createdAt: "2026-07-24T20:00:00.000Z",
        }),
        pharmacyOrderId: ORDER_ID,
      }),
    );
    const waiting = toCareAdminPrescriptionQueueItem(facts());
    const sorted = sortCareAdminPrescriptionQueue([assigned, waiting]);
    expect(sorted[0].prescriptionId).toBe(PRESCRIPTION_ID);
  });

  it("summarizes what is actually waiting", () => {
    const queue = [
      toCareAdminPrescriptionQueueItem(facts()),
      toCareAdminPrescriptionQueueItem(
        facts({
          prescription: prescription({
            id: "6c6c6c6c-6c6c-4c6c-8c6c-6c6c6c6c6c6c" as CareRecordId,
          }),
          pharmacyOrderId: ORDER_ID,
        }),
      ),
    ];
    expect(summarizeCareAdminPrescriptionQueue(queue)).toEqual({
      total: 2,
      awaitingPharmacyAssignment: 1,
      pharmacyAssigned: 1,
    });
  });
});

describe("Care admin pharmacy order projection", () => {
  it("raises an open clarification above the order status", () => {
    expect(
      careAdminPharmacyOrderBucket({
        status: "accepted",
        clarificationOpen: true,
      }),
    ).toBe("clarification_open");
  });

  it.each([
    ["pending_pharmacy", "awaiting_pharmacy"],
    ["received", "in_fulfillment"],
    ["dispensed", "in_fulfillment"],
    ["shipped", "in_fulfillment"],
    ["delivered", "closed"],
    ["rejected", "closed"],
    ["cancelled", "closed"],
  ] as const)("buckets %s as %s", (status, bucket) => {
    expect(
      careAdminPharmacyOrderBucket({ status, clarificationOpen: false }),
    ).toBe(bucket);
  });

  it("never sends the pharmacy id, patient id, or state code", () => {
    const serialized = JSON.stringify(toCareAdminPharmacyOrderQueueItem(order()));
    for (const secret of [PATIENT_ID, PHARMACY_ID, "IL"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("puts an open question first", () => {
    const asking = toCareAdminPharmacyOrderQueueItem(
      order({
        id: "9b9b9b9b-9b9b-4b9b-8b9b-9b9b9b9b9b9b" as CareRecordId,
        status: "accepted",
        clarificationOpen: true,
        createdAt: "2026-07-25T23:00:00.000Z",
      }),
    );
    const waiting = toCareAdminPharmacyOrderQueueItem(order());
    expect(
      sortCareAdminPharmacyOrderQueue([waiting, asking])[0].bucket,
    ).toBe("clarification_open");
  });

  it("counts every bucket", () => {
    expect(
      summarizeCareAdminPharmacyOrderQueue([
        toCareAdminPharmacyOrderQueueItem(order()),
      ]),
    ).toEqual({
      total: 1,
      awaitingPharmacy: 1,
      clarificationOpen: 0,
      inFulfillment: 0,
      closed: 0,
    });
  });
});

describe("Care admin action controls", () => {
  const shipped = {
    careEnabled: true,
    flags: CARE_CLINICAL_CAPABILITIES_DISABLED,
  };

  it("disables every control with the shipped capability flags", () => {
    const seen: CareAdminAction[] = [];
    for (const state of [
      ...careAdminAppointmentActionStates({
        item: { status: "requested", clinicianAssigned: false },
        ...shipped,
      }),
      ...careAdminPrescriptionActionStates({
        item: { status: "signed", pharmacyAssigned: false },
        ...shipped,
      }),
      ...careAdminPharmacyOrderActionStates({
        item: { clarificationOpen: true },
        ...shipped,
      }),
    ]) {
      seen.push(state.action);
      expect(state.enabled).toBe(false);
      expect(state.blockedReason).toBe("capability_disabled");
      expect(state.explanation.length).toBeGreaterThan(0);
    }
    // Every named admin action is covered by the three queues.
    expect([...seen].sort()).toEqual([...CARE_ADMIN_ACTIONS].sort());
  });

  it("stays disabled while Care itself is not active", () => {
    for (const state of careAdminAppointmentActionStates({
      item: { status: "requested", clinicianAssigned: false },
      careEnabled: false,
      flags: ALL_ON,
    })) {
      expect(state.enabled).toBe(false);
      expect(state.blockedReason).toBe("care_not_active");
    }
  });

  it("checks the capability before any workflow precondition", () => {
    const [assign] = careAdminAppointmentActionStates({
      item: { status: "requested", clinicianAssigned: true },
      ...shipped,
    });
    expect(assign.blockedReason).toBe("capability_disabled");
  });

  it("explains the real workflow precondition once capabilities are on", () => {
    const states = careAdminAppointmentActionStates({
      item: { status: "requested", clinicianAssigned: false },
      careEnabled: true,
      flags: ALL_ON,
    });
    expect(states.map((state) => [state.action, state.blockedReason])).toEqual([
      ["assign_clinician", null],
      ["schedule_appointment", "clinician_assignment_required"],
      ["mark_no_show", "appointment_not_scheduled"],
    ]);
  });

  it("refuses to offer a second clinician assignment", () => {
    const [assign, schedule] = careAdminAppointmentActionStates({
      item: { status: "requested", clinicianAssigned: true },
      careEnabled: true,
      flags: ALL_ON,
    });
    expect(assign.blockedReason).toBe("clinician_already_assigned");
    expect(schedule.enabled).toBe(true);
  });

  it("refuses to assign a pharmacy twice or before the signature", () => {
    expect(
      careAdminPrescriptionActionStates({
        item: { status: "signed", pharmacyAssigned: true },
        careEnabled: true,
        flags: ALL_ON,
      })[0].blockedReason,
    ).toBe("pharmacy_already_assigned");
    expect(
      careAdminPrescriptionActionStates({
        item: { status: "draft", pharmacyAssigned: false },
        careEnabled: true,
        flags: ALL_ON,
      })[0].blockedReason,
    ).toBe("prescription_not_signed");
  });

  it("offers no clarification resolution when nothing was asked", () => {
    expect(
      careAdminPharmacyOrderActionStates({
        item: { clarificationOpen: false },
        careEnabled: true,
        flags: ALL_ON,
      })[0].blockedReason,
    ).toBe("no_open_clarification");
  });

  it("names the real contract each control would call", () => {
    for (const state of careAdminAppointmentActionStates({
      item: { status: "scheduled", clinicianAssigned: true },
      ...shipped,
    })) {
      expect(state.contract.startsWith("/api/care/")).toBe(true);
    }
  });
});

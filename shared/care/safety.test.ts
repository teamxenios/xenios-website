import { describe, expect, it } from "vitest";
import type { CareRecordId } from "./contracts";
import {
  CARE_ADVERSE_EVENT_STORAGE_TABLES,
  CARE_LAB_STORAGE_TABLES,
  careStorageMissing,
  countCareLabResultsAwaitingRelease,
  isCareLabResultReleasedToPatient,
  selectCareLabResultsForPatient,
  toCareAdverseEventItem,
  toCareLabReviewerItem,
  type CareAdverseEventRecord,
  type CareLabResultRecord,
} from "./safety";

const PATIENT_ID = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const RESULT_ID = "22222222-2222-4222-8222-222222222222" as CareRecordId;
const REVIEWER_ID = "33333333-3333-4333-8333-333333333333";

function labResult(
  overrides: Partial<CareLabResultRecord> = {},
): CareLabResultRecord {
  return {
    id: RESULT_ID,
    patientId: PATIENT_ID,
    reviewId: null,
    assignedReviewerUserId: REVIEWER_ID,
    panelName: "Synthetic panel A",
    status: "resulted",
    orderedAt: "2026-07-20T10:00:00.000Z",
    collectedAt: "2026-07-21T10:00:00.000Z",
    resultedAt: "2026-07-22T10:00:00.000Z",
    releasedToPatientAt: null,
    releasedByUserId: null,
    updatedAt: "2026-07-22T10:00:00.000Z",
    ...overrides,
  };
}

const released = () =>
  labResult({
    status: "released",
    releasedToPatientAt: "2026-07-23T10:00:00.000Z",
    releasedByUserId: REVIEWER_ID,
  });

describe("Care lab result release gate", () => {
  it("treats a fully released result as readable by the patient", () => {
    expect(isCareLabResultReleasedToPatient(released())).toBe(true);
  });

  it.each([
    ["a result the clinician has not released", labResult()],
    ["an ordered result", labResult({ status: "ordered" })],
    ["a collected result", labResult({ status: "collected" })],
    ["a cancelled result", labResult({ status: "cancelled" })],
    [
      "a released status with no release time",
      labResult({ status: "released", releasedByUserId: REVIEWER_ID }),
    ],
    [
      "a released status with no named releaser",
      labResult({
        status: "released",
        releasedToPatientAt: "2026-07-23T10:00:00.000Z",
      }),
    ],
    [
      "a release time recorded without the released status",
      labResult({
        releasedToPatientAt: "2026-07-23T10:00:00.000Z",
        releasedByUserId: REVIEWER_ID,
      }),
    ],
    [
      "a blank releaser id",
      labResult({
        status: "released",
        releasedToPatientAt: "2026-07-23T10:00:00.000Z",
        releasedByUserId: "   ",
      }),
    ],
  ])("fails closed on %s", (_label, record) => {
    expect(isCareLabResultReleasedToPatient(record)).toBe(false);
  });

  it("drops every unreleased result from the patient projection", () => {
    const items = selectCareLabResultsForPatient([
      labResult(),
      released(),
      labResult({ status: "cancelled" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].releasedAt).toBe("2026-07-23T10:00:00.000Z");
  });

  it("does not leak the identifier or panel name of a withheld result", () => {
    const withheld = labResult({
      id: "44444444-4444-4444-8444-444444444444" as CareRecordId,
      panelName: "Withheld synthetic panel",
    });
    const body = JSON.stringify(selectCareLabResultsForPatient([withheld]));
    expect(body).not.toContain(withheld.id);
    expect(body).not.toContain("Withheld synthetic panel");
  });

  it("counts work in progress without disclosing it, and ignores cancellations", () => {
    expect(
      countCareLabResultsAwaitingRelease([
        labResult(),
        labResult({ status: "ordered" }),
        released(),
        labResult({ status: "cancelled" }),
      ]),
    ).toBe(2);
  });

  it("gives the reviewer workflow state without a patient identifier", () => {
    const item = toCareLabReviewerItem(labResult());
    expect(item.status).toBe("resulted");
    expect(item.releasedToPatient).toBe(false);
    expect(JSON.stringify(item)).not.toContain(PATIENT_ID);
  });
});

describe("Care adverse event projection", () => {
  function report(
    overrides: Partial<CareAdverseEventRecord> = {},
  ): CareAdverseEventRecord {
    return {
      id: "55555555-5555-4555-8555-555555555555" as CareRecordId,
      patientId: PATIENT_ID,
      status: "received",
      patientReportedSeverity: "moderate",
      narrativeRecorded: true,
      occurredAt: "2026-07-22T09:00:00.000Z",
      reportedAt: "2026-07-22T12:00:00.000Z",
      acknowledgedAt: null,
      acknowledgedByUserId: null,
      ...overrides,
    };
  }

  it("reports the narrative as recorded rather than echoing it", () => {
    const item = toCareAdverseEventItem(report());
    expect(item.narrativeRecorded).toBe(true);
    expect(Object.keys(item)).not.toContain("narrative");
  });

  it("counts a report as acknowledged only when a named person did so", () => {
    expect(toCareAdverseEventItem(report()).acknowledged).toBe(false);
    expect(
      toCareAdverseEventItem(
        report({ acknowledgedAt: "2026-07-23T12:00:00.000Z" }),
      ).acknowledged,
    ).toBe(false);
    expect(
      toCareAdverseEventItem(
        report({
          acknowledgedAt: "2026-07-23T12:00:00.000Z",
          acknowledgedByUserId: REVIEWER_ID,
        }),
      ).acknowledged,
    ).toBe(true);
  });
});

describe("Care storage state", () => {
  it("names the records that are missing rather than reporting emptiness", () => {
    const labs = careStorageMissing(CARE_LAB_STORAGE_TABLES);
    expect(labs.available).toBe(false);
    expect(labs.missingTables).toEqual(["care_lab_orders", "care_lab_results"]);
    expect(
      careStorageMissing(CARE_ADVERSE_EVENT_STORAGE_TABLES).missingTables,
    ).toEqual(["care_adverse_events"]);
  });
});

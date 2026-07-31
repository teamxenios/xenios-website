import type { CareRecordId } from "./contracts";

/**
 * Lab results and adverse event reports.
 *
 * Two rules shape everything in this file.
 *
 * 1. A lab result is not readable by the patient until a named person has
 *    released it. The release test lives here, the server applies it, and the
 *    browser never receives an unreleased result in the first place.
 * 2. An adverse event report is a safety signal. It is either recorded and
 *    routable to a person, or the attempt fails loudly. There is no state in
 *    which a patient is told a report was received when nothing holds it.
 *
 * These projections carry no clinical values, no free text, no patient
 * identifier, and no reviewer identity, matching the clinician review queue.
 */

export const CARE_LAB_RESULT_STATUSES = [
  "ordered",
  "collected",
  "resulted",
  "released",
  "cancelled",
] as const;

export type CareLabResultStatus = (typeof CARE_LAB_RESULT_STATUSES)[number];

export interface CareLabResultRecord {
  id: CareRecordId;
  patientId: CareRecordId;
  reviewId: CareRecordId | null;
  assignedReviewerUserId: string | null;
  panelName: string;
  status: CareLabResultStatus;
  orderedAt: string;
  collectedAt: string | null;
  resultedAt: string | null;
  /** Set only when a named reviewer released the result to the patient. */
  releasedToPatientAt: string | null;
  releasedByUserId: string | null;
  updatedAt: string;
}

export const CARE_ADVERSE_EVENT_SEVERITIES = [
  "mild",
  "moderate",
  "severe",
  "unsure",
] as const;

export type CareAdverseEventSeverity =
  (typeof CARE_ADVERSE_EVENT_SEVERITIES)[number];

export const CARE_ADVERSE_EVENT_STATUSES = [
  "received",
  "under_review",
  "closed",
] as const;

export type CareAdverseEventStatus =
  (typeof CARE_ADVERSE_EVENT_STATUSES)[number];

export interface CareAdverseEventRecord {
  id: CareRecordId;
  patientId: CareRecordId;
  status: CareAdverseEventStatus;
  /** The patient's own words about severity. Never a clinical grading. */
  patientReportedSeverity: CareAdverseEventSeverity;
  narrativeRecorded: boolean;
  occurredAt: string | null;
  reportedAt: string;
  acknowledgedAt: string | null;
  acknowledgedByUserId: string | null;
}

/**
 * Whether the records behind a read actually exist.
 *
 * A declared route with no backing table must say so rather than return an
 * empty list that reads as "you have nothing". `missingTables` names what is
 * absent so the answer is checkable.
 */
export interface CareStorageState {
  available: boolean;
  missingTables: readonly string[];
}

export const CARE_LAB_STORAGE_TABLES = [
  "care_lab_orders",
  "care_lab_results",
] as const;

export const CARE_ADVERSE_EVENT_STORAGE_TABLES = [
  "care_adverse_events",
] as const;

export const CARE_STORAGE_AVAILABLE: CareStorageState = {
  available: true,
  missingTables: [],
};

export function careStorageMissing(
  tables: readonly string[],
): CareStorageState {
  return { available: false, missingTables: [...tables] };
}

function present(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The release gate.
 *
 * A result counts as released only when the status says so, a release time is
 * recorded, and the release is attributable to a person. A partially written
 * record fails closed.
 */
export function isCareLabResultReleasedToPatient(
  record: Pick<
    CareLabResultRecord,
    "status" | "releasedToPatientAt" | "releasedByUserId"
  >,
): boolean {
  return (
    record.status === "released" &&
    present(record.releasedToPatientAt) &&
    present(record.releasedByUserId)
  );
}

export interface CarePatientLabResultItem {
  labResultId: CareRecordId;
  panelName: string;
  releasedAt: string;
}

/**
 * The patient projection. Unreleased results are dropped entirely, so no
 * identifier, timestamp, or panel name for a withheld result reaches the
 * browser.
 */
export function selectCareLabResultsForPatient(
  records: readonly CareLabResultRecord[],
): CarePatientLabResultItem[] {
  return records
    .filter(isCareLabResultReleasedToPatient)
    .map((record) => ({
      labResultId: record.id,
      panelName: record.panelName,
      releasedAt: record.releasedToPatientAt as string,
    }));
}

/**
 * A plain count of results a clinician is still reviewing. The patient learns
 * that work is in progress without receiving the result itself.
 */
export function countCareLabResultsAwaitingRelease(
  records: readonly CareLabResultRecord[],
): number {
  return records.filter(
    (record) =>
      !isCareLabResultReleasedToPatient(record) &&
      record.status !== "cancelled",
  ).length;
}

export interface CareLabReviewerItem {
  labResultId: CareRecordId;
  panelName: string;
  status: CareLabResultStatus;
  releasedToPatient: boolean;
  collectedAt: string | null;
  resultedAt: string | null;
  updatedAt: string;
}

/** The reviewer projection. Carries workflow state, never a patient identity. */
export function toCareLabReviewerItem(
  record: CareLabResultRecord,
): CareLabReviewerItem {
  return {
    labResultId: record.id,
    panelName: record.panelName,
    status: record.status,
    releasedToPatient: isCareLabResultReleasedToPatient(record),
    collectedAt: record.collectedAt,
    resultedAt: record.resultedAt,
    updatedAt: record.updatedAt,
  };
}

export interface CareAdverseEventItem {
  adverseEventId: CareRecordId;
  status: CareAdverseEventStatus;
  patientReportedSeverity: CareAdverseEventSeverity;
  narrativeRecorded: boolean;
  occurredAt: string | null;
  reportedAt: string;
  acknowledged: boolean;
}

/**
 * The adverse event projection. The narrative the patient wrote is reported as
 * recorded or not, never echoed back through a response, so a cached page can
 * never hold it.
 */
export function toCareAdverseEventItem(
  record: CareAdverseEventRecord,
): CareAdverseEventItem {
  return {
    adverseEventId: record.id,
    status: record.status,
    patientReportedSeverity: record.patientReportedSeverity,
    narrativeRecorded: record.narrativeRecorded,
    occurredAt: record.occurredAt,
    reportedAt: record.reportedAt,
    acknowledged:
      present(record.acknowledgedAt) && present(record.acknowledgedByUserId),
  };
}

export const CARE_LAB_RESULT_STATUS_LABELS: Readonly<
  Record<CareLabResultStatus, string>
> = {
  ordered: "Ordered",
  collected: "Sample collected",
  resulted: "Result returned to the clinician",
  released: "Released to the patient",
  cancelled: "Cancelled",
};

export const CARE_ADVERSE_EVENT_SEVERITY_LABELS: Readonly<
  Record<CareAdverseEventSeverity, string>
> = {
  mild: "Mild",
  moderate: "Moderate",
  severe: "Severe",
  unsure: "Not sure",
};

export const CARE_ADVERSE_EVENT_STATUS_LABELS: Readonly<
  Record<CareAdverseEventStatus, string>
> = {
  received: "Received",
  under_review: "Under review",
  closed: "Closed",
};

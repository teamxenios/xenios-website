import type { CareAppointment } from "@shared/care/appointments";
import {
  careAdminAppointmentBucket,
  careAdminPharmacyOrderBucket,
  type CareAdminAppointmentQueueItem,
  type CareAdminPharmacyOrderQueueItem,
  type CareAdminPrescriptionQueueItem,
} from "@shared/care/admin-queues";
import type { CareRecordId } from "@shared/care/contracts";
import type {
  CarePharmacyOrder,
  CarePrescription,
} from "@shared/care/prescriptions";

/**
 * The projections that turn Care records into the administrator's queues.
 *
 * Each function takes the full record and returns only the workflow view. The
 * patient id, the clinician user id, the state code, and the prescription
 * content are dropped here, at the boundary, so a route cannot leak them by
 * forgetting to pick fields.
 */

/** A signed prescription and whether a pharmacy order already exists for it. */
export interface CareAdminPrescriptionFacts {
  prescription: CarePrescription;
  pharmacyOrderId: CareRecordId | null;
}

export function toCareAdminAppointmentQueueItem(
  appointment: CareAppointment,
  now: string,
): CareAdminAppointmentQueueItem {
  const clinicianAssigned = appointment.assignedClinicianUserId !== null;
  return {
    appointmentId: appointment.id,
    bucket: careAdminAppointmentBucket({
      status: appointment.status,
      clinicianAssigned,
      endsAt: appointment.endsAt,
      now,
    }),
    status: appointment.status,
    clinicianAssigned,
    scheduled:
      appointment.startsAt !== null && appointment.endsAt !== null,
    telehealthReady: appointment.telehealthReady,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    version: appointment.version,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  };
}

export function toCareAdminPrescriptionQueueItem(
  facts: CareAdminPrescriptionFacts,
): CareAdminPrescriptionQueueItem {
  const pharmacyAssigned = facts.pharmacyOrderId !== null;
  return {
    prescriptionId: facts.prescription.id,
    bucket: pharmacyAssigned
      ? "pharmacy_assigned"
      : "awaiting_pharmacy_assignment",
    status: facts.prescription.status,
    pharmacyAssigned,
    version: facts.prescription.version,
    signedAt: facts.prescription.signedAt,
    createdAt: facts.prescription.createdAt,
    updatedAt: facts.prescription.updatedAt,
  };
}

export function toCareAdminPharmacyOrderQueueItem(
  order: CarePharmacyOrder,
): CareAdminPharmacyOrderQueueItem {
  return {
    orderId: order.id,
    bucket: careAdminPharmacyOrderBucket({
      status: order.status,
      clarificationOpen: order.clarificationOpen,
    }),
    status: order.status,
    clarificationOpen: order.clarificationOpen,
    version: order.version,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

/**
 * Work that needs a decision first, then oldest first.
 *
 * The order within a bucket is the record's own creation time, so the queue
 * does not reshuffle between two reads of the same data. The record id breaks
 * a tie, which keeps the sort total.
 */
const APPOINTMENT_BUCKET_ORDER: Readonly<
  Record<CareAdminAppointmentQueueItem["bucket"], number>
> = {
  needs_assignment: 0,
  needs_scheduling: 1,
  no_show_candidate: 2,
  awaiting_completion: 3,
  scheduled: 4,
  no_action_needed: 5,
};

export function sortCareAdminAppointmentQueue(
  items: readonly CareAdminAppointmentQueueItem[],
): CareAdminAppointmentQueueItem[] {
  return [...items].sort((left, right) => {
    const byBucket =
      APPOINTMENT_BUCKET_ORDER[left.bucket] -
      APPOINTMENT_BUCKET_ORDER[right.bucket];
    if (byBucket !== 0) return byBucket;
    const byCreated = left.createdAt.localeCompare(right.createdAt);
    return byCreated !== 0
      ? byCreated
      : left.appointmentId.localeCompare(right.appointmentId);
  });
}

export function sortCareAdminPrescriptionQueue(
  items: readonly CareAdminPrescriptionQueueItem[],
): CareAdminPrescriptionQueueItem[] {
  return [...items].sort((left, right) => {
    const leftAssigned = left.pharmacyAssigned ? 1 : 0;
    const rightAssigned = right.pharmacyAssigned ? 1 : 0;
    if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned;
    const byCreated = left.createdAt.localeCompare(right.createdAt);
    return byCreated !== 0
      ? byCreated
      : left.prescriptionId.localeCompare(right.prescriptionId);
  });
}

const ORDER_BUCKET_ORDER: Readonly<
  Record<CareAdminPharmacyOrderQueueItem["bucket"], number>
> = {
  clarification_open: 0,
  awaiting_pharmacy: 1,
  in_fulfillment: 2,
  closed: 3,
};

export function sortCareAdminPharmacyOrderQueue(
  items: readonly CareAdminPharmacyOrderQueueItem[],
): CareAdminPharmacyOrderQueueItem[] {
  return [...items].sort((left, right) => {
    const byBucket =
      ORDER_BUCKET_ORDER[left.bucket] - ORDER_BUCKET_ORDER[right.bucket];
    if (byBucket !== 0) return byBucket;
    const byCreated = left.createdAt.localeCompare(right.createdAt);
    return byCreated !== 0
      ? byCreated
      : left.orderId.localeCompare(right.orderId);
  });
}

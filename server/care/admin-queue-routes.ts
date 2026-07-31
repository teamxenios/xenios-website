import type { Express, Response } from "express";
import {
  careAdminAppointmentActionStates,
  careAdminPharmacyOrderActionStates,
  careAdminPrescriptionActionStates,
  summarizeCareAdminAppointmentQueue,
  summarizeCareAdminPharmacyOrderQueue,
  summarizeCareAdminPrescriptionQueue,
} from "@shared/care/admin-queues";
import type { CareClinicalCapabilityFlags } from "@shared/care/clinical-actions";
import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import {
  requireCarePermission,
  sendCareTemporarilyUnavailable,
  type CareAccessDependencies,
} from "./access";
import {
  sortCareAdminAppointmentQueue,
  sortCareAdminPharmacyOrderQueue,
  sortCareAdminPrescriptionQueue,
  toCareAdminAppointmentQueueItem,
  toCareAdminPharmacyOrderQueueItem,
  toCareAdminPrescriptionQueueItem,
} from "./admin-queues";
import {
  lazyCareAdminQueueRepository,
  type CareAdminQueueRepository,
} from "./admin-queue-repository";
import { readCareClinicalCapabilityFlags } from "./review-detail";

export const CARE_ADMIN_QUEUE_ROUTES = {
  appointments: `${CARE_ROUTE_CONTRACTS.appointments}/admin/queue`,
  prescriptions: `${CARE_ROUTE_CONTRACTS.pharmacy}/admin/prescriptions`,
  pharmacyOrders: `${CARE_ROUTE_CONTRACTS.pharmacy}/admin/orders`,
} as const;

export interface CareAdminQueueOptions {
  repository?: CareAdminQueueRepository;
  now?: () => Date;
  readFlags?: () => CareClinicalCapabilityFlags;
}

interface ResolvedOptions {
  repository: CareAdminQueueRepository;
  now: () => Date;
  gates: () => Promise<{
    careEnabled: boolean;
    flags: CareClinicalCapabilityFlags;
  }>;
}

function resolve(
  access: CareAccessDependencies,
  options: CareAdminQueueOptions,
): ResolvedOptions {
  const readFlags = options.readFlags ?? readCareClinicalCapabilityFlags;
  return {
    repository: options.repository ?? lazyCareAdminQueueRepository(),
    now: options.now ?? (() => new Date()),
    /**
     * `requireCarePermission` already refuses the request with 503 when Care
     * is not active, so `enabled` is true by the time a handler runs. It is
     * read again rather than assumed, so the action states stay correct if
     * that ordering ever changes.
     */
    gates: async () => ({
      careEnabled: (await access.loadCapabilityStatus()).enabled,
      flags: readFlags(),
    }),
  };
}

const unavailable = (res: Response) => sendCareTemporarilyUnavailable(res);

/**
 * The Care administrator's appointment queue.
 *
 * A Care admin can already assign a clinician, schedule an appointment, and
 * record a no show, but `GET /api/care/appointments` is a patient self read
 * bound to the caller's own patient id, so the administrator had write
 * contracts and nothing to work from. This read closes that gap.
 *
 * It is registered from the module that already owns `/api/care/appointments`,
 * the same way the clinician review queue is, which keeps the new read out of
 * the protected application and server seams entirely.
 *
 * The route sits behind `care:administer`, so an anonymous visitor gets 401
 * and a patient, clinician, pharmacy operator, or affiliate gets 403 before
 * the repository is touched. No existing permission is widened. Each item
 * carries its action controls with their real contract paths and truthful
 * availability, and with the shipped capability flags every one is disabled.
 * Nothing on this route writes.
 */
export function registerCareAdminAppointmentQueueApi(
  app: Express,
  access: CareAccessDependencies,
  options: CareAdminQueueOptions = {},
) {
  const { repository, now, gates } = resolve(access, options);

  app.get(
    CARE_ADMIN_QUEUE_ROUTES.appointments,
    requireCarePermission("care:administer", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const asOf = now().toISOString();
        const resolved = await gates();
        const queue = sortCareAdminAppointmentQueue(
          (await repository.listOpenAppointments()).map((appointment) =>
            toCareAdminAppointmentQueueItem(appointment, asOf),
          ),
        );
        return res.json({
          ok: true,
          queue: queue.map((item) => ({
            ...item,
            actions: careAdminAppointmentActionStates({ item, ...resolved }),
          })),
          summary: summarizeCareAdminAppointmentQueue(queue),
        });
      } catch {
        return unavailable(res);
      }
    },
  );
}

/**
 * The Care administrator's pharmacy queues: signed prescriptions waiting for a
 * pharmacy, and the orders already with one.
 *
 * `GET /api/care/prescriptions` is a patient self read and
 * `GET /api/care/pharmacy/orders` is scoped to the operator's own pharmacies,
 * so neither serves the administrator who owns the assign and clarification
 * contracts. Registered from the module that already owns
 * `/api/care/prescriptions` and `/api/care/pharmacy`.
 *
 * The pharmacy operator's read is deliberately left alone. It keeps
 * `care:pharmacy_assigned` and keeps the prescription content an operator
 * needs to dispense. The administrator's view here is a workflow projection
 * with no prescription content in it at all.
 */
export function registerCareAdminPharmacyQueueApi(
  app: Express,
  access: CareAccessDependencies,
  options: CareAdminQueueOptions = {},
) {
  const { repository, gates } = resolve(access, options);

  app.get(
    CARE_ADMIN_QUEUE_ROUTES.prescriptions,
    requireCarePermission("care:administer", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const resolved = await gates();
        const queue = sortCareAdminPrescriptionQueue(
          (await repository.listSignedPrescriptions()).map(
            toCareAdminPrescriptionQueueItem,
          ),
        );
        return res.json({
          ok: true,
          queue: queue.map((item) => ({
            ...item,
            actions: careAdminPrescriptionActionStates({ item, ...resolved }),
          })),
          summary: summarizeCareAdminPrescriptionQueue(queue),
        });
      } catch {
        return unavailable(res);
      }
    },
  );

  app.get(
    CARE_ADMIN_QUEUE_ROUTES.pharmacyOrders,
    requireCarePermission("care:administer", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const resolved = await gates();
        const queue = sortCareAdminPharmacyOrderQueue(
          (await repository.listPharmacyOrders()).map(
            toCareAdminPharmacyOrderQueueItem,
          ),
        );
        return res.json({
          ok: true,
          queue: queue.map((item) => ({
            ...item,
            actions: careAdminPharmacyOrderActionStates({ item, ...resolved }),
          })),
          summary: summarizeCareAdminPharmacyOrderQueue(queue),
        });
      } catch {
        return unavailable(res);
      }
    },
  );
}

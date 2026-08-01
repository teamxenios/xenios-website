import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  type CareAppointmentRequiredInputLabel,
} from "@shared/care/appointments";
import { CARE_CLINICIAN_REVIEW_ACTIONS } from "@shared/care/clinician-review";
import {
  CARE_ROUTE_CONTRACTS,
  type CarePrincipal,
  type CareRecordId,
} from "@shared/care/contracts";
import {
  requireCarePermission,
  sendCareTemporarilyUnavailable,
  type CareAccessDependencies,
} from "./access";
import { evaluateCareAppointmentReadiness } from "./appointment-readiness";
import type { CareAppointmentRepository } from "./appointment-repository";
import {
  requireCareClinicalCapability,
  type CareClinicalWriteGateOptions,
} from "./clinical-write-gate";
import {
  lazyCareClinicianReviewRepository,
  type CareClinicianReviewRepository,
} from "./review-repository";
import { registerCareClinicianReviewApi } from "./review-routes";

const recordId = z.string().uuid();
const userId = z.string().uuid();
const idempotencyKey = z.string().trim().min(8).max(128);
const version = z.number().int().nonnegative();
const requestBody = z.object({
  intakeId: recordId,
  idempotencyKey,
}).strict();
const patientActionBody = z.object({
  action: z.enum(["cancel", "check_in"]),
  expectedVersion: version,
  idempotencyKey,
}).strict();
const assignBody = z.object({
  clinicianUserId: userId,
  idempotencyKey,
}).strict();
const scheduleBody = z.object({
  expectedVersion: version,
  providerKey: z.string().trim().min(3).max(120),
  providerSessionReference: z.string().trim().min(8).max(500),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  idempotencyKey,
}).strict();
const noShowBody = z.object({
  expectedVersion: version,
  idempotencyKey,
}).strict();
const completeBody = noShowBody;
const reviewActionBody = z.object({
  action: z.enum(CARE_CLINICIAN_REVIEW_ACTIONS),
  expectedVersion: version,
  idempotencyKey,
}).strict();

function principal(res: Response): CarePrincipal | null {
  return (res.locals.carePrincipal as CarePrincipal | undefined) ?? null;
}

function invalid(res: Response) {
  return res.status(400).json({ ok: false, code: "care_invalid_request" });
}

function safeFailure(res: Response) {
  return sendCareTemporarilyUnavailable(res);
}

function route(base: string, suffix: string) {
  return `${base}${suffix}`;
}

/**
 * Clinical classification of the writes in this module.
 *
 * Gated on a clinical capability:
 *   POST /appointments/:id/complete   provider_actions
 *   POST /reviews/:id/action          per action, see CARE_REVIEW_ACTION_CAPABILITY
 *
 * Not gated, because they carry no clinical effect and no clinical content,
 * and gating them would stop the scheduling and handoff workflow from being
 * usable at all:
 *   POST /appointments                a patient asking for a slot
 *   POST /appointments/:id/action     a patient cancelling or checking in
 *   POST /appointments/:id/assign     an administrator routing work to a clinician
 *   POST /appointments/:id/schedule   an administrator recording the slot and the
 *                                     external session handoff reference
 *   POST /appointments/:id/no-show    an administrator recording attendance
 * All five stay behind `requireCarePermission` and the Care capability status.
 */
export function registerCareAppointmentApi(
  app: Express,
  access: CareAccessDependencies,
  repository: CareAppointmentRepository,
  now: () => Date = () => new Date(),
  // The clinician review READ surface belongs to this module, which already
  // owns /api/care/reviews. Registering it here keeps the new screen out of
  // the protected application and server seams entirely.
  reviewRepository: CareClinicianReviewRepository = lazyCareClinicianReviewRepository(),
  // The clinical capability gate. Defaults read the real environment, so the
  // production wiring in server/index.ts needs no change to be protected.
  gate: CareClinicalWriteGateOptions = {},
) {
  app.get(
    CARE_ROUTE_CONTRACTS.appointments,
    requireCarePermission("care:appointments_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const patientId = principal(res)?.patientId as CareRecordId | undefined;
      if (!patientId) return safeFailure(res);
      try {
        const appointments = await repository.listPatientAppointments(patientId);
        const stateCode = appointments[0]?.patientStateCode ?? null;
        const readiness = evaluateCareAppointmentReadiness(
          await repository.loadReadiness(stateCode),
        );
        return res.json({
          ok: true,
          appointments,
          requestAvailable: readiness.operationalReady,
        });
      } catch {
        return safeFailure(res);
      }
    },
  );

  app.post(
    CARE_ROUTE_CONTRACTS.appointments,
    requireCarePermission("care:appointments_self", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = requestBody.safeParse(req.body);
      const patientId = principal(res)?.patientId as CareRecordId | undefined;
      if (!parsed.success) return invalid(res);
      if (!patientId) return safeFailure(res);
      try {
        const appointment = await repository.requestAppointment({
          patientId,
          intakeId: parsed.data.intakeId as CareRecordId,
          idempotencyKey: parsed.data.idempotencyKey,
          occurredAt: now().toISOString(),
        });
        return res.status(201).json({ ok: true, appointment });
      } catch {
        return safeFailure(res);
      }
    },
  );

  app.post(
    route(CARE_ROUTE_CONTRACTS.appointments, "/:appointmentId/action"),
    requireCarePermission("care:appointments_self", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = patientActionBody.safeParse(req.body);
      const appointmentId = recordId.safeParse(req.params.appointmentId);
      const patientId = principal(res)?.patientId as CareRecordId | undefined;
      if (!parsed.success || !appointmentId.success) return invalid(res);
      if (!patientId) return safeFailure(res);
      try {
        const appointment = await repository.patientAction({
          appointmentId: appointmentId.data as CareRecordId,
          patientId,
          ...parsed.data,
          occurredAt: now().toISOString(),
        });
        return res.json({ ok: true, appointment });
      } catch {
        return safeFailure(res);
      }
    },
  );

  app.get(
    route(CARE_ROUTE_CONTRACTS.appointments, "/admin/readiness"),
    requireCarePermission("care:administer", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const stateCode =
        typeof req.query.stateCode === "string" &&
        /^[A-Z]{2}$/.test(req.query.stateCode)
          ? req.query.stateCode
          : null;
      try {
        const readiness = evaluateCareAppointmentReadiness(
          await repository.loadReadiness(stateCode),
        );
        return res.json({
          ok: true,
          readiness: {
            softwareReady: readiness.softwareReady,
            operationalReady: readiness.operationalReady,
            publicReady: readiness.publicReady,
            requiredInputs:
              readiness.requiredInputs as readonly CareAppointmentRequiredInputLabel[],
          },
        });
      } catch {
        return safeFailure(res);
      }
    },
  );

  app.post(
    route(CARE_ROUTE_CONTRACTS.appointments, "/:appointmentId/assign"),
    requireCarePermission("care:administer", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = assignBody.safeParse(req.body);
      const appointmentId = recordId.safeParse(req.params.appointmentId);
      const adminUserId = principal(res)?.subjectId;
      if (!parsed.success || !appointmentId.success) return invalid(res);
      if (!adminUserId) return safeFailure(res);
      try {
        const appointment = await repository.assignClinician({
          appointmentId: appointmentId.data as CareRecordId,
          adminUserId,
          ...parsed.data,
          occurredAt: now().toISOString(),
        });
        return res.json({ ok: true, appointment });
      } catch {
        return safeFailure(res);
      }
    },
  );

  app.post(
    route(CARE_ROUTE_CONTRACTS.appointments, "/:appointmentId/schedule"),
    requireCarePermission("care:administer", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = scheduleBody.safeParse(req.body);
      const appointmentId = recordId.safeParse(req.params.appointmentId);
      const adminUserId = principal(res)?.subjectId;
      if (!parsed.success || !appointmentId.success) return invalid(res);
      if (!adminUserId) return safeFailure(res);
      try {
        const appointment = await repository.scheduleAppointment({
          appointmentId: appointmentId.data as CareRecordId,
          adminUserId,
          ...parsed.data,
          occurredAt: now().toISOString(),
        });
        return res.json({ ok: true, appointment });
      } catch {
        return safeFailure(res);
      }
    },
  );

  app.post(
    route(CARE_ROUTE_CONTRACTS.appointments, "/:appointmentId/no-show"),
    requireCarePermission("care:administer", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = noShowBody.safeParse(req.body);
      const appointmentId = recordId.safeParse(req.params.appointmentId);
      const adminUserId = principal(res)?.subjectId;
      if (!parsed.success || !appointmentId.success) return invalid(res);
      if (!adminUserId) return safeFailure(res);
      try {
        const appointment = await repository.adminMarkNoShow({
          appointmentId: appointmentId.data as CareRecordId,
          adminUserId,
          ...parsed.data,
          occurredAt: now().toISOString(),
        });
        return res.json({ ok: true, appointment });
      } catch {
        return safeFailure(res);
      }
    },
  );

  app.get(
    CARE_ROUTE_CONTRACTS.reviews,
    requireCarePermission("care:review_assigned", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const clinicianUserId = principal(res)?.subjectId;
      if (!clinicianUserId) return safeFailure(res);
      try {
        return res.json({
          ok: true,
          reviews: await repository.listAssignedReviews(clinicianUserId),
        });
      } catch {
        return safeFailure(res);
      }
    },
  );

  app.post(
    route(CARE_ROUTE_CONTRACTS.appointments, "/:appointmentId/complete"),
    requireCarePermission("care:review_assigned", access),
    // Clinical. The assigned clinician attests that the encounter happened,
    // and that attestation is what unlocks approve, decline, and no treatment.
    requireCareClinicalCapability("appointment.clinician_complete", gate),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = completeBody.safeParse(req.body);
      const appointmentId = recordId.safeParse(req.params.appointmentId);
      const clinicianUserId = principal(res)?.subjectId;
      if (!parsed.success || !appointmentId.success) return invalid(res);
      if (!clinicianUserId) return safeFailure(res);
      try {
        const appointment = await repository.clinicianComplete({
          appointmentId: appointmentId.data as CareRecordId,
          clinicianUserId,
          ...parsed.data,
          occurredAt: now().toISOString(),
        });
        return res.json({ ok: true, appointment });
      } catch {
        return safeFailure(res);
      }
    },
  );

  app.post(
    route(CARE_ROUTE_CONTRACTS.reviews, "/:reviewId/action"),
    requireCarePermission("care:review_assigned", access),
    // Clinical, and per action: request_information depends on outbound
    // communication, request_labs on clinical fulfillment, and the rest on
    // provider actions. The gate reads the requested action from the body.
    requireCareClinicalCapability(
      "review.action",
      gate,
      (req) => (req.body as { action?: unknown } | undefined)?.action,
    ),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = reviewActionBody.safeParse(req.body);
      const reviewId = recordId.safeParse(req.params.reviewId);
      const clinicianUserId = principal(res)?.subjectId;
      if (!parsed.success || !reviewId.success) return invalid(res);
      if (!clinicianUserId) return safeFailure(res);
      try {
        const review = await repository.applyReviewAction({
          reviewId: reviewId.data as CareRecordId,
          clinicianUserId,
          ...parsed.data,
          occurredAt: now().toISOString(),
        });
        return res.json({ ok: true, review });
      } catch {
        return safeFailure(res);
      }
    },
  );

  // The clinician review queue and review detail reads. Registered last so the
  // literal /queue path is matched before the parameterised review id.
  registerCareClinicianReviewApi(app, access, reviewRepository);
}

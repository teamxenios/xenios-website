import type { Express, Request, Response } from "express";
import { z } from "zod";
import { CARE_PHARMACY_ACTIONS } from "@shared/care/prescriptions";
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
import {
  requireCareClinicalCapability,
  type CareClinicalWriteGateOptions,
} from "./clinical-write-gate";
import { evaluateCarePrescriptionReadiness } from "./prescriptions";
import type { CarePrescriptionRepository } from "./prescription-repository";

const uuid = z.string().uuid();
const key = z.string().trim().min(8).max(128);
const version = z.number().int().nonnegative();
const clinicalText = z.string().trim().min(1).max(2000);
const draftBody = z.object({
  patientId: uuid,
  reviewId: uuid,
  formulation: clinicalText,
  concentration: clinicalText,
  route: clinicalText,
  quantity: clinicalText,
  directions: clinicalText,
  refills: z.number().int().min(0).max(99),
  supersedesPrescriptionId: uuid.nullable().default(null),
  idempotencyKey: key,
}).strict();
const signBody = z.object({ expectedVersion: version, idempotencyKey: key }).strict();
const assignBody = z.object({ pharmacyId: uuid, idempotencyKey: key }).strict();
const actionBody = z.object({
  action: z.enum(CARE_PHARMACY_ACTIONS),
  expectedVersion: version,
  clarificationReference: z.string().trim().min(1).max(500).nullable().default(null),
  trackingReference: z.string().trim().min(1).max(500).nullable().default(null),
  idempotencyKey: key,
}).strict();
const clarificationResolutionBody = z.object({
  expectedVersion: version,
  resolutionReference: z.string().trim().min(1).max(500),
  idempotencyKey: key,
}).strict();

const principal = (res: Response) =>
  (res.locals.carePrincipal as CarePrincipal | undefined) ?? null;
const invalid = (res: Response) =>
  res.status(400).json({ ok: false, code: "care_invalid_request" });
const safe = (res: Response) => sendCareTemporarilyUnavailable(res);

/**
 * Clinical classification of this module.
 *
 * Every write here is clinical, and every read here returns real prescription
 * content, so all of them are gated:
 *   GET  /prescriptions                                 real_patient_data
 *   POST /prescriptions                                 prescribing
 *   POST /prescriptions/:id/sign                        prescribing
 *   POST /pharmacy/admin/prescriptions/:id/assign       clinical_fulfillment
 *   POST /pharmacy/orders/:id/action                    clinical_fulfillment
 *   POST /prescriptions/pharmacy-orders/:id/clarification/resolve
 *                                                       clinical_fulfillment
 *   POST /pharmacy/admin/orders/:id/clarification/resolve
 *                                                       clinical_fulfillment
 *
 * Not gated:
 *   GET  /pharmacy/orders           the assigned fulfillment worklist, which is
 *                                   workflow state and carries no clinical content
 *   GET  /pharmacy/admin/readiness  a deployment readiness projection
 */
export function registerCarePrescriptionApi(
  app: Express,
  access: CareAccessDependencies,
  repository: CarePrescriptionRepository,
  now: () => Date = () => new Date(),
  gate: CareClinicalWriteGateOptions = {},
) {
  const resolveClarification = async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    const parsed = clarificationResolutionBody.safeParse(req.body);
    const orderId = uuid.safeParse(req.params.orderId);
    const resolverUserId = principal(res)?.subjectId;
    if (!parsed.success || !orderId.success) return invalid(res);
    if (!resolverUserId) return safe(res);
    try {
      return res.json({
        ok: true,
        order: await repository.resolveClarification({
          orderId: orderId.data as CareRecordId,
          resolverUserId,
          ...parsed.data,
          occurredAt: now().toISOString(),
        }),
      });
    } catch {
      return safe(res);
    }
  };

  app.get(
    CARE_ROUTE_CONTRACTS.prescriptions,
    requireCarePermission("care:read_self", access),
    requireCareClinicalCapability("prescription.read_self", gate),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const patientId = principal(res)?.patientId as CareRecordId | undefined;
      if (!patientId) return safe(res);
      try {
        return res.json({
          ok: true,
          prescriptions: await repository.listPatientPrescriptions(patientId),
        });
      } catch {
        return safe(res);
      }
    },
  );

  app.post(
    CARE_ROUTE_CONTRACTS.prescriptions,
    requireCarePermission("care:prescribe_assigned", access),
    requireCareClinicalCapability("prescription.create_draft", gate),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = draftBody.safeParse(req.body);
      const clinicianUserId = principal(res)?.subjectId;
      if (!parsed.success) return invalid(res);
      if (!clinicianUserId) return safe(res);
      try {
        return res.status(201).json({
          ok: true,
          prescription: await repository.createDraft({
            ...parsed.data,
            patientId: parsed.data.patientId as CareRecordId,
            reviewId: parsed.data.reviewId as CareRecordId,
            supersedesPrescriptionId:
              parsed.data.supersedesPrescriptionId as CareRecordId | null,
            clinicianUserId,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );

  app.post(
    `${CARE_ROUTE_CONTRACTS.prescriptions}/:prescriptionId/sign`,
    requireCarePermission("care:prescribe_assigned", access),
    requireCareClinicalCapability("prescription.sign", gate),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = signBody.safeParse(req.body);
      const prescriptionId = uuid.safeParse(req.params.prescriptionId);
      const clinicianUserId = principal(res)?.subjectId;
      if (!parsed.success || !prescriptionId.success) return invalid(res);
      if (!clinicianUserId) return safe(res);
      try {
        return res.json({
          ok: true,
          prescription: await repository.sign({
            prescriptionId: prescriptionId.data as CareRecordId,
            clinicianUserId,
            ...parsed.data,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );

  app.get(
    `${CARE_ROUTE_CONTRACTS.pharmacy}/orders`,
    requireCarePermission("care:pharmacy_assigned", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const operatorUserId = principal(res)?.subjectId;
      if (!operatorUserId) return safe(res);
      try {
        return res.json({
          ok: true,
          orders: await repository.listAssignedPharmacyOrders(operatorUserId),
        });
      } catch {
        return safe(res);
      }
    },
  );

  app.post(
    `${CARE_ROUTE_CONTRACTS.pharmacy}/orders/:orderId/action`,
    requireCarePermission("care:pharmacy_assigned", access),
    requireCareClinicalCapability("pharmacy.order_action", gate),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = actionBody.safeParse(req.body);
      const orderId = uuid.safeParse(req.params.orderId);
      const operatorUserId = principal(res)?.subjectId;
      if (!parsed.success || !orderId.success) return invalid(res);
      if (!operatorUserId) return safe(res);
      try {
        return res.json({
          ok: true,
          order: await repository.pharmacyAction({
            orderId: orderId.data as CareRecordId,
            operatorUserId,
            ...parsed.data,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );

  app.get(
    `${CARE_ROUTE_CONTRACTS.pharmacy}/admin/readiness`,
    requireCarePermission("care:administer", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const stateCode =
        typeof req.query.stateCode === "string" && /^[A-Z]{2}$/.test(req.query.stateCode)
          ? req.query.stateCode
          : null;
      const clinicianUserId = uuid.safeParse(req.query.clinicianUserId);
      const pharmacyId = uuid.safeParse(req.query.pharmacyId);
      const prescriptionId = uuid.safeParse(req.query.prescriptionId);
      try {
        return res.json({
          ok: true,
          readiness: evaluateCarePrescriptionReadiness(
            await repository.loadReadiness({
              stateCode,
              clinicianUserId: clinicianUserId.success
                ? clinicianUserId.data
                : null,
              pharmacyId: pharmacyId.success
                ? (pharmacyId.data as CareRecordId)
                : null,
              prescriptionId: prescriptionId.success
                ? (prescriptionId.data as CareRecordId)
                : null,
            }),
          ),
        });
      } catch {
        return safe(res);
      }
    },
  );

  app.post(
    `${CARE_ROUTE_CONTRACTS.pharmacy}/admin/prescriptions/:prescriptionId/assign`,
    requireCarePermission("care:administer", access),
    requireCareClinicalCapability("prescription.assign_pharmacy", gate),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = assignBody.safeParse(req.body);
      const prescriptionId = uuid.safeParse(req.params.prescriptionId);
      const adminUserId = principal(res)?.subjectId;
      if (!parsed.success || !prescriptionId.success) return invalid(res);
      if (!adminUserId) return safe(res);
      try {
        return res.json({
          ok: true,
          order: await repository.assignPharmacy({
            prescriptionId: prescriptionId.data as CareRecordId,
            pharmacyId: parsed.data.pharmacyId as CareRecordId,
            adminUserId,
            idempotencyKey: parsed.data.idempotencyKey,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );

  app.post(
    `${CARE_ROUTE_CONTRACTS.prescriptions}/pharmacy-orders/:orderId/clarification/resolve`,
    requireCarePermission("care:prescribe_assigned", access),
    requireCareClinicalCapability("pharmacy.resolve_clarification", gate),
    resolveClarification,
  );

  app.post(
    `${CARE_ROUTE_CONTRACTS.pharmacy}/admin/orders/:orderId/clarification/resolve`,
    requireCarePermission("care:administer", access),
    requireCareClinicalCapability("pharmacy.resolve_clarification", gate),
    resolveClarification,
  );
}

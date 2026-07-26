import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  CARE_ADVERSE_EVENT_CATEGORIES,
  CARE_ADVERSE_EVENT_URGENCIES,
} from "@shared/care/communications";
import {
  CARE_ROUTE_CONTRACTS,
  type CarePermission,
  type CarePrincipal,
  type CareRecordId,
} from "@shared/care/contracts";
import {
  requireCarePermission,
  sendCareTemporarilyUnavailable,
  type CareAccessDependencies,
} from "./access";
import type { CareCommunicationRepository } from "./communication-repository";

const uuid = z.string().uuid();
const key = z.string().trim().min(8).max(128);
const version = z.number().int().nonnegative();
const privateText = z.string().trim().min(1).max(10000);
const threadBody = z.object({
  appointmentId: uuid,
  subjectCategory: z.string().trim().min(3).max(120),
  idempotencyKey: key,
}).strict();
const messageBody = z.object({
  body: privateText,
  idempotencyKey: key,
}).strict();
const labCreateBody = z.object({
  patientId: uuid,
  appointmentId: uuid.nullable().default(null),
  idempotencyKey: key,
}).strict();
const labAssignmentBody = z.object({
  reviewerUserId: uuid,
  idempotencyKey: key,
}).strict();
const labActionBody = z.object({
  expectedVersion: version,
  action: z.enum([
    "record_order_reference",
    "record_result_reference",
    "review",
    "close",
  ]),
  providerReference: z.string().trim().min(1).max(1000).nullable().default(null),
  orderReference: z.string().trim().min(1).max(1000).nullable().default(null),
  resultReference: z.string().trim().min(1).max(1000).nullable().default(null),
  secureObjectReference: z.string().trim().min(1).max(1000).nullable().default(null),
  idempotencyKey: key,
}).strict();
const adverseReportBody = z.object({
  category: z.enum(CARE_ADVERSE_EVENT_CATEGORIES),
  urgency: z.enum(CARE_ADVERSE_EVENT_URGENCIES),
  summary: privateText,
  emergencyGuidanceAcknowledged: z.literal(true),
  idempotencyKey: key,
}).strict();
const adverseAssignmentBody = z.object({
  ownerUserId: uuid,
  ownerRole: z.enum(["clinician", "clinical_support"]),
  idempotencyKey: key,
}).strict();
const adverseActionBody = z.object({
  expectedVersion: version,
  action: z.enum(["acknowledge", "escalate", "close"]),
  idempotencyKey: key,
}).strict();

const principal = (res: Response) =>
  (res.locals.carePrincipal as CarePrincipal | undefined) ?? null;
const invalid = (res: Response) =>
  res.status(400).json({ ok: false, code: "care_invalid_request" });
const safe = (res: Response) => sendCareTemporarilyUnavailable(res);

export function registerCareCommunicationApi(
  app: Express,
  access: CareAccessDependencies,
  repository: CareCommunicationRepository,
  now: () => Date = () => new Date(),
) {
  app.get(
    CARE_ROUTE_CONTRACTS.messages,
    requireCarePermission("care:message_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const patientId = principal(res)?.patientId as CareRecordId | undefined;
      if (!patientId) return safe(res);
      try {
        return res.json({
          ok: true,
          conversations: await repository.listPatientConversations(patientId),
        });
      } catch {
        return safe(res);
      }
    },
  );
  app.post(
    `${CARE_ROUTE_CONTRACTS.messages}/threads`,
    requireCarePermission("care:message_self", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = threadBody.safeParse(req.body);
      const carePrincipal = principal(res);
      const patientId = carePrincipal?.patientId as CareRecordId | undefined;
      if (!parsed.success) return invalid(res);
      if (!patientId || !carePrincipal?.subjectId) return safe(res);
      try {
        return res.status(201).json({
          ok: true,
          conversation: await repository.createMessageThread({
            patientId,
            appointmentId: parsed.data.appointmentId as CareRecordId,
            subjectCategory: parsed.data.subjectCategory,
            patientUserId: carePrincipal.subjectId,
            idempotencyKey: parsed.data.idempotencyKey,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );

  const registerMessagePost = (path: string, permission: CarePermission) => {
    app.post(
      path,
      requireCarePermission(permission, access),
      async (req: Request, res) => {
        res.set("Cache-Control", "no-store");
        const parsed = messageBody.safeParse(req.body);
        const threadId = uuid.safeParse(req.params.threadId);
        const actorUserId = principal(res)?.subjectId;
        if (!parsed.success || !threadId.success) return invalid(res);
        if (!actorUserId) return safe(res);
        try {
          return res.status(201).json({
            ok: true,
            message: await repository.postMessage({
              threadId: threadId.data as CareRecordId,
              actorUserId,
              ...parsed.data,
              occurredAt: now().toISOString(),
            }),
          });
        } catch {
          return safe(res);
        }
      },
    );
  };
  registerMessagePost(
    `${CARE_ROUTE_CONTRACTS.messages}/:threadId`,
    "care:message_self",
  );
  app.get(
    `${CARE_ROUTE_CONTRACTS.messages}/clinician`,
    requireCarePermission("care:review_assigned", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const clinicianUserId = principal(res)?.subjectId;
      if (!clinicianUserId) return safe(res);
      try {
        return res.json({
          ok: true,
          conversations:
            await repository.listClinicianConversations(clinicianUserId),
        });
      } catch {
        return safe(res);
      }
    },
  );
  registerMessagePost(
    `${CARE_ROUTE_CONTRACTS.messages}/clinician/:threadId`,
    "care:review_assigned",
  );

  app.get(
    CARE_ROUTE_CONTRACTS.labs,
    requireCarePermission("care:read_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const patientId = principal(res)?.patientId as CareRecordId | undefined;
      if (!patientId) return safe(res);
      try {
        return res.json({
          ok: true,
          labCases: await repository.listPatientLabCases(patientId),
        });
      } catch {
        return safe(res);
      }
    },
  );
  app.get(
    `${CARE_ROUTE_CONTRACTS.labs}/reviewer`,
    requireCarePermission("care:labs_assigned", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const reviewerUserId = principal(res)?.subjectId;
      if (!reviewerUserId) return safe(res);
      try {
        return res.json({
          ok: true,
          labCases: await repository.listAssignedLabCases(reviewerUserId),
        });
      } catch {
        return safe(res);
      }
    },
  );
  app.post(
    `${CARE_ROUTE_CONTRACTS.labs}/admin`,
    requireCarePermission("care:administer", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = labCreateBody.safeParse(req.body);
      const adminUserId = principal(res)?.subjectId;
      if (!parsed.success) return invalid(res);
      if (!adminUserId) return safe(res);
      try {
        return res.status(201).json({
          ok: true,
          labCase: await repository.createLabCase({
            patientId: parsed.data.patientId as CareRecordId,
            appointmentId: parsed.data.appointmentId as CareRecordId | null,
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
    `${CARE_ROUTE_CONTRACTS.labs}/admin/:labCaseId/assign`,
    requireCarePermission("care:administer", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = labAssignmentBody.safeParse(req.body);
      const labCaseId = uuid.safeParse(req.params.labCaseId);
      const adminUserId = principal(res)?.subjectId;
      if (!parsed.success || !labCaseId.success) return invalid(res);
      if (!adminUserId) return safe(res);
      try {
        await repository.assignLabReviewer({
          labCaseId: labCaseId.data as CareRecordId,
          reviewerUserId: parsed.data.reviewerUserId,
          adminUserId,
          idempotencyKey: parsed.data.idempotencyKey,
          occurredAt: now().toISOString(),
        });
        return res.status(201).json({ ok: true });
      } catch {
        return safe(res);
      }
    },
  );
  app.post(
    `${CARE_ROUTE_CONTRACTS.labs}/reviewer/:labCaseId/action`,
    requireCarePermission("care:labs_assigned", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = labActionBody.safeParse(req.body);
      const labCaseId = uuid.safeParse(req.params.labCaseId);
      const reviewerUserId = principal(res)?.subjectId;
      if (!parsed.success || !labCaseId.success) return invalid(res);
      if (!reviewerUserId) return safe(res);
      try {
        return res.json({
          ok: true,
          labCase: await repository.applyLabAction({
            labCaseId: labCaseId.data as CareRecordId,
            reviewerUserId,
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
    CARE_ROUTE_CONTRACTS.adverseEvents,
    requireCarePermission("care:read_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const patientId = principal(res)?.patientId as CareRecordId | undefined;
      if (!patientId) return safe(res);
      try {
        return res.json({
          ok: true,
          adverseEvents: await repository.listPatientAdverseEvents(patientId),
        });
      } catch {
        return safe(res);
      }
    },
  );
  app.post(
    CARE_ROUTE_CONTRACTS.adverseEvents,
    requireCarePermission("care:read_self", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = adverseReportBody.safeParse(req.body);
      const carePrincipal = principal(res);
      const patientId = carePrincipal?.patientId as CareRecordId | undefined;
      if (!parsed.success) return invalid(res);
      if (!patientId || !carePrincipal?.subjectId) return safe(res);
      try {
        return res.status(201).json({
          ok: true,
          adverseEvent: await repository.reportAdverseEvent({
            patientId,
            patientUserId: carePrincipal.subjectId,
            ...parsed.data,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );
  app.post(
    `${CARE_ROUTE_CONTRACTS.adverseEvents}/admin/:adverseEventId/assign`,
    requireCarePermission("care:administer", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = adverseAssignmentBody.safeParse(req.body);
      const adverseEventId = uuid.safeParse(req.params.adverseEventId);
      const adminUserId = principal(res)?.subjectId;
      if (!parsed.success || !adverseEventId.success) return invalid(res);
      if (!adminUserId) return safe(res);
      try {
        await repository.assignAdverseEventOwner({
          adverseEventId: adverseEventId.data as CareRecordId,
          ...parsed.data,
          adminUserId,
          occurredAt: now().toISOString(),
        });
        return res.status(201).json({ ok: true });
      } catch {
        return safe(res);
      }
    },
  );

  const registerAdverseOwnerRoutes = (
    segment: "clinician" | "support",
    permission: CarePermission,
  ) => {
    app.get(
      `${CARE_ROUTE_CONTRACTS.adverseEvents}/${segment}/assigned`,
      requireCarePermission(permission, access),
      async (_req, res) => {
        res.set("Cache-Control", "no-store");
        const ownerUserId = principal(res)?.subjectId;
        if (!ownerUserId) return safe(res);
        try {
          return res.json({
            ok: true,
            adverseEvents:
              await repository.listAssignedAdverseEvents(ownerUserId),
          });
        } catch {
          return safe(res);
        }
      },
    );
    app.post(
      `${CARE_ROUTE_CONTRACTS.adverseEvents}/${segment}/:adverseEventId/action`,
      requireCarePermission(permission, access),
      async (req: Request, res) => {
        res.set("Cache-Control", "no-store");
        const parsed = adverseActionBody.safeParse(req.body);
        const adverseEventId = uuid.safeParse(req.params.adverseEventId);
        const actorUserId = principal(res)?.subjectId;
        if (!parsed.success || !adverseEventId.success) return invalid(res);
        if (!actorUserId) return safe(res);
        try {
          return res.json({
            ok: true,
            adverseEvent: await repository.applyAdverseEventAction({
              adverseEventId: adverseEventId.data as CareRecordId,
              actorUserId,
              ...parsed.data,
              occurredAt: now().toISOString(),
            }),
          });
        } catch {
          return safe(res);
        }
      },
    );
  };
  registerAdverseOwnerRoutes("clinician", "care:review_assigned");
  registerAdverseOwnerRoutes("support", "care:support_assigned");
}

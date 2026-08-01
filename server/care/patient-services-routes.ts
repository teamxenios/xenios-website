import type { Express, Response } from "express";
import { z } from "zod";
import {
  CARE_ROUTE_CONTRACTS,
  type CarePrincipal,
  type CareRecordId,
} from "@shared/care/contracts";
import {
  CARE_SUPPORT_SCOPE_NOTICE,
  CARE_SUPPORT_TOPICS,
  CARE_TRANSMISSION_NOTICE,
  CARE_TRANSMISSION_STATE,
  careDiscoveryAvailability,
  countCareInstructionsAwaitingPublication,
  selectCareInstructionsForPatient,
  toCareMessageReceipt,
  toCareMessageThreadItem,
  toCareSupplyShipmentItem,
  toCareSupportRequestItem,
  toCareSupportRequestReceipt,
} from "@shared/care/patient-services";
import {
  requireCarePermission,
  sendCareTemporarilyUnavailable,
  type CareAccessDependencies,
} from "./access";
import {
  CareMessageThreadNotOwnedError,
  CareServiceStorageUnavailableError,
  type CareInstructionRepository,
  type CareMessageRepository,
  type CareSupplyRepository,
  type CareSupportRepository,
} from "./patient-services-repository";

/**
 * The instructions, supplies, messages, support, and discovery surfaces.
 *
 * All five were declared in `CARE_ROUTE_CONTRACTS` with no handler registered
 * anywhere in `server/care`, so every caller that trusted the contract received
 * a 404 that the shared response envelope renders as a permanent outage.
 *
 * Three properties are enforced here rather than assumed.
 *
 * - A clinical instruction reaches a patient only after
 *   `isCareInstructionPublished` passes, applied in this layer on whatever the
 *   repository returned, so an unpublished draft cannot be disclosed by a query
 *   mistake.
 * - A message or a support request is recorded, or the request fails with a
 *   named reason. There is no path here that answers a patient with a success
 *   the record does not support.
 * - Nothing transmits. `server/care` contains no outbound transport of any
 *   kind, so every write response carries the not-enabled transmission state
 *   and says plainly that no notification is sent.
 * - A patient writes only into their own conversation. The thread id is the one
 *   identifier a caller may name, and the repository checks it against the
 *   writing patient before the insert, so a thread that is unknown or belongs to
 *   someone else is refused rather than written into.
 *
 * Every patient route sits behind `requireCarePermission`, which answers 401
 * for an anonymous caller and 403 for the wrong role before any repository is
 * touched. Discovery is deliberately public and carries no subject data at all;
 * the reasoning is recorded on `CareDiscoveryAvailability`.
 */

const messageBody = z
  .object({
    threadId: z.string().uuid().nullable().default(null),
    subject: z.string().trim().min(1).max(200).nullable().default(null),
    body: z.string().trim().min(1).max(4000),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict();

const supportBody = z
  .object({
    topic: z.enum(CARE_SUPPORT_TOPICS),
    body: z.string().trim().min(1).max(4000),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict();

function patientId(res: Response): CareRecordId | null {
  const principal = res.locals.carePrincipal as CarePrincipal | undefined;
  return principal?.patientId ? (principal.patientId as CareRecordId) : null;
}

function invalid(res: Response) {
  return res.status(400).json({ ok: false, code: "care_invalid_request" });
}

export function registerCareInstructionApi(
  app: Express,
  access: CareAccessDependencies,
  repository: CareInstructionRepository,
) {
  app.get(
    CARE_ROUTE_CONTRACTS.instructions,
    requireCarePermission("care:read_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        const page = await repository.listPatientInstructions(id);
        // The publication gate, applied here on the records the repository
        // returned, so an unpublished draft never reaches the response.
        return res.json({
          ok: true,
          storage: page.storage,
          instructions: selectCareInstructionsForPatient(page.instructions),
          awaitingPublication: countCareInstructionsAwaitingPublication(
            page.instructions,
          ),
        });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );
}

export function registerCareSupplyApi(
  app: Express,
  access: CareAccessDependencies,
  repository: CareSupplyRepository,
) {
  app.get(
    CARE_ROUTE_CONTRACTS.supplies,
    requireCarePermission("care:read_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        const page = await repository.listPatientSupplyShipments(id);
        return res.json({
          ok: true,
          storage: page.storage,
          shipments: page.shipments.map(toCareSupplyShipmentItem),
        });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );
}

export function registerCareMessageApi(
  app: Express,
  access: CareAccessDependencies,
  repository: CareMessageRepository,
  now: () => Date = () => new Date(),
) {
  app.get(
    CARE_ROUTE_CONTRACTS.messages,
    requireCarePermission("care:message_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        const page = await repository.listPatientThreads(id);
        return res.json({
          ok: true,
          storage: page.storage,
          threads: page.threads.map(toCareMessageThreadItem),
          // A message can be offered only where something can hold it. The
          // browser reads this to decide whether the control is usable, and the
          // write route refuses independently of what the browser did.
          sendAvailable: page.storage.available,
          transmission: CARE_TRANSMISSION_STATE,
          notice: CARE_TRANSMISSION_NOTICE,
        });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );

  app.post(
    CARE_ROUTE_CONTRACTS.messages,
    requireCarePermission("care:message_self", access),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = messageBody.safeParse(req.body);
      if (!parsed.success) return invalid(res);
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        const record = await repository.recordPatientMessage({
          patientId: id,
          threadId: parsed.data.threadId as CareRecordId | null,
          subject: parsed.data.subject,
          body: parsed.data.body,
          idempotencyKey: parsed.data.idempotencyKey,
          recordedAt: now().toISOString(),
        });
        // Confirmed only from a record that came back, and confirmed as
        // recorded rather than as sent.
        return res.status(201).json({
          ok: true,
          message: toCareMessageReceipt(record),
        });
      } catch (error) {
        if (error instanceof CareMessageThreadNotOwnedError) {
          // The thread id is the one identifier a caller may name, so it is
          // checked against the caller's own record before anything is written.
          // The refusal names no thread back, because an unknown thread and
          // another patient's thread answer the same way.
          return res.status(403).json({
            ok: false,
            code: "care_message_thread_not_owned",
            transmission: CARE_TRANSMISSION_STATE,
            message:
              "This message was not recorded and nobody will see it. It named a conversation that is not yours. Start a new message instead, and contact local emergency services if this may be an emergency.",
          });
        }
        if (error instanceof CareServiceStorageUnavailableError) {
          return res.status(503).json({
            ok: false,
            code: "care_message_not_recorded",
            missingTables: error.missingTables,
            transmission: CARE_TRANSMISSION_STATE,
            message:
              "This message was not recorded and nobody will see it. Nothing here can hold a Care message yet, so please contact the team directly, and contact local emergency services if this may be an emergency.",
          });
        }
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );
}

export function registerCareSupportApi(
  app: Express,
  access: CareAccessDependencies,
  repository: CareSupportRepository,
  now: () => Date = () => new Date(),
) {
  app.get(
    CARE_ROUTE_CONTRACTS.support,
    requireCarePermission("care:read_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        const page = await repository.listPatientSupportRequests(id);
        return res.json({
          ok: true,
          storage: page.storage,
          requests: page.requests.map(toCareSupportRequestItem),
          submissionAvailable: page.storage.available,
          transmission: CARE_TRANSMISSION_STATE,
          scopeNotice: CARE_SUPPORT_SCOPE_NOTICE,
          notice: CARE_TRANSMISSION_NOTICE,
        });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );

  // A support request is a communication a patient writes, so it takes the
  // same permission a message does rather than the read permission.
  app.post(
    CARE_ROUTE_CONTRACTS.support,
    requireCarePermission("care:message_self", access),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = supportBody.safeParse(req.body);
      if (!parsed.success) return invalid(res);
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        const record = await repository.recordSupportRequest({
          patientId: id,
          topic: parsed.data.topic,
          body: parsed.data.body,
          idempotencyKey: parsed.data.idempotencyKey,
          recordedAt: now().toISOString(),
        });
        return res.status(201).json({
          ok: true,
          request: toCareSupportRequestReceipt(record),
        });
      } catch (error) {
        if (error instanceof CareServiceStorageUnavailableError) {
          return res.status(503).json({
            ok: false,
            code: "care_support_request_not_recorded",
            missingTables: error.missingTables,
            transmission: CARE_TRANSMISSION_STATE,
            message:
              "This request was not recorded and nobody will see it. Nothing here can hold a Care support request yet, so please contact the team directly.",
          });
        }
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );
}

export function registerCareDiscoveryApi(
  app: Express,
  access: CareAccessDependencies,
) {
  // Public on purpose. This read is for a Research subject who holds no Care
  // role, so a Care permission guard would deny exactly the person it is for.
  // It answers with the capability state `/api/care/status` already makes
  // public plus static contract facts, consults no repository, and never
  // accepts, reflects, or stores a subject identifier.
  app.get(CARE_ROUTE_CONTRACTS.discovery, async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const capability = await access.loadCapabilityStatus();
      return res.json({
        ok: true,
        capability,
        discovery: careDiscoveryAvailability(),
      });
    } catch {
      return sendCareTemporarilyUnavailable(res);
    }
  });
}

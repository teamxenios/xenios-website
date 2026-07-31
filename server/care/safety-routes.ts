import type { Express, Response } from "express";
import { z } from "zod";
import {
  CARE_ROUTE_CONTRACTS,
  type CarePrincipal,
  type CareRecordId,
} from "@shared/care/contracts";
import {
  CARE_ADVERSE_EVENT_SEVERITIES,
  countCareLabResultsAwaitingRelease,
  selectCareLabResultsForPatient,
  toCareAdverseEventItem,
  toCareLabReviewerItem,
} from "@shared/care/safety";
import {
  requireCarePermission,
  sendCareTemporarilyUnavailable,
  type CareAccessDependencies,
} from "./access";
import {
  CareStorageUnavailableError,
  type CareAdverseEventRepository,
  type CareLabRepository,
} from "./safety-repository";

/**
 * The lab and adverse event surfaces.
 *
 * `CARE_ROUTE_CONTRACTS.labs` and `CARE_ROUTE_CONTRACTS.adverseEvents` were
 * declared with no handler registered anywhere, and `lab_reviewer` plus
 * `care:labs_assigned` existed with no route using them. Every client that
 * trusted the contract received a 404, which the shared response envelope
 * renders as a permanent outage rather than as a missing feature.
 *
 * Two properties are enforced here rather than assumed:
 *
 * - A lab result reaches a patient only after `isCareLabResultReleasedToPatient`
 *   passes, applied in this layer on whatever the repository returned. A result
 *   the repository hands over unreleased is dropped before the response is
 *   built, so a repository or query mistake cannot disclose it.
 * - An adverse event report is recorded or the request fails with a named
 *   reason. There is no path here that answers a patient with a success the
 *   record does not support.
 *
 * Every route sits behind `requireCarePermission`, which answers 401 for an
 * anonymous caller and 403 for the wrong role before any repository is touched.
 */

const reportBody = z
  .object({
    narrative: z.string().trim().min(1).max(4000),
    patientReportedSeverity: z.enum(CARE_ADVERSE_EVENT_SEVERITIES),
    occurredAt: z.string().datetime().nullable().default(null),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict();

function principal(res: Response): CarePrincipal | null {
  return (res.locals.carePrincipal as CarePrincipal | undefined) ?? null;
}

function patientId(res: Response): CareRecordId | null {
  const id = principal(res)?.patientId;
  return id ? (id as CareRecordId) : null;
}

function invalid(res: Response) {
  return res.status(400).json({ ok: false, code: "care_invalid_request" });
}

export function registerCareLabApi(
  app: Express,
  access: CareAccessDependencies,
  repository: CareLabRepository,
) {
  // Registered first so the fixed segment is never read as a record id if a
  // parameterised lab route is added later.
  app.get(
    `${CARE_ROUTE_CONTRACTS.labs}/queue`,
    requireCarePermission("care:labs_assigned", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const reviewerUserId = principal(res)?.subjectId;
      if (!reviewerUserId) return sendCareTemporarilyUnavailable(res);
      try {
        const page = await repository.listReviewerLabResults(reviewerUserId);
        return res.json({
          ok: true,
          storage: page.storage,
          queue: page.results.map(toCareLabReviewerItem),
        });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );

  app.get(
    CARE_ROUTE_CONTRACTS.labs,
    requireCarePermission("care:read_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        const page = await repository.listPatientLabResults(id);
        // The release gate. Applied here, on the records the repository
        // returned, so an unreleased result never reaches the response.
        return res.json({
          ok: true,
          storage: page.storage,
          results: selectCareLabResultsForPatient(page.results),
          awaitingRelease: countCareLabResultsAwaitingRelease(page.results),
        });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );
}

export function registerCareAdverseEventApi(
  app: Express,
  access: CareAccessDependencies,
  repository: CareAdverseEventRepository,
  now: () => Date = () => new Date(),
) {
  app.get(
    `${CARE_ROUTE_CONTRACTS.adverseEvents}/reported`,
    requireCarePermission("care:review_assigned", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const clinicianUserId = principal(res)?.subjectId;
      if (!clinicianUserId) return sendCareTemporarilyUnavailable(res);
      try {
        const page = await repository.listReviewerAdverseEvents(clinicianUserId);
        return res.json({
          ok: true,
          storage: page.storage,
          reports: page.reports.map(toCareAdverseEventItem),
        });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );

  app.get(
    CARE_ROUTE_CONTRACTS.adverseEvents,
    requireCarePermission("care:read_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        const page = await repository.listPatientAdverseEvents(id);
        return res.json({
          ok: true,
          storage: page.storage,
          reports: page.reports.map(toCareAdverseEventItem),
          // A report can be offered only where something can hold it. The
          // browser reads this to decide whether the control is usable, and the
          // write route refuses independently of what the browser did.
          submissionAvailable: page.storage.available,
        });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );

  app.post(
    CARE_ROUTE_CONTRACTS.adverseEvents,
    requireCarePermission("care:message_self", access),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = reportBody.safeParse(req.body);
      if (!parsed.success) return invalid(res);
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        const record = await repository.recordAdverseEvent({
          patientId: id,
          patientReportedSeverity: parsed.data.patientReportedSeverity,
          narrative: parsed.data.narrative,
          occurredAt: parsed.data.occurredAt,
          idempotencyKey: parsed.data.idempotencyKey,
          reportedAt: now().toISOString(),
        });
        // The report is confirmed only from a record that came back.
        return res.status(201).json({
          ok: true,
          report: toCareAdverseEventItem(record),
        });
      } catch (error) {
        if (error instanceof CareStorageUnavailableError) {
          return res.status(503).json({
            ok: false,
            code: "care_adverse_event_not_recorded",
            missingTables: error.missingTables,
            message:
              "This report was not recorded. Nothing here can hold an adverse event report yet, so please contact the team directly, and contact local emergency services if this may be an emergency.",
          });
        }
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );
}

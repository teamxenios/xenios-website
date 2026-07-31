import type { Express, Response } from "express";
import { z } from "zod";
import {
  CARE_ROUTE_CONTRACTS,
  type CarePrincipal,
  type CareRecordId,
} from "@shared/care/contracts";
import { summarizeCareReviewQueue } from "@shared/care/review-queue";
import type { CareClinicalCapabilityFlags } from "@shared/care/clinical-actions";
import {
  requireCarePermission,
  sendCareTemporarilyUnavailable,
  type CareAccessDependencies,
} from "./access";
import {
  careReviewActionStates,
  readCareClinicalCapabilityFlags,
  sortCareReviewQueue,
  toCareReviewDetail,
  toCareReviewQueueItem,
} from "./review-detail";
import type { CareClinicianReviewRepository } from "./review-repository";

const recordId = z.string().uuid();

function principal(res: Response): CarePrincipal | null {
  return (res.locals.carePrincipal as CarePrincipal | undefined) ?? null;
}

function invalid(res: Response) {
  return res.status(400).json({ ok: false, code: "care_invalid_request" });
}

/**
 * A review that is not assigned to this clinician is reported as not found,
 * never as forbidden, so the queue cannot be used to prove that a given review
 * id exists.
 */
function notFound(res: Response) {
  return res.status(404).json({ ok: false, code: "care_review_not_found" });
}

/**
 * The clinician review read surface.
 *
 * Both routes sit behind `care:review_assigned`, so an anonymous visitor gets
 * 401 and a member or any other role gets 403 before a repository is touched.
 * The responses are workflow projections only: no patient identifier, no
 * clinician identity, no intake answer, and no clinical content.
 */
export function registerCareClinicianReviewApi(
  app: Express,
  access: CareAccessDependencies,
  repository: CareClinicianReviewRepository,
  readFlags: () => CareClinicalCapabilityFlags = () =>
    readCareClinicalCapabilityFlags(),
) {
  // Registered before the parameterised route so "queue" is never read as an id.
  app.get(
    `${CARE_ROUTE_CONTRACTS.reviews}/queue`,
    requireCarePermission("care:review_assigned", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const clinicianUserId = principal(res)?.subjectId;
      if (!clinicianUserId) return sendCareTemporarilyUnavailable(res);
      try {
        const facts = await repository.listAssignedReviewFacts(clinicianUserId);
        const queue = sortCareReviewQueue(facts.map(toCareReviewQueueItem));
        return res.json({
          ok: true,
          queue,
          summary: summarizeCareReviewQueue(queue),
        });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );

  app.get(
    `${CARE_ROUTE_CONTRACTS.reviews}/:reviewId`,
    requireCarePermission("care:review_assigned", access),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      const reviewId = recordId.safeParse(req.params.reviewId);
      const clinicianUserId = principal(res)?.subjectId;
      if (!reviewId.success) return invalid(res);
      if (!clinicianUserId) return sendCareTemporarilyUnavailable(res);
      try {
        const facts = await repository.loadAssignedReviewFacts({
          reviewId: reviewId.data as CareRecordId,
          clinicianUserId,
        });
        if (!facts) return notFound(res);
        // Defense in depth. The query is already scoped to the assigned
        // clinician, and this refuses a record that arrives scoped wrongly.
        if (facts.review.assignedClinicianUserId !== clinicianUserId) {
          return notFound(res);
        }
        const capability = await access.loadCapabilityStatus();
        const detail = toCareReviewDetail(facts);
        return res.json({
          ok: true,
          detail,
          actions: careReviewActionStates({
            detail,
            careEnabled: capability.enabled,
            flags: readFlags(),
          }),
        });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );
}

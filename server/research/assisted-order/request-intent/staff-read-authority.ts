import type { RequestHandler } from "express";
import { hasCarePermission, type CarePrincipal } from "../../../../shared/care/contracts";
import type { CareAccessDependencies } from "../../../care/access";

/** A separate pending-intake read scope, NOT whole-Care enablement.
 * The existing clinical_admin role is reused; no website email or new role
 * establishes medical-data access. The SQL reader separately requires an
 * approved care_capabilities row for this exact purpose on every operation.
 */
export const REQUEST_INTENT_PENDING_READ_PURPOSE = "request_intent_pending_read";
export const REQUEST_INTENT_STAFF_READ_ENABLED_ENV = "RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED";
export type RequestIntentStaffReadContext = Readonly<{
  purpose: typeof REQUEST_INTENT_PENDING_READ_PURPOSE;
  actorSubjectId: string;
  enabled: boolean;
}>;

export function canReadPendingRequestIntent(
  principal: CarePrincipal | null, context: RequestIntentStaffReadContext | null | undefined,
): boolean {
  return !!principal && !!context && context.enabled === true
    && context.purpose === REQUEST_INTENT_PENDING_READ_PURPOSE
    && context.actorSubjectId === principal.subjectId
    && hasCarePermission(principal, "care:administer");
}

/** Reuses canonical verified JWT + active-role resolution and durable access
 * audit, but deliberately never calls loadCapabilityStatus(). Only these two
 * pending read routes use this guard. Existing Care routes retain their guard.
 * An allowed role decision here is not DB approval or a successful data read.
 */
export function requirePendingRequestIntentRead(
  care: CareAccessDependencies, enabled: () => boolean,
): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      if (!enabled()) {
        res.status(503).json({ error: "private_review_unavailable" }); return;
      }
      const principal = await care.resolvePrincipal(req);
      const context: RequestIntentStaffReadContext | null = principal ? {
        purpose: REQUEST_INTENT_PENDING_READ_PURPOSE, actorSubjectId: principal.subjectId, enabled: true,
      } : null;
      const allowed = canReadPendingRequestIntent(principal, context);
      await care.recordAccessDecision({
        actorSubjectId: principal?.subjectId ?? null, permission: "care:administer",
        outcome: !principal ? "unauthenticated" : allowed ? "allowed" : "forbidden",
        occurredAt: new Date().toISOString(),
      });
      if (!principal) { res.status(401).json({ error: "authentication_required" }); return; }
      if (!allowed) { res.status(403).json({ error: "private_review_access_required" }); return; }
      res.locals.requestIntentStaffPrincipal = principal;
      res.locals.requestIntentStaffReadContext = context;
      next();
    })().catch(() => {
      // Identity, role and audit failures authorize nothing and disclose no
      // adapter diagnostics. No token, request selection or contact is logged.
      res.status(503).json({ error: "private_review_unavailable" });
    });
  };
}

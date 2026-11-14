import type { RequestHandler } from "express";
import { hasCarePermission, type CarePrincipal } from "../../../../shared/care/contracts";
import type { CareAccessDependencies } from "../../../care/access";

/** Both staff paths require an active, approved database capability on each read. */
export const REQUEST_INTENT_PENDING_READ_PURPOSE = "request_intent_pending_read";
export const REQUEST_INTENT_STAFF_READ_ENABLED_ENV = "RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED";
export type RequestIntentStaffReadContext = Readonly<{
  purpose: typeof REQUEST_INTENT_PENDING_READ_PURPOSE;
  actorSubjectId: string;
  enabled: boolean;
}>;

/** Select the reader from the verified assignment. The issuer uses its existing clinical reader. */
export function pendingRequestStaffMode(principal: CarePrincipal | null) {
  if (principal && hasCarePermission(principal, "request_intent:read_pending")) return "operator";
  if (principal && hasCarePermission(principal, "care:administer")) return "clinical";
  return null;
}

export function canReadPendingRequestIntent(
  principal: CarePrincipal | null, context: RequestIntentStaffReadContext | null | undefined,
): boolean {
  return !!principal && !!context && context.enabled === true
    && context.purpose === REQUEST_INTENT_PENDING_READ_PURPOSE
    && context.actorSubjectId === principal.subjectId
    && pendingRequestStaffMode(principal) !== null;
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
        actorSubjectId: principal?.subjectId ?? null,
        permission: pendingRequestStaffMode(principal) === "clinical" ? "care:administer" : "request_intent:read_pending",
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

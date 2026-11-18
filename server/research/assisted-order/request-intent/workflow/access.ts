import type { RequestHandler } from "express";
import { hasCarePermission, type CarePrincipal } from "../../../../../shared/care/contracts";
import type { CareAccessDependencies } from "../../../../care/access";
import { decodeJwtClaims } from "../../../member-auth";
import { getSupabaseAnon } from "../../../../supabase";

/** Use the pinned SDK with the actual verified bearer, not browser state or
 * nextLevel (which merely says a factor could be challenged). */
export async function currentRequestProcessorMfa(token: string): Promise<boolean> {
  const { data, error } = await getSupabaseAnon().auth.mfa.getAuthenticatorAssuranceLevel(token);
  return !error && data?.currentLevel === "aal2";
}
export async function requestProcessorMfa(req: Parameters<RequestHandler>[0], principal: CarePrincipal,
  currentMfa: (token: string) => Promise<boolean> = currentRequestProcessorMfa): Promise<boolean> {
  if (!hasCarePermission(principal, "request_intent:process")) return false;
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "")?.[1];
  const claims = bearer ? decodeJwtClaims(bearer) : null;
  return !!bearer && claims?.sub === principal.subjectId && claims?.aal === "aal2" &&
    typeof claims.exp === "number" && Number.isFinite(claims.exp) && claims.exp > Date.now() / 1000 && await currentMfa(bearer);
}

/** Auth getUser + current active roles are resolved by canonical Care first.
 * Only after verification may claims supply this token's MFA assurance. */
export function requireRequestProcessor(care: CareAccessDependencies, enabled: () => boolean,
  currentMfa: (token: string) => Promise<boolean> = currentRequestProcessorMfa): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      if (!enabled()) { res.status(503).json({ error: "request_workflow_unavailable" }); return; }
      const principal = await care.resolvePrincipal(req);
      const mfa = !!principal && await requestProcessorMfa(req, principal, currentMfa);
      const allowed = !!principal && mfa && hasCarePermission(principal, "request_intent:process");
      await care.recordAccessDecision({ actorSubjectId: principal?.subjectId ?? null, permission: "request_intent:process",
        outcome: !principal ? "unauthenticated" : allowed ? "allowed" : "forbidden", occurredAt: new Date().toISOString() });
      if (!principal) { res.status(401).json({ error: "authentication_required" }); return; }
      if (!allowed) { res.status(403).json({ error: "request_processing_access_required" }); return; }
      res.locals.requestIntentProcessor = { actorId: principal.subjectId, mfaVerified: mfa };
      next();
    })().catch(() => { res.status(503).json({ error: "request_workflow_unavailable" }); });
  };
}

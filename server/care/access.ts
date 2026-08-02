import type { NextFunction, Request, Response } from "express";
import {
  hasCarePermission,
  type CarePermission,
  type CarePrincipal,
} from "@shared/care/contracts";
import type { CareCapabilityStatus } from "@shared/care/contracts";

export type ResolveCarePrincipal = (req: Request) => Promise<CarePrincipal | null>;

export const CARE_TEMPORARILY_UNAVAILABLE_RESPONSE = {
  ok: false,
  code: "care_temporarily_unavailable",
  message: "Care status is temporarily unavailable.",
} as const;

export function sendCareTemporarilyUnavailable(res: Response) {
  return res.status(503).json(CARE_TEMPORARILY_UNAVAILABLE_RESPONSE);
}

export interface CareAccessDecision {
  actorSubjectId: string | null;
  permission: CarePermission;
  outcome: "allowed" | "unauthenticated" | "forbidden";
  occurredAt: string;
}

export interface CareAccessDependencies {
  loadCapabilityStatus: () => Promise<CareCapabilityStatus>;
  resolvePrincipal: ResolveCarePrincipal;
  recordAccessDecision: (decision: CareAccessDecision) => Promise<void>;
}

function isExactlyEnabledCareCapability(
  capability: CareCapabilityStatus,
): boolean {
  return capability.rail === "care" &&
    capability.state === "enabled" &&
    capability.enabled === true;
}

export function requireCarePermission(
  permission: CarePermission,
  deps: CareAccessDependencies,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const capability = await deps.loadCapabilityStatus();
      if (!isExactlyEnabledCareCapability(capability)) {
        return res.status(503).json({
          ok: false,
          code: "care_disabled",
          message: "Care is not currently available.",
        });
      }

      const principal = await deps.resolvePrincipal(req);
      if (!principal) {
        await deps.recordAccessDecision({
          actorSubjectId: null,
          permission,
          outcome: "unauthenticated",
          occurredAt: new Date().toISOString(),
        });
        return res.status(401).json({ ok: false, code: "care_auth_required" });
      }
      if (!hasCarePermission(principal, permission)) {
        await deps.recordAccessDecision({
          actorSubjectId: principal.subjectId,
          permission,
          outcome: "forbidden",
          occurredAt: new Date().toISOString(),
        });
        return res.status(403).json({ ok: false, code: "care_forbidden" });
      }

      await deps.recordAccessDecision({
        actorSubjectId: principal.subjectId,
        permission,
        outcome: "allowed",
        occurredAt: new Date().toISOString(),
      });
      res.locals.carePrincipal = principal;
      next();
    } catch {
      // Repository, identity-provider, role, and audit failures stay inside
      // the Care boundary. Never expose adapter error text or authorize a
      // request whose access decision could not be durably recorded.
      return sendCareTemporarilyUnavailable(res);
    }
  };
}

export function unconfiguredCareAccessDependencies(): CareAccessDependencies {
  return {
    loadCapabilityStatus: async () => ({
      rail: "care",
      state: "disabled",
      enabled: false,
      publicMessage: "Care is being prepared.",
      checkedAt: new Date().toISOString(),
    }),
    resolvePrincipal: async () => null,
    recordAccessDecision: async () => undefined,
  };
}

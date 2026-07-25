import type { NextFunction, Request, Response } from "express";
import {
  hasCarePermission,
  type CarePermission,
  type CarePrincipal,
} from "@shared/care/contracts";
import { careCapabilityStatus } from "./capability";

export type ResolveCarePrincipal = (req: Request) => Promise<CarePrincipal | null>;

export interface CareAccessDependencies {
  resolvePrincipal: ResolveCarePrincipal;
}

export function requireCarePermission(
  permission: CarePermission,
  deps: CareAccessDependencies,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!careCapabilityStatus().enabled) {
      return res.status(503).json({
        ok: false,
        code: "care_disabled",
        message: careCapabilityStatus().publicMessage,
      });
    }

    const principal = await deps.resolvePrincipal(req);
    if (!principal) {
      return res.status(401).json({ ok: false, code: "care_auth_required" });
    }
    if (!hasCarePermission(principal, permission)) {
      return res.status(403).json({ ok: false, code: "care_forbidden" });
    }

    res.locals.carePrincipal = principal;
    next();
  };
}

export function unconfiguredCareAccessDependencies(): CareAccessDependencies {
  return {
    resolvePrincipal: async () => null,
  };
}

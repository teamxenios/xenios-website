import type { Express, NextFunction, Request, Response } from "express";
import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import {
  requireCarePermission,
  sendCareTemporarilyUnavailable,
  unconfiguredCareAccessDependencies,
  type CareAccessDependencies,
} from "./access";

export function carePageGate(req: Request, res: Response, next: NextFunction) {
  const normalized = req.path.toLowerCase();
  if (normalized !== "/care" && !normalized.startsWith("/care/")) return next();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
}

export function registerCareApi(
  app: Express,
  deps: CareAccessDependencies = unconfiguredCareAccessDependencies(),
) {
  app.get(CARE_ROUTE_CONTRACTS.status, async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      res.json({ ok: true, capability: await deps.loadCapabilityStatus() });
    } catch {
      sendCareTemporarilyUnavailable(res);
    }
  });

  // This probe proves the server-side role boundary without creating a
  // clinical workflow or accepting clinical data.
  app.get(
    `${CARE_ROUTE_CONTRACTS.audit}/access`,
    requireCarePermission("care:security_audit", deps),
    (_req, res) => res.json({ ok: true }),
  );
}

export * from "./access";
export * from "./appointment-readiness";
export * from "./appointment-repository";
export * from "./appointment-routes";
export * from "./appointments";
export * from "./capability";
export * from "./clinician-review";
export * from "./consent";
export * from "./consent-repository";
export * from "./eligibility";
export * from "./eligibility-repository";
export * from "./eligibility-routes";
export * from "./intake";
export * from "./intake-repository";
export * from "./intake-routes";
export * from "./production-deps";
export * from "./waitlist";

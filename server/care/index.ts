import type { Express, NextFunction, Request, Response } from "express";
import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import { careCapabilityStatus } from "./capability";
import {
  requireCarePermission,
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
  app.get(CARE_ROUTE_CONTRACTS.status, (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, capability: careCapabilityStatus() });
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
export * from "./capability";
export * from "./clinical";
export * from "./pharmacy";

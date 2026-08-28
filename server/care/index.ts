import type { Express, NextFunction, Request, Response } from "express";
import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import { isCarePath } from "@shared/care/paths";
import { TEBRA_PUBLIC_CONFIGURATION_PATH } from "@shared/care/tebra-experience";
import {
  requireCarePermission,
  sendCareTemporarilyUnavailable,
  unconfiguredCareAccessDependencies,
  type CareAccessDependencies,
} from "./access";
import { careCapabilityStatusForState } from "./capability";
import { resolveTebraPublicConfiguration } from "./tebra-scheduling";

export function carePageGate(req: Request, res: Response, next: NextFunction) {
  const requestPath = req.originalUrl || req.url || req.path;
  if (!isCarePath(requestPath)) return next();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
}

export function registerCareApi(
  app: Express,
  deps: CareAccessDependencies = unconfiguredCareAccessDependencies(),
  options: { env?: NodeJS.ProcessEnv } = {},
) {
  app.use("/api/care", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    res.set("Referrer-Policy", "no-referrer");
    res.set("X-Robots-Tag", "noindex, nofollow");
    next();
  });

  app.get(CARE_ROUTE_CONTRACTS.status, async (_req, res) => {
    try {
      res.json({ ok: true, capability: await deps.loadCapabilityStatus() });
    } catch {
      sendCareTemporarilyUnavailable(res);
    }
  });

  app.get(TEBRA_PUBLIC_CONFIGURATION_PATH, async (_req, res) => {
    let capability;
    try {
      capability = await deps.loadCapabilityStatus();
    } catch {
      capability = careCapabilityStatusForState("disabled");
    }
    res.json(
      resolveTebraPublicConfiguration({
        env: options.env,
        careCapability: capability,
      }),
    );
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
export * from "./prescriptions";
export * from "./prescription-repository";
export * from "./prescription-routes";
export * from "./waitlist";
export * from "./tebra-csp";
export * from "./tebra-scheduling";

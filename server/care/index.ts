import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { requireSupabaseAdmin } from "../routes";
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
import {
  buildCareManualAccessProductionDependencies,
  careManualAccessAvailability,
  registerCareManualAccessApi,
  type CareManualAccessDependencies,
} from "./manual-access";
import {
  buildCareManualAccessAdminProductionDependencies,
  registerCareManualAccessAdminApi,
  type CareManualAccessAdminDependencies,
} from "./manual-access-admin";
import {
  buildCareLoiBoundaryProductionDependencies,
  registerCareLoiBoundary,
  type CareLoiBoundaryDependencies,
} from "./loi-boundary";
import { resolveTebraPublicConfiguration } from "./tebra-scheduling";
import type {
  TebraPublicActivationContext,
  TebraPublicAuthoritySource,
} from "./tebra-public-authority";

export function carePageGate(req: Request, res: Response, next: NextFunction) {
  const requestPath = req.originalUrl || req.url || req.path;
  if (!isCarePath(requestPath)) return next();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
}

export interface RegisterCareApiOptions {
  env?: NodeJS.ProcessEnv;
  tebraAuthoritySource?: TebraPublicAuthoritySource;
  manualAccessDependencies?: CareManualAccessDependencies;
  manualAccessAdminDependencies?: CareManualAccessAdminDependencies;
  manualAccessAdminGuard?: RequestHandler;
  loiBoundaryDependencies?: CareLoiBoundaryDependencies;
  /** Independently resolved deployment identity; never supplied by the authority reader. */
  currentReleaseSha?: string;
  clock?: () => Date;
}

export function registerCareApi(
  app: Express,
  deps: CareAccessDependencies = unconfiguredCareAccessDependencies(),
  options: RegisterCareApiOptions = {},
) {
  app.use("/api/care", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    res.set("Referrer-Policy", "no-referrer");
    res.set("X-Robots-Tag", "noindex, nofollow");
    next();
  });

  const manualAccess =
    options.manualAccessDependencies ?? buildCareManualAccessProductionDependencies();
  registerCareManualAccessApi(app, manualAccess);

  const manualAccessAdmin =
    options.manualAccessAdminDependencies ??
    buildCareManualAccessAdminProductionDependencies();
  registerCareManualAccessAdminApi(
    app,
    options.manualAccessAdminGuard ?? requireSupabaseAdmin,
    manualAccessAdmin,
  );
  registerCareLoiBoundary(
    app,
    options.manualAccessAdminGuard ?? requireSupabaseAdmin,
    options.loiBoundaryDependencies ?? buildCareLoiBoundaryProductionDependencies(),
  );

  app.get(CARE_ROUTE_CONTRACTS.status, async (_req, res) => {
    try {
      const capability = await deps.loadCapabilityStatus();
      let accessRequests;
      try {
        accessRequests = careManualAccessAvailability(
          await manualAccess.loadReadiness(),
        );
      } catch {
        accessRequests = careManualAccessAvailability({
          persistenceReady: false,
          notificationsReady: false,
        });
      }
      res.json({ ok: true, capability, accessRequests });
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

    let activation: TebraPublicActivationContext | undefined;
    if (capability.enabled && options.tebraAuthoritySource) {
      try {
        activation = {
          currentReleaseSha: options.currentReleaseSha,
          authorities: await options.tebraAuthoritySource.load(),
          now: options.clock?.() ?? new Date(),
        };
      } catch {
        // A durable-authority dependency failure is an unavailable public
        // handoff, never permission to fall back to retained environment URLs.
      }
    }
    res.json(
      resolveTebraPublicConfiguration({
        env: options.env,
        careCapability: capability,
        activation,
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
export * from "./manual-access";
export * from "./manual-access-admin";
export * from "./production-deps";
export * from "./prescriptions";
export * from "./prescription-repository";
export * from "./prescription-routes";
export * from "./waitlist";
export * from "./tebra-csp";
export * from "./tebra-public-authority";
export * from "./tebra-scheduling";

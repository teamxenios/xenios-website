import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  CARE_DISCOVERY_NEXT_PATH,
  CARE_ROUTE_CONTRACTS,
  createResearchToCareDiscovery,
  type ResearchToCareDiscoveryResponse,
} from "@shared/care/contracts";
import {
  requireCarePermission,
  sendCareTemporarilyUnavailable,
  unconfiguredCareAccessDependencies,
  type CareAccessDependencies,
} from "./access";

const discoveryRequestBody = z.object({ consent: z.literal(true) }).strict();

function hasServerDerivedSubject(
  principal: Awaited<ReturnType<CareAccessDependencies["resolvePrincipal"]>>,
): principal is NonNullable<typeof principal> {
  return typeof principal?.subjectId === "string" &&
    principal.subjectId.trim().length > 0;
}

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
  now: () => Date = () => new Date(),
) {
  app.use("/api/care", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
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

  app.post(CARE_ROUTE_CONTRACTS.discovery, async (req, res) => {
    try {
      // This is an authenticated, metadata-only handoff. It intentionally
      // bypasses the Care capability gate and does not persist or activate a
      // Care workflow.
      const principal = await deps.resolvePrincipal(req);
      if (principal === null) {
        return res.status(401).json({ ok: false, code: "care_auth_required" });
      }
      if (!hasServerDerivedSubject(principal)) {
        return sendCareTemporarilyUnavailable(res);
      }

      const parsed = discoveryRequestBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          code: "care_invalid_request",
        });
      }

      const response = {
        ok: true,
        discovery: createResearchToCareDiscovery(
          principal.subjectId,
          now().toISOString(),
        ),
        nextPath: CARE_DISCOVERY_NEXT_PATH,
      } satisfies ResearchToCareDiscoveryResponse;
      return res.status(200).json(response);
    } catch {
      return sendCareTemporarilyUnavailable(res);
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
export * from "./prescriptions";
export * from "./prescription-repository";
export * from "./prescription-routes";
export * from "./waitlist";

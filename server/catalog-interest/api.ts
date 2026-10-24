import type { Express, Request, RequestHandler, Response } from "express";
import {
  CATALOG_INTEREST_PATH,
  CatalogInterestRequest,
  type CatalogInterestError,
} from "@shared/catalog-interest";
import type { CatalogInterestServiceDependencies } from "./service";
import { recordCatalogInterest } from "./service";

export interface CatalogInterestApiDependencies extends CatalogInterestServiceDependencies {
  rateLimit(ip: string): Promise<"allowed" | "denied" | "unavailable">;
  verifyChallenge(token: string | undefined, ip: string): Promise<boolean>;
  requestIp(req: Request): string;
}

const errors = {
  invalid: {
    ok: false,
    code: "invalid_request",
    message: "Enter a valid email address and try again.",
  },
  verification: {
    ok: false,
    code: "verification_failed",
    message: "Verification could not be completed. Please try again.",
  },
  limited: {
    ok: false,
    code: "too_many_requests",
    message: "Too many requests. Please wait a few minutes and try again.",
  },
  conflict: {
    ok: false,
    code: "request_conflict",
    message: "This request reference was already used for different details. Start a new request.",
  },
  unavailable: {
    ok: false,
    code: "temporarily_unavailable",
    message: "The catalog request line is temporarily unavailable. Please try again later.",
  },
} as const satisfies Record<string, CatalogInterestError>;

function setCatalogResponseHeaders(res: Response): void {
  res.set({
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  });
}

export function createCatalogInterestHandler(
  deps: CatalogInterestApiDependencies,
): RequestHandler {
  return async (req, res) => {
    setCatalogResponseHeaders(res);
    const parsed = CatalogInterestRequest.safeParse(req.body);
    if (!parsed.success || parsed.data.confirmEmpty.trim().length > 0) {
      return res.status(400).json(errors.invalid);
    }

    let ip: string;
    let rateLimit: Awaited<ReturnType<CatalogInterestApiDependencies["rateLimit"]>>;
    try {
      ip = deps.requestIp(req);
      rateLimit = await deps.rateLimit(ip);
    } catch {
      return res.status(503).json(errors.unavailable);
    }
    if (rateLimit === "unavailable") {
      return res.status(503).json(errors.unavailable);
    }
    if (rateLimit === "denied") {
      return res.status(429).json(errors.limited);
    }
    let verified: boolean;
    try {
      verified = await deps.verifyChallenge(parsed.data.turnstileToken, ip);
    } catch {
      return res.status(503).json(errors.unavailable);
    }
    if (!verified) {
      return res.status(403).json(errors.verification);
    }

    try {
      const result = await recordCatalogInterest(deps, parsed.data);
      if (!result.ok) return res.status(409).json(errors.conflict);
      return res.status(200).json(result);
    } catch {
      return res.status(503).json(errors.unavailable);
    }
  };
}

export function registerCatalogInterestApi(
  app: Express,
  deps: CatalogInterestApiDependencies,
): void {
  app.post(CATALOG_INTEREST_PATH, createCatalogInterestHandler(deps));
}

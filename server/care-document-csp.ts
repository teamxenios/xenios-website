import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";

import { isCarePath } from "@shared/care/paths";

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * Care document policy. The only external browser origin is Cloudflare
 * Turnstile, which protects the Xenios-owned manual access request. Scheduling
 * and portal providers remain absent until separately attested.
 */
export const CARE_BASELINE_CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  baseUri: ["'none'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
  scriptSrc: ["'self'", TURNSTILE_ORIGIN],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  styleSrcElem: ["'self'"],
  styleSrcAttr: ["'unsafe-inline'"],
  fontSrc: ["'self'"],
  imgSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  frameSrc: [TURNSTILE_ORIGIN],
  workerSrc: ["'self'"],
  manifestSrc: ["'self'"],
  mediaSrc: ["'self'"],
  upgradeInsecureRequests: [],
};

const applyCareBaselineCsp = helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: CARE_BASELINE_CSP_DIRECTIVES,
});

export function careDocumentCsp(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestPath = req.originalUrl || req.url || req.path;
  if (!isCarePath(requestPath)) {
    next();
    return;
  }

  applyCareBaselineCsp(req, res, next);
}

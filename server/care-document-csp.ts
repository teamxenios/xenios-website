import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";

import { isCarePath } from "@shared/care/paths";

/**
 * Disabled-state policy for Care documents. Scheduling-provider sources stay
 * absent until a separately attested activation is composed and verified.
 */
export const CARE_BASELINE_CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  baseUri: ["'none'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
  scriptSrc: ["'self'"],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  styleSrcElem: ["'self'"],
  styleSrcAttr: ["'unsafe-inline'"],
  fontSrc: ["'self'"],
  imgSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  frameSrc: ["'none'"],
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

import express, { type ErrorRequestHandler, type Express, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { businessInquiryInputSchema } from "@shared/research/business-inquiry";
import {
  BusinessInquiryRefusal, type BusinessInquiryFailure, type BusinessInquiryService,
  type BusinessInquirySubmissionContext,
} from "./business-inquiry";

export interface BusinessInquiryRouteDependencies {
  service: Pick<BusinessInquiryService, "submit" | "list" | "read" | "assign" | "listOrganization">;
  /** Root must supply both same-origin enforcement and rate limiting. Applied before body/context access. */
  publicGuard: RequestHandler;
  /** Dedicated CRM authority, never the Early Access queue-reader grant. */
  requireStaff: RequestHandler;
  /** Verified Pack02 membership/role authority; a domain, referral or draft grants nothing. */
  requireOrganization: RequestHandler;
  resolveActorId(req: Request): Promise<string | null>;
  resolveSubmissionContext(req: Request): Promise<BusinessInquirySubmissionContext | null>;
  enabled?: () => boolean;
}

const STATUS: Record<BusinessInquiryFailure, number> = {
  invalid_request: 400, not_permitted: 403, not_found: 404, conflict: 409,
  not_ready: 503, unavailable: 503,
};
const MAX_JSON_BYTES = 64 * 1024;
const submissionSchema = z.object({
  attemptKey: z.string().regex(/^[A-Za-z0-9_-]{24,128}$/),
  enquiry: businessInquiryInputSchema,
}).strict();
const pageQuerySchema = z.object({ before: z.string().uuid().optional() }).strict();
const emptyQuerySchema = z.object({}).strict();

function failure(res: Response, error: unknown): void {
  const code = error instanceof BusinessInquiryRefusal ? error.code : "unavailable";
  res.status(STATUS[code]).json({ error: code });
}
function guarded(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    try { void Promise.resolve(handler(req, res, next)).catch(next); } catch (error) { next(error); }
  };
}
function endpoint(operation: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res) => { void operation(req, res).catch((error) => failure(res, error)); };
}
function privateHeaders(_req: Request, res: Response, next: () => void): void {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  res.vary("Authorization");
  res.vary("Cookie");
  next();
}
function requireQuery(schema: z.ZodType, req: Request): void {
  if (!schema.safeParse(req.query).success) throw new BusinessInquiryRefusal("invalid_request");
}
const boundedBody: RequestHandler = (req, res, next) => {
  // Also bound parsed bodies when Root's outer Express JSON parser ran first.
  try {
    const serialized = JSON.stringify(req.body);
    if (serialized !== undefined && Buffer.byteLength(serialized, "utf8") > MAX_JSON_BYTES) {
      res.status(413).json({ error: "invalid_request" });
      return;
    }
    next();
  } catch { failure(res, new BusinessInquiryRefusal("invalid_request")); }
};

/** Unmounted seam: registering this module does not enable it or construct an auth/database authority. */
export function registerBusinessInquiryApi(app: Express, deps: BusinessInquiryRouteDependencies): void {
  for (const guard of [deps.publicGuard, deps.requireStaff, deps.requireOrganization,
    deps.resolveActorId, deps.resolveSubmissionContext]) {
    if (typeof guard !== "function") throw new Error("Business inquiry Root guards are required");
  }
  const gate: RequestHandler = (_req, res, next) => {
    try {
      if (deps.enabled?.() !== true) return failure(res, new BusinessInquiryRefusal("not_ready"));
      next();
    } catch { failure(res, new BusinessInquiryRefusal("unavailable")); }
  };
  const json = express.json({ limit: MAX_JSON_BYTES, strict: true });
  const routeError: ErrorRequestHandler = (error, _req, res, _next) => {
    // Never reflect parser text, provider diagnostics, contact details or credentials.
    if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") {
      res.status(413).json({ error: "invalid_request" });
    } else if (error && typeof error === "object" && "type" in error && error.type === "entity.parse.failed") {
      failure(res, new BusinessInquiryRefusal("invalid_request"));
    } else { failure(res, error); }
  };
  async function actor(req: Request): Promise<string> {
    const actorId = await deps.resolveActorId(req);
    if (!actorId) throw new BusinessInquiryRefusal("not_permitted");
    return actorId;
  }
  const common = [privateHeaders, gate];
  app.post("/api/research/business-inquiries", ...common, guarded(deps.publicGuard), json, boundedBody, endpoint(async (req, res) => {
    requireQuery(emptyQuerySchema, req);
    const parsed = submissionSchema.safeParse(req.body);
    if (!parsed.success) throw new BusinessInquiryRefusal("invalid_request");
    const context = await deps.resolveSubmissionContext(req);
    if (!context) throw new BusinessInquiryRefusal("not_permitted");
    const receipt = await deps.service.submit(context, parsed.data.attemptKey, parsed.data.enquiry);
    res.status(receipt.replayed ? 200 : 201).json(receipt);
  }), routeError);
  app.get("/api/admin/research/business-inquiries", ...common, guarded(deps.requireStaff), endpoint(async (req, res) => {
    requireQuery(pageQuerySchema, req);
    res.json(await deps.service.list(await actor(req), req.query.before));
  }), routeError);
  app.get("/api/admin/research/business-inquiries/:id", ...common, guarded(deps.requireStaff), endpoint(async (req, res) => {
    requireQuery(emptyQuerySchema, req);
    res.json(await deps.service.read(await actor(req), req.params.id));
  }), routeError);
  app.post("/api/admin/research/business-inquiries/:id/assign", ...common, guarded(deps.publicGuard), guarded(deps.requireStaff),
    json, boundedBody, endpoint(async (req, res) => {
      requireQuery(emptyQuerySchema, req);
      res.json(await deps.service.assign(await actor(req), req.params.id, req.body));
    }), routeError);
  app.get("/api/research/account/organizations/:organizationId/business-inquiries", ...common,
    guarded(deps.requireOrganization), endpoint(async (req, res) => {
      requireQuery(pageQuerySchema, req);
      res.json(await deps.service.listOrganization(await actor(req), req.params.organizationId, req.query.before));
    }), routeError);
}

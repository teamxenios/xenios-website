import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import {
  RESOURCE_HUB_ADMIN_ITEM_PATH,
  RESOURCE_HUB_ADMIN_LIST_PATH,
  RESOURCE_HUB_ADMIN_UPLOAD_PATH,
  RESOURCE_HUB_ADMIN_VERSION_DOWNLOAD_PATH,
  RESOURCE_HUB_ADMIN_VERSION_REVIEW_PATH,
  RESOURCE_PDF_MAX_BYTES,
  RESOURCE_UPLOAD_CONTENT_TYPE,
  RESOURCE_UPLOAD_METADATA_HEADER,
  decodeResourceUploadMetadata,
  resourceUploadSchema,
  resourceVersionReviewSchema,
  type ResourceHubDenial,
} from "@shared/research/resource-hub/contract";
import type { ResourceHubService } from "./service";

// ---------------------------------------------------------------------------
// Admin doors for the Resource Hub. The canonical admin guard is INJECTED
// (requireSupabaseAdmin from server/routes.ts, as every other research admin
// registrar does); this module defines no parallel authority. Every path is a
// literal string so the release route census can count each door. Responses
// are private and never cached.
// ---------------------------------------------------------------------------

// Literal strings on purpose: the release route census resolves paths
// statically from this file. Equality with the shared contract is enforced at
// registration (and by test), so the two cannot drift apart silently.
export const RESOURCE_HUB_ADMIN_PATHS = {
  list: "/api/admin/research/resource-hub/resources",
  upload: "/api/admin/research/resource-hub/resources",
  item: "/api/admin/research/resource-hub/resources/:resourceId",
  review: "/api/admin/research/resource-hub/resources/:resourceId/versions/:versionId/review",
  download: "/api/admin/research/resource-hub/resources/:resourceId/versions/:versionId/download",
} as const;

const CONTRACT_PATHS: Readonly<Record<keyof typeof RESOURCE_HUB_ADMIN_PATHS, string>> = {
  list: RESOURCE_HUB_ADMIN_LIST_PATH,
  upload: RESOURCE_HUB_ADMIN_UPLOAD_PATH,
  item: RESOURCE_HUB_ADMIN_ITEM_PATH,
  review: RESOURCE_HUB_ADMIN_VERSION_REVIEW_PATH,
  download: RESOURCE_HUB_ADMIN_VERSION_DOWNLOAD_PATH,
};

export interface ResourceHubAdminDependencies {
  service: ResourceHubService;
  /**
   * The raw PDF body parser for the upload door. Defaults to express.raw on
   * application/pdf with the contract's byte ceiling (plus a small allowance
   * so an over-limit file is refused by validation with a named reason rather
   * than by the parser). Injected so route tests need no parser.
   */
  uploadBodyParser?: RequestHandler;
}

/** The upload door's body parser: raw application/pdf only, bounded. */
export function resourceUploadBodyParser(): RequestHandler {
  return express.raw({ type: RESOURCE_UPLOAD_CONTENT_TYPE, limit: RESOURCE_PDF_MAX_BYTES + 64 * 1024 });
}

/** The over-limit refusal from the parser, mapped to the hub's own vocabulary. */
function uploadParserErrors(): (error: unknown, req: Request, res: Response, next: NextFunction) => void {
  return (error, _req, res, next) => {
    const status = (error as { status?: unknown })?.status;
    if (status === 413) {
      noStore(res);
      res.status(413).json({
        ok: false,
        code: "invalid_resource_upload",
        message: "The file was rejected.",
        fieldErrors: { file: [`file exceeds ${RESOURCE_PDF_MAX_BYTES} bytes`] },
      });
      return;
    }
    next(error);
  };
}

function noStore(res: Response): void {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function statusFor(code: ResourceHubDenial["code"]): number {
  switch (code) {
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "invalid_resource_upload":
    case "invalid_resource_metadata":
      return 400;
    case "resource_state_conflict":
      return 409;
    case "resource_hub_unavailable":
      return 503;
  }
}

/** The admin actor as the canonical guard authenticated it; never a body field. */
function adminActor(req: Request): string | null {
  const email = (req as unknown as { adminEmail?: unknown }).adminEmail;
  return typeof email === "string" && email.length > 0 ? email.toLowerCase() : null;
}

function fieldErrorsOf(issues: readonly { path: readonly (string | number)[]; message: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "body";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function registerResourceHubAdminApi(app: Express, requireAdmin: RequestHandler, deps: ResourceHubAdminDependencies): void {
  for (const key of Object.keys(RESOURCE_HUB_ADMIN_PATHS) as Array<keyof typeof RESOURCE_HUB_ADMIN_PATHS>) {
    if (RESOURCE_HUB_ADMIN_PATHS[key] !== CONTRACT_PATHS[key]) {
      throw new Error(`resource hub admin path "${key}" drifted from the shared contract`);
    }
  }
  const guarded =
    (handler: (req: Request, res: Response, actor: string) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => {
      noStore(res);
      const actor = adminActor(req);
      if (!actor) {
        res.status(401).json({ ok: false, code: "unauthorized", message: "Admin session required." });
        return;
      }
      handler(req, res, actor).catch((error: unknown) => {
        console.error("[resource-hub admin] error:", error instanceof Error ? error.message : "unknown");
        if (!res.headersSent) res.status(503).json({ ok: false, code: "resource_hub_unavailable", message: "The resource hub is not available right now." });
        next();
      });
    };

  const send = (res: Response, result: { ok: true; resource: unknown } | ResourceHubDenial) => {
    if (result.ok) {
      res.json(result);
      return;
    }
    res.status(statusFor(result.code)).json(result);
  };

  // Literal list/upload paths are registered before the parameterized siblings.
  app.get(
    RESOURCE_HUB_ADMIN_PATHS.list,
    requireAdmin,
    guarded(async (_req, res) => {
      res.json({ ok: true, resources: await deps.service.listAdmin() });
    }),
  );

  // Upload: the PDF is the RAW body (application/pdf, bounded by the route's
  // own parser, untouched by the global JSON limit) and the metadata is one
  // base64url-JSON header. The guard runs BEFORE the body is read, so an
  // unauthenticated caller cannot make the server buffer a file.
  app.post(
    RESOURCE_HUB_ADMIN_PATHS.upload,
    requireAdmin,
    deps.uploadBodyParser ?? resourceUploadBodyParser(),
    uploadParserErrors(),
    guarded(async (req, res, actor) => {
      const metadata = decodeResourceUploadMetadata(req.get(RESOURCE_UPLOAD_METADATA_HEADER));
      const parsed = resourceUploadSchema.safeParse(metadata);
      if (!parsed.success) {
        res.status(400).json({
          ok: false,
          code: "invalid_resource_metadata",
          message: metadata === null ? "The upload metadata header is missing or malformed." : "The upload request is not valid.",
          fieldErrors: metadata === null ? { body: ["metadata header missing or malformed"] } : fieldErrorsOf(parsed.error.issues),
        });
        return;
      }
      const declaredType = (req.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      const body: unknown = req.body;
      if (!Buffer.isBuffer(body) || body.byteLength === 0) {
        res.status(400).json({
          ok: false,
          code: "invalid_resource_upload",
          message: "The file was rejected.",
          fieldErrors: { file: [declaredType === RESOURCE_UPLOAD_CONTENT_TYPE ? "file is empty" : "content type must be application/pdf"] },
        });
        return;
      }
      send(res, await deps.service.createVersion(actor, parsed.data, { bytes: new Uint8Array(body), contentType: declaredType }));
    }),
  );

  app.get(
    RESOURCE_HUB_ADMIN_PATHS.item,
    requireAdmin,
    guarded(async (req, res) => {
      const resource = await deps.service.getAdmin(String(req.params.resourceId));
      if (!resource) {
        res.status(404).json({ ok: false, code: "not_found", message: "Resource not found." });
        return;
      }
      res.json({ ok: true, resource });
    }),
  );

  app.post(
    RESOURCE_HUB_ADMIN_PATHS.review,
    requireAdmin,
    guarded(async (req, res, actor) => {
      const parsed = resourceVersionReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          ok: false,
          code: "invalid_resource_metadata",
          message: "The review request is not valid.",
          fieldErrors: fieldErrorsOf(parsed.error.issues),
        });
        return;
      }
      send(res, await deps.service.review(actor, String(req.params.resourceId), String(req.params.versionId), parsed.data));
    }),
  );

  app.get(
    RESOURCE_HUB_ADMIN_PATHS.download,
    requireAdmin,
    guarded(async (req, res) => {
      const result = await deps.service.adminBytes(String(req.params.resourceId), String(req.params.versionId));
      if (!result.ok) {
        res.status(statusFor(result.code)).json({ ok: false, code: result.code, message: "The version file is not available." });
        return;
      }
      res.set("Content-Type", result.contentType);
      res.set("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.send(Buffer.from(result.bytes));
    }),
  );
}

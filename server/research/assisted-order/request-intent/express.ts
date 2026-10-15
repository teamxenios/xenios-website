import { Router, type Request, type RequestHandler } from "express";
import { AssistedOrderValidationError, type AssistedOrderCatalogQuery } from "../../../../shared/research/assisted-order/contract";
import { exactObject, REQUEST_INTENT_RECOVERY_NOTICE } from "../../../../shared/research/assisted-order/request-intent";
import type { CareAccessDependencies } from "../../../care/access";
import { requirePendingRequestIntentRead, type RequestIntentStaffReadContext } from "./staff-read-authority";
import type { CarePrincipal } from "../../../../shared/care/contracts";
import type { AssistedOrderViewer } from "../ports";
import { RequestIntentError, type RequestIntentService, type RequestIntentStaffReader } from "./service";

export type RequestIntentRouteDependencies = Readonly<{
  service: RequestIntentService;
  /** Existing createAssistedOrderViewerResolvers(...).customer, not a body/email resolver. */
  resolveCustomer(request: Request): Promise<AssistedOrderViewer>;
  care: CareAccessDependencies;
  /** Independent, default-off pending-read scope. Does not enable the Care rail. */
  staffReadEnabled(): boolean;
  staffReader: RequestIntentStaffReader;
  /** Existing trusted-origin/CSRF and rate-limit middleware from the composition root. */
  mutationGuard: RequestHandler;
  readRateLimit: RequestHandler;
  writeRateLimit: RequestHandler;
  /** Defaults to unavailable until reviewed schema, private custody and wiring are qualified. */
  enabled(): boolean;
}>;

/**
 * Unmounted source seam. Registration under the existing Early Access boundary
 * belongs to the composition owner after qualification, not to this module.
 * Do not route the existing commercial submit endpoint here or remove its guard.
 */
export function createRequestIntentRouter(deps: RequestIntentRouteDependencies) {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    // Closing public intake must not strand already-saved private requests.
    // Only these exact read routes may reach the separate fail-closed staff gate.
    const staffRead = (req.method === "GET" || req.method === "HEAD")
      && /^\/staff(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\/?$/i.test(req.path);
    if (!staffRead && !deps.enabled()) {
      res.status(503).json({ error: "request_intent_unavailable" });
      return;
    }
    next();
  });
  const handle = (work: (request: Request, response: Parameters<RequestHandler>[1]) => Promise<unknown>): RequestHandler =>
    (request, response) => {
      void work(request, response).catch((error: unknown) => {
        if (error instanceof AssistedOrderValidationError) {
          response.status(400).json({ error: "invalid_request", message: "Check the required fields and current selections." });
        } else if (error instanceof RequestIntentError && error.status !== 503) {
          response.status(error.status).json({ error: error.code,
            message: "This attempt was not confirmed. Keep the same attempt for recovery; contact support before a replacement." });
        } else {
          // This includes interrupted/lost RPC replies. Never claim "not saved".
          response.status(503).json({ error: "request_outcome_unconfirmed", message: REQUEST_INTENT_RECOVERY_NOTICE });
        }
      });
    };
  router.get("/catalog", deps.readRateLimit, handle(async (req, res) => {
    const raw = exactObject(req.query, ["search", "family", "page", "pageSize"], "query");
    for (const key of Object.keys(raw)) {
      if (typeof raw[key] !== "string") throw new AssistedOrderValidationError("query", "Invalid query.");
    }
    const query: AssistedOrderCatalogQuery = {
      search: raw.search as string | undefined,
      family: raw.family as string | undefined,
      page: raw.page === undefined ? 1 : Number(raw.page),
      pageSize: raw.pageSize === undefined ? 24 : Number(raw.pageSize),
    };
    res.status(200).json(await deps.service.list(await deps.resolveCustomer(req), query));
  }));
  router.post("/", deps.mutationGuard, deps.writeRateLimit, handle(async (req, res) => {
    res.status(200).json(await deps.service.submit(await deps.resolveCustomer(req), req.body));
  }));
  router.post("/recover", deps.mutationGuard, deps.writeRateLimit, handle(async (req, res) => {
    const body = exactObject(req.body, ["idempotencyKey"], "request");
    if (typeof body.idempotencyKey !== "string") throw new AssistedOrderValidationError("idempotencyKey", "Required.");
    const receipt = await deps.service.recover(await deps.resolveCustomer(req), body.idempotencyKey);
    // null is "not yet confirmed", NOT proof a prior in-flight transaction cannot commit.
    res.status(200).json({ receipt });
  }));
  router.get("/staff", deps.readRateLimit, requirePendingRequestIntentRead(deps.care, deps.staffReadEnabled), handle(async (req, res) => {
    const query = exactObject(req.query, ["page"], "query");
    const page = query.page === undefined ? 1 : typeof query.page === "string" ? Number(query.page) : NaN;
    res.status(200).json(await deps.service.staffList(
      res.locals.requestIntentStaffPrincipal as CarePrincipal,
      res.locals.requestIntentStaffReadContext as RequestIntentStaffReadContext, deps.staffReader, page,
    ));
  }));
  router.get("/staff/:requestId", deps.readRateLimit, requirePendingRequestIntentRead(deps.care, deps.staffReadEnabled), handle(async (req, res) => {
    const id = req.params.requestId;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new AssistedOrderValidationError("requestId", "Invalid request identity.");
    const result = await deps.service.staffRead(
      res.locals.requestIntentStaffPrincipal as CarePrincipal,
      res.locals.requestIntentStaffReadContext as RequestIntentStaffReadContext, deps.staffReader, id,
    );
    if (!result) { res.status(404).json({ error: "request_not_found" }); return; }
    res.status(200).json(result);
  }));
  // No PATCH, pay, approve, prescribe, convert, fulfill or document-upload endpoint.
  return router;
}

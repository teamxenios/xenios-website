import { Router, type Express, type Request, type Response } from "express";
import { ACCOUNT_LIFECYCLE_API, ACCOUNT_LIFECYCLE_PROTOCOL, unavailableLifecycle } from "@shared/research/account-lifecycle";
import { requestIp } from "../rate-limit";
import { LifecycleRequestError } from "./repository";
import { createAccountLifecycleService, LifecycleUnavailable, type LifecycleDependencies, type LifecycleHttpContext } from "./service";

function token(req: Request): string | null {
  const value = req.headers.authorization;
  return typeof value === "string" && value.startsWith("Bearer ") ? value.slice(7) : null;
}
function context(req: Request): LifecycleHttpContext {
  return { ip: requestIp(req), origin: req.get("Origin"), fetchSite: req.get("Sec-Fetch-Site"), json: Boolean(req.is("application/json")) };
}
function failure(res: Response, error: unknown, beforePersistence: boolean) {
  if (error instanceof LifecycleUnavailable && beforePersistence) return res.status(503).json(unavailableLifecycle(error.blocker));
  const known = error instanceof LifecycleRequestError;
  return res.status(known ? error.status : 503).json({ protocol: ACCOUNT_LIFECYCLE_PROTOCOL,
    code: known ? error.code : "outcome_uncertain" });
}
/** Unmounted source only. Root must add exact wall/method admission and actual
 * canonical authority bindings; this function grants no role or tenant scope. */
export function registerAccountLifecycleApi(app: Express, deps: LifecycleDependencies) {
  const service = createAccountLifecycleService(deps), router = Router({ caseSensitive: true, strict: true });
  router.use((_req, res, next) => {
    res.set({ "Cache-Control": "private, no-store", Pragma: "no-cache", "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive", Vary: "Authorization, Cookie" }); next();
  });
  router.post("/self/attempt", async (req, res) => {
    try { return res.json(await service.issue("self", token(req), req.body, context(req))); }
    catch (error) { return failure(res, error, true); }
  });
  router.post("/admin/:targetAuthUserId/:reason/attempt", async (req, res) => {
    try { return res.json(await service.issue("admin", token(req), req.body, context(req), String(req.params.targetAuthUserId), String(req.params.reason))); }
    catch (error) { return failure(res, error, true); }
  });
  for (const mode of ["self", "admin"] as const) {
    router.post(`/${mode}/prepare`, async (req, res) => {
      try { return res.json(await service.prepare(mode, token(req), req.body, context(req))); }
      catch (error) { return failure(res, error, false); }
    });
    router.post(`/${mode}/confirm`, async (req, res) => {
      try { return res.json(await service.confirm(mode, token(req), req.body, context(req))); }
      catch (error) { return failure(res, error, false); }
    });
    router.get(`/${mode}/operations/:operationId`, async (req, res) => {
      try { return res.json(await service.status(mode, token(req), req.params.operationId, context(req))); }
      catch (error) { return failure(res, error, false); }
    });
  }
  app.use(ACCOUNT_LIFECYCLE_API, router);
}

import type { Express, Request, Response } from "express";
import { requestIp } from "../rate-limit";
import { AccountManagementError, createUniversalAccountService, type UniversalAccountDependencies } from "./service";

function privateHeaders(res: Response) {
  res.set({ "Cache-Control": "private, no-store", Pragma: "no-cache", "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive", Vary: "Authorization, Cookie" });
}
function error(res: Response, failure: unknown) {
  const known = failure instanceof AccountManagementError;
  return res.status(known ? failure.status : 503).json({ ok: false, code: known ? failure.code : "account_unavailable" });
}
export function registerUniversalAccountApi(app: Express, deps: UniversalAccountDependencies): void {
  const service = createUniversalAccountService(deps);
  app.get("/api/research/account-management/config", (_req, res) => {
    privateHeaders(res); res.json(deps.config());
  });
  app.post("/api/research/account-management/register", async (req, res) => {
    privateHeaders(res);
    try { return res.json(await service.register(req.body, { ip: requestIp(req), origin: req.get("Origin"),
      fetchSite: req.get("Sec-Fetch-Site"), json: Boolean(req.is("application/json")) })); }
    catch (failure) { return error(res, failure); }
  });
  app.get("/api/research/account-management/me", async (req: Request, res) => {
    privateHeaders(res);
    const header = req.headers.authorization;
    const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : null;
    try { return res.json(await service.identity(token, requestIp(req))); }
    catch (failure) { return error(res, failure); }
  });
  app.patch("/api/research/account-management/me", async (req, res) => {
    privateHeaders(res);
    const header = req.headers.authorization;
    const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : null;
    try { return res.json(await service.mutate(token, req.body, { ip: requestIp(req), origin: req.get("Origin"),
      fetchSite: req.get("Sec-Fetch-Site"), json: Boolean(req.is("application/json")) })); }
    catch (failure) { return error(res, failure); }
  });
  app.post("/api/research/account-management/reauthenticate", async (req, res) => {
    privateHeaders(res);
    const header = req.headers.authorization;
    const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : null;
    try { return res.json(await service.reauthenticate(token, req.body, { ip: requestIp(req), origin: req.get("Origin"),
      fetchSite: req.get("Sec-Fetch-Site"), json: Boolean(req.is("application/json")) })); }
    catch (failure) { return error(res, failure); }
  });
}

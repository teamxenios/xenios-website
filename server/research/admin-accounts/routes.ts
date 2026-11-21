import type { Express, Request, Response } from "express";
import { ADMIN_ACCOUNTS_PATH } from "../../../shared/research/admin-accounts";
import { AccountReadError } from "./authority";
import { createAdminAccountService, type AdminAccountDependencies } from "./service";

function privateHeaders(res: Response) {
  res.set({ "Cache-Control": "private, no-store", Pragma: "no-cache", Vary: "Authorization, Cookie",
    "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" });
}
function token(req: Request) {
  const value = req.headers.authorization;
  return typeof value === "string" && /^Bearer [^\s,]+$/u.test(value) ? value.slice(7) : null;
}
function hasBody(req: Request) {
  return req.body !== undefined && (req.body === null || typeof req.body !== "object"
    || Array.isArray(req.body) || Object.keys(req.body).length > 0);
}
function failure(res: Response, error: unknown) {
  const known = error instanceof AccountReadError;
  return res.status(known ? error.status : 503).json({ ok: false, code: known ? error.code : "account_read_unavailable" });
}
/** Root owns mounting; these new endpoints are not registered at import time. */
export function registerAdminAccountsApi(app: Express, deps: AdminAccountDependencies): void {
  const service = createAdminAccountService(deps);
  app.all(ADMIN_ACCOUNTS_PATH, async (req, res) => {
    privateHeaders(res);
    if (req.method !== "GET") return res.status(405).set("Allow", "GET").json({ ok: false, code: "method_not_allowed" });
    if (hasBody(req)) return res.status(400).json({ ok: false, code: "invalid_input" });
    try { return res.json(await service.list(token(req), req.query)); }
    catch (error) { return failure(res, error); }
  });
  app.all(ADMIN_ACCOUNTS_PATH + "/:userId", async (req, res) => {
    privateHeaders(res);
    if (req.method !== "GET") return res.status(405).set("Allow", "GET").json({ ok: false, code: "method_not_allowed" });
    if (Object.keys(req.query).length || hasBody(req)) return res.status(400).json({ ok: false, code: "invalid_input" });
    try { return res.json(await service.detail(token(req), req.params.userId)); }
    catch (error) { return failure(res, error); }
  });
}

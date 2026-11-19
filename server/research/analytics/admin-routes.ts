import { Router, type Request, type RequestHandler } from "express";
import { getSupabaseAnon } from "../../supabase";
import { decodeJwtClaims, isRecoveryPurposeSession } from "../member-auth";
import { chicagoDayWindow } from "./calendar";
import {
  operationsProjectScope, operationsReportFromSnapshot, readOperationsSnapshot,
  type OperationsProjectScope, type OperationsSnapshot,
} from "./snapshot";
import type { OperationsWindow, ResponseChannel, ResponsePopulation } from "../../../shared/research/analytics/operations";

export const OPERATIONS_ANALYTICS_PATH = "/api/admin/research/early-access/analytics";
type ConfirmedUser = Readonly<{ id: string; email?: string; email_confirmed_at?: string }>;
export type OperationsAnalyticsDependencies = Readonly<{
  /** Required canonical requireSupabaseAdmin; no permissive default. */
  requireAdmin: RequestHandler;
  /** Configured by the server's project connection, never by request data. */
  scope: OperationsProjectScope;
  verifyUser?: (token: string) => Promise<ConfirmedUser | null>;
  readSnapshot?: (window: Pick<OperationsWindow, "start" | "end">) => Promise<OperationsSnapshot>;
  now?: () => number;
}>;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const queryKeys = new Set(["day", "responsePopulation", "responseChannel"]);

/** Export only. Root owns its actual mount and identity lifecycle. */
export function createOperationsAnalyticsRouter(deps: OperationsAnalyticsDependencies) {
  if (typeof deps?.requireAdmin !== "function") throw new Error("operations_admin_guard_required");
  operationsProjectScope(deps.scope);
  const verify = deps.verifyUser ?? (async token => {
    const { data, error } = await getSupabaseAnon().auth.getUser(token);
    return error ? null : data.user;
  });
  const read = deps.readSnapshot ?? readOperationsSnapshot;
  const now = deps.now ?? Date.now;
  const router = Router();
  const privateResponse: RequestHandler = (_req, res, next) => {
    res.set({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex,nofollow,noarchive",
      "X-Analytics-Scope": "server-project" });
    res.vary("Authorization");
    next();
  };
  const admin: RequestHandler = (req, res, next) => {
    try {
      Promise.resolve(deps.requireAdmin(req, res, next)).catch(() => {
        if (!res.headersSent) res.status(401).json({ error: "sign_in_required" });
      });
    } catch {
      if (!res.headersSent) res.status(401).json({ error: "sign_in_required" });
    }
  };
  router.get("/api/admin/research/early-access/analytics", privateResponse, admin, async (req, res) => {
    try {
      const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")?.[1];
      const guardEmail = (req as Request & { adminEmail?: unknown }).adminEmail;
      if (!token || typeof guardEmail !== "string" || !guardEmail) {
        return void res.status(401).json({ error: "sign_in_required" });
      }
      const user = await verify(token);
      const claims = decodeJwtClaims(token);
      if (!user || !UUID.test(user.id) || claims?.sub !== user.id || typeof claims?.session_id !== "string"
        || !UUID.test(claims.session_id) || typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now()) {
        return void res.status(401).json({ error: "sign_in_required" });
      }
      // Supabase has verified the signature before signed AMR is inspected.
      // Unlike the older guard's legacy tolerance, this new surface needs
      // positive ordinary-purpose evidence; missing AMR is not authorization.
      if (!Array.isArray(claims.amr) || claims.amr.length === 0 || isRecoveryPurposeSession(token)
        || !user.email || user.email.toLowerCase() !== guardEmail.toLowerCase()
        || !user.email_confirmed_at || !Number.isFinite(Date.parse(user.email_confirmed_at))
        || Date.parse(user.email_confirmed_at) > now()) {
        return void res.status(403).json({ error: "forbidden" });
      }
      const query = req.query;
      if (Object.keys(query).some(key => !queryKeys.has(key)) || typeof query.day !== "string"
        || (req.body && (typeof req.body !== "object" || Object.keys(req.body).length > 0))
        || ["x-tenant-id", "x-user-id", "x-actor-id", "x-project-id", "x-environment"].some(key => key in req.headers)) {
        return void res.status(400).json({ error: "invalid_analytics_query" });
      }
      const population = query.responsePopulation ?? "request";
      const channel = query.responseChannel ?? "portal_published";
      if (!["request", "support_case"].includes(String(population)) || typeof population !== "string"
        || !["portal_published", "email_provider_accepted"].includes(String(channel)) || typeof channel !== "string") {
        return void res.status(400).json({ error: "invalid_analytics_query" });
      }
      let window: ReturnType<typeof chicagoDayWindow>;
      try { window = chicagoDayWindow(query.day); }
      catch { return void res.status(400).json({ error: "invalid_analytics_query" }); }
      const snapshot = await read(window);
      const report = operationsReportFromSnapshot(deps.scope, window, snapshot, {
        population: population as ResponsePopulation, channel: channel as ResponseChannel,
      });
      res.json(report);
    } catch {
      // No raw upstream errors, user identity, source IDs or payloads escape.
      res.status(503).json({ error: "analytics_unavailable" });
    }
  });
  return router;
}

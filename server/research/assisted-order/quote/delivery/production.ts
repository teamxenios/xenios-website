import type { Express, RequestHandler } from "express";
import pg from "pg";
import { pgTransactions } from "./pg.mjs";
import { SUPABASE_ROOT_CA } from "./staging";

// Production private-quote connection. Closed unless every identity check
// below holds AND the explicit enable flag is set. It executes no DDL, reads
// no quote data and mounts no customer or issuing route.
export const PRODUCTION_QUOTE_ORIGIN = "https://xeniostechnology.com";
export const PRODUCTION_QUOTE_TENANT = "ea-production";
const PRODUCTION_REF = "yvzeduaxbwgcwllhywff";
const PRODUCTION_SERVICE = "srv-d8s9vej7uimc7384dfcg";
const PRODUCTION_LOGIN = "ea_quote_login";
// The managed session pooler for this project's region. The login name binds
// the project, and the pinned CA binds the provider; no other host is accepted.
const PRODUCTION_POOLERS = new Set([
  "aws-0-us-east-2.pooler.supabase.com",
  "aws-1-us-east-2.pooler.supabase.com",
]);

export function isPrivateQuoteProduction(env: NodeJS.ProcessEnv): boolean {
  return env.RENDER === "true" && env.RENDER_SERVICE_ID === PRODUCTION_SERVICE &&
    env.IS_PULL_REQUEST !== "true" &&
    env.SUPABASE_URL?.replace(/\/$/, "") === `https://${PRODUCTION_REF}.supabase.co` &&
    env.EA_PRIVATE_QUOTES_ENABLED === "true";
}

/** Parse before creating a socket. Driver options cannot weaken TLS or switch identities. */
export function productionQuotePoolOptions(env: NodeJS.ProcessEnv): pg.PoolConfig | null {
  if (!isPrivateQuoteProduction(env) || !env.EA_QUOTE_DATABASE_URL) return null;
  try {
    const uri = new URL(env.EA_QUOTE_DATABASE_URL);
    const pooled = PRODUCTION_POOLERS.has(uri.hostname) &&
      uri.username === `${PRODUCTION_LOGIN}.${PRODUCTION_REF}`;
    if (uri.protocol !== "postgresql:" || !pooled || uri.port !== "5432" ||
        uri.pathname !== "/postgres" || uri.search || uri.hash || !uri.password) return null;
    return {
      host: uri.hostname,
      port: 5432,
      user: uri.username,
      password: decodeURIComponent(uri.password),
      database: "postgres",
      ssl: { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true },
      max: 4,
      connectionTimeoutMillis: 4_000,
    };
  } catch { return null; }
}

/**
 * Staff-only readiness probe for the restricted production connection. It
 * proves the session is the dedicated login and the transaction-local role is
 * the restricted runtime role, and reports configuration presence only.
 */
export function mountProductionQuoteConnection(
  app: Express, env: NodeJS.ProcessEnv, requireAdmin: RequestHandler,
  connect = (config: pg.PoolConfig) => new pg.Pool(config),
) {
  if (!isPrivateQuoteProduction(env)) return null;
  const options = productionQuotePoolOptions(env);
  const pool = options ? connect(options) : null;
  pool?.on("error", () => { /* Only the authenticated probe reports availability. */ });
  const transact = pool ? pgTransactions(pool, { runtimeRole: "production" }) : null;
  app.get("/api/staff/early-access/private-quotes/production-readiness",
    (_req, res, next) => {
      res.set({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" });
      next();
    },
    requireAdmin,
    async (_req, res) => {
      let restrictedConnection = false;
      try {
        if (transact) {
          restrictedConnection = await transact(PRODUCTION_QUOTE_TENANT, "readiness", async (q) => {
            const rows = await q(
              "SELECT session_user = 'ea_quote_login' AND current_user = 'ea_quote_runtime' AS ok");
            return rows[0]?.ok === true;
          });
        }
      } catch { /* A connection, privilege, or query failure stays closed. */ }
      return res.status(restrictedConnection ? 200 : 503).json({
        restrictedConnection,
        resendConfigured: Boolean(env.RESEND_API_KEY?.trim()),
      });
    });
  return pool;
}

import type { Express, Request, Response } from "express";
import { AE_APPLICATION_CONTEXT_PATH, aeContextEnvelopeSchema } from "../../../shared/research/account-executive/context";
import { createAeProductionBoundary, type AeProductionInput, type AeProductionProblem } from "./production";
import { createAeVerifiedSessionResolver } from "./routes";

export interface AeApplicationInput extends Omit<AeProductionInput, "config"> {
  /** Inject the existing server environment. Never read client/profile/URL scope. */
  env?: Readonly<Record<string, string | undefined>>;
}
export type AeApplicationProblem = AeProductionProblem | "invalid_environment" | "runtime_not_allowed";
export interface AeApplicationBoundary {
  /** Dependency/configuration readiness, not installed SQL, permission or live QA. */
  readonly state: "disabled" | "unavailable" | "ready";
  readonly claimState: "disabled" | "unavailable" | "ready";
  readonly problems: readonly AeApplicationProblem[];
  /** Explicit Root composition only. Disabled/unavailable boundaries mount nothing. */
  register(app: Express): boolean;
}
function blocked(state: "disabled" | "unavailable", problems: AeApplicationProblem[] = []): AeApplicationBoundary {
  return Object.freeze({ state, claimState: state, problems: Object.freeze(problems), register: (_app: Express) => false });
}

/** Only these two existing Render applications may expose the AE boundary.
 * This does not create scopes or grants. PR previews have different service IDs
 * and an explicit preview marker is denied even if other fields were copied. */
function permittedRuntime(env: Readonly<Record<string, string | undefined>>): boolean {
  if (env.RENDER !== "true" || (env.IS_PULL_REQUEST !== undefined && env.IS_PULL_REQUEST !== "false") || env.RENDER_PR_NUMBER) return false;
  if (env.RENDER_SERVICE_ID === "srv-d8s9vej7uimc7384dfcg") {
    return env.SUPABASE_URL === "https://yvzeduaxbwgcwllhywff.supabase.co" &&
      env.SITE_URL === "https://xeniostechnology.com";
  }
  return env.RENDER_SERVICE_ID === "srv-d9h4f4m7r5hc73ctjng0" &&
    env.SUPABASE_URL === "https://srcphrgnxreqyirkitxd.supabase.co" &&
    env.SITE_URL === "https://xenios-research-staging.onrender.com" &&
    env.RENDER_EXTERNAL_URL === "https://xenios-research-staging.onrender.com";
}
function privateContext(_req: Request, res: Response, next: () => void) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
}

/** Source-only application composition over the frozen production factory.
 * Root supplies the existing Auth/RPC/durable limiter adapters and chooses when
 * to register behind its API wall. No SDK client or fallback authority is built. */
export function createAeApplicationBoundary(input: AeApplicationInput = {}): AeApplicationBoundary {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
    (input.env !== undefined && (!input.env || typeof input.env !== "object" || Array.isArray(input.env)))) {
    return blocked("unavailable", ["invalid_environment"]);
  }
  const env = { ...input.env };
  if (env.RESEARCH_AE_WORKSPACE_ENABLED !== "true") return blocked("disabled");
  if (!permittedRuntime(env)) return blocked("unavailable", ["runtime_not_allowed"]);
  const context = aeContextEnvelopeSchema.safeParse({ ok: true, value: { scopeId: env.RESEARCH_AE_OPERATIONAL_SCOPE_ID } });
  if (!context.success || !context.data.ok) return blocked("unavailable", ["operational_scope_required"]);
  const value = Object.freeze(context.data.value);
  const production = createAeProductionBoundary({
    config: { enabled: true, operationalScopeId: value.scopeId, siteOrigin: env.SITE_URL },
    auth: input.auth, rpc: input.rpc, durableRateLimit: input.durableRateLimit,
    resolveOriginalGuestProof: input.resolveOriginalGuestProof,
  });
  if (production.state !== "ready") return blocked(production.state, [...production.problems]);
  // The frozen factory has validated these exact same dependencies. Capture them
  // so subsequent caller mutations cannot swap context Auth/limiter providers.
  const auth = input.auth!, limit = input.durableRateLimit!;
  const resolveSession = createAeVerifiedSessionResolver(auth, true);
  return Object.freeze({
    state: "ready", claimState: production.claimState, problems: production.problems,
    register(app: Express) {
      app.use(AE_APPLICATION_CONTEXT_PATH, privateContext);
      production.register(app);
      app.get("/api/research/account-executive/context", (req: Request, res: Response) => {
        void (async () => {
          const session = await resolveSession(req);
          if (!session) { res.status(401).json({ ok: false, code: "access_denied" }); return; }
          if (session.purpose !== "ordinary") { res.status(403).json({ ok: false, code: "access_denied" }); return; }
          if (!await limit(req, session.authUserId)) { res.status(429).json({ ok: false, code: "unavailable" }); return; }
          // This GET has no inputs. Even unparsed body hints must not select a
          // partition, and malformed JSON is handled by the existing route parser.
          if (Object.keys(req.query).length || (req.headers["content-length"] !== undefined && req.headers["content-length"] !== "0") ||
            req.headers["transfer-encoding"] !== undefined || (req.body && Object.keys(req.body).length)) {
            res.status(400).json({ ok: false, code: "invalid_input" }); return;
          }
          res.status(200).json({ ok: true, value });
        })().catch(() => { res.status(503).json({ ok: false, code: "unavailable" }); });
      });
      return true;
    },
  });
}

import { createHash } from "node:crypto";
import type { Express, Request, RequestHandler } from "express";
import { getSupabaseAdmin, getSupabaseAnon, getSupabaseConnectionIdentity, supabaseConfigured } from "../supabase";
import { createAeApplicationBoundary, type AeApplicationBoundary } from "./account-executive/application";
import { createOperationsAnalyticsRouter } from "./analytics/admin-routes";
import type { OperationsProjectScope } from "./analytics/snapshot";
import { rateLimitHit, requestIp } from "./rate-limit";
import type { OriginalGuestProofReader } from "./early-access/identity/original-guest-proof";

type Env = Readonly<Record<string, string | undefined>>;
export interface ConnectedOperationsInput {
  env: Env;
  /** Existing verified configured-admin gate. Never substitute queue-reader access. */
  requireAdmin: RequestHandler;
  /** Exact server-only capability observed from canonical EA registration. */
  originalGuestProofReader?: OriginalGuestProofReader | null;
}
export interface ConnectedOperationsState {
  /** Route configuration only; does not establish managed schema or data readiness. */
  ae: Pick<AeApplicationBoundary, "state" | "claimState" | "problems">;
  analytics: "disabled" | "unavailable" | "ready";
}
const missingDependency = new Set<string>([
  "auth_adapter_required", "rpc_adapter_required", "durable_limiter_required",
]);
function projectScope(env: Env): OperationsProjectScope | null {
  if (env.RENDER !== "true" || env.RENDER_PR_NUMBER ||
    (env.IS_PULL_REQUEST !== undefined && env.IS_PULL_REQUEST !== "false")) return null;
  if (env.RENDER_SERVICE_ID === "srv-d8s9vej7uimc7384dfcg" &&
    env.SUPABASE_URL === "https://yvzeduaxbwgcwllhywff.supabase.co" &&
    env.SITE_URL === "https://xeniostechnology.com") {
    return { projectId: "yvzeduaxbwgcwllhywff", environment: "production" };
  }
  if (env.RENDER_SERVICE_ID === "srv-d9h4f4m7r5hc73ctjng0" &&
    env.SUPABASE_URL === "https://srcphrgnxreqyirkitxd.supabase.co" &&
    env.SITE_URL === "https://xenios-research-staging.onrender.com" &&
    env.RENDER_EXTERNAL_URL === "https://xenios-research-staging.onrender.com") {
    return { projectId: "srcphrgnxreqyirkitxd", environment: "staging" };
  }
  return null;
}
function authUnavailable(error: { status?: number }): boolean {
  return error.status !== 400 && error.status !== 401 && error.status !== 403;
}

/** Namespace conversion only. The AE boundary still verifies the current
 * ordinary Auth session and the canonical claim transaction owns authorization.
 * Null remains usable for its exact authorized replay; malformed/unavailable
 * evidence must never be turned into null or a guessed identity. */
export function createOriginalGuestProofResolver(reader: OriginalGuestProofReader, now: () => number = Date.now) {
  return async (req: Pick<Request, "headers">) => {
    try {
      const proof = await reader(req.headers.cookie);
      if (proof === null) return null;
      if (!proof) throw new Error("invalid_original_guest_proof");
      const { customerRef, sessionHandleHash, expiresAtEpochMs } = proof;
      const current = now();
      if (typeof customerRef !== "string" || !/^eac_[a-f0-9]{32}$/.test(customerRef) ||
        typeof sessionHandleHash !== "string" || !/^[a-f0-9]{64}$/.test(sessionHandleHash) ||
        !Number.isSafeInteger(current) || !Number.isFinite(new Date(current).getTime()) ||
        !Number.isSafeInteger(expiresAtEpochMs) || !Number.isFinite(new Date(expiresAtEpochMs).getTime()) ||
        expiresAtEpochMs <= current) throw new Error("invalid_original_guest_proof");
      return Object.freeze({ customerRef,
        sessionHash: createHash("sha256").update(sessionHandleHash, "utf8").digest("hex"),
        expiresAt: new Date(expiresAtEpochMs).toISOString() });
    } catch {
      // No cookie, H1/H2, identity, provider diagnostic or invalid field escapes.
      throw new Error("ae_guest_proof_unavailable");
    }
  };
}

/** Root's actual application composition. Existing canonical SDK singletons and
 * durable limiter are reused only after explicit runtime/scope configuration.
 * No scope, identity, permission, migration or provenance is provisioned here. */
export function registerConnectedOperations(app: Express, input: ConnectedOperationsInput): ConnectedOperationsState {
  const env = Object.freeze({ ...input.env });
  let ae = createAeApplicationBoundary({ env });
  const canonicalConnectionReady = () => {
    if (!projectScope(env) || !supabaseConfigured()) return false;
    const identity = getSupabaseConnectionIdentity();
    return identity.configuredUrl === env.SUPABASE_URL &&
      (identity.adminUrl === null || identity.adminUrl === env.SUPABASE_URL) &&
      (identity.anonUrl === null || identity.anonUrl === env.SUPABASE_URL);
  };
  // Validate server configuration before lazy client lookup. Unknown problems
  // remain unavailable, rather than being interpreted as missing credentials.
  if (ae.state === "unavailable" && ae.problems.length > 0 &&
    ae.problems.every(problem => missingDependency.has(problem)) && canonicalConnectionReady()) {
    try {
      const anon = getSupabaseAnon(), admin = getSupabaseAdmin();
      if (!canonicalConnectionReady()) throw new Error("ae_connection_project_mismatch");
      const selectedReader = env.RESEARCH_AE_ORIGINAL_GUEST_PROOF_ENABLED === "true"
        ? input.originalGuestProofReader : null;
      const originalGuestProof = typeof selectedReader === "function"
        ? createOriginalGuestProofResolver(selectedReader) : undefined;
      ae = createAeApplicationBoundary({
        env,
        auth: {
          async authenticate(token) {
            const { data, error } = await anon.auth.getUser(token);
            if (error) {
              if (authUnavailable(error)) throw new Error("ae_auth_unavailable");
              return null;
            }
            return data.user ? { id: data.user.id } : null;
          },
          async currentAssurance(token) {
            // Explicit JWT avoids a server-local Auth session. currentLevel
            // describes this session; enrolled factors/nextLevel grant nothing.
            const { data, error } = await anon.auth.mfa.getAuthenticatorAssuranceLevel(token);
            if (error) {
              if (authUnavailable(error)) throw new Error("ae_assurance_unavailable");
              return null;
            }
            return data?.currentLevel === "aal2" ? "aal2" : data?.currentLevel === "aal1" ? "aal1" : null;
          },
        },
        rpc: { async rpc(name, args) {
          const { data, error } = await admin.rpc(name, args);
          return { data, error };
        } },
        async durableRateLimit(req, actor) {
          const ip = requestIp(req);
          if (ip === "unknown") return false;
          const key = "ae-workspace:v1:" + createHash("sha256").update(actor + "\0" + ip).digest("hex");
          return rateLimitHit(key, 60, 60, { durableFailurePolicy: "deny" });
        },
        resolveOriginalGuestProof: originalGuestProof,
      });
    } catch {
      // The preflight boundary remains unavailable. No fallback client/store.
    }
  }
  ae.register(app);
  let analytics: ConnectedOperationsState["analytics"] = "disabled";
  if (env.RESEARCH_OPERATIONS_ANALYTICS_ENABLED === "true") {
    const scope = projectScope(env);
    analytics = "unavailable";
    if (scope && typeof input.requireAdmin === "function" && canonicalConnectionReady()) {
      app.use(createOperationsAnalyticsRouter({ requireAdmin: input.requireAdmin, scope }));
      analytics = "ready";
    }
  }
  return Object.freeze({ ae: Object.freeze({ state: ae.state, claimState: ae.claimState, problems: ae.problems }), analytics });
}

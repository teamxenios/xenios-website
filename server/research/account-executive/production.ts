import { z } from "zod";
import type { Express, Request } from "express";
import { aeIdentifier } from "../../../shared/research/account-executive/workspace";
import { createAeCanonicalAdapter } from "./canonical-adapter";
import { createAeIdentityBinding, type AeCanonicalRpc } from "./identity-binding";
import { createAeWorkspaceService } from "./workspace";
import { createAeVerifiedSessionResolver, registerAeWorkspaceRoutes,
  type AeRouteDependencies, type AeVerifiedAuthAdapter } from "./routes";

const configSchema = z.object({
  enabled: z.boolean().default(false),
  operationalScopeId: aeIdentifier.refine(value => value !== "00000000-0000-0000-0000-000000000000").optional(),
  siteOrigin: z.string().optional(),
}).strict();
export type AeProductionProblem = "invalid_configuration" | "operational_scope_required" | "site_origin_invalid"
  | "auth_adapter_required" | "rpc_adapter_required" | "durable_limiter_required" | "guest_proof_unavailable";
export interface AeProductionInput {
  /** Root parses feature environment and chooses this scope. No request field,
   * process.env default or legacy organization lookup supplies authority here. */
  config?: unknown;
  /** Existing canonical Auth getUser/current-assurance adapter; no client is created. */
  auth?: AeVerifiedAuthAdapter | null;
  rpc?: AeCanonicalRpc | null;
  /** Root's existing durable limiter. There is intentionally no local fallback. */
  durableRateLimit?: AeRouteDependencies["rateLimit"] | null;
  /** Existing private guest-session custodian, never a member/email/hash guess.
   * A configured custodian may return null for exact durable-claim replay; the
   * canonical SQL still requires ownership. An absent custodian is unavailable. */
  resolveOriginalGuestProof?: AeRouteDependencies["resolveOriginalGuestProof"] | null;
}
export interface AeProductionBoundary {
  /** Configuration/dependency readiness only, not installed SQL, grants or live QA. */
  readonly state: "disabled" | "unavailable" | "ready";
  readonly claimState: "disabled" | "unavailable" | "ready";
  readonly problems: readonly AeProductionProblem[];
  /** No mounting occurs until Root explicitly calls this. False means no routes
   * were registered. This never provisions scopes, grants, schema or settings. */
  register(app: Express): boolean;
}
function blocked(state: "disabled" | "unavailable", problems: AeProductionProblem[] = []): AeProductionBoundary {
  return Object.freeze({ state, claimState: state, problems: Object.freeze(problems), register: (_app: Express) => false });
}
function trustedOrigin(value: string | undefined): string | null {
  if (!value || !value.startsWith("https://") || /[\u0000-\u0020\u007f?#@]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/" && url.origin !== "null" ? url.origin : null;
  } catch { return null; }
}

/** Source-only production composition. Actual registration, wall placement,
 * navigation, environment activation and scoped provisioning remain Root-owned. */
export function createAeProductionBoundary(input: AeProductionInput = {}): AeProductionBoundary {
  if (!input || typeof input !== "object" || Array.isArray(input)) return blocked("unavailable", ["invalid_configuration"]);
  const config = configSchema.safeParse(input.config === undefined ? {} : input.config);
  if (!config.success) return blocked("unavailable", ["invalid_configuration"]);
  if (!config.data.enabled) return blocked("disabled");
  const problems: AeProductionProblem[] = [];
  const scope = config.data.operationalScopeId, origin = trustedOrigin(config.data.siteOrigin);
  if (!scope) problems.push("operational_scope_required");
  if (!origin) problems.push("site_origin_invalid");
  const auth = input.auth, rpc = input.rpc, limit = input.durableRateLimit;
  if (!auth || typeof auth.authenticate !== "function" || typeof auth.currentAssurance !== "function") problems.push("auth_adapter_required");
  if (!rpc || typeof rpc.rpc !== "function") problems.push("rpc_adapter_required");
  if (typeof limit !== "function") problems.push("durable_limiter_required");
  if (problems.length || !scope || !origin || !auth || !rpc || !limit) return blocked("unavailable", problems);
  const originalGuestProof = typeof input.resolveOriginalGuestProof === "function" ? input.resolveOriginalGuestProof : null;
  const staffSession = createAeVerifiedSessionResolver(auth, true);
  const memberSession = createAeVerifiedSessionResolver(auth, false);
  const deps: AeRouteDependencies = Object.freeze({
    service: createAeWorkspaceService(createAeCanonicalAdapter(rpc, scope)),
    identity: createAeIdentityBinding(rpc, scope), origin,
    enabled: () => config.data.enabled,
    resolveSession: (req: Request, mode: "staff" | "claim") => mode === "staff" ? staffSession(req) : memberSession(req),
    rateLimit: limit,
    resolveOriginalGuestProof: originalGuestProof ?? (async () => { throw new Error("ae_guest_proof_unavailable"); }),
  });
  return Object.freeze({
    state: "ready", claimState: originalGuestProof ? "ready" : "unavailable",
    problems: Object.freeze(originalGuestProof ? [] : ["guest_proof_unavailable"] as AeProductionProblem[]),
    register(app: Express) { registerAeWorkspaceRoutes(app, deps); return true; },
  });
}

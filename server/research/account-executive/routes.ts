import { json, type Express, type Request, type Response, type NextFunction } from "express";
import { aeIdentifier, aeGuestClaimCommandSchema, type AeResult } from "../../../shared/research/account-executive/workspace";
import { decodeJwtClaims, isRecoveryPurposeSession } from "../member-auth";
import type { createAeWorkspaceService, AeVerifiedSession } from "./workspace";
import type { createAeIdentityBinding, AeGuestProof } from "./identity-binding";

export const AE_WORKSPACE_API_BASE = "/api/research/account-executive";
export interface AeVerifiedAuthAdapter {
  /** Canonical auth.getUser(token), never decoded/browser claims alone. */
  authenticate(token: string): Promise<{ id: string } | null>;
  /** Actual pinned SDK getAuthenticatorAssuranceLevel(token).currentLevel. */
  currentAssurance(token: string): Promise<"aal1" | "aal2" | null>;
}

/** Auth primitives are reused without Care/partner-role inference. The returned
 * context is server-only; no route accepts these fields in its body. */
export function createAeVerifiedSessionResolver(auth: AeVerifiedAuthAdapter, requireMfa = true, clock = Date.now) {
  return async (req: Request): Promise<AeVerifiedSession | null> => {
    const token = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "")?.[1];
    if (!token) return null;
    const user = await auth.authenticate(token);
    const actor = aeIdentifier.safeParse(user?.id);
    if (!actor.success) return null;
    const claims = decodeJwtClaims(token), session = aeIdentifier.safeParse(claims?.session_id);
    const subject = aeIdentifier.safeParse(claims?.sub);
    if (!session.success || !subject.success || subject.data !== actor.data ||
      typeof claims?.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= clock() / 1000) return null;
    const purpose = isRecoveryPurposeSession(token) ? "recovery" : "ordinary";
    if (purpose === "recovery") return { authUserId: actor.data, sessionId: session.data, purpose };
    if (requireMfa && (claims.aal !== "aal2" || await auth.currentAssurance(token) !== "aal2")) return null;
    return { authUserId: actor.data, sessionId: session.data, purpose };
  };
}

export interface AeRouteDependencies {
  service: ReturnType<typeof createAeWorkspaceService>;
  identity: ReturnType<typeof createAeIdentityBinding>;
  enabled(): boolean;
  /** Exact trusted application origin. No forwarded-header/body inference. */
  origin: string;
  /** Use the canonical verified resolver, with required MFA for staff actions. */
  resolveSession(req: Request, mode: "staff" | "claim"): Promise<AeVerifiedSession | null>;
  /** Live original guest proof from the existing private session resolver. No
   * body fields, email lookup or reconstruction from erased admission data. */
  resolveOriginalGuestProof(req: Request, session: AeVerifiedSession): Promise<AeGuestProof | null>;
  /** Wire the existing durable rate limiter in Root composition. No fallback. */
  rateLimit(req: Request, actorAuthUserId: string): Promise<boolean>;
}
function send(res: Response, result: AeResult<unknown>) {
  if (result.ok) { res.status(200).json(result); return; }
  const status = result.code === "invalid_input" ? 400 : result.code === "access_denied" ? 403
    : result.code === "not_found" ? 404 : result.code === "revision_conflict" || result.code === "idempotency_conflict" ? 409 : 503;
  res.status(status).json(result);
}

/** Registration only. No global mount, capability, scope/grant provisioning or
 * environment activation happens on import or construction of this module. */
export function registerAeWorkspaceRoutes(app: Express, deps: AeRouteDependencies): void {
  const base = AE_WORKSPACE_API_BASE;
  const origin = new URL(deps.origin).origin;
  app.use(base, (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    next();
  }, json({ limit: "16kb", strict: true }));
  const handler = (operation: "read" | "command" | "assign" | "claim") => (req: Request, res: Response) => {
    void (async () => {
      if (!deps.enabled()) { res.status(503).json({ ok: false, code: "unavailable" }); return; }
      if (operation !== "read" && (req.get("origin") !== origin || req.get("sec-fetch-site") === "cross-site")) {
        res.status(403).json({ ok: false, code: "access_denied" }); return;
      }
      const session = await deps.resolveSession(req, operation === "claim" ? "claim" : "staff");
      if (!session) { res.status(401).json({ ok: false, code: "access_denied" }); return; }
      if (session.purpose !== "ordinary") { res.status(403).json({ ok: false, code: "access_denied" }); return; }
      if (!await deps.rateLimit(req, session.authUserId)) { res.status(429).json({ ok: false, code: "unavailable" }); return; }
      if (operation === "read") { send(res, await deps.service.read(session)); return; }
      if (operation === "command") { send(res, await deps.service.command(session, req.body)); return; }
      if (operation === "assign") { send(res, await deps.service.assign(session, req.body)); return; }
      const command = aeGuestClaimCommandSchema.safeParse(req.body);
      if (!command.success) { res.status(400).json({ ok: false, code: "invalid_input" }); return; }
      const proof = await deps.resolveOriginalGuestProof(req, session);
      send(res, await deps.identity.claim(session, command.data, proof));
    })().catch(() => { res.status(503).json({ ok: false, code: "unavailable" }); });
  };
  app.get(base + "/workspace", handler("read"));
  app.post(base + "/commands", handler("command"));
  app.post(base + "/assignments", handler("assign"));
  app.post(base + "/identity-claims", handler("claim"));
  app.use(base, (_error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(400).json({ ok: false, code: "invalid_input" });
  });
}

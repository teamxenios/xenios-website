import { randomUUID } from "node:crypto";
import { accountUuidSchema, ADMIN_ACCOUNTS_PATH } from "../../shared/research/admin-accounts";
import { getSupabaseAdmin, getSupabaseAnon, getSupabaseConnectionIdentity, supabaseConfigured } from "../supabase";
import { decodeJwtClaims, isRecoveryPurposeSession } from "./member-auth";
import { accountReadUnavailable, type AccountReadAdmission, type AccountReadScope } from "./admin-accounts/authority";
import type { AdminAccountProductionOptions } from "./admin-accounts/production";
import type { PrelaunchRepository } from "./prelaunch";

export const ADMIN_ACCOUNT_READ_CURRENT_RPC = "research_admin_account_read_current" as const;
export const ADMIN_ACCOUNT_READ_ENABLED_ENV = "RESEARCH_ADMIN_ACCOUNT_READ_ENABLED" as const;
/** Root-selected bound on a verified TOTP event; token issuance/refresh is not reauthentication. */
export const ADMIN_ACCOUNT_READ_TOTP_MAX_AGE_SECONDS = 300;
type Connection = ReturnType<typeof getSupabaseConnectionIdentity>;
type Verified = Readonly<{ actorId: string; sessionId: string; expiresAt: number; totpAt: number }>;
type AuditRepository = Pick<PrelaunchRepository, "appendAccessAudit">;

/** Trusted composition inputs only. No HTTP body, email allowlist or domain-role adapter supplies these ports. */
export interface AdminAccountAdmissionPorts {
  readonly projectUrl: string;
  ready(): boolean;
  connection(): Connection;
  authenticate(token: string): Promise<{ id: string } | null>;
  currentAssurance(token: string): Promise<"aal1" | "aal2" | null>;
  /** Exact backend-only RPC checks canonical auth.sessions and current prelaunch super_admin. */
  current(actorId: string, sessionId: string): Promise<unknown>;
  readonly audit: AuditRepository;
  now?(): number;
  requestId?(): string;
}

const ordinaryFirstFactors = new Set(["password", "oauth", "sso/saml", "web3", "oauth_provider/authorization_code"]);
function project(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && url.origin === value && !url.username && !url.password; }
  catch { return false; }
}
function scope(value: AccountReadScope): AccountReadScope | null {
  const actor = accountUuidSchema.safeParse(value?.actorId);
  if (!actor.success || value.capability !== "accountRead" || !["directory", "detail"].includes(value.operation)) return null;
  if (value.operation === "directory") return value.targetId === null
    ? { actorId: actor.data, capability: "accountRead", operation: "directory", targetId: null } : null;
  const target = accountUuidSchema.safeParse(value.targetId);
  return target.success ? { actorId: actor.data, capability: "accountRead", operation: "detail", targetId: target.data } : null;
}
function validAt(value: Verified, milliseconds: number): boolean {
  if (!Number.isFinite(milliseconds)) return false;
  const now = milliseconds / 1000;
  return value.expiresAt > now && value.totpAt <= now && now - value.totpAt <= ADMIN_ACCOUNT_READ_TOTP_MAX_AGE_SECONDS;
}
function verifiedClaims(token: string, actorId: string, projectUrl: string, now: number): Verified | null {
  const claims = decodeJwtClaims(token), subject = accountUuidSchema.safeParse(claims?.sub);
  const session = accountUuidSchema.safeParse(claims?.session_id);
  if (!claims || !subject.success || subject.data !== actorId || !session.success
    || claims.iss !== projectUrl + "/auth/v1" || claims.role !== "authenticated" || claims.is_anonymous !== false
    || !(claims.aud === "authenticated" || Array.isArray(claims.aud) && claims.aud.includes("authenticated"))
    || claims.aal !== "aal2" || !Number.isSafeInteger(claims.exp) || isRecoveryPurposeSession(token)
    || !Array.isArray(claims.amr) || claims.amr.length < 2 || claims.amr.length > 16) return null;
  const methods = claims.amr as unknown[];
  if (!methods.some(entry => entry !== null && typeof entry === "object"
    && typeof (entry as Record<string, unknown>).method === "string"
    && ordinaryFirstFactors.has((entry as Record<string, unknown>).method as string))) return null;
  const totp = methods.filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object"
    && !Array.isArray(entry) && (entry as Record<string, unknown>).method === "totp");
  // The event must be present in this already-authenticated token; no synthetic timestamp or iat fallback.
  if (totp.length !== 1 || !Number.isSafeInteger(totp[0].timestamp) || (totp[0].timestamp as number) <= 0) return null;
  const result = { actorId, sessionId: session.data, expiresAt: claims.exp as number, totpAt: totp[0].timestamp as number };
  return validAt(result, now) ? result : null;
}

/** Adapts existing canonical authority/audit ports to U3's instance-local principal boundary. */
export function createAdminAccountAdmission(ports: AdminAccountAdmissionPorts): Required<AdminAccountProductionOptions> {
  const now = ports.now ?? Date.now, uuid = ports.requestId ?? randomUUID;
  function ready(): boolean {
    try {
      const identity = ports.connection();
      return project(ports.projectUrl) && ports.ready() === true && identity.configuredUrl === ports.projectUrl
        && (identity.anonUrl === null || identity.anonUrl === ports.projectUrl)
        && (identity.adminUrl === null || identity.adminUrl === ports.projectUrl);
    } catch { return false; }
  }
  function boundary() { if (!ready()) throw accountReadUnavailable(); }
  async function observe(token: string): Promise<Verified | null> {
    boundary();
    const user = await ports.authenticate(token);
    boundary();
    const actor = accountUuidSchema.safeParse(user?.id);
    if (!actor.success) return null;
    const observed = verifiedClaims(token, actor.data, ports.projectUrl, now());
    if (!observed) return null;
    const assurance = await ports.currentAssurance(token);
    boundary();
    return assurance === "aal2" && validAt(observed, now()) ? observed : null;
  }
  async function current(token: string, original: Verified): Promise<boolean> {
    try {
      const observed = await observe(token);
      if (!observed || observed.actorId !== original.actorId || observed.sessionId !== original.sessionId) return false;
      const allowed = await ports.current(original.actorId, original.sessionId);
      boundary();
      if (typeof allowed !== "boolean") throw accountReadUnavailable();
      return allowed && validAt(observed, now());
    } catch { throw accountReadUnavailable(); }
  }
  const admission: AccountReadAdmission = {
    async admit(input) {
      const selected = scope(input);
      if (!selected || typeof input.token !== "string" || !input.token || input.token.length > 8192
        || /[\s,\u0000-\u001f\u007f]/u.test(input.token)) return null;
      const token = input.token;
      try {
        const observed = await observe(token);
        if (!observed || observed.actorId !== selected.actorId) return null;
        const allowed = await ports.current(observed.actorId, observed.sessionId);
        boundary();
        if (typeof allowed !== "boolean") throw accountReadUnavailable();
        if (!allowed || !validAt(observed, now())) return null;
        return Object.freeze({ ...selected, purpose: "ordinary" as const,
          isCurrent: () => current(token, observed) });
      } catch { throw accountReadUnavailable(); }
    },
    async audit(event) {
      boundary();
      const selected = scope(event), keys = Object.keys(event).sort().join(",");
      const request = accountUuidSchema.safeParse(uuid()), occurredAt = now();
      if (!selected || keys !== "actorId,capability,operation,outcome,targetId" || !request.success || !Number.isFinite(occurredAt)
        || (event.outcome !== "provided" && event.outcome !== "not_found")
        || selected.operation === "directory" && event.outcome !== "provided") throw accountReadUnavailable();
      try {
        await ports.audit.appendAccessAudit({ authUserId: selected.actorId,
          routeGroup: ADMIN_ACCOUNTS_PATH + (selected.operation === "detail" ? "/" + selected.targetId : ""),
          role: "super_admin", decision: "allowed", reasonCode: `account_read_${selected.operation}_${event.outcome}`,
          requestId: request.data, seedNamespace: null, occurredAt: new Date(occurredAt) });
        boundary();
      } catch { throw accountReadUnavailable(); }
    },
  };
  return { ready, admission };
}

/** Reuses the existing singletons lazily. Construction never creates an SDK client or probes a provider. */
export function buildCanonicalAdminAccountAdmission(options: {
  projectUrl: string; ready(): boolean; audit: AuditRepository;
  env?: Readonly<Record<string, string | undefined>>;
}): Required<AdminAccountProductionOptions> {
  const env = options.env ?? process.env;
  function connected(kind: "anonUrl" | "adminUrl") {
    if (getSupabaseConnectionIdentity()[kind] !== options.projectUrl) throw accountReadUnavailable();
  }
  function anon() { const client = getSupabaseAnon(); connected("anonUrl"); return client; }
  return createAdminAccountAdmission({
    projectUrl: options.projectUrl,
    ready: () => env[ADMIN_ACCOUNT_READ_ENABLED_ENV] === "true" && options.ready() === true
      && supabaseConfigured() && env.SUPABASE_URL === options.projectUrl,
    connection: getSupabaseConnectionIdentity,
    async authenticate(token) {
      const { data, error } = await anon().auth.getUser(token);
      if (error) { if (error.status === 401 || error.status === 403) return null; throw accountReadUnavailable(); }
      return data.user ? { id: data.user.id } : null;
    },
    async currentAssurance(token) {
      const { data, error } = await anon().auth.mfa.getAuthenticatorAssuranceLevel(token);
      if (error) throw accountReadUnavailable();
      return data?.currentLevel === "aal2" ? "aal2" : data?.currentLevel === "aal1" ? "aal1" : null;
    },
    async current(actorId, sessionId) {
      // Root passes the already-built prelaunch repository. Its canonical admin
      // singleton must already exist: do not start the factory's one-time Auth
      // admin key self-check on a subsequently refused account-read request.
      connected("adminUrl");
      const client = getSupabaseAdmin(); connected("adminUrl");
      const { data, error } = await client.rpc(ADMIN_ACCOUNT_READ_CURRENT_RPC, { p_actor_user_id: actorId, p_session_id: sessionId });
      if (error) throw accountReadUnavailable();
      return data;
    },
    audit: options.audit,
  });
}

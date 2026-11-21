import { createHash, randomUUID } from "node:crypto";
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
export const ADMIN_ACCOUNT_DENIED_AUDIT_RATE_LIMIT_RPC = 'research_rate_limit_hit' as const;
export const ADMIN_ACCOUNT_DENIED_AUDIT_WINDOW_SECONDS = 60;
export const ADMIN_ACCOUNT_DENIED_AUDIT_MAXIMUM = 10;
type DeniedReason = 'account_read_fresh_totp_required' | 'account_read_authority_required';
type Connection = ReturnType<typeof getSupabaseConnectionIdentity>;
type Verified = Readonly<{ actorId: string; sessionId: string; expiresAt: number; totpAt: number }>;
type AuditRepository = Pick<PrelaunchRepository, "appendAccessAudit">;
type ClaimState = Readonly<{ kind: 'valid'; value: Verified }> | Readonly<{ kind: 'fresh_totp_required' | 'unusable' }>;
type Observation = Readonly<{ actorId: string; state: ClaimState }>;

/** Trusted composition inputs only. No HTTP body, email allowlist or domain-role adapter supplies these ports. */
export interface AdminAccountAdmissionPorts {
  readonly projectUrl: string;
  ready(): boolean;
  connection(): Connection;
  authenticate(token: string): Promise<{ id: string } | null>;
  currentAssurance(token: string): Promise<"aal1" | "aal2" | null>;
  /** Exact backend-only RPC checks canonical auth.sessions and current prelaunch super_admin. */
  current(actorId: string, sessionId: string): Promise<unknown>;
  /** Existing durable limiter only; false/error withholds the denial as unavailable. */
  allowDeniedAudit(actorId: string): Promise<boolean>;
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
function verifiedClaims(token: string, actorId: string, projectUrl: string, now: number): ClaimState {
  const claims = decodeJwtClaims(token), subject = accountUuidSchema.safeParse(claims?.sub);
  const session = accountUuidSchema.safeParse(claims?.session_id);
  // Only an ordinary, same-project, matching canonical subject is eligible for
  // a denied audit. Malformed/cross-subject carriers never create victim logs.
  if (!claims || !subject.success || subject.data !== actorId || !session.success
    || claims.iss !== projectUrl + '/auth/v1' || claims.role !== 'authenticated' || claims.is_anonymous !== false
    || !(claims.aud === 'authenticated' || Array.isArray(claims.aud) && claims.aud.includes('authenticated'))
    || !Number.isFinite(now) || !Number.isSafeInteger(claims.exp) || (claims.exp as number) <= now / 1000
    || isRecoveryPurposeSession(token) || !Array.isArray(claims.amr) || claims.amr.length < 1 || claims.amr.length > 16) return { kind: 'unusable' };
  const methods = claims.amr as unknown[];
  if (!methods.some(entry => entry !== null && typeof entry === 'object'
    && typeof (entry as Record<string, unknown>).method === 'string'
    && ordinaryFirstFactors.has((entry as Record<string, unknown>).method as string))) return { kind: 'unusable' };
  const totp = methods.filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object'
    && !Array.isArray(entry) && (entry as Record<string, unknown>).method === 'totp');
  // Absent/stale/insufficient factor proof is auditable after verified identity;
  // it never becomes permission, and neither iat nor a retry renews its age.
  if (claims.aal !== 'aal2' || totp.length !== 1 || !Number.isSafeInteger(totp[0].timestamp)
    || (totp[0].timestamp as number) <= 0) return { kind: 'fresh_totp_required' };
  const value = { actorId, sessionId: session.data, expiresAt: claims.exp as number, totpAt: totp[0].timestamp as number };
  return validAt(value, now) ? { kind: 'valid', value } : { kind: 'fresh_totp_required' };
}

/** Adapts existing canonical authority/audit ports to U3's instance-local principal boundary. */
export function createAdminAccountAdmission(ports: AdminAccountAdmissionPorts): Required<AdminAccountProductionOptions> {
  const now = ports.now ?? Date.now, uuid = ports.requestId ?? randomUUID;
  function ready(): boolean {
    try {
      const identity = ports.connection();
      return project(ports.projectUrl) && ports.ready() === true && identity.configuredUrl === ports.projectUrl
        && (identity.anonUrl === null || identity.anonUrl === ports.projectUrl)
        && identity.adminUrl === ports.projectUrl;
    } catch { return false; }
  }
  function boundary() { if (!ready()) throw accountReadUnavailable(); }
  async function observe(token: string): Promise<Observation | null> {
    boundary();
    const user = await ports.authenticate(token);
    boundary();
    const actor = accountUuidSchema.safeParse(user?.id);
    if (!actor.success) return null;
    const state = verifiedClaims(token, actor.data, ports.projectUrl, now());
    if (state.kind !== 'valid') return { actorId: actor.data, state };
    const assurance = await ports.currentAssurance(token);
    boundary();
    const at = now();
    if (!Number.isFinite(at) || state.value.expiresAt <= at / 1000) return { actorId: actor.data, state: { kind: 'unusable' } };
    return { actorId: actor.data, state: assurance === 'aal2' && validAt(state.value, at)
      ? state : { kind: 'fresh_totp_required' } };
  }
  async function current(token: string, original: Verified): Promise<boolean> {
    try {
      const observation = await observe(token), state = observation?.state;
      if (!observation || state?.kind !== 'valid' || state.value.actorId !== original.actorId
        || state.value.sessionId !== original.sessionId) return false;
      const allowed = await ports.current(original.actorId, original.sessionId);
      boundary();
      if (typeof allowed !== 'boolean') throw accountReadUnavailable();
      return allowed && validAt(state.value, now());
    } catch { throw accountReadUnavailable(); }
  }
  async function denied(selected: AccountReadScope, reason: DeniedReason): Promise<null> {
    boundary();
    const request = accountUuidSchema.safeParse(uuid()), at = now();
    if (!request.success || !Number.isFinite(at) || !Number.isFinite(new Date(at).getTime())) throw accountReadUnavailable();
    try {
      const budget = await ports.allowDeniedAudit(selected.actorId);
      boundary();
      if (budget !== true) throw accountReadUnavailable();
      await ports.audit.appendAccessAudit({ authUserId: selected.actorId,
        routeGroup: ADMIN_ACCOUNTS_PATH + (selected.operation === 'detail' ? '/' + selected.targetId : ''),
        role: null, decision: 'denied', reasonCode: reason, requestId: request.data,
        seedNamespace: null, occurredAt: new Date(at) });
      boundary();
      return null;
    } catch { throw accountReadUnavailable(); }
  }
  const admission: AccountReadAdmission = {
    async admit(input) {
      const selected = scope(input);
      if (!selected || typeof input.token !== "string" || !input.token || input.token.length > 8192
        || /[\s,\u0000-\u001f\u007f]/u.test(input.token)) return null;
      const token = input.token;
      try {
        const observation = await observe(token);
        if (!observation || observation.actorId !== selected.actorId) return null;
        const state = observation.state;
        if (state.kind === 'fresh_totp_required') return await denied(selected, 'account_read_fresh_totp_required');
        if (state.kind !== 'valid') return null;
        const observed = state.value;
        const allowed = await ports.current(observed.actorId, observed.sessionId);
        boundary();
        if (typeof allowed !== 'boolean') throw accountReadUnavailable();
        const at = now();
        if (!allowed) return await denied(selected, 'account_read_authority_required');
        if (!Number.isFinite(at) || observed.expiresAt <= at / 1000) return null;
        if (!validAt(observed, at)) return await denied(selected, 'account_read_fresh_totp_required');
        return Object.freeze({ ...selected, purpose: 'ordinary' as const,
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
  function admin() {
    connected('adminUrl');
    const client = getSupabaseAdmin(); connected('adminUrl');
    return client;
  }
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
      const { data, error } = await admin().rpc(ADMIN_ACCOUNT_READ_CURRENT_RPC, { p_actor_user_id: actorId, p_session_id: sessionId });
      if (error) throw accountReadUnavailable();
      return data;
    },
    async allowDeniedAudit(actorId) {
      // Same existing atomic durable limiter, never its process-memory fallback
      // or generic raw-error logger. No UUID/email/token is stored in this key.
      const actorHash = createHash('sha256').update(actorId).digest('hex');
      const { data, error } = await admin().rpc(ADMIN_ACCOUNT_DENIED_AUDIT_RATE_LIMIT_RPC, {
        p_key: 'admin-account-read-denial:' + actorHash,
        p_window_seconds: ADMIN_ACCOUNT_DENIED_AUDIT_WINDOW_SECONDS,
        p_max_hits: ADMIN_ACCOUNT_DENIED_AUDIT_MAXIMUM });
      if (error || typeof data !== 'boolean') throw accountReadUnavailable();
      return data;
    },
    audit: options.audit,
  });
}

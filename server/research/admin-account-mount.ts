import type { Express } from "express";
import { getSupabaseAdmin, getSupabaseConnectionIdentity, supabaseConfigured } from "../supabase";
import { boundedAccountRead, accountReadUnavailable } from "./admin-accounts/authority";
import { buildAdminAccountDependencies } from "./admin-accounts/production";
import { registerAdminAccountsApi } from "./admin-accounts/routes";
import { ADMIN_ACCOUNT_READ_CURRENT_RPC, ADMIN_ACCOUNT_READ_ENABLED_ENV, buildCanonicalAdminAccountAdmission } from "./admin-account-admission";
import type { PrelaunchRepository } from "./prelaunch";

export const ADMIN_ACCOUNT_READ_QUALIFICATION_ENV = "RESEARCH_ADMIN_ACCOUNT_READ_QUALIFICATION";
/** Exact candidate bytes. A matching string is a deployment binding, not proof
 * of SQL installation or actor authority. Root verifies the real managed
 * definition/owner/ACL and records its receipt before installing this binding. */
export const ADMIN_ACCOUNT_SESSION_SQL_SHA256 = "8e16f9f3146f59e6c42c29d18315bf35dfe1a0016b2afee343c0b6f195d931e6";
type Connection = ReturnType<typeof getSupabaseConnectionIdentity>;
type Environment = Readonly<Record<string, string | undefined>>;
export interface AdminAccountReadinessPorts {
  readonly env: Environment;
  configured(): boolean;
  connection(): Connection;
  /** One canonical service-only null/null call; no actor read or account write. */
  probe(projectUrl: string): Promise<unknown>;
}
type InstallationBinding = Readonly<{
  protocol: "account-read-installation/v1";
  sourceRevision: string;
  projectUrl: string;
  sqlSha256: string;
  installationReceiptSha256: string;
}>;
function binding(env: Environment): InstallationBinding | null {
  const text = env[ADMIN_ACCOUNT_READ_QUALIFICATION_ENV];
  if (env[ADMIN_ACCOUNT_READ_ENABLED_ENV] !== "true" || !text || text.length > 2048) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== "installationReceiptSha256,projectUrl,protocol,sourceRevision,sqlSha256"
      || record.protocol !== "account-read-installation/v1"
      || typeof record.sourceRevision !== "string" || !/^[a-f0-9]{40}$/u.test(record.sourceRevision)
      || record.sourceRevision !== env.RENDER_GIT_COMMIT
      || record.sqlSha256 !== ADMIN_ACCOUNT_SESSION_SQL_SHA256
      || typeof record.installationReceiptSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(record.installationReceiptSha256)
      || typeof record.projectUrl !== "string" || record.projectUrl !== env.SUPABASE_URL) return null;
    const url = new URL(record.projectUrl);
    if (url.protocol !== "https:" || url.origin !== record.projectUrl || url.username || url.password) return null;
    return Object.freeze(record as unknown as InstallationBinding);
  } catch { return null; }
}
/** One startup probe per instance, with no polling or retry. Deployment binding
 * and probe prove neither actor authority nor an installed SQL body: the exact
 * managed action supplies that external evidence. Real requests independently
 * verify ordinary Auth, recent TOTP, live session/role and durable audit. */
export function createAdminAccountReadiness(ports: AdminAccountReadinessPorts) {
  let accepted = false, acceptedBinding: string | undefined;
  let initialization: Promise<boolean> | undefined;
  function configuration(): InstallationBinding | null {
    try {
      const value = binding(ports.env), identity = ports.connection();
      if (!value || ports.configured() !== true || identity.configuredUrl !== value.projectUrl
        || identity.anonUrl !== null && identity.anonUrl !== value.projectUrl
        || identity.adminUrl !== null && identity.adminUrl !== value.projectUrl) return null;
      return value;
    } catch { return null; }
  }
  function ready(): boolean {
    return accepted && acceptedBinding === ports.env[ADMIN_ACCOUNT_READ_QUALIFICATION_ENV] && configuration() !== null;
  }
  function initialize(): Promise<boolean> {
    if (initialization) return initialization;
    initialization = (async () => {
      const value = configuration(), original = ports.env[ADMIN_ACCOUNT_READ_QUALIFICATION_ENV];
      if (!value) return false;
      try {
        const result = await boundedAccountRead(() => ports.probe(value.projectUrl));
        if (result !== false || original !== ports.env[ADMIN_ACCOUNT_READ_QUALIFICATION_ENV] || !configuration()) return false;
        acceptedBinding = original;
        accepted = true;
        return true;
      } catch { return false; }
    })();
    return initialization;
  }
  return { ready, initialize };
}

/** Mount the existing U3 APIs with genuine canonical ports. Missing release
 * binding/flag or failed startup probe keeps provider directory reads closed.
 * The production action may enable this only after exact SQL/source and
 * controlled actor qualification; construction performs no provider operation. */
export function registerCanonicalAdminAccounts(app: Express,
  audit: Pick<PrelaunchRepository, "appendAccessAudit">, env: Environment = process.env) {
  const readiness = createAdminAccountReadiness({
    env, configured: supabaseConfigured, connection: getSupabaseConnectionIdentity,
    async probe(projectUrl) {
      const client = getSupabaseAdmin();
      if (getSupabaseConnectionIdentity().adminUrl !== projectUrl) throw accountReadUnavailable();
      const { data, error } = await client.rpc(ADMIN_ACCOUNT_READ_CURRENT_RPC, { p_actor_user_id: null, p_session_id: null });
      if (error) throw accountReadUnavailable();
      return data;
    },
  });
  const admission = buildCanonicalAdminAccountAdmission({
    projectUrl: env.SUPABASE_URL ?? "", ready: readiness.ready, audit, env,
  });
  registerAdminAccountsApi(app, buildAdminAccountDependencies(admission));
  return readiness;
}


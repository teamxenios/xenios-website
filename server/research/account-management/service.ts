import { createHash } from "node:crypto";
import { safeResearchReturnTo } from "@shared/research/auth-return-to";
import {
  ACCOUNT_REGISTRATION_NOTICE, accountRegistrationSchema, accountIdentitySchema,
  accountSelfMutationSchema,
  type AccountIdentity, type AccountManagementConfig, type AccountManagementErrorCode,
  type AccountSelfMutation,
} from "@shared/research/account-management";

export class AccountManagementError extends Error {
  constructor(readonly code: AccountManagementErrorCode, readonly status: 400 | 401 | 403 | 429 | 503) { super(code); }
}
export type AccountRequestContext = Readonly<{ ip: string; origin: string | undefined; fetchSite: string | undefined; json: boolean }>;
export type AccountReleaseReadiness = Readonly<{
  registrationQualified: boolean; selfEditsQualified: boolean; emailConfirmationRequired: boolean; basicPoliciesReady: boolean;
}>;
export type UniversalAccountDependencies = Readonly<{
  origin: string | null;
  config(): AccountManagementConfig;
  allow(key: string, windowSeconds: number, maxHits: number): Promise<boolean>;
  verifyCaptcha(token: string, ip: string): Promise<boolean>;
  signUp(input: { email: string; password: string; options: { emailRedirectTo: string; data?: { display_name: string } } }): Promise<unknown>;
  /** Existing canonical Auth transport. No application membership lookup. */
  verifyIdentity(token: string): Promise<unknown>;
  isRecovery(token: string): boolean;
  resetPassword(email: string, redirectTo: string): Promise<unknown>;
  /** Supported Auth REST, bound to this exact captured bearer, never SDK storage. */
  updateSelf(token: string, attributes: Readonly<{ data?: { display_name: string }; email?: string; password?: string; nonce?: string }>, redirectTo: string): Promise<{ ok: boolean; userId?: string }>;
  reauthenticate(token: string): Promise<{ ok: boolean }>;
}>;
export type UniversalRecoveryPort = Readonly<{
  enabled(): boolean;
  request(input: Readonly<{ email: string; captchaToken?: string; redirectTo: string; context: AccountRequestContext }>): Promise<void>;
}>;
export type UniversalAccountService = Readonly<{
  register(raw: unknown, context: AccountRequestContext): Promise<{ ok: true; state: "check_email"; message: typeof ACCOUNT_REGISTRATION_NOTICE }>;
  identity(token: string | null, ip: string): Promise<{ ok: true; identity: AccountIdentity }>;
  mutate(token: string | null, raw: unknown, context: AccountRequestContext): Promise<{ ok: true; state: "accepted"; operation: AccountSelfMutation["operation"] }>;
  reauthenticate(token: string | null, raw: unknown, context: AccountRequestContext): Promise<{ ok: true; state: "check_email" }>;
}>;
const unavailable = () => new AccountManagementError("account_unavailable", 503);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function requireAccountOrigin(deps: Pick<UniversalAccountDependencies, "origin">, context: AccountRequestContext) {
  if (!deps.origin || context.origin !== deps.origin || !context.json
    || (context.fetchSite !== undefined && context.fetchSite !== "same-origin")) throw new AccountManagementError("origin_not_allowed", 403);
}
async function limit(deps: UniversalAccountDependencies, name: string, value: string, seconds: number, maximum: number) {
  if (!value || value === "unknown") throw unavailable();
  let allowed: boolean;
  try { allowed = await deps.allow(`universal-account:${name}:${digest(value)}`, seconds, maximum); }
  catch { throw unavailable(); }
  if (allowed !== true) throw new AccountManagementError("rate_limited", 429);
}
export function createUniversalAccountService(deps: UniversalAccountDependencies): UniversalAccountService {
  const service: UniversalAccountService = {
    async register(raw: unknown, context: AccountRequestContext) {
      requireAccountOrigin(deps, context);
      const config = deps.config();
      if (!config.registrationEnabled || !config.confirmationRedirect) throw unavailable();
      const parsed = accountRegistrationSchema.safeParse(raw);
      if (!parsed.success) throw new AccountManagementError("invalid_input", 400);
      await limit(deps, "register-ip", context.ip, 600, 5);
      await limit(deps, "register-email", parsed.data.email, 600, 2);
      let captcha = false;
      try { captcha = await deps.verifyCaptcha(parsed.data.captchaToken, context.ip); } catch { /* Closed. */ }
      if (!captcha) throw new AccountManagementError("verification_required", 400);
      const { email, password, displayName } = parsed.data;
      // SDK signup may intentionally return an obfuscated existing-user result.
      // Every provider outcome has the same generic projection, with no claim
      // of account creation/delivery and no provider session ever returned.
      try { await deps.signUp({ email, password, options: { emailRedirectTo: config.confirmationRedirect,
        ...(displayName ? { data: { display_name: displayName } } : {}) } }); } catch { /* Outcome remains unconfirmed. */ }
      return { ok: true as const, state: "check_email" as const, message: ACCOUNT_REGISTRATION_NOTICE };
    },
    async identity(token: string | null, ip: string): Promise<{ ok: true; identity: AccountIdentity }> {
      if (!token || token.length > 16384 || /[\r\n]/u.test(token)) throw new AccountManagementError("authentication_required", 401);
      await limit(deps, "identity", ip, 60, 120);
      let raw: unknown;
      try { raw = await deps.verifyIdentity(token); } catch { throw unavailable(); }
      if (!raw || typeof raw !== "object") throw new AccountManagementError("authentication_required", 401);
      if (deps.isRecovery(token)) throw new AccountManagementError("ordinary_session_required", 403);
      const user = raw as Record<string, unknown>;
      if (typeof user.email_confirmed_at !== "string" || !Number.isFinite(Date.parse(user.email_confirmed_at))) {
        throw new AccountManagementError("email_confirmation_required", 403);
      }
      const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata as Record<string, unknown> : {};
      const name = typeof metadata.display_name === "string" ? metadata.display_name.trim().slice(0, 100) : "";
      const pending = typeof user.new_email === "string" && user.new_email ? user.new_email : null;
      const parsed = accountIdentitySchema.safeParse({ userId: user.id, email: user.email, emailVerified: true,
        displayName: /[\u0000-\u001f\u007f]/u.test(name) ? "" : name, pendingEmail: pending });
      if (!parsed.success) throw unavailable();
      return { ok: true, identity: parsed.data };
    },
    async mutate(token: string | null, raw: unknown, context: AccountRequestContext) {
      requireAccountOrigin(deps, context);
      const config = deps.config();
      if (!config.selfEditsEnabled || !config.confirmationRedirect) throw unavailable();
      const parsed = accountSelfMutationSchema.safeParse(raw);
      if (!parsed.success) throw new AccountManagementError("invalid_input", 400);
      if (!token) throw new AccountManagementError("authentication_required", 401);
      const actor = await service.identity(token, context.ip);
      await limit(deps, "self-update", actor.identity.userId, 600, 10);
      const change = parsed.data;
      const attributes = change.operation === "profile" ? { data: { display_name: change.displayName } }
        : change.operation === "email" ? { email: change.email } : { password: change.password, nonce: change.nonce };
      let result: { ok: boolean; userId?: string };
      try { result = await deps.updateSelf(token, attributes, config.confirmationRedirect); }
      catch { throw new AccountManagementError("account_outcome_unconfirmed", 503); }
      if (!result.ok || result.userId !== actor.identity.userId) throw new AccountManagementError("account_outcome_unconfirmed", 503);
      return { ok: true as const, state: "accepted" as const, operation: change.operation };
    },
    async reauthenticate(token: string | null, raw: unknown, context: AccountRequestContext) {
      requireAccountOrigin(deps, context);
      if (!deps.config().selfEditsEnabled) throw unavailable();
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || Reflect.ownKeys(raw).length !== 0) throw new AccountManagementError("invalid_input", 400);
      if (!token) throw new AccountManagementError("authentication_required", 401);
      const actor = await service.identity(token, context.ip);
      await limit(deps, "reauthenticate", actor.identity.userId, 600, 2);
      let result: { ok: boolean };
      try { result = await deps.reauthenticate(token); }
      catch { throw new AccountManagementError("account_outcome_unconfirmed", 503); }
      if (!result.ok) throw new AccountManagementError("account_outcome_unconfirmed", 503);
      return { ok: true as const, state: "check_email" as const };
    },
  };
  return service;
}
export function createUniversalRecoveryPort(deps: UniversalAccountDependencies): UniversalRecoveryPort {
  return {
    enabled: () => deps.config().registrationEnabled,
    async request({ email, captchaToken, redirectTo, context }) {
      requireAccountOrigin(deps, context);
      if (!deps.config().registrationEnabled || !captchaToken || captchaToken.length > 4096) return;
      try {
        const target = new URL(redirectTo), keys = [...target.searchParams.keys()];
        const returnTo = target.searchParams.get("returnTo");
        if (target.origin !== deps.origin || target.pathname !== "/research/reset-password" || target.username || target.password || target.hash
          || keys.some(key => key !== "returnTo") || keys.length > 1 || (returnTo !== null && safeResearchReturnTo(returnTo) !== returnTo)) return;
      } catch { return; }
      // Existing member endpoint owns the generic response and its IP/email
      // budget. This additional shared durable budget never falls back locally.
      await limit(deps, "recovery-ip", context.ip, 600, 3);
      let captcha = false;
      try { captcha = await deps.verifyCaptcha(captchaToken, context.ip); } catch { /* Closed. */ }
      if (!captcha) return;
      try { await deps.resetPassword(email, redirectTo); } catch { /* Generic response; never expose provider diagnostics. */ }
    },
  };
}

import { getSupabaseAnon, getSupabaseConnectionIdentity, supabaseConfigured } from "../../supabase";
import { verifyTurnstile } from "../../turnstile";
import { rateLimitHit } from "../rate-limit";
import { isRecoveryPurposeSession } from "../member-auth";
import { ACCOUNT_SETTINGS_PATH, type AccountManagementConfig } from "@shared/research/account-management";
import { createUniversalRecoveryPort, type AccountReleaseReadiness, type UniversalAccountDependencies } from "./service";

export const UNIVERSAL_ACCOUNTS_ENABLED_ENV = "RESEARCH_UNIVERSAL_ACCOUNTS_ENABLED";
/** The installed SDK uses GET /reauthenticate and PUT /user with the session
 * JWT. We send those supported requests with the verified captured JWT and
 * never let mutable browser/server SDK session storage select the subject. */
export function createCapturedAccountTransport(options: Readonly<{
  projectUrl: string; anonKey: string; fetcher?: typeof fetch;
}>) {
  const fetcher = options.fetcher ?? fetch;
  const anonKey = options.anonKey;
  const project = new URL(options.projectUrl);
  if (project.username || project.password || project.pathname !== "/" || project.search || project.hash
    || (project.protocol !== "https:" && !(project.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(project.hostname)))) throw Error("account_unavailable");
  async function request(token: string, path: "/user" | "/reauthenticate", body?: unknown, redirectTo?: string) {
    if (!token || token.length > 16384 || /[\r\n]/u.test(token) || !anonKey) throw Error("account_unavailable");
    const url = new URL(`/auth/v1${path}`, project.origin);
    if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
    const response = await fetcher(url.href, { method: body === undefined ? "GET" : "PUT", redirect: "error", cache: "no-store",
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { ok: false };
    if (path === "/reauthenticate") return { ok: true };
    const maximum = 16384;
    if (Number(response.headers.get("content-length")) > maximum) throw Error("account_outcome_unconfirmed");
    const reader = response.body?.getReader();
    let text = "", total = 0;
    if (reader) {
      const decoder = new TextDecoder();
      try { for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength;
        if (total > maximum) { await reader.cancel(); throw Error("account_outcome_unconfirmed"); }
        text += decoder.decode(part.value, { stream: true }); }
        text += decoder.decode(); } finally { reader.releaseLock(); }
    } else { text = await response.text(); if (Buffer.byteLength(text) > maximum) throw Error("account_outcome_unconfirmed"); }
    const user = JSON.parse(text);
    return { ok: true, userId: typeof user?.id === "string" ? user.id : undefined };
  }
  return {
    updateSelf: (token: string, body: unknown, redirectTo: string) => request(token, "/user", body, redirectTo),
    reauthenticate: (token: string) => request(token, "/reauthenticate"),
  };
}
function accountOrigin(raw: string | undefined): string | null {
  try {
    const url = new URL(raw ?? "");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ? url.origin : null;
  } catch { return null; }
}
/** Readiness is a trusted composition/release binding, never a request or SDK
 * method-presence inference. Omission keeps signup and edits unavailable. */
export function buildUniversalAccountDependencies(env: NodeJS.ProcessEnv = process.env,
  readiness?: AccountReleaseReadiness): UniversalAccountDependencies & { recovery: ReturnType<typeof createUniversalRecoveryPort> } {
  const origin = accountOrigin(env.SITE_URL);
  const qualified = Object.freeze({ registrationQualified: readiness?.registrationQualified === true,
    selfEditsQualified: readiness?.selfEditsQualified === true, emailConfirmationRequired: readiness?.emailConfirmationRequired === true,
    basicPoliciesReady: readiness?.basicPoliciesReady === true });
  const projectUrl = env.SUPABASE_URL ?? "", anonKey = env.SUPABASE_ANON_KEY ?? "";
  const enabled = env[UNIVERSAL_ACCOUNTS_ENABLED_ENV] === "true" && origin !== null;
  const captchaConfigured = Boolean(env.TURNSTILE_SECRET_KEY?.trim() && env.TURNSTILE_SITE_KEY?.trim());
  const confirmationRedirect = origin ? `${origin}/research/sign-in?returnTo=${encodeURIComponent(ACCOUNT_SETTINGS_PATH)}` : null;
  const config = (): AccountManagementConfig => ({
    registrationEnabled: enabled && supabaseConfigured() && Boolean(anonKey)
      && captchaConfigured && qualified.registrationQualified && qualified.emailConfirmationRequired && qualified.basicPoliciesReady,
    selfEditsEnabled: enabled && supabaseConfigured() && Boolean(anonKey)
      && qualified.selfEditsQualified && qualified.emailConfirmationRequired,
    captchaRequired: true, confirmationRedirect, deletion: "unavailable",
  });
  const deps: UniversalAccountDependencies = {
    origin, config,
    allow: (key, seconds, maximum) => rateLimitHit(key, seconds, maximum, { durableFailurePolicy: "deny" }),
    verifyCaptcha: (token, ip) => captchaConfigured ? verifyTurnstile(token, ip) : Promise.resolve(false),
    signUp: input => canonicalAnon().auth.signUp(input),
    async verifyIdentity(token) {
      if (!enabled || !supabaseConfigured()) throw Error("account_unavailable");
      const { data, error } = await canonicalAnon().auth.getUser(token);
      return error ? null : data.user;
    },
    isRecovery: isRecoveryPurposeSession,
    resetPassword: (email, redirectTo) => canonicalAnon().auth.resetPasswordForEmail(email, { redirectTo }),
    updateSelf: (token, attributes, redirectTo) => transport().updateSelf(token, attributes, redirectTo),
    reauthenticate: token => transport().reauthenticate(token),
  };
  function canonicalAnon() {
    // Construct/use the existing canonical factory and prove its cached project
    // matches the trusted transport configuration. Never create another client.
    const anon = getSupabaseAnon();
    if (!projectUrl || getSupabaseConnectionIdentity().anonUrl !== projectUrl) throw Error("account_unavailable");
    return anon;
  }
  function transport() {
    canonicalAnon();
    return createCapturedAccountTransport({ projectUrl, anonKey });
  }
  return { ...deps, recovery: createUniversalRecoveryPort(deps) };
}

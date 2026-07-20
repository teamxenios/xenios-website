import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isRecoveryHash } from "@shared/research/recovery";
import { getConfig } from "./config";

let clientPromise: Promise<SupabaseClient | null> | null = null;
let authStorageKey: string | null = null;
let authLogoutUrl: string | null = null;
let authAnonKey: string | null = null;

const RECOVERY_AMR_METHODS = new Set(["otp", "magiclink", "recovery"]);
const NORMAL_FIRST_FACTOR_AMR_METHODS = new Set([
  "password",
  "oauth",
  "sso/saml",
  "web3",
  "oauth_provider/authorization_code",
]);

function accessTokenAmr(accessToken: string): string[] | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(globalThis.atob(padded)) as { amr?: Array<string | { method?: unknown }> };
    if (!Array.isArray(claims.amr) || claims.amr.length === 0) return null;
    return claims.amr.map((entry) => typeof entry === "string" ? entry : String(entry?.method ?? ""));
  } catch {
    return null;
  }
}

// Client-side purpose inspection is used only to remove a persisted recovery
// credential; authorization remains server-enforced after auth.getUser()
// verifies the Supabase signature. Keep this rule aligned with member-auth.ts.
export function isRecoveryAccessToken(accessToken: string): boolean {
  const methods = accessTokenAmr(accessToken);
  if (!methods) return false;
  if (methods.some((method) => RECOVERY_AMR_METHODS.has(method))) return true;
  return !methods.some((method) => NORMAL_FIRST_FACTOR_AMR_METHODS.has(method));
}

// Capture the already-provider-issued recovery credential synchronously on
// the first render. We never persist it ourselves and never mutate the hash;
// Supabase still consumes the URL normally when its client initializes.
export function recoveryAccessTokenFromHash(hash: string | null | undefined): string | null {
  if (!isRecoveryHash(hash)) return null;
  try {
    const token = new URLSearchParams(hash?.replace(/^#/, "") ?? "").get("access_token");
    // `type=recovery` is used only to bind cleanup to this exact credential;
    // it is never accepted as server authorization evidence. Keeping the
    // exact token also lets cleanup work if a legacy/custom project omitted
    // AMR while the server's documented no-AMR compatibility path is active.
    return token || null;
  } catch {
    return null;
  }
}

// Synchronously removes only the persisted recovery session that matches the
// captured token. This is safe to call during pagehide/unmount, before an
// asynchronous provider request can be cancelled by the browser. A newer
// password-authenticated session in another tab is never removed.
export function clearPersistedRecoverySession(expectedAccessToken?: string | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    // On a very fast pagehide the async /api/config request may not yet have
    // established authStorageKey. Scan only Supabase Auth's conventional
    // keys, and remove only a recovery-purpose token (plus an exact-token
    // match when one was captured from the provider URL).
    const candidateKeys = authStorageKey
      ? [authStorageKey]
      : Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
          .filter((key): key is string => Boolean(key?.startsWith("sb-") && key.endsWith("-auth-token")));
    for (const key of candidateKeys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const stored = JSON.parse(raw) as { access_token?: unknown };
      const storedToken = typeof stored?.access_token === "string" ? stored.access_token : null;
      if (!storedToken) continue;
      if (expectedAccessToken) {
        if (storedToken !== expectedAccessToken) continue;
      } else if (!isRecoveryAccessToken(storedToken)) {
        continue;
      }
      window.localStorage.removeItem(key);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Browser-side Supabase client using the public anon/publishable key only.
// Used exclusively for admin login (Supabase Auth). Never holds the service key.
export function getSupabaseBrowser(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    clientPromise = getConfig().then((cfg) => {
      if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
      const url = new URL(cfg.supabaseUrl);
      authStorageKey = `sb-${url.hostname.split(".")[0]}-auth-token`;
      authLogoutUrl = new URL("auth/v1/logout?scope=local", url.href.endsWith("/") ? url.href : url.href + "/").href;
      authAnonKey = cfg.supabaseAnonKey;
      return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: authStorageKey },
      });
    });
  }
  return clientPromise;
}

// Revokes exactly the captured recovery session. Local persistence is cleared
// both before and after the request; keepalive gives abandonment/page-close
// cleanup the best chance to reach Supabase without ever using global signout.
export async function revokeRecoverySession(accessToken: string | null | undefined): Promise<void> {
  if (!accessToken) return;
  clearPersistedRecoverySession(accessToken);
  await getSupabaseBrowser();
  clearPersistedRecoverySession(accessToken);
  const logoutUrl = authLogoutUrl;
  const anonKey = authAnonKey;
  if (logoutUrl && anonKey) {
    try {
      await fetch(logoutUrl, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
        keepalive: true,
      });
    } catch {
      // The server still rejects this AMR purpose, and local persistence was
      // synchronously removed. A failed best-effort revoke cannot grant access.
    }
  }
  clearPersistedRecoverySession(accessToken);
}

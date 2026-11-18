import { createHash } from "node:crypto";
import { z } from "zod";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { getSupabaseAdmin, getSupabaseAnon } from "../supabase";
import { rateLimitHit, type RateLimitOptions } from "./rate-limit";

export const ACCOUNT_RECOVERY_NOTICE = "If this address is eligible for account recovery, check its inbox for instructions.";

type Environment = Readonly<Record<string, string | undefined>>;
type FailureCode = "limiter_unavailable" | "eligibility_unavailable" | "provider_unavailable";
export interface StaffRecoveryDependencies {
  environment(): Environment;
  limit(key: string, seconds: number, max: number, options: RateLimitOptions): Promise<boolean>;
  eligibility(email: string): Promise<{ data: unknown; error: unknown }>;
  send(email: string, options: { redirectTo: string }): Promise<{ error: unknown }>;
  reportFailure(code: FailureCode): void;
}

export interface StaffRecoveryRequest {
  email: string;
  returnTo: unknown;
  origin: string | undefined;
  fetchSite: string | undefined;
  json: boolean;
  ip: string;
}

// Explicit deployment configuration is the only callback-origin authority.
// The legacy member callback remains unchanged in members.ts.
export function staffRecoveryOrigin(env: Environment): string | null {
  if (env.RESEARCH_STAFF_RECOVERY_ENABLED !== "true" || !env.SITE_URL) return null;
  try {
    const url = new URL(env.SITE_URL);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    const syntheticLoopback = env.NODE_ENV === "test" && url.protocol === "http:"
      && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !syntheticLoopback) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function createStaffRecoveryDependencies(): StaffRecoveryDependencies {
  return {
    environment: () => process.env,
    limit: rateLimitHit,
    eligibility: async (email) => getSupabaseAdmin().rpc("research_staff_recovery_request", { p_email: email }),
    send: (email, options) => getSupabaseAnon().auth.resetPasswordForEmail(email, options),
    reportFailure: (code) => console.warn("[staff recovery]", code),
  };
}

function budgetKey(kind: "ip" | "email", value: string): string {
  return `research-staff-recovery-${kind}:${createHash("sha256").update(value).digest("hex")}`;
}

// Called only after the identical public response has been sent. Never return
// eligibility, provider errors, identities or grants to the unauthenticated
// requester. This is a single best-effort recovery attempt, not a retry worker.
export async function attemptStaffRecovery(input: StaffRecoveryRequest, deps: StaffRecoveryDependencies): Promise<void> {
  let failure: FailureCode = "limiter_unavailable";
  try {
    const origin = staffRecoveryOrigin(deps.environment());
    if (!origin || !input.json || input.origin !== origin
      || (input.fetchSite !== undefined && input.fetchSite !== "same-origin")
      || !input.ip || input.ip === "unknown") return;
    if (input.email !== input.email.trim().toLowerCase()
      || !z.string().email().max(254).safeParse(input.email).success) return;

    const strict = { durableFailurePolicy: "deny" } as const;
    if (!await deps.limit(budgetKey("ip", input.ip), 600, 3, strict)) return;
    if (!await deps.limit(budgetKey("email", input.email), 600, 1, strict)) return;
    failure = "eligibility_unavailable";
    const eligibility = await deps.eligibility(input.email);
    if (eligibility.error) { deps.reportFailure(failure); return; }
    if (eligibility.data !== true) return;
    failure = "provider_unavailable";
    const result = await deps.send(input.email, {
      redirectTo: new URL(researchAuthPath("/research/reset-password", input.returnTo), origin).href,
    });
    if (result.error) deps.reportFailure(failure);
  } catch {
    // Fixed codes only: provider/RPC errors may contain sensitive addresses or
    // redirect URLs. They are never logged or sent back to the requester.
    deps.reportFailure(failure);
  }
}

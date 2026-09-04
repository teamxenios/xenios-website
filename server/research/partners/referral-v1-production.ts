import type { Request } from "express";
import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";
import { affiliateCodesEnabled, affiliatePortalEnabled } from "../affiliates/v2/feature-flags";
import { requestIp } from "../rate-limit";
import { createSupabaseReferralV1Store, type ReferralV1RpcClient } from "./referral-v1-store";
import { createReferralV1Service, type ReferralV1Dependencies } from "./referral-v1-routes";
import { referralDigest, referralSecretReady } from "./referral-v1-tokens";
import { readReferralV1Lineage } from "./referral-v1-lineage";

export function referralV1Enabled(env: NodeJS.ProcessEnv): boolean {
  return env.RESEARCH_REFERRAL_V1_ENABLED === "true" && affiliatePortalEnabled(env) && affiliateCodesEnabled(env);
}

export function buildReferralV1Dependencies(env: NodeJS.ProcessEnv = process.env): ReferralV1Dependencies {
  // Lazy transport: disabled/unconfigured deployments never initialize a new
  // database client, and there is no process-memory production substitute.
  const rpc: ReferralV1RpcClient = {
    async rpc(name, args) {
      if (!supabaseConfigured()) return { data: null, error: { unavailable: true } };
      try { return await getSupabaseAdmin().rpc(name, args); }
      catch { return { data: null, error: { unavailable: true } }; }
    },
  };
  return {
    enabled: referralV1Enabled(env),
    secret: referralSecretReady(env.RESEARCH_PARTNER_LINK_SECRET ?? null) ? env.RESEARCH_PARTNER_LINK_SECRET! : null,
    origin: env.SITE_URL || "https://xeniostechnology.com",
    store: createSupabaseReferralV1Store(rpc),
    async allowed(req, action) {
      // Reuse the canonical atomic limiter RPC. Opaque keys and sanitized
      // failures; deliberately no legacy per-process fallback or raw logging.
      const actor = (req as Request & { researchMember?: { auth_user_id?: string } }).researchMember?.auth_user_id;
      const key = `gen2-referral-v1:${action}:${referralDigest(actor ?? requestIp(req))}`;
      const result = await rpc.rpc("research_rate_limit_hit", {
        p_key: key, p_window_seconds: 3600, p_max_hits: action === "read" ? 120 : action === "write" ? 20 : 60,
      });
      return !result.error && result.data === true;
    },
    async lineage(bindings) { return readReferralV1Lineage(bindings, rpc); },
  };
}

/** Invoked only after the existing member guard resolved the real Auth identity. */
export async function bindConfiguredMemberReferral(req: Request): Promise<void> {
  if (!referralV1Enabled(process.env)) return;
  try {
    const deps = buildReferralV1Dependencies();
    const service = createReferralV1Service(deps);
    if (!service.canBindMember(req)) return;
    // Auth-probe binding shares the same durable budget as explicit capture.
    // A refused optional attribution must not refuse the legitimate sign-in.
    if (!await deps.allowed(req, "capture")) return;
    await service.bindMember(req);
  }
  catch { /* Optional referral failure never grants access or prevents sign-in. */ }
}

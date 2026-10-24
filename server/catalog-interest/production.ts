import { createHash } from "node:crypto";
import { z } from "zod";
import { CatalogInterestReceipt } from "@shared/catalog-interest";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase";
import { requestIp } from "../research/rate-limit";
import { verifyTurnstile } from "../turnstile";
import { catalogAuthorityFromEnvironment } from "./authority";
import type { CatalogInterestApiDependencies } from "./api";
import type { CatalogInterestRecordInput, CatalogInterestRecordResult } from "./service";

const recordResult = z.union([
  CatalogInterestReceipt,
  z.object({ ok: z.literal(false), code: z.literal("request_conflict") }).strict(),
]);
const teamRecipientSchema = z.string().trim().email().max(320)
  .transform((value) => value.toLowerCase());

function configuredTeamRecipient(): string | null {
  const parsed = teamRecipientSchema.safeParse(process.env.CATALOG_TEAM_RECIPIENT);
  return parsed.success ? parsed.data : null;
}

async function record(input: CatalogInterestRecordInput): Promise<CatalogInterestRecordResult> {
  if (!supabaseConfigured()) throw new Error("catalog interest unavailable");
  const { data, error } = await getSupabaseAdmin().rpc("record_catalog_interest", {
    p_request_id: input.requestId,
    p_fingerprint: input.fingerprint,
    p_email: input.email,
    p_marketing_consent: input.marketingConsent,
    p_delivery_notice_version: input.deliveryNoticeVersion,
    p_marketing_notice_version: input.marketingNoticeVersion,
    p_catalog_revision: input.catalogRevision,
    p_catalog_url: input.catalogUrl,
    p_catalog_approved_at: input.catalogApprovedAt,
    p_catalog_expires_at: input.catalogExpiresAt,
    p_catalog_revoked_at: input.catalogRevokedAt,
    p_authority_state: input.authorityState,
    p_team_recipient: input.teamRecipient,
    p_customer_event_key: input.customerEventKey,
    p_team_event_key: input.teamEventKey,
    p_customer_event_type: input.customerEventType,
    p_team_event_type: input.teamEventType,
  });
  if (error) throw new Error("catalog interest unavailable");
  const parsed = recordResult.safeParse(data);
  if (!parsed.success) throw new Error("catalog interest unavailable");
  return parsed.data;
}

export function createCatalogInterestDependencies(): CatalogInterestApiDependencies {
  return {
    authority: () => catalogAuthorityFromEnvironment(),
    teamRecipient: configuredTeamRecipient,
    store: { record },
    requestIp,
    verifyChallenge: (token, ip) => verifyTurnstile(token, ip),
    async rateLimit(ip) {
      if (!supabaseConfigured() || ip === "unknown") return "unavailable";
      const ipHash = createHash("sha256").update(ip, "utf8").digest("hex");
      try {
        const result = await getSupabaseAdmin().rpc("research_rate_limit_hit", {
          p_key: `catalog-interest:${ipHash}`,
          p_window_seconds: 10 * 60,
          p_max_hits: 5,
        });
        if (result.error || typeof result.data !== "boolean") return "unavailable";
        return result.data ? "allowed" : "denied";
      } catch {
        return "unavailable";
      }
    },
  };
}

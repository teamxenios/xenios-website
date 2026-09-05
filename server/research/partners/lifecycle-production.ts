import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";
import type { PartnerLifecycleDependencies } from "./lifecycle-admin";

export function createPartnerLifecycleDependencies(): PartnerLifecycleDependencies {
  async function rpc(name: string, parameters?: Record<string, unknown>) {
    if (!supabaseConfigured()) throw new Error("partner authority unavailable");
    const result = await getSupabaseAdmin().rpc(name, parameters);
    if (result.error) throw new Error("partner authority unavailable");
    return result.data;
  }
  return {
    authority: () => rpc("research_partner_lifecycle_authority"),
    operate: (actorAuthUserId, operation) => rpc("research_admin_partner_operation", { p_actor_auth_user_id: actorAuthUserId, p_operation: operation }),
    now: () => new Date(),
  };
}

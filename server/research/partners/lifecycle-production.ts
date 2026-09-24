import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";
import type { PartnerLifecycleDependencies } from "./lifecycle-admin";
import { enqueuePartnerLifecycleNotifications } from "./notifications";

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
    notify: async (result) => {
      if (!supabaseConfigured()) throw new Error("partner notification source unavailable");
      const { data, error } = await getSupabaseAdmin().from("research_partners").select("contact_email").eq("id", result.partnerId).maybeSingle();
      const contactEmail = typeof data?.contact_email === "string" ? data.contact_email.trim().toLowerCase() : "";
      if (error || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error("partner notification source unavailable");
      await enqueuePartnerLifecycleNotifications({ partnerId: result.partnerId, contactEmail, action: result.action, state: result.state, updatedAt: result.updatedAt });
    },
    now: () => new Date(),
  };
}

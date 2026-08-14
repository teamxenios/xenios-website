import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessBuyerActivationDeps } from "./business-buyer-bridge";

function authIdentity(user: any) {
  if (!user) return null;
  return {
    id: String(user.id ?? ""),
    email: typeof user.email === "string" ? user.email : null,
    emailConfirmedAt: typeof user.email_confirmed_at === "string" ? user.email_confirmed_at : null,
  };
}

function buyerContext(raw: any) {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row) return null;
  return {
    buyerId: String(row.buyer_id ?? ""),
    buyerSlug: String(row.buyer_slug ?? ""),
    customerRef: String(row.customer_ref ?? ""),
    priceProfile: String(row.price_profile ?? ""),
    roles: Array.isArray(row.roles) ? row.roles.map(String) : [],
  };
}

/**
 * Service-role adapter for the reviewed operator action only. It sends claims
 * through Supabase Auth and never accepts, creates, logs, or stores a password.
 */
export function createSupabaseBusinessBuyerActivationDeps(
  admin: SupabaseClient,
): BusinessBuyerActivationDeps {
  return {
    async findAuthByEmail(normalizedEmail) {
      for (let page = 1; page <= 50; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(error.message);
        const users = data.users ?? [];
        const found = users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail);
        if (found) return authIdentity(found);
        if (users.length < 200) return null;
      }
      throw new Error("Supabase Auth lookup exceeded the bounded roster scan.");
    },
    async inviteAuthUser(normalizedEmail, redirectTo) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
        redirectTo,
      });
      if (error || !data.user) {
        throw new Error(error?.message ?? "Supabase secure invitation returned no user.");
      }
      return authIdentity(data.user);
    },
    async finalizeClaim(input) {
      const { data, error } = await admin.rpc("research_finalize_business_buyer_claim", {
        p_buyer_id: input.buyerId,
        p_auth_user_id: input.authUserId,
        p_normalized_email: input.email,
        p_actor_label: input.actorLabel,
      });
      if (error) throw new Error(error.message);
      const context = buyerContext(data);
      if (!context) throw new Error("Business buyer claim RPC returned no context.");
      return context;
    },
  };
}

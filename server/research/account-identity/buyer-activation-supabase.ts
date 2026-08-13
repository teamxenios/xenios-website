import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActiveBuyerApplication,
  BuyerActivationDeps,
  BuyerAuthIdentity,
  BuyerMemberBinding,
} from "./buyer-activation";

function authIdentity(user: any): BuyerAuthIdentity | null {
  if (!user) return null;
  return {
    id: String(user.id ?? ""),
    email: typeof user.email === "string" ? user.email : null,
    emailConfirmedAt: typeof user.email_confirmed_at === "string" ? user.email_confirmed_at : null,
  };
}

function memberBinding(row: any): BuyerMemberBinding | null {
  if (!row) return null;
  return {
    memberId: String(row.id ?? row.member_id ?? ""),
    applicationId: String(row.application_id ?? ""),
    authUserId: String(row.auth_user_id ?? ""),
    email: String(row.email ?? ""),
    status: String(row.status ?? ""),
  };
}

async function requiredQuery<T>(query: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(String(error.message ?? "Supabase buyer activation query failed."));
  return data;
}

/**
 * Exact, unmounted adapter over the existing Supabase Auth project and the
 * canonical research_applications/research_members tables. The bind RPC is a
 * candidate in supabase/pack02-candidates and atomically writes the member row
 * plus immutable account-binding audit event. This adapter never creates a
 * password, alternate session, account table, or order record.
 */
export function createSupabaseBuyerActivationDeps(
  admin: SupabaseClient,
  anon: SupabaseClient,
  pendingInviteDelivery: {
    // actionUrl is single-use credential material: delivery must be immediate
    // or encrypted and must never log or persist it in plaintext.
    deliver(input: { recipient: string; actionUrl: string }): Promise<boolean>;
  },
): BuyerActivationDeps {
  const findMember = async (column: "application_id" | "auth_user_id", value: string) => {
    const data = await requiredQuery<any>(admin
      .from("research_members")
      .select("id,application_id,auth_user_id,email,status")
      .eq(column, value)
      .maybeSingle());
    return memberBinding(data);
  };

  return {
    async findApplication(applicationId): Promise<ActiveBuyerApplication | null> {
      const data = await requiredQuery<any>(admin
        .from("research_applications")
        .select("id,email,first_name,status")
        .eq("id", applicationId)
        .maybeSingle());
      if (!data) return null;
      return {
        id: String(data.id ?? ""),
        email: String(data.email ?? ""),
        firstName: String(data.first_name ?? ""),
        status: String(data.status ?? ""),
      };
    },
    async findAuthUserById(authUserId) {
      const { data, error } = await admin.auth.admin.getUserById(authUserId);
      if (error) throw new Error(error.message);
      return authIdentity(data.user);
    },
    async findAuthUserByEmail(normalizedEmail) {
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
    findMemberByApplicationId: (applicationId) => findMember("application_id", applicationId),
    findMemberByAuthUserId: (authUserId) => findMember("auth_user_id", authUserId),
    async bindActiveMember(input) {
      const data = await requiredQuery<any>((admin as any).rpc("research_bind_active_buyer_account", {
        p_application_id: input.applicationId,
        p_auth_user_id: input.authUserId,
        p_normalized_email: input.normalizedEmail,
        p_first_name: input.firstName,
        p_actor_label: input.actorLabel,
        p_activation_path: input.path,
      }));
      const binding = memberBinding(Array.isArray(data) ? data[0] : data);
      if (!binding) throw new Error("Canonical buyer binding RPC returned no row.");
      return binding;
    },
    async sendExistingUserAccessEmail(input) {
      const { error } = await anon.auth.resetPasswordForEmail(input.normalizedEmail, {
        redirectTo: input.redirectTo,
      });
      return !error;
    },
    async resendPendingAuthAccessEmail(input) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "invite",
        email: input.normalizedEmail,
        options: { redirectTo: input.redirectTo },
      });
      if (
        error
        || data.user.id !== input.authUserId
        || data.user.email?.trim().toLowerCase() !== input.normalizedEmail
        || !data.properties.action_link
      ) return false;
      return pendingInviteDelivery.deliver({
        recipient: input.normalizedEmail,
        actionUrl: data.properties.action_link,
      });
    },
    async inviteAuthUser(input) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(input.normalizedEmail, {
        redirectTo: input.redirectTo,
      });
      if (error || !data.user) throw new Error(error?.message ?? "Supabase secure invitation returned no user.");
      const identity = authIdentity(data.user);
      if (!identity) throw new Error("Supabase secure invitation returned an invalid user.");
      return identity;
    },
  };
}

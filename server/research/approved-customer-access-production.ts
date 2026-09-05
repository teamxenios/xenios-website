import { getSupabaseAdmin, getSupabaseAnon, supabaseConfigured } from "../supabase";
import { isRecoveryPurposeSession } from "./member-auth";
import { runOutboxTick } from "./outbox";
import type { ApprovedCustomerAccessDependencies } from "./approved-customer-access";

export function createApprovedCustomerAccessDependencies(): ApprovedCustomerAccessDependencies {
  async function rpc(name: string, input?: Record<string, unknown>) {
    if (!supabaseConfigured()) throw new Error("account access unavailable");
    const result = await getSupabaseAdmin().rpc(name, input);
    if (result.error) throw new Error("account access unavailable");
    return result.data;
  }
  return {
    authority: () => rpc("research_approved_customer_access_authority"),
    approve: (input) => rpc("research_admin_approve_customer_access", {
      p_actor_auth_user_id: input.actorAuthUserId, p_email: input.email,
      p_first_name: input.firstName, p_last_name: input.lastName, p_reason: input.reason,
      p_expected_application_id: input.expectedApplicationId, p_expected_updated_at: input.expectedUpdatedAt,
      p_idempotency_key: input.idempotencyKey,
    }),
    claim: (applicationId, authUserId) => rpc("research_claim_approved_customer_access", { p_application_id: applicationId, p_auth_user_id: authUserId }),
    async createAuth(email, password) {
      const result = await getSupabaseAdmin().auth.admin.createUser({ email, password, email_confirm: true });
      if (result.error) {
        return { kind: ["email_exists", "user_already_exists"].includes(result.error.code ?? "") ? "exists" : "failed" };
      }
      const user = result.data.user;
      if (!user?.email) return { kind: "failed" };
      return { kind: "created", userId: user.id, email: user.email, emailVerified: Boolean(user.email_confirmed_at) };
    },
    async verifySignIn(authorization) {
      const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!jwt || isRecoveryPurposeSession(jwt)) return null;
      const result = await getSupabaseAnon().auth.getUser(jwt);
      const user = result.data.user;
      if (result.error || !user?.email) return null;
      return { userId: user.id, email: user.email, emailVerified: Boolean(user.email_confirmed_at) };
    },
    kickOutbox: async () => { await runOutboxTick(); },
  };
}

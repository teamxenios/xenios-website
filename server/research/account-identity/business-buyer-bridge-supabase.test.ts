import { describe, expect, it, vi } from "vitest";
import { ROMAN_BUYER_ID, ROMAN_OPERATOR_EMAIL } from "./business-buyer-bridge";
import { createSupabaseBusinessBuyerActivationDeps } from "./business-buyer-bridge-supabase";

describe("Supabase business buyer activation adapter", () => {
  it("uses the canonical secure invite and maps the finalization RPC", async () => {
    const authUser = {
      id: "20ec822d-8123-4088-ac05-9c8f4b2da784",
      email: ROMAN_OPERATOR_EMAIL,
      email_confirmed_at: null,
    };
    const listUsers = vi.fn(async () => ({ data: { users: [] }, error: null }));
    const inviteUserByEmail = vi.fn(async () => ({ data: { user: authUser }, error: null }));
    const rpc = vi.fn(async () => ({ data: [{
      buyer_id: ROMAN_BUYER_ID,
      buyer_slug: "roman-health-marketplace",
      customer_ref: `eac_${"a".repeat(32)}`,
      price_profile: "KRIS_VOLUME_PARTNER",
      roles: ["buyer_owner", "buyer_operator"],
    }], error: null }));
    const deps = createSupabaseBusinessBuyerActivationDeps({
      auth: { admin: { listUsers, inviteUserByEmail } }, rpc,
    } as never);

    await expect(deps.findAuthByEmail(ROMAN_OPERATOR_EMAIL)).resolves.toBeNull();
    await expect(deps.inviteAuthUser(
      ROMAN_OPERATOR_EMAIL,
      "https://xeniostechnology.com/research/reset-password",
    )).resolves.toEqual({
      id: authUser.id,
      email: ROMAN_OPERATOR_EMAIL,
      emailConfirmedAt: null,
    });
    await expect(deps.finalizeClaim({
      buyerId: ROMAN_BUYER_ID,
      authUserId: authUser.id,
      email: ROMAN_OPERATOR_EMAIL,
      actorLabel: "authorized-operator",
    })).resolves.toMatchObject({
      buyerId: ROMAN_BUYER_ID,
      priceProfile: "KRIS_VOLUME_PARTNER",
    });
    expect(inviteUserByEmail).toHaveBeenCalledWith(ROMAN_OPERATOR_EMAIL, {
      redirectTo: "https://xeniostechnology.com/research/reset-password",
    });
    expect(rpc).toHaveBeenCalledWith("research_finalize_business_buyer_claim", {
      p_buyer_id: ROMAN_BUYER_ID,
      p_auth_user_id: authUser.id,
      p_normalized_email: ROMAN_OPERATOR_EMAIL,
      p_actor_label: "authorized-operator",
    });
  });

  it("fails closed when Supabase reports an error", async () => {
    const deps = createSupabaseBusinessBuyerActivationDeps({
      auth: { admin: {
        listUsers: vi.fn(async () => ({ data: { users: [] }, error: { message: "denied" } })),
      } },
    } as never);
    await expect(deps.findAuthByEmail(ROMAN_OPERATOR_EMAIL)).rejects.toThrow("denied");
  });
});

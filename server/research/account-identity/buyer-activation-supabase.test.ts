import { describe, expect, it, vi } from "vitest";
import { activateBuyerAccount } from "./buyer-activation";
import { createSupabaseBuyerActivationDeps } from "./buyer-activation-supabase";

const applicationId = "11111111-1111-4111-8111-111111111111";
const authUserId = "22222222-2222-4222-8222-222222222222";
const email = "verified.buyer@example.com";

function query(data: unknown) {
  const result: any = {
    select: vi.fn(() => result),
    eq: vi.fn(() => result),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return result;
}

describe("Supabase buyer activation adapter", () => {
  it("uses existing Supabase secure invitation and the canonical atomically audited binding RPC", async () => {
    const applicationQuery = query({
      id: applicationId,
      email,
      first_name: "Verified",
      status: "active",
    });
    const emptyMemberQuery = query(null);
    const listUsers = vi.fn(async () => ({ data: { users: [] }, error: null }));
    const inviteUserByEmail = vi.fn(async () => ({
      data: { user: { id: authUserId, email, email_confirmed_at: null } },
      error: null,
    }));
    const rpc = vi.fn(async () => ({
      data: [{
        id: "44444444-4444-4444-8444-444444444444",
        application_id: applicationId,
        auth_user_id: authUserId,
        email,
        status: "active",
      }],
      error: null,
    }));
    const admin: any = {
      from: vi.fn((table: string) => table === "research_applications" ? applicationQuery : emptyMemberQuery),
      rpc,
      auth: { admin: { listUsers, inviteUserByEmail, getUserById: vi.fn() } },
    };
    const anon: any = {
      auth: {
        resetPasswordForEmail: vi.fn(),
        resend: vi.fn(),
      },
    };
    const pendingInviteDelivery = { deliver: vi.fn(async () => true) };

    const result = await activateBuyerAccount(
      createSupabaseBuyerActivationDeps(admin, anon, pendingInviteDelivery),
      {
        path: "new_secure_invite",
        applicationId,
        canonicalEmail: email,
        actorLabel: "authorized-operator",
      },
      "https://xeniostechnology.com",
    );

    expect(result).toMatchObject({ ok: true, path: "new_user_invited", authUserId });
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 200 });
    expect(inviteUserByEmail).toHaveBeenCalledWith(email, {
      redirectTo: "https://xeniostechnology.com/research/reset-password",
    });
    expect(rpc).toHaveBeenCalledWith("research_bind_active_buyer_account", {
      p_application_id: applicationId,
      p_auth_user_id: authUserId,
      p_normalized_email: email,
      p_first_name: "Verified",
      p_actor_label: "authorized-operator",
      p_activation_path: "new_user_invited",
    });
    expect(anon.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("resends a pending invite only when the generated Supabase identity is the exact audited UID", async () => {
    const actionUrl = "https://project.supabase.co/auth/v1/verify?type=invite&token=one-time";
    const generateLink = vi.fn(async () => ({
      data: {
        user: { id: authUserId, email },
        properties: { action_link: actionUrl },
      },
      error: null,
    }));
    const delivery = { deliver: vi.fn(async () => true) };
    const admin: any = { auth: { admin: { generateLink } } };
    const deps = createSupabaseBuyerActivationDeps(admin, { auth: {} } as any, delivery);

    await expect(deps.resendPendingAuthAccessEmail({
      authUserId,
      normalizedEmail: email,
      redirectTo: "https://xeniostechnology.com/research/reset-password",
    })).resolves.toBe(true);
    expect(generateLink).toHaveBeenCalledWith({
      type: "invite",
      email,
      options: { redirectTo: "https://xeniostechnology.com/research/reset-password" },
    });
    expect(delivery.deliver).toHaveBeenCalledWith({ recipient: email, actionUrl });

    generateLink.mockResolvedValueOnce({
      data: {
        user: { id: "99999999-9999-4999-8999-999999999999", email },
        properties: { action_link: actionUrl },
      },
      error: null,
    });
    await expect(deps.resendPendingAuthAccessEmail({
      authUserId,
      normalizedEmail: email,
      redirectTo: "https://xeniostechnology.com/research/reset-password",
    })).resolves.toBe(false);
    expect(delivery.deliver).toHaveBeenCalledTimes(1);
  });

  it("binds an unconfirmed existing invite with the RPC resend mode before secure delivery", async () => {
    const applicationQuery = query({
      id: applicationId, email, first_name: "Verified", status: "active",
    });
    const emptyMemberQuery = query(null);
    const actionUrl = "https://project.supabase.co/auth/v1/verify?type=invite&token=one-time";
    const rpc = vi.fn(async () => ({
      data: [{
        id: "44444444-4444-4444-8444-444444444444",
        application_id: applicationId,
        auth_user_id: authUserId,
        email,
        status: "active",
      }],
      error: null,
    }));
    const admin: any = {
      from: vi.fn((table: string) => table === "research_applications" ? applicationQuery : emptyMemberQuery),
      rpc,
      auth: { admin: {
        getUserById: vi.fn(async () => ({
          data: { user: { id: authUserId, email, email_confirmed_at: null } },
          error: null,
        })),
        generateLink: vi.fn(async () => ({
          data: {
            user: { id: authUserId, email },
            properties: { action_link: actionUrl },
          },
          error: null,
        })),
      } },
    };
    const delivery = { deliver: vi.fn(async () => true) };
    const result = await activateBuyerAccount(
      createSupabaseBuyerActivationDeps(admin, { auth: {} } as any, delivery),
      {
        path: "existing_unconfirmed_resend",
        applicationId,
        canonicalEmail: email,
        actorLabel: "authorized-operator",
        authUserId,
      },
      "https://xeniostechnology.com",
    );
    expect(result).toMatchObject({ ok: true, path: "existing_invite_resent" });
    expect(rpc).toHaveBeenCalledWith("research_bind_active_buyer_account", expect.objectContaining({
      p_auth_user_id: authUserId,
      p_activation_path: "existing_invite_resent",
    }));
    expect(delivery.deliver).toHaveBeenCalledWith({ recipient: email, actionUrl });
  });
});

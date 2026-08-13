import { describe, expect, it, vi } from "vitest";
import { createSupabaseSponsoredB2BClaimDeps } from "./b2b-sponsored-claim-supabase";

function query(data: unknown[]) {
  const promise: any = Promise.resolve({ data, error: null });
  promise.select = vi.fn(() => promise);
  promise.ilike = vi.fn(() => promise);
  promise.eq = vi.fn(() => promise);
  return promise;
}

describe("createSupabaseSponsoredB2BClaimDeps", () => {
  it("inspects only the exact normalized email across canonical identity sources", async () => {
    const tables: Record<string, unknown[]> = {
      research_applications: [],
      research_members: [],
      research_b2b_sponsored_claims: [],
    };
    const admin: any = {
      auth: { admin: { listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })) } },
      from: vi.fn((name: string) => query(tables[name] ?? [])),
    };
    const deps = createSupabaseSponsoredB2BClaimDeps(admin, {} as any, vi.fn());
    await expect(deps.inspectExactEmail("info@romanhealthcollective.com")).resolves.toEqual({
      authUserIds: [], applicationIds: [], memberIds: [], sponsorshipIds: [],
    });
    expect(admin.from).toHaveBeenCalledWith("research_applications");
    expect(admin.from).toHaveBeenCalledWith("research_members");
    expect(admin.from).toHaveBeenCalledWith("research_b2b_sponsored_claims");
  });

  it("uses the actor-scoped RPC for preparation and the service RPC only for delivery acknowledgement", async () => {
    const row = {
      sponsorship_id: "20000000-0000-4000-8000-000000000002",
      application_id: "10000000-0000-4000-8000-000000000001",
      normalized_email: "info@romanhealthcollective.com",
      business_key: "roman-health-marketplace",
      business_display_name: "Roman Health Marketplace",
      state: "claim_prepared",
      profile_key: "KRIS_VOLUME_PARTNER",
      profile_version: 1,
      profile_effective_at: "2026-08-13T12:00:00.000Z",
    };
    const actor: any = { rpc: vi.fn(async () => ({ data: [row], error: null })) };
    const admin: any = { rpc: vi.fn(async () => ({ data: [{ ...row, state: "claim_sent" }], error: null })) };
    const deliver = vi.fn(async () => true);
    const deps = createSupabaseSponsoredB2BClaimDeps(admin, actor, deliver);

    await expect(deps.prepareSponsoredClaim({
      path: "new_sponsored_claim",
      email: "info@romanhealthcollective.com",
      firstName: "Kris",
      lastName: "Exact",
      country: "Exact",
      applicantType: "professional",
      businessKey: "roman-health-marketplace",
      businessDisplayName: "Roman Health Marketplace",
      roles: ["organization_owner", "business_buyer"],
      profileKey: "KRIS_VOLUME_PARTNER",
      profileVersion: 1,
      profileEffectiveAt: "2026-08-13T12:00:00.000Z",
    })).resolves.toMatchObject({ state: "claim_prepared" });
    expect(actor.rpc).toHaveBeenCalledWith("research_prepare_sponsored_b2b_claim", expect.any(Object));
    expect(admin.rpc).not.toHaveBeenCalled();

    await expect(deps.markClaimSent({
      sponsorshipId: row.sponsorship_id,
      applicationId: row.application_id,
    })).resolves.toMatchObject({ state: "claim_sent" });
    expect(admin.rpc).toHaveBeenCalledWith("research_mark_sponsored_b2b_claim_sent", expect.any(Object));
  });

  it("delegates claim delivery without accepting password material", async () => {
    const deliver = vi.fn(async () => true);
    const deps = createSupabaseSponsoredB2BClaimDeps({} as any, {} as any, deliver);
    await expect(deps.sendExistingAccountClaim({
      applicationId: "10000000-0000-4000-8000-000000000001",
      normalizedEmail: "info@romanhealthcollective.com",
      firstName: "Kris",
    })).resolves.toBe(true);
    expect(deliver).toHaveBeenCalledWith(expect.not.objectContaining({ password: expect.anything() }));
  });
});

import { describe, expect, it, vi } from "vitest";
import type { AccountIdentityStore, ProductionAccountIdentityOptions } from "./production-deps";
import { createProductionAccountIdentityDeps, createSupabaseAccountAuthVerifier } from "./production-deps";
import type { AccountIdentityDeps } from "./service";

const CLAIM_ID = "944a9541-53a5-4ff3-a6b7-71002a831822";
const ORG_ID = "e26bc7de-86df-4e70-8e82-964e3671d71c";

function store(): AccountIdentityStore {
  return {
    findPersonalAccount: vi.fn(async () => null),
    listOrganizationAccess: vi.fn(async () => []),
    getOrganizationAccess: vi.fn(async () => null),
    findCustomerByRef: vi.fn(async () => null),
    inspectCustomerClaimChallenge: vi.fn(async () => null),
    getOrganizationDashboard: vi.fn(async () => ({ profile: {} as never, users: [], orders: [], requests: [], openRequestAgainCount: 0 })),
    updateOrganizationProfile: vi.fn(async () => ({} as never)),
    inspectOrganizationInvitation: vi.fn(async () => null),
    findOrderForOrganization: vi.fn(async () => null),
    createRequestAgain: vi.fn(async () => ({ requestId: CLAIM_ID, replayed: false })),
    emitAudit: vi.fn(async () => undefined),
    insertCustomerClaimChallenge: vi.fn(async () => undefined),
    commitCustomerClaimHash: vi.fn(async () => "linked"),
    insertOrganizationInvitation: vi.fn(async () => undefined),
    commitOrganizationInvitationHash: vi.fn(async () => "accepted"),
    clearPasswordChangeRequirement: vi.fn(async () => true),
  };
}

function setup(overrides: Partial<ProductionAccountIdentityOptions> = {}) {
  const accountStore = store();
  const options: ProductionAccountIdentityOptions = {
    auth: { verifyAccessToken: vi.fn(async () => ({ userId: "auth-1", email: "Info@RomanHealthCollective.com", emailConfirmedAt: "2026-08-12T10:00:00Z" })) },
    store: accountStore,
    notifications: { deliver: vi.fn(async () => true) },
    passwordEvidence: { changedAfter: vi.fn(async () => "2026-08-12T12:01:00Z") },
    siteUrl: "https://account.xenios.test",
    now: () => new Date("2026-08-12T12:00:00Z"),
    id: () => CLAIM_ID,
    ...overrides,
  };
  return { deps: createProductionAccountIdentityDeps(options), options, store: accountStore };
}

describe("Pack 02 production dependency boundary", () => {
  it("adapts the existing Supabase getUser verifier without creating another auth system", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: "auth-1", email: "info@romanhealthcollective.com", email_confirmed_at: "2026-08-12T10:00:00Z" } },
      error: null,
    }));
    const verifier = createSupabaseAccountAuthVerifier({ auth: { getUser } });
    expect(await verifier.verifyAccessToken("provider-signed-jwt")).toEqual({
      userId: "auth-1",
      email: "info@romanhealthcollective.com",
      emailConfirmedAt: "2026-08-12T10:00:00Z",
    });
    expect(getUser).toHaveBeenCalledWith("provider-signed-jwt");
  });

  it("rejects unsafe link configuration and invalid TTLs before touching storage", () => {
    expect(() => setup({ siteUrl: "http://account.example.com" })).toThrow("HTTPS");
    expect(() => setup({ challengeTtlMs: Number.NaN })).toThrow("finite and positive");
  });

  it("accepts only a strict bearer token and preserves provider email-confirmation evidence", async () => {
    const { deps, options } = setup();
    expect(await deps.resolveAuthenticatedUser({ headers: { authorization: "Bearer signed.jwt.value" } })).toMatchObject({
      userId: "auth-1",
      email: "Info@RomanHealthCollective.com",
      emailVerified: true,
    });
    expect(options.auth.verifyAccessToken).toHaveBeenCalledWith("signed.jwt.value");
    expect(await deps.resolveAuthenticatedUser({ headers: { authorization: "Bearer token extra" } })).toBeNull();
  });

  it("treats an auth-provider error or missing user as unauthenticated", async () => {
    const rejected = createSupabaseAccountAuthVerifier({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: new Error("rejected") })) },
    });
    expect(await rejected.verifyAccessToken("rejected-token")).toBeNull();
  });

  it("rejects a Supabase recovery-purpose token before calling the auth provider", async () => {
    const payload = Buffer.from(JSON.stringify({ amr: [{ method: "otp" }] })).toString("base64url");
    const { deps, options } = setup();
    expect(await deps.resolveAuthenticatedUser({ headers: { authorization: `Bearer x.${payload}.x` } })).toBeNull();
    expect(options.auth.verifyAccessToken).not.toHaveBeenCalled();
  });

  it("persists only the claim hash before handing the raw action URL to delivery", async () => {
    const { deps, store, options } = setup();
    const result = await deps.issueCustomerClaimChallenge({
      userId: "auth-1",
      email: "info@romanhealthcollective.com",
      customerRef: `eac_${"a".repeat(32)}`,
      subject: { subjectType: "organization", organizationId: ORG_ID },
    });
    expect(result).toEqual({ claimId: CLAIM_ID, deliveryAccepted: true });
    const persisted = vi.mocked(store.insertCustomerClaimChallenge).mock.calls[0][0];
    expect(persisted.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(persisted)).not.toContain("?token=");
    const delivered = vi.mocked(options.notifications.deliver).mock.calls[0][0];
    expect(delivered.actionUrl).toContain(`claim=${CLAIM_ID}`);
    expect(delivered.actionUrl).toMatch(/[?&]token=[A-Za-z0-9_-]{40,}/);
  });

  it("reports failed delivery without deleting or exposing the persisted challenge", async () => {
    const notifications = { deliver: vi.fn(async () => { throw new Error("provider unavailable"); }) };
    const { deps, store } = setup({ notifications });
    const result = await deps.issueOrganizationInvitation({
      organizationId: ORG_ID,
      email: " Buyer@RomanDigital.io ",
      roles: ["business_buyer"],
      actorUserId: "auth-1",
    });
    expect(result).toEqual({ invitationId: CLAIM_ID, deliveryAccepted: false });
    expect(store.insertOrganizationInvitation).toHaveBeenCalledWith(expect.objectContaining({ email: "buyer@romandigital.io" }));
  });

  it("hashes confirmation tokens before the persistence/RPC boundary", async () => {
    const { deps, store } = setup();
    await deps.commitCustomerClaim({
      claimId: CLAIM_ID,
      challengeToken: "raw-customer-token-that-must-not-cross",
      userId: "auth-1",
      email: "info@romanhealthcollective.com",
      subject: { subjectType: "organization", organizationId: ORG_ID },
    });
    const committed = vi.mocked(store.commitCustomerClaimHash).mock.calls[0][0];
    expect(committed.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(committed)).not.toContain("raw-customer-token");

    await deps.commitOrganizationInvitation({
      invitationId: CLAIM_ID,
      invitationToken: "raw-invitation-token-that-must-not-cross",
      userId: "auth-1",
      email: "info@romanhealthcollective.com",
    });
    const invitation = vi.mocked(store.commitOrganizationInvitationHash).mock.calls[0][0];
    expect(invitation.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(invitation)).not.toContain("raw-invitation-token");
  });

  it("fails closed unless independent evidence proves a password update after the requirement", async () => {
    const passwordEvidence = { changedAfter: vi.fn(async () => null as string | null) };
    const { deps, store } = setup({ passwordEvidence });
    const input: Parameters<AccountIdentityDeps["completePasswordChange"]>[0] = {
      userId: "auth-1",
      membershipIds: ["membership-1"],
      requiredAfter: "2026-08-12T12:00:00Z",
    };
    expect(await deps.completePasswordChange(input)).toBe(false);
    expect(store.clearPasswordChangeRequirement).not.toHaveBeenCalled();
    passwordEvidence.changedAfter.mockResolvedValue("2026-08-12T12:00:01Z");
    expect(await deps.completePasswordChange(input)).toBe(true);
    expect(store.clearPasswordChangeRequirement).toHaveBeenCalledWith(expect.objectContaining({
      verifiedChangedAt: "2026-08-12T12:00:01Z",
    }));
    passwordEvidence.changedAfter.mockResolvedValue("not-a-date");
    vi.mocked(store.clearPasswordChangeRequirement).mockClear();
    expect(await deps.completePasswordChange(input)).toBe(false);
    expect(store.clearPasswordChangeRequirement).not.toHaveBeenCalled();
  });
});

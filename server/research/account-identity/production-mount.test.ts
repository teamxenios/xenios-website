import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessProfile } from "@shared/research/account-identity";
import type { AccountIdentityStore, SupabaseAuthClient } from "./production-deps";

const ORG = "e26bc7de-86df-4e70-8e82-964e3671d71c";
const CUSTOMER = `eac_${"a".repeat(32)}`;
const profile: BusinessProfile = { legalName: "Synthetic organization", displayName: "Synthetic organization", purchasingEmail: "buyer@example.test",
  billingEmail: "buyer@example.test", phone: null, taxIdLast4: null, purchaseOrderRequired: false, billingAddress: null, shippingAddress: null };
function makeStore() {
  return {
    findPersonalAccount: vi.fn(async () => ({ memberId: "synthetic-member", firstName: "Synthetic", lastName: "Buyer", status: "active" })),
    listOrganizationAccess: vi.fn(async () => []),
    getOrganizationAccess: vi.fn(async () => ({ organization: { id: ORG, slug: "synthetic", legalName: profile.legalName, displayName: profile.displayName, status: "active", roles: ["organization_owner"], passwordChangeRequired: false },
      profile, membershipId: "synthetic-membership", roles: ["organization_owner"], passwordChangeRequired: false, passwordChangeRequiredAt: null })),
    findCustomerByRef: vi.fn(async () => ({ customerRef: CUSTOMER, normalizedEmail: "buyer@example.test" })),
    inspectCustomerClaimChallenge: vi.fn(async () => null),
    getOrganizationDashboard: vi.fn(async () => ({ profile, users: [], orders: [], requests: [], openRequestAgainCount: 0 })),
    updateOrganizationProfile: vi.fn(async () => profile),
    inspectOrganizationInvitation: vi.fn(async () => null),
    findOrderForOrganization: vi.fn(async () => null),
    createRequestAgain: vi.fn(async () => ({ requestId: ORG, replayed: false })),
    emitAudit: vi.fn(async () => undefined),
    insertCustomerClaimChallenge: vi.fn(async () => undefined),
    commitCustomerClaimHash: vi.fn(async () => "invalid"),
    insertOrganizationInvitation: vi.fn(async () => undefined),
    commitOrganizationInvitationHash: vi.fn(async () => "invalid"),
    clearPasswordChangeRequirement: vi.fn(async () => false),
  };
}
const store = makeStore() as unknown as AccountIdentityStore;

vi.mock("./production-store", () => ({
  createSupabaseAccountIdentityStore: vi.fn(() => store),
}));

import {
  buildProductionAccountIdentityDependencies,
  createImmediateAccountNotificationDelivery,
  registerProductionAccountIdentityApi,
} from "./production-mount";

const admin = {} as any;
const anon = {
  auth: {
    getUser: vi.fn(async (_token: string): ReturnType<SupabaseAuthClient["auth"]["getUser"]> => ({ data: { user: null }, error: new Error("invalid") })),
  },
};
const verifiedUser = { id: "20ec822d-8123-4088-ac05-9c8f4b2da784", email: "buyer@example.test", email_confirmed_at: "2026-08-13T00:00:00Z" };
const bearer = `synthetic.${Buffer.from(JSON.stringify({ amr: [{ method: "password" }] })).toString("base64url")}.synthetic`;
const writePaths = [
  ["post", "/api/research/account/claims/request"],
  ["post", "/api/research/account/claims/confirm"],
  ["post", "/api/research/account/security/password-change-complete"],
  ["post", "/api/research/account/organization-invitations/accept"],
  ["patch", `/api/research/account/organizations/${ORG}/profile`],
  ["post", `/api/research/account/organizations/${ORG}/users/invitations`],
  ["post", `/api/research/account/organizations/${ORG}/orders/request-again`],
] as const;
const mutationsFlag = "RESEARCH_ACCOUNT_IDENTITY_MUTATIONS_ENABLED";
const issuanceFlag = "RESEARCH_ACCOUNT_IDENTITY_NOTICE_ISSUANCE_ENABLED";
function noStoreEffects() { for (const operation of Object.values(store)) expect(operation).not.toHaveBeenCalled(); }
beforeEach(() => {
  Object.assign(store, makeStore());
  anon.auth.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
  vi.stubEnv(mutationsFlag, undefined); vi.stubEnv(issuanceFlag, undefined);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("Pack02 production mount", () => {
  it("builds on the canonical Supabase clients and refuses unproven password evidence", async () => {
    const deps = buildProductionAccountIdentityDependencies({ admin, anon });
    expect(await deps.resolveAuthenticatedUser({ headers: { authorization: "Bearer invalid" } })).toBeNull();
    expect(await deps.completePasswordChange({
      userId: "00000000-0000-4000-8000-000000000001",
      membershipIds: ["00000000-0000-4000-8000-000000000002"],
      requiredAfter: "2026-08-13T00:00:00.000Z",
    })).toBe(false);
  });

  it("adds exactly the registrar's nine routes once", () => {
    const app = express();
    registerProductionAccountIdentityApi(app, { admin, anon });
    const routes = (app as any).router.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
    expect(routes).toEqual([
      "GET /api/research/account/context",
      "POST /api/research/account/claims/request",
      "POST /api/research/account/claims/confirm",
      "POST /api/research/account/security/password-change-complete",
      "POST /api/research/account/organization-invitations/accept",
      "GET /api/research/account/organizations/:organizationId/dashboard",
      "PATCH /api/research/account/organizations/:organizationId/profile",
      "POST /api/research/account/organizations/:organizationId/users/invitations",
      "POST /api/research/account/organizations/:organizationId/orders/request-again",
    ]);
    expect(new Set(routes).size).toBe(9);
  });

  it("fails invalid bearer authentication at the canonical verifier without account reads", async () => {
    store.findPersonalAccount = vi.fn(async () => null);
    store.listOrganizationAccess = vi.fn(async () => []);
    const app = express();
    registerProductionAccountIdentityApi(app, { admin, anon });
    const response = await request(app)
      .get("/api/research/account/context")
      .set("Authorization", "Bearer invalid");
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("AUTH_REQUIRED");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(store.findPersonalAccount).not.toHaveBeenCalled();
    expect(store.listOrganizationAccess).not.toHaveBeenCalled();
  });

  it("delivers action URLs immediately with a non-secret provider idempotency key", async () => {
    const send = vi.fn(async () => ({ data: { id: "provider-message-1" }, error: null }));
    const delivery = createImmediateAccountNotificationDelivery(async () => ({
      client: { emails: { send } } as never,
      fromEmail: "Xenios Research <research@xeniostechnology.com>",
      replyToEmail: "research@xeniostechnology.com",
    }));
    const actionUrl = "https://xeniostechnology.com/research/account/claim-history?claim=944a9541-53a5-4ff3-a6b7-71002a831822&token=raw-secret-token";
    await expect(delivery.deliver({
      kind: "customer_history_claim",
      recipient: "buyer@example.test",
      actionUrl,
      expiresAt: "2026-08-14T00:00:00.000Z",
    })).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: "buyer@example.test",
      text: expect.stringContaining(actionUrl),
    }), {
      idempotencyKey: "pack02-customer_history_claim-944a9541-53a5-4ff3-a6b7-71002a831822",
    });
    expect(JSON.stringify(send.mock.calls[0]?.[1])).not.toContain("raw-secret-token");
  });

  it("refuses malformed action URLs before resolving the provider", async () => {
    const resolveProvider = vi.fn();
    const delivery = createImmediateAccountNotificationDelivery(resolveProvider as never);
    await expect(delivery.deliver({
      kind: "organization_invitation",
      recipient: "buyer@example.test",
      actionUrl: "https://xeniostechnology.com/research/account/organization-invitation?token=secret-without-id",
      expiresAt: "2026-08-14T00:00:00.000Z",
    })).resolves.toBe(false);
    expect(resolveProvider).not.toHaveBeenCalled();
  });
});

describe("Pack02 production release switches", () => {
  it.each(writePaths)("defaults closed for %s %s before any store/password/provider access", async (method, path) => {
    anon.auth.getUser.mockResolvedValue({ data: { user: verifiedUser }, error: null });
    const deliver = vi.fn(async () => true); const changedAfter = vi.fn(async () => null);
    const app = express(); app.use(express.json());
    registerProductionAccountIdentityApi(app, { admin, anon, notifications: { deliver }, passwordEvidence: { changedAfter } });
    const response = await request(app)[method](path).set("Authorization", `Bearer ${bearer}`).send({ enabled: true, mutationsEnabled: true, noticeIssuanceEnabled: true });
    const claimWrite = path === "/api/research/account/claims/request" || path === "/api/research/account/claims/confirm";
    expect(response.status).toBe(503); expect(response.body).toEqual(claimWrite
      ? { ok: false, code: "HISTORY_LINKING_CLOSED", message: "History linking is not available yet." }
      : { ok: false, code: "SERVICE_UNAVAILABLE", message: "The account service is temporarily unavailable." });
    expect(anon.auth.getUser).toHaveBeenCalledTimes(1); expect(anon.auth.getUser).toHaveBeenCalledWith(bearer);
    noStoreEffects(); expect(deliver).not.toHaveBeenCalled(); expect(changedAfter).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "false", "TRUE", "True", "1", " true "])("requires the exact mutation env value true, refusing %j", async value => {
    vi.stubEnv(mutationsFlag, value); vi.stubEnv(issuanceFlag, "true");
    anon.auth.getUser.mockResolvedValue({ data: { user: verifiedUser }, error: null });
    const app = express(); app.use(express.json()); registerProductionAccountIdentityApi(app, { admin, anon });
    const result = await request(app).post(writePaths[2][1]).set("Authorization", `Bearer ${bearer}`).send({});
    expect(result.status).toBe(503); noStoreEffects();
  });
  it.each([undefined, "", "false", "TRUE", "True", "1", " true "])("requires independently exact notice env true before issuance, refusing %j", async value => {
    vi.stubEnv(mutationsFlag, "true"); vi.stubEnv(issuanceFlag, value);
    anon.auth.getUser.mockResolvedValue({ data: { user: verifiedUser }, error: null });
    const deliver = vi.fn(async () => true);
    const app = express(); app.use(express.json()); registerProductionAccountIdentityApi(app, { admin, anon, notifications: { deliver } });
    const result = await request(app).post(writePaths[0][1]).set("Authorization", `Bearer ${bearer}`).send({ customerRef: CUSTOMER, target: { subjectType: "personal" } });
    expect(result.status).toBe(503); noStoreEffects(); expect(deliver).not.toHaveBeenCalled();
  });
  it.each([
    { mutations: "false", issuance: "false" }, { mutations: "false", issuance: "true" },
    { mutations: "true", issuance: "false" }, { mutations: "true", issuance: "true" },
  ])("preserves production mutation/notice independence: %j", async flags => {
    vi.stubEnv(mutationsFlag, flags.mutations); vi.stubEnv(issuanceFlag, flags.issuance);
    anon.auth.getUser.mockResolvedValue({ data: { user: verifiedUser }, error: null });
    const deliver = vi.fn(async () => true);
    const app = express(); app.use(express.json()); registerProductionAccountIdentityApi(app, { admin, anon, notifications: { deliver } });
    const profileResult = await request(app).patch(writePaths[4][1]).set("Authorization", `Bearer ${bearer}`).send({ displayName: "Updated name" });
    expect(profileResult.status).toBe(flags.mutations === "true" ? 200 : 503);
    const claimResult = await request(app).post(writePaths[0][1]).set("Authorization", `Bearer ${bearer}`).send({ customerRef: CUSTOMER, target: { subjectType: "personal" } });
    const inviteResult = await request(app).post(writePaths[5][1]).set("Authorization", `Bearer ${bearer}`).send({ email: "invitee@example.test", roles: ["business_buyer"] });
    const enabled = flags.mutations === "true" && flags.issuance === "true";
    expect(claimResult.status).toBe(enabled ? 200 : 503); expect(inviteResult.status).toBe(enabled ? 200 : 503);
    if (enabled) {
      expect(store.insertCustomerClaimChallenge).toHaveBeenCalledTimes(1); expect(store.insertOrganizationInvitation).toHaveBeenCalledTimes(1);
      expect(deliver).toHaveBeenCalledTimes(2);
      expect(vi.mocked(store.insertCustomerClaimChallenge).mock.invocationCallOrder[0]).toBeLessThan(deliver.mock.invocationCallOrder[0]);
      expect(vi.mocked(store.insertOrganizationInvitation).mock.invocationCallOrder[0]).toBeLessThan(deliver.mock.invocationCallOrder[1]);
    } else {
      expect(store.insertCustomerClaimChallenge).not.toHaveBeenCalled(); expect(store.insertOrganizationInvitation).not.toHaveBeenCalled(); expect(deliver).not.toHaveBeenCalled();
    }
  });
  it("keeps canonical anonymous/unverified denial and context reads independent of activation", async () => {
    const app = express(); app.use(express.json()); registerProductionAccountIdentityApi(app, { admin, anon });
    const anonymous = await request(app).post(writePaths[0][1]).send({});
    expect(anonymous.status).toBe(401); expect(anon.auth.getUser).not.toHaveBeenCalled(); noStoreEffects();
    anon.auth.getUser.mockResolvedValue({ data: { user: { ...verifiedUser, email_confirmed_at: null } }, error: null });
    const unverified = await request(app).post(writePaths[0][1]).set("Authorization", `Bearer ${bearer}`).send({});
    expect(unverified.status).toBe(403); expect(unverified.body.code).toBe("EMAIL_VERIFICATION_REQUIRED"); noStoreEffects();
    anon.auth.getUser.mockResolvedValue({ data: { user: verifiedUser }, error: null });
    const context = await request(app).get("/api/research/account/context").set("Authorization", `Bearer ${bearer}`);
    expect(context.status).toBe(200); expect(context.body.personal.memberId).toBe("synthetic-member");
    expect(store.findPersonalAccount).toHaveBeenCalledTimes(1); expect(store.listOrganizationAccess).toHaveBeenCalledTimes(1);
    expect(store.insertCustomerClaimChallenge).not.toHaveBeenCalled(); expect(store.insertOrganizationInvitation).not.toHaveBeenCalled();
  });
  it("snapshots closed production switches rather than accepting later ambient activation", async () => {
    anon.auth.getUser.mockResolvedValue({ data: { user: verifiedUser }, error: null });
    const app = express(); app.use(express.json()); registerProductionAccountIdentityApi(app, { admin, anon });
    vi.stubEnv(mutationsFlag, "true"); vi.stubEnv(issuanceFlag, "true");
    const result = await request(app).post(writePaths[0][1]).set("Authorization", `Bearer ${bearer}`).send({ customerRef: CUSTOMER, target: { subjectType: "personal" } });
    expect(result.status).toBe(503); noStoreEffects();
  });
});

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { BusinessProfile } from "@shared/research/account-identity";
import type { AccountIdentityDeps, OrganizationAccessRecord } from "./service";
import { registerAccountIdentityApi, type AccountIdentityActivation } from "./routes";

function deps(): AccountIdentityDeps {
  return {
    resolveAuthenticatedUser: vi.fn(async () => ({ userId: "u1", email: "buyer@example.com", emailVerified: false })),
    findPersonalAccount: vi.fn(async () => null),
    listOrganizationAccess: vi.fn(async () => []),
    getOrganizationAccess: vi.fn(async () => null),
    findCustomerByRef: vi.fn(async () => null),
    issueCustomerClaimChallenge: vi.fn(async () => ({ claimId: "00000000-0000-4000-8000-000000000000", deliveryAccepted: true })),
    inspectCustomerClaimChallenge: vi.fn(async () => null),
    commitCustomerClaim: vi.fn(async () => "invalid"),
    getOrganizationDashboard: vi.fn(async () => { throw new Error("not called"); }),
    updateOrganizationProfile: vi.fn(async () => { throw new Error("not called"); }),
    issueOrganizationInvitation: vi.fn(async () => ({ invitationId: "00000000-0000-4000-8000-000000000000", deliveryAccepted: true })),
    inspectOrganizationInvitation: vi.fn(async () => null),
    commitOrganizationInvitation: vi.fn(async () => "invalid"),
    completePasswordChange: vi.fn(async () => false),
    findOrderForOrganization: vi.fn(async () => null),
    createRequestAgain: vi.fn(async () => ({ requestId: "00000000-0000-4000-8000-000000000000", replayed: false })),
    emitAudit: vi.fn(async () => undefined),
  };
}

describe("account identity routes", () => {
  it("returns machine-readable verification denial with private no-store headers", async () => {
    const app = express();
    app.use(express.json());
    registerAccountIdentityApi(app, deps());
    const response = await request(app).get("/api/research/account/context").set("Authorization", "Bearer test");
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ ok: false, code: "EMAIL_VERIFICATION_REQUIRED" });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers.vary).toContain("Authorization");
  });

  it("fails closed with a redacted JSON error when an integration dependency throws", async () => {
    const subject = deps();
    vi.mocked(subject.resolveAuthenticatedUser).mockRejectedValue(new Error("provider secret diagnostic"));
    const app = express();
    app.use(express.json());
    registerAccountIdentityApi(app, subject);
    const response = await request(app).get("/api/research/account/context").set("Authorization", "Bearer test");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: "The account service is temporarily unavailable.",
    });
    expect(JSON.stringify(response.body)).not.toContain("provider secret diagnostic");
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
});

const ORG = "e26bc7de-86df-4e70-8e82-964e3671d71c";
const CLAIM = "944a9541-53a5-4ff3-a6b7-71002a831822";
const CUSTOMER = `eac_${"a".repeat(32)}`;
const profile: BusinessProfile = { legalName: "Synthetic organization", displayName: "Synthetic organization", purchasingEmail: "buyer@example.com",
  billingEmail: "buyer@example.com", phone: null, taxIdLast4: null, purchaseOrderRequired: false, billingAddress: null, shippingAddress: null };
const access = (passwordChangeRequired = false): OrganizationAccessRecord => ({
  organization: { id: ORG, slug: "synthetic", legalName: profile.legalName, displayName: profile.displayName, status: "active", roles: ["organization_owner"], passwordChangeRequired },
  profile, membershipId: "synthetic-membership", roles: ["organization_owner"], passwordChangeRequired,
  passwordChangeRequiredAt: passwordChangeRequired ? "2026-08-13T00:00:00Z" : null,
});
const writes = [
  { method: "post", path: "/api/research/account/claims/request", issuance: true, effect: "issueCustomerClaimChallenge", body: { customerRef: CUSTOMER, target: { subjectType: "personal" } } },
  { method: "post", path: "/api/research/account/claims/confirm", issuance: false, effect: "commitCustomerClaim", body: { claimId: CLAIM, challengeToken: "synthetic-proof-token-12345", expectedSubjectType: "personal" } },
  { method: "post", path: "/api/research/account/security/password-change-complete", issuance: false, effect: "completePasswordChange", body: {} },
  { method: "post", path: "/api/research/account/organization-invitations/accept", issuance: false, effect: "commitOrganizationInvitation", body: { invitationId: CLAIM, invitationToken: "synthetic-invitation-proof-12345" } },
  { method: "patch", path: `/api/research/account/organizations/${ORG}/profile`, issuance: false, effect: "updateOrganizationProfile", body: { displayName: "Updated name" } },
  { method: "post", path: `/api/research/account/organizations/${ORG}/users/invitations`, issuance: true, effect: "issueOrganizationInvitation", body: { email: "invited@example.com", roles: ["business_buyer"] } },
  { method: "post", path: `/api/research/account/organizations/${ORG}/orders/request-again`, issuance: false, effect: "createRequestAgain", body: { source: "early_access_placement", sourceOrderId: "synthetic-order", note: null } },
] as const;
function verifiedDeps(passwordChangeRequired = false): AccountIdentityDeps {
  const subject = deps();
  vi.mocked(subject.resolveAuthenticatedUser).mockResolvedValue({ userId: "synthetic-user", email: "buyer@example.com", emailVerified: true });
  vi.mocked(subject.findPersonalAccount).mockResolvedValue({ memberId: "synthetic-member", firstName: "Synthetic", lastName: "Buyer", status: "active" });
  vi.mocked(subject.listOrganizationAccess).mockResolvedValue([access(passwordChangeRequired)]);
  vi.mocked(subject.getOrganizationAccess).mockResolvedValue(access());
  vi.mocked(subject.findCustomerByRef).mockResolvedValue({ customerRef: CUSTOMER, normalizedEmail: "buyer@example.com" });
  vi.mocked(subject.inspectCustomerClaimChallenge).mockResolvedValue({ customerRef: CUSTOMER, email: "buyer@example.com", subject: { subjectType: "personal", memberId: "synthetic-member" } });
  vi.mocked(subject.commitCustomerClaim).mockResolvedValue("linked");
  vi.mocked(subject.getOrganizationDashboard).mockResolvedValue({ profile, users: [], orders: [], requests: [], openRequestAgainCount: 0 });
  vi.mocked(subject.updateOrganizationProfile).mockResolvedValue(profile);
  vi.mocked(subject.inspectOrganizationInvitation).mockResolvedValue({ organizationId: ORG, email: "buyer@example.com", roles: ["business_buyer"] });
  vi.mocked(subject.commitOrganizationInvitation).mockResolvedValue("accepted");
  vi.mocked(subject.completePasswordChange).mockResolvedValue(true);
  vi.mocked(subject.findOrderForOrganization).mockResolvedValue({ ownership: { organizationId: ORG, basis: "verified_customer_claim" }, source: "early_access_placement",
    sourceOrderId: "synthetic-order", orderNumber: "SYNTHETIC", state: "delivered", reviewTriggers: [], placedAt: "2026-08-01T00:00:00Z", totalCents: 0, currency: "usd", lines: [], invoice: null, payments: [], tracking: [], canRequestAgain: true });
  return subject;
}
function mount(subject: AccountIdentityDeps, activation?: AccountIdentityActivation) {
  const app = express(); app.use(express.json()); registerAccountIdentityApi(app, subject, activation); return app;
}
function noAccountEffects(subject: AccountIdentityDeps) {
  for (const [name, operation] of Object.entries(subject)) if (name !== "resolveAuthenticatedUser") expect(operation, name).not.toHaveBeenCalled();
}
const unavailable = { ok: false, code: "SERVICE_UNAVAILABLE", message: "The account service is temporarily unavailable." };
const historyClosed = { ok: false, code: "HISTORY_LINKING_CLOSED", message: "History linking is not available yet." };
const closedResponse = (path: string) => path === writes[0].path || path === writes[1].path ? historyClosed : unavailable;

describe("account identity default-closed activation", () => {
  it.each(writes)("closes $method $path before all account effects while retaining verified Auth", async write => {
    const subject = verifiedDeps();
    const result = await request(mount(subject))[write.method](write.path).set("Authorization", "Bearer canonical-fixture").send(write.body);
    expect(result.status).toBe(503); expect(result.body).toEqual(closedResponse(write.path));
    expect(result.headers["cache-control"]).toBe("private, no-store"); expect(result.headers.pragma).toBe("no-cache"); expect(result.headers.vary).toBe("Authorization, Cookie");
    expect(subject.resolveAuthenticatedUser).toHaveBeenCalledTimes(1); noAccountEffects(subject);
  });
  it.each(writes)("preserves anonymous 401 and unverified 403 on closed $path even for invalid bodies", async write => {
    for (const verified of [null, { userId: "u", email: "buyer@example.com", emailVerified: false }]) {
      const subject = verifiedDeps(); vi.mocked(subject.resolveAuthenticatedUser).mockResolvedValue(verified);
      const result = await request(mount(subject))[write.method](write.path).send({ deliberately: "invalid" });
      expect(result.status).toBe(verified ? 403 : 401);
      expect(result.body).toEqual(verified ? { ok: false, code: "EMAIL_VERIFICATION_REQUIRED", message: "Verify your email address before continuing." } : { ok: false, code: "AUTH_REQUIRED", message: "Sign in is required." });
      noAccountEffects(subject);
    }
  });
  it.each([
    { mutationsEnabled: false, noticeIssuanceEnabled: false },
    { mutationsEnabled: false, noticeIssuanceEnabled: true },
    { mutationsEnabled: true, noticeIssuanceEnabled: false },
    { mutationsEnabled: true, noticeIssuanceEnabled: true },
  ])("keeps the two-switch truth table independent: %j", async activation => {
    for (const write of writes) {
      const subject = verifiedDeps(write.effect === "completePasswordChange");
      const result = await request(mount(subject, activation))[write.method](write.path).send(write.body);
      const enabled = activation.mutationsEnabled && (!write.issuance || activation.noticeIssuanceEnabled);
      expect(result.status, write.path).toBe(enabled ? 200 : 503);
      if (enabled) { expect(result.body.ok).toBe(true); expect(subject[write.effect]).toHaveBeenCalledTimes(1); }
      else { expect(result.body).toEqual(closedResponse(write.path)); noAccountEffects(subject); }
      expect(subject.resolveAuthenticatedUser).toHaveBeenCalledTimes(1);
    }
  });
  it.each(["true", "false", 1, {}, undefined])("refuses a truthy/non-boolean registrar activation: %j", async value => {
    for (const field of ["mutationsEnabled", "noticeIssuanceEnabled"]) {
      const subject = verifiedDeps();
      const activation = { mutationsEnabled: true, noticeIssuanceEnabled: true, [field]: value } as unknown as AccountIdentityActivation;
      const result = await request(mount(subject, activation)).post(writes[0].path).send(writes[0].body);
      expect(result.status).toBe(503); noAccountEffects(subject);
    }
  });
  it("does not activate from later options mutation, request flags, query or headers", async () => {
    const subject = verifiedDeps(); const activation = { mutationsEnabled: false, noticeIssuanceEnabled: false }; const app = mount(subject, activation);
    activation.mutationsEnabled = true; activation.noticeIssuanceEnabled = true;
    const result = await request(app).post(`${writes[0].path}?mutationsEnabled=true&noticeIssuanceEnabled=true`)
      .set("X-Research-Account-Identity-Mutations-Enabled", "true").set("X-Research-Account-Identity-Notice-Issuance-Enabled", "true")
      .send({ ...writes[0].body, mutationsEnabled: true, noticeIssuanceEnabled: true });
    expect(result.status).toBe(503); expect(result.body).toEqual(historyClosed); noAccountEffects(subject);
  });
  it("redacts canonical verifier exceptions without calling the service or stores", async () => {
    const subject = verifiedDeps(); vi.mocked(subject.resolveAuthenticatedUser).mockRejectedValue(new Error("secret provider JWT challenge"));
    const result = await request(mount(subject)).post(writes[0].path).send(writes[0].body);
    expect(result.status).toBe(503); expect(result.body).toEqual(unavailable); noAccountEffects(subject);
  });
  it.each([writes[0], writes[1]])("keeps an enabled $path operation failure uncertain rather than claiming closure", async write => {
    const subject = verifiedDeps();
    if (write.path === writes[0].path) vi.mocked(subject.issueCustomerClaimChallenge).mockRejectedValue(new Error("PRIVATE_PROVIDER_SENTINEL"));
    else vi.mocked(subject.commitCustomerClaim).mockRejectedValue(new Error("PRIVATE_DATABASE_SENTINEL"));
    const result = await request(mount(subject, { mutationsEnabled: true, noticeIssuanceEnabled: true })).post(write.path).send(write.body);
    expect(result.status).toBe(503); expect(result.body).toEqual(unavailable);
    expect(subject[write.effect]).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.body)).not.toContain("PRIVATE_");
  });
  it.each([writes[0], writes[1]])("does not classify a failed verifier on closed $path as deterministic closure", async write => {
    const subject = verifiedDeps(); vi.mocked(subject.resolveAuthenticatedUser).mockRejectedValue(new Error("PRIVATE_AUTH_SENTINEL"));
    const result = await request(mount(subject)).post(write.path).send(write.body);
    expect(result.status).toBe(503); expect(result.body).toEqual(unavailable); noAccountEffects(subject);
  });
  it("keeps context and authorized dashboard reads available with both switches closed", async () => {
    const subject = verifiedDeps(); const app = mount(subject);
    const context = await request(app).get("/api/research/account/context");
    const dashboard = await request(app).get(`/api/research/account/organizations/${ORG}/dashboard`);
    expect(context.status).toBe(200); expect(context.body.personal.memberId).toBe("synthetic-member");
    expect(dashboard.status).toBe(200); expect(dashboard.body.organization.id).toBe(ORG);
    expect(subject.findPersonalAccount).toHaveBeenCalledTimes(1); expect(subject.getOrganizationDashboard).toHaveBeenCalledWith(ORG);
    expect(subject.issueCustomerClaimChallenge).not.toHaveBeenCalled(); expect(subject.issueOrganizationInvitation).not.toHaveBeenCalled(); expect(subject.emitAudit).not.toHaveBeenCalled();
  });
  it("does not make enabled issuance an Auth or verification bypass", async () => {
    for (const user of [null, { userId: "u", email: "buyer@example.com", emailVerified: false }]) {
      const subject = verifiedDeps(); vi.mocked(subject.resolveAuthenticatedUser).mockResolvedValue(user);
      const result = await request(mount(subject, { mutationsEnabled: true, noticeIssuanceEnabled: true })).post(writes[0].path).send(writes[0].body);
      expect(result.status).toBe(user ? 403 : 401); noAccountEffects(subject);
    }
  });
  it("retains enabled service role and initial-password denials rather than granting new authority", async () => {
    const subject = verifiedDeps(); const app = mount(subject, { mutationsEnabled: true, noticeIssuanceEnabled: true });
    vi.mocked(subject.getOrganizationAccess).mockResolvedValue({ ...access(), roles: ["billing_viewer"] });
    const deniedRole = await request(app).patch(writes[4].path).send(writes[4].body);
    expect(deniedRole.status).toBe(403); expect(deniedRole.body.code).toBe("ORGANIZATION_ROLE_REQUIRED");
    vi.mocked(subject.getOrganizationAccess).mockResolvedValue({ ...access(true) });
    const deniedPassword = await request(app).post(writes[5].path).send(writes[5].body);
    expect(deniedPassword.status).toBe(428); expect(deniedPassword.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect(subject.updateOrganizationProfile).not.toHaveBeenCalled(); expect(subject.issueOrganizationInvitation).not.toHaveBeenCalled();
  });
  it("retains the enabled stored-challenge personal constraint and verified-email match", async () => {
    const subject = verifiedDeps(); const app = mount(subject, { mutationsEnabled: true, noticeIssuanceEnabled: true });
    vi.mocked(subject.inspectCustomerClaimChallenge).mockResolvedValue({ customerRef: CUSTOMER, email: "buyer@example.com", subject: { subjectType: "organization", organizationId: ORG } });
    const wrongSubject = await request(app).post(writes[1].path).send(writes[1].body);
    expect(wrongSubject.status).toBe(400); expect(wrongSubject.body.code).toBe("CLAIM_CHALLENGE_INVALID"); expect(subject.commitCustomerClaim).not.toHaveBeenCalled();
    vi.mocked(subject.findCustomerByRef).mockResolvedValue({ customerRef: CUSTOMER, normalizedEmail: "different@example.com" });
    const wrongEmail = await request(app).post(writes[0].path).send(writes[0].body);
    expect(wrongEmail.status).toBe(403); expect(wrongEmail.body.code).toBe("CUSTOMER_EMAIL_MISMATCH"); expect(subject.issueCustomerClaimChallenge).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessProfile, OrganizationDashboardDto } from "@shared/research/account-identity";
import type { AccountIdentityDeps, OrganizationAccessRecord } from "./service";
import {
  acceptOrganizationInvitation,
  acknowledgePasswordChange,
  confirmCustomerHistoryClaim,
  getAccountContext,
  getBusinessDashboard,
  inviteOrganizationUser,
  requestCustomerHistoryClaim,
  requestOrderAgain,
} from "./service";

const ORG_ID = "e26bc7de-86df-4e70-8e82-964e3671d71c";
const MEMBER_ID = "c57b750c-5c3a-4181-8ec3-11a6e698438d";
const CLAIM_ID = "944a9541-53a5-4ff3-a6b7-71002a831822";
const CUSTOMER_REF = `eac_${"a".repeat(32)}`;
const ROMAN_DIGITAL_AUTH_UID = "20ec822d-8123-4088-ac05-9c8f4b2da784";

const profile: BusinessProfile = {
  legalName: "Roman Digital",
  displayName: "Roman Digital",
  purchasingEmail: "info@romanhealthcollective.com",
  billingEmail: "info@romanhealthcollective.com",
  phone: null,
  taxIdLast4: null,
  purchaseOrderRequired: false,
  billingAddress: null,
  shippingAddress: null,
};

function access(overrides: Partial<OrganizationAccessRecord> = {}): OrganizationAccessRecord {
  return {
    organization: {
      id: ORG_ID,
      slug: "roman-digital",
      legalName: "Roman Digital",
      displayName: "Roman Digital",
      status: "active",
      roles: ["organization_owner", "business_buyer"],
      passwordChangeRequired: false,
    },
    profile,
    membershipId: "membership-1",
    roles: ["organization_owner", "business_buyer"],
    passwordChangeRequired: false,
    passwordChangeRequiredAt: null,
    ...overrides,
  };
}

function dashboard(): Omit<OrganizationDashboardDto, "organization"> {
  return { profile, users: [], orders: [], requests: [], openRequestAgainCount: 0 };
}

function deps(): AccountIdentityDeps {
  const organizationAccess = access();
  return {
    resolveAuthenticatedUser: vi.fn(async () => ({
      userId: ROMAN_DIGITAL_AUTH_UID,
      email: "Info@RomanHealthCollective.com",
      emailVerified: true,
    })),
    findPersonalAccount: vi.fn(async () => ({ memberId: MEMBER_ID, firstName: "Kris", lastName: "Lopez", status: "active" })),
    listOrganizationAccess: vi.fn(async () => [organizationAccess]),
    getOrganizationAccess: vi.fn(async () => organizationAccess),
    findCustomerByRef: vi.fn(async () => ({ customerRef: CUSTOMER_REF, normalizedEmail: "info@romanhealthcollective.com" })),
    issueCustomerClaimChallenge: vi.fn(async () => ({ claimId: CLAIM_ID, deliveryAccepted: true })),
    inspectCustomerClaimChallenge: vi.fn(async () => ({
      customerRef: CUSTOMER_REF,
      email: "info@romanhealthcollective.com",
      subject: { subjectType: "organization", organizationId: ORG_ID },
    })),
    commitCustomerClaim: vi.fn(async () => "linked"),
    getOrganizationDashboard: vi.fn(async () => dashboard()),
    updateOrganizationProfile: vi.fn(async () => profile),
    issueOrganizationInvitation: vi.fn(async () => ({ invitationId: CLAIM_ID, deliveryAccepted: true })),
    inspectOrganizationInvitation: vi.fn(async () => ({
      organizationId: ORG_ID,
      email: "info@romanhealthcollective.com",
      roles: ["business_buyer"],
    })),
    commitOrganizationInvitation: vi.fn(async () => "accepted"),
    completePasswordChange: vi.fn(async () => true),
    findOrderForOrganization: vi.fn(async () => ({
      ownership: { organizationId: ORG_ID, basis: "verified_customer_claim" },
      source: "early_access_placement",
      sourceOrderId: "placement-1",
      orderNumber: "XEA-1",
      state: "delivered",
      reviewTriggers: [],
      placedAt: "2026-08-01T00:00:00.000Z",
      totalCents: 10000,
      currency: "usd",
      lines: [],
      invoice: null,
      payments: [],
      tracking: [],
      canRequestAgain: true,
    })),
    createRequestAgain: vi.fn(async () => ({ requestId: CLAIM_ID, replayed: false })),
    emitAudit: vi.fn(async () => undefined),
  };
}

describe("Pack 02 account identity service", () => {
  let subject: AccountIdentityDeps;
  beforeEach(() => { subject = deps(); });

  it("requires Supabase-confirmed email before returning any account context", async () => {
    vi.mocked(subject.resolveAuthenticatedUser).mockResolvedValue({ userId: "u", email: "info@romanhealthcollective.com", emailVerified: false });
    expect(await getAccountContext(subject, {})).toMatchObject({ ok: false, code: "EMAIL_VERIFICATION_REQUIRED" });
    expect(subject.findPersonalAccount).not.toHaveBeenCalled();
    expect(subject.listOrganizationAccess).not.toHaveBeenCalled();
  });

  it("projects personal and organization access from one Supabase identity", async () => {
    const result = await getAccountContext(subject, {});
    expect(result).toMatchObject({
      ok: true,
      value: {
        auth: { email: "info@romanhealthcollective.com", emailVerified: true },
        personal: { memberId: MEMBER_ID },
        organizations: [{ id: ORG_ID, roles: ["organization_owner", "business_buyer"] }],
      },
    });
  });

  it("never accepts customerRef alone: mismatched verified email is refused before challenge issuance", async () => {
    vi.mocked(subject.findCustomerByRef).mockResolvedValue({ customerRef: CUSTOMER_REF, normalizedEmail: "somebody@example.com" });
    const result = await requestCustomerHistoryClaim(subject, {}, {
      customerRef: CUSTOMER_REF,
      target: { subjectType: "organization", organizationId: ORG_ID },
    });
    expect(result).toMatchObject({ ok: false, code: "CUSTOMER_EMAIL_MISMATCH" });
    expect(subject.issueCustomerClaimChallenge).not.toHaveBeenCalled();
    expect(subject.emitAudit).toHaveBeenCalledWith("research.account.claim_refused", expect.any(Object));
  });

  it("requires both matching verified email and a consumed one-time challenge before binding", async () => {
    const requested = await requestCustomerHistoryClaim(subject, {}, {
      customerRef: CUSTOMER_REF,
      target: { subjectType: "organization", organizationId: ORG_ID },
    });
    expect(requested).toMatchObject({ ok: true, value: { claimId: CLAIM_ID } });

    const confirmed = await confirmCustomerHistoryClaim(subject, {}, {
      claimId: CLAIM_ID,
      challengeToken: "a".repeat(40),
    });
    expect(confirmed).toMatchObject({ ok: true, value: { customerRef: CUSTOMER_REF, linked: true } });
    expect(subject.commitCustomerClaim).toHaveBeenCalledWith(expect.objectContaining({
      claimId: CLAIM_ID,
      challengeToken: "a".repeat(40),
      subject: { subjectType: "organization", organizationId: ORG_ID },
      email: "info@romanhealthcollective.com",
    }));
  });

  it("refuses a consumed challenge whose target no longer matches the actor's authorized subject", async () => {
    vi.mocked(subject.findPersonalAccount).mockResolvedValue(null);
    vi.mocked(subject.inspectCustomerClaimChallenge).mockResolvedValue({
      customerRef: CUSTOMER_REF,
      email: "info@romanhealthcollective.com",
      subject: { subjectType: "personal", memberId: MEMBER_ID },
    });
    const result = await confirmCustomerHistoryClaim(subject, {}, { claimId: CLAIM_ID, challengeToken: "b".repeat(40) });
    expect(result).toMatchObject({ ok: false, code: "ACCOUNT_NOT_FOUND" });
    expect(subject.commitCustomerClaim).not.toHaveBeenCalled();
  });

  it("gates organization data and writes behind the initial password-change requirement", async () => {
    const required = access({ passwordChangeRequired: true, passwordChangeRequiredAt: "2026-08-12T12:00:00.000Z" });
    vi.mocked(subject.getOrganizationAccess).mockResolvedValue(required);
    expect(await getBusinessDashboard(subject, {}, ORG_ID)).toMatchObject({ ok: false, code: "PASSWORD_CHANGE_REQUIRED" });
    expect(await inviteOrganizationUser(subject, {}, {
      organizationId: ORG_ID,
      email: "buyer@romandigital.io",
      roles: ["business_buyer"],
    })).toMatchObject({ ok: false, code: "PASSWORD_CHANGE_REQUIRED" });
  });

  it("clears the initial-password flag only when the auth-backed dependency proves a later password update", async () => {
    vi.mocked(subject.listOrganizationAccess).mockResolvedValue([
      access({ passwordChangeRequired: true, passwordChangeRequiredAt: "2026-08-12T12:00:00.000Z" }),
    ]);
    vi.mocked(subject.completePasswordChange).mockResolvedValue(false);
    expect(await acknowledgePasswordChange(subject, {})).toMatchObject({ ok: false, code: "PASSWORD_CHANGE_REQUIRED" });
    vi.mocked(subject.completePasswordChange).mockResolvedValue(true);
    expect(await acknowledgePasswordChange(subject, {})).toEqual({ ok: true, value: { cleared: true } });
    expect(subject.completePasswordChange).toHaveBeenCalledWith(expect.objectContaining({ requiredAfter: "2026-08-12T12:00:00.000Z" }));
  });

  it("allows buyers to create an idempotent request intent without creating a second order", async () => {
    const result = await requestOrderAgain(subject, {}, {
      organizationId: ORG_ID,
      source: "early_access_placement",
      sourceOrderId: "placement-1",
      note: "Same quantities",
    });
    expect(result).toMatchObject({ ok: true, value: { requestId: CLAIM_ID, replayed: false } });
    expect(subject.createRequestAgain).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      actorUserId: ROMAN_DIGITAL_AUTH_UID,
      order: expect.objectContaining({ sourceOrderId: "placement-1" }),
    }));
  });

  it("fails closed before reading another organization's dashboard or order", async () => {
    const otherOrganizationId = "a3f99962-3cf0-4ad6-8d5d-2779343f8fa0";
    vi.mocked(subject.getOrganizationAccess).mockImplementation(async (_userId, organizationId) =>
      organizationId === ORG_ID ? access() : null,
    );
    expect(await getBusinessDashboard(subject, {}, otherOrganizationId)).toMatchObject({
      ok: false,
      code: "ORGANIZATION_ACCESS_DENIED",
    });
    expect(subject.getOrganizationDashboard).not.toHaveBeenCalled();

    expect(await requestOrderAgain(subject, {}, {
      organizationId: otherOrganizationId,
      source: "research_order",
      sourceOrderId: "personal-order-1",
    })).toMatchObject({ ok: false, code: "ORGANIZATION_ACCESS_DENIED" });
    expect(subject.findOrderForOrganization).not.toHaveBeenCalled();
  });

  it("refuses a storage projection containing foreign organization history", async () => {
    const otherOrganizationId = "a3f99962-3cf0-4ad6-8d5d-2779343f8fa0";
    vi.mocked(subject.getOrganizationDashboard).mockResolvedValue({
      ...dashboard(),
      orders: [{
        ownership: { organizationId: otherOrganizationId, basis: "organization_checkout" },
        source: "research_order",
        sourceOrderId: "foreign-order",
        orderNumber: "FOREIGN",
        state: "delivered",
        reviewTriggers: [],
        placedAt: "2026-08-01T00:00:00.000Z",
        totalCents: 100,
        currency: "usd",
        lines: [],
        invoice: null,
        payments: [],
        tracking: [],
        canRequestAgain: true,
      }],
    });
    expect(await getBusinessDashboard(subject, {}, ORG_ID)).toMatchObject({
      ok: false,
      code: "SERVICE_UNAVAILABLE",
    });
    expect(subject.emitAudit).toHaveBeenCalledWith("research.organization.projection_refused", expect.objectContaining({
      organizationId: ORG_ID,
      reason: "foreign_order",
    }));
  });

  it("refuses a storage projection containing another organization's request history", async () => {
    vi.mocked(subject.getOrganizationDashboard).mockResolvedValue({
      ...dashboard(),
      requests: [{
        requestId: "foreign-request",
        organizationId: "a3f99962-3cf0-4ad6-8d5d-2779343f8fa0",
        source: "research_order",
        sourceOrderId: "foreign-order",
        state: "requested",
        requestedAt: "2026-08-12T00:00:00.000Z",
        note: null,
      }],
    });
    expect(await getBusinessDashboard(subject, {}, ORG_ID)).toMatchObject({
      ok: false,
      code: "SERVICE_UNAVAILABLE",
    });
    expect(subject.emitAudit).toHaveBeenCalledWith("research.organization.projection_refused", expect.objectContaining({
      reason: "foreign_request",
    }));
  });

  it("accepts normal quantities 21 and 50 without quantity-only review", async () => {
    const normalOrder = await subject.findOrderForOrganization({
      organizationId: ORG_ID,
      source: "early_access_placement",
      sourceOrderId: "placement-1",
    });
    vi.mocked(subject.getOrganizationDashboard).mockResolvedValue({
      ...dashboard(),
      orders: [{
        ...normalOrder!,
        state: "processing",
        reviewTriggers: [],
        lines: [
          { sku: "Q21", displayName: "Normal quantity 21", quantity: 21, lineTotalCents: 21_000 },
          { sku: "Q50", displayName: "Normal quantity 50", quantity: 50, lineTotalCents: 50_000 },
        ],
      }],
    });
    const result = await getBusinessDashboard(subject, {}, ORG_ID);
    expect(result).toMatchObject({
      ok: true,
      value: { orders: [{ state: "processing", reviewTriggers: [], lines: [{ quantity: 21 }, { quantity: 50 }] }] },
    });
  });

  it("refuses and audits a superseded quantity-only manual review inside 1 through 50", async () => {
    const normalOrder = await subject.findOrderForOrganization({
      organizationId: ORG_ID,
      source: "early_access_placement",
      sourceOrderId: "placement-1",
    });
    vi.mocked(subject.getOrganizationDashboard).mockResolvedValue({
      ...dashboard(),
      orders: [{
        ...normalOrder!,
        state: "manual_review",
        reviewTriggers: ["unusual_quantity"],
        lines: [{ sku: "Q50", displayName: "Normal quantity 50", quantity: 50, lineTotalCents: 50_000 }],
      }],
    });
    expect(await getBusinessDashboard(subject, {}, ORG_ID)).toMatchObject({
      ok: false,
      code: "SERVICE_UNAVAILABLE",
    });
    expect(subject.emitAudit).toHaveBeenCalledWith("research.organization.projection_refused", expect.objectContaining({
      reason: "superseded_quantity_only_review",
    }));
  });

  it("preserves real non-quantity review rules", async () => {
    const normalOrder = await subject.findOrderForOrganization({
      organizationId: ORG_ID,
      source: "early_access_placement",
      sourceOrderId: "placement-1",
    });
    vi.mocked(subject.getOrganizationDashboard).mockResolvedValue({
      ...dashboard(),
      orders: [{
        ...normalOrder!,
        state: "manual_review",
        reviewTriggers: ["fraud_rule"],
        lines: [{ sku: "Q50", displayName: "Normal quantity 50", quantity: 50, lineTotalCents: 50_000 }],
      }],
    });
    expect(await getBusinessDashboard(subject, {}, ORG_ID)).toMatchObject({
      ok: true,
      value: { orders: [{ state: "manual_review", reviewTriggers: ["fraud_rule"] }] },
    });
  });

  it("refuses a reorder when the store returns an order owned by another organization", async () => {
    const existing = await subject.findOrderForOrganization({
      organizationId: ORG_ID,
      source: "early_access_placement",
      sourceOrderId: "placement-1",
    });
    vi.mocked(subject.findOrderForOrganization).mockResolvedValue({
      ...existing!,
      ownership: { organizationId: "a3f99962-3cf0-4ad6-8d5d-2779343f8fa0", basis: "organization_checkout" },
    });
    expect(await requestOrderAgain(subject, {}, {
      organizationId: ORG_ID,
      source: "early_access_placement",
      sourceOrderId: "placement-1",
    })).toMatchObject({ ok: false, code: "ORDER_NOT_FOUND" });
    expect(subject.createRequestAgain).not.toHaveBeenCalled();
  });

  it("does not treat personal membership as organization authorization", async () => {
    vi.mocked(subject.getOrganizationAccess).mockResolvedValue(null);
    expect(subject.findPersonalAccount).not.toHaveBeenCalled();
    expect(await getBusinessDashboard(subject, {}, ORG_ID)).toMatchObject({
      ok: false,
      code: "ORGANIZATION_ACCESS_DENIED",
    });
    expect(subject.findPersonalAccount).not.toHaveBeenCalled();
    expect(subject.getOrganizationDashboard).not.toHaveBeenCalled();
  });

  it("accepts future organization users only through verified-email, one-time invitations", async () => {
    const result = await acceptOrganizationInvitation(subject, {}, {
      invitationId: CLAIM_ID,
      invitationToken: "c".repeat(40),
    });
    expect(result).toMatchObject({ ok: true, value: { organizationId: ORG_ID, accepted: true } });
    expect(subject.commitOrganizationInvitation).toHaveBeenCalledWith(expect.objectContaining({
      userId: ROMAN_DIGITAL_AUTH_UID,
      email: "info@romanhealthcollective.com",
    }));

    vi.mocked(subject.inspectOrganizationInvitation).mockResolvedValue({
      organizationId: ORG_ID,
      email: "someone-else@romandigital.io",
      roles: ["business_buyer"],
    });
    expect(await acceptOrganizationInvitation(subject, {}, {
      invitationId: CLAIM_ID,
      invitationToken: "c".repeat(40),
    })).toMatchObject({ ok: false, code: "INVITATION_INVALID" });
  });
});

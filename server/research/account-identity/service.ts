import type {
  AccountApiErrorCode,
  AccountApiResult,
  AccountContextDto,
  AccountOrderDto,
  BusinessProfile,
  ConfirmCustomerClaimInput,
  InviteOrganizationUserInput,
  OrganizationDashboardDto,
  OrganizationRole,
  OrganizationSummary,
  RequestAgainInput,
  RequestCustomerClaimInput,
  SubjectTarget,
  UpdateBusinessProfileInput,
} from "@shared/research/account-identity";
import {
  AcceptOrganizationInvitationSchema,
  ConfirmCustomerClaimSchema,
  InviteOrganizationUserSchema,
  RequestAgainSchema,
  RequestCustomerClaimSchema,
  UpdateBusinessProfileSchema,
} from "@shared/research/account-identity";

export type VerifiedAccountUser = {
  userId: string;
  email: string;
  emailVerified: boolean;
};

export type PersonalAccountRecord = {
  memberId: string;
  firstName: string;
  lastName: string;
  status: string;
};

export type OrganizationAccessRecord = {
  organization: OrganizationSummary;
  profile: BusinessProfile;
  membershipId: string;
  roles: OrganizationRole[];
  passwordChangeRequired: boolean;
  passwordChangeRequiredAt: string | null;
};

export type AccountClaimSubject =
  | { subjectType: "personal"; memberId: string }
  | { subjectType: "organization"; organizationId: string };

export interface AccountIdentityDeps {
  resolveAuthenticatedUser(request: unknown): Promise<VerifiedAccountUser | null>;
  findPersonalAccount(userId: string): Promise<PersonalAccountRecord | null>;
  listOrganizationAccess(userId: string): Promise<OrganizationAccessRecord[]>;
  getOrganizationAccess(userId: string, organizationId: string): Promise<OrganizationAccessRecord | null>;
  findCustomerByRef(customerRef: string): Promise<{ customerRef: string; normalizedEmail: string } | null>;
  issueCustomerClaimChallenge(input: {
    userId: string;
    email: string;
    customerRef: string;
    subject: AccountClaimSubject;
  }): Promise<{ claimId: string; deliveryAccepted: boolean }>;
  inspectCustomerClaimChallenge(input: {
    claimId: string;
    userId: string;
  }): Promise<null | { customerRef: string; email: string; subject: AccountClaimSubject }>;
  commitCustomerClaim(input: {
    claimId: string;
    challengeToken: string;
    userId: string;
    email: string;
    subject: AccountClaimSubject;
  }): Promise<"linked" | "replayed" | "conflict" | "invalid">;
  getOrganizationDashboard(organizationId: string): Promise<Omit<OrganizationDashboardDto, "organization">>;
  updateOrganizationProfile(input: {
    organizationId: string;
    patch: UpdateBusinessProfileInput;
    actorUserId: string;
  }): Promise<BusinessProfile>;
  issueOrganizationInvitation(input: {
    organizationId: string;
    email: string;
    roles: OrganizationRole[];
    actorUserId: string;
  }): Promise<{ invitationId: string; deliveryAccepted: boolean }>;
  inspectOrganizationInvitation(input: {
    invitationId: string;
    userId: string;
  }): Promise<null | { organizationId: string; email: string; roles: OrganizationRole[] }>;
  commitOrganizationInvitation(input: {
    invitationId: string;
    invitationToken: string;
    userId: string;
    email: string;
  }): Promise<"accepted" | "replayed" | "conflict" | "invalid">;
  completePasswordChange(input: {
    userId: string;
    membershipIds: string[];
    requiredAfter: string;
  }): Promise<boolean>;
  findOrderForOrganization(input: {
    organizationId: string;
    source: RequestAgainInput["source"];
    sourceOrderId: string;
  }): Promise<AccountOrderDto | null>;
  createRequestAgain(input: {
    organizationId: string;
    order: AccountOrderDto;
    note: string | null;
    actorUserId: string;
  }): Promise<{ requestId: string; replayed: boolean }>;
  emitAudit(event: string, detail: Record<string, unknown>): Promise<void>;
}

function failure<T>(code: AccountApiErrorCode, message: string): AccountApiResult<T> {
  return { ok: false, code, message };
}

async function verifiedUser(
  deps: AccountIdentityDeps,
  request: unknown,
): Promise<AccountApiResult<VerifiedAccountUser>> {
  const user = await deps.resolveAuthenticatedUser(request);
  if (!user) return failure("AUTH_REQUIRED", "Sign in is required.");
  if (!user.emailVerified) {
    return failure("EMAIL_VERIFICATION_REQUIRED", "Verify your email address before continuing.");
  }
  return { ok: true, value: { ...user, email: user.email.trim().toLowerCase() } };
}

function hasAnyRole(access: OrganizationAccessRecord, allowed: readonly OrganizationRole[]): boolean {
  return access.roles.some((role) => allowed.includes(role));
}

const NORMAL_ORDER_QUANTITY_MIN = 1;
const NORMAL_ORDER_QUANTITY_MAX = 50;
const SUPERSEDED_QUANTITY_REVIEW_TRIGGER = "unusual_quantity";

function isQuantityOnlyReviewInsideNormalBand(order: AccountOrderDto): boolean {
  if (order.state !== "manual_review" || order.reviewTriggers.length === 0) return false;
  const everyLineInsideNormalBand = order.lines.length > 0 && order.lines.every(
    (line) => Number.isSafeInteger(line.quantity)
      && line.quantity >= NORMAL_ORDER_QUANTITY_MIN
      && line.quantity <= NORMAL_ORDER_QUANTITY_MAX,
  );
  return everyLineInsideNormalBand
    && order.reviewTriggers.every((trigger) => trigger === SUPERSEDED_QUANTITY_REVIEW_TRIGGER);
}

async function authorizedOrganization(
  deps: AccountIdentityDeps,
  user: VerifiedAccountUser,
  organizationId: string,
  allowedRoles?: readonly OrganizationRole[],
): Promise<AccountApiResult<OrganizationAccessRecord>> {
  const access = await deps.getOrganizationAccess(user.userId, organizationId);
  if (!access || access.organization.status !== "active") {
    return failure("ORGANIZATION_ACCESS_DENIED", "This organization is not available to your account.");
  }
  if (allowedRoles && !hasAnyRole(access, allowedRoles)) {
    return failure("ORGANIZATION_ROLE_REQUIRED", "Your organization role does not allow this action.");
  }
  return { ok: true, value: access };
}

async function targetSubject(
  deps: AccountIdentityDeps,
  user: VerifiedAccountUser,
  target: SubjectTarget,
): Promise<AccountApiResult<AccountClaimSubject>> {
  if (target.subjectType === "personal") {
    const personal = await deps.findPersonalAccount(user.userId);
    if (!personal) return failure("ACCOUNT_NOT_FOUND", "No personal member account is attached to this sign-in.");
    return { ok: true, value: { subjectType: "personal", memberId: personal.memberId } };
  }
  const access = await authorizedOrganization(deps, user, target.organizationId, [
    "organization_owner",
    "organization_admin",
    "business_buyer",
  ]);
  if (!access.ok) return access;
  return { ok: true, value: { subjectType: "organization", organizationId: target.organizationId } };
}

export async function getAccountContext(
  deps: AccountIdentityDeps,
  request: unknown,
): Promise<AccountApiResult<AccountContextDto>> {
  const auth = await verifiedUser(deps, request);
  if (!auth.ok) return auth;
  const [personal, organizationAccess] = await Promise.all([
    deps.findPersonalAccount(auth.value.userId),
    deps.listOrganizationAccess(auth.value.userId),
  ]);
  if (!personal && organizationAccess.length === 0) {
    return failure("ACCOUNT_NOT_FOUND", "No Xenios account is attached to this sign-in.");
  }
  return {
    ok: true,
    value: {
      auth: { userId: auth.value.userId, email: auth.value.email, emailVerified: true },
      personal,
      organizations: organizationAccess.map((access) => ({
        ...access.organization,
        roles: [...access.roles],
        passwordChangeRequired: access.passwordChangeRequired,
      })),
      security: {
        passwordChangeRequired: organizationAccess.some((access) => access.passwordChangeRequired),
        mfaAvailable: false,
        passkeyAvailable: false,
      },
    },
  };
}

export async function requestCustomerHistoryClaim(
  deps: AccountIdentityDeps,
  request: unknown,
  raw: unknown,
): Promise<AccountApiResult<{ claimId: string; deliveryAccepted: boolean }>> {
  const parsed = RequestCustomerClaimSchema.safeParse(raw);
  if (!parsed.success) return failure("VALIDATION_ERROR", "The customer reference or target account is invalid.");
  const auth = await verifiedUser(deps, request);
  if (!auth.ok) return auth;
  const subject = await targetSubject(deps, auth.value, parsed.data.target);
  if (!subject.ok) return subject;
  const customer = await deps.findCustomerByRef(parsed.data.customerRef);
  if (!customer) return failure("CUSTOMER_NOT_FOUND", "That customer reference was not found.");
  if (customer.normalizedEmail !== auth.value.email) {
    await deps.emitAudit("research.account.claim_refused", {
      actorUserId: auth.value.userId,
      customerRef: customer.customerRef,
      reason: "email_mismatch",
    });
    return failure("CUSTOMER_EMAIL_MISMATCH", "The verified account email does not match this customer history.");
  }
  const issued = await deps.issueCustomerClaimChallenge({
    userId: auth.value.userId,
    email: auth.value.email,
    customerRef: customer.customerRef,
    subject: subject.value,
  });
  await deps.emitAudit("research.account.claim_challenge_requested", {
    actorUserId: auth.value.userId,
    claimId: issued.claimId,
    customerRef: customer.customerRef,
    subjectType: subject.value.subjectType,
    deliveryAccepted: issued.deliveryAccepted,
  });
  return { ok: true, value: issued };
}

export async function confirmCustomerHistoryClaim(
  deps: AccountIdentityDeps,
  request: unknown,
  raw: unknown,
): Promise<AccountApiResult<{ customerRef: string; linked: boolean; replayed: boolean }>> {
  const parsed = ConfirmCustomerClaimSchema.safeParse(raw);
  if (!parsed.success) return failure("VALIDATION_ERROR", "The claim confirmation is invalid.");
  const auth = await verifiedUser(deps, request);
  if (!auth.ok) return auth;
  const challenge = await deps.inspectCustomerClaimChallenge({ claimId: parsed.data.claimId, userId: auth.value.userId });
  if (!challenge || challenge.email.trim().toLowerCase() !== auth.value.email) {
    return failure("CLAIM_CHALLENGE_INVALID", "The claim challenge is invalid, expired, or already used.");
  }
  const subject = await targetSubject(
    deps,
    auth.value,
    challenge.subject.subjectType === "personal"
      ? { subjectType: "personal" }
      : { subjectType: "organization", organizationId: challenge.subject.organizationId },
  );
  if (!subject.ok) return subject;
  const sameSubject = JSON.stringify(subject.value) === JSON.stringify(challenge.subject);
  if (!sameSubject) return failure("CLAIM_CHALLENGE_INVALID", "The claim target is no longer valid.");
  const outcome = await deps.commitCustomerClaim({
    claimId: parsed.data.claimId,
    challengeToken: parsed.data.challengeToken,
    userId: auth.value.userId,
    email: auth.value.email,
    subject: challenge.subject,
  });
  if (outcome === "invalid") {
    return failure("CLAIM_CHALLENGE_INVALID", "The claim challenge is invalid, expired, or already used.");
  }
  if (outcome === "conflict") {
    return failure("CLAIM_ALREADY_BOUND", "This customer history is already owned by another account.");
  }
  await deps.emitAudit("research.account.customer_claimed", {
    actorUserId: auth.value.userId,
    customerRef: challenge.customerRef,
    subjectType: challenge.subject.subjectType,
    replayed: outcome === "replayed",
  });
  return {
    ok: true,
    value: { customerRef: challenge.customerRef, linked: outcome === "linked", replayed: outcome === "replayed" },
  };
}

export async function getBusinessDashboard(
  deps: AccountIdentityDeps,
  request: unknown,
  organizationId: string,
): Promise<AccountApiResult<OrganizationDashboardDto>> {
  const auth = await verifiedUser(deps, request);
  if (!auth.ok) return auth;
  const access = await authorizedOrganization(deps, auth.value, organizationId);
  if (!access.ok) return access;
  if (access.value.passwordChangeRequired) {
    return failure("PASSWORD_CHANGE_REQUIRED", "Change the initial password before opening the organization dashboard.");
  }
  const dashboard = await deps.getOrganizationDashboard(organizationId);
  const foreignOrder = dashboard.orders.some((order) => order.ownership.organizationId !== organizationId);
  const foreignRequest = dashboard.requests.some((entry) => entry.organizationId !== organizationId);
  const supersededQuantityReview = dashboard.orders.some(isQuantityOnlyReviewInsideNormalBand);
  if (foreignOrder || foreignRequest || supersededQuantityReview) {
    await deps.emitAudit("research.organization.projection_refused", {
      organizationId,
      actorUserId: auth.value.userId,
      reason: foreignOrder
        ? "foreign_order"
        : foreignRequest
          ? "foreign_request"
          : "superseded_quantity_only_review",
    });
    return failure("SERVICE_UNAVAILABLE", "The organization history projection could not be verified.");
  }
  return { ok: true, value: { ...dashboard, organization: access.value.organization } };
}

export async function patchBusinessProfile(
  deps: AccountIdentityDeps,
  request: unknown,
  organizationId: string,
  raw: unknown,
): Promise<AccountApiResult<BusinessProfile>> {
  const parsed = UpdateBusinessProfileSchema.safeParse(raw);
  if (!parsed.success) return failure("VALIDATION_ERROR", "The business profile update is invalid.");
  const auth = await verifiedUser(deps, request);
  if (!auth.ok) return auth;
  const access = await authorizedOrganization(deps, auth.value, organizationId, [
    "organization_owner",
    "organization_admin",
  ]);
  if (!access.ok) return access;
  if (access.value.passwordChangeRequired) {
    return failure("PASSWORD_CHANGE_REQUIRED", "Change the initial password before editing the organization.");
  }
  const profile = await deps.updateOrganizationProfile({
    organizationId,
    patch: parsed.data,
    actorUserId: auth.value.userId,
  });
  await deps.emitAudit("research.organization.profile_updated", {
    organizationId,
    actorUserId: auth.value.userId,
    fields: Object.keys(parsed.data).sort(),
  });
  return { ok: true, value: profile };
}

export async function inviteOrganizationUser(
  deps: AccountIdentityDeps,
  request: unknown,
  raw: unknown,
): Promise<AccountApiResult<{ invitationId: string; deliveryAccepted: boolean }>> {
  const parsed = InviteOrganizationUserSchema.safeParse(raw);
  if (!parsed.success) return failure("VALIDATION_ERROR", "The organization invitation is invalid.");
  const auth = await verifiedUser(deps, request);
  if (!auth.ok) return auth;
  const access = await authorizedOrganization(deps, auth.value, parsed.data.organizationId, [
    "organization_owner",
    "organization_admin",
  ]);
  if (!access.ok) return access;
  if (access.value.passwordChangeRequired) {
    return failure("PASSWORD_CHANGE_REQUIRED", "Change the initial password before inviting organization users.");
  }
  const invited = await deps.issueOrganizationInvitation({ ...parsed.data, actorUserId: auth.value.userId });
  await deps.emitAudit("research.organization.user_invited", {
    organizationId: parsed.data.organizationId,
    actorUserId: auth.value.userId,
    invitationId: invited.invitationId,
    invitedEmail: parsed.data.email,
    roles: parsed.data.roles,
  });
  return { ok: true, value: invited };
}

export async function acceptOrganizationInvitation(
  deps: AccountIdentityDeps,
  request: unknown,
  raw: unknown,
): Promise<AccountApiResult<{ organizationId: string; accepted: boolean; replayed: boolean }>> {
  const parsed = AcceptOrganizationInvitationSchema.safeParse(raw);
  if (!parsed.success) return failure("VALIDATION_ERROR", "The organization invitation is invalid.");
  const auth = await verifiedUser(deps, request);
  if (!auth.ok) return auth;
  const invitation = await deps.inspectOrganizationInvitation({
    invitationId: parsed.data.invitationId,
    userId: auth.value.userId,
  });
  if (!invitation || invitation.email.trim().toLowerCase() !== auth.value.email) {
    return failure("INVITATION_INVALID", "The invitation is invalid, expired, or belongs to another email.");
  }
  const outcome = await deps.commitOrganizationInvitation({
    ...parsed.data,
    userId: auth.value.userId,
    email: auth.value.email,
  });
  if (outcome === "invalid") return failure("INVITATION_INVALID", "The invitation is invalid, expired, or already used.");
  if (outcome === "conflict") return failure("ORGANIZATION_ACCESS_DENIED", "This sign-in is already bound incompatibly.");
  await deps.emitAudit("research.organization.invitation_accepted", {
    organizationId: invitation.organizationId,
    actorUserId: auth.value.userId,
    invitationId: parsed.data.invitationId,
    roles: invitation.roles,
    replayed: outcome === "replayed",
  });
  return {
    ok: true,
    value: { organizationId: invitation.organizationId, accepted: outcome === "accepted", replayed: outcome === "replayed" },
  };
}

export async function acknowledgePasswordChange(
  deps: AccountIdentityDeps,
  request: unknown,
): Promise<AccountApiResult<{ cleared: true }>> {
  const auth = await verifiedUser(deps, request);
  if (!auth.ok) return auth;
  const access = (await deps.listOrganizationAccess(auth.value.userId)).filter((row) => row.passwordChangeRequired);
  if (access.length === 0) return { ok: true, value: { cleared: true } };
  const requiredAfter = access
    .map((row) => row.passwordChangeRequiredAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  if (!requiredAfter) return failure("SERVICE_UNAVAILABLE", "The password-change requirement is incomplete.");
  const cleared = await deps.completePasswordChange({
    userId: auth.value.userId,
    membershipIds: access.map((row) => row.membershipId),
    requiredAfter,
  });
  if (!cleared) {
    return failure("PASSWORD_CHANGE_REQUIRED", "Update the initial password before continuing.");
  }
  await deps.emitAudit("research.account.initial_password_changed", {
    actorUserId: auth.value.userId,
    organizationMembershipIds: access.map((row) => row.membershipId),
  });
  return { ok: true, value: { cleared: true } };
}

export async function requestOrderAgain(
  deps: AccountIdentityDeps,
  request: unknown,
  raw: unknown,
): Promise<AccountApiResult<{ requestId: string; replayed: boolean }>> {
  const parsed = RequestAgainSchema.safeParse(raw);
  if (!parsed.success) return failure("VALIDATION_ERROR", "The request-again input is invalid.");
  const auth = await verifiedUser(deps, request);
  if (!auth.ok) return auth;
  const access = await authorizedOrganization(deps, auth.value, parsed.data.organizationId, [
    "organization_owner",
    "organization_admin",
    "business_buyer",
  ]);
  if (!access.ok) return access;
  if (access.value.passwordChangeRequired) {
    return failure("PASSWORD_CHANGE_REQUIRED", "Change the initial password before requesting another order.");
  }
  const order = await deps.findOrderForOrganization(parsed.data);
  if (!order || order.ownership.organizationId !== parsed.data.organizationId || !order.canRequestAgain) {
    return failure("ORDER_NOT_FOUND", "That order cannot be requested again.");
  }
  const created = await deps.createRequestAgain({
    organizationId: parsed.data.organizationId,
    order,
    note: parsed.data.note ?? null,
    actorUserId: auth.value.userId,
  });
  await deps.emitAudit("research.organization.order_requested_again", {
    organizationId: parsed.data.organizationId,
    actorUserId: auth.value.userId,
    requestId: created.requestId,
    source: order.source,
    sourceOrderId: order.sourceOrderId,
    replayed: created.replayed,
  });
  return { ok: true, value: created };
}

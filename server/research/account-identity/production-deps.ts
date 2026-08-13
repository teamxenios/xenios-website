import { randomUUID } from "node:crypto";
import type { AccountIdentityDeps, AccountClaimSubject, VerifiedAccountUser } from "./service";
import {
  accountClaimLink,
  createAccountChallenge,
  hashAccountChallenge,
  organizationInvitationLink,
} from "./challenge";
import { isRecoveryPurposeSession } from "../member-auth";

type PassthroughKey =
  | "findPersonalAccount"
  | "listOrganizationAccess"
  | "getOrganizationAccess"
  | "findCustomerByRef"
  | "inspectCustomerClaimChallenge"
  | "getOrganizationDashboard"
  | "updateOrganizationProfile"
  | "inspectOrganizationInvitation"
  | "findOrderForOrganization"
  | "createRequestAgain"
  | "emitAudit";

export interface AccountIdentityStore extends Pick<AccountIdentityDeps, PassthroughKey> {
  insertCustomerClaimChallenge(input: {
    claimId: string;
    userId: string;
    email: string;
    customerRef: string;
    subject: AccountClaimSubject;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void>;
  commitCustomerClaimHash(input: {
    claimId: string;
    tokenHash: string;
    userId: string;
    email: string;
    subject: AccountClaimSubject;
  }): Promise<"linked" | "replayed" | "conflict" | "invalid">;
  insertOrganizationInvitation(input: {
    invitationId: string;
    organizationId: string;
    email: string;
    roles: Parameters<AccountIdentityDeps["issueOrganizationInvitation"]>[0]["roles"];
    actorUserId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void>;
  commitOrganizationInvitationHash(input: {
    invitationId: string;
    tokenHash: string;
    userId: string;
    email: string;
  }): Promise<"accepted" | "replayed" | "conflict" | "invalid">;
  clearPasswordChangeRequirement(input: {
    userId: string;
    membershipIds: string[];
    requiredAfter: string;
    verifiedChangedAt: string;
  }): Promise<boolean>;
}

export interface AccountAuthVerifier {
  verifyAccessToken(token: string): Promise<{
    userId: string;
    email: string | null;
    emailConfirmedAt: string | null;
  } | null>;
}

export type SupabaseAuthClient = {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string; email?: string; email_confirmed_at?: string | null } | null };
      error: unknown | null;
    }>;
  };
};

export function createSupabaseAccountAuthVerifier(client: SupabaseAuthClient): AccountAuthVerifier {
  return {
    async verifyAccessToken(token) {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      return {
        userId: data.user.id,
        email: data.user.email ?? null,
        emailConfirmedAt: data.user.email_confirmed_at ?? null,
      };
    },
  };
}

export interface PasswordChangeEvidence {
  changedAfter(input: { userId: string; requiredAfter: string }): Promise<string | null>;
}

export type AccountNotification =
  | {
      kind: "customer_history_claim";
      recipient: string;
      actionUrl: string;
      expiresAt: string;
    }
  | {
      kind: "organization_invitation";
      recipient: string;
      actionUrl: string;
      expiresAt: string;
    };

export interface AccountNotificationDelivery {
  // Implementations may send immediately or atomically hand off to an encrypted
  // provider queue. They must never log or persist actionUrl in plaintext.
  deliver(notification: AccountNotification): Promise<boolean>;
}

export type ProductionAccountIdentityOptions = {
  auth: AccountAuthVerifier;
  store: AccountIdentityStore;
  notifications: AccountNotificationDelivery;
  passwordEvidence: PasswordChangeEvidence;
  siteUrl: string;
  now?: () => Date;
  id?: () => string;
  challengeTtlMs?: number;
  invitationTtlMs?: number;
};

function bearerToken(request: unknown): string | null {
  if (!request || typeof request !== "object") return null;
  const headers = (request as { headers?: unknown }).headers;
  if (!headers || typeof headers !== "object") return null;
  const raw = (headers as Record<string, unknown>).authorization;
  if (typeof raw !== "string") return null;
  const match = /^Bearer ([^\s]+)$/i.exec(raw.trim());
  return match?.[1] ?? null;
}

async function resolveUser(auth: AccountAuthVerifier, request: unknown): Promise<VerifiedAccountUser | null> {
  const token = bearerToken(request);
  if (!token || isRecoveryPurposeSession(token)) return null;
  const verified = await auth.verifyAccessToken(token);
  if (!verified?.email) return null;
  return {
    userId: verified.userId,
    email: verified.email,
    emailVerified: Boolean(verified.emailConfirmedAt),
  };
}

async function deliveryAccepted(
  notifications: AccountNotificationDelivery,
  notification: AccountNotification,
): Promise<boolean> {
  try {
    return (await notifications.deliver(notification)) === true;
  } catch {
    return false;
  }
}

export function createProductionAccountIdentityDeps(
  options: ProductionAccountIdentityOptions,
): AccountIdentityDeps {
  const now = options.now ?? (() => new Date());
  const id = options.id ?? randomUUID;
  const challengeTtlMs = options.challengeTtlMs ?? 30 * 60_000;
  const invitationTtlMs = options.invitationTtlMs ?? 72 * 60 * 60_000;
  if (
    !Number.isFinite(challengeTtlMs)
    || !Number.isFinite(invitationTtlMs)
    || challengeTtlMs <= 0
    || invitationTtlMs <= 0
  ) {
    throw new Error("Account challenge TTLs must be finite and positive.");
  }
  // Fail configuration before any persistence can occur.
  accountClaimLink(options.siteUrl, "00000000-0000-4000-8000-000000000000", "configuration-check");

  return {
    findPersonalAccount: (userId) => options.store.findPersonalAccount(userId),
    listOrganizationAccess: (userId) => options.store.listOrganizationAccess(userId),
    getOrganizationAccess: (userId, organizationId) => options.store.getOrganizationAccess(userId, organizationId),
    findCustomerByRef: (customerRef) => options.store.findCustomerByRef(customerRef),
    inspectCustomerClaimChallenge: (input) => options.store.inspectCustomerClaimChallenge(input),
    getOrganizationDashboard: (organizationId) => options.store.getOrganizationDashboard(organizationId),
    updateOrganizationProfile: (input) => options.store.updateOrganizationProfile(input),
    inspectOrganizationInvitation: (input) => options.store.inspectOrganizationInvitation(input),
    findOrderForOrganization: (input) => options.store.findOrderForOrganization(input),
    createRequestAgain: (input) => options.store.createRequestAgain(input),
    emitAudit: (event, detail) => options.store.emitAudit(event, detail),
    resolveAuthenticatedUser: (request) => resolveUser(options.auth, request),
    async issueCustomerClaimChallenge(input) {
      const claimId = id();
      const challenge = createAccountChallenge();
      const expiresAt = new Date(now().getTime() + challengeTtlMs).toISOString();
      await options.store.insertCustomerClaimChallenge({
        ...input,
        claimId,
        tokenHash: challenge.tokenHash,
        expiresAt,
      });
      const accepted = await deliveryAccepted(options.notifications, {
        kind: "customer_history_claim",
        recipient: input.email,
        actionUrl: accountClaimLink(options.siteUrl, claimId, challenge.token),
        expiresAt,
      });
      return { claimId, deliveryAccepted: accepted };
    },
    commitCustomerClaim(input) {
      const { challengeToken, ...safeInput } = input;
      return options.store.commitCustomerClaimHash({
        ...safeInput,
        tokenHash: hashAccountChallenge(challengeToken),
      });
    },
    async issueOrganizationInvitation(input) {
      const invitationId = id();
      const challenge = createAccountChallenge();
      const expiresAt = new Date(now().getTime() + invitationTtlMs).toISOString();
      await options.store.insertOrganizationInvitation({
        ...input,
        invitationId,
        email: input.email.trim().toLowerCase(),
        tokenHash: challenge.tokenHash,
        expiresAt,
      });
      const accepted = await deliveryAccepted(options.notifications, {
        kind: "organization_invitation",
        recipient: input.email.trim().toLowerCase(),
        actionUrl: organizationInvitationLink(options.siteUrl, invitationId, challenge.token),
        expiresAt,
      });
      return { invitationId, deliveryAccepted: accepted };
    },
    commitOrganizationInvitation(input) {
      const { invitationToken, ...safeInput } = input;
      return options.store.commitOrganizationInvitationHash({
        ...safeInput,
        tokenHash: hashAccountChallenge(invitationToken),
      });
    },
    async completePasswordChange(input) {
      const verifiedChangedAt = await options.passwordEvidence.changedAfter({
        userId: input.userId,
        requiredAfter: input.requiredAfter,
      });
      if (verifiedChangedAt === null) return false;
      const changedAtMs = Date.parse(verifiedChangedAt);
      const requiredAfterMs = Date.parse(input.requiredAfter);
      if (!Number.isFinite(changedAtMs) || !Number.isFinite(requiredAfterMs) || changedAtMs <= requiredAfterMs) {
        return false;
      }
      return options.store.clearPasswordChangeRequirement({ ...input, verifiedChangedAt });
    },
  };
}

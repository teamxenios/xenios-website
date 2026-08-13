import { z } from "zod";

const ActiveBuyerApplicationSchema = z.object({
  id: z.string().uuid(),
  email: z.string().trim().email().max(254),
  firstName: z.string().trim().min(1).max(120),
  status: z.string().trim().min(1).max(80),
}).strict();

const BuyerAuthIdentitySchema = z.object({
  id: z.string().uuid(),
  email: z.string().trim().email().max(254).nullable(),
  emailConfirmedAt: z.string().nullable(),
}).strict();

const BuyerMemberBindingSchema = z.object({
  memberId: z.string().uuid(),
  applicationId: z.string().uuid(),
  authUserId: z.string().uuid(),
  email: z.string().trim().email().max(254),
  status: z.string().trim().min(1).max(80),
}).strict();

export type ActiveBuyerApplication = z.infer<typeof ActiveBuyerApplicationSchema>;

export type BuyerAuthIdentity = {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
};

export type BuyerMemberBinding = {
  memberId: string;
  applicationId: string;
  authUserId: string;
  email: string;
  status: string;
};

export interface BuyerActivationDeps {
  findApplication(applicationId: string): Promise<ActiveBuyerApplication | null>;
  findAuthUserById(authUserId: string): Promise<BuyerAuthIdentity | null>;
  findAuthUserByEmail(normalizedEmail: string): Promise<BuyerAuthIdentity | null>;
  findMemberByApplicationId(applicationId: string): Promise<BuyerMemberBinding | null>;
  findMemberByAuthUserId(authUserId: string): Promise<BuyerMemberBinding | null>;
  bindActiveMember(input: {
    applicationId: string;
    authUserId: string;
    normalizedEmail: string;
    firstName: string;
    actorLabel: string;
    path: "existing_user_attached" | "existing_invite_resent" | "new_user_invited";
  }): Promise<BuyerMemberBinding>;
  sendExistingUserAccessEmail(input: { normalizedEmail: string; redirectTo: string }): Promise<boolean>;
  resendPendingAuthAccessEmail(input: {
    authUserId: string;
    normalizedEmail: string;
    redirectTo: string;
  }): Promise<boolean>;
  inviteAuthUser(input: { normalizedEmail: string; redirectTo: string }): Promise<BuyerAuthIdentity>;
}

const CommonInputSchema = z.object({
  applicationId: z.string().uuid(),
  canonicalEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  actorLabel: z.string().trim().min(3).max(160),
});

const ExistingInputSchema = CommonInputSchema.extend({
  path: z.literal("existing_auth"),
  authUserId: z.string().uuid(),
}).strict();

const ResendInputSchema = CommonInputSchema.extend({
  path: z.literal("existing_unconfirmed_resend"),
  authUserId: z.string().uuid(),
}).strict();

const InviteInputSchema = CommonInputSchema.extend({
  path: z.literal("new_secure_invite"),
}).strict();

export const BuyerActivationInputSchema = z.discriminatedUnion("path", [
  ExistingInputSchema,
  ResendInputSchema,
  InviteInputSchema,
]);
export type BuyerActivationInput = z.input<typeof BuyerActivationInputSchema>;

export type BuyerActivationFailureCode =
  | "INVALID_INPUT"
  | "APPLICATION_NOT_FOUND"
  | "APPLICATION_NOT_ACTIVE"
  | "APPLICATION_EMAIL_MISMATCH"
  | "AUTH_USER_NOT_FOUND"
  | "AUTH_EMAIL_NOT_VERIFIED"
  | "AUTH_EMAIL_MISMATCH"
  | "AUTH_EMAIL_ALREADY_VERIFIED"
  | "EXISTING_AUTH_REQUIRES_UID"
  | "MEMBER_BINDING_CONFLICT"
  | "INVITE_FAILED"
  | "INVITE_RESEND_FAILED"
  | "BINDING_RESULT_INVALID"
  | "BINDING_OUTCOME_UNCERTAIN";

export type BuyerActivationFailure = { ok: false; code: BuyerActivationFailureCode };

export type BuyerActivationResult =
  | {
      ok: true;
      path: "existing_user_ready" | "existing_user_attached" | "existing_invite_resent" | "new_user_invited";
      authUserId: string;
      memberId: string;
      canonicalEmail: string;
      accessEmailAccepted: boolean;
    }
  | BuyerActivationFailure;

function failure(code: BuyerActivationFailureCode): BuyerActivationFailure {
  return { ok: false, code };
}

function isFailure(value: unknown): value is BuyerActivationFailure {
  return typeof value === "object"
    && value !== null
    && "ok" in value
    && (value as { ok?: unknown }).ok === false;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

function sameBinding(
  member: BuyerMemberBinding,
  applicationId: string,
  authUserId: string,
  email: string,
): boolean {
  return member.applicationId === applicationId
    && member.authUserId === authUserId
    && normalizeEmail(member.email) === email
    && member.status === "active";
}

function exactBinding(
  raw: unknown,
  applicationId: string,
  authUserId: string,
  email: string,
): BuyerMemberBinding | null {
  const parsed = BuyerMemberBindingSchema.safeParse(raw);
  const binding = parsed.success ? parsed.data as BuyerMemberBinding : null;
  return binding && sameBinding(binding, applicationId, authUserId, email)
    ? binding
    : null;
}

function accessRedirect(siteUrl: string): string {
  const site = new URL(siteUrl);
  if (site.protocol !== "https:" && site.hostname !== "localhost") {
    throw new Error("Buyer activation requires an HTTPS site URL.");
  }
  return new URL("/research/reset-password", site).href;
}

async function validatedApplication(
  deps: BuyerActivationDeps,
  applicationId: string,
  canonicalEmail: string,
): Promise<ActiveBuyerApplication | BuyerActivationFailure> {
  const raw = await deps.findApplication(applicationId);
  if (!raw) return failure("APPLICATION_NOT_FOUND");
  const parsed = ActiveBuyerApplicationSchema.safeParse(raw);
  if (!parsed.success) return failure("APPLICATION_NOT_FOUND");
  if (parsed.data.id !== applicationId) return failure("APPLICATION_NOT_FOUND");
  if (normalizeEmail(parsed.data.email) !== canonicalEmail) return failure("APPLICATION_EMAIL_MISMATCH");
  if (parsed.data.status !== "active") return failure("APPLICATION_NOT_ACTIVE");
  return parsed.data;
}

async function existingMemberConflict(
  deps: BuyerActivationDeps,
  applicationId: string,
  authUserId: string,
  email: string,
): Promise<BuyerMemberBinding | BuyerActivationFailure | null> {
  const [byApplication, byAuth] = await Promise.all([
    deps.findMemberByApplicationId(applicationId),
    deps.findMemberByAuthUserId(authUserId),
  ]);
  for (const member of [byApplication, byAuth]) {
    if (member && !sameBinding(member, applicationId, authUserId, email)) {
      return failure("MEMBER_BINDING_CONFLICT");
    }
  }
  return byApplication ?? byAuth;
}

/**
 * Unmounted administrative composition for the normal member account system.
 * It never accepts a password or raw action link. New identities are created
 * only by Supabase's secure invitation API; existing identities are attached
 * only by exact UID plus confirmed-email evidence from the read-only audit.
 * bindActiveMember is required to atomically persist the canonical member row
 * and immutable activation audit evidence.
 */
export async function activateBuyerAccount(
  deps: BuyerActivationDeps,
  rawInput: unknown,
  siteUrl: string,
): Promise<BuyerActivationResult> {
  const parsed = BuyerActivationInputSchema.safeParse(rawInput);
  if (!parsed.success) return failure("INVALID_INPUT");
  const input = parsed.data;
  const redirectTo = accessRedirect(siteUrl);
  const application = await validatedApplication(deps, input.applicationId, input.canonicalEmail);
  if (isFailure(application)) return application;

  if (input.path === "existing_auth" || input.path === "existing_unconfirmed_resend") {
    const rawAuth = await deps.findAuthUserById(input.authUserId);
    const parsedAuth = BuyerAuthIdentitySchema.safeParse(rawAuth);
    if (!parsedAuth.success || parsedAuth.data.id !== input.authUserId) return failure("AUTH_USER_NOT_FOUND");
    const auth = parsedAuth.data;
    if (normalizeEmail(auth.email) !== input.canonicalEmail) return failure("AUTH_EMAIL_MISMATCH");
    if (input.path === "existing_auth" && !auth.emailConfirmedAt) return failure("AUTH_EMAIL_NOT_VERIFIED");
    if (input.path === "existing_unconfirmed_resend" && auth.emailConfirmedAt) {
      return failure("AUTH_EMAIL_ALREADY_VERIFIED");
    }
    const member = await existingMemberConflict(
      deps,
      application.id,
      auth.id,
      input.canonicalEmail,
    );
    if (isFailure(member)) return member;
    let binding = member ? exactBinding(member, application.id, auth.id, input.canonicalEmail) : null;
    if (member && !binding) return failure("BINDING_RESULT_INVALID");
    try {
      binding ??= exactBinding(await deps.bindActiveMember({
        applicationId: application.id,
        authUserId: auth.id,
        normalizedEmail: input.canonicalEmail,
        firstName: application.firstName,
        actorLabel: input.actorLabel,
        path: input.path === "existing_unconfirmed_resend"
          ? "existing_invite_resent"
          : "existing_user_attached",
      }), application.id, auth.id, input.canonicalEmail);
    } catch {
      const reread = await existingMemberConflict(deps, application.id, auth.id, input.canonicalEmail)
        .catch(() => null);
      binding = exactBinding(reread, application.id, auth.id, input.canonicalEmail);
      if (!binding) return failure("BINDING_OUTCOME_UNCERTAIN");
    }
    if (!binding) return failure("BINDING_RESULT_INVALID");
    if (input.path === "existing_unconfirmed_resend") {
      const accepted = await deps.resendPendingAuthAccessEmail({
        authUserId: auth.id,
        normalizedEmail: input.canonicalEmail,
        redirectTo,
      }).catch(() => false);
      if (!accepted) return failure("INVITE_RESEND_FAILED");
      return {
        ok: true,
        path: "existing_invite_resent",
        authUserId: auth.id,
        memberId: binding.memberId,
        canonicalEmail: input.canonicalEmail,
        accessEmailAccepted: true,
      };
    }
    const path = member ? "existing_user_ready" as const : "existing_user_attached" as const;
    const accessEmailAccepted = await deps.sendExistingUserAccessEmail({
      normalizedEmail: input.canonicalEmail,
      redirectTo,
    }).catch(() => false);
    return {
      ok: true,
      path,
      authUserId: auth.id,
      memberId: binding.memberId,
      canonicalEmail: input.canonicalEmail,
      accessEmailAccepted,
    };
  }

  const existingAuth = await deps.findAuthUserByEmail(input.canonicalEmail);
  if (existingAuth) return failure("EXISTING_AUTH_REQUIRES_UID");
  let invited: BuyerAuthIdentity;
  try {
    invited = await deps.inviteAuthUser({
      normalizedEmail: input.canonicalEmail,
      redirectTo,
    });
  } catch {
    return failure("INVITE_FAILED");
  }
  const parsedInvite = BuyerAuthIdentitySchema.safeParse(invited);
  if (!parsedInvite.success || normalizeEmail(parsedInvite.data.email) !== input.canonicalEmail) {
    return failure("INVITE_FAILED");
  }
  invited = parsedInvite.data as BuyerAuthIdentity;
  const conflict = await existingMemberConflict(
    deps,
    application.id,
    invited.id,
    input.canonicalEmail,
  ).catch(() => failure("BINDING_OUTCOME_UNCERTAIN"));
  if (isFailure(conflict)) {
    return conflict;
  }
  let binding = conflict ? exactBinding(conflict, application.id, invited.id, input.canonicalEmail) : null;
  if (conflict && !binding) return failure("BINDING_RESULT_INVALID");
  try {
    binding ??= exactBinding(await deps.bindActiveMember({
      applicationId: application.id,
      authUserId: invited.id,
      normalizedEmail: input.canonicalEmail,
      firstName: application.firstName,
      actorLabel: input.actorLabel,
      path: "new_user_invited",
    }), application.id, invited.id, input.canonicalEmail);
  } catch {
    // Supabase Auth and Postgres cannot share one transaction. Never delete an
    // invited identity after an ambiguous store error: the binding may have
    // committed. Re-read and accept only the exact canonical binding.
    const reread = await existingMemberConflict(deps, application.id, invited.id, input.canonicalEmail)
      .catch(() => null);
    binding = exactBinding(reread, application.id, invited.id, input.canonicalEmail);
    if (!binding) return failure("BINDING_OUTCOME_UNCERTAIN");
  }
  if (!binding) return failure("BINDING_RESULT_INVALID");
  return {
    ok: true,
    path: "new_user_invited",
    authUserId: invited.id,
    memberId: binding.memberId,
    canonicalEmail: input.canonicalEmail,
    accessEmailAccepted: true,
  };
}

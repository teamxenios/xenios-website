import { z } from "zod";

export const ACCOUNT_MANAGEMENT_PATHS = {
  config: "/api/research/account-management/config",
  register: "/api/research/account-management/register",
  identity: "/api/research/account-management/me",
  reauthenticate: "/api/research/account-management/reauthenticate",
} as const;
export const ACCOUNT_SETTINGS_PATH = "/research/account/settings";
export const ACCOUNT_REGISTER_PATH = "/research/register";
export const ACCOUNT_REGISTRATION_NOTICE = "Check your inbox for confirmation instructions. If you already have a sign-in, use sign-in or password recovery. If nothing arrives, use those options before trying again.";
export const accountEmailSchema = z.string().trim().max(254).email().transform(value => value.toLowerCase());
export const accountNameSchema = z.string().trim().min(1).max(100).refine(value => !/[\u0000-\u001f\u007f]/u.test(value));
export const accountPasswordSchema = z.string().min(12).max(128);
export const accountRegistrationSchema = z.object({
  email: accountEmailSchema, password: accountPasswordSchema,
  displayName: accountNameSchema.optional(), captchaToken: z.string().min(1).max(4096),
}).strict();
export type AccountRegistration = z.infer<typeof accountRegistrationSchema>;
export const accountRegistrationReplySchema = z.object({
  ok: z.literal(true), state: z.literal("check_email"), message: z.literal(ACCOUNT_REGISTRATION_NOTICE),
}).strict();
export const accountManagementConfigSchema = z.object({
  registrationEnabled: z.boolean(), selfEditsEnabled: z.boolean(), captchaRequired: z.literal(true),
  confirmationRedirect: z.string().url().nullable(), deletion: z.literal("unavailable"),
}).strict();
export type AccountManagementConfig = z.infer<typeof accountManagementConfigSchema>;
export const accountIdentitySchema = z.object({
  userId: z.string().uuid(), email: accountEmailSchema, emailVerified: z.literal(true),
  displayName: z.string().max(100), pendingEmail: accountEmailSchema.nullable(),
}).strict();
export type AccountIdentity = z.infer<typeof accountIdentitySchema>;
export const accountIdentityReplySchema = z.object({ ok: z.literal(true), identity: accountIdentitySchema }).strict();
export const accountSelfMutationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("profile"), displayName: accountNameSchema }).strict(),
  z.object({ operation: z.literal("email"), email: accountEmailSchema }).strict(),
  z.object({ operation: z.literal("password"), password: accountPasswordSchema, nonce: z.string().regex(/^[0-9]{6,10}$/u) }).strict(),
]);
export type AccountSelfMutation = z.infer<typeof accountSelfMutationSchema>;
export const accountSelfMutationReplySchema = z.object({ ok: z.literal(true), state: z.literal("accepted"), operation: z.enum(["profile", "email", "password"]) }).strict();
export const accountReauthenticateReplySchema = z.object({ ok: z.literal(true), state: z.literal("check_email") }).strict();
export const accountManagementErrorSchema = z.object({
  ok: z.literal(false), code: z.enum(["account_unavailable", "authentication_required", "ordinary_session_required",
    "email_confirmation_required", "invalid_input", "verification_required", "rate_limited", "origin_not_allowed", "account_outcome_unconfirmed"]),
}).strict();
export type AccountManagementErrorCode = z.infer<typeof accountManagementErrorSchema>["code"];

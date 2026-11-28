import { z } from "zod";

export const ADMIN_ACCOUNTS_PATH = "/api/admin/research/accounts";
export const ACCOUNT_READ_PAGE_LIMIT = 50;
export const ACCOUNT_READ_MAX_PAGE = 10_000;
export const accountUuidSchema = z.string().uuid().transform(value => value.toLowerCase());
const ordinal = (fallback: string, max: number) => z.string().regex(/^[1-9][0-9]{0,4}$/u)
  .default(fallback).transform(Number).pipe(z.number().int().min(1).max(max));
/** Unknown keys, repeated query parameters and client-supplied actor/scope all refuse. */
export const accountPageQuerySchema = z.object({
  page: ordinal("1", ACCOUNT_READ_MAX_PAGE), perPage: ordinal("20", ACCOUNT_READ_PAGE_LIMIT),
}).strict();
export type AccountPageQuery = z.output<typeof accountPageQuerySchema>;
const timestamp = z.string().datetime({ offset: true });
export const adminAccountSchema = z.object({
  userId: accountUuidSchema,
  // Emails are deliberately not disclosed by this first read slice.
  emailHint: z.literal("withheld").nullable(),
  displayLabel: z.string().trim().min(1).max(100).refine(value => !/[\u0000-\u001f\u007f-\u009f]/u.test(value)).nullable(),
  displayLabelSource: z.literal("user_supplied_not_authority"),
  emailConfirmation: z.enum(["confirmed", "pending", "no_email"]),
  pendingEmailChange: z.boolean(),
  lastSignInAt: timestamp.nullable(),
  providerBan: z.enum(["active", "expired", "not_reported"]),
}).strict();
export type AdminAccount = z.output<typeof adminAccountSchema>;
export const adminAccountPageSchema = z.object({
  ok: z.literal(true), kind: z.literal("CANONICAL_AUTH_ACCOUNT_PAGE_V1"),
  accounts: z.array(adminAccountSchema).max(ACCOUNT_READ_PAGE_LIMIT),
  page: z.number().int().min(1).max(ACCOUNT_READ_MAX_PAGE),
  perPage: z.number().int().min(1).max(ACCOUNT_READ_PAGE_LIMIT),
  nextPage: z.number().int().min(2).max(ACCOUNT_READ_MAX_PAGE).nullable(),
  total: z.number().int().min(0).max(500_000),
}).strict().superRefine((value, ctx) => {
  const expected = Math.min(value.perPage, Math.max(0, value.total - (value.page - 1) * value.perPage));
  const next = value.page * value.perPage < value.total ? value.page + 1 : null;
  if (value.accounts.length !== expected || value.nextPage !== next
    || new Set(value.accounts.map(account => account.userId)).size !== value.accounts.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Incomplete account page" });
  }
});
export type AdminAccountPage = z.output<typeof adminAccountPageSchema>;
export const adminAccountDetailSchema = z.object({
  ok: z.literal(true), kind: z.literal("CANONICAL_AUTH_ACCOUNT_DETAIL_V1"), account: adminAccountSchema,
}).strict();
export type AdminAccountDetail = z.output<typeof adminAccountDetailSchema>;

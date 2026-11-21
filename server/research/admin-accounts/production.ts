import { z } from "zod";
import { accountPageQuerySchema, accountUuidSchema, adminAccountPageSchema, adminAccountSchema, type AccountPageQuery } from "../../../shared/research/admin-accounts";
import { getSupabaseAdmin, getSupabaseAnon, getSupabaseConnectionIdentity, supabaseConfigured } from "../../supabase";
import { isRecoveryPurposeSession } from "../member-auth";
import { accountReadUnavailable, type AccountReadAdmission } from "./authority";
import type { AdminAccountDependencies, AccountDirectoryReader } from "./service";

export type CanonicalAdminAccountReads = Pick<ReturnType<typeof getSupabaseAdmin>["auth"]["admin"], "listUsers" | "getUserById">;
const date = z.string().datetime({ offset: true });
const optionalDate = date.nullable().optional().transform(value => value ?? undefined);
const optionalEmail = z.union([z.string().email(), z.literal(""), z.null()]).optional().transform(value => value || undefined);
const userSchema = z.object({
  id: z.string().uuid(), email: optionalEmail, new_email: optionalEmail,
  email_confirmed_at: optionalDate, last_sign_in_at: optionalDate, banned_until: optionalDate,
  user_metadata: z.record(z.unknown()).nullable().optional(),
});
const providerPageSchema = z.object({ users: z.array(z.unknown()).max(50),
  total: z.number().int().min(0).max(500_000), lastPage: z.number().int().min(1) });
export function projectCanonicalAccount(value: unknown, now = Date.now()) {
  const user = userSchema.safeParse(value);
  if (!user.success || !Number.isFinite(now)) throw accountReadUnavailable();
  const label = user.data.user_metadata?.display_name;
  const displayLabel = typeof label === "string" && label.trim().length > 0 && label.trim().length <= 100
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(label) ? label.trim() : null;
  return adminAccountSchema.parse({
    userId: user.data.id, emailHint: user.data.email ? "withheld" : null, displayLabel,
    displayLabelSource: "user_supplied_not_authority", emailConfirmation: !user.data.email ? "no_email"
      : user.data.email_confirmed_at ? "confirmed" : "pending",
    pendingEmailChange: Boolean(user.data.new_email), lastSignInAt: user.data.last_sign_in_at ?? null,
    providerBan: !user.data.banned_until ? "not_reported" : Date.parse(user.data.banned_until) > now ? "active" : "expired",
  });
}
/** Uses only the existing canonical server Auth admin object, with one bounded page per call. */
export function createCanonicalAccountReader(admin: CanonicalAdminAccountReads, now = Date.now): AccountDirectoryReader {
  return {
    async list(query: AccountPageQuery) {
      const checked = accountPageQuerySchema.safeParse({ page: String(query.page), perPage: String(query.perPage) });
      if (!checked.success) throw accountReadUnavailable();
      const { data, error } = await admin.listUsers(checked.data);
      const parsed = providerPageSchema.safeParse(data);
      if (error || !parsed.success || parsed.data.users.length > checked.data.perPage) throw accountReadUnavailable();
      // Locked auth-js2.108.2 parses a one-digit link ordinal. Do not use that truncated
      // next/last ordinal for navigation. Its total is populated only with parsed links;
      // require such metadata, derive the next page from total and verify the exact row count.
      return adminAccountPageSchema.parse({ ok: true, kind: "CANONICAL_AUTH_ACCOUNT_PAGE_V1",
        accounts: parsed.data.users.map(user => projectCanonicalAccount(user, now())), ...checked.data,
        total: parsed.data.total, nextPage: checked.data.page * checked.data.perPage < parsed.data.total ? checked.data.page + 1 : null });
    },
    async detail(userId: string) {
      if (!accountUuidSchema.safeParse(userId).success) throw accountReadUnavailable();
      const { data, error } = await admin.getUserById(userId);
      if (error) {
        if (error.status === 404 && error.code === "user_not_found") return null;
        throw accountReadUnavailable();
      }
      if (!data?.user || data.user.id.toLowerCase() !== userId) throw accountReadUnavailable();
      return projectCanonicalAccount(data.user, now());
    },
  };
}

export interface AdminAccountProductionOptions {
  /** Executable Root-owned qualification/current-assurance gate; omitted remains unavailable. */
  ready?: () => boolean;
  admission?: AccountReadAdmission;
}
export function buildAdminAccountDependencies(options: AdminAccountProductionOptions = {}): AdminAccountDependencies {
  const configuredUrl = process.env.SUPABASE_URL ?? "";
  const available = () => Boolean(options.ready?.() === true && options.admission
    && typeof options.admission.admit === "function" && typeof options.admission.audit === "function"
    && configuredUrl && process.env.SUPABASE_ANON_KEY && supabaseConfigured()
    && process.env.SUPABASE_URL === configuredUrl);
  function canonicalAnon() {
    if (!available()) throw accountReadUnavailable();
    const anon = getSupabaseAnon(), identity = getSupabaseConnectionIdentity();
    if (identity.configuredUrl !== configuredUrl || identity.anonUrl !== configuredUrl) throw accountReadUnavailable();
    return anon;
  }
  function canonicalAdmin() {
    if (!available()) throw accountReadUnavailable();
    // Creation retains the existing canonical client's one-time service-key read check.
    // This getter is reached only by the reader, after service authority succeeds.
    const admin = getSupabaseAdmin(), identity = getSupabaseConnectionIdentity();
    if (identity.configuredUrl !== configuredUrl || identity.adminUrl !== configuredUrl) throw accountReadUnavailable();
    return admin;
  }
  return {
    available, admission: options.admission, isRecovery: isRecoveryPurposeSession,
    async verifyIdentity(token) {
      const { data, error } = await canonicalAnon().auth.getUser(token);
      if (error) {
        if (error.status === 401 || error.status === 403) return null;
        throw accountReadUnavailable();
      }
      if (!data.user) throw accountReadUnavailable();
      return { id: data.user.id };
    },
    reader: {
      list: query => createCanonicalAccountReader(canonicalAdmin().auth.admin).list(query),
      detail: userId => createCanonicalAccountReader(canonicalAdmin().auth.admin).detail(userId),
    },
  };
}

import {
  accountPageQuerySchema, accountUuidSchema, adminAccountDetailSchema, adminAccountPageSchema,
  type AccountPageQuery, type AdminAccount, type AdminAccountPage,
} from "../../../shared/research/admin-accounts";
import {
  AccountReadError, accountReadUnavailable, boundedAccountRead, createAccountReadAuthority,
  type AccountReadAuthorityDependencies, type AccountReadAudit,
} from "./authority";

export interface AccountDirectoryReader {
  list(query: AccountPageQuery): Promise<AdminAccountPage>;
  detail(userId: string): Promise<AdminAccount | null>;
}
export interface AdminAccountDependencies extends AccountReadAuthorityDependencies {
  reader: AccountDirectoryReader;
}
export function createAdminAccountService(deps: AdminAccountDependencies) {
  const authority = createAccountReadAuthority(deps);
  async function audit(event: AccountReadAudit) {
    try { await boundedAccountRead(() => deps.admission!.audit(Object.freeze(event))); }
    catch { throw accountReadUnavailable(); }
  }
  return {
    async list(token: string | null, raw: unknown) {
      // No provider existence/data read can precede the ordinary operation-scoped authority.
      const principal = await authority.authorize(token, "directory", null);
      const query = accountPageQuerySchema.safeParse(raw);
      if (!query.success) throw new AccountReadError("invalid_input", 400);
      await authority.requireCurrent(principal, "directory", null);
      let result: AdminAccountPage;
      try { result = adminAccountPageSchema.parse(await boundedAccountRead(() => deps.reader.list(query.data))); }
      catch { throw accountReadUnavailable(); }
      if (result.page !== query.data.page || result.perPage !== query.data.perPage) throw accountReadUnavailable();
      await authority.requireCurrent(principal, "directory", null);
      await audit({ ...principal, outcome: "provided" });
      await authority.requireCurrent(principal, "directory", null);
      return result;
    },
    async detail(token: string | null, rawId: unknown) {
      const parsed = accountUuidSchema.safeParse(rawId);
      // Malformed locators never reach either provider; they disclose no existence.
      if (!parsed.success) throw new AccountReadError("invalid_input", 400);
      const targetId = parsed.data, principal = await authority.authorize(token, "detail", targetId);
      await authority.requireCurrent(principal, "detail", targetId);
      let account: AdminAccount | null;
      try { account = await boundedAccountRead(() => deps.reader.detail(targetId)); }
      catch { throw accountReadUnavailable(); }
      await authority.requireCurrent(principal, "detail", targetId);
      if (account === null) {
        await audit({ ...principal, outcome: "not_found" });
        await authority.requireCurrent(principal, "detail", targetId);
        throw new AccountReadError("account_not_found", 404);
      }
      const result = adminAccountDetailSchema.safeParse({ ok: true, kind: "CANONICAL_AUTH_ACCOUNT_DETAIL_V1", account });
      if (!result.success || result.data.account.userId !== targetId) throw accountReadUnavailable();
      await audit({ ...principal, outcome: "provided" });
      await authority.requireCurrent(principal, "detail", targetId);
      return result.data;
    },
  };
}

import { accountUuidSchema } from "../../../shared/research/admin-accounts";

export type AccountReadOperation = "directory" | "detail";
export type AccountReadCode = "account_auth_required" | "account_read_denied" | "recovery_session"
  | "account_read_unavailable" | "invalid_input" | "account_not_found";
export class AccountReadError extends Error {
  constructor(readonly code: AccountReadCode, readonly status: 400 | 401 | 403 | 404 | 503) { super(code); }
}
export const accountReadUnavailable = () => new AccountReadError("account_read_unavailable", 503);

export interface AccountReadScope {
  readonly actorId: string;
  readonly capability: "accountRead";
  readonly operation: AccountReadOperation;
  readonly targetId: string | null;
}
export interface AccountReadLease extends AccountReadScope {
  readonly purpose: "ordinary";
  /** Trusted server admission owns current purpose/assurance/revocation, not a client boolean. */
  isCurrent(): boolean | Promise<boolean>;
}
export interface AccountReadAudit extends AccountReadScope {
  readonly outcome: "provided" | "not_found";
}
export interface AccountReadAdmission {
  /** Composition-only port. Never construct from request JSON, ADMIN_EMAIL or domain roles. */
  admit(input: AccountReadScope & { readonly token: string }): Promise<AccountReadLease | null>;
  audit(event: AccountReadAudit): Promise<void>;
}
export interface AccountReadAuthorityDependencies {
  available(): boolean;
  verifyIdentity(token: string): Promise<{ id: string } | null>;
  isRecovery(token: string): boolean;
  admission?: AccountReadAdmission;
}
// Type opacity assists callers; the instance-local WeakMap is the executable fence.
declare const principalBrand: unique symbol;
export type AccountReadPrincipal = Readonly<AccountReadScope & { [principalBrand]: true }>;

export async function boundedAccountRead<T>(work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(work), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(accountReadUnavailable()), 5_000);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

export function createAccountReadAuthority(deps: AccountReadAuthorityDependencies) {
  const issued = new WeakMap<AccountReadPrincipal, AccountReadLease>();
  function available() {
    try {
      if (deps.available() !== true || typeof deps.admission?.admit !== "function"
        || typeof deps.admission.audit !== "function") throw accountReadUnavailable();
    } catch { throw accountReadUnavailable(); }
  }
  async function requireCurrent(principal: AccountReadPrincipal, operation: AccountReadOperation, targetId: string | null) {
    available();
    const lease = principal && typeof principal === "object" ? issued.get(principal) : undefined;
    if (!lease || principal.capability !== "accountRead" || principal.operation !== operation || principal.targetId !== targetId) {
      throw new AccountReadError("account_read_denied", 403);
    }
    let current = false;
    try { current = await boundedAccountRead(() => Promise.resolve(lease.isCurrent())) === true; }
    catch { throw accountReadUnavailable(); }
    if (!current) throw new AccountReadError("account_read_denied", 403);
    return principal;
  }
  return {
    async authorize(token: string | null, operation: AccountReadOperation, targetId: string | null): Promise<AccountReadPrincipal> {
      if (!token || token.length > 8192 || /[\s,\u0000-\u001f\u007f]/u.test(token)) throw new AccountReadError("account_auth_required", 401);
      available();
      if (!["directory", "detail"].includes(operation) || (operation === "directory" ? targetId !== null : !accountUuidSchema.safeParse(targetId).success)) {
        throw new AccountReadError("invalid_input", 400);
      }
      let identity: { id: string } | null;
      try { identity = await boundedAccountRead(() => deps.verifyIdentity(token)); }
      catch { throw accountReadUnavailable(); }
      const actor = accountUuidSchema.safeParse(identity?.id);
      if (!actor.success) throw new AccountReadError("account_auth_required", 401);
      try { if (deps.isRecovery(token)) throw new AccountReadError("recovery_session", 403); }
      catch (error) { if (error instanceof AccountReadError) throw error; throw accountReadUnavailable(); }
      const scope: AccountReadScope = Object.freeze({ actorId: actor.data, capability: "accountRead", operation, targetId });
      let lease: AccountReadLease | null;
      try { lease = await boundedAccountRead(() => deps.admission!.admit({ ...scope, token })); }
      catch { throw accountReadUnavailable(); }
      if (!lease || lease.actorId !== scope.actorId || lease.capability !== scope.capability || lease.operation !== operation
        || lease.targetId !== targetId || lease.purpose !== "ordinary" || typeof lease.isCurrent !== "function") {
        throw new AccountReadError("account_read_denied", 403);
      }
      const principal = Object.freeze({ ...scope }) as AccountReadPrincipal;
      // Copy scalar bindings and bind the original method so later object changes cannot broaden scope.
      issued.set(principal, Object.freeze({ ...scope, purpose: "ordinary", isCurrent: lease.isCurrent.bind(lease) }));
      await requireCurrent(principal, operation, targetId);
      return principal;
    },
    requireCurrent,
  };
}

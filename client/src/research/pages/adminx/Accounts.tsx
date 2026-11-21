import { useCallback, useEffect, useRef, useState } from "react";
import SeoHead from "@/components/SeoHead";
import {
  ADMIN_ACCOUNTS_PATH, accountUuidSchema, adminAccountDetailSchema, adminAccountPageSchema,
  type AdminAccount, type AdminAccountDetail, type AdminAccountPage,
} from "@shared/research/admin-accounts";
import { apiGet, type ApiResult } from "../../lib/api";
import { AdminScreen } from "./AdminResearchHome";
import type { AdminSessionBinding } from "./auth";

const safeFailure = <T,>(value: ApiResult<T>): ApiResult<T> => value.kind === "ok" || value.kind === "unavailable"
  ? value : value.kind === "unauthorized" ? { kind: "unauthorized" }
    : value.kind === "denied" && value.code === "account_not_found" ? { kind: "denied", code: "account_not_found" }
    : value.kind === "forbidden" || value.kind === "denied" ? { kind: "forbidden", message: "Account-read permission is required." }
      : { kind: "error", message: "The account read could not be verified. Try again." };

export async function loadAccountPage(token: string, page: number): Promise<ApiResult<AdminAccountPage>> {
  if (!token) return { kind: "unauthorized" };
  if (!Number.isInteger(page) || page < 1 || page > 10_000) return { kind: "error", message: "Invalid account page." };
  const response = safeFailure(await apiGet<unknown>(`${ADMIN_ACCOUNTS_PATH}?page=${page}&perPage=20`, token));
  if (response.kind !== "ok") return response;
  const parsed = adminAccountPageSchema.safeParse(response.data);
  return parsed.success && parsed.data.page === page && parsed.data.perPage === 20
    ? { kind: "ok", data: parsed.data } : { kind: "error", message: "The account page could not be verified." };
}
export async function loadAccountDetail(token: string, rawId: string): Promise<ApiResult<AdminAccountDetail>> {
  if (!token) return { kind: "unauthorized" };
  const userId = accountUuidSchema.safeParse(rawId);
  if (!userId.success) return { kind: "error", message: "Invalid account identifier." };
  const response = safeFailure(await apiGet<unknown>(`${ADMIN_ACCOUNTS_PATH}/${userId.data}`, token, ["account_not_found"]));
  if (response.kind !== "ok") return response;
  const parsed = adminAccountDetailSchema.safeParse(response.data);
  return parsed.success && parsed.data.account.userId === userId.data ? { kind: "ok", data: parsed.data }
    : { kind: "error", message: "The account detail could not be verified." };
}
function AccountFacts({ account }: { account: AdminAccount }) {
  return <dl className="grid gap-2 break-words">
    <div><dt>Canonical account UUID</dt><dd>{account.userId}</dd></div>
    <div><dt>User-supplied display label</dt><dd>{account.displayLabel ?? "Not provided"}</dd></div>
    <div><dt>Email</dt><dd>{account.emailHint ? "Withheld in this directory" : "Not reported"}</dd></div>
    <div><dt>Email confirmation</dt><dd>{account.emailConfirmation}</dd></div>
    <div><dt>Email change pending</dt><dd>{account.pendingEmailChange ? "Yes" : "No"}</dd></div>
    <div><dt>Last provider sign-in</dt><dd>{account.lastSignInAt ?? "Not reported"}</dd></div>
    <div><dt>Provider ban observation</dt><dd>{account.providerBan.replaceAll("_", " ")}</dd></div>
  </dl>;
}
function ReadState({ result, loading }: { result: ApiResult<unknown> | null; loading: boolean }) {
  if (loading) return <p role="status">Loading canonical account information…</p>;
  if (!result || result.kind === "ok") return null;
  if (result.kind === "unavailable") return <p role="status">The account directory is unavailable. This does not mean that no accounts exist.</p>;
  if (result.kind === "unauthorized") return <p role="alert">Your admin session has ended. Sign in again.</p>;
  if (result.kind === "denied" && result.code === "account_not_found") return <p role="status">That account was not found in this authorized read.</p>;
  if (result.kind === "denied" || result.kind === "forbidden") return <p role="alert">Account-read permission is required.</p>;
  return <p role="alert">The account read could not be verified. Try again.</p>;
}

/** Token-keyed by AdminScreen; binding revocation also fences same-token identity changes. */
export function AccountsBody({ token, binding }: { token: string; binding?: AdminSessionBinding | null }) {
  const [page, setPage] = useState(1), [selected, setSelected] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<ApiResult<AdminAccountPage | AdminAccountDetail> | null>(null), [loading, setLoading] = useState(true);
  const [completedKey, setCompletedKey] = useState<string | null>(null);
  const requestKey = `${binding?.generation ?? "unbound"}:${token}:${page}:${selected ?? "directory"}:${retry}`;
  const generation = useRef(0);
  const current = useCallback(() => binding?.isCurrent() === true, [binding]);
  useEffect(() => {
    const attempt = ++generation.current; let alive = true;
    setResult(null); setLoading(true);
    if (!current()) { setResult({ kind: "unauthorized" }); setLoading(false); return; }
    const read = selected ? loadAccountDetail(token, selected) : loadAccountPage(token, page);
    void read.then(value => {
      if (!alive || generation.current !== attempt || !current()) return;
      setCompletedKey(requestKey); setResult(value); setLoading(false);
    }).catch(() => {
      if (alive && generation.current === attempt && current()) { setCompletedKey(requestKey); setResult({ kind: "error", message: "Read failed" }); setLoading(false); }
    });
    return () => { alive = false; generation.current++; };
  }, [token, page, selected, retry, current, requestKey]);
  // Never retain the previous identity's data while its binding is no longer current.
  if (!current()) return <p role="alert">Your admin session has ended. Sign in again.</p>;
  const pending = loading || completedKey !== requestKey;
  const ready = !pending && result?.kind === "ok" ? result.data : null;
  return <section aria-label="Canonical account directory" className="card">
    <p>Read-only canonical Auth accounts. Display labels do not grant authority. Provider confirmation or ban observations do not prove membership, Care, partner, AE or product access.</p>
    {selected && <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => { setResult(null); setLoading(true); setSelected(null); }}>Back to account page</button>}
    <ReadState result={result} loading={pending} />
    {ready && "accounts" in ready && <>
      {ready.accounts.length === 0 ? <p>No accounts were returned on this verified page.</p> : <ul aria-label="Account page">
        {ready.accounts.map(account => <li key={account.userId} className="py-3">
          <p>{account.displayLabel ?? "Account"} — {account.userId}</p>
          <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => { setResult(null); setLoading(true); setSelected(account.userId); }} aria-label={`View account ${account.userId}`}>View read-only detail</button>
        </li>)}
      </ul>}
      <nav aria-label="Account pages" className="flex gap-3 items-center flex-wrap">
        <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={page === 1} onClick={() => { setResult(null); setLoading(true); setPage(value => value - 1); }}>Previous page</button>
        <span>Page {ready.page}; {ready.total} provider-reported accounts. This is not a full-directory snapshot.</span>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={ready.nextPage === null} onClick={() => { if (ready.nextPage) { setResult(null); setLoading(true); setPage(ready.nextPage); } }}>Next page</button>
      </nav>
    </>}
    {ready && "account" in ready && <AccountFacts account={ready.account} />}
    {!pending && result?.kind !== "ok" && <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => { setResult(null); setLoading(true); setRetry(value => value + 1); }}>Retry read</button>}
  </section>;
}
export default function Accounts() {
  return <><SeoHead title="Accounts | Xenios operations" description="Authorized account directory. Sign in and account-read permission are required."
    path="/admin/research/accounts" publicMetadata={false} />
  <AdminScreen title="Canonical accounts" lead="Authorized, read-only Auth directory and detail; account changes remain unavailable.">
    {(token, binding) => <AccountsBody key={`${token}:${binding?.generation ?? "unbound"}`} token={token} binding={binding} />}
  </AdminScreen></>;
}

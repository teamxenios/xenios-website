import { useCallback, useEffect, useRef, useState } from "react";
import SeoHead from "@/components/SeoHead";
import {
  ADMIN_ACCOUNTS_PATH, accountUuidSchema, adminAccountDetailSchema, adminAccountPageSchema,
  type AdminAccount, type AdminAccountDetail, type AdminAccountPage,
} from "@shared/research/admin-accounts";
import { apiGet, type ApiResult } from "../../lib/api";
import { AdminScreen } from "./AdminResearchHome";
import type { AdminSessionBinding } from "./auth";

const PAGE_NAME = "All sign-in accounts";
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
// Plain-language text for the provider's closed values; each keeps the value's meaning.
const EMAIL_CONFIRMATION_TEXT: Record<AdminAccount["emailConfirmation"], string> = {
  confirmed: "Confirmed", pending: "Not yet confirmed", no_email: "No email address on this account",
};
const PROVIDER_BAN_TEXT: Record<AdminAccount["providerBan"], string> = {
  active: "Ban in effect", expired: "Ban has expired", not_reported: "No ban reported",
};
// UTC with its zone named, so the shown time never depends on the operator's computer.
const SIGN_IN_TIME = new Intl.DateTimeFormat("en-US", {
  year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
});
function SignInTime({ value }: { value: string | null }) {
  if (!value) return <>Not reported</>;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? <>{value}</> : <time dateTime={value}>{SIGN_IN_TIME.format(instant)}</time>;
}
function AccountFacts({ account }: { account: AdminAccount }) {
  return <dl className="grid gap-2 break-words">
    <div><dt>Canonical account UUID</dt><dd>{account.userId}</dd></div>
    <div><dt>User-supplied display label</dt><dd>{account.displayLabel ?? "Not provided"}</dd></div>
    <div><dt>Email</dt><dd>{account.emailHint ? "Withheld in this directory" : "Not reported"}</dd></div>
    <div><dt>Email confirmation</dt><dd>{EMAIL_CONFIRMATION_TEXT[account.emailConfirmation]}</dd></div>
    <div><dt>Email change pending</dt><dd>{account.pendingEmailChange ? "Yes" : "No"}</dd></div>
    <div><dt>Last provider sign-in</dt><dd><SignInTime value={account.lastSignInAt} /></dd></div>
    <div><dt>Provider ban observation</dt><dd>{PROVIDER_BAN_TEXT[account.providerBan]}</dd></div>
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

/** Where keyboard focus goes once the read started by a control has finished. */
type FocusIntent = { kind: "pager"; pressed: "previous" | "next" } | { kind: "detail" } | { kind: "back"; userId: string } | { kind: "retry" };

/** Token-keyed by AdminScreen; binding revocation also fences same-token identity changes. */
export function AccountsBody({ token, binding }: { token: string; binding?: AdminSessionBinding | null }) {
  const [page, setPage] = useState(1), [selected, setSelected] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<ApiResult<AdminAccountPage | AdminAccountDetail> | null>(null), [loading, setLoading] = useState(true);
  const [completedKey, setCompletedKey] = useState<string | null>(null);
  const requestKey = `${binding?.generation ?? "unbound"}:${token}:${page}:${selected ?? "directory"}:${retry}`;
  const generation = useRef(0);
  const focusIntent = useRef<FocusIntent | null>(null);
  const heading = useRef<HTMLHeadingElement>(null), previousPage = useRef<HTMLButtonElement>(null);
  const nextPage = useRef<HTMLButtonElement>(null), retryRead = useRef<HTMLButtonElement>(null);
  const detailButtons = useRef(new Map<string, HTMLButtonElement>());
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
  const pending = loading || completedKey !== requestKey;
  // Pressing a control replaces it (or disables it) while the next read runs, so
  // focus falls to the document. Once that read has finished, put focus back:
  // never while it loads, never for a binding that is no longer current, and
  // never away from somewhere the operator moved it in the meantime.
  useEffect(() => {
    if (pending) return;
    const intent = focusIntent.current; focusIntent.current = null;
    if (!intent || !current()) return;
    const active = document.activeElement;
    const onDisabledPager = active instanceof HTMLButtonElement && active.disabled
      && (active === previousPage.current || active === nextPage.current);
    if (active && active !== document.body && active.isConnected && !onDisabledPager) return;
    const usable = (node: HTMLButtonElement | null | undefined) => node && node.isConnected && !node.disabled ? node : null;
    const target = intent.kind === "pager"
      ? intent.pressed === "next" ? usable(nextPage.current) ?? usable(previousPage.current) : usable(previousPage.current) ?? usable(nextPage.current)
      : intent.kind === "back" ? usable(detailButtons.current.get(intent.userId))
        : intent.kind === "retry" ? usable(retryRead.current) : null;
    (target ?? heading.current)?.focus();
  }, [pending, current]);
  // Never retain the previous identity's data while its binding is no longer current.
  if (!current()) return <p role="alert">Your admin session has ended. Sign in again.</p>;
  const ready = !pending && result?.kind === "ok" ? result.data : null;
  const directory = ready && "accounts" in ready ? ready : null;
  const detail = ready && "account" in ready ? ready : null;
  const startRead = (intent: FocusIntent, change: () => void) => { focusIntent.current = intent; setResult(null); setLoading(true); change(); };
  return <section aria-label={PAGE_NAME} className="card">
    <p>Read-only canonical Auth accounts. Display labels do not grant authority. Provider confirmation or ban observations do not prove membership, Care, partner, AE or product access.</p>
    {selected && <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => startRead({ kind: "back", userId: selected }, () => setSelected(null))}>Back to account page</button>}
    <h2 ref={heading} tabIndex={-1} className="body-l font-700">
      {selected ? detail ? `Account detail: ${detail.account.displayLabel ?? "no display label"}` : "Account detail" : `Accounts, page ${page}`}
    </h2>
    <ReadState result={result} loading={pending} />
    {directory && (directory.accounts.length === 0 ? <p>No accounts were returned on this verified page.</p> : <ul aria-label="Account page">
      {directory.accounts.map(account => <li key={account.userId} className="py-3">
        <p>{account.displayLabel ?? "Account"} — {account.userId}</p>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }}
          ref={node => { if (node) detailButtons.current.set(account.userId, node); else detailButtons.current.delete(account.userId); }}
          onClick={() => startRead({ kind: "detail" }, () => setSelected(account.userId))}
          aria-label={`View read-only detail for ${account.displayLabel ?? "account"} ${account.userId}`}>View read-only detail</button>
      </li>)}
    </ul>)}
    {/* The page controls stay mounted, disabled, while a directory page loads. */}
    {!selected && (pending || directory) && <nav aria-label="Account pages" className="flex gap-3 items-center flex-wrap">
      <button ref={previousPage} type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={!directory || page === 1}
        onClick={() => startRead({ kind: "pager", pressed: "previous" }, () => setPage(value => value - 1))}>Previous page</button>
      <span>{directory ? `Page ${directory.page}; ${directory.total} provider-reported accounts. This is not a full-directory snapshot.` : `Page ${page}`}</span>
      <button ref={nextPage} type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={!directory || directory.nextPage === null}
        onClick={() => { const next = directory?.nextPage; if (next) startRead({ kind: "pager", pressed: "next" }, () => setPage(next)); }}>Next page</button>
    </nav>}
    {detail && <AccountFacts account={detail.account} />}
    {!pending && result?.kind !== "ok" && <button ref={retryRead} type="button" className="btn btn-ghost" style={{ minHeight: 44 }}
      onClick={() => startRead({ kind: "retry" }, () => setRetry(value => value + 1))}>Retry read</button>}
  </section>;
}
export default function Accounts() {
  return <><SeoHead title={`${PAGE_NAME} | Xenios operations`} description="Authorized account directory. Sign in and account-read permission are required."
    path="/admin/research/accounts" publicMetadata={false} />
  <AdminScreen title={PAGE_NAME} lead="Authorized, read-only Auth directory and detail; account changes remain unavailable.">
    {(token, binding) => <AccountsBody key={`${token}:${binding?.generation ?? "unbound"}`} token={token} binding={binding} />}
  </AdminScreen></>;
}

import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import type { CustomerAccountResult } from "@shared/research/customer-account/contract";
import { safeResearchReturnTo } from "../lib/member-routing";

export type AccountResourceState<T> =
  | Readonly<{ state: "loading" }>
  | Readonly<{ state: "ready"; data: T }>
  | Readonly<{ state: "denied"; reason: string }>
  | Readonly<{ state: "error" }>;

export function useAccountResource<T>(
  loader: (token: string | null) => Promise<CustomerAccountResult<T>>,
  token: string | null,
): AccountResourceState<T> {
  const [snapshot, setSnapshot] = useState<AccountResourceState<T>>({ state: "loading" });

  useEffect(() => {
    let current = true;
    setSnapshot({ state: "loading" });
    void loader(token).then(
      (result) => {
        if (!current) return;
        if (result.kind === "ok") setSnapshot({ state: "ready", data: result.data });
        else if (result.kind === "denied") setSnapshot({ state: "denied", reason: result.reason });
        else setSnapshot({ state: "error" });
      },
      () => {
        if (current) setSnapshot({ state: "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [loader, token]);

  return snapshot;
}

function deniedCopy(reason: string): string {
  if (reason === "auth_required" || reason === "account_access_denied") {
    return "Sign in with the Xenios account connected to this private area.";
  }
  return "This private account area is not available for the current sign-in.";
}

export function accountSignInHref(requestedReturnTo: string): string {
  const returnTo = safeResearchReturnTo(requestedReturnTo);
  return returnTo
    ? `/research/sign-in?returnTo=${encodeURIComponent(returnTo)}`
    : "/research/sign-in";
}

export function AccountResourceBoundary<T>({
  snapshot,
  children,
}: {
  snapshot: AccountResourceState<T>;
  children: (data: T) => ReactNode;
}) {
  const [location] = useLocation();
  const requestedReturnTo = typeof window === "undefined"
    ? location
    : `${window.location.pathname}${window.location.search}`;
  const signInHref = accountSignInHref(requestedReturnTo);

  if (snapshot.state === "loading") {
    return (
      <div className="account-state" role="status" aria-live="polite" data-testid="account-loading">
        <span className="account-state-mark" aria-hidden="true" />
        <p className="mono-cap">Opening your private account</p>
        <p className="body-s">Checking the latest administrative and fulfillment status.</p>
      </div>
    );
  }
  if (snapshot.state === "denied") {
    return (
      <div className="account-state" role="alert" data-testid="account-denied">
        <p className="mono-cap">Private account</p>
        <h2 className="body-l font-700 mt-2">Account access is required.</h2>
        <p className="body-s mt-2">{deniedCopy(snapshot.reason)}</p>
        <Link className="btn btn-primary mt-5" href={signInHref}>Sign in</Link>
      </div>
    );
  }
  if (snapshot.state === "error") {
    return (
      <div className="account-state" role="alert" data-testid="account-error">
        <p className="mono-cap">Account service</p>
        <h2 className="body-l font-700 mt-2">Your account could not be loaded.</h2>
        <p className="body-s mt-2">Please refresh this page. Your account data has not been changed.</p>
      </div>
    );
  }
  return <>{children(snapshot.data)}</>;
}

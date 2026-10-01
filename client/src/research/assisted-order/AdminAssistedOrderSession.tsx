import { Fragment, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useAdminSession } from "../pages/adminx/auth";

export type AssistedOrderAdminScope = Readonly<{
  token: string;
  isCurrent(): boolean;
  deny(): void;
}>;

/** Presentation lifetime only. Each existing API still authorizes its request. */
export function AdminAssistedOrderSession({ title, children }: Readonly<{
  title: string;
  children(scope: AssistedOrderAdminScope): ReactNode;
}>) {
  const { state, token } = useAdminSession();
  const scope = useRef({ state, token, generation: 0, denied: false });
  const mounted = useRef(true);
  const [, refreshDenial] = useState(0);
  // Invalidate old continuations during render, before passive cleanup. The
  // opaque generation also prevents A -> B -> A from reviving A's first work.
  if (scope.current.state !== state || scope.current.token !== token) {
    scope.current = { state, token, generation: scope.current.generation + 1, denied: false };
  }
  const generation = scope.current.generation;
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const isCurrent = useCallback(() => mounted.current &&
    scope.current.generation === generation && scope.current.state === "ready" &&
    scope.current.token !== null && !scope.current.denied, [generation]);
  const deny = useCallback(() => {
    if (!isCurrent()) return;
    // Invalidate every outstanding operation synchronously, not just the one
    // receiving 401/403. A later ticket or PATCH must not restore private data.
    scope.current.denied = true;
    refreshDenial((value) => value + 1);
  }, [isCurrent]);

  if (state !== "ready" || !token || scope.current.denied) {
    return <main className="xenios-order-page">
      <header className="xenios-order-hero">
        <p className="xenios-order-eyebrow">Research operations</p><h1>{title}</h1>
      </header>
      <div className="xenios-order-error" role="alert">
        {scope.current.denied
          ? "Your admin access could not be verified. Sign in again before reviewing requests."
          : state === "loading"
            ? "Checking your admin session…"
            : state === "unconfigured"
              ? "Admin sign-in is not configured for this deployment."
              : "Sign in with your Xenios admin account to review assisted order requests."}
      </div>
    </main>;
  }
  // No credential enters a React key, DOM attribute, URL or persistent store.
  return <Fragment key={generation}>{children({ token, isCurrent, deny })}</Fragment>;
}

import { useCallback, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Principal-bound asynchronous operations (Resource Hub, RH-B28-2 / RH-B28-3).
//
// A private download or an admin action is started by one signed-in
// principal. If, while it is in flight, that principal signs out, another
// account signs in, or the surface unmounts, the completion must not save a
// file, show a result, or touch state that now belongs to someone else. The
// hook below binds every operation to (principal, generation, mount):
//
//   * the token is captured at start; the fetch is aborted when the principal
//     changes or the surface unmounts (best effort), AND
//   * isCurrent() is re-checked after the await and immediately before any
//     side effect, so a completion that outlived its session is discarded
//     even when cancellation did not reach it.
//
// "Principal" is the account, not the bearer string: a same-account token
// refresh keeps the same principal, so a download started before the refresh
// still saves for the same person. The key is derived from the JWT subject
// when the token is a JWT, and from the token itself otherwise (opaque tokens
// are their own identity). It is only an isolation key, never authority: the
// server authorizes every request on its own.
// ---------------------------------------------------------------------------

function base64UrlToUtf8(value: string): string | null {
  try {
    const padded = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The isolation key for a bearer token: the JWT subject when there is one, else the token. */
export function principalKeyOf(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length === 3) {
    const payload = base64UrlToUtf8(parts[1] ?? "");
    if (payload) {
      try {
        const claims = JSON.parse(payload) as { sub?: unknown };
        if (typeof claims.sub === "string" && claims.sub.length > 0) return `sub:${claims.sub}`;
      } catch {
        /* not a JWT payload: fall through */
      }
    }
  }
  return `token:${token}`;
}

export interface BoundOperation {
  /** The bearer the operation was started with. */
  token: string;
  /** Aborted when the principal changes or the surface unmounts. */
  signal: AbortSignal;
  /** True only while the starting principal is still current, no newer operation has started here, and the surface is mounted. */
  isCurrent(): boolean;
  /** Release bookkeeping once the operation has settled (safe to call more than once). */
  finish(): void;
}

/**
 * Returns `begin()`. Each call starts a new generation for THIS surface (a
 * card, a version row, a form): an older operation that completes after a
 * newer one started is stale and must be discarded by its caller.
 */
export function usePrincipalBoundOperations(token: string | null): () => BoundOperation | null {
  const principal = principalKeyOf(token);
  const principalRef = useRef(principal);
  principalRef.current = principal;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const controllersRef = useRef(new Set<AbortController>());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // A principal change aborts everything that principal started here.
  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      for (const controller of controllers) controller.abort();
      controllers.clear();
    };
  }, [principal]);

  return useCallback((): BoundOperation | null => {
    const startedToken = tokenRef.current;
    const startedPrincipal = principalRef.current;
    if (!startedToken || !startedPrincipal) return null;
    const generation = ++generationRef.current;
    const controller = new AbortController();
    controllersRef.current.add(controller);
    return {
      token: startedToken,
      signal: controller.signal,
      isCurrent: () =>
        mountedRef.current &&
        !controller.signal.aborted &&
        principalRef.current === startedPrincipal &&
        generationRef.current === generation,
      finish: () => {
        controllersRef.current.delete(controller);
      },
    };
  }, []);
}

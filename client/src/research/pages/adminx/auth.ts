import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { apiGet } from "../../lib/api";

// ---------------------------------------------------------------------------
// Admin session for /admin/research/* (Supreme build). This mirrors the
// existing /admin pattern (client/src/pages/Admin.tsx): a Supabase browser
// session yields an access token, every /api/admin/* call sends it as
// Authorization Bearer, and the SERVER decides authority on every request.
// The browser never grants authority: an absent session renders a
// sign-in-required state, and a 401/403 from any endpoint renders an honest
// denied state instead of pretending.
// ---------------------------------------------------------------------------

export type AdminSessionState = "loading" | "unconfigured" | "signed_out" | "ready";

export interface AdminSession {
  state: AdminSessionState;
  token: string | null;
  email: string | null;
  signingIn: boolean;
  signInError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAdminSession(): AdminSession {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [state, setState] = useState<AdminSessionState>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;
    void getSupabaseBrowser().then((client) => {
      if (!alive) return;
      if (!client) {
        setState("unconfigured");
        return;
      }
      setSupabase(client);
      void client.auth.getSession().then(({ data }) => {
        if (!alive) return;
        setToken(data.session?.access_token ?? null);
        setState(data.session ? "ready" : "signed_out");
      });
      const { data: listener } = client.auth.onAuthStateChange((_event, s) => {
        if (!alive) return;
        setToken(s?.access_token ?? null);
        setState(s ? "ready" : "signed_out");
      });
      unsub = () => listener.subscription.unsubscribe();
    });
    return () => {
      alive = false;
      if (unsub) unsub();
    };
  }, []);

  // Confirm the identity server-side (same endpoint the /admin dashboard
  // uses). Display only; authorization stays with each API call.
  useEffect(() => {
    if (!token) {
      setEmail(null);
      return;
    }
    let cancelled = false;
    fetch("/api/admin/me", { headers: { Authorization: "Bearer " + token }, cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.success) setEmail(j.email ?? null);
      })
      .catch(() => {
        // display-only; failures here never grant or deny anything
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const signIn = useCallback(
    async (emailValue: string, password: string) => {
      if (!supabase) return;
      setSignInError(null);
      setSigningIn(true);
      try {
        const { error } = await supabase.auth.signInWithPassword({ email: emailValue, password });
        if (error) setSignInError(error.message || "Sign in failed. Check your email and password.");
      } catch (err: any) {
        setSignInError(err?.message || "Sign in failed. Check your email and password.");
      } finally {
        setSigningIn(false);
      }
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setEmail(null);
  }, [supabase]);

  return { state, token, email, signingIn, signInError, signIn, signOut };
}

// ---------------------------------------------------------------------------
// One admin-authorized GET per surface. Normalizes every outcome into a
// state the AdminBoundary can render honestly: a missing endpoint (404/501/
// 503) is "unavailable", never invented data.
// ---------------------------------------------------------------------------

export type AdminResourceState = "loading" | "ok" | "unauthorized" | "forbidden" | "unavailable" | "error";

export interface AdminResource<T> {
  state: AdminResourceState;
  data: T | null;
  message?: string;
  reload: () => void;
}

export function useAdminResource<T>(token: string | null, path: string): AdminResource<T> {
  const [state, setState] = useState<AdminResourceState>("loading");
  const [data, setData] = useState<T | null>(null);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setState("loading");
    setMessage(undefined);
    void apiGet<T>(path, token).then((result) => {
      if (!alive) return;
      if (result.kind === "ok") {
        setData(result.data);
        setState("ok");
      } else if (result.kind === "unauthorized") {
        setState("unauthorized");
      } else if (result.kind === "forbidden") {
        setMessage(result.message);
        setState("forbidden");
      } else if (result.kind === "unavailable") {
        setState("unavailable");
      } else {
        setMessage(result.message);
        setState("error");
      }
    });
    return () => {
      alive = false;
    };
  }, [token, path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, data, message, reload };
}

// Shared date formatting for the operations surfaces.
export function fmtDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

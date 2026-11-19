import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser, isRecoveryAccessToken } from "@/lib/supabaseBrowser";
import type { CareSessionFence } from "../../../care/api";
import type { AdminLoader } from "../../adapters/adminOps";

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

/** Local dispatch/display restriction only. Every endpoint still authorizes server-side. */
export interface AdminSessionBinding {
  readonly generation: string;
  isCurrent(): boolean;
  sessionFence: CareSessionFence;
}

export interface AdminSession {
  state: AdminSessionState;
  token: string | null;
  email: string | null;
  signingIn: boolean;
  signInError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Optional for existing callers/fixtures; this hook always returns a value or null. */
  binding?: AdminSessionBinding | null;
}

export type AdminPreSignOutTask = () => void | Promise<void>;

const adminPreSignOutTasks = new Set<AdminPreSignOutTask>();
// A credential-free sequence prevents reuse across hook instances and effect remounts.
let nextAdminBindingGeneration = 0;

/**
 * Registers authenticated cleanup that must finish before the canonical admin
 * session is signed out. The returned disposer is identity-bound to this exact
 * task so React Strict Mode remounts cannot remove a newer registration.
 */
export function registerAdminPreSignOutTask(task: AdminPreSignOutTask): () => void {
  adminPreSignOutTasks.add(task);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    adminPreSignOutTasks.delete(task);
  };
}

async function runAdminPreSignOutTasks(): Promise<void> {
  for (const task of Array.from(adminPreSignOutTasks)) {
    await task();
  }
}

export function useAdminSession(): AdminSession {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [state, setState] = useState<AdminSessionState>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [emailLookup, setEmailLookup] = useState<{ isCurrent(): boolean; load(): Promise<Response> } | null>(null);
  const emailGeneration = useRef(0);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [binding, setBinding] = useState<AdminSessionBinding | null>(null);
  const signOutInFlight = useRef<Promise<void> | null>(null);
  const signInIntent = useRef(0);
  const reportingRevoked = useRef(false);
  const revokeReporting = useRef<() => void>(() => {});
  const resumeReporting = useRef<(session: Session | null, intent: number) => void>(() => {});

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;
    let revision = 0;
    let initial = true;
    let ordinarySessionClosed = false;
    type Identity = { token: string; userId: string };
    let current: { identity: Identity; revoke(): void } | null = null;
    let lastSignIn: { identity: Identity; intent: number; revision: number } | null = null;
    let displayedIdentity: { token: string; userId: string | null } | null = null;
    const displayIdentity = (session: Session | null) => {
      const observedToken = session?.access_token ?? null, userId = session?.user?.id ?? null;
      if (displayedIdentity && observedToken === displayedIdentity.token && userId === displayedIdentity.userId) return;
      // Revoke a pending lookup before React commits the new identity, including
      // the same token observed with a different SDK user. Email grants nothing.
      const generation = ++emailGeneration.current;
      displayedIdentity = observedToken ? { token: observedToken, userId } : null;
      setEmail(null);
      setEmailLookup(observedToken ? {
        isCurrent: () => alive && emailGeneration.current === generation,
        load: () => fetch("/api/admin/me", { headers: { Authorization: "Bearer " + observedToken }, cache: "no-store" }),
      } : null);
    };
    const identity = (session: Session | null): Identity | null => {
      const value = session?.access_token, userId = session?.user?.id;
      if (typeof value !== "string" || !value || typeof userId !== "string" || !userId) return null;
      try { return isRecoveryAccessToken(value) ? null : { token: value, userId }; } catch { return null; }
    };
    const same = (left: Identity, right: Identity) => left.token === right.token && left.userId === right.userId;
    const displayBinding = (observed: Identity | null) => {
      if (current && observed && !ordinarySessionClosed && !reportingRevoked.current && same(current.identity, observed)) return;
      current?.revoke(); current = null;
      if (!observed || ordinarySessionClosed || reportingRevoked.current) { setBinding(null); return; }
      let active = true;
      const value: AdminSessionBinding = {
        generation: `admin-session-${++nextAdminBindingGeneration}`,
        isCurrent: () => alive && active && !reportingRevoked.current,
        sessionFence: (session) => {
          const actual = identity(session);
          return value.isCurrent() && actual !== null && same(observed, actual);
        },
      };
      current = { identity: observed, revoke: () => { active = false; } };
      setBinding(value);
    };
    const revoke = () => { reportingRevoked.current = true; displayIdentity(null); displayBinding(null); };
    const resume = (session: Session | null, intent: number) => {
      const actual = identity(session);
      if (!alive || signOutInFlight.current || intent !== signInIntent.current || !lastSignIn
        || lastSignIn.intent !== intent || lastSignIn.revision !== revision || !actual
        || !same(lastSignIn.identity, actual) || ordinarySessionClosed) return;
      reportingRevoked.current = false; displayBinding(actual);
    };
    revokeReporting.current = revoke;
    resumeReporting.current = resume;
    const observe = (event: string, session: Session | null) => {
      const observed = identity(session);
      if (event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY") {
        signInIntent.current += 1;
        ordinarySessionClosed = true;
      } else if (!observed) {
        ordinarySessionClosed = true;
      } else if (event === "SIGNED_IN" && observed) ordinarySessionClosed = false;
      if (event === "SIGNED_IN" && observed) lastSignIn = { identity: observed, intent: signInIntent.current, revision };
      // Revoke old callbacks synchronously before React commits the new identity.
      displayBinding(event === "SIGNED_OUT" ? null : observed);
      displayIdentity(event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY" ? null : session);
      setToken(session?.access_token ?? null);
      setState(session ? "ready" : "signed_out");
    };
    void getSupabaseBrowser().then((client) => {
      if (!alive) return;
      if (!client) {
        setState("unconfigured");
        return;
      }
      setSupabase(client);
      const { data: listener } = client.auth.onAuthStateChange((event, session) => {
        if (!alive || (event === "INITIAL_SESSION" && !initial)) return;
        revision += 1; initial = false;
        observe(event, session);
      });
      unsub = () => listener.subscription.unsubscribe();
      const bootstrapRevision = revision;
      void client.auth.getSession().then(({ data, error }) => {
        if (!alive || !initial || revision !== bootstrapRevision) return;
        initial = false;
        observe("INITIAL_SESSION", error ? null : data.session);
      }).catch(() => {
        if (alive && initial && revision === bootstrapRevision) {
          initial = false; observe("INITIAL_SESSION", null);
        }
      });
    }).catch(() => {
      if (alive) { displayIdentity(null); displayBinding(null); setState("unconfigured"); }
    });
    return () => {
      alive = false;
      emailGeneration.current += 1;
      signInIntent.current += 1;
      current?.revoke(); current = null;
      if (revokeReporting.current === revoke) revokeReporting.current = () => {};
      if (resumeReporting.current === resume) resumeReporting.current = () => {};
      if (unsub) unsub();
    };
  }, []);

  // Confirm the identity server-side (same endpoint the /admin dashboard
  // uses). Display only; authorization stays with each API call.
  useEffect(() => {
    if (!emailLookup || !emailLookup.isCurrent()) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await emailLookup.load();
        if (cancelled || !emailLookup.isCurrent()) return;
        const verified = await response.json();
        if (!cancelled && emailLookup.isCurrent() && verified?.success) setEmail(verified.email ?? null);
      } catch {
        // Display-only; failures leave the new identity's label empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [emailLookup]);

  const signIn = useCallback(
    async (emailValue: string, password: string) => {
      if (!supabase) return;
      const intent = ++signInIntent.current;
      setSignInError(null);
      setSigningIn(true);
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: emailValue, password });
        if (error) setSignInError(error.message || "Sign in failed. Check your email and password.");
        else if (intent === signInIntent.current) resumeReporting.current(data?.session ?? null, intent);
      } catch (err: any) {
        setSignInError(err?.message || "Sign in failed. Check your email and password.");
      } finally {
        setSigningIn(false);
      }
    },
    [supabase],
  );

  const signOut = useCallback(() => {
    if (!supabase) return Promise.resolve();
    if (signOutInFlight.current) return signOutInFlight.current;
    signInIntent.current += 1;
    revokeReporting.current();

    const operation = (async () => {
      await runAdminPreSignOutTasks();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setEmail(null);
    })();
    signOutInFlight.current = operation;
    operation.then(
      () => {
        if (signOutInFlight.current === operation) signOutInFlight.current = null;
      },
      () => {
        if (signOutInFlight.current === operation) signOutInFlight.current = null;
      },
    );
    return operation;
  }, [supabase]);

  return { state, token, email, signingIn, signInError, signIn, signOut, binding };
}

// ---------------------------------------------------------------------------
// One admin-authorized GET per surface, loaded through a function from
// adapters/adminOps (pages never spell API paths; the adapter keeps the
// bearer discipline). Normalizes every outcome into a state the
// AdminBoundary can render honestly: a missing endpoint (404/501/503) is
// "unavailable", never invented data. Loaders with parameters must be
// identity-stable per parameter value (module-level, or useCallback keyed on
// the parameter) so the resource refetches exactly when the parameter
// changes.
// ---------------------------------------------------------------------------

export type AdminResourceState = "loading" | "ok" | "unauthorized" | "forbidden" | "unavailable" | "denied" | "error";

export interface AdminResource<T> {
  state: AdminResourceState;
  data: T | null;
  message?: string;
  /** Set when state is "denied": the machine code the UI routes on. */
  deniedCode?: string;
  reload: () => void;
}

export function useAdminResource<T>(token: string | null, load: AdminLoader<T>): AdminResource<T> {
  const [state, setState] = useState<AdminResourceState>("loading");
  const [data, setData] = useState<T | null>(null);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [deniedCode, setDeniedCode] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setState("loading");
    setMessage(undefined);
    setDeniedCode(undefined);
    void load(token).then((result) => {
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
      } else if (result.kind === "denied") {
        // The machine code, not the message, is what the boundary routes on.
        setDeniedCode(result.code);
        setMessage(result.message);
        setState("denied");
      } else {
        setMessage(result.message);
        setState("error");
      }
    });
    return () => {
      alive = false;
    };
  }, [token, load, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, data, message, deniedCode, reload };
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

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { getSupabaseBrowser, isRecoveryAccessToken } from "@/lib/supabaseBrowser";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { AE_APPLICATION_CONTEXT_PATH, AE_PORTAL_PATH, aeContextEnvelopeSchema } from "@shared/research/account-executive/context";
import { AeWorkspacePage } from "./AeWorkspacePage";
import { createAeCommandJournal, type AeCommandJournal } from "./workspace-api";

type Identity = Readonly<{ subject: string; sessionId: string; key: string }>;
type Lifetime = { identity: Identity; scopeId: string; instance: object; journal: AeCommandJournal; revoked: boolean };
type Credential = { identity: Identity; token: string; active: boolean; controller: AbortController };
type Phase = "checking" | "signed_out" | "recovery" | "unavailable" | "denied" | "verification_required";
type Screen = Readonly<{ phase: Phase }> | Readonly<{ phase: "ready"; credential: Credential; lifetime: Lifetime }>;

// Only local command coordination survives a route remount. No credential,
// customer result, Auth storage or permission lives in this module partition.
let retainedLifetime: Lifetime | null = null;
const closedSessions = new Set<string>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nonzero = (value: unknown): value is string => typeof value === "string" && uuid.test(value)
  && value.toLowerCase() !== "00000000-0000-0000-0000-000000000000";

function identityOf(session: Session | null): Identity | null {
  try {
    if (!session || !nonzero(session.user?.id) || !session.access_token || session.access_token.length > 65_536) return null;
    const parts = session.access_token.split(".");
    if (parts.length !== 3 || !parts[1] || parts[1].length > 16_384 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims: unknown = JSON.parse(globalThis.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return null;
    const { sub, session_id: sessionId } = claims as { sub?: unknown; session_id?: unknown };
    if (!nonzero(sub) || !nonzero(sessionId) || sub.toLowerCase() !== session.user.id.toLowerCase()) return null;
    // Unverified claims only partition ephemeral UI work. Both actual API
    // boundaries verify the credential, purpose, current MFA and authority.
    const subject = sub.toLowerCase(), id = sessionId.toLowerCase();
    return { subject, sessionId: id, key: subject + ":" + id };
  } catch { return null; }
}
function retireLifetime(closeIdentity: boolean, identity?: Identity | null) {
  if (closeIdentity && identity) closedSessions.add(identity.key);
  if (retainedLifetime) {
    if (closeIdentity) closedSessions.add(retainedLifetime.identity.key);
    retainedLifetime.revoked = true; retainedLifetime = null;
  }
}
function lifetimeFor(identity: Identity, scopeId: string): Lifetime | null {
  if (closedSessions.has(identity.key)) return null;
  if (retainedLifetime && (retainedLifetime.identity.key !== identity.key || retainedLifetime.scopeId !== scopeId)) {
    retireLifetime(retainedLifetime.identity.key !== identity.key);
  }
  if (!retainedLifetime) {
    const instance = Object.freeze({});
    retainedLifetime = { identity, scopeId, instance, journal: createAeCommandJournal(instance, identity.subject, scopeId), revoked: false };
  }
  return retainedLifetime;
}

/** Canonical SDK observer and server-selected partition metadata only.
 * Root owns the global route, return-to allowlist, navigation and API wall. */
export function AePortalRoute() {
  const [screen, setScreen] = useState<Screen>({ phase: "checking" });
  const credentialRef = useRef<Credential | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    let mounted = true, revision = 0, bootstrapOpen = true;
    let lastIdentity: Identity | null = null;
    let displayed: Screen = { phase: "checking" };
    let unsubscribe: (() => void) | undefined;
    const invalidate = () => {
      const previous = credentialRef.current;
      if (previous) { previous.active = false; previous.controller.abort(); }
      credentialRef.current = null;
    };
    const display = (value: Screen) => {
      if (!mounted) return;
      displayed = value;
      // The unchanged page owns its own async fence. Unmount it during the
      // actual SDK event, before any old private callback can dispatch/publish.
      flushSync(() => setScreen(value));
    };
    const live = (credential: Credential, ticket: number) => mounted && ticket === revision
      && credential.active && credentialRef.current === credential && !credential.controller.signal.aborted;
    async function loadContext(credential: Credential, ticket: number) {
      if (!live(credential, ticket)) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          (async () => {
            const response = await fetch(AE_APPLICATION_CONTEXT_PATH, { method: "GET", cache: "no-store", credentials: "same-origin", redirect: "error",
              headers: { Authorization: `Bearer ${credential.token}`, Accept: "application/json" }, signal: credential.controller.signal });
            if (!live(credential, ticket)) return null;
            const body: unknown = await response.json();
            return live(credential, ticket) ? { status: response.status, body } : null;
          })(),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
            credential.controller.abort(); reject(new Error("context_wait_expired"));
          }, 30_000); }),
        ]);
        // A timeout aborts the transport. The same observation still owns the
        // unavailable state; a later SDK event or cleanup never does.
        if (!mounted || ticket !== revision || credentialRef.current !== credential || !credential.active || !response) return;
        const parsed = aeContextEnvelopeSchema.safeParse(response.body);
        if (!parsed.success) { display({ phase: "unavailable" }); return; }
        if (response.status !== 200 || !parsed.data.ok) {
          const code = parsed.data.ok ? null : parsed.data.code;
          display({ phase: code === "access_denied" && response.status === 401 ? "verification_required"
            : code === "access_denied" && response.status === 403 ? "denied" : "unavailable" });
          return;
        }
        const lifetime = lifetimeFor(credential.identity, parsed.data.value.scopeId);
        if (!lifetime || !live(credential, ticket)) { display({ phase: "unavailable" }); return; }
        display({ phase: "ready", credential, lifetime });
      } catch {
        if (mounted && ticket === revision && credentialRef.current === credential && credential.active) display({ phase: "unavailable" });
      } finally { clearTimeout(timer); }
    }
    const beginCredential = (identity: Identity, token: string, ticket: number) => {
      const credential: Credential = { identity, token, active: true, controller: new AbortController() };
      credentialRef.current = credential; display({ phase: "checking" });
      // Never await or re-enter SDK Auth while its callback holds SDK locks.
      queueMicrotask(() => { if (live(credential, ticket)) void loadContext(credential, ticket); });
    };
    const observe = (event: string, session: Session | null) => {
      if (!mounted || (event === "INITIAL_SESSION" && !bootstrapOpen)) return;
      bootstrapOpen = false; const ticket = ++revision;
      invalidate();
      const identity = identityOf(session);
      if (event === "SIGNED_OUT" || (!session && event === "INITIAL_SESSION")) {
        retireLifetime(true, lastIdentity ?? identity); lastIdentity = null;
        display({ phase: "signed_out" }); return;
      }
      if (event === "PASSWORD_RECOVERY" || session && isRecoveryAccessToken(session.access_token)) {
        retireLifetime(true, lastIdentity ?? identity); if (identity) closedSessions.add(identity.key);
        lastIdentity = null; display({ phase: "recovery" }); return;
      }
      if (!identity || !session) {
        retireLifetime(true, lastIdentity); lastIdentity = null;
        display({ phase: "unavailable" }); return;
      }
      if (closedSessions.has(identity.key)) {
        display({ phase: displayed.phase === "recovery" ? "recovery" : displayed.phase === "signed_out" ? "signed_out" : "unavailable" }); return;
      }
      if (lastIdentity && lastIdentity.key !== identity.key) retireLifetime(true, lastIdentity);
      else if (retainedLifetime && retainedLifetime.identity.key !== identity.key) retireLifetime(true);
      lastIdentity = identity; beginCredential(identity, session.access_token, ticket);
    };
    retryRef.current = () => {
      const credential = credentialRef.current;
      if (!mounted || !credential?.active || closedSessions.has(credential.identity.key)) return;
      invalidate(); beginCredential(credential.identity, credential.token, ++revision);
    };
    void getSupabaseBrowser().then(async client => {
      if (!mounted) return;
      if (!client) { display({ phase: "unavailable" }); return; }
      const { data } = client.auth.onAuthStateChange((event, session) => observe(event, session));
      unsubscribe = () => data.subscription.unsubscribe();
      const captured = revision;
      try {
        const result = await client.auth.getSession();
        if (!mounted) return;
        if (captured !== revision || !bootstrapOpen) {
          const superseded = identityOf(result.data.session);
          if (superseded && superseded.key !== lastIdentity?.key) closedSessions.add(superseded.key);
          return;
        }
        if (result.error) { bootstrapOpen = false; invalidate(); display({ phase: "unavailable" }); }
        else observe("INITIAL_SESSION", result.data.session);
      } catch {
        if (mounted && captured === revision && bootstrapOpen) { bootstrapOpen = false; invalidate(); display({ phase: "unavailable" }); }
      }
    }).catch(() => { if (mounted) { invalidate(); display({ phase: "unavailable" }); } });
    return () => {
      mounted = false; ++revision; invalidate(); retryRef.current = null;
      unsubscribe?.(); lastIdentity = null;
    };
  }, []);

  const ready = screen.phase === "ready" && screen.credential.active && credentialRef.current === screen.credential
    && retainedLifetime === screen.lifetime && !screen.lifetime.revoked ? screen : null;
  const phase = screen.phase === "ready" ? "checking" : screen.phase;
  const title: Record<Phase, string> = { checking: "Checking your AE session", signed_out: "Sign-in required", recovery: "Recovery session",
    unavailable: "AE workspace unavailable", denied: "AE workspace access denied", verification_required: "Sign-in verification required" };
  return <PageShell><SeoHead title="Private AE workspace, xenios" description="Private account executive workspace."
    path={AE_PORTAL_PATH} robots="noindex, nofollow" />
    {ready ? <AeWorkspacePage scopeId={ready.lifetime.scopeId} scopeLabel="Operational workspace" journal={ready.lifetime.journal}
      session={{ state: "ready", actorAuthUserId: ready.credential.identity.subject, accessToken: ready.credential.token, sessionInstance: ready.lifetime.instance }} />
      : <section className="ae-workspace" aria-labelledby="ae-portal-state-title"><h1 id="ae-portal-state-title">{title[phase]}</h1>
        {phase === "checking" ? <p role="status">Confirming your ordinary session and server-selected workspace…</p>
          : phase === "recovery" ? <p role="alert">Finish account recovery, then sign in normally before opening this private workspace.</p>
          : phase === "signed_out" ? <p>Sign in with the account assigned to this private workspace.</p>
          : phase === "verification_required" ? <p role="alert">Your session could not be verified. Sign in and complete any required verification.</p>
          : phase === "denied" ? <p role="alert">This session does not permit the AE workspace. No customer details have been loaded.</p>
          : <p role="alert">The current workspace could not be confirmed. No assignment or scope is inferred from this failure.</p>}
        {(phase === "signed_out" || phase === "verification_required" || phase === "recovery") && <a className="btn btn-primary" href={researchAuthPath("/research/sign-in", AE_PORTAL_PATH)}>Sign in securely</a>}
        {(phase === "unavailable" || phase === "denied" || phase === "verification_required") && <button type="button" onClick={() => retryRef.current?.()}>Check current workspace</button>}
      </section>}
  </PageShell>;
}
export default AePortalRoute;

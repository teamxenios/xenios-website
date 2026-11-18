import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser, isRecoveryAccessToken } from "@/lib/supabaseBrowser";

type Challenge = { id: string; factorId: string; expiresAt: number };
type View = { phase: "loading" | "ready" | "challenge" | "busy" | "complete" | "unavailable" | "error";
  factors: string[]; challenge?: Challenge; message?: string };
type Context = { client: SupabaseClient; token: string; generation: number };
const loading: View = { phase: "loading", factors: [] };
const failure = "Additional verification could not be completed. Check your session and start again with a new code.";
class ChangedSession extends Error {}

/** An existing-factor sign-in step only. Neither MFA nor this advisory display
 * grants a Care role, scope, or permission; every request still goes to server guards.
 */
export function StaffSessionAssurance({ subjectId, credentialRevision, onVerified, onSessionInvalid }: {
  subjectId: string; credentialRevision: number; onVerified: () => void; onSessionInvalid?: () => void;
}) {
  const [view, setView] = useState<View>(loading);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [retry, setRetry] = useState(0);
  const generation = useRef(0), busy = useRef(false), recoveryPurpose = useRef(false);
  const context = useRef<Context | null>(null);
  const codeInput = useRef<HTMLInputElement>(null), message = useRef<HTMLParagraphElement>(null);
  const beginButton = useRef<HTMLButtonElement>(null), retryButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const id = useId();

  async function ordinarySession(client: SupabaseClient) {
    const result = await client.auth.getSession();
    const session = result.data.session;
    if (result.error) throw new Error("session");
    if (recoveryPurpose.current || !session?.access_token || !subjectId
      || session.user?.id !== subjectId || isRecoveryAccessToken(session.access_token)) throw new ChangedSession();
    return session;
  }
  const active = (ctx: Context) => generation.current === ctx.generation && context.current === ctx;
  async function current(ctx: Context) {
    if (!active(ctx)) throw new Error("stale");
    const session = await ordinarySession(ctx.client);
    if (!active(ctx)) throw new Error("stale");
    if (session.access_token !== ctx.token) throw new ChangedSession();
  }
  function fail(ctx: Context, text = failure) {
    if (!active(ctx)) return;
    busy.current = false; context.current = null; setCode(""); setFactorId("");
    setView({ phase: "error", factors: [], message: text });
  }

  useEffect(() => {
    const observed = ++generation.current;
    let unsubscribe: (() => void) | undefined;
    context.current = null; busy.current = false;
    setCode(""); setFactorId(""); setView(loading);
    const alive = () => generation.current === observed;
    void (async () => {
      const client = await getSupabaseBrowser();
      if (!alive()) return;
      if (!client) throw new Error("unavailable");
      // Never await SDK methods inside its auth callback. Invalidate pending UI
      // work immediately; a new effect reads the canonical session afterwards.
      const { data } = client.auth.onAuthStateChange((event) => {
        if (event === "INITIAL_SESSION" || !alive()) return;
        if (event === "PASSWORD_RECOVERY") recoveryPurpose.current = true;
        else if (event === "SIGNED_IN") recoveryPurpose.current = false;
        ++generation.current; context.current = null; busy.current = false;
        setCode(""); setFactorId(""); setView(loading); setRetry((value) => value + 1);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      const session = await ordinarySession(client);
      if (!alive()) return;
      const ctx = { client, token: session.access_token, generation: observed };
      context.current = ctx;
      const user = await client.auth.getUser(ctx.token);
      await current(ctx);
      if (user.error) throw new Error("identity");
      if (user.data.user?.id !== subjectId) throw new ChangedSession();
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel(ctx.token);
      await current(ctx);
      if (assurance.error) throw new Error("assurance");
      // nextLevel describes a possible future session, never completed MFA.
      if (assurance.data.currentLevel === "aal2") { setView({ phase: "complete", factors: [] }); return; }
      if (assurance.data.currentLevel !== "aal1") throw new Error("assurance");
      const factors = await client.auth.mfa.listFactors();
      await current(ctx);
      if (factors.error) throw new Error("factors");
      const supported = factors.data.all.filter((factor) => factor.factor_type === "totp"
        && factor.status === "verified").map((factor) => factor.id);
      setFactorId(supported[0] ?? "");
      setView({ phase: supported.length ? "ready" : "unavailable", factors: supported });
    })().catch((error) => {
      if (!alive()) return;
      context.current = null; busy.current = false; setCode(""); setFactorId("");
      setView({ phase: "error", factors: [], message: failure });
      if (error instanceof ChangedSession) onSessionInvalid?.();
    });
    return () => { ++generation.current; context.current = null; busy.current = false; unsubscribe?.(); };
  }, [subjectId, credentialRevision, retry]);

  useEffect(() => {
    if (view.phase === "challenge") {
      const field = codeInput.current;
      field?.focus();
      // Wipe the detached field too: an in-flight form event may retain that DOM
      // node after React removes it on success, error, session change or unmount.
      return () => { if (field) field.value = ""; };
    }
    else if (view.phase === "error") message.current?.focus();
    else if (restoreFocus.current && view.phase === "ready") beginButton.current?.focus();
    else if (restoreFocus.current && view.phase === "unavailable") retryButton.current?.focus();
    if (view.phase !== "busy" && view.phase !== "loading") restoreFocus.current = false;
  }, [view.phase]);
  useEffect(() => {
    if (view.phase !== "challenge" || !view.challenge) return;
    const ctx = context.current;
    if (!ctx) return;
    const timer = window.setTimeout(() => fail(ctx, "This verification step expired. Start again with a new code."),
      Math.max(0, view.challenge.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [view.phase, view.challenge]);

  function recheck() {
    restoreFocus.current = true; setCode(""); setRetry((value) => value + 1);
  }

  async function begin() {
    const ctx = context.current;
    if (!ctx || busy.current || view.phase !== "ready" || !view.factors.includes(factorId)) return;
    busy.current = true; setCode(""); setView({ ...view, phase: "busy" });
    try {
      await current(ctx);
      const result = await ctx.client.auth.mfa.challenge({ factorId });
      await current(ctx);
      if (result.error || result.data.type !== "totp" || !result.data.id
        || !Number.isFinite(result.data.expires_at) || result.data.expires_at * 1000 <= Date.now()) throw new Error("challenge");
      busy.current = false;
      setView({ phase: "challenge", factors: view.factors,
        challenge: { id: result.data.id, factorId, expiresAt: result.data.expires_at * 1000 } });
    } catch (error) { if (active(ctx) && error instanceof ChangedSession) onSessionInvalid?.(); fail(ctx); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    const ctx = context.current, challenge = view.challenge;
    if (!ctx || busy.current || view.phase !== "challenge" || !challenge || !/^\d{6}$/.test(code)) return;
    let submitted = code;
    busy.current = true; setCode(""); setView({ ...view, phase: "busy" });
    try {
      await current(ctx);
      if (challenge.expiresAt <= Date.now()) throw new Error("expired");
      const verification = ctx.client.auth.mfa.verify({ factorId: challenge.factorId, challengeId: challenge.id, code: submitted });
      submitted = "";
      const result = await verification;
      // The SDK saves the session and emits MFA_CHALLENGE_VERIFIED before
      // resolving. That event normally invalidates this operation and reloads.
      if (!active(ctx)) return;
      if (result.error) throw new Error("verification");
      if (result.data.user.id !== subjectId) throw new ChangedSession();
      const session = await ordinarySession(ctx.client);
      if (!active(ctx)) return;
      if (session.access_token !== result.data.access_token) throw new ChangedSession();
      ctx.token = session.access_token;
      const user = await ctx.client.auth.getUser(ctx.token);
      await current(ctx);
      if (user.error) throw new Error("identity");
      if (user.data.user?.id !== subjectId) throw new ChangedSession();
      const assurance = await ctx.client.auth.mfa.getAuthenticatorAssuranceLevel(ctx.token);
      await current(ctx);
      if (assurance.error || assurance.data.currentLevel !== "aal2") throw new Error("assurance");
      busy.current = false; setView({ phase: "complete", factors: [] }); onVerified();
    } catch (error) { if (active(ctx) && error instanceof ChangedSession) onSessionInvalid?.(); fail(ctx); }
    finally { submitted = ""; }
  }

  return <section aria-labelledby={`${id}-heading`} aria-busy={view.phase === "loading" || view.phase === "busy"}
    className="mb-8 rounded-xl border border-border p-5 space-y-3">
    <h2 id={`${id}-heading`} className="font-semibold">Additional sign-in verification</h2>
    <p id={`${id}-help`}>Use an authenticator already verified on your account. Request access and staff actions still require the appropriate Care permissions.</p>
    {view.phase === "loading" && <p role="status">Checking sign-in verification...</p>}
    {view.phase === "busy" && <p role="status">Checking your authenticator...</p>}
    {view.phase === "complete" && <p role="status">Additional sign-in verification is complete for this session.</p>}
    {view.phase === "unavailable" && <><p>No verified authenticator supported by this page is available. Contact your account administrator for the approved setup path.</p>
      <button ref={retryButton} type="button" className="btn btn-secondary" onClick={recheck}>Check session again</button></>}
    {view.phase === "error" && <><p ref={message} role="alert" tabIndex={-1}>{view.message}</p>
      <button ref={retryButton} type="button" className="btn btn-secondary" onClick={recheck}>Check session again</button></>}
    {view.phase === "ready" && <>
      {view.factors.length > 1 && <div><label htmlFor={`${id}-factor`}>Authenticator</label>{" "}
        <select id={`${id}-factor`} className="block max-w-full rounded-md border border-border bg-background px-3 py-2"
          value={factorId} onChange={(event) => setFactorId(event.target.value)}>
          {view.factors.map((value, index) => <option key={value} value={value}>Authenticator {index + 1}</option>)}
        </select></div>}
      <button ref={beginButton} type="button" className="btn btn-secondary" onClick={() => void begin()}>Continue with authenticator</button>
    </>}
    {view.phase === "challenge" && <form onSubmit={(event) => void verify(event)} className="space-y-3">
      <div><label htmlFor={`${id}-code`}>Six-digit authenticator code</label>{" "}
        <input ref={codeInput} id={`${id}-code`} type="text" inputMode="numeric" autoComplete="one-time-code"
          className="block w-full max-w-xs rounded-md border border-border bg-background px-3 py-2"
          aria-describedby={`${id}-help`} pattern="[0-9]{6}" maxLength={6} required value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
      <button type="submit" className="btn btn-primary" disabled={!/^\d{6}$/.test(code)}>Verify authenticator</button>{" "}
      <button type="button" className="btn btn-secondary" onClick={recheck}>Cancel verification</button>
    </form>}
  </section>;
}

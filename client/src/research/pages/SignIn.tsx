import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import SeoHead from "@/components/SeoHead";
import { getSupabaseBrowser, isRecoveryAccessToken } from "@/lib/supabaseBrowser";
import { PageIntro } from "../components";
import { useResearch } from "../core";
import { denialDestination, memberDestination, safeResearchReturnTo } from "../lib/member-routing";
import { researchAuthPath } from "@shared/research/auth-return-to";

// Ordinary Supabase sign-in; canonical customer access is verified by the
// server. An Auth account alone grants no private customer or partner access.

function pendingClaimDestination(returnTo: string | null): string | null {
  if (returnTo !== "/research/apply/status") return null;
  try {
    return window.sessionStorage.getItem("xr-application-token")?.trim() ? returnTo : null;
  } catch { return null; }
}

export default function SignIn() {
  const { establishMemberSession, peekMemberDenial, recovery } = useResearch();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const returnTo = safeResearchReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lifecycle = useRef({ active: false, generation: 0 });
  const recoveryRef = useRef(recovery);
  recoveryRef.current = recovery;
  // Read afresh after every await; recovery can change while Auth is pending.
  const recoveryPending = () => recoveryRef.current === "pending";
  useEffect(() => {
    lifecycle.current.active = true;
    return () => { lifecycle.current.active = false; lifecycle.current.generation++; };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !lifecycle.current.active) return;
    if (recoveryPending()) {
      navigate(denialDestination("recovery_session"));
      return;
    }
    const generation = ++lifecycle.current.generation;
    const current = () => lifecycle.current.active && lifecycle.current.generation === generation;
    setBusy(true);
    setError(null);
    try {
      const supabase = await getSupabaseBrowser();
      if (!current()) return;
      if (!supabase) {
        setError("Sign-in is not available right now.");
        return;
      }
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (!current()) return;
      if (signInError || !data.session) {
        setError("That email and password combination is not correct.");
        return;
      }
      const submitted = data.session;
      let token = submitted.access_token;
      // A refresh may replace the password token, but a different principal
      // must not inherit this submission or its application link. Bound the
      // retry loop; an unstable session requires another explicit sign-in.
      for (let attempt = 0; attempt < 3; attempt++) {
        const before = (await supabase.auth.getSession()).data.session;
        if (!current()) return;
        if (!before || (before.user?.id !== submitted.user?.id)
          || (before.access_token !== token && !submitted.user?.id)) break;
        token = before.access_token;
        if (recoveryPending() || isRecoveryAccessToken(token)) {
          navigate(denialDestination("recovery_session"));
          return;
        }
        const verifiedMember = await establishMemberSession(token);
        const after = (await supabase.auth.getSession()).data.session;
        if (!current()) return;
        if (!after || after.user?.id !== submitted.user?.id) break;
        if (recoveryPending() || isRecoveryAccessToken(after.access_token)) {
          navigate(denialDestination("recovery_session"));
          return;
        }
        if (after.access_token !== token) {
          if (!submitted.user?.id) break;
          token = after.access_token;
          continue;
        }
        if (verifiedMember) {
          navigate(memberDestination(verifiedMember, returnTo));
          return;
        }
        // The latest server denial always wins over a navigation hint.
        const denial = peekMemberDenial();
        const claimDestination = pendingClaimDestination(returnTo);
        if (denial?.code && !(denial.code === "account_access_required" && claimDestination)) {
          navigate(denialDestination(denial.code));
          return;
        }
        if (claimDestination) {
          // Keep only the ordinary Auth session. ApplyStatus must submit the
          // bearer + ephemeral link to the server; this grants nothing here.
          navigate(claimDestination);
          return;
        }
        setError("Your sign-in was retained, but customer access could not be verified. Use your approval link to finish account setup, or contact support.");
        return;
      }
      if (current()) setError("Your session changed while signing in. Please try again.");
    } catch {
      if (current()) setError("Sign-in failed. Please try again.");
    } finally {
      if (current()) setBusy(false);
    }
  }

  return (
    <>
      <SeoHead title="Account sign in, xenios research" description="Sign in to your Xenios customer account." path="/research/sign-in" />
      <PageIntro
        eyebrow="Your account"
        title="Sign in."
        lead="Use the email and password connected to your Xenios account. An approval link connects approved customer access to your account; it does not replace your password."
      />
      <section className="container-x pb-20">
        <form onSubmit={onSubmit} className="max-w-[420px] space-y-5" data-testid="form-member-signin">
          <div>
            <label htmlFor="ms-email" className="form-label">Email</label>
            <input id="ms-email" type="email" autoComplete="email" className="input-field" style={{ fontSize: 16 }} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="ms-password" className="form-label">Password</label>
            <div className="relative">
              <input id="ms-password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="input-field" style={{ fontSize: 16, paddingRight: 72 }} value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className="absolute right-2 top-0 min-h-11 min-w-11 underline text-sm" aria-controls="ms-password" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button>
            </div>
          </div>
          {error && <p className="body-s" role="alert" style={{ color: "var(--error)" }} data-testid="text-signin-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="button-member-signin">
            {busy ? "Signing in" : "Sign in"}
          </button>
          <p className="body-s text-ink-mute">
            <Link href={researchAuthPath("/research/reset-password", returnTo)} className="underline ra-documentation-link" data-testid="link-forgot-password">Forgot your password?</Link>
          </p>
          <p className="body-s text-ink-mute">
            Returning customers can sign in normally. If you still need to finish approved account setup, open your secure approval link and continue with this same sign-in.
          </p>
        </form>
        {/*
          SEN-0025. Every other /research page offers a way out: the gateway has
          a footer, Apply and the policy pages carry "Back to gateway" plus a
          footer, and Reset password links Member Login and Support. Sign in had
          none of them, so it was the only dead end in the surface, and the only
          page that asks for credentials while offering no route to the Privacy
          Policy or Terms it is collecting them under.
        */}
        <div className="max-w-[420px] mt-8 space-y-3 border-t border-line pt-6">
          <p className="body-s text-ink-mute">
            <Link href="/research" className="underline ra-documentation-link" data-testid="link-signin-gateway">Back to gateway</Link>
          </p>
          <p className="body-s text-ink-mute">
            Need customer access? <Link href="/research/apply" className="underline ra-documentation-link" data-testid="link-signin-apply">View application information</Link>
          </p>
          <p className="body-s text-ink-mute">
            <Link href="/research/policies/privacy" className="underline ra-documentation-link" data-testid="link-signin-privacy">Privacy</Link>
            {" · "}
            <Link href="/research/policies/terms" className="underline ra-documentation-link" data-testid="link-signin-terms">Terms</Link>
            {" · "}
            <a href="mailto:team@xeniostechnology.com" className="underline ra-documentation-link" data-testid="link-signin-support">Support</a>
          </p>
        </div>
      </section>
    </>
  );
}

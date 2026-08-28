import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import SeoHead from "@/components/SeoHead";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { PageIntro } from "../components";
import { useResearch } from "../core";
import { denialDestination, memberDestination, safeResearchReturnTo } from "../lib/member-routing";

// Member sign-in (V3 sections 4.3 and 13). Auth is Supabase (same provider as
// the rest of the site); membership itself is verified SERVER-side on every
// protected route via /api/research/member/*. No UI-only authorization.
// After sign-in: active members land on the private member website
// (/research/member); approved-but-not-activated members land on the
// activation flow only (canonical access architecture).

export default function SignIn() {
  const { establishMemberSession, peekMemberDenial } = useResearch();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = await getSupabaseBrowser();
      if (!supabase) {
        setError("Sign-in is not available right now.");
        return;
      }
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (signInError || !data.session) {
        setError("That email and password combination is not correct.");
        return;
      }
      const submittedToken = data.session.access_token;
      let verifiedMember = await establishMemberSession(submittedToken);
      if (!verifiedMember) {
        // TOKEN_REFRESHED may supersede the exact token returned by
        // signInWithPassword while its verification is in flight. Verify and
        // retain that newer provider session; never let the stale request sign
        // it out.
        const currentToken = (await supabase.auth.getSession()).data.session?.access_token ?? null;
        if (currentToken && currentToken !== submittedToken) {
          verifiedMember = await establishMemberSession(currentToken);
          if (!verifiedMember) {
            setError("Your session changed while signing in. Please try again.");
            return;
          }
        }
      }
      if (verifiedMember) {
        const returnTo = safeResearchReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
        navigate(memberDestination(verifiedMember, returnTo));
      } else {
        // The server guard may have refused with a machine-readable code
        // (e.g. recovery_session). Route it to its distinct screen; the
        // Supabase session is left as-is because the screen's remedy (finish
        // the reset, settle billing) still needs it. Only the uncoded
        // no-membership refusal signs out locally and stays inline.
        const denial = peekMemberDenial();
        if (denial?.code) {
          navigate(denialDestination(denial.code));
          return;
        }
        const currentToken = (await supabase.auth.getSession()).data.session?.access_token ?? null;
        if (!currentToken || currentToken === submittedToken) {
          await supabase.auth.signOut({ scope: "local" });
        }
        setError("No research membership is attached to this account.");
      }
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SeoHead title="Member sign in, xenios research" description="Sign in to your xenios research membership." path="/research/sign-in" />
      <PageIntro
        eyebrow="Members"
        title="Sign in."
        lead="Use the email and password connected to your Xenios Research account. Your approval link is only used once when you first create your account."
      />
      <section className="container-x pb-20">
        <form onSubmit={onSubmit} className="max-w-[420px] space-y-5" data-testid="form-member-signin">
          <div>
            <label htmlFor="ms-email" className="form-label">Email</label>
            <input id="ms-email" type="email" autoComplete="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="ms-password" className="form-label">Password</label>
            <input id="ms-password" type="password" autoComplete="current-password" className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="body-s" role="alert" style={{ color: "var(--error)" }} data-testid="text-signin-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="button-member-signin">
            {busy ? "Signing in" : "Sign in"}
          </button>
          <p className="body-s text-ink-mute">
            <Link href="/research/reset-password" className="underline ra-documentation-link" data-testid="link-forgot-password">Forgot your password?</Link>
          </p>
          <p className="body-s text-ink-mute">
            Returning members do not need another approval email. If you have not created your account yet, use the one-time claim link in your approval email.
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
            Not a member yet? <Link href="/research/apply" className="underline ra-documentation-link" data-testid="link-signin-apply">Apply for membership</Link>
          </p>
          <p className="body-s text-ink-mute">
            <Link href="/research/policies/privacy" className="underline ra-documentation-link" data-testid="link-signin-privacy">Privacy</Link>
            {" · "}
            <Link href="/research/policies/terms" className="underline ra-documentation-link" data-testid="link-signin-terms">Terms</Link>
            {" · "}
            <a href="mailto:research@xeniostechnology.com" className="underline ra-documentation-link" data-testid="link-signin-support">Support</a>
          </p>
        </div>
      </section>
    </>
  );
}

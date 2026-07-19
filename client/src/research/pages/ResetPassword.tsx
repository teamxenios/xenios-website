import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { PageIntro } from "../components";

// Member password reset (ACCOUNT-EMAIL-SYSTEMS-001). Two modes on one route:
// - No recovery session: request a reset link (server-mediated, generic
//   response, never confirms whether an account exists).
// - Arriving from the Supabase recovery email: set the new password.
// The recovery redirect must be allowlisted in Supabase Auth settings
// (SITE/research/reset-password); see the production checklist.

type Mode = "request" | "recover";

export default function ResetPassword() {
  const [mode, setMode] = useState<Mode>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    (async () => {
      const supabase = await getSupabaseBrowser();
      if (!supabase || cancelled) return;
      // Supabase's recovery link signs the visitor in via URL hash tokens and
      // emits PASSWORD_RECOVERY; an existing recovery session also counts.
      const { data: sub } = supabase.auth.onAuthStateChange((event: string) => {
        if (event === "PASSWORD_RECOVERY" && !cancelled) setMode("recover");
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      const { data } = await supabase.auth.getSession();
      if (!cancelled && data.session && window.location.hash.includes("type=recovery")) {
        setMode("recover");
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  async function onRequest(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // Attach the Supabase session token when one exists (e.g. a visitor who
      // arrived from a recovery link but fell back to request mode): the
      // member-authed prefixes accept a bearer where the review cookie is
      // absent, so the request still reaches the endpoint.
      let auth: Record<string, string> = {};
      try {
        const supabase = await getSupabaseBrowser();
        const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null;
        if (token) auth = { Authorization: "Bearer " + token };
      } catch {
        /* cookie path still works */
      }
      const res = await fetch("/api/research/member/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        credentials: "same-origin",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setNotice(body.message || "If a member account exists for that address, a password reset email is on its way.");
      } else {
        setError(body?.message || "The request could not be processed. Please try again.");
      }
    } catch {
      setError("The request could not be processed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onSetPassword(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = await getSupabaseBrowser();
      if (!supabase) {
        setError("Password reset is not available right now.");
        return;
      }
      if (password.length < 10) {
        setError("Choose a password of at least 10 characters.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(
          updateError.message.toLowerCase().includes("expired") || updateError.message.toLowerCase().includes("session")
            ? "This reset link has expired or was already used. Request a new one below."
            : "The password could not be updated. Please try again.",
        );
        if (updateError.message.toLowerCase().includes("session")) setMode("request");
        return;
      }
      await supabase.auth.signOut();
      setDone(true);
    } catch {
      setError("The password could not be updated. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <SeoHead title="Password updated, xenios research" description="Your password has been updated." path="/research/reset-password" />
        <PageIntro eyebrow="Members" title="Password updated." lead="Sign in with your email and your new password." />
        <section className="container-x pb-20">
          <Link href="/research/sign-in" className="btn btn-primary" data-testid="link-reset-signin">Go to sign in</Link>
        </section>
      </>
    );
  }

  return (
    <>
      <SeoHead title="Reset password, xenios research" description="Reset your xenios research member password." path="/research/reset-password" />
      <PageIntro
        eyebrow="Members"
        title={mode === "recover" ? "Choose a new password." : "Reset your password."}
        lead={
          mode === "recover"
            ? "You arrived from a secure reset link. Choose a new password for your member account."
            : "Enter your member email and we will send a secure reset link."
        }
      />
      <section className="container-x pb-20">
        {mode === "recover" ? (
          <form onSubmit={onSetPassword} className="max-w-[420px] space-y-5" data-testid="form-reset-password">
            <div>
              <label htmlFor="rp-password" className="form-label">New password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="rp-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="input-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={10}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="body-s text-ink-mute"
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <p className="body-s text-ink-mute" style={{ marginTop: 8 }}>At least 10 characters.</p>
            </div>
            {error && <p className="body-s" role="alert" style={{ color: "var(--error)" }} data-testid="text-reset-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={busy} data-testid="button-set-password">
              {busy ? "Updating" : "Update password"}
            </button>
          </form>
        ) : (
          <form onSubmit={onRequest} className="max-w-[420px] space-y-5" data-testid="form-request-reset">
            <div>
              <label htmlFor="rp-email" className="form-label">Email</label>
              <input
                id="rp-email"
                type="email"
                autoComplete="email"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {notice && <p className="body-s text-ink" role="status" data-testid="text-reset-notice">{notice}</p>}
            {error && <p className="body-s" role="alert" style={{ color: "var(--error)" }} data-testid="text-reset-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={busy} data-testid="button-request-reset">
              {busy ? "Sending" : "Send reset link"}
            </button>
            <p className="body-s text-ink-mute">
              Remembered it? <Link href="/research/sign-in" className="underline">Sign in</Link>.
            </p>
          </form>
        )}
      </section>
    </>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import SeoHead from "@/components/SeoHead";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { PageIntro } from "../components";
import { useResearch } from "../core";

// Member password reset (founder decision, 2026-07-19): this page works from
// a FRESH browser without the shared review password. It is a minimal
// account-access page: email + send button + Member Login + Support, nothing
// else — no catalog, no member navigation, no application data.
//
// Recovery-mode detection lives in the PROVIDER (core.tsx), which captures
// the recovery marker synchronously before the Supabase client can consume
// the URL hash and preserves it in context until this page consumes it. This
// page never inspects window.location.hash itself.

export default function ResetPassword() {
  const { recovery, clearRecovery, signOutMember } = useResearch();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    recovery === "link_error" ? "This reset link has expired or was already used. Request a new one below." : null,
  );

  const mode: "recover" | "request" = recovery === "pending" ? "recover" : "request";

  // Abandonment cleanup (correction-pass blocker 2): a recovery session that
  // leaves this page without completing the reset is signed out and the
  // recovery state cleared, so no persisted limited-purpose session survives.
  // completedRef prevents the cleanup from racing a successful reset (which
  // already signed out) or a subsequent normal sign-in; cleanedRef makes the
  // cleanup idempotent.
  const wasRecoverRef = useRef(false);
  const completedRef = useRef(false);
  const cleanedRef = useRef(false);
  if (mode === "recover") wasRecoverRef.current = true;

  useEffect(() => {
    return () => {
      if (!wasRecoverRef.current || completedRef.current || cleanedRef.current) return;
      cleanedRef.current = true;
      clearRecovery();
      void signOutMember().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRequest(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/research/member/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      if (password.length < 10) {
        setError("Choose a password of at least 10 characters.");
        return;
      }
      if (password !== confirm) {
        setError("The passwords do not match.");
        return;
      }
      const supabase = await getSupabaseBrowser();
      if (!supabase) {
        setError("Password reset is not available right now.");
        return;
      }
      // The update applies only to the authenticated Supabase recovery
      // session's own user; without a live recovery session it fails safely.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        clearRecovery();
        setError("This reset link has expired or was already used. Request a new one below.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        const msg = updateError.message.toLowerCase();
        if (msg.includes("expired") || msg.includes("session") || msg.includes("invalid")) {
          clearRecovery();
          void signOutMember().catch(() => {});
          setError("This reset link has expired or was already used. Request a new one below.");
        } else {
          setError("The password could not be updated. Please try again.");
        }
        return;
      }
      // Successful reset: the recovery session is revoked through the
      // provider's canonical sign-out (clears member state, token, catalog,
      // and the Supabase session); a fresh password-authenticated sign-in is
      // required for any member access.
      completedRef.current = true;
      clearRecovery();
      await signOutMember();
      navigate("/research/sign-in");
    } catch {
      setError("The password could not be updated. Please try again.");
    } finally {
      setBusy(false);
    }
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
            <div>
              <label htmlFor="rp-confirm" className="form-label">Confirm new password</label>
              <input
                id="rp-confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className="input-field"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={10}
                required
              />
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
              <Link href="/research/sign-in" className="underline" data-testid="link-member-login">Member Login</Link>
            </p>
            <p className="body-s text-ink-mute">
              Need help? <a href="mailto:research@xeniostechnology.com" className="underline" data-testid="link-reset-support">Support</a>
            </p>
          </form>
        )}
      </section>
    </>
  );
}

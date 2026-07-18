import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import type { ApplicationStatusView } from "@shared/research/membership-types";
import { PageIntro } from "../components";

// Applicant-facing status page, reached from the signed link in every email.

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  submitted: { title: "In review", body: "Your application has been received and is waiting for review. You will hear from us by email." },
  resubmitted: { title: "In review", body: "Thank you for the additional information. Your application is back in review." },
  under_review: { title: "Under review", body: "Your application is being reviewed individually. You will hear from us by email." },
  more_information_requested: { title: "One more step", body: "We need a little more information to finish the review. Check your email for the details, or reply to the request directly." },
  approved_pending_payment: { title: "Approved", body: "Your application has been approved. Membership activation opens the in-depth onboarding." },
  payment_pending: { title: "Activation in progress", body: "Your activation is being confirmed." },
  active: { title: "Active", body: "Your membership is active. Welcome to xenios research." },
  paused: { title: "Paused", body: "Your membership is paused. Contact support to resume." },
  declined: { title: "Not approved", body: "We were not able to approve the application at this time. This decision does not reflect a medical judgment or personal assessment." },
  withdrawn: { title: "Withdrawn", body: "This application was withdrawn." },
  expired: { title: "Expired", body: "This approval expired before activation. Contact support if you would like to reopen it." },
};

// Approved applicants create their member account here. The signed status link
// (already proven to reach their inbox) is the claim credential; the password
// becomes their sign-in. The server enforces status and one-account-per-email.
function ClaimAccount() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password.length < 10) {
      setError("Choose a password of at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let token = "";
      try { token = window.sessionStorage.getItem("xr-application-token") || ""; } catch { /* fine */ }
      const res = await fetch("/api/research/member/claim", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) setClaimed(true);
      else setError(body?.message || "The account could not be created. Please try again.");
    } catch {
      setError("The account could not be created. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (claimed) {
    return (
      <div className="card" data-testid="card-claim-success">
        <p className="mono-cap text-pulse mb-2">Account created</p>
        <p className="body-s text-ink-2 mb-4">Your member account is ready. Sign in to continue.</p>
        <Link href="/research/sign-in" className="btn btn-primary">Sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4" data-testid="form-claim-account">
      <p className="mono-cap text-ink-mute">Create your member account</p>
      <p className="body-s text-ink-2">
        Set a password to open your account. Activation and the in-depth onboarding follow from there.
      </p>
      <div>
        <label htmlFor="ca-password" className="form-label">Password (10+ characters)</label>
        <input id="ca-password" type="password" autoComplete="new-password" className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="ca-confirm" className="form-label">Confirm password</label>
        <input id="ca-confirm" type="password" autoComplete="new-password" className="input-field" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      {error && <p className="body-s" role="alert" style={{ color: "var(--error)" }} data-testid="text-claim-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy} data-testid="button-claim-account">
        {busy ? "Creating" : "Create account"}
      </button>
    </form>
  );
}

export default function ApplyStatus() {
  const [view, setView] = useState<ApplicationStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState("");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    // Read the token, then immediately scrub it from the address bar so it can
    // never leak through referrer headers, browser history sync, or analytics.
    // It lives only in sessionStorage for this tab's session.
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("token");
    if (fromUrl) {
      try { window.sessionStorage.setItem("xr-application-token", fromUrl); } catch { /* fine */ }
      window.history.replaceState({}, "", "/research/apply/status");
    }
    let token = "";
    try { token = fromUrl || window.sessionStorage.getItem("xr-application-token") || ""; } catch { token = fromUrl || ""; }
    if (!token) {
      setError("This status link is not valid.");
      return;
    }
    let alive = true;
    fetch(`/api/research/applications/status?token=${encodeURIComponent(token)}`, { credentials: "same-origin", cache: "no-store" })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (ok && body?.ok) setView(body.application as ApplicationStatusView);
        else setError(body?.message || "Status could not be loaded.");
      })
      .catch(() => alive && setError("Status could not be loaded."));
    return () => {
      alive = false;
    };
  }, []);

  async function requestNewLink() {
    if (resending || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resendEmail.trim())) {
      setResendMessage("Enter a valid email address.");
      return;
    }
    setResending(true);
    setResendMessage(null);
    try {
      const res = await fetch("/api/research/applications/resend-link", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim().toLowerCase() }),
      });
      const body = await res.json().catch(() => null);
      setResendMessage(body?.message || "If an application exists for that address, a secure status link is on its way.");
    } catch {
      setResendMessage("The request could not be processed. Please try again.");
    } finally {
      setResending(false);
    }
  }

  const copy = view ? STATUS_COPY[view.status] ?? STATUS_COPY.submitted : null;

  return (
    <>
      <SeoHead title="Application status, xenios research" description="Check the status of your xenios research membership application." path="/research/apply/status" />
      <PageIntro eyebrow="Application status" title={copy ? copy.title : error ? "Status unavailable" : "Loading"} />
      <section className="container-x pb-20">
        <div className="max-w-[560px]">
          {error && (
            <div>
              <p className="body-l text-ink-2">{error}</p>
              <div className="card mt-8">
                <p className="mono-cap text-ink-mute mb-3">Lost your link?</p>
                <p className="body-s text-ink-2 mb-4">
                  Enter the email you applied with and we will send a fresh secure link to that address.
                </p>
                <label htmlFor="rs-email" className="form-label">Email</label>
                <input
                  id="rs-email"
                  type="email"
                  className="input-field"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  data-testid="input-resend-email"
                />
                {resendMessage && <p className="body-s text-ink-2 mt-3" role="status" data-testid="text-resend-message">{resendMessage}</p>}
                <button type="button" className="btn btn-secondary mt-4" onClick={() => void requestNewLink()} disabled={resending} data-testid="button-resend-link">
                  {resending ? "Sending" : "Send a new link"}
                </button>
              </div>
            </div>
          )}
          {view && copy && (
            <>
              <p className="body-l text-ink-2">Hi {view.firstName}. {copy.body}</p>
              {view.memberVisibleNote && (
                <div className="card bg-paper-2 mt-6">
                  <p className="mono-cap text-ink-mute mb-2">Note from xenios</p>
                  <p className="body-s text-ink-2">{view.memberVisibleNote}</p>
                </div>
              )}
              {view.status === "approved_pending_payment" && (
                <div className="mt-8">
                  <ClaimAccount />
                  {view.approvalExpiresAt && (
                    <p className="body-s text-ink-mute mt-4">
                      Your approval expires on {new Date(view.approvalExpiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
                    </p>
                  )}
                </div>
              )}
              {view.status === "more_information_requested" && (
                <div className="mt-8">
                  <Link href="/research/apply" className="btn btn-primary">Update my application</Link>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}

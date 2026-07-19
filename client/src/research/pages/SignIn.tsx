import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { PageIntro } from "../components";

// Member sign-in (V3 sections 4.3 and 13). Auth is Supabase (same provider as
// the rest of the site); membership itself is verified SERVER-side on every
// protected route via /api/research/member/*. No UI-only authorization.

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [member, setMember] = useState<{ firstName: string; status: string; applicationStatus: string | null } | null>(null);

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
      const res = await fetch("/api/research/member/me", {
        headers: { Authorization: "Bearer " + data.session.access_token },
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setMember(body.member);
      } else {
        await supabase.auth.signOut();
        setError(body?.message || "No research membership is attached to this account.");
      }
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (member) {
    return (
      <>
        <SeoHead title="Member, xenios research" description="Your xenios research membership." path="/research/sign-in" />
        <PageIntro eyebrow="Signed in" title={`Welcome back, ${member.firstName}.`} />
        <section className="container-x pb-20">
          <div className="max-w-[560px]">
            <div className="card">
              <p className="mono-label text-ink-mute">Membership status</p>
              <p className="body-l text-ink mt-2">
                {member.status === "active"
                  ? "Active."
                  : "Approved. Activation opens soon, and you will be emailed the moment it does."}
              </p>
            </div>
            <div className="mt-6 flex gap-4">
              <Link href="/research/member/welcome" className="btn btn-primary">Membership</Link>
              <Link href="/research" className="btn btn-ghost">Back to research</Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <SeoHead title="Member sign in, xenios research" description="Sign in to your xenios research membership." path="/research/sign-in" />
      <PageIntro
        eyebrow="Members"
        title="Sign in."
        lead="Member accounts open after an application is approved and claimed through the secure link in your email."
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
            Approved but no account yet? Use the secure link in your approval email to create one.
          </p>
        </form>
      </section>
    </>
  );
}

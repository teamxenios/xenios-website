import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { PageIntro } from "../components";
import { getAccountContext } from "./api";

// Uses the same Supabase browser client and credentials as member sign-in. The
// separate unmounted page exists only because an organization buyer need not
// also have a research_members row.
export default function AccountSignIn() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = await getSupabaseBrowser();
      if (!supabase) return setError("Sign-in is not available right now.");
      const signedIn = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (signedIn.error || !signedIn.data.session) {
        return setError("That email and password combination is not correct.");
      }
      const context = await getAccountContext();
      if (context.kind !== "ok") {
        await supabase.auth.signOut({ scope: "local" });
        return setError(context.message);
      }
      if (context.data.security.passwordChangeRequired) {
        navigate("/research/account/security/initial-password");
      } else {
        // Never guess a role for a multi-role person. The account home is
        // the canonical selector for personal and organization workspaces.
        navigate("/research/account");
      }
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageIntro eyebrow="Accounts" title="Sign in." lead="Use the email and password connected to your Xenios account." />
      <section className="container-x pb-20">
        <form onSubmit={submit} className="max-w-[420px] space-y-5" data-testid="account-sign-in">
          <div>
            <label className="form-label" htmlFor="account-email">Email</label>
            <input id="account-email" className="input-field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div>
            <label className="form-label" htmlFor="account-password">Password</label>
            <input id="account-password" className="input-field" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          {error && <p role="alert" className="body-s" style={{ color: "var(--error)" }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
          <p className="body-s text-ink-mute"><Link href="/research/reset-password" className="underline">Forgot your password?</Link></p>
          <p className="body-s text-ink-mute"><Link href="/research/access-hub" className="underline">View all access options</Link></p>
        </form>
      </section>
    </>
  );
}

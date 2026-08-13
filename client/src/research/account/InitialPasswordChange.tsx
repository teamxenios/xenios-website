import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { PageIntro } from "../components";
import { acknowledgeInitialPasswordChange, getAccountContext } from "./api";

export default function InitialPasswordChange() {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (password.length < 12) return setError("Choose a password of at least 12 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setBusy(true);
    try {
      const supabase = await getSupabaseBrowser();
      if (!supabase) return setError("Password change is not available right now.");
      const updated = await supabase.auth.updateUser({ password });
      setPassword("");
      setConfirm("");
      if (updated.error) return setError("The password could not be updated. Please try again.");
      const acknowledged = await acknowledgeInitialPasswordChange();
      if (acknowledged.kind !== "ok") return setError(acknowledged.message);
      const context = await getAccountContext();
      if (context.kind === "ok" && context.data.organizations[0]) {
        navigate(`/research/account/organizations/${context.data.organizations[0].id}`);
      } else {
        navigate("/research/account");
      }
    } catch {
      setError("The password could not be updated. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageIntro eyebrow="Account security" title="Choose your password." lead="Your initial credential must be replaced before organization data opens." />
      <section className="container-x pb-20">
        <form onSubmit={submit} className="max-w-[420px] space-y-5" data-testid="initial-password-change">
          <div>
            <label className="form-label" htmlFor="initial-password">New password</label>
            <input id="initial-password" className="input-field" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div>
            <label className="form-label" htmlFor="initial-password-confirm">Confirm new password</label>
            <input id="initial-password-confirm" className="input-field" type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </div>
          {error && <p role="alert" className="body-s" style={{ color: "var(--error)" }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Updating" : "Update password"}</button>
        </form>
      </section>
    </>
  );
}

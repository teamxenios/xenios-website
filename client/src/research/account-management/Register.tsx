import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import Turnstile from "@/components/Turnstile";
import { PageIntro } from "../components";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { ACCOUNT_SETTINGS_PATH, accountRegistrationSchema } from "@shared/research/account-management";
import { accountManagementApi } from "./api";

export default function Register() {
  const [enabled, setEnabled] = useState<boolean | null>(null), [busy, setBusy] = useState(false);
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState(""), [captchaGeneration, setCaptchaGeneration] = useState(0);
  const [notice, setNotice] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const lifecycle = useRef({ alive: false, generation: 0 });
  useEffect(() => {
    lifecycle.current.alive = true;
    const generation = ++lifecycle.current.generation;
    void accountManagementApi.config().then(config => {
      if (lifecycle.current.alive && lifecycle.current.generation === generation) setEnabled(config.registrationEnabled);
    }).catch(() => { if (lifecycle.current.alive && lifecycle.current.generation === generation) setEnabled(false); });
    return () => { lifecycle.current.alive = false; lifecycle.current.generation++; };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !enabled || notice) return;
    const parsed = accountRegistrationSchema.safeParse({ email, password, ...(name.trim() ? { displayName: name } : {}), captchaToken: captcha });
    if (!parsed.success) { setPassword(""); setError("Check your details, choose a password of 12–128 characters and complete verification."); return; }
    const generation = ++lifecycle.current.generation;
    setBusy(true); setError(null); setPassword(""); setCaptcha("");
    try {
      const reply = await accountManagementApi.register(parsed.data);
      if (lifecycle.current.alive && lifecycle.current.generation === generation) setNotice(reply.message);
    } catch {
      if (lifecycle.current.alive && lifecycle.current.generation === generation) setError("Registration could not be confirmed. Check your inbox, sign in or use recovery before trying again.");
    } finally {
      if (lifecycle.current.alive && lifecycle.current.generation === generation) { setBusy(false); setCaptchaGeneration(value => value + 1); }
    }
  }
  const signIn = researchAuthPath("/research/sign-in", ACCOUNT_SETTINGS_PATH);
  return <>
    <SeoHead title="Create your sign-in, xenios" description="Create a Xenios sign-in. Workspace access is reviewed separately." path="/research/register" publicMetadata={false} />
    <PageIntro eyebrow="Your account" title="Create your sign-in." lead="Use one sign-in for Xenios. Customer, business, partner and professional access have their own requirements." />
    <section className="container-x pb-20 max-w-[640px]">
      {enabled === null && <p role="status">Checking registration availability…</p>}
      {enabled === false && <p role="status">Registration is not available through this page yet. Existing accounts can still sign in.</p>}
      {enabled && !notice && <form onSubmit={submit} className="space-y-5" aria-label="Create a sign-in">
        <div><label className="form-label" htmlFor="register-name">Display name (optional)</label><input id="register-name" className="input-field" autoComplete="nickname" maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={busy} /></div>
        <div><label className="form-label" htmlFor="register-email">Email</label><input id="register-email" className="input-field" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /></div>
        <div><label className="form-label" htmlFor="register-password">Password</label><input id="register-password" className="input-field" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></div>
        <Turnstile key={captchaGeneration} onToken={setCaptcha} />
        <p className="body-s">Creating a sign-in does not enroll you in a service or grant workspace, clinical, affiliate or payment access.</p>
        <button className="btn btn-primary" type="submit" disabled={busy || !captcha}>{busy ? "Submitting…" : "Create sign-in"}</button>
      </form>}
      {error && <p role="alert" className="body-s mt-4">{error}</p>}
      {notice && <p role="status" className="body-s">{notice}</p>}
      <nav aria-label="Account help" className="mt-6 space-y-3">
        <p><Link href={signIn} className="underline">Already have an account? Sign in</Link></p>
        <p><Link href={researchAuthPath("/research/reset-password", ACCOUNT_SETTINGS_PATH)} className="underline">Password recovery</Link></p>
        <p><Link href="/privacy" className="underline">Privacy</Link>{" · "}<Link href="/terms" className="underline">Terms</Link></p>
      </nav>
    </section>
  </>;
}

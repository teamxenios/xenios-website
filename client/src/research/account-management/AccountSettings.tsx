import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import type { Session } from "@supabase/supabase-js";
import SeoHead from "@/components/SeoHead";
import { getSupabaseBrowser, isRecoveryAccessToken } from "@/lib/supabaseBrowser";
import { PageIntro } from "../components";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { ACCOUNT_SETTINGS_PATH, accountSelfMutationSchema, type AccountIdentity,
  type AccountManagementConfig, type AccountSelfMutation } from "@shared/research/account-management";
import { AccountApiError, accountManagementApi } from "./api";

type Binding = { token: string; userId: string; generation: number };
type Client = NonNullable<Awaited<ReturnType<typeof getSupabaseBrowser>>>;
export default function AccountSettings() {
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const [config, setConfig] = useState<AccountManagementConfig | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "signed_out" | "unavailable">("loading");
  const [name, setName] = useState(""), [email, setEmail] = useState("");
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [nonce, setNonce] = useState("");
  const [codeReady, setCodeReady] = useState(false), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const alive = useRef(false), generation = useRef(0), mountGeneration = useRef(0), binding = useRef<Binding | null>(null);
  const client = useRef<Client | null>(null);
  const refresh = useRef<(captured: Binding) => Promise<AccountIdentity | null>>(async () => null);
  const current = (captured: Binding) => alive.current && binding.current?.generation === captured.generation
    && binding.current.token === captured.token && binding.current.userId === captured.userId;
  function clearTransient() {
    setName(""); setEmail(""); setPassword(""); setConfirm(""); setNonce(""); setCodeReady(false);
    setBusy(false); setNotice(null); setError(null);
  }
  useEffect(() => {
    alive.current = true;
    const mount = ++mountGeneration.current;
    const mounted = () => alive.current && mountGeneration.current === mount;
    let unsubscribe = () => {};
    const ordinary = (session: Session | null) => session?.access_token && session.user?.id && !isRecoveryAccessToken(session.access_token);
    const adopt = (session: Session | null) => {
      if (!mounted()) return;
      if (!ordinary(session)) {
        generation.current++; binding.current = null; setIdentity(null); clearTransient(); setState("signed_out"); return;
      }
      if (binding.current?.token !== session!.access_token || binding.current.userId !== session!.user.id) {
        binding.current = { token: session!.access_token, userId: session!.user.id, generation: ++generation.current };
        setIdentity(null); clearTransient(); setState("loading");
      }
      void refresh.current(binding.current!);
    };
    refresh.current = async captured => {
      try {
        const data = await accountManagementApi.identity(captured.token);
        if (!current(captured)) return null;
        const latest = await client.current!.auth.getSession();
        if (!current(captured)) return null;
        if (latest.error || !ordinary(latest.data.session) || latest.data.session!.access_token !== captured.token
          || latest.data.session!.user.id !== captured.userId) {
          adopt(latest.error ? null : latest.data.session); return null;
        }
        if (data.userId !== captured.userId) throw new AccountApiError("account_unavailable");
        setIdentity(data); setName(data.displayName); setState("ready"); return data;
      } catch (failure) {
        if (current(captured)) {
          setIdentity(null); clearTransient();
          setState(failure instanceof AccountApiError && [401,403].includes(failure.status) ? "signed_out" : "unavailable");
        }
        return null;
      }
    };
    void accountManagementApi.config().then(value => { if (mounted()) setConfig(value); })
      .catch(() => { if (mounted()) setConfig(null); });
    void (async () => {
      try {
        const sdk = await getSupabaseBrowser(); if (!mounted()) return;
        if (!sdk) { setState("unavailable"); return; }
        client.current = sdk;
        const initialGeneration = generation.current;
        const observed = sdk.auth.onAuthStateChange((event, session) => {
          // Never await Auth inside its callback/lock. Server reads are deferred
          // work; every completion is rechecked against this exact binding.
          adopt(event === "PASSWORD_RECOVERY" || event === "SIGNED_OUT" ? null : session);
        });
        unsubscribe = () => observed.data.subscription.unsubscribe();
        const initial = await sdk.auth.getSession();
        if (mounted() && generation.current === initialGeneration) adopt(initial.error ? null : initial.data.session);
      } catch { if (mounted()) setState("unavailable"); }
    })();
    return () => { alive.current = false; mountGeneration.current++; generation.current++; binding.current = null; client.current = null;
      refresh.current = async () => null; unsubscribe(); };
  }, []);
  async function stillCurrent(captured: Binding) {
    if (!current(captured) || !client.current) return false;
    const latest = await client.current.auth.getSession();
    const valid = current(captured) && !latest.error && latest.data.session?.access_token === captured.token
      && latest.data.session.user.id === captured.userId && !isRecoveryAccessToken(captured.token);
    if (!valid && current(captured)) { generation.current++; binding.current = null; setIdentity(null); clearTransient(); setState("signed_out"); }
    return valid;
  }
  async function mutate(change: AccountSelfMutation) {
    const captured = binding.current;
    if (busy || !config?.selfEditsEnabled || !captured || !identity || !current(captured)) return;
    const parsed = accountSelfMutationSchema.safeParse(change);
    if (!parsed.success) { setPassword(""); setConfirm(""); setNonce(""); setError("Check the new details and security code."); return; }
    setBusy(true); setError(null); setNotice(null); setPassword(""); setConfirm(""); setNonce("");
    try {
      if (!await stillCurrent(captured)) return;
      await accountManagementApi.mutate(captured.token, parsed.data);
      if (!current(captured) || !await stillCurrent(captured)) return;
      if (change.operation === "password") {
        setCodeReady(false); setNotice("The password update was accepted. Use your new password at your next sign-in.");
      } else {
        const updated = await refresh.current(captured);
        if (!updated || !current(captured)) return;
        if (change.operation === "profile") setNotice(updated.displayName === change.displayName.trim() ? "Display name updated." : "The update could not be confirmed. Refresh before trying again.");
        else {
          setEmail("");
          setNotice(updated.email === change.email.trim().toLowerCase() ? "Your confirmed email address is updated."
            : updated.pendingEmail === change.email.trim().toLowerCase() ? "Check your current and new inboxes to complete email confirmation. Your current address stays in use until the provider confirms the change."
            : "The email change could not be confirmed. Refresh before trying again.");
        }
      }
    } catch {
      if (current(captured)) { setCodeReady(false); setError("The update could not be confirmed. Refresh your account before trying again; an interrupted request may already have taken effect."); }
    } finally { if (current(captured)) setBusy(false); }
  }
  async function requestCode() {
    const captured = binding.current;
    if (busy || !config?.selfEditsEnabled || !captured || !identity) return;
    setBusy(true); setCodeReady(false); setNonce(""); setPassword(""); setConfirm(""); setError(null); setNotice(null);
    try {
      if (!await stillCurrent(captured)) return;
      await accountManagementApi.reauthenticate(captured.token);
      if (current(captured) && await stillCurrent(captured)) { setCodeReady(true); setNotice("Check your account inbox for the security code. Enter it with your new password."); }
    } catch { if (current(captured)) setError("The security-code request could not be confirmed. Check your inbox before requesting another."); }
    finally { if (current(captured)) setBusy(false); }
  }
  function passwordSubmit(event: FormEvent) {
    event.preventDefault();
    if (!codeReady || password !== confirm) { setPassword(""); setConfirm(""); setNonce(""); setError("Request a security code and enter matching passwords."); return; }
    void mutate({ operation: "password", password, nonce });
  }
  const signIn = researchAuthPath("/research/sign-in", ACCOUNT_SETTINGS_PATH);
  return <>
    <SeoHead title="Your sign-in settings, xenios" description="Manage your own Xenios sign-in and confirmation details." path={ACCOUNT_SETTINGS_PATH} publicMetadata={false} />
    <PageIntro eyebrow="Your sign-in" title="Identity and security." lead="These settings belong to your sign-in. Workspace access and professional permissions are managed separately." />
    <section className="container-x pb-20 max-w-[720px]">
      {state === "loading" && <p role="status">Checking your sign-in…</p>}
      {state === "signed_out" && <p role="status">Use an ordinary password sign-in with a confirmed email to open these settings.</p>}
      {state === "unavailable" && <p role="alert">Your account details could not be verified. No prior account details are displayed.</p>}
      {state === "ready" && identity && <div className="space-y-8">
        <div><p>Current confirmed email: <strong>{identity.email}</strong></p>{identity.pendingEmail && <p role="status">Awaiting confirmation: {identity.pendingEmail}</p>}</div>
        {!config?.selfEditsEnabled && <p role="status">Self-service changes are not available yet. Existing sign-in and recovery remain separate.</p>}
        <form aria-label="Display name" className="space-y-3" onSubmit={event => { event.preventDefault(); void mutate({ operation: "profile", displayName: name }); }}>
          <label className="form-label" htmlFor="identity-name">Display name</label><input id="identity-name" className="input-field" value={name} maxLength={100} onChange={event => setName(event.target.value)} disabled={busy || !config?.selfEditsEnabled} />
          <button className="btn btn-secondary" disabled={busy || !config?.selfEditsEnabled}>Save display name</button>
        </form>
        <form aria-label="Email address" className="space-y-3" onSubmit={event => { event.preventDefault(); void mutate({ operation: "email", email }); }}>
          <label className="form-label" htmlFor="identity-email">New email address</label><input id="identity-email" className="input-field" type="email" autoComplete="email" value={email} maxLength={254} required onChange={event => setEmail(event.target.value)} disabled={busy || !config?.selfEditsEnabled} />
          <p className="body-s">Confirm the change through your inboxes. Existing requests and organization records are not reassigned by this change.</p>
          <button className="btn btn-secondary" disabled={busy || !config?.selfEditsEnabled}>Request email change</button>
        </form>
        <form aria-label="Password" className="space-y-3" onSubmit={passwordSubmit}>
          <h2 className="body-m font-700">Change password</h2>
          <button type="button" className="btn btn-secondary" onClick={() => void requestCode()} disabled={busy || !config?.selfEditsEnabled}>Send security code</button>
          <div><label className="form-label" htmlFor="identity-code">Security code from your inbox</label><input id="identity-code" className="input-field" autoComplete="one-time-code" inputMode="numeric" maxLength={10} value={nonce} required onChange={event => setNonce(event.target.value)} disabled={busy || !codeReady} /></div>
          <div><label className="form-label" htmlFor="identity-password">New password</label><input id="identity-password" className="input-field" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} required onChange={event => setPassword(event.target.value)} disabled={busy || !codeReady} /></div>
          <div><label className="form-label" htmlFor="identity-confirm">Confirm new password</label><input id="identity-confirm" className="input-field" type="password" autoComplete="new-password" value={confirm} required onChange={event => setConfirm(event.target.value)} disabled={busy || !codeReady} /></div>
          <button className="btn btn-secondary" disabled={busy || !codeReady || !config?.selfEditsEnabled}>Update password</button>
        </form>
        <section aria-labelledby="identity-deletion"><h2 id="identity-deletion" className="body-m font-700">Account deletion</h2><p className="body-s mt-2">Deletion is not available in this interface yet. Account closure and data held under financial, clinical or other approved obligations require a separate review. Nothing is deleted by opening these settings.</p><a className="underline" href="mailto:team@xeniostechnology.com">Contact account support</a></section>
      </div>}
      {error && <p role="alert" className="mt-4">{error}</p>}{notice && <p role="status" className="mt-4">{notice}</p>}
      <nav aria-label="Sign-in help" className="mt-6 space-y-3"><p><Link href={signIn} className="underline">Sign in or use another sign-in</Link></p><p><Link href={researchAuthPath("/research/reset-password", ACCOUNT_SETTINGS_PATH)} className="underline">Password recovery</Link></p><p><Link href="/research/access-hub" className="underline">Workspace access options</Link></p></nav>
    </section>
  </>;
}

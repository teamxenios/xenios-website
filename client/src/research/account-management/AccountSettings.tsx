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

type SessionIdentity = { userId: string; sessionId: string; key: string };
type Binding = { token: string; userId: string; identity: SessionIdentity; generation: number };
type Client = NonNullable<Awaited<ReturnType<typeof getSupabaseBrowser>>>;
type Bootstrap = { epoch: number; done: Promise<void>; finish: () => void; settled: boolean };
type Closure = { epoch: number; ordinaryIds: Set<string>; knownAbsent: boolean; unknown: boolean; awaiting: Set<Bootstrap> };
type Denials = { epoch: number; retired: Set<string>; pending: Set<Bootstrap>; last: SessionIdentity | null;
  knownAbsent: boolean; closure: Closure | null };
// Negative UI evidence only, partitioned by the SAME canonical SDK client.
// No credential, account result, Auth storage or permission survives a remount.
const sessionDenials = new WeakMap<Client, Denials>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nonzeroUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value)
  && value.toLowerCase() !== "00000000-0000-0000-0000-000000000000";
function sessionIdentity(session: Session | null): SessionIdentity | null {
  try {
    if (!session || !nonzeroUuid(session.user?.id) || !session.access_token || session.access_token.length > 65_536) return null;
    const parts = session.access_token.split(".");
    if (parts.length !== 3 || !parts[1] || parts[1].length > 16_384 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims: unknown = JSON.parse(globalThis.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return null;
    const { sub, session_id: sid } = claims as { sub?: unknown; session_id?: unknown };
    if (!nonzeroUuid(sub) || !nonzeroUuid(sid) || sub.toLowerCase() !== session.user.id.toLowerCase()) return null;
    // Unverified claims can exclude UI work; the server verifies every bearer.
    const userId = sub.toLowerCase(), sessionId = sid.toLowerCase();
    return { userId, sessionId, key: userId + ":" + sessionId };
  } catch { return null; }
}
function denialsFor(client: Client): Denials {
  let denials = sessionDenials.get(client);
  if (!denials) { denials = { epoch: 0, retired: new Set(), pending: new Set(), last: null, knownAbsent: false, closure: null };
    sessionDenials.set(client, denials); }
  return denials;
}
function freshAfterClosure(identity: SessionIdentity, denials: Denials, closure: Closure) {
  return !closure.unknown && closure.awaiting.size === 0 && (closure.ordinaryIds.size > 0 || closure.knownAbsent)
    && !closure.ordinaryIds.has(identity.sessionId) && !denials.retired.has(identity.key);
}
function settleBootstrap(denials: Denials, probe: Bootstrap, session: Session | null, succeeded: boolean) {
  if (probe.settled) return;
  probe.settled = true; denials.pending.delete(probe);
  const closure = denials.closure;
  if (closure?.awaiting.delete(probe)) {
    const identity = sessionIdentity(session);
    if (succeeded && identity && session && !isRecoveryAccessToken(session.access_token)) {
      closure.ordinaryIds.add(identity.sessionId); denials.retired.add(identity.key);
    } else if (succeeded && session === null) closure.knownAbsent = true;
    else closure.unknown = true;
  }
  probe.finish();
}
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
  const denials = useRef<Denials | null>(null);
  const refresh = useRef<(captured: Binding) => Promise<AccountIdentity | null>>(async () => null);
  const reconcile = useRef<(session: Session | null, failed?: boolean) => void>(() => {});
  const current = (captured: Binding) => alive.current && binding.current?.generation === captured.generation
    && binding.current.token === captured.token && binding.current.userId === captured.userId
    && !denials.current?.closure && !denials.current?.retired.has(captured.identity.key);
  function clearTransient() {
    setName(""); setEmail(""); setPassword(""); setConfirm(""); setNonce(""); setCodeReady(false);
    setBusy(false); setNotice(null); setError(null);
  }
  useEffect(() => {
    alive.current = true;
    const mount = ++mountGeneration.current;
    const mounted = () => alive.current && mountGeneration.current === mount;
    let unsubscribe = () => {};
    let pendingSignin: { session: Session; identity: SessionIdentity; closure: Closure; generation: number } | null = null;
    const ordinary = (session: Session | null) => session?.access_token && session.user?.id && !isRecoveryAccessToken(session.access_token);
    const conceal = () => {
      generation.current++; binding.current = null; setIdentity(null); clearTransient(); setState("signed_out");
    };
    const close = (session: Session | null) => {
      const fence = denials.current;
      if (fence) {
        const prior = fence.closure, ordinaryIds = new Set(prior?.ordinaryIds);
        if (fence.last) { ordinaryIds.add(fence.last.sessionId); fence.retired.add(fence.last.key); }
        // A not-yet-admitted sign-in is an exclusion, never evidence about an
        // unresolved old bootstrap. Repeated closure cannot turn unknown fresh.
        if (pendingSignin) fence.retired.add(pendingSignin.identity.key);
        const closingIdentity = sessionIdentity(session);
        if (closingIdentity) fence.retired.add(closingIdentity.key);
        fence.closure = { epoch: ++fence.epoch, ordinaryIds, knownAbsent: fence.knownAbsent || Boolean(prior?.knownAbsent),
          unknown: prior?.unknown ?? false, awaiting: new Set([...(prior?.awaiting ?? []), ...fence.pending]) };
        fence.last = null;
      }
      pendingSignin = null; conceal();
    };
    const adopt = (session: Session | null, event = "READ", bootstrapEpoch?: number): void => {
      if (!mounted()) return;
      const fence = denials.current;
      if (!fence) return;
      if (event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY" || session && isRecoveryAccessToken(session.access_token)) {
        close(session); return;
      }
      if (!ordinary(session)) {
        if (fence.last || fence.closure) { close(session); return; }
        if (session === null && bootstrapEpoch !== undefined && !fence.closure) fence.knownAbsent = true;
        pendingSignin = null; conceal(); return;
      }
      const identity = sessionIdentity(session);
      if (!identity) { pendingSignin = null; conceal(); setState("unavailable"); return; }
      // Ignore a retired callback; it must not replace a newer ordinary view.
      if (fence.retired.has(identity.key)) { if (!binding.current) setState("signed_out"); return; }
      const closure = fence.closure;
      if (closure) {
        const freshBootstrap = bootstrapEpoch !== undefined && bootstrapEpoch >= closure.epoch;
        const keepsSignin = event === "TOKEN_REFRESHED" && pendingSignin?.identity.key === identity.key && pendingSignin.closure === closure;
        if (event !== "SIGNED_IN" && !freshBootstrap && !keepsSignin) { if (!binding.current) setState("signed_out"); return; }
        if (!freshAfterClosure(identity, fence, closure)) {
          if (!binding.current) setState("signed_out");
          if (!closure.unknown && closure.awaiting.size > 0) {
            conceal();
            const intent = { session: session!, identity, closure, generation: generation.current };
            pendingSignin = intent;
            void Promise.all([...closure.awaiting].map(probe => probe.done)).then(() => {
              if (!mounted() || pendingSignin !== intent || generation.current !== intent.generation || fence.closure !== closure) return;
              pendingSignin = null;
              if (freshAfterClosure(identity, fence, closure)) adopt(intent.session, "SIGNED_IN");
            });
          }
          return;
        }
        fence.closure = null;
      }
      pendingSignin = null;
      if (fence.last && fence.last.key !== identity.key) fence.retired.add(fence.last.key);
      fence.last = identity; fence.knownAbsent = false;
      if (binding.current?.token !== session!.access_token || binding.current.userId !== session!.user.id) {
        binding.current = { token: session!.access_token, userId: session!.user.id, identity, generation: ++generation.current };
        setIdentity(null); clearTransient(); setState("loading");
      }
      const captured = binding.current!;
      // Never re-enter Auth from its observer; captured-bearer API work is
      // deferred and every completion still checks this deny-only partition.
      queueMicrotask(() => { if (current(captured)) void refresh.current(captured); });
    };
    reconcile.current = (session, failed = false) => {
      if (failed || !ordinary(session)) close(session);
      else adopt(session);
    };
    refresh.current = async captured => {
      try {
        const data = await accountManagementApi.identity(captured.token);
        if (!current(captured)) return null;
        const latest = await client.current!.auth.getSession();
        if (!current(captured)) return null;
        if (latest.error || !ordinary(latest.data.session) || latest.data.session!.access_token !== captured.token
          || latest.data.session!.user.id !== captured.userId) {
          reconcile.current(latest.error ? null : latest.data.session, Boolean(latest.error));
          return null;
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
        client.current = sdk; const fence = denialsFor(sdk); denials.current = fence;
        let finish!: () => void;
        const probe: Bootstrap = { epoch: fence.epoch, done: new Promise<void>(resolve => { finish = resolve; }), finish: () => finish(), settled: false };
        fence.pending.add(probe);
        const initialGeneration = generation.current;
        const observed = sdk.auth.onAuthStateChange((event, session) => {
          // Never await Auth inside its callback/lock. Server reads are deferred
          // work; every completion is rechecked against this exact binding.
          adopt(session, event);
        });
        unsubscribe = () => observed.data.subscription.unsubscribe();
        try {
          const initial = await sdk.auth.getSession();
          settleBootstrap(fence, probe, initial.error ? null : initial.data.session, !initial.error);
          if (mounted() && generation.current === initialGeneration) {
            if (initial.error) { conceal(); setState("unavailable"); }
            else adopt(initial.data.session, "INITIAL_SESSION", probe.epoch);
          }
        } catch {
          settleBootstrap(fence, probe, null, false);
          if (mounted() && generation.current === initialGeneration) { conceal(); setState("unavailable"); }
        }
      } catch { if (mounted()) setState("unavailable"); }
    })();
    return () => { alive.current = false; mountGeneration.current++; generation.current++; binding.current = null; client.current = null; denials.current = null; pendingSignin = null;
      refresh.current = async () => null; reconcile.current = () => {}; unsubscribe(); };
  }, []);
  async function stillCurrent(captured: Binding) {
    if (!current(captured) || !client.current) return false;
    const latest = await client.current.auth.getSession();
    const valid = current(captured) && !latest.error && latest.data.session?.access_token === captured.token
      && latest.data.session.user.id === captured.userId && !isRecoveryAccessToken(captured.token);
    if (!valid && current(captured)) reconcile.current(latest.error ? null : latest.data.session, Boolean(latest.error));
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

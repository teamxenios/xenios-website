import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import type { Session } from "@supabase/supabase-js";
import SeoHead from "@/components/SeoHead";
import { getSupabaseBrowser, isRecoveryAccessToken } from "@/lib/supabaseBrowser";
import { accountManagementApi } from "./api";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { ACCOUNT_LIFECYCLE_API, lifecycleEnvelope, lifecycleIssuedReply, lifecycleUuid,
  type AccountLifecycleEnvelope } from "@shared/research/account-lifecycle";

/** Presentation from the SAME canonical ordinary-session consumer. The server
 * still verifies every bearer. A ready prop is never deletion/role authority. */
export type LifecycleSession = { state: "unavailable" } | { state: "checking"; actorId: string; instance: object }
  | { state: "ready"; actorId: string; accessToken: string; instance: object };
type ReadySession = Extract<LifecycleSession, { state: "ready" }>;
type JournalKey = { actorId: string; instance: object };
type BoundState = { key: JournalKey; result: AccountLifecycleEnvelope | null; carrier: string | null; retryKey: string };
const same = (left: LifecycleSession, right: ReadySession) => left.state === "ready" && left.actorId === right.actorId
  && left.accessToken === right.accessToken && left.instance === right.instance;
const sameKey = (left: JournalKey | null, right: JournalKey) => left?.actorId === right.actorId && left.instance === right.instance;
async function responseJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader(); let text = "", bytes = 0;
  if (!reader) { text = await response.text(); if (new TextEncoder().encode(text).length > 16384) throw Error("unconfirmed"); }
  else { const decoder = new TextDecoder(); try { for (;;) { const chunk = await reader.read(); if (chunk.done) break;
    bytes += chunk.value.byteLength; if (bytes > 16384) { await reader.cancel(); throw Error("unconfirmed"); }
    text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); } }
  return JSON.parse(text);
}

type ConsumerClient = NonNullable<Awaited<ReturnType<typeof getSupabaseBrowser>>>;
type ConsumerIdentity = { actorId: string; sessionId: string; key: string };
type ConsumerProbe = { epoch: number; done: Promise<void>; finish(): void; settled: boolean };
type ConsumerClosure = { epoch: number; ids: Set<string>; absent: boolean; unknown: boolean; awaiting: Set<ConsumerProbe> };
type ConsumerHistory = { epoch: number; retired: Set<string>; pending: Set<ConsumerProbe>; absent: boolean;
  last: { identity: ConsumerIdentity; instance: object } | null; closure: ConsumerClosure | null };
// UI exclusion/continuity only, on the SAME canonical client. No token,
// operation journal, contacts, persistence or permission lives in this partition.
const consumerHistory = new WeakMap<ConsumerClient, ConsumerHistory>();
function consumerIdentity(session: Session | null): ConsumerIdentity | null {
  try {
    if (!session?.access_token || session.access_token.length > 16384 || !lifecycleUuid.safeParse(session.user?.id).success) return null;
    const pieces = session.access_token.split("."), payload = pieces[1];
    if (pieces.length !== 3 || !payload || payload.length > 16384 || !/^[A-Za-z0-9_-]+$/u.test(payload)) return null;
    const text = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims: unknown = JSON.parse(atob(text.padEnd(Math.ceil(text.length / 4) * 4, "=")));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return null;
    const { sub, session_id: id } = claims as { sub?: unknown; session_id?: unknown };
    if (!lifecycleUuid.safeParse(sub).success || !lifecycleUuid.safeParse(id).success || sub !== session.user.id) return null;
    // These unverified claims partition/deny UI work; the captured-bearer
    // server identity read and every lifecycle API remain authoritative.
    return { actorId: sub as string, sessionId: id as string, key: sub + ":" + id };
  } catch { return null; }
}
function consumerState(client: ConsumerClient): ConsumerHistory {
  let history = consumerHistory.get(client);
  if (!history) { history = { epoch: 0, retired: new Set(), pending: new Set(), absent: false, last: null, closure: null };
    consumerHistory.set(client, history); }
  return history;
}
function settleConsumerProbe(history: ConsumerHistory, probe: ConsumerProbe, session: Session | null, success: boolean) {
  if (probe.settled) return;
  probe.settled = true; history.pending.delete(probe);
  if (history.closure?.awaiting.delete(probe)) {
    const identity = consumerIdentity(session);
    if (success && identity && session && !isRecoveryAccessToken(session.access_token)) {
      history.closure.ids.add(identity.sessionId); history.retired.add(identity.key);
    } else if (success && session === null) history.closure.absent = true;
    else history.closure.unknown = true;
  }
  probe.finish();
}
function consumerFresh(history: ConsumerHistory, identity: ConsumerIdentity, closure: ConsumerClosure) {
  return !closure.unknown && !closure.awaiting.size && (closure.ids.size > 0 || closure.absent)
    && !closure.ids.has(identity.sessionId) && !history.retired.has(identity.key);
}
/** Actual route consumer; it keeps the page mounted through same-session
 * checking/refresh. Readiness of this presentation never grants deletion. */
export function DeleteAccountRoute() {
  const params = useParams<{ operationId?: string }>();
  const validReference = params.operationId === undefined || lifecycleUuid.safeParse(params.operationId).success;
  const [presentation, present] = useState<LifecycleSession>({ state: "unavailable" });
  // A synchronous deny fence closes old button handlers before React commits
  // a concealment render. This never supplies Auth or native authority.
  const transport = useRef<ReadySession | null>(null);
  useEffect(() => {
    let mounted = true, revision = 0, unsubscribe = () => {};
    let intent: { identity: ConsumerIdentity; token: string; ticket: number } | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const conceal = (history: ConsumerHistory) => {
      transport.current = null;
      if (mounted) present(history.last ? { state: "checking", actorId: history.last.identity.actorId, instance: history.last.instance }
        : { state: "unavailable" });
    };
    void (async () => {
      const sdk = await getSupabaseBrowser(); if (!mounted) return;
      if (!sdk) { transport.current = null; present({ state: "unavailable" }); return; }
      const history = consumerState(sdk);
      const close = (session: Session | null) => {
        const prior = history.closure, ids = new Set(prior?.ids);
        if (history.last) { ids.add(history.last.identity.sessionId); history.retired.add(history.last.identity.key); }
        if (intent) history.retired.add(intent.identity.key);
        const identity = consumerIdentity(session); if (identity) history.retired.add(identity.key);
        history.closure = { epoch: ++history.epoch, ids, absent: history.absent || Boolean(prior?.absent), unknown: prior?.unknown ?? false,
          awaiting: new Set([...(prior?.awaiting ?? []), ...history.pending]) };
        history.last = null; intent = null; transport.current = null; present({ state: "unavailable" });
      };
      const observe = (event: string, session: Session | null, bootstrapEpoch?: number) => {
        if (!mounted) return;
        if (event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY" || session && isRecoveryAccessToken(session.access_token)) {
          ++revision; close(session); return;
        }
        const identity = consumerIdentity(session);
        if (!session || !identity) {
          ++revision;
          if (session === null && bootstrapEpoch !== undefined && !history.last && !history.closure) history.absent = true;
          if (history.last || history.closure) close(session); else { transport.current = null; present({ state: "unavailable" }); }
          return;
        }
        if (history.retired.has(identity.key)) return;
        const previousIntent = intent, closure = history.closure;
        const ticket = ++revision;
        if (closure && event !== "SIGNED_IN" && !(bootstrapEpoch !== undefined && bootstrapEpoch >= closure.epoch)
          && !(event === "TOKEN_REFRESHED" && previousIntent?.identity.key === identity.key)) return;
        intent = { identity, token: session.access_token, ticket }; conceal(history);
        const candidate = intent;
        const live = () => mounted && revision === ticket && intent === candidate && !history.retired.has(identity.key)
          && history.closure === closure;
        // Never re-enter SDK Auth inside its observer/lock.
        queueMicrotask(() => { void (async () => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            if (closure) { await Promise.all([...closure.awaiting].map(probe => probe.done));
              if (!live() || !consumerFresh(history, identity, closure)) return; }
            if (!live()) return;
            const actual = await sdk.auth.getSession();
            if (!live() || actual.error || actual.data.session?.access_token !== candidate.token
              || consumerIdentity(actual.data.session)?.key !== identity.key || isRecoveryAccessToken(candidate.token)) return;
            if (previousIntent && previousIntent.identity.key !== identity.key) history.retired.add(previousIntent.identity.key);
            if (history.last && history.last.identity.key !== identity.key) {
              history.retired.add(history.last.identity.key); history.last = null; present({ state: "unavailable" });
            }
            const verified = await Promise.race([accountManagementApi.identity(candidate.token), new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error("identity_unavailable")), 15000); timers.add(timer);
            })]);
            if (!live() || verified.userId !== identity.actorId) return;
            const latest = await sdk.auth.getSession();
            if (!live() || latest.error || latest.data.session?.access_token !== candidate.token
              || consumerIdentity(latest.data.session)?.key !== identity.key || isRecoveryAccessToken(candidate.token)) return;
            if (closure && !consumerFresh(history, identity, closure)) return;
            history.closure = null; history.absent = false;
            if (!history.last) history.last = { identity, instance: Object.freeze({}) };
            intent = null;
            transport.current = { state: "ready", actorId: identity.actorId, accessToken: candidate.token, instance: history.last.instance };
            present(transport.current);
          } catch { if (live()) conceal(history); }
          finally { if (timer) { clearTimeout(timer); timers.delete(timer); } }
        })(); });
      };
      let finish!: () => void;
      const probe: ConsumerProbe = { epoch: history.epoch, done: new Promise<void>(resolve => { finish = resolve; }), finish: () => finish(), settled: false };
      history.pending.add(probe);
      const initial = revision;
      const observed = sdk.auth.onAuthStateChange((event, session) => observe(event, session));
      unsubscribe = () => observed.data.subscription.unsubscribe();
      try { const result = await sdk.auth.getSession();
        settleConsumerProbe(history, probe, result.error ? null : result.data.session, !result.error);
        if (mounted && revision === initial) { if (result.error) conceal(history); else observe("INITIAL_SESSION", result.data.session, probe.epoch); }
      } catch { settleConsumerProbe(history, probe, null, false); if (mounted && revision === initial) conceal(history); }
    })().catch(() => { if (mounted) { ++revision; transport.current = null; present({ state: "unavailable" }); } });
    return () => { mounted = false; ++revision; transport.current = null; intent = null; unsubscribe(); for (const timer of timers) clearTimeout(timer); timers.clear(); };
  }, []);
  return <>{!validReference && <p role="alert">That account operation reference could not be verified.</p>}
    <DeleteAccount key={params.operationId ?? "prepare"} session={validReference ? presentation : { state: "unavailable" }}
      isCurrent={captured => transport.current !== null && same(transport.current, captured)} initialOperationId={validReference ? params.operationId : undefined} />
  </>;
}
export default function DeleteAccount({ session = { state: "unavailable" }, initialOperationId, isCurrent }: {
  session?: LifecycleSession; initialOperationId?: string; isCurrent?: (captured: ReadySession) => boolean;
}) {
  const [bound, setBound] = useState<BoundState | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [admitted, setAdmitted] = useState<JournalKey | null>(null);
  const current = useRef(session), alive = useRef(false), generation = useRef(0), state = useRef<BoundState | null>(null);
  const activeKey = useRef<JournalKey | null>(null), retired = useRef(new WeakSet<object>());
  current.current = session;
  const ready = session.state === "ready" && sameKey(admitted, session) && !retired.current.has(session.instance) ? session : null;
  const visible = ready && bound && sameKey(bound.key, ready) ? bound : null;
  useEffect(() => { alive.current = true;
    return () => { alive.current = false; generation.current++; state.current = null; };
  }, []);
  useEffect(() => {
    generation.current++; setBusy(false); setError(null);
    const previous = activeKey.current;
    if (session.state === "unavailable") {
      // Unknown/terminal purpose is not continuity evidence. A returning old
      // instance cannot reopen this journal; a genuinely new sign-in needs its
      // actual new canonical instance from the existing session consumer.
      if (previous) retired.current.add(previous.instance);
      activeKey.current = null; state.current = null; setBound(null); setAdmitted(null); return;
    }
    if (session.state === "checking") {
      // Explicit same-instance checking can ONLY conceal/retain. It carries no
      // bearer, makes no request and cannot establish a new journal identity.
      if (!sameKey(previous, session)) {
        if (previous) retired.current.add(previous.instance);
        activeKey.current = null; state.current = null; setBound(null); setAdmitted(null);
      }
      return;
    }
    if (previous && !sameKey(previous, session)) {
      retired.current.add(previous.instance); state.current = null; setBound(null);
    }
    if (retired.current.has(session.instance)) { activeKey.current = null; setAdmitted(null); return; }
    const key = { actorId: session.actorId, instance: session.instance };
    activeKey.current = key; setAdmitted(key);
    // A credential refresh preserves the immutable retry/carrier/operation.
    // Only transport generations change. No access token enters that journal.
  }, [session.state, session.state === "ready" ? session.accessToken : null, session.state !== "unavailable" ? session.actorId : null,
    session.state !== "unavailable" ? session.instance : null]);
  function canDispatch(captured: ReadySession) { return alive.current && same(current.current, captured)
    && sameKey(activeKey.current, captured) && !retired.current.has(captured.instance) && (!isCurrent || isCurrent(captured)); }
  function live(captured: ReadySession, ticket: number) { return generation.current === ticket && canDispatch(captured); }
  function publish(value: BoundState) { state.current = value; setBound(value); }
  async function request(captured: ReadySession, path: string, body?: unknown) {
    const response = await fetch(ACCOUNT_LIFECYCLE_API + path, { method: body === undefined ? "GET" : "POST", credentials: "same-origin",
      cache: "no-store", redirect: "error", headers: { Authorization: `Bearer ${captured.accessToken}`, Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const json = await responseJson(response);
    // An issue refusal may safely describe unavailable before persistence. A
    // failed prepare/confirm/status keeps the existing carrier/operation intact.
    if (!response.ok) { const unavailable = lifecycleEnvelope.safeParse(json);
      if (path === "/self/attempt" && unavailable.success && unavailable.data.state === "unavailable") return unavailable.data;
      throw Error("unconfirmed"); }
    return json;
  }
  async function prepare() {
    if (busy || !ready || !canDispatch(ready) || state.current?.result?.operationId || lifecycleUuid.safeParse(initialOperationId).success) return;
    const captured = ready, ticket = ++generation.current;
    let value = state.current && sameKey(state.current.key, captured) ? state.current : { key: { actorId: captured.actorId, instance: captured.instance }, result: null, carrier: null,
      retryKey: crypto.randomUUID().replaceAll("-", "") };
    publish(value); setBusy(true); setError(null);
    try {
      if (!value.carrier) {
        const reply = await request(captured, "/self/attempt", { retryKey: value.retryKey }); if (!live(captured, ticket)) return;
        const unavailable = lifecycleEnvelope.safeParse(reply);
        if (unavailable.success && unavailable.data.state === "unavailable") { publish({ ...value, result: unavailable.data }); return; }
        const issued = lifecycleIssuedReply.parse(reply); value = { ...value, carrier: issued.attemptCarrier }; publish(value);
      }
      const result = lifecycleEnvelope.parse(await request(captured, "/self/prepare", { attemptCarrier: value.carrier }));
      if (live(captured, ticket)) publish({ ...value, result });
    } catch { if (live(captured, ticket)) setError("The request could not be confirmed. Keep this attempt and check it again; do not start another deletion request."); }
    finally { if (live(captured, ticket)) setBusy(false); }
  }
  async function status() {
    if (busy || !ready || !canDispatch(ready)) return;
    const captured = ready, ticket = ++generation.current;
    const value = state.current && sameKey(state.current.key, captured) ? state.current : null;
    const operation = value?.result?.operationId ?? initialOperationId;
    if (!lifecycleUuid.safeParse(operation).success) return;
    setBusy(true); setError(null);
    try { const result = lifecycleEnvelope.parse(await request(captured, "/self/operations/" + operation));
      if (result.operationId !== operation) throw Error("unconfirmed");
      if (live(captured, ticket)) publish({ key: { actorId: captured.actorId, instance: captured.instance }, carrier: value?.carrier ?? null, retryKey: value?.retryKey ?? "",
        result });
    } catch { if (live(captured, ticket)) setError("Current status is unavailable. Your existing operation has not been cleared or repeated. Contact authorized support if you can no longer sign in."); }
    finally { if (live(captured, ticket)) setBusy(false); }
  }
  async function confirm() {
    if (busy || !ready || !canDispatch(ready) || !visible?.result?.preview || visible.result.state !== "confirmation_required") return;
    const captured = ready, ticket = ++generation.current, value = visible, result = value.result!;
    setBusy(true); setError(null);
    try { const next = lifecycleEnvelope.parse(await request(captured, "/self/confirm", { operationId: result.operationId,
      previewDigest: result.preview!.digest, expectedVersion: result.version, confirm: true }));
      if (next.operationId !== result.operationId) throw Error("unconfirmed");
      if (live(captured, ticket)) publish({ ...value, result: next });
    } catch { if (live(captured, ticket)) setError("Confirmation could not be verified. Keep this operation and check its status before any further action."); }
    finally { if (live(captured, ticket)) setBusy(false); }
  }
  const result = visible?.result;
  const hasOperation = Boolean(result?.operationId || lifecycleUuid.safeParse(initialOperationId).success);
  const canPrepare = !hasOperation && (!result || result.state === "unavailable");
  const signIn = researchAuthPath("/research/sign-in", "/research/account/delete" +
    (lifecycleUuid.safeParse(initialOperationId).success ? "/" + initialOperationId : ""));
  return <section className="container-x py-16 max-w-[720px]">
    <SeoHead title="Account closure, xenios" description="Review your account closure request and its verified status." path="/research/account/delete" publicMetadata={false} />
    <h1 className="display-m">Account closure and deletion</h1>
    <p className="body-l mt-4">Review what can be closed, what must be retained and which steps are verified before confirming. Financial, clinical, legal or shared-account obligations may require authorized review.</p>
    <p className="body-s mt-4">An account closure does not by itself prove that every issued access token or every retained record has been erased.</p>
    {!ready ? <p role="status">{session.state === "checking" ? "Checking your sign-in. No account action is available during checking." : "Use your ordinary confirmed sign-in. Account closure also requires independently verified recent authentication and approved lifecycle safeguards."}</p> : <>
      {canPrepare && <button className="btn btn-secondary mt-6" disabled={busy} onClick={() => void prepare()}>{visible?.carrier ? "Retry the same preview request" : "Review account closure"}</button>}
      {hasOperation && <button className="btn btn-secondary mt-6" disabled={busy} onClick={() => void status()}>Check current status</button>}
      {result && <div className="mt-6" aria-live="polite">
        <p>State: {result.state.replaceAll("_", " ")}</p>
        {result.operationId && <><p>Operation reference: {result.operationId}</p>
          <p className="mt-2"><a className="underline" href={"/research/account/delete/" + result.operationId} referrerPolicy="no-referrer">Return to this operation's status</a></p>
          <p>Keep this status link to return to the same operation. Opening it does not repeat an account closure request. You must sign in and check the current status.</p></>}
        <dl>{Object.entries(result.progress).map(([key, value]) => <div key={key}><dt>{({ application: "Application access", providerSessions: "Provider sessions", eligibleData: "Eligible data", retainedData: "Retained records", authIdentity: "Auth identity" } as Record<string, string>)[key]}</dt><dd>{value.replaceAll("_", " ")}</dd></div>)}</dl>
        {result.blockers.length > 0 && <p role="status">Required review: {result.blockers.map(value => value.replaceAll("_", " ")).join(", ")}. No missing authority is treated as clearance.</p>}
        {result.state === "auth_outcome_unknown" && <p role="alert">The provider outcome is unknown. No second deletion will be sent by this page. Check status or contact authorized support.</p>}
        {result.state === "completed_with_retention" && <p>Declared deletion steps are verified. Records remain under the approved retention policy.</p>}
        {result.state === "completed" && <p>All declared deletion obligations are verified.</p>}
        {result.state === "confirmation_required" && result.preview && <><p>Preview expires: {result.preview.expiresAt}. Confirmation requires fresh server verification.</p>
          <button className="btn btn-primary mt-4" disabled={busy || Date.parse(result.preview.expiresAt) <= Date.now()} onClick={() => void confirm()}>Confirm account closure request</button></>}
      </div>}
      {busy && <p role="status">Checking the same account operation…</p>}{error && <p role="alert">{error}</p>}
    </>}
    {session.state === "unavailable" && <p className="mt-6"><a className="underline" href={signIn}>Sign in to this account operation</a></p>}
    <p className="mt-6"><a className="underline" href="mailto:team@xeniostechnology.com">Contact authorized account support</a></p>
  </section>;
}

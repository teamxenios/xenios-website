import { useEffect, useRef, useState } from "react";
import SeoHead from "@/components/SeoHead";
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
export default function DeleteAccount({ session = { state: "unavailable" }, initialOperationId }: {
  session?: LifecycleSession; initialOperationId?: string;
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
    && sameKey(activeKey.current, captured) && !retired.current.has(captured.instance); }
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
        {result.operationId && <p>Operation reference: {result.operationId}</p>}
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
    <p className="mt-6"><a className="underline" href="mailto:team@xeniostechnology.com">Contact authorized account support</a></p>
  </section>;
}

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { aeIdentifier, type AeCustomer, type AeWorkspace, type AeWorkspaceCommand } from "@shared/research/account-executive/workspace";
import { isRecoveryAccessToken } from "@/lib/supabaseBrowser";
import { aeAssignmentHistoryLabel, aeContactLabel, aeFollowupHistoryLabel, aeOriginalReferralLabel, aeReferrerLabel, aeRequestStatusLabel } from "./workspace-model";
import { AeWorkspaceApiError, createAeWorkspaceApi, type AeCommandAttempt, type AeCommandJournal, type AeSessionBinding } from "./workspace-api";
import "./workspace.css";

export type AePortalSession = Readonly<{ state: "checking" | "signed_out" | "recovery" | "unavailable" }>
  | Readonly<{ state: "ready"; actorAuthUserId: string; accessToken: string; sessionInstance: object }>;
export interface AeWorkspacePageProps {
  /** Supplied by the canonical Auth shell. This component has no Auth store. */
  session: AePortalSession;
  /** One approved operational scope supplied by Root, never a browser selector. */
  scopeId: string;
  scopeLabel?: string;
  /** Retain for this ordinary-session/actor/scope lifetime across page remounts. */
  journal?: AeCommandJournal;
}
type Phase = "loading" | "ready" | "saving" | "uncertain" | "conflict" | "confirmed" | "denied" | "session_expired" | "unavailable";
type View = { route: object; phase: Phase; data: AeWorkspace | null; message?: string };
type Draft = { view: View; customer: AeCustomer; kind: "record_followup" | "reassign" };
const PURPOSES = { contact_customer: "Contact customer", request_status_followup: "Request status follow-up", documentation_followup: "Documentation follow-up" } as const;
const date = (value: string) => new Date(value).toLocaleString();
const noSubscription = () => () => {};
const zeroSnapshot = () => 0;

function CustomerSummary({ customer }: { customer: AeCustomer }) {
  return <>
    <header className="ae-customer-heading"><h2>{aeContactLabel(customer)}</h2><span className="ae-tag">Assigned to your account</span></header>
    {customer.contact.state === "available" && <dl className="ae-contact"><div><dt>Email</dt><dd>{customer.contact.email}</dd></div>
      <div><dt>Phone</dt><dd>{customer.contact.phone ?? "Not provided"}</dd></div></dl>}
    <p className="ae-muted">{aeReferrerLabel(customer.referral)}</p>
    <h3>Saved requests</h3>
    {customer.requests.length === 0 ? <p>No saved requests are available in this assignment.</p> : <ul className="ae-list">{customer.requests.map(request =>
      <li key={request.requestId}><strong>{request.publicReference}</strong><p>{aeRequestStatusLabel(request)}</p>
        <p className="ae-muted">Submitted <time dateTime={request.submittedAt}>{date(request.submittedAt)}</time></p>
        <p className="ae-muted">{aeOriginalReferralLabel(request.originalReferralInput)}</p></li>)}</ul>}
    <h3>Follow-ups</h3>
    {customer.followupsCompleteness === "historical_unavailable" && <p className="ae-muted">{aeFollowupHistoryLabel(customer)}</p>}
    {customer.followups.length === 0 ? <p>{customer.followupsCompleteness === "complete"
      ? "No follow-ups are recorded." : "No follow-ups are visible in this view."}</p> : <ul className="ae-list">{customer.followups.map(task =>
      <li key={task.id}><strong>{PURPOSES[task.purpose]}</strong><p>{task.state === "open" ? "Open" : "Completed"} · Due <time dateTime={task.dueAt}>{date(task.dueAt)}</time></p>
        {task.ownerAuthUserId !== customer.assignment.assigneeAuthUserId && <p className="ae-muted">Recorded for a previous assignee.</p>}</li>)}</ul>}
    <details className="ae-history"><summary>{aeAssignmentHistoryLabel(customer.assignmentHistory)}</summary>
      {customer.assignmentHistory.state === "available" && <ol className="ae-list">{customer.assignmentHistory.events.map(event =>
        <li key={event.id}><strong>{event.kind === "assigned" ? "Assigned" : "Reassigned"}</strong> · <time dateTime={event.occurredAt}>{date(event.occurredAt)}</time>
          <p className="ae-muted">Assignee account: <span className="ae-id">{event.assigneeAuthUserId}</span></p></li>)}</ol>}
    </details>
  </>;
}

/** Unmounted connected page; Root owns its private route, layout and sign-in. */
export function AeWorkspacePage({ session, scopeId, scopeLabel, journal }: AeWorkspacePageProps) {
  const actor = session.state === "ready" ? aeIdentifier.safeParse(session.actorAuthUserId) : null;
  const scope = aeIdentifier.safeParse(scopeId);
  const recovery = session.state === "recovery" || (session.state === "ready" && isRecoveryAccessToken(session.accessToken));
  const ready = session.state === "ready" && actor?.success && scope.success && !recovery && Boolean(session.accessToken);
  const binding = useMemo<AeSessionBinding | null>(() => ready && session.state === "ready" && actor?.success && scope.success
    ? Object.freeze({ actorAuthUserId: actor.data, scopeId: scope.data, accessToken: session.accessToken, sessionInstance: session.sessionInstance }) : null,
  [ready, session.state === "ready" ? session.actorAuthUserId : null, session.state === "ready" ? session.accessToken : null,
    session.state === "ready" ? session.sessionInstance : null, scopeId]);
  const route = useMemo(() => ({ binding, journal, active: false }), [binding, journal]);
  const live = useRef(route); live.current = route;
  const current = () => live.current === route && route.active && binding !== null;
  const api = useMemo(() => binding ? createAeWorkspaceApi(binding, () => live.current === route && route.active) : null, [route, binding]);
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const readSequence = useRef(0), pending = useRef(new Set<object>()), readController = useRef<AbortController | null>(null);
  const formId = useId(), refreshButton = useRef<HTMLButtonElement>(null);
  const state = binding && view?.route === route ? view : null;
  const coordinated = Boolean(binding && journal?.matches(binding.sessionInstance, binding.actorAuthUserId, binding.scopeId));
  useSyncExternalStore(journal?.subscribe ?? noSubscription, journal?.snapshot ?? zeroSnapshot, zeroSnapshot);
  const attempts = coordinated ? journal!.entries() : [];
  const uncertain = attempts.find(attempt => attempt.status === "uncertain");
  const unresolved = attempts.some(attempt => attempt.status === "uncertain" || attempt.status === "pending");
  // A GET can race a held reassignment and still describe the old assignment.
  // Its private data cannot release the original command's render fence.
  // A terminal access denial also keeps that customer's data concealed.
  const concealedCustomers = new Set(attempts.filter(attempt => attempt.command.kind === "reassign"
    && (attempt.status === "pending" || attempt.status === "uncertain" || attempt.status === "denied"))
    .map(attempt => attempt.command.customerAuthUserId));
  const visibleCustomers = state?.data?.customers.filter(customer => !concealedCustomers.has(customer.assignment.customerAuthUserId)) ?? [];
  const working = state?.phase === "loading" || state?.phase === "saving";

  async function refresh() {
    if (!current() || !api || pending.current.has(route)) return;
    const sequence = ++readSequence.current;
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    setDraft(null); setFormError(""); setView({ route, phase: "loading", data: null });
    try {
      const data = await api.read(controller.signal);
      if (!current() || sequence !== readSequence.current) return;
      if (coordinated) journal!.readback(data);
      setView({ route, phase: "ready", data });
    } catch (error) {
      if (!current() || sequence !== readSequence.current) return;
      const kind = error instanceof AeWorkspaceApiError ? error.kind : "unavailable";
      setView({ route, phase: kind === "session_expired" ? "session_expired" : kind === "denied" || kind === "not_found" ? "denied" : "unavailable", data: null });
    }
  }
  useEffect(() => {
    route.active = true;
    if (binding) void refresh();
    return () => { route.active = false; readSequence.current++; readController.current?.abort(); };
    // The route identity includes credential, actor, operational scope and session lifetime.
  }, [route]);
  useEffect(() => {
    if (state && !working && state.phase !== "ready") refreshButton.current?.focus();
  }, [state?.phase, working]);

  async function send(attempt: AeCommandAttempt) {
    if (!current() || !api || !coordinated || pending.current.has(route)) return;
    pending.current.add(route); ++readSequence.current; readController.current?.abort();
    setDraft(null); setFormError(""); setView({ route, phase: "saving", data: null });
    try {
      await api.command(attempt.command, attempt.openFollowupIds);
      journal!.settle(attempt, "confirmed");
      if (current()) setView({ route, phase: "confirmed", data: null, message: attempt.command.kind === "reassign"
        ? "Reassignment recorded. Refresh to load your current assigned customers."
        : "Follow-up recorded. Refresh to load the current assignment." });
    } catch (error) {
      const kind = error instanceof AeWorkspaceApiError ? error.kind : "unavailable";
      const denied = kind === "denied" || kind === "not_found" || kind === "session_expired";
      journal!.settle(attempt, denied || kind === "invalid_input" ? "denied" : kind === "conflict" ? "conflict" : "uncertain");
      if (current()) setView({ route, data: null, phase: kind === "session_expired" ? "session_expired" : denied ? "denied"
        : kind === "conflict" || kind === "invalid_input" ? "conflict" : "uncertain" });
    } finally { pending.current.delete(route); }
  }
  function confirm(event: FormEvent<HTMLFormElement>, selected: Draft) {
    event.preventDefault();
    if (!current() || !binding || !coordinated || pending.current.has(route) || unresolved
      || viewRef.current !== selected.view || selected.view.data?.customers.includes(selected.customer) !== true) return;
    const data = new FormData(event.currentTarget), assignment = selected.customer.assignment;
    let fields: Partial<AeWorkspaceCommand>;
    if (selected.kind === "record_followup") {
      const due = new Date(String(data.get("dueAt")));
      if (!Number.isFinite(due.getTime())) { setFormError("Choose a valid follow-up date and time."); return; }
      fields = { kind: "record_followup", purpose: String(data.get("purpose")) as "contact_customer", dueAt: due.toISOString() };
    } else {
      const assignee = aeIdentifier.safeParse(String(data.get("assignee")));
      if (!assignee.success || assignee.data === binding.actorAuthUserId) { setFormError("Enter a different assignee’s approved account ID."); return; }
      fields = { kind: "reassign", nextAssigneeAuthUserId: assignee.data };
    }
    try {
      const attempt = journal!.prepare({ ...fields, commandId: crypto.randomUUID(), assignmentId: assignment.id,
        customerAuthUserId: assignment.customerAuthUserId, expectedRevision: assignment.revision },
      selected.customer.followups.filter(task => task.state === "open").map(task => task.id));
      if (attempt) void send(attempt);
      else setFormError("The command could not be prepared. Refresh before trying again.");
    } catch { setFormError("The command could not be prepared. No command was sent."); }
  }

  const localState = session.state === "checking" ? "checking" : recovery ? "recovery" : session.state === "signed_out" ? "signed_out" : !binding ? "unavailable" : null;
  return <section className="ae-workspace" aria-labelledby="ae-workspace-title">
    <header className="ae-heading"><p className="ae-eyebrow">Account executive · Private workspace</p>
      <h1 id="ae-workspace-title">Assigned customers</h1><p>{scopeLabel?.trim() || "Approved operational scope"}</p></header>
    {localState === "checking" ? <p role="status">Checking your session…</p>
      : localState === "recovery" ? <section className="ae-state" role="alert"><h2>Recovery session</h2><p>Finish account recovery, then sign in normally to open this workspace.</p></section>
      : localState === "signed_out" ? <section className="ae-state"><h2>Sign-in required</h2><p>Use the ordinary account sign-in provided by this private area.</p></section>
      : localState ? <section className="ae-state" role="alert"><h2>Workspace unavailable</h2><p>The current session and operational scope could not be confirmed.</p></section>
      : <>
        {(!state || state.phase === "loading") && <p role="status">Loading assigned customers…</p>}
        {state?.phase === "saving" && <p role="status">Confirming command outcome…</p>}
        {state?.phase !== "saving" && attempts.some(attempt => attempt.status === "pending") && <p role="status">An earlier command is still pending. New commands remain unavailable until its outcome is known.</p>}
        {state?.phase === "confirmed" && <p className="ae-state" role="status">{state.message}</p>}
        {state?.phase === "denied" && <section className="ae-state" role="alert"><h2>Workspace access denied</h2><p>Your current role or assignment no longer permits this operation. No earlier customer details are displayed.</p></section>}
        {state?.phase === "session_expired" && <section className="ae-state" role="alert"><h2>Session expired</h2><p>Sign in normally again before opening the workspace.</p></section>}
        {state?.phase === "unavailable" && <section className="ae-state" role="alert"><h2>Workspace unavailable</h2><p>Current assigned customers could not be loaded. This does not mean there are no assignments.</p></section>}
        {state?.phase === "conflict" && <section className="ae-state" role="alert"><h2>Assignment changed</h2><p>The command was not confirmed. Refresh the current assignment before preparing a new command.</p></section>}
        {(state?.phase === "uncertain" || uncertain) && <section className="ae-state" role="alert"><h2>Command outcome unconfirmed</h2>
          <p>Keep the original attempt. Retry uses its same command, revision and selections. A reassignment may already have removed your access.</p>
          {uncertain && state?.phase !== "denied" && state?.phase !== "session_expired" && <button type="button" disabled={working} onClick={() => {
            if (current() && !pending.current.has(route) && journal!.retry(uncertain)) void send(uncertain);
          }}>Retry the same command</button>}</section>}
        {state?.phase === "ready" && state.data && <>
          <p className="ae-muted">Updated <time dateTime={state.data.generatedAt}>{date(state.data.generatedAt)}</time></p>
          {!coordinated && <p className="ae-state">Action tracking is unavailable. This workspace is read-only.</p>}
          {visibleCustomers.length < state.data.customers.length && <p className="ae-state" role="status">Customer details remain hidden for a reassignment with an unresolved outcome or denied access. Refreshing does not clear that command.</p>}
          {state.data.customers.length === 0 ? <section className="ae-state"><h2>No assigned customers</h2><p>No customers are assigned to this account in the current operational scope.</p></section>
            : <div className="ae-customers">{visibleCustomers.map(customer => <article className="ae-customer" key={customer.assignment.id}>
              <CustomerSummary customer={customer} />
              {coordinated && !unresolved && <div className="ae-actions">
                {state.data!.capabilities.includes("followup:record") && <button type="button" onClick={() => { if (current() && viewRef.current === state) { setDraft({ view: state, customer, kind: "record_followup" }); setFormError(""); } }}>Record follow-up</button>}
                {state.data!.capabilities.includes("customer:reassign") && <button type="button" onClick={() => { if (current() && viewRef.current === state) { setDraft({ view: state, customer, kind: "reassign" }); setFormError(""); } }}>Reassign customer</button>}
              </div>}
              {draft?.view === state && draft.customer === customer && <form className="ae-command-form" aria-label={draft.kind === "record_followup" ? "Confirm follow-up" : "Confirm reassignment"} onSubmit={event => confirm(event, draft)}>
                <h3>{draft.kind === "record_followup" ? "Confirm follow-up" : "Confirm reassignment"}</h3>
                {draft.kind === "record_followup" ? <><label htmlFor={formId + "-purpose"}>Purpose</label><select id={formId + "-purpose"} name="purpose">{Object.entries(PURPOSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
                  <label htmlFor={formId + "-due"}>Due date and time</label><input id={formId + "-due"} name="dueAt" type="datetime-local" required /></>
                  : <><p>Reassignment transfers open follow-ups and removes your current customer access. It does not change canonical referral attribution.</p>
                    <label htmlFor={formId + "-assignee"}>New assignee account ID</label><input id={formId + "-assignee"} name="assignee" autoComplete="off" required /></>}
                {formError && <p role="alert">{formError}</p>}
                <div className="ae-actions"><button type="submit">{draft.kind === "record_followup" ? "Confirm follow-up" : "Confirm reassignment"}</button><button type="button" onClick={() => setDraft(null)}>Cancel</button></div>
              </form>}
            </article>)}</div>}
        </>}
        <button className="ae-refresh" ref={refreshButton} type="button" disabled={working || pending.current.has(route)} onClick={() => void refresh()}>Refresh assigned customers</button>
      </>}
  </section>;
}
export default AeWorkspacePage;

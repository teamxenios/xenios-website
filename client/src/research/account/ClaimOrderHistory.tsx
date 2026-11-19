import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { useResearch, type ResearchContextValue } from "../core";
import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { captureHistoryClaimExpiry, createHistoryClaimApi, HISTORY_CLAIM_PATH, HistoryClaimApiError, historyClaimExpiryRemaining,
  historyClaimSession, parseHistoryClaimLink, type HistoryClaimBinding, type HistoryClaimConfirmation,
  HistoryClaimOperationCustodian, type HistoryClaimAttempt, type HistoryClaimFailure, type HistoryClaimLease,
  type HistoryClaimExpiry, type HistoryClaimLink, type HistoryClaimOwner, type PersonalHistoryContext } from "./history-claim-api";

/** No request has been made when the account itself cannot be read, so this says nothing about an outcome or an email. */
const CONTEXT_UNAVAILABLE = "We can’t load your account history right now. Try again, or contact support.";
const CLOSED_RETRY_UNCERTAIN = "History linking isn’t available right now, so this retry did not run. The earlier confirmation is still unconfirmed. Keep the original claim or contact support.";
const COPY: Record<HistoryClaimFailure, string> = {
  signed_out: "Sign in normally, then reopen your secure history link.",
  denied: "This history is not available to the current account. Contact support if you need help.",
  password_required: "Required account security setup has not been confirmed. Contact support before continuing.",
  invalid_claim: "This claim or customer reference is not valid. Use your latest secure link or contact support.",
  conflict: "This history is already attached to another account. Contact support.",
  closed: "History linking isn’t available yet. This attempt did not send an ownership email or link any history. View your account history or contact support.",
  unavailable: "We couldn’t confirm the outcome. Check your email or contact support before starting another request.",
  stale: "Your session changed. Reopen your secure history link after signing in normally.",
};
const operations = new HistoryClaimOperationCustodian();
function verifiedOwner(research: ResearchContextValue): HistoryClaimOwner | null {
  if (research.memberChecking || research.memberSessionStatus !== "authenticated" || research.recovery !== "none" || research.member?.status !== "active") return null;
  const identity = historyClaimSession(research.memberToken);
  return identity ? { ...identity, cartScope: research.member.cartScope ?? "" } : null;
}

/** Root places this inside ResearchProvider, OUTSIDE its unchanged RequireMember.
 * It retires operation custody; it never establishes Auth or bypasses a guard. */
export function HistoryClaimOperationBoundary({ children }: { children: ReactNode }) {
  const research = useResearch(), owner = verifiedOwner(research);
  const checking = research.recovery === "none" && (research.memberChecking || research.memberSessionStatus === "checking");
  const key = owner ? owner.actorAuthUserId + ":" + owner.sessionId + ":" + owner.cartScope : null;
  useLayoutEffect(() => { operations.observe(checking ? "checking" : owner); }, [checking, key]);
  useEffect(() => () => operations.retire(), []);
  return <>{children}</>;
}

/** Personal leaf of the existing account portal; Root owns exact protected routing. */
export function ClaimOrderHistory() {
  const { member, memberToken, memberChecking, memberSessionStatus, recovery } = useResearch();
  const identity = historyClaimSession(memberToken);
  const checking = memberChecking || memberSessionStatus === "checking";
  const ready = !checking && recovery === "none" && memberSessionStatus === "authenticated" && member?.status === "active" && identity && memberToken;
  const key = ready && identity && member ? identity.actorAuthUserId + ":" + identity.sessionId + ":" + (member.cartScope ?? "") : null;
  const captured = useRef<{ link: HistoryClaimLink; owner: string | null; hadProof: boolean; expiry: HistoryClaimExpiry } | null>(null);
  const [capturedReady, setCapturedReady] = useState(false);
  const [expiredCapture, setExpiredCapture] = useState<object | null>(null);
  useLayoutEffect(() => {
    if (captured.current) return;
    const expiry = captureHistoryClaimExpiry();
    let link = parseHistoryClaimLink(window.location.pathname, window.location.search, window.location.hash);
    try {
      // This is a leaf-local, post-mount scrub. Root must protect pre-lazy
      // analytics/router/server handling; this does not attest global redaction.
      if (link.kind !== "foreign" && (window.location.search || window.location.hash)) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch { link = { kind: "unavailable" }; }
    const retained = !checking && !ready && link.kind !== "foreign" ? { kind: "none" as const } : link;
    captured.current = { link: retained, owner: key, hadProof: retained.kind === "ready", expiry };
    setCapturedReady(true);
  }, []);
  // Canonical initial checking may finish without navigation. Terminal or
  // different ordinary sessions cannot inherit the transient emailed proof.
  if (captured.current && captured.current.link.kind !== "foreign") {
    if ((!checking && !ready) || (captured.current.owner !== null && captured.current.owner !== key)) {
      captured.current = { link: { kind: "none" }, owner: key, hadProof: false, expiry: captured.current.expiry };
    }
    if (key && captured.current.owner === null) captured.current.owner = key;
  }
  const capture = captured.current;
  useEffect(() => {
    if (!capturedReady || !capture?.hadProof) return;
    const expire = () => { if (captured.current !== capture) return; capture.link = { kind: "none" }; setExpiredCapture(capture); };
    const remaining = historyClaimExpiryRemaining(capture.expiry);
    if (remaining <= 0) { expire(); return; }
    const timer = setTimeout(expire, remaining); return () => clearTimeout(timer);
  }, [capturedReady, capture]);
  const initial = captured.current?.link ?? { kind: "none" as const };
  return <>
    <SeoHead title="Claim earlier order history | Xenios" description="Confirm your own earlier order history with a secure account challenge."
      path={HISTORY_CLAIM_PATH} robots="noindex, nofollow" />
    <AccountPortalShell title="Claim earlier order history." lead="View the history linked to your account, or use a secure ownership challenge to link earlier records. No paid membership activation is needed."
      currentPath={HISTORY_CLAIM_PATH}>
      {!capturedReady || checking ? <p role="status">Checking your session…</p>
        : initial.kind === "foreign" || initial.kind === "unavailable" ? <p role="alert">This history link is not available here. Reopen the exact secure link from your email.</p>
        : !ready || !identity || !memberToken ? <section role="alert"><p>{recovery !== "none"
          ? "Finish account recovery, then sign in normally and reopen your secure history link." : COPY.signed_out}</p>
          <Link href={researchAuthPath("/research/sign-in", HISTORY_CLAIM_PATH)} className="btn btn-primary">Sign in</Link></section>
        : <PersonalHistoryForm key={key} binding={{ ...identity, accessToken: memberToken }} owner={{ ...identity, cartScope: member?.cartScope ?? "" }} initial={initial}
          captureExpiry={capture?.hadProof ? capture.expiry : null} captureExpired={capture !== null && expiredCapture === capture}
          consumeLink={() => { if (captured.current?.owner === key) captured.current.link = { kind: "none" }; }}
          discardCapture={() => {
            const previous = captured.current;
            if (previous?.owner === key) captured.current = { ...previous, link: { kind: "none" }, hadProof: false };
          }} />}
      <p className="body-s mt-6">A request reference alone does not establish ownership. This page links earlier customer order history; it does not approve a new request or change referral attribution.</p>
      <Link href="/research/account/support" className="btn btn-ghost mt-4">Contact support</Link>
    </AccountPortalShell>
  </>;
}

function PersonalHistoryForm({ binding, owner, initial, consumeLink, discardCapture, captureExpiry, captureExpired }: {
  binding: HistoryClaimBinding; owner: HistoryClaimOwner; initial: HistoryClaimLink; consumeLink: () => void; discardCapture: () => void;
  captureExpiry: HistoryClaimExpiry | null; captureExpired: boolean;
}) {
  const frame = useMemo(() => ({ binding, active: false }), [binding.accessToken, binding.actorAuthUserId, binding.sessionId]);
  const live = useRef(frame); live.current = frame;
  const alive = useRef(false), busy = useRef(false), readSequence = useRef(0), readAbort = useRef<AbortController | null>(null);
  const [read, setRead] = useState<{ frame: object; data?: PersonalHistoryContext; error?: HistoryClaimFailure } | null>(null);
  const [lease, setLease] = useState<HistoryClaimLease | null>(() => operations.restore(owner));
  const [draftAttempt, setDraftAttempt] = useState<HistoryClaimAttempt | null>(() => !lease && initial.kind === "ready" ? { kind: "confirm", command: initial.command, status: "ready" } : null);
  const [reference, setReference] = useState("");
  const [showReferenceForm, setShowReferenceForm] = useState(false);
  const referenceChoice = useRef<HTMLButtonElement | null>(null), returnToChoice = useRef(false);
  const [error, setError] = useState<string | null>(() => initial.kind === "invalid" ? COPY.invalid_claim : null);
  useSyncExternalStore(operations.subscribe, operations.snapshot, operations.snapshot);
  const retained = lease ? operations.read(lease) : null, attempt = lease ? retained : draftAttempt;
  const retired = captureExpired || (lease !== null && retained === null);
  const api = useMemo(() => createHistoryClaimApi(frame.binding, () => live.current === frame && frame.active && operations.admitted(owner)), [frame]);
  const current = () => live.current === frame && frame.active && operations.admitted(owner);
  const context = read?.frame === frame ? read : null;
  const canAct = Boolean(context?.data && !context.error);
  // Keyboard focus follows the step the customer's own action produced; the first load keeps page order.
  const stepHost = useRef<HTMLElement | null>(null), acted = useRef(false), shownStep = useRef("");
  const hostStep = (element: HTMLElement | null) => { stepHost.current = element; };
  const step = retired ? "retired" : !context ? "checking" : context.error ? "error:" + context.error
    : !attempt ? "request" : attempt.kind + ("status" in attempt ? ":" + attempt.status : "");
  useLayoutEffect(() => {
    const focusStep = step + (error ? ":error:" + error : "");
    const changed = shownStep.current !== focusStep; shownStep.current = focusStep;
    if (changed && acted.current) stepHost.current?.querySelector<HTMLElement>("[data-step-focus], input")?.focus();
  }, [step, error]);
  useLayoutEffect(() => {
    if (showReferenceForm || !returnToChoice.current) return;
    returnToChoice.current = false;
    if (current() && canAct && !attempt) referenceChoice.current?.focus();
  }, [showReferenceForm]);
  // Once the form owns the frozen attempt, the outer capture retains no token.
  useEffect(() => { consumeLink(); }, []);
  useEffect(() => { if (captureExpired) setDraftAttempt(null); }, [captureExpired]);
  async function load() {
    if (!current() || retired) return;
    const sequence = ++readSequence.current; setRead(null);
    readAbort.current?.abort(); const controller = new AbortController(); readAbort.current = controller;
    try { const data = await api.context(controller.signal); if (current() && readSequence.current === sequence) {
      setRead({ frame, data });
    } }
    catch (problem) { if (current() && readSequence.current === sequence) {
      const kind = problem instanceof HistoryClaimApiError ? problem.kind : "unavailable";
      setRead({ frame, error: kind });
      if (kind === "signed_out" || kind === "denied" || kind === "password_required") { setDraftAttempt(null); operations.retire(); }
    } }
  }
  useEffect(() => { alive.current = true; frame.active = true;
    void Promise.resolve().then(() => {
      if (!current()) return;
      if (!lease && draftAttempt?.kind === "confirm" && draftAttempt.status === "ready" && captureExpiry) {
        const kept = operations.retain(owner, draftAttempt, captureExpiry);
        if (!kept) { setDraftAttempt(null); return; }
        setLease(kept); setDraftAttempt(null);
      }
      void load();
    });
    return () => {
    frame.active = false; alive.current = false; readSequence.current++; readAbort.current?.abort();
  }; }, [frame]);
  async function request(event: FormEvent) {
    event.preventDefault(); if (!current() || !canAct || !showReferenceForm || busy.current || attempt || retired) return;
    const value = reference.trim(); busy.current = true; acted.current = true; setError(null);
    const ticket = operations.start(owner, { kind: "request", reference: value, status: "pending" });
    if (!ticket) { busy.current = false; setError(COPY.invalid_claim); return; }
    setLease(ticket.lease); setDraftAttempt(null);
    try {
      const result = await api.requestChallenge(value);
      operations.settle(ticket.run, current() ? { kind: "challenge", reference: value, ...result } : { kind: "request", reference: value, status: "uncertain" });
    } catch (problem) {
      const kind = problem instanceof HistoryClaimApiError ? problem.kind : "unavailable";
      const uncertain = kind === "unavailable" || kind === "stale";
      const settled = operations.settle(ticket.run, uncertain ? { kind: "request", reference: value, status: "uncertain" } : { kind: "refused", reason: kind });
      if ((uncertain || !settled) && alive.current && current()) setError(COPY[kind]);
    } finally { busy.current = false; }
  }
  async function send(command: HistoryClaimConfirmation, expected?: string) {
    if (!current() || !canAct || busy.current || retired) return;
    const previousLease = operations.restore(owner);
    const previousAttempt = previousLease ? operations.read(previousLease) : null;
    const wasUncertain = previousAttempt?.kind === "confirm" && previousAttempt.status === "uncertain";
    busy.current = true; acted.current = true; setError(null);
    const ticket = operations.start(owner, { kind: "confirm", command, reference: expected, status: "pending" }, lease ?? undefined);
    if (!ticket) { busy.current = false; setError(COPY.stale); return; }
    setLease(ticket.lease); setDraftAttempt(null);
    try {
      const result = await api.confirm(command, expected);
      operations.settle(ticket.run, current() ? { kind: "complete", replayed: result.replayed } : { kind: "confirm", command, reference: expected, status: "uncertain" });
    } catch (problem) {
      const kind = problem instanceof HistoryClaimApiError ? problem.kind : "unavailable";
      // Closing this retry cannot establish whether the earlier attempt committed.
      const closedRetry = kind === "closed" && wasUncertain;
      const uncertain = kind === "unavailable" || kind === "stale" || closedRetry;
      const settled = operations.settle(ticket.run, uncertain ? { kind: "confirm", command, reference: expected, status: "uncertain" } : { kind: "refused", reason: kind });
      if ((uncertain || !settled) && alive.current && current()) setError(closedRetry ? CLOSED_RETRY_UNCERTAIN : COPY[kind]);
    } finally { busy.current = false; }
  }
  function confirm(event: FormEvent) {
    event.preventDefault();
    // The existing email carries a secure link, not a separately displayed code.
    // Only its captured, frozen command can enter the explicit confirmation rail.
    if (attempt?.kind !== "confirm") { setError(COPY.invalid_claim); return; }
    void send(attempt.command, attempt.reference);
  }
  if (retired) return <div ref={hostStep}><p role="alert" tabIndex={-1} data-step-focus>This claim session has ended. Reopen your secure link or contact support before continuing.</p></div>;
  if (!context) return <div ref={hostStep}><p role="status">Checking your personal account…</p></div>;
  if (context.error) return <section role="alert" ref={hostStep}><p tabIndex={-1} data-step-focus>{context.error === "unavailable" ? CONTEXT_UNAVAILABLE : COPY[context.error]}</p>{context.error === "unavailable"
    ? <button type="button" className="btn btn-secondary" onClick={() => { acted.current = true; void load(); }}>Check account again</button>
    : <Link href={researchAuthPath("/research/sign-in", HISTORY_CLAIM_PATH)} className="btn btn-primary">Sign in normally</Link>}</section>;
  return <section className="card space-y-5" data-testid="claim-order-history" ref={hostStep}>
    <p>Earlier history can be attached only to your own personal account. Your verified email must match its customer record.</p>
    {error && <p role="alert" tabIndex={-1} data-step-focus>{error}</p>}
    {attempt?.kind === "refused" ? <><p role="alert" tabIndex={-1} data-step-focus>{COPY[attempt.reason]}</p>
      {attempt.reason === "closed" && <div className="flex flex-wrap gap-3">
        <Link href="/research/account/orders" className="btn btn-primary">View account history</Link>
      </div>}
      {attempt.reason === "invalid_claim" && lease && <button type="button" className="btn btn-secondary" onClick={() => {
        if (!current() || !canAct || busy.current || retired || !lease || !operations.dismissRefusal(owner, lease)) return;
        // The refused proof is gone. Its original capture timer cannot retire a
        // later, explicitly requested operation or extend the old command.
        discardCapture(); acted.current = true; setLease(null); setError(null); setShowReferenceForm(true); }}>Enter a different reference</button>}</>
      : attempt?.kind === "complete" ? <div role="status"><p tabIndex={-1} data-step-focus>{attempt.replayed ? "This history was already linked to your account." : "Order history is now linked to your account."}</p>
      <Link href="/research/account/orders" className="btn btn-primary">Review commerce history</Link></div>
      : !attempt ? showReferenceForm ? <form onSubmit={event => void request(event)} aria-label="Request history challenge" className="space-y-5">
        <p id="history-customer-ref-help">Use a customer reference provided by Xenios. This is not your request reference or order number. If you do not have one, go back to the history and support options.</p>
        <label htmlFor="history-customer-ref" className="form-label">Customer reference from Xenios</label>
        <input id="history-customer-ref" className="input-field" value={reference} onChange={event => setReference(event.target.value.trim())} required pattern="eac_[a-f0-9]{32}" maxLength={64} autoComplete="off" aria-describedby="history-customer-ref-help" autoFocus />
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary">Send ownership challenge</button>
          <button type="button" className="btn btn-ghost" onClick={() => {
            if (!current() || busy.current || attempt) return;
            returnToChoice.current = true; setReference(""); setError(null); setShowReferenceForm(false);
          }}>Back to history help</button>
        </div></form>
        : <div className="space-y-5" aria-labelledby="history-help-title">
          <h2 id="history-help-title" className="body-l" tabIndex={-1} data-step-focus>Missing earlier orders?</h2>
          <p>Start with the history already linked to your account. If Xenios sent you a secure history email, reopen that link after signing in.</p>
          <p>You do not need a customer reference to view your account history or ask for help. The FAQs explain the current support options; support coverage and response times are not guaranteed.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/research/account/orders" className="btn btn-primary">View account history</Link>
            <Link href="/research/faq" className="btn btn-secondary">Read FAQs and support options</Link>
            <Link href="/research/support" className="btn btn-ghost">Get support</Link>
          </div>
          <button ref={referenceChoice} type="button" className="btn btn-secondary" onClick={() => {
            if (current() && canAct && !busy.current && !attempt) setShowReferenceForm(true);
          }}>I already have a customer reference from Xenios</button>
        </div>
      : attempt.kind === "request" ? <p role="status" tabIndex={-1} data-step-focus>{attempt.status === "pending" ? "Requesting your ownership challenge…"
        : "Delivery is unconfirmed. Check your email or contact support. No second request has been sent."}</p>
      : attempt.kind === "challenge" ? <div className="space-y-3">
        <p id="history-challenge-status" role="status" tabIndex={-1} data-step-focus>{attempt.deliveryAccepted
          ? "Your ownership challenge was accepted for delivery to your verified email. Open the secure link in that message to review and confirm your history claim."
          : "Email delivery was not confirmed. Check your email or contact support before requesting another challenge."}</p>
        <p>No history has been linked by this request. Confirmation happens after you open the secure link and choose Confirm and link.</p>
      </div>
      : <>
        {attempt.status === "pending" ? <p role="status" tabIndex={-1} data-step-focus>Confirming your history claim…</p>
          : <form onSubmit={confirm} aria-label="Confirm history claim" className="space-y-5">
            <p tabIndex={-1} data-step-focus>{attempt.status === "uncertain" ? "The earlier confirmation is still unconfirmed. Keep this original claim. Retry sends the same claim and challenge; it does not request another email."
                : "Your secure history link is ready. Confirm only if you want to attach this earlier history to your current personal account."}</p>
            <button type="submit" className="btn btn-primary">{attempt.status === "uncertain" ? "Retry the same confirmation" : "Confirm and link"}</button>
          </form>}
      </>}
  </section>;
}
export default ClaimOrderHistory;

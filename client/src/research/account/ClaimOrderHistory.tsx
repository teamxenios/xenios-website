import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { useResearch, type ResearchContextValue } from "../core";
import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { createHistoryClaimApi, freezeHistoryConfirmation, HISTORY_CLAIM_PATH, HistoryClaimApiError,
  historyClaimSession, parseHistoryClaimLink, type HistoryClaimBinding, type HistoryClaimConfirmation,
  HistoryClaimOperationCustodian, type HistoryClaimAttempt, type HistoryClaimFailure, type HistoryClaimLease,
  type HistoryClaimLink, type HistoryClaimOwner, type PersonalHistoryContext } from "./history-claim-api";

const COPY: Record<HistoryClaimFailure, string> = {
  signed_out: "Sign in normally, then reopen your secure history link.",
  denied: "This history is not available to the current account. Contact support if you need help.",
  password_required: "Required account security setup has not been confirmed. Contact support before continuing.",
  invalid_claim: "This claim or customer reference is not valid. Use your latest secure link or contact support.",
  conflict: "This history is already attached to another account. Contact support.",
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
  const captured = useRef<{ link: HistoryClaimLink; owner: string | null } | null>(null);
  const [capturedReady, setCapturedReady] = useState(false);
  useLayoutEffect(() => {
    if (captured.current) return;
    let link = parseHistoryClaimLink(window.location.pathname, window.location.search, window.location.hash);
    try {
      // This is a leaf-local, post-mount scrub. Root must protect pre-lazy
      // analytics/router/server handling; this does not attest global redaction.
      if (link.kind !== "foreign" && (window.location.search || window.location.hash)) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch { link = { kind: "unavailable" }; }
    captured.current = { link: !checking && !ready && link.kind !== "foreign" ? { kind: "none" } : link, owner: key };
    setCapturedReady(true);
  }, []);
  // Canonical initial checking may finish without navigation. Terminal or
  // different ordinary sessions cannot inherit the transient emailed proof.
  if (captured.current && captured.current.link.kind !== "foreign") {
    if ((!checking && !ready) || (captured.current.owner !== null && captured.current.owner !== key)) captured.current.link = { kind: "none" };
    if (key && captured.current.owner === null) captured.current.owner = key;
  }
  const initial = captured.current?.link ?? { kind: "none" as const };
  return <>
    <SeoHead title="Claim earlier order history | Xenios" description="Confirm your own earlier order history with a secure account challenge."
      path={HISTORY_CLAIM_PATH} robots="noindex, nofollow" />
    <AccountPortalShell title="Claim earlier order history." lead="Your verified account and a one-time ownership challenge are both required. No paid membership activation is needed."
      currentPath={HISTORY_CLAIM_PATH}>
      {!capturedReady || checking ? <p role="status">Checking your session…</p>
        : initial.kind === "foreign" || initial.kind === "unavailable" ? <p role="alert">This history link is not available here. Reopen the exact secure link from your email.</p>
        : !ready || !identity || !memberToken ? <section role="alert"><p>{recovery !== "none"
          ? "Finish account recovery, then sign in normally and reopen your secure history link." : COPY.signed_out}</p>
          <Link href={researchAuthPath("/research/sign-in", HISTORY_CLAIM_PATH)} className="btn btn-primary">Sign in</Link></section>
        : <PersonalHistoryForm key={key} binding={{ ...identity, accessToken: memberToken }} owner={{ ...identity, cartScope: member?.cartScope ?? "" }} initial={initial}
          consumeLink={() => { if (captured.current?.owner === key) captured.current.link = { kind: "none" }; }} />}
      <p className="body-s mt-6">A request reference alone does not establish ownership. This page links earlier customer order history; it does not approve a new request or change referral attribution.</p>
      <Link href="/research/account/support" className="btn btn-ghost mt-4">Contact support</Link>
    </AccountPortalShell>
  </>;
}

function PersonalHistoryForm({ binding, owner, initial, consumeLink }: { binding: HistoryClaimBinding; owner: HistoryClaimOwner; initial: HistoryClaimLink; consumeLink: () => void }) {
  const frame = useMemo(() => ({ binding, active: false }), [binding.accessToken, binding.actorAuthUserId, binding.sessionId]);
  const live = useRef(frame); live.current = frame;
  const alive = useRef(false), busy = useRef(false), readSequence = useRef(0), readAbort = useRef<AbortController | null>(null);
  const [read, setRead] = useState<{ frame: object; data?: PersonalHistoryContext; error?: HistoryClaimFailure } | null>(null);
  const [lease, setLease] = useState<HistoryClaimLease | null>(() => operations.restore(owner));
  const [draftAttempt, setDraftAttempt] = useState<HistoryClaimAttempt | null>(() => !lease && initial.kind === "ready" ? { kind: "confirm", command: initial.command, status: "ready" } : null);
  const [reference, setReference] = useState(""), [challenge, setChallenge] = useState("");
  const [error, setError] = useState<string | null>(() => initial.kind === "invalid" ? COPY.invalid_claim : null);
  useSyncExternalStore(operations.subscribe, operations.snapshot, operations.snapshot);
  const retained = lease ? operations.read(lease) : null, attempt = lease ? retained : draftAttempt;
  const retired = lease !== null && retained === null;
  const api = useMemo(() => createHistoryClaimApi(frame.binding, () => live.current === frame && frame.active && operations.admitted(owner)), [frame]);
  const current = () => live.current === frame && frame.active && operations.admitted(owner);
  const context = read?.frame === frame ? read : null;
  const canAct = Boolean(context?.data && !context.error);
  // Once the form owns the frozen attempt, the outer capture retains no token.
  useEffect(() => { consumeLink(); }, []);
  async function load() {
    if (!current()) return;
    const sequence = ++readSequence.current; setRead(null);
    readAbort.current?.abort(); const controller = new AbortController(); readAbort.current = controller;
    try { const data = await api.context(controller.signal); if (current() && readSequence.current === sequence) {
      if (!lease && draftAttempt?.kind === "confirm" && draftAttempt.status === "ready") {
        const kept = operations.retain(owner, draftAttempt); if (kept) { setLease(kept); setDraftAttempt(null); }
      }
      setRead({ frame, data });
    } }
    catch (problem) { if (current() && readSequence.current === sequence) {
      const kind = problem instanceof HistoryClaimApiError ? problem.kind : "unavailable";
      setRead({ frame, error: kind });
      if (kind === "signed_out" || kind === "denied" || kind === "password_required") { setDraftAttempt(null); operations.retire(); }
    } }
  }
  useEffect(() => { alive.current = true; frame.active = true;
    void Promise.resolve().then(() => { if (current()) void load(); });
    return () => {
    frame.active = false; alive.current = false; readSequence.current++; readAbort.current?.abort();
  }; }, [frame]);
  async function request(event: FormEvent) {
    event.preventDefault(); if (!current() || !canAct || busy.current || attempt || retired) return;
    const value = reference.trim(); busy.current = true; setError(null);
    const ticket = operations.start(owner, { kind: "request", reference: value, status: "pending" });
    if (!ticket) { busy.current = false; setError(COPY.invalid_claim); return; }
    setLease(ticket.lease); setDraftAttempt(null);
    try {
      const result = await api.requestChallenge(value);
      operations.settle(ticket.run, current() ? { kind: "challenge", reference: value, ...result } : { kind: "request", reference: value, status: "uncertain" });
    } catch (problem) {
      const kind = problem instanceof HistoryClaimApiError ? problem.kind : "unavailable";
      operations.settle(ticket.run, kind === "unavailable" || kind === "stale" ? { kind: "request", reference: value, status: "uncertain" } : { kind: "refused", reason: kind });
      if (alive.current && current()) setError(COPY[kind]);
    } finally { busy.current = false; }
  }
  async function send(command: HistoryClaimConfirmation, expected?: string) {
    if (!current() || !canAct || busy.current || retired) return;
    busy.current = true; setError(null); setChallenge("");
    const ticket = operations.start(owner, { kind: "confirm", command, reference: expected, status: "pending" }, lease ?? undefined);
    if (!ticket) { busy.current = false; setError(COPY.stale); return; }
    setLease(ticket.lease); setDraftAttempt(null);
    try {
      const result = await api.confirm(command, expected);
      operations.settle(ticket.run, current() ? { kind: "complete", replayed: result.replayed } : { kind: "confirm", command, reference: expected, status: "uncertain" });
    } catch (problem) {
      const kind = problem instanceof HistoryClaimApiError ? problem.kind : "unavailable";
      operations.settle(ticket.run, kind === "unavailable" || kind === "stale" ? { kind: "confirm", command, reference: expected, status: "uncertain" } : { kind: "refused", reason: kind });
      if (alive.current && current()) setError(COPY[kind]);
    } finally { busy.current = false; }
  }
  function confirm(event: FormEvent) {
    event.preventDefault();
    const command = attempt?.kind === "confirm" ? attempt.command : attempt?.kind === "challenge"
      ? freezeHistoryConfirmation({ claimId: attempt.claimId, challengeToken: challenge.trim() }) : null;
    if (!command) { setError("Enter the one-time challenge from your latest secure email."); return; }
    void send(command, attempt?.kind === "challenge" || attempt?.kind === "confirm" ? attempt.reference : undefined);
  }
  if (!context) return <p role="status">Checking your personal account…</p>;
  if (context.error) return <section role="alert"><p>{COPY[context.error]}</p>{context.error === "unavailable"
    ? <button type="button" onClick={() => void load()}>Check account again</button>
    : <Link href={researchAuthPath("/research/sign-in", HISTORY_CLAIM_PATH)}>Sign in normally</Link>}</section>;
  if (retired) return <p role="alert">This claim session has ended. Reopen your secure link or contact support before continuing.</p>;
  return <section className="card space-y-5" data-testid="claim-order-history">
    <p>Earlier history can be attached only to your own personal account. Your verified email must match its customer record.</p>
    {error && <p role="alert">{error}</p>}
    {attempt?.kind === "refused" ? <p role="alert">{COPY[attempt.reason]}</p>
      : attempt?.kind === "complete" ? <div role="status"><p>{attempt.replayed ? "This history was already linked to your account." : "Order history is now linked to your account."}</p>
      <Link href="/research/account/orders" className="btn btn-primary">Review commerce history</Link></div>
      : !attempt ? <form onSubmit={event => void request(event)} aria-label="Request history challenge" className="space-y-5">
        <label htmlFor="history-customer-ref" className="form-label">Customer reference</label>
        <input id="history-customer-ref" className="input-field" value={reference} onChange={event => setReference(event.target.value)} required pattern="eac_[a-f0-9]{32}" maxLength={36} autoComplete="off" />
        <button type="submit" className="btn btn-primary">Send ownership challenge</button></form>
      : attempt.kind === "request" ? <p role="status">{attempt.status === "pending" ? "Requesting your ownership challenge…"
        : "Delivery is unconfirmed. Check your email or contact support. No second request has been sent."}</p>
      : <>
        {attempt.kind === "challenge" && <p role="status">{attempt.deliveryAccepted
          ? "Your ownership challenge was accepted for delivery to your verified email. Check that message for the secure link."
          : "Email delivery was not confirmed. Check your email or contact support before requesting another challenge."}</p>}
        {attempt.kind === "confirm" && attempt.status === "pending" ? <p role="status">Confirming your history claim…</p>
          : <form onSubmit={confirm} aria-label="Confirm history claim" className="space-y-5">
            {attempt.kind === "challenge" ? <><label htmlFor="history-token" className="form-label">One-time challenge</label>
              <input id="history-token" className="input-field" type="password" autoComplete="one-time-code" maxLength={43} required value={challenge} onChange={event => setChallenge(event.target.value)} /></>
              : <p>{attempt.status === "uncertain" ? "Keep this original claim. Retry sends the same claim and challenge; it does not request another email."
                : "Your secure history link is ready. Confirm only if you want to attach this earlier history to your current personal account."}</p>}
            <button type="submit" className="btn btn-primary">{attempt.kind === "confirm" && attempt.status === "uncertain" ? "Retry the same confirmation" : "Confirm and link"}</button>
          </form>}
      </>}
  </section>;
}
export default ClaimOrderHistory;

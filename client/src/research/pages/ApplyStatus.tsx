import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearch } from "wouter";
import SeoHead from "@/components/SeoHead";
import { getSupabaseBrowser, isRecoveryAccessToken } from "@/lib/supabaseBrowser";
import type { ApplicationStatusView } from "@shared/research/membership-types";
import { CustomerClaimResult } from "@shared/research/approved-customer-access";
import { captureRecoveryMarker, markRecoveryFromAuthEvent } from "@shared/research/recovery";
import { researchAuthPath, safeResearchReturnTo } from "@shared/research/auth-return-to";
import { useResearch } from "../core";
import { ACCOUNT_PORTAL_ROUTES } from "../lib/routes";
import { PageIntro } from "../components";
import { ResearchErrorState, ResearchLoadingState } from "../ui/kit";

const STATUS_PATH = "/research/apply/status";
const TOKEN_KEY = "xr-application-token";
const STATUS_COPY: Record<string, { title: string; body: string }> = {
  draft: { title: "Application not submitted", body: "Your application has not been submitted for review." },
  submitted: { title: "In review", body: "Your application has been received and is waiting for review." },
  resubmitted: { title: "In review", body: "Your additional information has been received for review." },
  under_review: { title: "Under review", body: "Your application is being reviewed individually." },
  more_information_requested: { title: "One more step", body: "More information is needed to finish the review. Check the request you received." },
  approved_customer: { title: "Customer access approved", body: "Complete the secure account claim below. No paid membership activation is required." },
  approved_pending_payment: { title: "Approval recorded", body: "This application uses a historical approval status. Sign in normally or contact support to review customer access. This page does not request a membership payment." },
  approved_sponsored_b2b: { title: "Business approval recorded", body: "Sign in normally or contact support to review this business account. No partner or customer permission is inferred from this approval label." },
  payment_pending: { title: "Account review pending", body: "A historical activation review is recorded. Contact support for the next authorized account-access step." },
  active: { title: "Account active", body: "This application is recorded as active. Sign in normally to verify and open your customer account." },
  paused: { title: "Account paused", body: "Account access is paused. Contact support for review." },
  declined: { title: "Not approved", body: "This application was not approved. This is not a medical judgment or personal assessment." },
  withdrawn: { title: "Withdrawn", body: "This application was withdrawn." },
  expired: { title: "Expired", body: "This approval has expired. Contact support to review the next step." },
};

function storedToken(): { available: boolean; token: string } {
  try { return { available: true, token: window.sessionStorage.getItem(TOKEN_KEY) || "" }; }
  catch { return { available: false, token: "" }; }
}
function validToken(value: string) { return value.length >= 10 && value.length <= 400 && !/[\u0000-\u0020\u007f]/.test(value); }
function recoveryPending() {
  try { return captureRecoveryMarker(window.location.hash, window.sessionStorage); }
  catch { return true; }
}
type ClaimSession = { kind: "checking" | "signed_out" | "recovery" | "unavailable" } | { kind: "normal"; bearer: string };
function sessionContext(session: { access_token?: unknown } | null): ClaimSession {
  if (recoveryPending()) return { kind: "recovery" };
  if (!session) return { kind: "signed_out" };
  const bearer = session.access_token;
  if (typeof bearer !== "string" || !bearer) return { kind: "unavailable" };
  return isRecoveryAccessToken(bearer) ? { kind: "recovery" } : { kind: "normal", bearer };
}
async function currentSession(): Promise<ClaimSession> {
  if (recoveryPending()) return { kind: "recovery" };
  try {
    const client = await getSupabaseBrowser();
    if (!client) return { kind: "unavailable" };
    const result = await client.auth.getSession();
    return result.error ? { kind: "unavailable" } : sessionContext(result.data.session);
  } catch { return { kind: "unavailable" }; }
}
function sameSession(a: ClaimSession, b: ClaimSession) {
  return a.kind === b.kind && (a.kind !== "normal" || b.kind === "normal" && a.bearer === b.bearer);
}

const CLAIM_ERRORS: Record<string, string> = {
  existing_sign_in_required: "An account already exists for this email. Sign in normally, then return here to finish the claim. Your password was not changed.",
  verified_sign_in_required: "A normal verified sign-in is required. Sign in, then return here to continue.",
  identity_review_required: "This sign-in could not be matched to the approved account link. Contact support; no identity was rebound.",
  claim_incomplete: "Account access could not be confirmed. Your sign-in may already exist. Sign in normally and return here to retry safely.",
  approved_access_unavailable: "Approved account access is unavailable right now. No completed claim is confirmed.",
  claim_not_available: "This claim is not available. Use the latest account link or contact support.",
  invalid_input: "The claim could not be accepted. Use the latest account link and a password of 10 to 200 characters for a new sign-in.",
  auth_creation_failed: "The sign-in could not be created. Please try again.",
};
const SIGN_IN_ERRORS = new Set(["existing_sign_in_required", "verified_sign_in_required", "claim_incomplete"]);

function ClaimForm({ token, returnTo, session, setSession, isCurrent, refreshMember }: {
  token: string; returnTo: string | null; session: ClaimSession; setSession: (value: ClaimSession) => void;
  isCurrent: () => boolean; refreshMember: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInRequired, setSignInRequired] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const alive = useRef(false);
  const busyRef = useRef(false);
  const successRef = useRef<HTMLDivElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (claimed) successRef.current?.focus(); }, [claimed]);
  const normal = session.kind === "normal";
  const signInHref = researchAuthPath("/research/sign-in", STATUS_PATH);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!alive.current || busyRef.current || signInRequired || !isCurrent()) return;
    if (!normal && (password.length < 10 || password.length > 200)) { setError("Choose a password of 10 to 200 characters."); return; }
    if (!normal && password !== confirm) { setError("The passwords do not match."); return; }
    busyRef.current = true; setBusy(true); setError(null);
    try {
      // Re-read the provider session, not memberToken: an existing Auth user
      // may not yet have a customer record. Never reset an existing password.
      const latest = await currentSession();
      if (!alive.current || !isCurrent()) return;
      if (!sameSession(latest, session)) { setSession(latest); return; }
      if (latest.kind !== "normal" && latest.kind !== "signed_out") { setSession(latest); return; }
      const res = await fetch("/api/research/member/claim", {
        method: "POST", credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", ...(latest.kind === "normal" ? { Authorization: "Bearer " + latest.bearer } : {}) },
        body: JSON.stringify(latest.kind === "normal" ? { token } : { token, password }),
      });
      const body = await res.json().catch(() => null);
      const after = await currentSession();
      if (!alive.current || !isCurrent()) return;
      if (!sameSession(after, session)) { setSession(after); return; }
      setPassword(""); setConfirm("");
      const result = CustomerClaimResult.safeParse(body);
      if (res.ok && result.success) {
        if (normal) await refreshMember().catch(() => {});
        if (alive.current && isCurrent()) setClaimed(true);
      } else {
        const code = typeof body?.code === "string" && Object.hasOwn(CLAIM_ERRORS, body.code) ? body.code : null;
        setError(code ? CLAIM_ERRORS[code] : "The account claim could not be confirmed. Use the latest account link or contact support.");
        setSignInRequired(!!code && SIGN_IN_ERRORS.has(code));
      }
    } catch {
      if (alive.current && isCurrent()) {
        setPassword(""); setConfirm(""); setSignInRequired(true);
        setError(CLAIM_ERRORS.claim_incomplete);
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  if (claimed) return (
    <div ref={successRef} className="card" role="status" aria-live="polite" tabIndex={-1} data-testid="card-claim-success">
      <p className="mono-cap text-pulse mb-2">Account access confirmed</p>
      <p className="body-s text-ink-2 mb-4">Your customer account is active. Access is checked again when you continue; no paid activation is needed.</p>
      <Link href={normal ? returnTo || ACCOUNT_PORTAL_ROUTES.home : researchAuthPath("/research/sign-in", returnTo || ACCOUNT_PORTAL_ROUTES.home)} className="btn btn-primary">
        {normal ? "Continue to my account" : "Sign in"}
      </Link>
    </div>
  );
  return (
    <form onSubmit={(event) => void onSubmit(event)} className="card space-y-4" data-testid="form-claim-account">
      <p className="mono-cap text-ink-mute">{normal ? "Confirm approved customer access" : "Create your sign-in"}</p>
      <p className="body-s text-ink-2">{normal ? "Use your existing normal sign-in to claim this approved account. Your password will not be changed."
        : "New to Xenios? Choose a password for your new sign-in. If you already have an account, sign in normally instead; this is not a password-reset form."}</p>
      {!normal && !signInRequired ? <>
        <div><label htmlFor="ca-password" className="form-label">New password (10 to 200 characters)</label>
          <input id="ca-password" type="password" autoComplete="new-password" className="input-field" minLength={10} maxLength={200} value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} /></div>
        <div><label htmlFor="ca-confirm" className="form-label">Confirm new password</label>
          <input id="ca-confirm" type="password" autoComplete="new-password" className="input-field" maxLength={200} value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={busy} /></div>
      </> : null}
      {error && <p className="body-s" role="alert" data-testid="text-claim-error">{error}</p>}
      {!signInRequired ? <button type="submit" className="btn btn-primary" disabled={busy} data-testid="button-claim-account">
        {busy ? "Confirming account…" : normal ? "Claim approved account" : "Create account"}
      </button> : null}
      <Link href={signInHref} className="btn btn-secondary">Sign in with an existing account</Link>
      <Link href="/research/support" className="btn btn-ghost">Contact support</Link>
    </form>
  );
}

function ClaimAccount(props: { token: string; returnTo: string | null; isCurrent: () => boolean; refreshMember: () => Promise<void>; recovery: string }) {
  const [session, setSession] = useState<ClaimSession>({ kind: "checking" });
  useEffect(() => {
    let alive = true; let generation = 0; let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        const client = await getSupabaseBrowser();
        if (!alive) return;
        if (!client) { setSession({ kind: "unavailable" }); return; }
        const subscription = client.auth.onAuthStateChange((event, value) => {
          if (!alive) return;
          generation++;
          try { markRecoveryFromAuthEvent(event, window.sessionStorage); } catch { /* token purpose remains checked */ }
          setSession(event === "PASSWORD_RECOVERY" ? { kind: "recovery" } : sessionContext(value));
        });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
        const requested = generation;
        const result = await client.auth.getSession();
        if (alive && requested === generation) setSession(result.error ? { kind: "unavailable" } : sessionContext(result.data.session));
      } catch { if (alive) setSession({ kind: "unavailable" }); }
    })();
    return () => { alive = false; generation++; unsubscribe?.(); };
  }, []);
  if (props.recovery !== "none" || session.kind === "recovery") return (
    <div className="card" role="status"><p>Complete recovery and sign in normally before using this account link.</p>
      <Link href={researchAuthPath("/research/sign-in", STATUS_PATH)} className="btn btn-secondary mt-3">Normal sign-in</Link></div>
  );
  if (session.kind === "checking") return <ResearchLoadingState label="Checking your sign-in" />;
  if (session.kind === "unavailable") return <ResearchErrorState message="Your sign-in could not be checked. Reload this account link before continuing." />;
  return <ClaimForm key={session.kind === "normal" ? session.bearer : session.kind} {...props} session={session} setSession={setSession} />;
}

function readableView(value: unknown): value is ApplicationStatusView {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.status === "string" && Object.hasOwn(STATUS_COPY, v.status) && typeof v.firstName === "string"
    && typeof v.submittedAt === "string" && Number.isFinite(Date.parse(v.submittedAt))
    && (v.memberVisibleNote === null || typeof v.memberVisibleNote === "string")
    && (v.approvalExpiresAt === null || typeof v.approvalExpiresAt === "string" && Number.isFinite(Date.parse(v.approvalExpiresAt)));
}

function StatusForToken({ token, returnTo, isCurrent, recovery, refreshMember, resumeStored }: {
  token: string; returnTo: string | null; isCurrent: () => boolean; recovery: string; refreshMember: () => Promise<void>; resumeStored: boolean;
}) {
  const [view, setView] = useState<ApplicationStatusView | null>(null);
  const [error, setError] = useState<string | null>(validToken(token) ? null : "This status link is not valid.");
  const [resendEmail, setResendEmail] = useState("");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState(false);
  const alive = useRef(false);
  const resendGeneration = useRef(0);
  useEffect(() => {
    alive.current = true;
    let current = true;
    if (validToken(token)) void fetch("/api/research/applications/status?token=" + encodeURIComponent(token), {
      credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer",
    }).then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!current || !isCurrent()) return;
      if (res.ok && body?.ok === true && readableView(body.application)) setView(body.application);
      else setError("Application status could not be verified. Use the latest link or contact support.");
    }).catch(() => { if (current && isCurrent()) setError("Status could not be loaded."); });
    return () => { current = false; alive.current = false; resendGeneration.current++; };
  }, [token]);

  async function requestNewLink(event: FormEvent) {
    event.preventDefault();
    if (resending) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resendEmail.trim()) || resendEmail.trim().length > 254) {
      setResendMessage("Enter a valid email address."); setResendError(true); return;
    }
    const generation = ++resendGeneration.current;
    setResending(true); setResendMessage(null);
    try {
      const res = await fetch("/api/research/applications/resend-link", {
        method: "POST", credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: resendEmail.trim().toLowerCase() }),
      });
      if (!alive.current || generation !== resendGeneration.current) return;
      setResendError(!res.ok);
      setResendMessage(res.ok ? "If an application exists for that address, a secure status link has been requested."
        : "The request could not be processed. Please try again.");
    } catch {
      if (alive.current && generation === resendGeneration.current) { setResendError(true); setResendMessage("The request could not be processed. Please try again."); }
    } finally { if (alive.current && generation === resendGeneration.current) setResending(false); }
  }
  const copy = view ? STATUS_COPY[view.status] : null;
  const expired = !!view?.approvalExpiresAt && Date.parse(view.approvalExpiresAt) <= Date.now();
  return <>
    <PageIntro eyebrow="Application status" title={copy?.title || (error ? "Status unavailable" : "Application status")} />
    <section className="container-x pb-20"><div className="max-w-[560px] min-w-0" style={{ overflowWrap: "anywhere" }}>
      {!error && !view ? <ResearchLoadingState label="Loading application status" /> : null}
      {error ? <div><ResearchErrorState message={error} />
        <form className="card mt-8" onSubmit={(event) => void requestNewLink(event)} noValidate>
          <p className="mono-cap text-ink-mute mb-3">Lost your link?</p>
          <label htmlFor="rs-email" className="form-label">Application email</label>
          <input id="rs-email" type="email" autoComplete="email" maxLength={254} className="input-field" value={resendEmail}
            onChange={(e) => { resendGeneration.current++; setResendEmail(e.target.value); setResendMessage(null); setResending(false); }} data-testid="input-resend-email" />
          {resendMessage ? <p role={resendError ? "alert" : "status"} className="body-s mt-3" data-testid="text-resend-message">{resendMessage}</p> : null}
          <button type="submit" className="btn btn-secondary mt-4" disabled={resending} data-testid="button-resend-link">{resending ? "Requesting…" : "Request a new link"}</button>
        </form></div> : null}
      {view && copy ? <>
        <p className="body-l text-ink-2">Hi {view.firstName}. {copy.body}</p>
        {view.memberVisibleNote ? <div className="card mt-6"><p className="mono-cap text-ink-mute mb-2">Note from Xenios</p><p className="body-s text-ink-2">{view.memberVisibleNote}</p></div> : null}
        {view.status === "approved_customer" ? <div className="mt-8">
          {!resumeStored ? <p className="body-s text-ink-mute mb-4" role="status">This tab cannot retain the account link through sign-in. After signing in normally, reopen the latest link from your email.</p> : null}
          {expired ? <p role="status">This approval has expired. Contact support before claiming the account.</p>
            : <ClaimAccount token={token} returnTo={returnTo} isCurrent={isCurrent} refreshMember={refreshMember} recovery={recovery} />}
          {view.approvalExpiresAt ? <p className="body-s text-ink-mute mt-4">Approval expires: <time dateTime={view.approvalExpiresAt}>{new Date(view.approvalExpiresAt).toISOString()}</time>.</p> : null}
        </div> : null}
        {["active", "approved_pending_payment", "approved_sponsored_b2b", "payment_pending"].includes(view.status) ? <div className="flex flex-wrap gap-3 mt-6">
          <Link href={researchAuthPath("/research/sign-in", returnTo || ACCOUNT_PORTAL_ROUTES.home)} className="btn btn-primary">Sign in to my account</Link>
          <Link href="/research/support" className="btn btn-secondary">Contact support</Link>
        </div> : null}
        {view.status === "more_information_requested" ? <Link href="/research/apply" className="btn btn-primary mt-8">Update my application</Link> : null}
      </> : null}
    </div></section>
  </>;
}

export default function ApplyStatus() {
  const search = useSearch();
  const { recovery, refreshMember } = useResearch();
  const params = new URLSearchParams(search);
  const supplied = params.has("token");
  const fromUrl = params.get("token") || "";
  const requestedReturn = safeResearchReturnTo(params.get("returnTo"));
  const [held, setHeld] = useState(() => {
    recoveryPending(); // Preserve purpose before any provider consumes its hash.
    const storage = storedToken();
    return { token: supplied ? fromUrl : storage.token, returnTo: requestedReturn, memoryOnly: !storage.available };
  });
  const storage = storedToken();
  const token = supplied ? fromUrl : held.memoryOnly ? held.token : storage.available ? storage.token : held.token;
  const returnTo = params.has("returnTo") ? requestedReturn : held.returnTo;
  const liveContext = useRef({ token, memoryOnly: held.memoryOnly });
  liveContext.current = { token, memoryOnly: held.memoryOnly };
  useEffect(() => {
    if (!supplied) return;
    let memoryOnly = false;
    try { window.sessionStorage.setItem(TOKEN_KEY, fromUrl); } catch { memoryOnly = true; }
    liveContext.current = { token: fromUrl, memoryOnly };
    setHeld({ token: fromUrl, returnTo: requestedReturn, memoryOnly });
    window.history.replaceState({}, "", STATUS_PATH + (requestedReturn ? "?returnTo=" + encodeURIComponent(requestedReturn) : ""));
  }, [supplied, fromUrl, requestedReturn]);
  function isCurrent() {
    if (liveContext.current.token !== token) return false;
    if (liveContext.current.memoryOnly) return true;
    const current = storedToken();
    if (!current.available || current.token === token) return true;
    setHeld((previous) => ({ ...previous })); // Re-render with the new tab credential; never reuse the previous view.
    return false;
  }
  return <>
    <SeoHead title="Application status, Xenios Research" description="Check the status of your Xenios customer application." path={STATUS_PATH} />
    <StatusForToken key={token + ":" + (returnTo || "")} token={token} returnTo={returnTo} isCurrent={isCurrent} recovery={recovery} refreshMember={refreshMember}
      resumeStored={!held.memoryOnly && storage.available && storage.token === token} />
  </>;
}

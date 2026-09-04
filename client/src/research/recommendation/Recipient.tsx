import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { safeReferralDestination, type RecommendationContext } from "@shared/research/referral-v1";
import { safeResearchReturnTo } from "@shared/research/auth-return-to";
import SeoHead from "@/components/SeoHead";
import { bootstrapRecommendation, captureRecommendation, resolveRecommendation } from "./api";

const touch = { minHeight: 44 };
const safeDestination = (value: unknown) => {
  const path = safeReferralDestination(value);
  return path && safeResearchReturnTo(path) === path ? path : null;
};

function RecipientFlow({ code, memberToken }: { code: string; memberToken?: string | null }) {
  const [, navigate] = useLocation();
  const [context, setContext] = useState<RecommendationContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [target, setTarget] = useState("");
  const alive = useRef(true);
  const generation = useRef(0);
  const submitting = useRef(false);

  const resolve = async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    setContext(null);
    if (!/^r1_[A-Za-z0-9_-]{43}$/.test(code)) {
      setLoading(false);
      setError("This recommendation link is not valid. You can still explore Xenios directly.");
      return;
    }
    const result = await resolveRecommendation(code);
    if (!alive.current || current !== generation.current) return;
    setLoading(false);
    if (result.kind === "error") {
      setError(result.status === 400 || result.status === 404 || result.status === 410
        ? "This recommendation link is invalid, expired, or no longer active. You can still explore Xenios directly."
        : "We cannot check this recommendation right now. Try again, or explore Xenios directly without a referral.");
      return;
    }
    const destination = safeDestination(result.data.destinationPath);
    if (!destination || result.data.valid !== true || result.data.sharedBy !== "an approved Xenios partner") {
      setError("This recommendation could not be verified safely. You can still explore Xenios directly.");
      return;
    }
    setContext(result.data);
    setTarget(destination === "/health" ? "" : destination);
  };

  useEffect(() => {
    alive.current = true;
    void resolve();
    return () => { alive.current = false; generation.current++; };
  }, [code]);

  const continueWithReferral = async () => {
    const destination = safeDestination(target);
    if (!context || !destination || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setCaptureError("");
    const bootstrap = await bootstrapRecommendation();
    if (!alive.current) return;
    if (bootstrap.kind === "error" || typeof bootstrap.data.csrfToken !== "string"
      || !bootstrap.data.csrfToken || bootstrap.data.csrfToken.length > 2048 || /[\r\n]/.test(bootstrap.data.csrfToken)) {
      submitting.current = false;
      setBusy(false);
      setCaptureError("Your referral was not confirmed. Please allow site cookies and try again, or continue without a referral.");
      return;
    }
    const result = await captureRecommendation(code, bootstrap.data.csrfToken, memberToken);
    if (!alive.current) return;
    submitting.current = false;
    setBusy(false);
    if (result.kind === "error" || !safeDestination(result.data.destinationPath)) {
      setCaptureError("Your referral was not confirmed. You can retry, or continue browsing without a confirmed referral.");
      return;
    }
    if (result.data.attribution !== "recognized") {
      setCaptureError(result.data.attribution === "self_referral"
        ? "This is your own recommendation link, so it was not recognized as a referral. You can continue browsing."
        : result.data.attribution === "retained_ineligible"
          ? "An earlier referral was retained but is not currently eligible. This link did not replace it. You can continue browsing."
          : "Referral recognition is unavailable. You can continue browsing without a confirmed referral.");
      return;
    }
    // The first valid attribution is server-owned. It must not replace the destination
    // of this invitation or the recipient's explicit Health pathway choice.
    navigate(destination);
  };

  return <main className="container-shell py-12" style={{ maxWidth: 820, minWidth: 0, margin: "0 auto", paddingInline: 20 }}>
    <SeoHead title="A Xenios recommendation" description="Choose how to explore Xenios Care or nonclinical Research." path="/health" robots="noindex, nofollow" />
    <p className="mono-label text-ink-mute">A Xenios recommendation</p>
    <h1 className="display-m mt-3">An introduction, at your pace.</h1>
    <p className="body-m text-ink-2 mt-4">Explore what is right for you. A recommendation is an introduction—not a medical recommendation or a promise of eligibility.</p>
    {loading && <p role="status" className="mt-6">Checking your recommendation…</p>}
    {error && <section className="card mt-6"><p role="alert">{error}</p><div className="flex flex-wrap gap-3 mt-4"><button type="button" className="btn btn-secondary" style={touch} onClick={() => void resolve()}>Try again</button><Link href="/health" className="btn btn-primary" style={touch}>Explore Xenios Health</Link></div></section>}
    {context && <>
      <section className="card mt-6" aria-labelledby="recommendation-context-title">
        <p className="mono-label text-ink-mute">Shared by an approved Xenios partner</p>
        <h2 id="recommendation-context-title" className="body-l mt-3">{context.destinationPath.startsWith("/care") ? "Explore the Care pathway" : context.destinationPath.startsWith("/research") ? "Explore nonclinical Research" : "Choose where to begin"}</h2>
        <p className="body-s text-ink-2 mt-3">Care and Research are distinct pathways. Care access is subject to intake, location, eligibility, and appropriate clinical review. Research materials are for nonclinical research only—not for human use.</p>
        {context.destinationPath === "/health" && <fieldset className="grid gap-3 mt-5" disabled={busy}>
          <legend className="body-m mb-3">What would you like to explore?</legend>
          <label className="card flex items-start gap-3" style={{ ...touch, cursor: "pointer" }}><input type="radio" name="recommendation-pathway" value="/care" checked={target === "/care"} onChange={() => setTarget("/care")} className="mt-1" /><span><span className="body-m block">Care</span><span className="body-s text-ink-2">Learn about the care pathway and its intake process.</span></span></label>
          <label className="card flex items-start gap-3" style={{ ...touch, cursor: "pointer" }}><input type="radio" name="recommendation-pathway" value="/research" checked={target === "/research"} onChange={() => setTarget("/research")} className="mt-1" /><span><span className="body-m block">Research</span><span className="body-s text-ink-2">Explore nonclinical access, education, and membership.</span></span></label>
        </fieldset>}
        <p className="body-s text-ink-mute mt-5">Continuing with this recommendation uses a site cookie to recognize the referral. If you sign in or create an eligible account, Xenios may connect it to that account. An earlier valid referral is not overwritten.</p>
        <p className="body-s text-ink-mute mt-2">The partner receives limited referral status—not your private account or health details. Continuing does not create an account, enroll you as an affiliate, or place an order.</p>
        {captureError && <p role="alert" className="body-s mt-4">{captureError}</p>}
        <div className="flex flex-wrap gap-3 mt-5"><button type="button" className="btn btn-primary" style={touch} disabled={busy || !safeDestination(target)} onClick={() => void continueWithReferral()}>{busy ? "Recognizing your referral…" : captureError ? "Retry referral and continue" : "Continue with recommendation"}</button><button type="button" className="btn btn-ghost" style={touch} disabled={busy || !safeDestination(target)} onClick={() => { const path = safeDestination(target); if (path) navigate(path); }}>Continue without confirming referral</button></div>
        {context.destinationPath === "/health" && !target && <p className="body-s text-ink-mute mt-3">Choose Care or Research to continue.</p>}
      </section>
      <p className="body-s text-ink-mute mt-6">You remain in control. No payment, clinical outcome, or partner compensation is implied by this introduction.</p>
    </>}
    <nav className="flex flex-wrap gap-3 mt-6" aria-label="Recommendation support"><Link href="/research/support" className="btn btn-ghost" style={touch}>Research support</Link><Link href="/care/support" className="btn btn-ghost" style={touch}>Care support</Link></nav>
  </main>;
}

/** No provider is required: the public route can pass an existing canonical member token. */
export default function Recipient({ code, memberToken }: { code: string; memberToken?: string | null }) {
  return <RecipientFlow key={`${code}:${memberToken ?? "anonymous"}`} code={code} memberToken={memberToken} />;
}

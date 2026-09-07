import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchDenialNotice, ResearchEmptyState, ResearchLoadingState, ResearchRouteBoundary, ResearchSecureNotice, ResearchStatusBadge } from "../../ui/kit";
import { getPartnerCompliance, submitComplianceContent } from "../../adapters/partner";
import { ACCOUNT_PORTAL_ROUTES, ACCESS_ROUTES } from "../../lib/routes";
import { CONTENT_REVIEW_LABELS, prepareComplianceDraft, readComplianceReview, type ContentReviewRecord } from "../../partner-crm/compliance-review";
import { usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner compliance (/research/partners/compliance). The rules of the
// program, stated plainly: what may be said, what may never be said, and how
// to get your own content cleared before use. The submission list is a
// partner data surface; the submission form is unavailable-tolerant.
// ---------------------------------------------------------------------------

const APPROVED_RULES = [
  "Describe the program factually: approved customer access is education-first and does not require a paid membership prerequisite.",
  "Do not present retired membership prices as current. Historical billing and plan records may remain visible in legacy reporting; product purchases, when available, are separate.",
  "Use materials from the approved library word for word, or submit your own version for review first.",
  "Disclose the rep relationship in every share, visibly, in the share itself.",
  "Speak from your own experience as an educator or community builder, without outcome promises of any kind.",
];

const PROHIBITED_RULES = [
  {
    title: "No medical claims",
    body: "Never state or imply that anything offered diagnoses, treats, cures, mitigates, or prevents any disease or condition. No before-and-after health outcome framing, no dosage or protocol advice, no repurposing of research literature as a promise.",
  },
  {
    title: "No income claims",
    body: "Never present the program as an income opportunity. No earnings figures, no lifestyle framing, no 'replace your job' language, no hypothetical math. Reps earn commissions on their own referrals and that is the entire story.",
  },
  {
    title: "No downline recruitment",
    body: "Never recruit others to become reps for compensation. There is no downline, no tier, and no override in this program, and presenting one is grounds for immediate removal.",
  },
];

const UNAVAILABLE_MESSAGE =
  "Content submission intake is unavailable. This page cannot confirm whether the request was recorded. Your draft is kept; check history or contact the team before resubmitting.";

export default function Compliance() {
  const { memberToken, memberChecking } = useResearch();

  return (
    <ResearchPartnerShell
      title="Compliance"
      lead="The rules are short and hard. Everything shareable follows them; anything that does not is out of the program."
    >
      <section aria-labelledby="pcp-approved">
        <h2 id="pcp-approved" className="mono-cap text-ink-mute">
          What you may say
        </h2>
        <div className="card mt-4" style={{ maxWidth: 720 }}>
          <ul className="body-s text-ink-2 grid gap-2" style={{ paddingLeft: 18, margin: 0 }}>
            {APPROVED_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="pcp-prohibited" className="mt-10">
        <h2 id="pcp-prohibited" className="mono-cap text-ink-mute">
          The three hard lines
        </h2>
        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {PROHIBITED_RULES.map((rule) => (
            <div key={rule.title} className="card">
              <p className="body-m font-700">{rule.title}</p>
              <p className="body-s text-ink-2 mt-2">{rule.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="my-6"><Link href={ACCOUNT_PORTAL_ROUTES.home} className="btn btn-secondary">My account</Link></div>
      {memberChecking ? <ResearchLoadingState label="Checking your account" />
        : memberToken ? <ComplianceWorkspace key={memberToken} token={memberToken} /> : <SignInNotice />}
    </ResearchPartnerShell>
  );
}

function SignInNotice() {
  return <ResearchEmptyState title="Sign in to view content reviews"
    body="Use your Xenios account. Partner reporting and submission access are verified separately by the server."
    action={<Link href={ACCESS_ROUTES.signIn} className="btn btn-primary">Sign in</Link>} />;
}

function ComplianceWorkspace({ token }: { token: string }) {
  const { state, denied, data, reload } = usePartnerResource<unknown>(getPartnerCompliance, token);
  const rows = state === "ok" ? readComplianceReview(data) : null;
  const readable = rows !== null;
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"idle" | "submitting" | "responded" | "uncertain" | "unavailable">("idle");
  const lifecycle = useRef({ active: false, generation: 0, locked: false, submitting: false });
  const readableRef = useRef(readable);
  readableRef.current = readable;
  useLayoutEffect(() => {
    lifecycle.current.active = true;
    return () => { lifecycle.current.active = false; lifecycle.current.generation++; };
  }, []);
  const refresh = () => {
    if (!lifecycle.current.active || lifecycle.current.submitting) return;
    // Revoke retained form callbacks synchronously, before the loading render.
    readableRef.current = false;
    void reload();
  };
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const current = lifecycle.current;
    if (!current.active || !readableRef.current || current.locked) return;
    const prepared = prepareComplianceDraft({ title, link, description });
    if ("error" in prepared) { setValidation(prepared.error); return; }
    setValidation(null);
    current.locked = true;
    current.submitting = true;
    const generation = ++current.generation;
    setOutcome("submitting");
    try {
      const result = await submitComplianceContent(prepared.body, token, UNAVAILABLE_MESSAGE);
      if (!current.active || current.generation !== generation) return;
      if (result.kind === "accepted") {
        // The legacy adapter exposes no receipt ID. Do not claim persistence,
        // approval, notification delivery, or synthesize a new history row.
        setOutcome("responded");
        current.submitting = false;
        refresh();
      } else {
        setOutcome(result.kind === "unavailable" ? "unavailable" : "uncertain");
      }
    } catch {
      if (current.active && current.generation === generation) setOutcome("uncertain");
    } finally {
      if (current.active && current.generation === generation) current.submitting = false;
    }
  };
  const startAnother = () => {
    if (!lifecycle.current.active || !readableRef.current || outcome !== "responded" || lifecycle.current.submitting) return;
    setTitle(""); setLink(""); setDescription(""); setValidation(null);
    lifecycle.current.locked = false; setOutcome("idle");
  };
  if (state === "unauthorized") return <SignInNotice />;
  if (denied) return <><ResearchDenialNotice code={denied.code} />
    <p className="body-s mt-4">Partner review access is separate from customer approval. No role or approval was changed.</p></>;
  return <>
      <ResearchSecureNotice>
        Reported review status is not permission to publish or use content. This history does not include current expiry,
        approved wording, or required disclosures. Confirm the exact approved version before use. No account permissions are granted here.
      </ResearchSecureNotice>
      <div className="flex justify-end my-4"><button type="button" className="btn btn-secondary"
        disabled={outcome === "submitting"} onClick={refresh}>Refresh review history</button></div>
      {outcome === "responded" && <p className="body-s my-4" role="status">
        Submission response received. The endpoint returned success, but this page has no receipt ID. Check the recorded history;
        this is not content approval or confirmation of any email. Your draft is kept until you start another.
      </p>}
      {(outcome === "uncertain" || outcome === "unavailable") && <div className="my-4" role="alert">
        <p className="body-s">{outcome === "unavailable" ? UNAVAILABLE_MESSAGE
          : "The submission could not be confirmed. Your draft is kept. Check history or contact the team before resubmitting."}</p>
        <p className="body-s mt-2">Resubmission is blocked in this view to avoid duplicates. Do not reload or leave to retry; this safeguard is not stored after leaving.</p>
        <a className="btn btn-secondary mt-3" href="mailto:team@xeniostechnology.com?subject=Content%20review%20request">Contact the review team</a>
      </div>}
      <section aria-labelledby="pcp-submissions" className="mt-10">
        <h2 id="pcp-submissions" className="mono-cap text-ink-mute">
          Your content submissions
        </h2>
        <div className="mt-4">
          <ResearchRouteBoundary
            state={state === "ok" && !readable ? "error" : state}
            errorMessage="Content review records could not be read safely. Please try again."
            onRetry={refresh}
            unavailableTitle="Content review history is unavailable right now"
            unavailableBody="The source could not be loaded. This does not establish an empty history or any content approval."
          >
            <ResearchDataTable<ContentReviewRecord>
              caption="Recorded content submissions and reported review states"
              columns={[
                { key: "title", header: "Content", render: (s) => s.title },
                { key: "submittedAt", header: "Recorded date", render: (s) => s.submittedAt ?? "Date not reported" },
                {
                  key: "status",
                  header: "Reported status",
                  render: (s) => (
                    <ResearchStatusBadge
                      label={`${CONTENT_REVIEW_LABELS[s.status]} (reported)`}
                      tone="neutral"
                    />
                  ),
                },
              ]}
              rows={rows ?? []}
              rowKey={(s) => s.id}
              empty="No content review rows were returned for this account. This does not confirm complete history or approval to use content."
            />
          </ResearchRouteBoundary>
        </div>
      </section>

      {readable && <section aria-labelledby="pcp-form" className="mt-10">
        <h2 id="pcp-form" className="mono-cap text-ink-mute">
          Submit content for review
        </h2>
        <form onSubmit={onSubmit} noValidate className="card mt-4" style={{ maxWidth: 680 }}>
          <p className="body-s mb-4">Sending a draft requests review only. Do not include passwords, sign-in codes, customer health information, or bank details.</p>
          <fieldset disabled={outcome !== "idle"} style={{ border: 0, margin: 0, padding: 0 }}>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div>
              <label htmlFor="pcp-title" className="form-label">
                Content title
              </label>
              <input id="pcp-title" className="input-field" type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="pcp-link" className="form-label">
                Link to a draft (optional)
              </label>
              <input id="pcp-link" className="input-field" type="url" maxLength={500} value={link} onChange={(e) => setLink(e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="pcp-description" className="form-label">
              Description
            </label>
            <p className="body-s text-ink-mute mb-2">What it is, where it will appear, and the exact wording if it is short.</p>
            <textarea
              id="pcp-description"
              className="input-field"
              rows={4}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          </fieldset>

          {validation && (
            <p className="body-s mt-4" role="alert">
              {validation}
            </p>
          )}
          <div className="mt-6">
            <button type="submit" className="btn btn-primary" disabled={outcome !== "idle"}>
              {outcome === "submitting" ? "Submitting..." : "Submit for review"}
            </button>
            {outcome === "responded" && <button type="button" className="btn btn-secondary ml-3" onClick={startAnother}>Start another draft</button>}
          </div>
        </form>
      </section>}
    </>;
}

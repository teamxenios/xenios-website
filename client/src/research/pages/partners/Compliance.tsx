import { useState, type FormEvent } from "react";
import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchRouteBoundary, ResearchStatusBadge } from "../../ui/kit";
import {
  PARTNER_PENDING_TITLE,
  PARTNER_SUPPORT_EMAIL,
  submitPartnerRequest,
  usePartnerResource,
  type SubmitOutcome,
} from "./shared";

// ---------------------------------------------------------------------------
// Partner compliance (/research/partners/compliance). The rules of the
// program, stated plainly: what may be said, what may never be said, and how
// to get your own content cleared before use. The submission list is a
// partner data surface; the submission form is unavailable-tolerant.
// ---------------------------------------------------------------------------

interface ContentSubmission {
  id: string;
  title: string;
  submittedAt?: string | null;
  status?: string | null;
}

type CompliancePayload = { submissions?: ContentSubmission[] };

const APPROVED_RULES = [
  "Describe the program factually: an application-gated, education-first research membership.",
  "State pricing exactly as it is: $50 one time to activate, then $25 monthly, no annual plans.",
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
  "Content submissions are not being accepted through this form yet, so nothing was submitted. Email the content (or a link to it) to the team for review instead.";

export default function Compliance() {
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<CompliancePayload>(
    "/api/research/partner/compliance",
    memberToken,
  );

  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SubmitOutcome>({ kind: "idle" });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (outcome.kind === "submitting") return;
    if (!title.trim() || !description.trim()) {
      setValidation("Please add a title and a description of the content.");
      return;
    }
    setValidation(null);
    setOutcome({ kind: "submitting" });
    const result = await submitPartnerRequest(
      "/api/research/partner/compliance/submissions",
      { title: title.trim(), link: link.trim() || null, description: description.trim() },
      memberToken,
      UNAVAILABLE_MESSAGE,
    );
    setOutcome(result);
    if (result.kind === "accepted") {
      setTitle("");
      setLink("");
      setDescription("");
      void reload();
    }
  };

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

      <section aria-labelledby="pcp-submissions" className="mt-10">
        <h2 id="pcp-submissions" className="mono-cap text-ink-mute">
          Your content submissions
        </h2>
        <div className="mt-4">
          <ResearchRouteBoundary
            state={state}
            errorMessage={errorMessage}
            onRetry={() => void reload()}
            unavailableTitle={PARTNER_PENDING_TITLE}
            unavailableBody="Your submission history appears here when the partner platform launches. Content you email for review in the meantime is carried over."
          >
            <ResearchDataTable<ContentSubmission>
              caption="Content you submitted for compliance review"
              columns={[
                { key: "title", header: "Content", render: (s) => s.title },
                { key: "submittedAt", header: "Submitted", render: (s) => s.submittedAt ?? "Recently" },
                {
                  key: "status",
                  header: "Status",
                  render: (s) => (
                    <ResearchStatusBadge
                      label={s.status ?? "In review"}
                      tone={s.status === "approved" ? "success" : s.status === "declined" ? "danger" : "pending"}
                    />
                  ),
                },
              ]}
              rows={data?.submissions ?? []}
              rowKey={(s) => s.id}
              empty="No submissions yet. Submit content below before using anything outside the approved library."
            />
          </ResearchRouteBoundary>
        </div>
      </section>

      <section aria-labelledby="pcp-form" className="mt-10">
        <h2 id="pcp-form" className="mono-cap text-ink-mute">
          Submit content for review
        </h2>
        <form onSubmit={onSubmit} noValidate className="card mt-4" style={{ maxWidth: 680 }}>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div>
              <label htmlFor="pcp-title" className="form-label">
                Content title
              </label>
              <input id="pcp-title" className="input-field" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="pcp-link" className="form-label">
                Link to a draft (optional)
              </label>
              <input id="pcp-link" className="input-field" type="url" value={link} onChange={(e) => setLink(e.target.value)} />
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {validation && (
            <p className="body-s mt-4" role="alert">
              {validation}
            </p>
          )}
          {outcome.kind === "accepted" && (
            <p className="body-s mt-4" role="status" aria-live="polite">
              {outcome.message}
            </p>
          )}
          {outcome.kind === "unavailable" && (
            <div className="mt-4" role="status" aria-live="polite">
              <p className="body-s text-ink-2">{outcome.message}</p>
              <a
                className="btn btn-secondary mt-3"
                href={`mailto:${PARTNER_SUPPORT_EMAIL}?subject=Content%20review%20request`}
              >
                Email the content
              </a>
            </div>
          )}
          {outcome.kind === "error" && (
            <p className="body-s mt-4" role="alert">
              {outcome.message}
            </p>
          )}

          <div className="mt-6">
            <button type="submit" className="btn btn-primary" disabled={outcome.kind === "submitting"}>
              {outcome.kind === "submitting" ? "Submitting..." : "Submit for review"}
            </button>
          </div>
        </form>
      </section>
    </ResearchPartnerShell>
  );
}

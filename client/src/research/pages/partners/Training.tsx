import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchEmptyState, ResearchRouteBoundary, ResearchStatusBadge } from "../../ui/kit";
import { PARTNER_PENDING_TITLE, usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner training and certification (/research/partners/training). The
// module list and completion states come only from the partner API; until it
// is published the page shows the curriculum outline (program description,
// not account data) and an honest pending state for completion.
// ---------------------------------------------------------------------------

interface TrainingModule {
  id: string;
  title: string;
  summary?: string | null;
  required?: boolean | null;
  completed?: boolean | null;
  completedAt?: string | null;
}

type TrainingPayload = { modules?: TrainingModule[]; certified?: boolean | null };

const CURRICULUM = [
  {
    title: "The program, honestly",
    body: "What Xenios Research is, what membership costs ($50 one-time activation, then $25 monthly), and what a rep's role is and is not.",
  },
  {
    title: "Compliance rules",
    body: "The three hard lines: no medical claims, no income claims, no recruitment. Plus disclosure requirements on every share.",
  },
  {
    title: "Approved content",
    body: "How the approved library works, what may be edited, and how to submit your own content for review before use.",
  },
  {
    title: "Certification check",
    body: "A short check on the rules above. Passing it is required before your link is issued.",
  },
];

export default function Training() {
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<TrainingPayload>(
    "/api/research/partner/training",
    memberToken,
  );

  const modules = data?.modules ?? [];

  return (
    <ResearchPartnerShell
      title="Training and certification"
      lead="Certification comes before sharing. These modules cover the program, the compliance rules, and the approved content library."
    >
      <section aria-labelledby="pt-curriculum">
        <h2 id="pt-curriculum" className="mono-cap text-ink-mute">
          What the curriculum covers
        </h2>
        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {CURRICULUM.map((c) => (
            <div key={c.title} className="card">
              <p className="body-m font-700">{c.title}</p>
              <p className="body-s text-ink-2 mt-2">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="pt-modules" className="mt-10">
        <h2 id="pt-modules" className="mono-cap text-ink-mute">
          Your modules
        </h2>
        <div className="mt-4">
          <ResearchRouteBoundary
            state={state}
            errorMessage={errorMessage}
            onRetry={() => void reload()}
            unavailableTitle={PARTNER_PENDING_TITLE}
            unavailableBody="Your module list and completion states appear here when partner training opens. The curriculum outline above is what it will cover."
          >
            {data?.certified != null && (
              <div className="mb-4 flex items-center gap-3" role="status">
                <ResearchStatusBadge
                  label={data.certified ? "Certified" : "Not yet certified"}
                  tone={data.certified ? "success" : "pending"}
                />
                <p className="body-s text-ink-2">
                  {data.certified
                    ? "You have passed the certification check."
                    : "Complete the required modules to unlock the certification check."}
                </p>
              </div>
            )}
            {modules.length === 0 ? (
              <ResearchEmptyState
                title="No modules published yet."
                body="Modules appear here as the team publishes them. Your completion state is recorded per module."
              />
            ) : (
              <div className="grid gap-4">
                {modules.map((m) => (
                  <div key={m.id} className="card flex flex-wrap items-start justify-between gap-4">
                    <div style={{ minWidth: 0 }}>
                      <p className="body-m font-700">{m.title}</p>
                      {m.summary && <p className="body-s text-ink-2 mt-1">{m.summary}</p>}
                      {m.required && <p className="mono-label text-ink-mute mt-2">Required for certification</p>}
                    </div>
                    <ResearchStatusBadge
                      label={m.completed ? (m.completedAt ? `Completed ${m.completedAt}` : "Completed") : "Not started"}
                      tone={m.completed ? "success" : "pending"}
                    />
                  </div>
                ))}
              </div>
            )}
          </ResearchRouteBoundary>
        </div>
      </section>
    </ResearchPartnerShell>
  );
}

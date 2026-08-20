import type { PartnerState } from "@shared/research/distribution";
import { ResearchStatusBadge, type BadgeTone } from "../../ui/kit";
import type { PartnerSelfDto } from "../../adapters/partner";

// ---------------------------------------------------------------------------
// The partner lifecycle, rendered from the LIVE self record (GET
// /api/research/partner/me). The step order mirrors the server's real gate
// chain (server/research/partners/partners.ts, nextPendingState): application
// review, identity, tax and payout clearance, agreement, training and
// certification, then admin activation. Presentation only: every position,
// date, and acceptance shown here is a fact the server stated; nothing is
// advanced, predicted, or invented client-side. quality_review, suspended,
// and terminated are not steps on the path and render as their own notice.
// ---------------------------------------------------------------------------

interface LifecycleStep {
  key: string;
  title: string;
  body: string;
  /** The PartnerState values that mean "this step is the one in progress". */
  states: readonly PartnerState[];
}

export const LIFECYCLE_STEPS: readonly LifecycleStep[] = [
  {
    key: "application",
    title: "Application review",
    body: "A person reviews your application. No action is needed from you.",
    states: ["application"],
  },
  {
    key: "identity",
    title: "Identity verification",
    body: "We confirm who you are. One account per person, under a real name.",
    states: ["identity_verification_pending"],
  },
  {
    key: "clearance",
    title: "Tax and payout clearance",
    body: "Tax status and payout details are cleared before anything can be earned.",
    states: ["tax_status_pending", "payout_status_pending"],
  },
  {
    key: "agreement",
    title: "Partner agreement",
    body: "The full agreement is presented for review and acceptance.",
    states: ["agreement_pending"],
  },
  {
    key: "certification",
    title: "Training and certification",
    body: "Compliance training, then the certification check. Your link exists only after this.",
    states: ["training_pending", "certification_pending"],
  },
  {
    key: "active",
    title: "Active",
    body: "Activated by the team. Your link and code are issued and tracking begins.",
    states: ["active"],
  },
] as const;

/** States that are not positions on the path and render as a notice instead. */
const EXCEPTION_NOTICES: Partial<Record<PartnerState, { label: string; tone: BadgeTone; body: string }>> = {
  quality_review: {
    label: "Quality review",
    tone: "warning",
    body:
      "Your account is under quality review. Your history is kept, and the team will contact you with the outcome. No payout moves while a review is open.",
  },
  suspended: {
    label: "Suspended",
    tone: "danger",
    body:
      "Your account is suspended. Accrued ledger history is kept, but nothing can be earned or paid while suspended. The team will contact you about resolution.",
  },
  terminated: {
    label: "Terminated",
    tone: "danger",
    body: "This partner account is terminated. Termination is final.",
  },
};

type StepStatus = "done" | "current" | "upcoming";

/**
 * Where each step stands for a given state. Exported so a test can pin the
 * mapping against the server's state machine without rendering.
 */
export function lifecycleStatuses(state: PartnerState): StepStatus[] | null {
  const index = LIFECYCLE_STEPS.findIndex((step) => step.states.includes(state));
  if (index === -1) return null; // an exception state, not a path position
  return LIFECYCLE_STEPS.map((_, i) => (i < index ? "done" : i === index ? "current" : "upcoming"));
}

function badgeFor(step: LifecycleStep, status: StepStatus, partner: PartnerSelfDto) {
  if (step.key === "active" && status === "current") {
    return <ResearchStatusBadge label="Active" tone="success" />;
  }
  if (status === "done") return <ResearchStatusBadge label="Done" tone="success" />;
  if (status === "current") {
    // The one nuance the server exposes: a certified partner waits in
    // certification_pending until the team activates. Say that, truthfully.
    if (step.key === "certification" && partner.certified) {
      return <ResearchStatusBadge label="Certified — awaiting activation" tone="info" />;
    }
    return <ResearchStatusBadge label="In progress" tone="pending" />;
  }
  return <ResearchStatusBadge label="Up next" tone="neutral" />;
}

export function PartnerLifecycle({ partner }: { partner: PartnerSelfDto }) {
  const exception = EXCEPTION_NOTICES[partner.state];
  if (exception) {
    return (
      <div className="card" data-testid="plc-exception" role="status">
        <div className="flex items-center gap-3 flex-wrap">
          <ResearchStatusBadge label={exception.label} tone={exception.tone} />
        </div>
        <p className="body-s text-ink-2 mt-2">{exception.body}</p>
      </div>
    );
  }

  const statuses = lifecycleStatuses(partner.state);
  if (!statuses) {
    // A state this build does not know. Show it verbatim rather than guessing
    // a position for it.
    return (
      <div className="card" data-testid="plc-unknown" role="status">
        <ResearchStatusBadge label={partner.state.replace(/_/g, " ")} tone="neutral" />
        <p className="body-s text-ink-2 mt-2">The team can tell you exactly where this stands.</p>
      </div>
    );
  }

  return (
    <div data-testid="plc-steps">
      <ol className="grid gap-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {LIFECYCLE_STEPS.map((step, i) => {
          const status = statuses[i];
          return (
            <li
              key={step.key}
              className="card flex items-start justify-between gap-4"
              style={{ flexWrap: "wrap" }}
              aria-current={status === "current" ? "step" : undefined}
            >
              <span style={{ maxWidth: "48ch" }}>
                <span className="body-m font-700 block">
                  <span className="mono-label text-ink-mute" aria-hidden="true">
                    {i + 1}{" "}
                  </span>
                  {step.title}
                </span>
                {status === "current" && <span className="body-s text-ink-2 block mt-1">{step.body}</span>}
              </span>
              {badgeFor(step, status, partner)}
            </li>
          );
        })}
      </ol>

      {(partner.agreements.length > 0 || partner.training.length > 0) && (
        <div className="card mt-4" data-testid="plc-record">
          {partner.agreements.length > 0 && (
            <>
              <p className="mono-label text-ink-mute">Agreements accepted</p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="mt-2 grid gap-1">
                {partner.agreements.map((a) => (
                  <li key={`${a.agreementKey}-${a.agreementVersion}`} className="body-s text-ink-2">
                    {a.agreementKey.replace(/[-_]/g, " ")} (v{a.agreementVersion}) — {a.decidedAt.slice(0, 10)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {partner.training.length > 0 && (
            <>
              <p className={`mono-label text-ink-mute${partner.agreements.length > 0 ? " mt-4" : ""}`}>
                Training completed
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="mt-2 grid gap-1">
                {partner.training.map((t) => (
                  <li key={`${t.moduleKey}-${t.moduleVersion}`} className="body-s text-ink-2">
                    {t.moduleKey.replace(/[-_]/g, " ")} (v{t.moduleVersion}) — {t.completedAt.slice(0, 10)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

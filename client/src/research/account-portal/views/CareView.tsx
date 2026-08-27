import type { CareEnrollmentDto, CareTimelineStage } from "@shared/research/customer-account/contract";
import { CARE_TIMELINE_STAGES } from "@shared/research/customer-account/contract";
import { ResearchStatusBadge } from "../../ui/kit";
import { formatAccountDate, sentenceCase } from "../format";

const STAGE_LABELS: Readonly<Record<CareTimelineStage, string>> = {
  account_created: "Account created",
  intake_needed: "Intake needed",
  intake_submitted: "Intake submitted",
  provider_review: "Provider review",
  follow_up_required: "Follow-up required",
  appointment_needed: "Appointment needed",
  provider_decision_complete: "Provider decision recorded",
  pharmacy_processing: "Pharmacy processing",
  shipped: "Shipment",
  completed: "Completed",
};

// This view consumes the canonical wire shape of GET /care — CareEnrollmentDto,
// with the stage NESTED under `status` — so the loader, this prop, and the
// server response are one type. Three truthful states, none inferred:
// not enrolled; enrolled with no recorded stage (unavailable); enrolled staged.
export function AccountCareView({ data }: { data: CareEnrollmentDto }) {
  if (!data.enrolled) {
    return (
      <section className="account-surface" aria-labelledby="care-not-started-heading">
        <p className="account-section-label">Care status</p>
        <h2 id="care-not-started-heading" className="account-section-title">Care not started.</h2>
        <p className="body-s text-ink-2 mt-3">Membership and Research access can exist without a Care relationship.</p>
      </section>
    );
  }

  const stage = data.status.stage;
  if (!stage) {
    return (
      <section className="account-surface" aria-labelledby="care-unavailable-heading">
        <p className="account-section-label">Care status</p>
        <h2 id="care-unavailable-heading" className="account-section-title">Care status unavailable.</h2>
        <p className="body-s text-ink-2 mt-3">Your Care enrollment is recorded, but no operational stage is available right now.</p>
      </section>
    );
  }

  const currentIndex = CARE_TIMELINE_STAGES.indexOf(stage);
  return (
    <div className="account-grid account-grid-main">
      <section className="account-surface" aria-labelledby="care-current-heading">
        <p className="account-section-label">Current Care stage</p>
        <h2 id="care-current-heading" className="account-section-title">{STAGE_LABELS[stage]}</h2>
        <p className="body-m text-ink-2 mt-4 max-w-[60ch]">{data.status.neutralSummary ?? "Your current operational status is recorded in the Care workflow."}</p>
        <p className="mono-label text-ink-mute mt-4">Updated {formatAccountDate(data.status.updatedAt, true)}</p>
        <div className="account-surface account-surface-warm mt-6">
          <p className="body-s font-700">Care stages are operational checkpoints.</p>
          <p className="body-s text-ink-2 mt-2">Later steps are not guaranteed. A provider decision is separate from pharmacy processing, and membership does not determine either outcome.</p>
        </div>
      </section>

      <section className="account-surface" aria-labelledby="care-timeline-heading">
        <p className="account-section-label">Care operations</p>
        <h2 id="care-timeline-heading" className="account-section-title">Status timeline</h2>
        <ol className="care-status-timeline mt-6">
          {CARE_TIMELINE_STAGES.map((stage, index) => {
            const state = index < currentIndex ? "Recorded" : index === currentIndex ? "Current" : "Not started";
            return (
              <li key={stage} className={`care-status-step care-status-step-${state.toLowerCase().replace(" ", "-")}`} aria-current={index === currentIndex ? "step" : undefined}>
                <span className="care-status-index tabular" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0"><h3 className="body-m font-700">{STAGE_LABELS[stage]}</h3><p className="body-s text-ink-mute mt-1">{state}</p></div>
                <ResearchStatusBadge label={state} tone={index < currentIndex ? "success" : index === currentIndex ? "info" : "neutral"} />
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}


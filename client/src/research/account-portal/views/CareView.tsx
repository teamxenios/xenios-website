import { Link } from "wouter";
import type { CareEnrollmentDto, CareTimelineStage } from "@shared/research/customer-account/contract";
import { ACCOUNT_PORTAL_ROUTES } from "../../lib/routes";
import { formatAccountDate } from "../format";

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

// This view consumes the canonical wire shape of GET /care — the DISCRIMINATED
// CareEnrollmentDto, with the stage NESTED under `status` — so the loader,
// this prop, and the server response are one type. Four truthful states, none
// inferred, and none collapsed into another (P1-D): source unavailable (no
// enrollment claim at all); connected but not enrolled; enrolled with no
// recorded stage; enrolled and staged.
export function AccountCareView({ data }: { data: CareEnrollmentDto }) {
  if (data.sourceState === "unavailable") {
    return (
      <section className="account-surface" aria-labelledby="care-unavailable-heading">
        <p className="account-section-label">Care status</p>
        <h2 id="care-unavailable-heading" className="account-section-title">Care status unavailable.</h2>
        <p className="body-s text-ink-2 mt-3">Care status is managed through the provider/Tebra workflow.</p>
        <p className="body-s text-ink-2 mt-2">That source is not available in this account right now, so no enrollment or operational-stage claim can be shown here.</p>
        <Link className="btn btn-secondary mt-5" href={ACCOUNT_PORTAL_ROUTES.support}>Ask account support</Link>
      </section>
    );
  }

  if (!data.enrolled) {
    return (
      <section className="account-surface" aria-labelledby="care-not-started-heading">
        <p className="account-section-label">Care status</p>
        <h2 id="care-not-started-heading" className="account-section-title">Care not started.</h2>
        <p className="body-s text-ink-2 mt-3">Membership and Research access can exist without a Care relationship.</p>
        <Link className="btn btn-secondary mt-5" href={ACCOUNT_PORTAL_ROUTES.support}>Ask account support</Link>
      </section>
    );
  }

  const stage = data.status.stage;
  if (!stage) {
    return (
      <section className="account-surface" aria-labelledby="care-no-stage-heading">
        <p className="account-section-label">Care status</p>
        <h2 id="care-no-stage-heading" className="account-section-title">No operational stage is recorded yet.</h2>
        <p className="body-s text-ink-2 mt-3">Your Care enrollment is recorded, but no operational stage is available right now.</p>
        <Link className="btn btn-secondary mt-5" href={ACCOUNT_PORTAL_ROUTES.support}>Ask account support</Link>
      </section>
    );
  }

  return (
    <section className="account-surface" aria-labelledby="care-current-heading">
      <p className="account-section-label">Current Care stage</p>
      <h2 id="care-current-heading" className="account-section-title">{STAGE_LABELS[stage]}</h2>
      <p className="body-m text-ink-2 mt-4 max-w-[60ch]">{data.status.neutralSummary ?? "Your current operational status is recorded in the Care workflow."}</p>
      <p className="mono-label text-ink-mute mt-4">Updated {formatAccountDate(data.status.updatedAt, true)}</p>
      <div className="account-surface account-surface-warm mt-6">
        <p className="body-s font-700">This account view shows the current checkpoint only.</p>
        <p className="body-s text-ink-2 mt-2">It does not claim that earlier checkpoints were completed. Later steps are not guaranteed, a provider decision is separate from pharmacy processing, and membership does not determine either outcome.</p>
      </div>
      <Link className="btn btn-secondary mt-5" href={ACCOUNT_PORTAL_ROUTES.support}>Ask account support</Link>
    </section>
  );
}

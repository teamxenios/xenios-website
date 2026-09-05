import { Link } from "wouter";
import { billingPresentation } from "@shared/research/customer-account/billing-presentation";
import { ResearchStatusBadge } from "../../ui/kit";
import { ACCOUNT_PORTAL_ROUTES } from "../../lib/routes";
import {
  formatAccountDate,
  formatMembershipRenewal,
  sentenceCase,
  statusTone,
} from "../format";
import type { SubscriptionPageDto } from "../types";

export function AccountSubscriptionView({ data }: { data: SubscriptionPageDto }) {
  const { membership, careEnrollment } = data.subscription ?? {};
  const noBillingRelationship = membership?.billing === "none";
  // Billing truth renders ONLY through the canonical presentation (P1-C);
  // an absent membership has no connected billing state.
  const billing = billingPresentation(membership?.billing ?? "unknown");
  const billingMethodKnown = membership && ["current", "past_due", "disputed", "cancelled", "refunded"].includes(membership.billing);
  // An unavailable Care source carries no enrollment claim (P1-D); an absent
  // enrollment payload is the same "no source" fact, never "not enrolled".
  const careUnavailable = !careEnrollment || careEnrollment.sourceState === "unavailable";

  return (
    <div className="account-grid account-grid-2">
      <section className="account-surface account-surface-dark" aria-labelledby="membership-plan-heading">
        <p className="account-section-label" style={{ color: "#c8c4bb" }}>Historical billing</p>
        <h2 id="membership-plan-heading" className="account-section-title">
          {!membership
            ? "Billing data unavailable"
            : membership.planLabel ?? (noBillingRelationship ? "No billing relationship recorded" : "Plan label unavailable")}
        </h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <ResearchStatusBadge label={membership ? `Recorded account state: ${sentenceCase(membership.state)}` : "Recorded account state unavailable"} tone={statusTone(membership?.state ?? "unknown")} />
          {/* P1-5: billing truth is its own badge, never folded into access state. */}
          <ResearchStatusBadge label={`Billing: ${billing.label}`} tone={billing.tone} />
        </div>
        <dl className="mt-6">
          <div className="account-data-row" style={{ borderColor: "#4c4a45" }}><dt className="account-data-label" style={{ color: "#c8c4bb" }}>Billing status</dt><dd className="account-data-value">{billing.label}</dd></div>
          <div className="account-data-row" style={{ borderColor: "#4c4a45" }}><dt className="account-data-label" style={{ color: "#c8c4bb" }}>Recorded renewal evidence</dt><dd className="account-data-value">{membership ? formatMembershipRenewal(membership) : "Renewal schedule unavailable"}</dd></div>
          <div className="account-data-row" style={{ borderColor: "#4c4a45" }}><dt className="account-data-label" style={{ color: "#c8c4bb" }}>Recorded billing method</dt><dd className="account-data-value">{!membership ? "Unavailable" : noBillingRelationship ? "No billing method" : !billingMethodKnown ? "Billing method unavailable" : membership.manualBilling ? "Manual / offline" : "Historical provider pathway"}</dd></div>
        </dl>
        <Link className="btn btn-on-dark btn-ghost mt-6" href={ACCOUNT_PORTAL_ROUTES.support}>Request billing support</Link>
        <p className="body-s mt-5" style={{ color: "#d9d6ce" }}>
          Paid membership is not required for approved customer access. Historical charges and plan records remain available for review. This page does not refund payments, cancel existing recurring charges, or change account approval.
        </p>
      </section>

      <section className="account-surface" aria-labelledby="care-enrollment-heading">
        <p className="account-section-label">Separate access and fulfillment</p>
        <h2 id="care-enrollment-heading" className="account-section-title">Care enrollment</h2>
        <p className="body-s text-ink-2 mt-3">Care enrollment is not a medication subscription. Provider review and pharmacy fulfillment each keep their own status.</p>
        <dl className="mt-5">
          <div className="account-data-row"><dt className="account-data-label">Enrollment</dt><dd className="account-data-value">{careUnavailable ? "Care status is managed through the provider/Tebra workflow." : careEnrollment.enrolled ? "Enrolled" : "Not enrolled"}</dd></div>
          <div className="account-data-row"><dt className="account-data-label">Provider / Care stage</dt><dd className="account-data-value">{careUnavailable ? "—" : careEnrollment.status.stage ? sentenceCase(careEnrollment.status.stage) : "No stage recorded"}</dd></div>
          <div className="account-data-row"><dt className="account-data-label">Pharmacy fulfillment</dt><dd className="account-data-value">{careUnavailable ? "—" : sentenceCase(careEnrollment.pharmacyState)}</dd></div>
        </dl>
        <Link className="btn btn-secondary mt-6" href={ACCOUNT_PORTAL_ROUTES.care}>View Care timeline</Link>
      </section>

      <section className="account-surface account-grid-2" aria-labelledby="billing-history-heading" style={{ gridColumn: "1 / -1" }}>
        <div>
          <p className="account-section-label">Billing history</p>
          <h2 id="billing-history-heading" className="account-section-title">Receipts and records</h2>
          <p className="body-s text-ink-2 mt-3">Historical billing receipts are account documents. Product subscriptions, orders, and Care fulfillment charges remain distinct.</p>
        </div>
        <div className="account-card-list">
          {data.billingDocuments == null ? (
            <div className="account-empty">Billing-document history is currently unavailable.</div>
          ) : data.billingDocuments.length ? data.billingDocuments.map((document) => (
            <article className="account-list-card" key={document.id}>
              <div><p className="mono-label text-ink-mute">Receipt · {formatAccountDate(document.issuedAt)}</p><h3 className="body-m font-700 mt-2">{document.title}</h3></div>
              <div className="account-list-card-actions"><Link href={ACCOUNT_PORTAL_ROUTES.documents}>Open documents</Link></div>
            </article>
          )) : <div className="account-empty">No billing receipts are visible in this account view. Receipt-history completeness is not reported here.</div>}
        </div>
      </section>
    </div>
  );
}

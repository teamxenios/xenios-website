import { Link } from "wouter";
import { ResearchStatusBadge } from "../../ui/kit";
import { ACCOUNT_PORTAL_ROUTES } from "../../lib/routes";
import { formatAccountDate, safeExternalUrl, sentenceCase, statusTone } from "../format";
import type { SubscriptionPageDto } from "../types";

export function AccountSubscriptionView({ data }: { data: SubscriptionPageDto }) {
  const { membership, careEnrollment } = data.subscription;
  const manageUrl = safeExternalUrl(membership?.manageUrl ?? null);

  return (
    <div className="account-grid account-grid-2">
      <section className="account-surface account-surface-dark" aria-labelledby="membership-plan-heading">
        <p className="account-section-label" style={{ color: "#c8c4bb" }}>Xenios membership</p>
        <h2 id="membership-plan-heading" className="account-section-title">{membership?.planLabel ?? "No membership plan"}</h2>
        <div className="mt-5">
          <ResearchStatusBadge label={membership ? sentenceCase(membership.state) : "None"} tone={statusTone(membership?.state ?? "none")} />
        </div>
        <dl className="mt-6">
          <div className="account-data-row" style={{ borderColor: "#4c4a45" }}><dt className="account-data-label" style={{ color: "#c8c4bb" }}>Next billing / renewal</dt><dd className="account-data-value">{formatAccountDate(membership?.nextRenewalAt ?? null)}</dd></div>
          <div className="account-data-row" style={{ borderColor: "#4c4a45" }}><dt className="account-data-label" style={{ color: "#c8c4bb" }}>Billing method</dt><dd className="account-data-value">{membership?.manualBilling ? "Manual / offline" : "Online management"}</dd></div>
        </dl>
        {manageUrl ? (
          <a className="btn btn-on-dark btn-primary mt-6" href={manageUrl} target="_blank" rel="noopener noreferrer">Manage billing securely</a>
        ) : (
          <Link className="btn btn-on-dark btn-ghost mt-6" href={ACCOUNT_PORTAL_ROUTES.support}>Request billing support</Link>
        )}
        <p className="body-s mt-5" style={{ color: "#d9d6ce" }}>
          Pause or cancellation options appear only when supported by the active billing pathway.
        </p>
      </section>

      <section className="account-surface" aria-labelledby="care-enrollment-heading">
        <p className="account-section-label">Separate from membership</p>
        <h2 id="care-enrollment-heading" className="account-section-title">Care enrollment</h2>
        <p className="body-s text-ink-2 mt-3">Care enrollment is not a medication subscription. Provider review and pharmacy fulfillment each keep their own status.</p>
        <dl className="mt-5">
          <div className="account-data-row"><dt className="account-data-label">Enrollment</dt><dd className="account-data-value">{careEnrollment?.enrolled ? "Enrolled" : "Not enrolled"}</dd></div>
          <div className="account-data-row"><dt className="account-data-label">Provider / Care stage</dt><dd className="account-data-value">{careEnrollment?.status.stage ? sentenceCase(careEnrollment.status.stage) : "Not started"}</dd></div>
          <div className="account-data-row"><dt className="account-data-label">Pharmacy fulfillment</dt><dd className="account-data-value">{sentenceCase(careEnrollment?.pharmacyState ?? "none")}</dd></div>
        </dl>
        <Link className="btn btn-secondary mt-6" href={ACCOUNT_PORTAL_ROUTES.care}>View Care timeline</Link>
      </section>

      <section className="account-surface account-grid-2" aria-labelledby="billing-history-heading" style={{ gridColumn: "1 / -1" }}>
        <div>
          <p className="account-section-label">Billing history</p>
          <h2 id="billing-history-heading" className="account-section-title">Receipts and records</h2>
          <p className="body-s text-ink-2 mt-3">Membership receipts are account documents. Product and Care fulfillment charges remain distinct.</p>
        </div>
        <div className="account-card-list">
          {data.billingDocuments.length ? data.billingDocuments.map((document) => (
            <article className="account-list-card" key={document.id}>
              <div><p className="mono-label text-ink-mute">Receipt · {formatAccountDate(document.issuedAt)}</p><h3 className="body-m font-700 mt-2">{document.title}</h3></div>
              <div className="account-list-card-actions"><Link href={ACCOUNT_PORTAL_ROUTES.documents}>Open documents</Link></div>
            </article>
          )) : <div className="account-empty">No membership receipts are available yet.</div>}
        </div>
      </section>
    </div>
  );
}

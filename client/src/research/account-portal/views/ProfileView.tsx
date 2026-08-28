import { Link } from "wouter";
import type { CustomerAccountOverviewDto } from "@shared/research/customer-account/contract";
import { ResearchStatusBadge } from "../../ui/kit";
import { ACCOUNT_PORTAL_ROUTES } from "../../lib/routes";
import { formatAccountDate, sentenceCase, statusTone } from "../format";

export function AccountProfileView({ data }: { data: CustomerAccountOverviewDto }) {
  const { identity } = data;
  return (
    <div className="account-grid account-grid-main">
      <section className="account-surface" aria-labelledby="account-profile-heading">
        <p className="account-section-label">Read-only identity</p>
        <h2 id="account-profile-heading" className="account-section-title">Profile on this account</h2>
        <dl className="mt-5">
          <div className="account-data-row">
            <dt className="account-data-label">Name</dt>
            <dd className="account-data-value break-words">{identity.displayName}</dd>
          </div>
          <div className="account-data-row">
            <dt className="account-data-label">Email</dt>
            <dd className="account-data-value break-words">{identity.email}</dd>
          </div>
          <div className="account-data-row">
            <dt className="account-data-label">Account status</dt>
            <dd className="account-data-value">
              <ResearchStatusBadge
                label={sentenceCase(identity.accountStatus)}
                tone={statusTone(identity.accountStatus)}
              />
            </dd>
          </div>
          <div className="account-data-row">
            <dt className="account-data-label">Member since</dt>
            <dd className="account-data-value">{formatAccountDate(identity.memberSince)}</dd>
          </div>
        </dl>
      </section>

      <aside className="account-surface account-surface-warm" aria-labelledby="profile-changes-heading">
        <p className="account-section-label">Profile changes</p>
        <h2 id="profile-changes-heading" className="account-section-title">Changes are handled by account support.</h2>
        <p className="body-s text-ink-2 mt-3">
          This page is read-only and does not claim that an edit has been saved. Send the exact change through the private support form for review.
        </p>
        <Link className="btn btn-secondary mt-5" href={ACCOUNT_PORTAL_ROUTES.support}>Open account support</Link>
      </aside>
    </div>
  );
}

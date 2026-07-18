import SeoHead from "@/components/SeoHead";
import { BusinessPageHero, ReferralPassport, ReferralShareActions, SectionLead } from "../business-components";
import {
  REFERRAL_FEATURES_OFF,
  resolveAggregateDashboardPresentation,
  type AggregateReferralDashboardInput,
} from "../referral-state";

const DEVELOPMENT_AGGREGATE_SAMPLE: AggregateReferralDashboardInput = {
  enabled: true,
  code: null,
  counts: { visits: 8, applications: 3, qualified: 1 },
  creditAvailableCents: 1500,
  creditPendingCents: 1500,
};

export default function MemberReferrals() {
  const previewRequested = new URLSearchParams(window.location.search).get("preview") === "1";
  const dashboard = resolveAggregateDashboardPresentation({
    features: REFERRAL_FEATURES_OFF,
    state: null,
    isDevelopment: import.meta.env.DEV,
    previewRequested,
    previewState: DEVELOPMENT_AGGREGATE_SAMPLE,
  });
  const developmentPreview = dashboard.mode === "development-preview";

  return (
    <>
      <SeoHead title="Referral workspace unavailable, xenios research" description="Referral tools remain unavailable until authenticated aggregate state and server validation are enabled." path="/research/member/referrals" />
      <BusinessPageHero
        eyebrow="Member referral workspace"
        title="Aggregate insight. No person-level tracking."
        lead="The production dashboard will use authenticated aggregate counts only. Referral tools, credits, QR codes, and sharing remain disabled until the server contract and feature flags are enabled."
        aside={<div><p className="mono-cap text-pulse">Program status</p><p className="h3 mt-4">Unavailable.</p><p className="body-s text-ink-2 mt-4">No member identity, referral code, reward, or activity is connected in this UI branch.</p></div>}
      />

      {developmentPreview && (
        <section className="container-x pt-8" data-testid="development-dashboard-preview">
          <div className="xr-disclosure">
            <p className="mono-cap text-pulse">Development-only aggregate sample</p>
            <p className="body-s text-ink-2 mt-3">Not production data. Counts are illustrative; credits, codes, QR, sharing, and person-level activity remain disabled.</p>
          </div>
        </section>
      )}

      <section className="container-x xr-section" data-referral-mode={dashboard.mode}>
        <div className="xr-metric-grid">
          {[
            ["Visits", String(dashboard.counts.visits)],
            ["Applications", String(dashboard.counts.applications)],
            ["Qualified", String(dashboard.counts.qualified)],
            ["Credit available", dashboard.creditsEnabled ? `$${(dashboard.creditAvailableCents / 100).toFixed(0)}` : "Unavailable"],
          ].map(([label, value]) => <div className="xr-kpi" key={label}><p className="mono-label text-ink-mute">{label}</p><strong className="tabular">{value}</strong></div>)}
        </div>
      </section>

      <section className="container-x xr-section">
        <div className="xr-two-column">
          <div className="xr-referral-stage">
            <ReferralPassport
              variant="member"
              reference={developmentPreview ? "XR-DEVELOPMENT-SAMPLE" : "XR-NOT-ISSUED"}
              issued="NOT ISSUED"
              code={null}
              invitationUrl={null}
              preview
              stateLabel={developmentPreview ? "Development sample" : "Program unavailable"}
              footerLabel="No invitation issued"
              previewLabel={developmentPreview ? "Development only · aggregate sample" : "Program preview · not active"}
            />
            <ReferralShareActions url="" disabled />
          </div>
          <div>
            <SectionLead eyebrow="Privacy boundary" title="Counts only. No invitation rows." body="The PR #12 contract exposes aggregate visits, applications, qualified count, and credit totals. It does not expose invitation identifiers, dates, identities, or person-level statuses." />
            <div className="xr-surface xr-surface-muted mt-8">
              <p className="mono-cap text-ink-mute">Never rendered here</p>
              <ul className="body-s text-ink-2 mt-5 space-y-3">
                <li>Invitation IDs or individual dates</li>
                <li>Applicant names, contact information, or answers</li>
                <li>Individual approval, decline, or review status</li>
                <li>Health, Blueprint, purchase, or private member data</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

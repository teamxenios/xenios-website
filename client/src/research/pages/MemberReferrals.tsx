import SeoHead from "@/components/SeoHead";
import { BusinessPageHero, ReferralActivityTable, ReferralPassport, ReferralShareActions, type ReferralActivity } from "../business-components";

const PREVIEW_ACTIVITY: ReferralActivity[] = [
  { id: "INV-021", date: "Jul 18", status: "Invited" },
  { id: "INV-018", date: "Jul 12", status: "Pending" },
  { id: "INV-011", date: "Jun 28", status: "Qualified" },
  { id: "INV-006", date: "Jun 03", status: "Reward earned" },
  { id: "INV-002", date: "May 18", status: "Expired" },
];

export default function MemberReferrals() {
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "1";
  const previewUrl = `${window.location.origin}/research/invite/SAMUEL-XR82`;
  const activities = previewMode ? PREVIEW_ACTIVITY : [];

  return (
    <>
      <SeoHead title="Your referrals, xenios research" description="Your privacy-safe xenios invitation link, referral activity, qualification states, and member-credit summary." path="/research/member/referrals" />
      <BusinessPageHero
        eyebrow="Member referral workspace"
        title="Invite with intention. Track only what you need."
        lead="Your dashboard will show the invitation link, privacy-safe progress, and earned xenios credits. It will never expose someone else's application or private member information."
        aside={<div><p className="mono-cap text-pulse">Infrastructure status</p><p className="h3 mt-4">UI ready. Member data not connected.</p><p className="body-s text-ink-2 mt-4">Claude owns authenticated member identity, referral codes, qualification, credits, expiration, and fraud controls.</p></div>}
      />

      <section className="container-x xr-section">
        <div className="xr-metric-grid">
          {[
            ["Visits", previewMode ? "5" : "0"],
            ["Applications", previewMode ? "1" : "0"],
            ["Qualified", previewMode ? "2" : "0"],
            ["Credit available", previewMode ? "$15" : "$0"],
          ].map(([label, value]) => <div className="xr-kpi" key={label}><p className="mono-label text-ink-mute">{label}</p><strong className="tabular">{value}</strong></div>)}
        </div>
      </section>

      <section className="container-x xr-section">
        <div className="xr-two-column">
          <div className="xr-referral-stage">
            <ReferralPassport variant="member" reference={previewMode ? "XR-PREVIEW-01689" : "XR-MEMBER"} issued="JUL 18 2026" memberSince={previewMode ? "JUL 2026" : undefined} code={previewMode ? "SAMUEL-XR82" : null} invitationUrl={previewMode ? previewUrl : null} preview={previewMode} />
            <ReferralShareActions url={previewMode ? previewUrl : ""} disabled={!previewMode} />
          </div>
          <div>
            <p className="mono-cap text-ink-mute mb-5">Invitation activity</p>
            <ReferralActivityTable activities={activities} />
            <div className="xr-disclosure mt-8"><p className="body-s text-ink-2">Production defaults to the empty state until an authenticated member contract supplies a server-issued code and privacy-safe activity. Development preview states require `?preview=1` and never call an API.</p></div>
          </div>
        </div>
      </section>
    </>
  );
}

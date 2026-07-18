import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { BusinessPageHero, NumberedJourney, ReferralPassport, ReferralShareActions, SectionLead } from "../business-components";

const QUALIFICATION = [
  { title: "Invitation used", body: "The applicant arrives through an issued xenios invitation link." },
  { title: "Application completed", body: "A complete application enters the same independent review process as every other applicant." },
  { title: "Independently approved", body: "An invitation never influences the approval decision or reveals its outcome to the referrer." },
  { title: "$50 activation", body: "The approved applicant chooses to activate the membership." },
  { title: "Verification period passed", body: "Refund, dispute, duplicate, self-referral, and abuse checks are complete." },
  { title: "Credit earned", body: "The new member receives $10 in xenios credit and the referrer receives $15." },
];

export default function Referrals() {
  const previewUrl = `${window.location.origin}/research/invite/SAMUEL-XR82`;

  return (
    <>
      <SeoHead title="Member referrals, xenios research" description="Invite people you trust into xenios research. Rewards begin only after independent approval, activation, and verification." path="/research/referrals" />
      <BusinessPageHero
        eyebrow="Member referrals"
        title="Your network shapes your health."
        lead="Invite people you trust into xenios. When an invited applicant is independently approved, activates, and passes the verification period, both members receive xenios credit."
        primary={{ label: "Apply for Membership", href: "/research/apply" }}
        secondary={{ label: "Referral dashboard", href: "/research/member/referrals" }}
        aside={(
          <div>
            <p className="mono-cap text-pulse">Give $10. Get $15.</p>
            <p className="h3 mt-4">Credit follows qualified activation, never an application.</p>
            <p className="body-s text-ink-2 mt-4">Referral credits are planned and will not issue until the ledger, fraud controls, and member identity contracts are live.</p>
          </div>
        )}
      />

      <section className="container-x xr-section">
        <div className="xr-referral-stage">
          <div className="xr-referral-stage-copy">
            <p className="mono-cap" style={{ color: "var(--lilac)" }}>Member Passport preview</p>
            <h2 className="display-s">Distinctly xenios. Designed to be shared.</h2>
            <p className="body-m">This preview uses a non-production identifier. Live cards will use server-issued codes and will never encode health, application, or purchase information.</p>
          </div>
          <ReferralPassport variant="member" reference="XR-PREVIEW-01689" issued="JUL 18 2026" memberSince="JUL 2026" code="SAMUEL-XR82" invitationUrl={previewUrl} preview />
          <ReferralShareActions url={previewUrl} />
        </div>
      </section>

      <section className="container-x xr-section">
        <SectionLead eyebrow="Qualification" title="A real member, not a submitted form." body="Referrals should improve fit and trust. That requires a complete qualification sequence and the same independent approval standard for everyone." />
        <NumberedJourney steps={QUALIFICATION} />
      </section>

      <section className="container-x xr-section">
        <div className="xr-two-column">
          <article className="xr-surface">
            <p className="mono-cap text-ink-mute">Credits can support</p>
            <h2 className="h3 mt-4">The member journey.</h2>
            <ul className="body-m text-ink-2 mt-6 space-y-3">
              <li>xenios Plus</li><li>Programs</li><li>Blueprint upgrades</li><li>Eligible supplements</li><li>Eligible member purchases</li>
            </ul>
          </article>
          <article className="xr-surface xr-surface-muted">
            <p className="mono-cap text-ink-mute">Credits never become</p>
            <h2 className="h3 mt-4">Cash or clinical inducement.</h2>
            <ul className="body-m text-ink-2 mt-6 space-y-3">
              <li>Not cash-withdrawable</li><li>Not valid for clinical services</li><li>Not issued for self-referrals</li><li>Not issued after refunds or disputes</li><li>Not lifetime member commissions</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="container-x xr-section">
        <div className="xr-two-column">
          <div>
            <SectionLead eyebrow="Privacy boundary" title="Referrers see progress, never private context." body="A referrer can see Invited, Pending, Qualified, Reward earned, or Expired. Nothing more." />
            <Link href="/research/how-your-data-is-used" className="btn btn-secondary mt-8">How data is used</Link>
          </div>
          <div className="xr-surface xr-surface-dark">
            <p className="mono-cap" style={{ color: "var(--lilac)" }}>Never visible to a referrer</p>
            <ul className="body-m mt-6 space-y-3" style={{ color: "rgba(255,255,255,.76)" }}>
              <li>Application answers or review notes</li><li>Approval or decline reason</li><li>Health interests or Blueprint data</li><li>Purchases or private membership information</li><li>Identity unless the applicant shared it independently</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}

import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { BusinessPageHero, NumberedJourney, ReferralPassport, ReferralShareActions, SectionLead } from "../business-components";

const QUALIFICATION = [
  { title: "Verified invitation", body: "If enabled, the server validates an issued link before recording attribution." },
  { title: "Application completed", body: "A complete application enters the same independent review process as every other applicant." },
  { title: "Independently approved", body: "An invitation never influences the approval decision or reveals its outcome to the referrer." },
  { title: "$50 activation", body: "The approved applicant chooses to activate the membership." },
  { title: "Verification period passed", body: "Refund, dispute, duplicate, self-referral, and abuse checks are complete." },
  { title: "Proposed credit", body: "If the final configurable terms are approved and enabled, the current proposal is $10 for the new member and $15 for the referrer." },
];

export default function Referrals() {
  const developmentPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "1";

  return (
    <>
      <SeoHead title="Proposed member referrals, xenios research" description="A proposed member referral program. Codes, attribution, credits, QR, and sharing are not active." path="/research/referrals" />
      <BusinessPageHero
        eyebrow="Member referrals"
        title="A referral program is being designed."
        lead="Give $10, Get $15 is a configurable proposal, not an active reward. Codes, attribution, credits, QR, and sharing remain disabled while the server flags and validation contract are off."
        primary={{ label: "Apply for Membership", href: "/research/apply" }}
        secondary={{ label: "Referral dashboard", href: "/research/member/referrals" }}
        aside={(
          <div>
            <p className="mono-cap text-pulse">Proposed · not active</p>
            <p className="h3 mt-4">Give $10. Get $15.</p>
            <p className="body-s text-ink-2 mt-4">Final values, eligibility, hold windows, expiry, and reversals remain configurable and require enabled ledger, identity, validation, and fraud controls.</p>
          </div>
        )}
      />

      <section className="container-x xr-section">
        <div className="xr-referral-stage">
          <div className="xr-referral-stage-copy">
            <p className="mono-cap" style={{ color: "var(--lilac)" }}>{developmentPreview ? "Development-only visual preview" : "Program preview · unavailable"}</p>
            <h2 className="display-s">Distinctly xenios. Designed to be shared.</h2>
            <p className="body-m">No invitation has been issued. This visual contains no code or QR, and every sharing action is disabled until the program and server validation endpoint are enabled.</p>
          </div>
          <ReferralPassport
            variant="member"
            reference={developmentPreview ? "XR-DEVELOPMENT-SAMPLE" : "XR-NOT-ISSUED"}
            issued="NOT ISSUED"
            code={null}
            invitationUrl={null}
            preview
            stateLabel={developmentPreview ? "Development sample" : "Program unavailable"}
            footerLabel="No invitation issued"
            previewLabel={developmentPreview ? "Development only · not a real invitation" : "Program proposal · not active"}
          />
          <ReferralShareActions url="" disabled />
        </div>
      </section>

      <section className="container-x xr-section">
        <SectionLead eyebrow="Proposed qualification" title="A real member, not a submitted form." body="If the program is enabled, qualification must preserve independent review and require verified activation, an elapsed hold period, and all configured fraud checks." />
        <NumberedJourney steps={QUALIFICATION} />
      </section>

      <section className="container-x xr-section">
        <div className="xr-two-column">
          <article className="xr-surface">
            <p className="mono-cap text-ink-mute">Proposed credits could support</p>
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
            <SectionLead eyebrow="Privacy boundary" title="Aggregate counts, never person-level progress." body="The initial PR #12 dashboard contract is limited to aggregate visits, applications, qualified count, and credit totals. It does not expose invitation rows, identifiers, dates, or individual statuses." />
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

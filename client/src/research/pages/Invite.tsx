import { Link, useParams } from "wouter";
import SeoHead from "@/components/SeoHead";
import { normalizeReferralCode, referralApplyHref } from "@shared/research/referral-ui";
import { BusinessPageHero, ReferralPassport, SectionLead } from "../business-components";

export default function Invite() {
  const params = useParams<{ referralCode: string }>();
  const code = normalizeReferralCode(params.referralCode);
  const invitationUrl = `${window.location.origin}/research/invite/${encodeURIComponent(code)}`;
  const applyHref = referralApplyHref(code);

  return (
    <>
      <SeoHead title="You were invited, xenios research" description="You were invited to a private whole-life membership. Every application is reviewed independently and an invitation never guarantees approval." path={`/research/invite/${code}`} />
      <BusinessPageHero
        eyebrow="Private invitation"
        title="You were invited to xenios research."
        lead="xenios is a private whole-life membership for people who want to better understand their health, routines, environment, goals, information, and trusted support."
        primary={{ label: "Start the free application", href: applyHref }}
        secondary={{ label: "Understand membership", href: "/research/membership" }}
        aside={<div><p className="mono-cap text-pulse">Independent review</p><p className="h3 mt-4">An invitation does not guarantee approval.</p><p className="body-s text-ink-2 mt-4">The referrer cannot see your application, influence the decision, or learn why an application is approved or declined.</p></div>}
      />

      <section className="container-x xr-section">
        <div className="xr-referral-stage">
          <ReferralPassport variant="applicant" reference={code ? `XR-${code}` : "XR-INVITATION"} issued="JUL 18 2026" code={code || null} invitationUrl={code ? invitationUrl : null} preview />
        </div>
      </section>

      <section className="container-x xr-section">
        <SectionLead eyebrow="What happens next" title="The invitation opens a door. The application decides fit." />
        <div className="xr-three-column">
          <article className="xr-surface"><p className="mono-cap text-pulse">01</p><h2 className="h3 mt-4">Apply free</h2><p className="body-s text-ink-2 mt-4">Share identity, context, goals, fit, and required acknowledgements. No payment is collected.</p></article>
          <article className="xr-surface"><p className="mono-cap text-pulse">02</p><h2 className="h3 mt-4">Independent review</h2><p className="body-s text-ink-2 mt-4">xenios may approve, request more information, recommend another pathway, or decline.</p></article>
          <article className="xr-surface"><p className="mono-cap text-pulse">03</p><h2 className="h3 mt-4">Choose activation</h2><p className="body-s text-ink-2 mt-4">Approved applicants may activate for $50, complete onboarding, and begin the Whole-Life Blueprint.</p></article>
        </div>
        <Link href={applyHref} className="btn btn-primary mt-8">Start the free application</Link>
      </section>
    </>
  );
}

import { Link, useParams } from "wouter";
import SeoHead from "@/components/SeoHead";
import { REFERRAL_FEATURES_OFF, resolveInvitationRouteState } from "../referral-state";
import { BusinessPageHero, ReferralPassport, SectionLead } from "../business-components";

export default function Invite() {
  const params = useParams<{ referralCode: string }>();
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "1";
  const invitation = resolveInvitationRouteState({
    rawCode: params.referralCode,
    features: REFERRAL_FEATURES_OFF,
    // Fail closed. No validation endpoint is connected in PR #13.
    serverValidatedCode: null,
  });
  const invalid = invitation.status === "invalid";

  return (
    <>
      <SeoHead title="Invitation unavailable, xenios research" description="This invitation cannot be verified. You may still apply without a referral." path="/research/invite" />
      <BusinessPageHero
        eyebrow={invalid ? "Invalid invitation" : "Invitation unavailable"}
        title={invalid ? "This invitation link is not valid." : "We cannot verify this invitation."}
        lead="A URL code is not proof of an authentic invitation. Referral attribution remains disabled until xenios connects an enabled server validation endpoint."
        primary={{ label: "Apply without a referral", href: invitation.applicationHref }}
        secondary={{ label: "Understand membership", href: "/research/membership" }}
        aside={<div><p className="mono-cap text-pulse">Fail-closed boundary</p><p className="h3 mt-4">No referral is attached.</p><p className="body-s text-ink-2 mt-4">This page does not identify a referrer, add a code to the application, create attribution, or promise a reward.</p></div>}
      />

      <section className="container-x xr-section">
        <div className="xr-two-column">
          <div>
            <SectionLead eyebrow="What you can do" title="Apply through the standard independent review." body="The ordinary application remains available without referral attribution. No payment is collected when you apply." />
            <Link href="/research/apply" className="btn btn-primary mt-8">Start the free application</Link>
          </div>
          <article className="xr-surface xr-surface-dark" data-testid="invitation-unavailable">
            <p className="mono-cap" style={{ color: "var(--lilac)" }}>Verification required</p>
            <h2 className="h3 mt-4">Invitation features are not active.</h2>
            <p className="body-s mt-4" style={{ color: "rgba(255,255,255,.74)" }}>A future server response must confirm the code, active program, attribution window, and feature state before this route can present a verified invitation.</p>
          </article>
        </div>
      </section>

      {previewMode && (
        <section className="container-x xr-section" data-testid="development-invitation-preview">
          <div className="xr-disclosure mb-8">
            <p className="mono-cap text-pulse">Development-only visual preview</p>
            <p className="body-s text-ink-2 mt-3">Not a real invitation. No code, QR, sharing control, referrer identity, or application attribution is enabled.</p>
          </div>
          <div className="xr-referral-stage">
            <ReferralPassport
              variant="applicant"
              reference="XR-DEVELOPMENT-SAMPLE"
              issued="NOT ISSUED"
              code={null}
              invitationUrl={null}
              preview
              stateLabel="Development sample"
              footerLabel="No invitation issued"
              previewLabel="Development only · not a real invitation"
            />
          </div>
        </section>
      )}
    </>
  );
}

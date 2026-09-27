import { Link } from "wouter";
import PartnershipInquiryForm from "./PartnershipInquiryForm";
import { B2BPageFrame, ReviewSteps, SectionHeading } from "./components";
import { B2B_PUBLIC_ROUTES } from "./pathways";

const referralSteps = [
  { title: "Submit an inquiry", body: "Tell us about your audience and how you would like to work with Xenios." },
  { title: "We review", body: "A person reviews the fit. An inquiry does not create an account or approve anything." },
  { title: "Agreement and activation", body: "If the program is a fit and applications open, Xenios sends the next approved steps." },
  { title: "Use approved resources", body: "Approved partners receive their link and program resources after activation." },
] as const;

export default function PartnerPathwaysPage() {
  return (
    <B2BPageFrame
      title="Partners | Xenios"
      description="Referral-partner interest and strategic partnership inquiries for Xenios."
      path={B2B_PUBLIC_ROUTES.partners}
      eyebrow="Partners"
      heading="Become a Xenios partner"
      lead="For creators, coaches and professionals who want to recommend Xenios and earn commission on eligible orders."
      actions={
        <>
          <a href="#partnership-inquiry" className="btn btn-primary">Submit Inquiry</a>
          <Link href="/sign-in" className="btn btn-secondary">Sign In</Link>
        </>
      }
    >
      <section className="container-x xr-b2b-section" aria-labelledby="partner-interest-heading">
        <SectionHeading
          id="partner-interest-heading"
          eyebrow="Referral partners"
          title="Partner applications open soon."
          body="Tell us you're interested and we'll contact you when they do. Sending an inquiry is not an application, does not create an account, and does not approve a partnership."
        />
        <ReviewSteps steps={referralSteps} />
      </section>

      <section className="container-x xr-b2b-section" aria-labelledby="partner-commission-heading">
        <SectionHeading id="partner-commission-heading" eyebrow="Commission" title="Eligible research-product orders only." />
        <div className="xr-b2b-pathway-card">
          <p className="body-m text-ink-2">
            Your practice earns commission on eligible research-product orders from clients you refer. Rates, holds, and payout timing are in your partner agreement. Care services never earn commission.
          </p>
        </div>
      </section>

      <section className="container-x xr-b2b-section" aria-labelledby="strategic-partner-heading">
        <SectionHeading
          id="strategic-partner-heading"
          eyebrow="Strategic partnerships"
          title="Distribution, technology, education, or another business relationship."
          body="Tell us about the relationship. A person follows up. This is an inquiry, not an account or approval."
        />
      </section>

      <div id="partnership-inquiry" className="container-x xr-b2b-section">
        <PartnershipInquiryForm heading="Submit a partner or strategic inquiry" />
      </div>
    </B2BPageFrame>
  );
}

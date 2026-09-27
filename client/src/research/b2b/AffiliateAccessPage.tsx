import { Link } from "wouter";
import PartnershipInquiryForm from "./PartnershipInquiryForm";
import { B2BPageFrame, ReviewSteps, SectionHeading } from "./components";
import { B2B_PUBLIC_ROUTES } from "./pathways";

const interestSteps = [
  { title: "Submit an inquiry", body: "Tell us about your audience, channels, and how you would like to work with Xenios." },
  { title: "We review", body: "A person reviews the fit. No application or account is created by this inquiry." },
  { title: "Wait for the approved next step", body: "If applications open and there is a fit, Xenios sends separate application or activation instructions." },
] as const;

export default function AffiliateAccessPage() {
  return (
    <B2BPageFrame
      title="Partner interest | Xenios"
      description="Tell Xenios you are interested in the referral-partner program without creating an application or account."
      path={B2B_PUBLIC_ROUTES.affiliates}
      eyebrow="Partner interest"
      heading="Partner applications open soon."
      lead="Tell us you're interested and we'll contact you when they do. This inquiry is not an application, account, or approval."
      actions={
        <>
          <a href="#affiliate-inquiry" className="btn btn-primary">Submit Inquiry</a>
          <Link href="/sign-in" className="btn btn-secondary">Sign In</Link>
        </>
      }
    >
      <section className="container-x xr-b2b-section" aria-labelledby="partner-interest-steps">
        <SectionHeading id="partner-interest-steps" eyebrow="What happens next" title="Inquiry first. Application only when open." />
        <ReviewSteps steps={interestSteps} />
      </section>

      <section className="container-x xr-b2b-section" aria-labelledby="partner-public-economics">
        <SectionHeading id="partner-public-economics" eyebrow="Commission" title="The agreement controls the details." />
        <p className="body-m text-ink-2 max-w-[70ch]">Commission applies only to eligible research-product orders after approval. Rates, holds, and payout timing are in the partner agreement. Care services never earn commission.</p>
      </section>

      <div id="affiliate-inquiry" className="container-x xr-b2b-section">
        <PartnershipInquiryForm initialPathway="affiliate" heading="Submit a partner-program inquiry" />
      </div>
    </B2BPageFrame>
  );
}

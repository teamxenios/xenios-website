import { Redirect } from "wouter";
import InquiryForm from "@/clarity/InquiryForm";
import { ContentSection, PublicPage } from "@/clarity/primitives";

export function CareersRole() {
  return <Redirect to="/careers" />;
}

export default function Careers() {
  return (
    <PublicPage
      title="Work with Xenios"
      description="Submit a general-interest application to Xenios."
      path="/careers"
      eyebrow="CAREERS"
      heading="Work with Xenios"
      lead="Tell us how you'd like to help build Xenios. We currently accept general interest only and do not list named openings."
      actions={[{ label: "Apply", href: "/careers#apply", kind: "primary" }]}
    >
      <ContentSection title="General interest" intro="Clinical, operations, technology, growth, partnership, support, contractor and advisor experience can all be relevant. Tell us where you can contribute and what you've built or led.">
        <p className="body-m text-ink-2 clarity-copy-width">Submitting records a general-interest application. It is not an offer, and we don't promise a response time.</p>
      </ContentSection>
      <ContentSection id="apply" tone="soft"><InquiryForm kind="career_interest" /></ContentSection>
    </PublicPage>
  );
}

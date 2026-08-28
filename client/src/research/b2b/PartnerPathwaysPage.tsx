import { Link } from "wouter";
import PartnershipInquiryForm from "./PartnershipInquiryForm";
import { B2BPageFrame, BoundaryPanel, PathwayCard, ReviewSteps, SectionHeading } from "./components";
import { B2B_PUBLIC_ROUTES, PARTNERSHIP_PATHWAYS } from "./pathways";

const REVIEW_STEPS = [
  {
    title: "Choose the correct relationship",
    body: "Research buying, clinical practice, affiliate, supplier, white-label, and strategic work enter different review lanes.",
  },
  {
    title: "Prepare the business context",
    body: "Share the entity, authorized contact, intended scope, region, documentation needs, and a concrete next step.",
  },
  {
    title: "Complete human review",
    body: "Xenios verifies fit, authority, legal and compliance needs, privacy boundaries, and operational readiness.",
  },
  {
    title: "Activate only what is approved",
    body: "Accounts, prices, catalog access, links, economics, products, and clinical capabilities remain unavailable until separately authorized.",
  },
] as const;

export default function PartnerPathwaysPage() {
  return (
    <B2BPageFrame
      title="Business partnerships | Xenios Research"
      description="Reviewed pathways for research organizations, clinics, medical spas, providers, affiliates, collectives, suppliers, white-label teams, and strategic partners."
      path={B2B_PUBLIC_ROUTES.partners}
      eyebrow="Xenios Research partnerships"
      heading="The right relationship starts with the right boundary."
      lead="Xenios provides distinct review pathways for research organizations, clinics, medical spas, providers, affiliates, collectives, suppliers, laboratories, fulfillment teams, and strategic operators. Each relationship has its own authority, evidence, privacy, and activation requirements."
      actions={
        <>
          <a href="#partnership-inquiry" className="btn btn-primary">
            Prepare an inquiry
          </a>
          <Link href={B2B_PUBLIC_ROUTES.partnerDashboard} className="btn btn-secondary">
            Existing partner access
          </Link>
        </>
      }
    >
      <section className="container-x xr-b2b-section" aria-labelledby="partnership-pathways-heading">
        <SectionHeading
          id="partnership-pathways-heading"
          eyebrow="Relationship pathways"
          title="One company, seven distinct ways to work together."
          body="Choose the path closest to the actual relationship. If more than one applies, start with the primary commercial purpose; the review team can route the rest without creating duplicate accounts."
        />
        <div className="xr-b2b-grid">
          {PARTNERSHIP_PATHWAYS.map((pathway) => (
            <PathwayCard key={pathway.id} pathway={pathway} />
          ))}
        </div>
      </section>

      <section className="container-x xr-b2b-section" aria-labelledby="partner-review-heading">
        <SectionHeading
          id="partner-review-heading"
          eyebrow="What happens next"
          title="A clear review, without implied approval."
          body="The public inquiry is an orientation and handoff. It is not an account application, quote, supplier assignment, partner agreement, or clinical credentialing decision."
        />
        <ReviewSteps steps={REVIEW_STEPS} />
      </section>

      <div className="container-x xr-b2b-section">
        <BoundaryPanel
          id="partner-boundary-heading"
          title="Commercial relationships never control clinical decisions."
          body="Research commerce, affiliate attribution, supplier operations, and provider-governed Care remain separate authorities. A relationship with Xenios does not create product access or a clinical outcome."
          items={[
            "No affiliate, clinic, supplier, or strategic partner can approve a prescription, provider decision, pharmacy action, or Care status.",
            "No public page promises a commission rate, wholesale price, inventory position, product activation, territory, exclusivity, or payout.",
            "No inquiry should include patient details, health information, payment evidence, customer product interests, credentials, or secrets.",
            "Research-designated materials remain for legitimate nonclinical use and never include dosing, administration, or personal-use guidance.",
          ]}
        />
      </div>

      <div id="partnership-inquiry" className="container-x xr-b2b-section">
        <PartnershipInquiryForm />
      </div>
    </B2BPageFrame>
  );
}

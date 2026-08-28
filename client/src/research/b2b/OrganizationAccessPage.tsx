import { Link } from "wouter";
import PartnershipInquiryForm from "./PartnershipInquiryForm";
import { B2BPageFrame, BoundaryPanel, ReviewSteps, SectionHeading } from "./components";
import { B2B_PUBLIC_ROUTES } from "./pathways";

const ORGANIZATION_TYPES = [
  {
    title: "Research and analytical organizations",
    body: "Laboratories, biotechnology teams, contract research organizations, and qualified product-development groups seeking documented nonclinical materials.",
  },
  {
    title: "Clinics and medical spas",
    body: "A reviewed business relationship that keeps Research procurement separate from patient care, provider judgment, prescribing, and pharmacy fulfillment.",
  },
  {
    title: "Professional and volume buyers",
    body: "Qualified businesses requesting a buyer profile, documented catalog review, volume planning, or human-reviewed commercial terms.",
  },
  {
    title: "Brands and approved resellers",
    body: "Entity, channel, claims, quality, insurance, buyer controls, intended market, and audit expectations are reviewed before any approval.",
  },
] as const;

const REVIEW_STEPS = [
  {
    title: "Organization review",
    body: "Verify the legal entity, authorized contact, intended business purpose, region, and the people who need buyer or billing access.",
  },
  {
    title: "Scope and documentation",
    body: "Identify exact categories, volume, research context, quality documents, delivery needs, and any terms requiring human review.",
  },
  {
    title: "Commercial path",
    body: "Review identifies whether the next path is a catalog, availability request, quote, organization account, or Care handoff without silently merging them.",
  },
  {
    title: "Onboarding and support",
    body: "Any approved onboarding must identify an accountable Xenios owner, next action, account status, and supported operational path. Approval is never automatic.",
  },
] as const;

const CAPABILITIES = [
  "Reviewed organization and buyer access",
  "Exact product and variant requests",
  "Volume and availability planning",
  "Human-reviewed quote requests",
  "Lot and document requirements",
  "Order, fulfillment, and support relationship",
] as const;

export default function OrganizationAccessPage() {
  return (
    <B2BPageFrame
      title="Organization access | Xenios Research"
      description="Reviewed organization access for laboratories, research teams, clinics, medical spas, professional buyers, and qualified product-development partners."
      path={B2B_PUBLIC_ROUTES.organizations}
      eyebrow="Organizations and professional buyers"
      heading="Structured access for serious business relationships."
      lead="Organization access brings the buyer, business purpose, catalog request, documentation needs, commercial review, fulfillment expectations, and support relationship into one deliberate pathway."
      actions={
        <>
          <a href="#organization-inquiry" className="btn btn-primary">
            Prepare an organization inquiry
          </a>
          <Link href={B2B_PUBLIC_ROUTES.partners} className="btn btn-secondary">
            Compare partnership paths
          </Link>
        </>
      }
    >
      <section className="container-x xr-b2b-section" aria-labelledby="organization-fit-heading">
        <SectionHeading
          id="organization-fit-heading"
          eyebrow="Who this is for"
          title="Different buyers, one disciplined intake."
          body="The organization route supports Research and commercial relationships. Provider-governed patient care remains in Care, even when the same business has a Research relationship with Xenios."
        />
        <div className="xr-b2b-grid">
          {ORGANIZATION_TYPES.map((organization) => (
            <article key={organization.title} className="xr-b2b-pathway-card">
              <h3 className="h3">{organization.title}</h3>
              <p className="body-s text-ink-2 mt-3">{organization.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x xr-b2b-section" aria-labelledby="organization-capabilities-heading">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading
              id="organization-capabilities-heading"
              eyebrow="After approval"
              title="An operational relationship, not a generic contact form."
              body="The exact capabilities depend on durable account, catalog, pricing, documentation, and fulfillment authority. Missing capabilities stay explicit."
            />
            <ul className="xr-b2b-checklist body-m text-ink-2">
              {CAPABILITIES.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
          </div>
          <BoundaryPanel
            id="organization-capabilities-boundary-heading"
            title="A request does not establish price, supply, or clinical access."
            body="Organization review creates a defensible next action. It does not turn workbook presence, demand, verbal supply, or a provider relationship into a purchasable product."
            items={[
              "Wholesale and organization-specific terms remain private and human-approved.",
              "Inventory, availability, documentation, and exact variants remain authoritative at the time of action.",
              "A clinic's Research account never authorizes treatment, prescribing, telehealth, or pharmacy fulfillment.",
              "No client or patient list should be attached to an initial inquiry.",
            ]}
          />
        </div>
      </section>

      <section className="container-x xr-b2b-section" aria-labelledby="organization-review-heading">
        <SectionHeading
          id="organization-review-heading"
          eyebrow="Review sequence"
          title="From interest to an owned next action."
          body="Each stage names the evidence or decision still needed. A missing external agreement or configuration blocks only that capability, not the clarity of the pathway."
        />
        <ReviewSteps steps={REVIEW_STEPS} />
      </section>

      <div id="organization-inquiry" className="container-x xr-b2b-section">
        <PartnershipInquiryForm
          initialPathway="research_organization"
          heading="Prepare an organization or wholesale inquiry"
        />
      </div>
    </B2BPageFrame>
  );
}

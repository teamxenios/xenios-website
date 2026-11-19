import { Link } from "wouter";
import BusinessInquiryForm, { type BusinessInquiryFormProps } from "./BusinessInquiryForm";
import { B2BPageFrame, BoundaryPanel, ReviewSteps, SectionHeading } from "./components";
import { B2B_PUBLIC_ROUTES } from "./pathways";

const WHOLESALE_FORMAT_GUIDE = [
  {
    title: "Vials",
    body: "Include the exact compound or blend name, listed strength, and number of vials. Keep different variants on separate lines.",
  },
  {
    title: "Nasal sprays",
    body: "Include the full item name, listed amount, and number of bottles. Add the package details from your catalog reference when available.",
  },
  {
    title: "Capsules",
    body: "Include the item name, listed strength, capsules per bottle, and number of bottles.",
  },
  {
    title: "Strips",
    body: "In Business context, include the item name, listed strength, strips per box, and number of boxes.",
  },
  {
    title: "Tablets",
    body: "Include the item name, listed strength, tablets per bottle, and number of bottles.",
  },
] as const;

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

const OFFLINE_BUSINESS_CONTEXT: BusinessInquiryFormProps = {
  enabled: false,
  contextGeneration: "",
  isContextCurrent: () => false,
};

export interface OrganizationAccessPageProps {
  /** Root binds actual availability and context lifecycle; this page grants no authority. */
  businessInquiry?: BusinessInquiryFormProps;
}

export default function OrganizationAccessPage({ businessInquiry }: OrganizationAccessPageProps = {}) {
  return (
    <B2BPageFrame
      title="Wholesale and organization access | Xenios Research"
      description="Wholesale product enquiries and reviewed organization access. Share exact items, variants, packages, quantities, and documentation needs with the Xenios team."
      path={B2B_PUBLIC_ROUTES.organizations}
      eyebrow="Wholesale and organization enquiries"
      heading="Wholesale enquiries for your organization."
      lead="Bring your product list, packaging requirements, and delivery needs. Our team reviews the business, the requested items, and the next steps with you."
      actions={
        <>
          <a href="#organization-inquiry" className="btn btn-primary">
            Start a business enquiry
          </a>
          <Link href={B2B_PUBLIC_ROUTES.partners} className="btn btn-secondary">
            Compare partnership paths
          </Link>
        </>
      }
    >
      <section className="container-x xr-b2b-section" aria-labelledby="wholesale-product-enquiries-heading">
        <SectionHeading
          id="wholesale-product-enquiries-heading"
          eyebrow="Wholesale product enquiries"
          title="Tell us exactly what your organization needs."
          body="Include the item name or catalog reference, listed variant or strength, package size, and quantity. Availability and documentation are reviewed for each requested item."
        />
        <div className="xr-b2b-grid">
          {WHOLESALE_FORMAT_GUIDE.map((format) => (
            <article key={format.title} className="xr-b2b-pathway-card">
              <h3 className="h3">{format.title}</h3>
              <p className="body-s text-ink-2 mt-3">{format.body}</p>
            </article>
          ))}
        </div>
        <p className="body-m text-ink-2 max-w-[68ch] mt-6">
          Tell us about delivery locations, timing, documentation needs, and whether you expect to reorder.
          If you are unsure about a variant or package, include the item name and what you need clarified.
        </p>
        <p className="body-s text-ink-2 max-w-[68ch] mt-4">
          Formats describe the information to include in your enquiry. They do not confirm that a particular item is available.
          Wholesale terms are discussed privately after review.
        </p>
        <div className="xr-b2b-card-actions mt-6">
          <a href="#organization-inquiry" className="btn btn-primary">
            Start a wholesale enquiry
          </a>
          <Link href="/earlyaccess" className="btn btn-secondary">
            Browse Early Access
          </Link>
        </div>
      </section>

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
        <BusinessInquiryForm {...(businessInquiry ?? OFFLINE_BUSINESS_CONTEXT)} />
      </div>
    </B2BPageFrame>
  );
}

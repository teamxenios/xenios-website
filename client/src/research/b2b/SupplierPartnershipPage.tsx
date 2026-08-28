import { Link } from "wouter";
import PartnershipInquiryForm from "./PartnershipInquiryForm";
import { B2BPageFrame, BoundaryPanel, ReviewSteps, SectionHeading } from "./components";
import { B2B_PUBLIC_ROUTES } from "./pathways";

const SUPPLIER_TYPES = [
  {
    title: "Product and material suppliers",
    body: "Exact identity, variant, source documentation, lot controls, availability, storage, and commercial authority are verified before assignment.",
  },
  {
    title: "Independent laboratories",
    body: "Scope, methods, accreditation or qualifications, sample chain, report authenticity, and document-delivery controls are reviewed.",
  },
  {
    title: "Fulfillment and logistics partners",
    body: "Assigned references, minimum shipping data, handling requirements, tracking, exceptions, returns, and recall procedures define the operating boundary.",
  },
] as const;

const SUPPLIER_STEPS = [
  {
    title: "Identity and agreement",
    body: "Verify the legal entity, authorized contacts, facility or operating scope, insurance where required, and executed agreements.",
  },
  {
    title: "Evidence readiness",
    body: "Review product identity, lot and COA expectations, quality documents, inventory evidence, shipping capability, SLA, and recall contacts.",
  },
  {
    title: "Scoped assignment",
    body: "Any approved partner must receive only assigned products, references, quantities, handling requirements, and the minimum destination data needed.",
  },
  {
    title: "Operational updates",
    body: "Acknowledgement, packing, shipment, delivery, exceptions, replacements, returns, and recalls require durable source-specific evidence.",
  },
] as const;

export default function SupplierPartnershipPage() {
  return (
    <B2BPageFrame
      title="Supplier and laboratory access | Xenios Research"
      description="Prospective supplier, laboratory, and fulfillment pathways with minimum-data boundaries, evidence requirements, and human review."
      path={B2B_PUBLIC_ROUTES.supplierAccess}
      eyebrow="Suppliers · laboratories · fulfillment"
      heading="Operational access begins after evidence, not interest."
      lead="Supplier access, when offered, is invitation-only. A business relationship, product conversation, or prepared inquiry does not establish supply readiness, documentation approval, inventory, assignment, or fulfillment authority."
      actions={
        <>
          <a href="#supplier-inquiry" className="btn btn-primary">
            Prepare supplier interest
          </a>
          <Link href={B2B_PUBLIC_ROUTES.support} className="btn btn-secondary">
            Supplier support
          </Link>
        </>
      }
    >
      <section className="container-x xr-b2b-section" aria-labelledby="supplier-types-heading">
        <SectionHeading
          id="supplier-types-heading"
          eyebrow="Operating partners"
          title="Each role needs a deliberately narrow operating boundary."
          body="The public page explains a prospective relationship. Any future private workspace would remain unavailable until entity, agreement, quality, documentation, security, and operational checks are complete."
        />
        <div className="xr-b2b-grid">
          {SUPPLIER_TYPES.map((type) => (
            <article key={type.title} className="xr-b2b-pathway-card">
              <h3 className="h3">{type.title}</h3>
              <p className="body-s text-ink-2 mt-3">{type.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x xr-b2b-section" aria-labelledby="supplier-onboarding-heading">
        <SectionHeading
          id="supplier-onboarding-heading"
          eyebrow="Readiness sequence"
          title="Verified first. Assigned second."
          body="Missing evidence must remain a clear pending or held state. It never becomes a fabricated approval, available lot, shipment, delivery, or customer promise."
        />
        <ReviewSteps steps={SUPPLIER_STEPS} />
      </section>

      <div className="container-x xr-b2b-section">
        <BoundaryPanel
          id="supplier-boundary-heading"
          title="Minimum data, assigned work, no commercial poaching."
          body="Any supplier access must expose only what is required to complete an approved assignment. Xenios retains the broader customer, partner, pricing, margin, payment, and business relationship."
          items={[
            "No unrelated customer history, affiliate attribution, private product interests, supplier comparisons, Xenios margin, or payment evidence.",
            "No assignment exists until the canonical operations authority creates it for an approved supplier account.",
            "Tracking, shipment, delivery, lot, COA, testing, and availability appear only from their authoritative source.",
            "Provider-governed prescription fulfillment remains with the licensed pharmacy and does not enter the Research supplier workflow.",
          ]}
        />
      </div>

      <div id="supplier-inquiry" className="container-x xr-b2b-section">
        <PartnershipInquiryForm
          initialPathway="supplier_lab_fulfillment"
          heading="Prepare supplier, laboratory, or fulfillment interest"
        />
      </div>
    </B2BPageFrame>
  );
}

import PartnershipInquiryForm from "./PartnershipInquiryForm";
import { B2BPageFrame, ReviewSteps, SectionHeading } from "./components";
import { B2B_PUBLIC_ROUTES } from "./pathways";

const supplierSteps = [
  { title: "Submit an inquiry", body: "Tell us about your organization, capabilities, region, and the relationship you are proposing." },
  { title: "We review", body: "We review the documentation, quality approach, and capacity you describe." },
  { title: "Invitation if there is a fit", body: "Supplier access is by invitation, after we review your documentation." },
] as const;

export default function SupplierPartnershipPage() {
  return (
    <B2BPageFrame
      title="Suppliers | Xenios"
      description="Submit a supplier, laboratory, distributor, diagnostics, or fulfilment inquiry for human review."
      path={B2B_PUBLIC_ROUTES.supplierAccess}
      eyebrow="Suppliers"
      heading="Supply or fulfil with Xenios"
      lead="For pharmacies, labs, manufacturers, distributors, diagnostic providers and fulfilment companies."
      actions={<a href="#supplier-inquiry" className="btn btn-primary">Submit Inquiry</a>}
    >
      <section className="container-x xr-b2b-section" aria-labelledby="supplier-process-heading">
        <SectionHeading
          id="supplier-process-heading"
          eyebrow="How it works"
          title="Inquiry, review, then invitation."
          body="An inquiry does not create supplier access, approve a relationship, or promise product, inventory, price, or timing."
        />
        <ReviewSteps steps={supplierSteps} />
      </section>

      <section className="container-x xr-b2b-section" aria-labelledby="supplier-access-heading">
        <SectionHeading id="supplier-access-heading" eyebrow="Access" title="Invitation only." />
        <p className="body-m text-ink-2 max-w-[70ch]">Supplier access is by invitation, after we review your documentation.</p>
      </section>

      <div id="supplier-inquiry" className="container-x xr-b2b-section">
        <PartnershipInquiryForm initialPathway="supplier_lab_fulfillment" heading="Submit a supplier inquiry" />
      </div>
    </B2BPageFrame>
  );
}

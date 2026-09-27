import { Link } from "wouter";
import PartnershipInquiryForm from "./PartnershipInquiryForm";
import { B2BPageFrame, SectionHeading } from "./components";
import { B2B_PUBLIC_ROUTES } from "./pathways";

const practiceModels = [
  {
    title: "Refer clients",
    body: "Share your practice's link or code after approval. Clients create their own accounts and place their own orders. Eligible orders are credited to your practice.",
  },
  {
    title: "Practice workspace",
    body: "Approved practices sign in to see referral counts, credited orders, commission entries, and payout information when the program is active.",
  },
  {
    title: "Care for your clients",
    body: "Clients can start Care themselves. Care stays separate from research-product ordering and from practice commission.",
  },
] as const;

export default function OrganizationAccessPage() {
  return (
    <B2BPageFrame
      title="For Practices | Xenios"
      description="Refer clients, understand practice reporting, and submit a practice inquiry without placing orders for clients."
      path={B2B_PUBLIC_ROUTES.organizations}
      eyebrow="For Practices"
      heading="For practices: refer clients, keep your relationships."
      lead="For clinics, providers, coaches, trainers, gyms, med spas, behavioral-health practices, retreats and wellness teams."
      actions={
        <>
          <a href="#organization-inquiry" className="btn btn-primary">Submit Inquiry</a>
          <Link href="/sign-in" className="btn btn-secondary">Sign In</Link>
        </>
      }
    >
      <section className="container-x xr-b2b-section" aria-labelledby="practice-models-heading">
        <SectionHeading id="practice-models-heading" eyebrow="How it works" title="Three clear ways to work with Xenios." />
        <div className="xr-b2b-grid">
          {practiceModels.map((model) => (
            <article key={model.title} className="xr-b2b-pathway-card">
              <h3 className="h3">{model.title}</h3>
              <p className="body-s text-ink-2 mt-3">{model.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x xr-b2b-section" aria-labelledby="practice-client-heading">
        <SectionHeading id="practice-client-heading" eyebrow="Client accounts" title="Your clients create and own their accounts." />
        <div className="xr-b2b-pathway-card">
          <p className="body-m text-ink-2">
            Clients create and own their own accounts. Your practice is recorded as the referring practice. If a client uses Care, the Care clinician makes the medical decisions, and the client decides what to share with the practice.
          </p>
          <p className="body-m text-ink-2 mt-4">
            A practice account doesn't place orders for clients, edit their accounts, or approve treatment. Each client accepts the research-use terms themselves.
          </p>
        </div>
      </section>

      <section className="container-x xr-b2b-section" aria-labelledby="practice-visibility-heading">
        <SectionHeading id="practice-visibility-heading" eyebrow="Practice workspace" title="Commercial visibility, with client privacy protected." />
        <div className="xr-b2b-grid">
          <article className="xr-b2b-pathway-card">
            <h3 className="h3">What approved practices may see</h3>
            <p className="body-s text-ink-2 mt-3">Referral counts, credited orders, commission entries, and payout information when the program is active.</p>
          </article>
          <article className="xr-b2b-pathway-card">
            <h3 className="h3">What stays private</h3>
            <p className="body-s text-ink-2 mt-3">Client names or client-level status need a future explicit consent mechanism. Care information is never shared without written authorization and the applicable legal authority.</p>
          </article>
        </div>
      </section>

      <section className="container-x xr-b2b-section" aria-labelledby="practice-commission-heading">
        <SectionHeading id="practice-commission-heading" eyebrow="Commission" title="Eligible research-product orders only." />
        <p className="body-m text-ink-2 max-w-[70ch]">Your practice earns commission on eligible research-product orders from clients you refer. Rates, holds, and payout timing are in your partner agreement. Care services never earn commission.</p>
        <p className="body-m text-ink-2 max-w-[70ch] mt-5"><strong>In-clinic inventory is under review.</strong> Mention it in your inquiry if you are interested.</p>
      </section>

      <div id="organization-inquiry" className="container-x xr-b2b-section">
        <PartnershipInquiryForm initialPathway="provider_practice" heading="Tell us about your practice" />
      </div>
    </B2BPageFrame>
  );
}

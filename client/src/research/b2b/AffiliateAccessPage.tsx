import { Link } from "wouter";
import PartnershipInquiryForm from "./PartnershipInquiryForm";
import { B2BPageFrame, BoundaryPanel, ReviewSteps, SectionHeading } from "./components";
import { B2B_PUBLIC_ROUTES } from "./pathways";

const AFFILIATE_STEPS = [
  {
    title: "Application",
    body: "A person or organization identifies its audience, channels, business identity, and intended way of introducing Xenios.",
  },
  {
    title: "Review and agreement",
    body: "Xenios reviews fit, disclosures, allowed claims, prohibited conduct, identity, and the current governed agreement.",
  },
  {
    title: "Approved resources",
    body: "Only approved links, codes, education, and brand materials may be used. Product or clinical claims are never improvised.",
  },
  {
    title: "Durable attribution",
    body: "Eligible activity is attributed through the canonical system. A browser value alone does not establish a conversion or commission.",
  },
  {
    title: "Ledger and payout status",
    body: "Commission, holds, reversals, statements, and payout status appear only when supported by durable authorized records.",
  },
] as const;

const ALLOWED = [
  "Explain what Xenios Research is using approved material",
  "Disclose the affiliate or partner relationship clearly",
  "Share an issued link or code without changing customer pricing",
  "Route questions, support needs, and Care interest to the correct Xenios pathway",
] as const;

const PROHIBITED = [
  "Medical, treatment, dosing, administration, body-transformation, or outcome claims",
  "Income promises, fabricated conversions, or public commission economics not authorized for publication",
  "Influencing provider judgment, prescribing, pharmacy decisions, or clinical eligibility",
  "Viewing unrelated customers, private product interests, supplier cost, Xenios margin, or payment evidence",
] as const;

const EXTERNAL_ADVISOR_BOUNDARIES = [
  {
    title: "Xenios customer account",
    body: "Customer-facing identity, access, support, and account history remain in Xenios. An advisor relationship never creates a duplicate customer portal.",
  },
  {
    title: "Internal source attribution",
    body: "An approved advisor or collective source may be recorded internally without exposing customer identity, private interests, or order detail to that source.",
  },
  {
    title: "Time-bounded relationship",
    body: "A 90-day external advisor relationship may operate through its approved organization while Xenios retains the customer relationship and data boundary.",
  },
  {
    title: "Migration and consent gate",
    body: "No contact import, customer invitation, or outreach begins until the migration dataset, consent basis, contact fields, and authorized sender are approved.",
  },
] as const;

export default function AffiliateAccessPage() {
  return (
    <B2BPageFrame
      title="Affiliate access | Xenios Research"
      description="A compliance-first affiliate pathway with reviewed applications, approved resources, durable attribution, and no influence over clinical decisions."
      path={B2B_PUBLIC_ROUTES.affiliates}
      eyebrow="Affiliates · collectives · referral partners"
      heading="Earn trust before earning attribution."
      lead="The Xenios affiliate pathway is built for educators, creators, practitioners, gyms, communities, and aligned organizations that can introduce the company accurately, disclose the relationship, and stay inside approved claims."
      actions={
        <>
          <Link href={B2B_PUBLIC_ROUTES.partnerApplication} className="btn btn-primary">
            Review the partner application
          </Link>
          <Link href={B2B_PUBLIC_ROUTES.partnerDashboard} className="btn btn-secondary">
            Existing affiliate access
          </Link>
        </>
      }
    >
      <section className="container-x xr-b2b-section" aria-labelledby="affiliate-lifecycle-heading">
        <SectionHeading
          id="affiliate-lifecycle-heading"
          eyebrow="Governed lifecycle"
          title="Application through payout, without invented economics."
          body="An affiliate relationship progresses only through durable review, agreement, activation, attribution, and ledger evidence. Public interest alone creates none of those states."
        />
        <ReviewSteps steps={AFFILIATE_STEPS} />
      </section>

      <section className="container-x xr-b2b-section" aria-labelledby="affiliate-conduct-heading">
        <SectionHeading
          id="affiliate-conduct-heading"
          eyebrow="Program conduct"
          title="Clear permission. Clear prohibitions."
          body="Approved partners introduce and educate. They do not diagnose, prescribe, set prices, approve products, or become a shadow sales authority."
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <article className="xr-b2b-pathway-card">
            <p className="mono-cap text-pulse">Allowed after approval</p>
            <h3 className="h3 mt-3">Share within the approved library.</h3>
            <ul className="xr-b2b-checklist body-s text-ink-2">
              {ALLOWED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article className="xr-b2b-pathway-card">
            <p className="mono-cap text-pulse">Never allowed</p>
            <h3 className="h3 mt-3">No claims, access, or influence by implication.</h3>
            <ul className="xr-b2b-checklist body-s text-ink-2">
              {PROHIBITED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <div className="container-x xr-b2b-section">
        <BoundaryPanel
          id="affiliate-privacy-heading"
          title="Attribution is not customer access."
          body="Partners may receive approved aggregate or partner-scoped reporting. The customer relationship and customer data remain with Xenios, and clinical information remains in the provider-governed system."
          items={[
            "No affiliate receives unrelated customer identity, health information, private product interests, or order detail.",
            "Commission status is shown only from the authoritative ledger, including holds and reversals where applicable.",
            "Rates, payment schedules, and program economics are not promised on this public page.",
            "No payment or benefit may reward prescribing, provider approval, or another clinical decision.",
          ]}
        />
      </div>

      <section className="container-x xr-b2b-section" aria-labelledby="external-advisor-heading">
        <SectionHeading
          id="external-advisor-heading"
          eyebrow="External advisor programs"
          title="Customer accounts stay with Xenios."
          body="Any named advisor or collective program must use an internal attribution and customer-handoff boundary. The public pathway does not activate a program, import a list, invite a customer, or disclose a source relationship."
        />
        <div className="xr-b2b-grid">
          {EXTERNAL_ADVISOR_BOUNDARIES.map((boundary) => (
            <article key={boundary.title} className="xr-b2b-pathway-card">
              <h3 className="h3">{boundary.title}</h3>
              <p className="body-s text-ink-2 mt-3">{boundary.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x xr-b2b-section" aria-labelledby="affiliate-start-heading">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] items-start">
          <div>
            <SectionHeading
              id="affiliate-start-heading"
              eyebrow="Start here"
              title="Use the governed application when you are ready."
              body="The existing partner application is member-scoped and may be unavailable until your account and the program are enabled. An unavailable state means nothing was submitted."
            />
            <div className="xr-b2b-card-actions">
              <Link href={B2B_PUBLIC_ROUTES.partnerApplication} className="btn btn-primary">
                Open partner application
              </Link>
              <Link href={B2B_PUBLIC_ROUTES.support} className="btn btn-secondary">
                Partner support
              </Link>
            </div>
          </div>
          <article className="xr-b2b-pathway-card">
            <p className="mono-label text-ink-mute">Before you apply</p>
            <h3 className="body-l font-700 mt-2">Bring an honest audience description.</h3>
            <p className="body-s text-ink-2 mt-3">
              Be ready to identify where you share, how you disclose commercial relationships, the subjects your audience
              expects from you, and how you will avoid medical and income claims.
            </p>
          </article>
        </div>
      </section>

      <div className="container-x xr-b2b-section">
        <PartnershipInquiryForm initialPathway="affiliate" heading="Prepare an affiliate or collective inquiry" />
      </div>
    </B2BPageFrame>
  );
}

import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { BusinessPageHero, CheckList, NumberedJourney, SectionLead } from "../business-components";

const ACTIVATION = [
  "Member account and in-depth onboarding",
  "AI-generated Whole-Life Blueprint draft",
  "Basic human quality review before delivery",
  "Research Guides and member education",
  "Eligible member access and pricing where appropriate",
  "Initial habits, questions, tracking, and professional prompts",
];

const PLUS = [
  "Quarterly Blueprint refreshes",
  "Monthly check-ins and progress workspace",
  "Expanded guides and member education",
  "Member pricing and early program access",
  "Live member sessions and priority support",
];

const REVIEW = [
  "A deeper review of the complete Blueprint",
  "Contradiction and constraint review",
  "More detailed next-step organization",
  "Professional-support routing when appropriate",
  "Separate scope, price, and reviewer assignment",
];

export default function MembershipCompare() {
  return (
    <>
      <SeoHead
        title="Compare membership options, xenios research"
        description="Compare the one-time xenios research activation with proposed Plus membership, Blueprint Review, and premium program pathways."
        path="/research/membership/compare"
      />
      <BusinessPageHero
        eyebrow="Membership options"
        title="Start with the Blueprint. Add support when it earns a place."
        lead="The $50 activation opens the member relationship and a scalable first Blueprint. Recurring support, deeper human review, and programs are separate choices, never hidden inside the application."
        primary={{ label: "Apply for Membership", href: "/research/apply" }}
        secondary={{ label: "How membership works", href: "/research/membership" }}
        aside={(
          <div>
            <p className="mono-cap text-ink-mute">The sequence</p>
            <p className="h3 mt-4">Application first. Payment only after approval.</p>
            <p className="body-s text-ink-2 mt-4">Proposed recurring and premium offers are shown for product review. They are not available for purchase yet.</p>
          </div>
        )}
      />

      <section className="container-x xr-section">
        <SectionLead eyebrow="Compare" title="One foundation, three levels of support." body="Current and planned offers are separated clearly so the member can understand what exists now and what is still being prepared." />
        <div className="xr-offer-grid">
          <article className="xr-offer-card is-featured">
            <div>
              <p className="mono-cap" style={{ color: "var(--lilac)" }}>Current contract</p>
              <h2 className="h3 mt-3">Research activation</h2>
            </div>
            <p className="xr-offer-price">$50</p>
            <p className="body-s" style={{ color: "rgba(255,255,255,.72)" }}>One time, only after approval. Payment setup is still being finalized.</p>
            <ul>{ACTIVATION.map((item) => <li key={item}>{item}</li>)}</ul>
            <Link href="/research/apply" className="btn btn-on-dark btn-primary">Apply free</Link>
          </article>
          <article className="xr-offer-card">
            <div>
              <p className="mono-cap text-pulse">Proposed test price</p>
              <h2 className="h3 mt-3">xenios Plus</h2>
            </div>
            <p className="xr-offer-price">$39<span className="body-s"> / month</span></p>
            <p className="body-s text-ink-mute">Proposed alternative: $390 annually. Not yet available for purchase.</p>
            <ul>{PLUS.map((item) => <li key={item}>{item}</li>)}</ul>
            <span className="btn btn-secondary" aria-disabled="true">Planned</span>
          </article>
          <article className="xr-offer-card">
            <div>
              <p className="mono-cap text-pulse">Proposed range</p>
              <h2 className="h3 mt-3">Human Blueprint Review</h2>
            </div>
            <p className="xr-offer-price">$199–$399</p>
            <p className="body-s text-ink-mute">One-time deeper review. Final scope and eligible reviewers remain under design.</p>
            <ul>{REVIEW.map((item) => <li key={item}>{item}</li>)}</ul>
            <span className="btn btn-secondary" aria-disabled="true">In development</span>
          </article>
        </div>
      </section>

      <section className="container-x xr-section">
        <div className="xr-two-column">
          <div>
            <SectionLead eyebrow="What $50 means" title="The door, not the whole business." body="Activation should recover a portion of onboarding cost, filter for intent, and begin a real member relationship without overpromising unlimited human labor." />
          </div>
          <div className="xr-surface xr-surface-muted"><CheckList items={ACTIVATION} /></div>
        </div>
      </section>

      <section className="container-x xr-section">
        <SectionLead eyebrow="Premium programs" title="Outcome-oriented support, sold separately." body="Potential $299 to $999 programs can organize education, accountability, and human-led work around a clear member goal. No program should be a disguised product bundle or medical-care claim." />
        <NumberedJourney steps={[
          { title: "Activate", body: "Complete approval, the $50 activation, and whole-life onboarding." },
          { title: "Understand", body: "Receive the initial Blueprint and see the highest-leverage priorities in context." },
          { title: "Choose", body: "Add Plus, a deeper review, or a program only when it fits the Blueprint." },
          { title: "Evolve", body: "Use progress, updated context, and member support to decide what comes next." },
        ]} />
      </section>
    </>
  );
}

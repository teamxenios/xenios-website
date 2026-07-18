import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { BusinessPageHero, CheckList, NumberedJourney, SectionLead } from "../business-components";

const DOMAINS = ["Goals and constraints", "Location and environment", "Schedule and available time", "Nutrition and food context", "Sleep and recovery", "Movement and training", "Stress and emotional context", "Relationships and support", "Work and purpose", "Financial constraints", "Available professionals", "Member preferences"];

export default function Blueprint() {
  return (
    <>
      <SeoHead title="Whole-Life Blueprint, xenios research" description="See how xenios organizes whole-life context into a structured draft, human quality review, and realistic next steps." path="/research/blueprint" />
      <BusinessPageHero
        eyebrow="Whole-Life Blueprint"
        title="A plan that begins with the life you actually have."
        lead="The Blueprint organizes goals, routines, constraints, environment, information, and trusted support into one coherent system. It is educational, evolves over time, and does not replace medical care."
        primary={{ label: "Apply for Membership", href: "/research/apply" }}
        secondary={{ label: "Explore the framework", href: "/research/framework" }}
        aside={<div><p className="mono-cap text-pulse">Included after activation</p><p className="h3 mt-4">Automated first pass. Basic human quality review.</p><p className="body-s text-ink-2 mt-4">A deeper human Blueprint Review is a separate proposed upgrade, not included manual consulting.</p></div>}
      />

      <section className="container-x xr-section">
        <div className="xr-two-column">
          <div><SectionLead eyebrow="The input" title="Context before recommendations." body="A plan is only useful when it respects time, location, constraints, preferences, resources, and the support already around the member." /></div>
          <div className="xr-surface xr-surface-muted"><CheckList items={DOMAINS} /></div>
        </div>
      </section>

      <section className="container-x xr-section">
        <SectionLead eyebrow="The operating model" title="Automation creates structure. A person checks the work." />
        <NumberedJourney steps={[
          { title: "Organize", body: "The system structures goals, constraints, routines, environment, and available support." },
          { title: "Draft", body: "An AI-assisted first pass identifies interactions, priorities, realistic questions, and possible next steps." },
          { title: "Quality review", body: "A reviewer checks completeness, contradictions, safety language, claims, realism, and professional-support boundaries." },
          { title: "Deliver", body: "The member receives an educational Blueprint, not a diagnosis, prescription, or guaranteed outcome." },
          { title: "Evolve", body: "Updates can reflect new goals, life changes, progress, and support, with deeper review available separately." },
        ]} />
      </section>

      <section className="container-x xr-section">
        <div className="xr-two-column">
          <article className="xr-surface"><p className="mono-cap text-pulse">Included</p><h2 className="h3 mt-4">Basic quality review.</h2><p className="body-m text-ink-2 mt-5">The reviewer should not rewrite the entire document. The goal is to catch contradictions, inappropriate claims, unrealistic steps, and situations that need professional support.</p></article>
          <article className="xr-surface xr-surface-dark"><p className="mono-cap" style={{ color: "var(--lilac)" }}>Proposed upgrade</p><h2 className="h3 mt-4">Human Blueprint Review · $199–$399</h2><p className="body-m mt-5" style={{ color: "rgba(255,255,255,.74)" }}>A separately scoped deeper review by an appropriate xenios team member or qualified professional. Final scope and reviewer eligibility remain under design.</p></article>
        </div>
        <div className="xr-hero-actions"><Link href="/research/apply" className="btn btn-primary">Apply for Membership</Link><Link href="/research/membership/compare" className="btn btn-secondary">Compare options</Link></div>
      </section>
    </>
  );
}

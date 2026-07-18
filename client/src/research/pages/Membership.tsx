import { Link } from "wouter";
import { ArrowRight, Check } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";
import { SectionLead } from "../business-components";

const MEMBERSHIP_INCLUDES = [
  "A reviewed membership application",
  "A secure member profile",
  "An in-depth whole-life onboarding",
  "A personalized Whole-Life Blueprint",
  "A basic human quality review before delivery",
  "Access to the xenios member library",
  "Evidence and quality resources",
  "Member-only research catalog visibility where permitted",
  "Member pricing where available",
  "Referral program access when the credit ledger launches",
  "Initial habits, tracking, questions, and professional-support prompts",
];

const WHO_SHOULD_APPLY = [
  "People looking for a whole-life framework rather than another isolated product",
  "Athletes and high performers who need a plan that fits their real schedule",
  "People focused on recovery, body composition, sleep, energy, or longevity education",
  "Professionals who want a more organized way to understand research products and quality documentation",
  "People willing to complete a thoughtful onboarding and use xenios as an evolving system",
];

const FAQ_PREVIEW = [
  "Is the application free?",
  "When am I charged?",
  "Is the $50 fee recurring?",
  "How long does review take?",
  "What information is required?",
  "Is xenios medical care?",
  "Can I update my Blueprint?",
  "What happens if I am declined?",
];

export default function Membership() {
  return (
    <>
      <SeoHead
        title="Membership, xenios research"
        description="A private membership for people ready to take a more complete view of their health, performance, recovery, environment, and daily life."
        path="/research/membership"
      />

      <PageIntro
        eyebrow="Private membership"
        title="Access begins with context."
        lead="xenios research is designed for people who are ready to take a more complete view of their health, performance, recovery, environment, and daily life."
      />

      <section className="container-x" style={{ paddingTop: 8, paddingBottom: 24 }}>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/research/apply" className="btn btn-primary">Apply for Membership</Link>
          <Link href="/research/membership/compare" className="btn btn-ghost">Compare options</Link>
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-5">Membership includes</p>
        <h2 className="display-s max-w-[22ch]">What opens with your membership.</h2>
        <ul className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4">
          {MEMBERSHIP_INCLUDES.map((item) => (
            <li key={item} className="flex gap-3 items-start" style={{ minWidth: 0 }}>
              <Check size={16} aria-hidden="true" className="text-pulse shrink-0 mt-1" />
              <span className="body-m text-ink-2">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-x section-y rule-top">
        <div className="card bg-paper-2 grid grid-cols-1 lg:grid-cols-2 gap-10 items-start" style={{ padding: "clamp(28px, 5vw, 56px)" }}>
          <div style={{ minWidth: 0 }}>
            <p className="mono-cap text-ink-mute mb-4">The fee</p>
            <h2 className="display-s max-w-[14ch]">$50 after approval.</h2>
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="body-l text-ink-2">
              There is no fee to apply. Approved applicants pay a one-time $50 activation fee to open their membership and begin the in-depth onboarding.
            </p>
            <p className="mt-5 body-s text-ink-mute">
              The $50 activation is not xenios Plus and does not include unlimited human consulting, recurring Blueprint reviews, or a premium program. Those are separate proposed options with separate prices and scope.
            </p>
            <p className="mt-6 body-s text-ink-mute">
              Membership does not guarantee access to every product, service, or professional pathway. Eligibility may depend on location, product category, documentation, and applicable requirements.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link href="/research/apply" className="btn btn-primary">Apply for Membership</Link>
              <Link href="/research/membership/compare" className="btn btn-secondary">Compare options</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container-x xr-section">
        <SectionLead eyebrow="What can follow" title="Recurring support and deeper review are optional." body="xenios is testing a $39 monthly or $390 annual Plus membership, a $199 to $399 Human Blueprint Review, and $299 to $999 premium programs. These are proposed offers, not live checkout." />
        <div className="xr-three-column">
          <article className="xr-surface"><p className="mono-cap text-pulse">Proposed</p><h3 className="h3 mt-4">xenios Plus</h3><p className="body-s text-ink-2 mt-4">Quarterly Blueprint refreshes, monthly check-ins, progress tools, expanded guides, member sessions, and priority support.</p></article>
          <article className="xr-surface"><p className="mono-cap text-pulse">Proposed</p><h3 className="h3 mt-4">Human Blueprint Review</h3><p className="body-s text-ink-2 mt-4">A separately scoped deeper review by an appropriate team member or qualified professional.</p></article>
          <article className="xr-surface"><p className="mono-cap text-pulse">Proposed</p><h3 className="h3 mt-4">Premium programs</h3><p className="body-s text-ink-2 mt-4">Human-led education and accountability around a clear member objective, separate from product sales and medical care.</p></article>
        </div>
        <Link href="/research/membership/compare" className="btn btn-secondary mt-8">See the complete comparison</Link>
      </section>

      <section className="container-x section-y rule-top">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div style={{ minWidth: 0 }}>
            <p className="mono-cap text-ink-mute mb-5">Who should apply</p>
            <h2 className="display-s max-w-[18ch]">Built for a certain kind of person.</h2>
            <ul className="mt-8 space-y-4">
              {WHO_SHOULD_APPLY.map((item) => (
                <li key={item} className="flex gap-3 items-start" style={{ minWidth: 0 }}>
                  <span aria-hidden="true" className="bg-orange-fire shrink-0 mt-2" style={{ width: 6, height: 6, borderRadius: 9999 }} />
                  <span className="body-m text-ink-2">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <aside className="card" style={{ minWidth: 0 }}>
            <p className="mono-cap text-ink-mute mb-3">Who should not apply</p>
            <p className="body-m text-ink-2">
              xenios research is not designed for anyone seeking an instant prescription, guaranteed outcome, emergency medical support, or a way to bypass a licensed professional.
            </p>
          </aside>
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <p className="mono-cap text-ink-mute mb-5">Common questions</p>
            <h2 className="display-s max-w-[18ch]">Before you apply.</h2>
          </div>
          <Link href="/research/faq" className="btn btn-secondary">Read the full FAQ</Link>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FAQ_PREVIEW.map((question) => (
            <li key={question} style={{ minWidth: 0 }}>
              <Link
                href="/research/faq"
                className="card flex items-center justify-between gap-4 hover:border-[color:var(--ink)] transition-colors"
                style={{ padding: "18px 22px" }}
              >
                <span className="body-m text-ink-2">{question}</span>
                <ArrowRight size={16} aria-hidden="true" className="text-ink-mute shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-x section-y rule-top">
        <div className="card bg-paper-2 flex flex-col md:flex-row md:items-center md:justify-between gap-8" style={{ padding: "clamp(28px, 5vw, 56px)" }}>
          <div style={{ minWidth: 0 }}>
            <p className="mono-cap text-ink-mute mb-4">Ready when you are</p>
            <h2 className="display-s max-w-[16ch]">Start with the application.</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 shrink-0">
            <Link href="/research/apply" className="btn btn-primary">Apply for Membership</Link>
            <Link href="/research/trust" className="btn btn-ghost">Trust center</Link>
          </div>
        </div>
      </section>
    </>
  );
}

import { Link } from "wouter";
import { ArrowRight, Check } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

const MEMBERSHIP_INCLUDES = [
  "A reviewed membership application",
  "A secure member profile",
  "An in-depth whole-life onboarding",
  "A personalized Whole-Life Blueprint",
  "Access to the xenios member library",
  "Evidence and quality resources",
  "Member-only research catalog visibility where permitted",
  "Ongoing Blueprint updates",
  "Priority support",
  "Early access to future xenios programs and professional pathways",
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
  "What does membership cost?",
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
          <Link href="/research/framework" className="btn btn-ghost">Explore the framework</Link>
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
            <p className="mono-cap text-ink-mute mb-4">The cost</p>
            <h2 className="display-s max-w-[18ch]">One Founding Membership. $50 due at activation.</h2>
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="body-l text-ink-2">
              There is no fee to apply. Approved applicants pay $50 at activation, which includes the activation and the first 30 days of membership. After that, membership is $25 for each additional 30-day period; the first renewal date is calculated when the activation payment is verified. There is no annual plan, and you can stop at any time.
            </p>
            <p className="mt-6 body-s text-ink-mute">
              Membership does not guarantee access to every product, service, or professional pathway. Eligibility may depend on location, product category, documentation, and applicable requirements.
            </p>
            <Link href="/research/apply" className="btn btn-primary mt-8">Apply for Membership</Link>
          </div>
        </div>
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
            <Link href="/research/quality" className="btn btn-ghost">Quality standards</Link>
          </div>
        </div>
      </section>
    </>
  );
}

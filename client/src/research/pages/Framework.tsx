import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";

// The whole-life framework page. Copy follows the membership spec (section 27,
// extended from the framework material in section 7). The system map is fully
// readable without hover: every domain shows its description inline.

const DOMAINS: { name: string; note?: string; body: string }[] = [
  { name: "Physical", body: "Movement, strength, and the capacity to do what your life actually asks of you." },
  { name: "Nutritional", body: "What you eat, how consistently, and whether it supports the goals you have set." },
  { name: "Recovery", body: "Sleep, rest, and the downtime that lets any of the other work take hold." },
  { name: "Emotional", body: "Resilience, stress, and how you respond when a week does not go to plan." },
  { name: "Social", body: "The relationships that hold you up, and the ones that quietly wear you down." },
  { name: "Environmental", body: "The spaces you live and work in, and how they shape your defaults." },
  { name: "Occupational", body: "Work as a source of structure, meaning, and pressure, all at once." },
  { name: "Financial", body: "The resources and constraints that decide which plans are realistic." },
  { name: "Intellectual", body: "Learning, curiosity, and keeping your thinking sharp over time." },
  { name: "Purpose and Spirituality", note: "Optional", body: "The larger why behind the plan, for members who want it included." },
  { name: "Professional Support", body: "The clinicians and specialists a serious plan should route to when it matters." },
  { name: "Research Literacy", body: "Reading evidence honestly, including what it does and does not show." },
];

const BLUEPRINT_STEPS: { title: string; body: string }[] = [
  {
    title: "Application and human review",
    body: "You apply for membership, and a person at xenios reviews the application. The outcome is an approval, a request for more information, or a decline.",
  },
  {
    title: "Activation",
    body: "Approved applicants pay the $50 activation, which includes the first 30 days of membership, and the member account is activated once the payment is verified.",
  },
  {
    title: "Whole-life onboarding",
    body: "You complete an in-depth onboarding that walks through the domains above, so the plan starts from your actual life, not a template.",
  },
  {
    title: "A draft Whole-Life Blueprint",
    body: "xenios generates a draft Blueprint from that picture: the highest-leverage priorities, the interactions between them, and a plan you can sustain.",
  },
  {
    title: "Human review and approval",
    body: "A person reviews the draft before it reaches you. Nothing ships on autopilot.",
  },
  {
    title: "The Blueprint, and what follows",
    body: "You receive the Blueprint, resources, education, and eligible member access, with ongoing updates, check-ins, and future professional pathways.",
  },
];

export default function Framework() {
  return (
    <>
      <SeoHead
        title="The whole-life framework, xenios research"
        description="Physical health matters. So do emotional resilience, relationships, environment, work, finances, learning, and purpose. One system, seen together."
        path="/research/framework"
      />

      <section className="container-x" style={{ paddingTop: 64, paddingBottom: 24 }}>
        <p className="mono-cap text-pulse mb-5">How xenios thinks</p>
        <h1 className="display-m text-balance max-w-[20ch]">A better life is built across systems.</h1>
        <p className="mt-6 body-l text-ink-2 max-w-[62ch]">
          Physical health matters. So do emotional resilience, relationships, environment, work, finances, learning, and purpose. xenios helps members see the interactions, choose the right priorities, and build a plan they can sustain.
        </p>
      </section>

      <section className="container-x section-y rule-top" aria-labelledby="system-map-heading">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div style={{ minWidth: 0 }}>
            <p className="mono-cap text-ink-mute mb-5">The system map</p>
            <h2 id="system-map-heading" className="display-s max-w-[20ch]">Twelve domains, one system.</h2>
          </div>
          <p className="body-m text-ink-mute max-w-[46ch]" style={{ minWidth: 0 }}>
            No domain stands alone. Poor sleep shows up in training. Financial stress shows up in food choices. The map exists so the interactions stay visible.
          </p>
        </div>
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {DOMAINS.map((domain, index) => (
            <li key={domain.name} className="card" style={{ minWidth: 0 }}>
              <div className="flex items-start justify-between gap-3">
                <p className="mono-label text-pulse">{String(index + 1).padStart(2, "0")}</p>
                {domain.note && <p className="mono-label text-ink-mute">{domain.note}</p>}
              </div>
              <h3 className="h3 mt-4 mb-2">{domain.name}</h3>
              <p className="body-s text-ink-2">{domain.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 card bg-paper-2" style={{ minWidth: 0 }}>
          <p className="body-l text-ink-2 max-w-[62ch]">
            The goal is not perfection in every category. The goal is to understand how the categories affect one another, choose the highest-leverage changes, and build a life that can actually sustain them.
          </p>
        </div>
      </section>

      <section className="container-x section-y rule-top" aria-labelledby="blueprint-heading">
        <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-12 items-start">
          <div style={{ minWidth: 0 }}>
            <p className="mono-cap text-ink-mute mb-5">From framework to plan</p>
            <h2 id="blueprint-heading" className="display-s max-w-[18ch]">How the framework becomes your Whole-Life Blueprint.</h2>
            <p className="mt-6 body-m text-ink-2 max-w-[52ch]">
              The framework is not an assessment you take once and forget. It is the structure behind membership itself: what the onboarding asks about, what the Blueprint prioritizes, and what the check-ins return to.
            </p>
          </div>
          <ol className="space-y-6" style={{ listStyle: "none", margin: 0, padding: 0, minWidth: 0 }}>
            {BLUEPRINT_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-5 rule-top pt-6" style={{ minWidth: 0 }}>
                <p className="mono-label text-pulse shrink-0" style={{ width: 28 }}>{String(index + 1).padStart(2, "0")}</p>
                <div style={{ minWidth: 0 }}>
                  <h3 className="h3 mb-2">{step.title}</h3>
                  <p className="body-s text-ink-2">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <div className="card bg-paper-2 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center" style={{ padding: "clamp(28px, 5vw, 56px)" }}>
          <div style={{ minWidth: 0 }}>
            <p className="mono-cap text-ink-mute mb-4">A serious system, not a storefront</p>
            <h2 className="display-s max-w-[18ch]">Build around the whole person.</h2>
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="body-l text-ink-2">
              Membership begins with an application and a human review. If the framework describes the kind of structure you want around your life, start there.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link href="/research/apply" className="btn btn-primary">Apply for Membership</Link>
              <Link href="/research/membership" className="btn btn-secondary">How membership works</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

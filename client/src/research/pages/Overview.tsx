import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { useResearch } from "../core";
import { ProductCard } from "../components";

// xenios research: the membership-first public home page.

const DOMAINS = [
  "Movement",
  "Nutrition",
  "Sleep and Recovery",
  "Emotional Wellbeing",
  "Social Connection",
  "Environment",
  "Work and Purpose",
  "Financial Context",
  "Learning",
  "Professional Support",
  "Research Education",
];

const STEPS = [
  {
    number: "01",
    title: "Apply",
    body: "Tell us who you are, what you are working toward, and why xenios feels relevant.",
  },
  {
    number: "02",
    title: "Review",
    body: "Every application is reviewed by xenios. We may approve it, request more information, or decline it.",
  },
  {
    number: "03",
    title: "Activate",
    body: "Approved applicants activate membership: $50 one-time activation plus $25 monthly. No payment is collected before approval.",
  },
  {
    number: "04",
    title: "Go Deeper",
    body: "Complete a structured whole-life onboarding built around your actual life, location, schedule, resources, and priorities.",
  },
  {
    number: "05",
    title: "Receive Your Blueprint",
    body: "xenios turns your information into a clear Whole-Life Blueprint, then reviews it before delivery.",
  },
  {
    number: "06",
    title: "Evolve",
    body: "Update the Blueprint as your life, goals, and available resources change.",
  },
];

const RESEARCH_LINKS = [
  { label: "Evidence", href: "/research/quality" },
  { label: "Quality", href: "/research/quality" },
  { label: "Peptides", href: "/research/peptides" },
  { label: "Quantum", href: "/research/quantum" },
  { label: "Supplements", href: "/research/supplements" },
];

const ECOSYSTEM = [
  {
    title: "Peptides",
    href: "/research/peptides",
    body: "Technical product information, quality documentation, and evidence mapping.",
  },
  {
    title: "Quantum",
    href: "/research/quantum",
    body: "A placental-derived research and professional education category whose claims and access must follow verified documentation and the appropriate professional pathway.",
  },
  {
    title: "Supplements",
    href: "/research/supplements",
    body: "Foundational consumer products presented with transparent ingredients, intended use, and evidence-aware language.",
  },
  {
    title: "Programs",
    href: "/research/programs",
    body: "Structured lifestyle, performance, recovery, and education programs built around the whole person.",
  },
];

export default function Overview() {
  const { products } = useResearch();
  const featured = products.filter((product) => product.featured).slice(0, 6);

  return (
    <>
      <SeoHead
        title="xenios research"
        description="A private membership for people who want a more rigorous, whole-life approach to performance, recovery, longevity, and everyday wellbeing."
        path="/research"
      />

      {/* Hero */}
      <section className="container-x" style={{ paddingTop: 72, paddingBottom: 56 }}>
        <div className="max-w-[820px]">
          <p className="mono-cap text-pulse mb-6">xenios research</p>
          <h1 className="display-l text-balance max-w-[18ch]">
            Your health is not a stack. It is a system.
          </h1>
          <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
            xenios research is a private membership for people who want a more rigorous, whole-life approach to performance, recovery, longevity, and everyday wellbeing.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <Link href="/research/apply" className="btn btn-primary">Apply for Membership</Link>
            <Link href="/research/framework" className="btn btn-ghost">Explore the Framework</Link>
          </div>
          <p className="mt-6 mono-label text-ink-mute">
            Applications are reviewed individually. No payment is required to apply.
          </p>
        </div>
      </section>

      {/* Start with context */}
      <section className="container-x section-y rule-top">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div style={{ minWidth: 0 }}>
            <p className="mono-cap text-ink-mute mb-5">Start with context</p>
            <h2 className="display-s max-w-[20ch]">Before products, we learn how you live.</h2>
            <p className="mt-6 body-l text-ink-2 max-w-[58ch]">
              Your schedule, environment, sleep, work, relationships, training, nutrition, resources, and goals all shape what is realistic. xenios begins with the full picture, then helps organize the next steps into one coherent plan.
            </p>
          </div>
          <div className="card bg-paper-2" style={{ minWidth: 0, padding: "clamp(24px, 4vw, 40px)" }}>
            <p className="mono-cap text-ink-mute mb-6">One life, one system</p>
            <ol className="space-y-0">
              {["Context", "Priorities", "Plan", "Evolution"].map((stage, index) => (
                <li key={stage} className="rule-top py-4 flex items-baseline gap-5">
                  <span className="mono-label text-pulse tabular">0{index + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <p className="h3">{stage}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 body-s text-ink-mute">
              Every recommendation sits inside the full picture of your life, never apart from it.
            </p>
          </div>
        </div>
      </section>

      {/* The whole-life framework */}
      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-5">The whole-life framework</p>
        <h2 className="display-s max-w-[22ch]">Eleven domains, one coherent life.</h2>
        <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4" style={{ gap: 1, background: "var(--rule)", border: "1px solid var(--rule)" }}>
          {DOMAINS.map((domain, index) => (
            <div key={domain} className="bg-paper-2" style={{ minWidth: 0, padding: "clamp(16px, 2.5vw, 28px)" }}>
              <p className="mono-label text-ink-mute tabular">{String(index + 1).padStart(2, "0")}</p>
              <p className="body-m mt-3 font-700">{domain}</p>
            </div>
          ))}
          <div className="bg-paper-2 flex items-end" style={{ minWidth: 0, padding: "clamp(16px, 2.5vw, 28px)" }}>
            <Link href="/research/framework" className="body-m text-pulse inline-flex items-center gap-2 hover:opacity-80 transition-opacity">
              The full framework
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <p className="mt-8 body-l text-ink-2 max-w-[62ch]">
          The goal is not perfection in every category. The goal is to understand how the categories affect one another, choose the highest-leverage changes, and build a life that can actually sustain them.
        </p>
      </section>

      {/* How membership works */}
      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-5">How membership works</p>
        <h2 className="display-s max-w-[20ch]">Six steps, reviewed by a person.</h2>
        <ol className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {STEPS.map((step) => (
            <li key={step.number} className="card flex flex-col" style={{ minWidth: 0 }}>
              <p className="mono-cap text-pulse tabular">{step.number}</p>
              <h3 className="h3 mt-4 mb-3">{step.title}</h3>
              <p className="body-s text-ink-2">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <Link href="/research/apply" className="btn btn-primary">Apply for Membership</Link>
          <Link href="/research/membership" className="btn btn-secondary">About the membership</Link>
        </div>
      </section>

      {/* Research, without the hype */}
      <section className="container-x section-y rule-top">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 items-start">
          <div style={{ minWidth: 0 }}>
            <p className="mono-cap text-ink-mute mb-5">Research, without the hype</p>
            <h2 className="display-s max-w-[22ch]">Separate what is known from what is being explored.</h2>
            <p className="mt-6 body-l text-ink-2 max-w-[58ch]">
              xenios organizes product identity, quality documents, evidence, limitations, and open questions in one place. We do not treat early research, manufacturer statements, and established human evidence as if they are the same thing.
            </p>
          </div>
          <nav aria-label="Research standards" style={{ minWidth: 0 }}>
            <ul>
              {RESEARCH_LINKS.map((link) => (
                <li key={link.label} className="rule-top">
                  <Link
                    href={link.href}
                    className="flex items-center justify-between gap-4 py-4 group hover:text-pulse transition-colors"
                    data-testid={`link-research-${link.label.toLowerCase()}`}
                  >
                    <span className="h3">{link.label}</span>
                    <ArrowUpRight size={18} aria-hidden="true" className="text-ink-mute group-hover:text-pulse transition-colors shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* Product ecosystem */}
      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-5">Product ecosystem</p>
        <h2 className="display-s max-w-[20ch]">Four categories, one standard.</h2>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          {ECOSYSTEM.map((panel) => (
            <Link
              key={panel.href}
              href={panel.href}
              className="card block hover:border-[color:var(--ink)] transition-colors"
              style={{ minWidth: 0 }}
              data-testid={`panel-ecosystem-${panel.title.toLowerCase()}`}
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="h3">{panel.title}</h3>
                <ArrowUpRight size={18} aria-hidden="true" className="text-ink-mute shrink-0 mt-1" />
              </div>
              <p className="mt-4 body-s text-ink-2">{panel.body}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products (commerce never leads; it sits after the ecosystem) */}
      {featured.length > 0 && (
        <section className="container-x section-y rule-top">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
            <div>
              <p className="mono-cap text-ink-mute mb-5">Featured</p>
              <h2 className="display-s max-w-[20ch]">A closer look at the catalog.</h2>
            </div>
            <Link href="/research/shop" className="btn btn-secondary">View all</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featured.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* Closing CTA */}
      <section className="container-x section-y rule-top">
        <div className="card bg-paper-2 text-center" style={{ padding: "clamp(40px, 7vw, 88px)" }}>
          <h2 className="display-m text-balance max-w-[18ch] mx-auto">Build the plan before you build the stack.</h2>
          <p className="mt-6 body-l text-ink-2 max-w-[52ch] mx-auto">
            Apply to join xenios research and begin with the context that most health experiences leave out.
          </p>
          <div className="mt-10 flex justify-center">
            <Link href="/research/apply" className="btn btn-primary">Apply for Membership</Link>
          </div>
        </div>
      </section>
    </>
  );
}

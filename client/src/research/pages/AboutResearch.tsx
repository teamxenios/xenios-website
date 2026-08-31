import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";
import { PublicBoundaryNote } from "./PublicEditorialNav";

const operatingPrinciples = [
  {
    title: "Clinical independence",
    body: "A commercial goal never determines diagnosis, treatment, prescribing, or clinical follow-up.",
  },
  {
    title: "Research exactness",
    body: "A product, exact variant, strength, format, lot, evidence level, and document state remain distinct.",
  },
  {
    title: "Accountable handoffs",
    body: "Intake, provider review, prescription, pharmacy processing, Research requests, orders, payment, fulfillment, tracking, and support remain connected without pretending one proves another.",
  },
] as const;

const platformLayers = [
  ["Discover", "Understand Care, Research, the product or formulation, the evidence boundary, and the next available step."],
  ["Complete", "Create or access the right account, complete the Care intake or Research requirements, and provide only the information that pathway needs."],
  ["Review", "Licensed clinicians make clinical decisions. Research actions remain governed by exact product, documentation, availability, and access controls."],
  ["Follow", "Use source-aware status, pharmacy or fulfillment updates, documents, lifestyle support, and customer service over time."],
] as const;

export default function AboutResearch() {
  return (
    <>
      <SeoHead
        title="About Xenios | Care + Research"
        description="Learn how Xenios combines provider-guided Care, evidence-led Research access, quality documentation, and accountable operations without blending clinical and nonclinical authority."
        path="/research/about"
      />
      <ResearchPublicShell
        eyebrow="About Xenios"
        title="One platform. Two accountable pathways."
        lead="Xenios supports personal health through provider-guided Care and legitimate nonclinical work through Xenios Research. The platform connects account access, education, product and formulation context, status, quality documentation, fulfillment, lifestyle support, and customer service while preserving the authority of clinicians, pharmacies, Research controls, and exact source records."
      >
        <section className="mt-8" aria-labelledby="about-purpose">
          <p className="mono-label text-ink-mute">Why it exists</p>
          <h2 id="about-purpose" className="display-s mt-2">Clarity across the full relationship.</h2>
          <div className="grid gap-4 mt-6 public-editorial-grid">
            {platformLayers.map(([title, body]) => (
              <article className="card" key={title}>
                <h3 className="body-l font-700">{title}</h3>
                <p className="body-s text-ink-2 mt-3">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="about-principles">
          <p className="mono-label text-ink-mute">Operating principles</p>
          <h2 id="about-principles" className="display-s mt-2">Trust is built in the details.</h2>
          <div className="grid gap-4 mt-6">
            {operatingPrinciples.map((principle, index) => (
              <article className="card" key={principle.title}>
                <p className="mono-label text-ink-mute">0{index + 1}</p>
                <h3 className="body-l font-700 mt-2">{principle.title}</h3>
                <p className="body-s text-ink-2 mt-3 max-w-[68ch]">{principle.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="card mt-10" aria-labelledby="about-stage">
          <p className="mono-label text-ink-mute">Current stage</p>
          <h2 id="about-stage" className="body-l font-700 mt-2">Active Care alongside evidence-led Research.</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[68ch]">
            Xenios is operating an active Care pathway alongside its Research platform. Availability still depends on
            current clinician authority, patient location, pharmacy serviceability, exact product or formulation status,
            quality records, and source-authoritative configuration. The website must show those differences clearly
            rather than turning broad access into a guarantee.
          </p>
        </section>

        <div className="mt-10">
          <PublicBoundaryNote />
        </div>

        <section className="card mt-10" aria-labelledby="about-next">
          <p className="mono-label text-ink-mute">Your next step</p>
          <h2 id="about-next" className="body-l font-700 mt-2">Choose the pathway that fits.</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[64ch]">
            Personal health begins with Care. Legitimate nonclinical work begins with Research.
          </p>
          <div className="mt-5 public-editorial-actions">
            <Link href="/care" className="btn btn-primary public-editorial-action">Begin clinical intake</Link>
            <Link href="/research/access-hub" className="btn btn-secondary public-editorial-action">Explore Research</Link>
          </div>
        </section>
      </ResearchPublicShell>
    </>
  );
}

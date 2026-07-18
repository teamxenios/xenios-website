import { Link } from "wouter";
import { FlaskConical, FileText, ShieldCheck } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// xenios research: Learn. Ported from the research site. Evidence-first
// education that keeps human, animal, preclinical, regulatory, and unresolved
// evidence in separate lanes.

const ARTICLES = [
  {
    title: "What a peptide is, and what it is not",
    body: "A practical taxonomy for peptides, approved peptide drugs, research compounds, small molecules, cofactors, and cosmetics.",
  },
  {
    title: "FDA approval is product-specific",
    body: "Why approval for one formulation, indication, route, sponsor, and manufacturing process does not transfer to another vial.",
  },
  {
    title: "Category 1 is not approval",
    body: "How nomination, evaluation, PCAC review, compounding policy, and drug approval differ.",
  },
  {
    title: "Purity is not sterility",
    body: "Why identity, purity, assay, sterility, endotoxin, stability, and chain of custody answer different questions.",
  },
  {
    title: "How to read a COA",
    body: "What to look for in the sample, method, lot, result, laboratory, accreditation, and original report.",
  },
  {
    title: "Research and consumer products stay separate",
    body: "Why supplements and programs have their own value, checkout, claims, and customer journey.",
  },
];

const EVIDENCE_CLASSES = [
  {
    icon: FlaskConical,
    label: "Human evidence",
    body: "Findings from studies in people. We note the setting, population, and how far the evidence reaches, and we never generalize a single result into a claim.",
  },
  {
    icon: FlaskConical,
    label: "Animal evidence",
    body: "Findings from animal models. Useful context, but distinct from human evidence and never presented as a substitute for it.",
  },
  {
    icon: FlaskConical,
    label: "Preclinical research",
    body: "Laboratory and mechanistic work that precedes clinical study. It describes what has been observed in a controlled setting, not an outcome in a person.",
  },
  {
    icon: ShieldCheck,
    label: "Regulatory status",
    body: "What a regulator has and has not done. Approval is product-specific, and nomination or review is not approval. We keep these distinctions exact.",
  },
  {
    icon: FileText,
    label: "Unresolved questions",
    body: "What is still open. When the evidence is thin, absent, or conflicting, we say so plainly rather than filling the gap with a claim.",
  },
];

export default function Learn() {
  return (
    <>
      <SeoHead
        title="Learn, xenios research"
        description="Evidence-first education that keeps human, animal, preclinical, regulatory, and unresolved evidence in separate lanes, without flattening science into hype."
        path="/research/learn"
      />
      <PageIntro
        eyebrow="Peptide intelligence"
        title="Understand the category before choosing a path."
        lead="The strongest customer experience makes complicated distinctions clear without flattening science into hype."
      />

      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-5">How we classify evidence</p>
        <h2 className="display-s max-w-[22ch]">Five kinds of evidence, kept apart.</h2>
        <p className="mt-6 body-m text-ink-mute max-w-[58ch]">
          Every profile separates what has been shown in people, what has been shown in animals, what sits at the
          preclinical stage, what a regulator has actually done, and what remains unknown. Keeping these lanes distinct is
          the point.
        </p>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {EVIDENCE_CLASSES.map(({ icon: Icon, label, body }) => (
            <div className="card" key={label}>
              <Icon size={22} aria-hidden="true" className="text-pulse" />
              <h3 className="h3 mt-5 mb-3">{label}</h3>
              <p className="body-s text-ink-2">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <p className="mono-cap text-ink-mute mb-5">Guides</p>
            <h2 className="display-s max-w-[20ch]">The distinctions worth learning.</h2>
          </div>
          <p className="body-m text-ink-mute max-w-[46ch]">
            Short, plain-English explainers that separate what is known, what is early, and what is unresolved.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ARTICLES.map((article, index) => (
            <article className="card flex flex-col gap-4" key={article.title}>
              <p className="mono-cap text-pulse">Guide {String(index + 1).padStart(2, "0")}</p>
              <h3 className="h3">{article.title}</h3>
              <p className="body-s text-ink-2">{article.body}</p>
              <div className="mt-auto pt-2">
                <Link href="/research/access" className="btn btn-ghost" style={{ fontSize: 13 }}>
                  Join for updates
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <div
          className="card bg-paper-2 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center"
          style={{ padding: "clamp(28px, 5vw, 56px)" }}
        >
          <div>
            <p className="mono-cap text-ink-mute mb-4">Before you choose a path</p>
            <h2 className="display-s max-w-[18ch]">Clear distinctions, no hype.</h2>
          </div>
          <div>
            <p className="body-l text-ink-2">
              Research materials are never for human or veterinary use. No dosing, injection, reconstitution, cycling,
              stacking, treatment, or personal-use guidance is provided. Programs are human-led and non-clinical.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link href="/research/peptides" className="btn btn-primary">
                See research materials
              </Link>
              <Link href="/research/quality" className="btn btn-secondary">
                Quality standards
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

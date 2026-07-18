import { Link } from "wouter";
import { FlaskConical, Layers3, ShieldCheck } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { useResearch } from "../core";
import { ProductCard } from "../components";

const CATEGORY_CARDS = [
  {
    title: "Research peptides",
    href: "/research/peptides",
    kicker: "Laboratory research",
    body: "A controlled catalog of research materials with product specifications, batch documentation, and account-based access.",
  },
  {
    title: "Quantum",
    href: "/research/quantum",
    kicker: "The foundational platform",
    body: "Explore Quantum as a standalone research product and as a separate component within the broader xenios ecosystem.",
  },
  {
    title: "Supplements",
    href: "/research/supplements",
    kicker: "Daily foundations",
    body: "Premium nutrition products selected for ingredient quality, transparent sourcing, and practical routines.",
  },
  {
    title: "Programs",
    href: "/research/programs",
    kicker: "Human-led support",
    body: "Training, nutrition, accountability, and education delivered as real programs with independent value.",
  },
];

const STANDARDS = [
  { icon: FlaskConical, title: "Evidence", body: "Every listing distinguishes approved products, human evidence, preclinical research, and unresolved questions." },
  { icon: Layers3, title: "Sourcing", body: "Origin, manufacturer, fill and finish, storage, testing laboratory, and chain of custody stay visible internally and publish only when verified." },
  { icon: ShieldCheck, title: "Verification", body: "Batch-specific identity, purity, assay, and other required quality evidence must be reviewed before a product becomes live." },
];

export default function Overview() {
  const { products } = useResearch();
  const featured = products.filter((product) => product.featured).slice(0, 6);

  return (
    <>
      <SeoHead title="xenios research" description="A premium destination for research compounds, Quantum, supplements, structured programs, quality documentation, and professional access." path="/research" />

      <section className="container-x" style={{ paddingTop: 72, paddingBottom: 48 }}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-12 items-start">
          <div>
            <p className="mono-cap text-pulse mb-6">Research. Foundations. Human support.</p>
            <h1 className="display-l text-balance max-w-[16ch]">Built beyond a peptide storefront.</h1>
            <p className="mt-8 body-l text-ink-2 max-w-[58ch]">
              A premium destination for research compounds, Quantum, foundational supplements, and structured programs. Each category stands on its own. Together, they create a broader xenios platform.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link href="/research/shop" className="btn btn-primary">Explore the catalog</Link>
              <Link href="/research/build-a-system" className="btn btn-ghost">Build a system</Link>
            </div>
          </div>
          <aside className="card">
            <p className="mono-cap text-ink-mute mb-3">One destination, separate lanes</p>
            <h2 className="h3 mb-3">Clear products. Clear purpose.</h2>
            <p className="body-s text-ink-2">
              Research materials use an account-gated research experience. Supplements and programs remain separate consumer offerings. Quantum has its own standalone page and research access path.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-4">
              {[
                ["4", "core categories"],
                ["2", "commerce lanes"],
                ["1", "premium platform"],
              ].map(([value, label]) => (
                <div key={label}>
                  <p className="counter-bignum text-3xl">{value}</p>
                  <p className="mono-label text-ink-mute mt-1">{label}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <p className="mono-cap text-ink-mute mb-5">Shop the platform</p>
            <h2 className="display-s max-w-[18ch]">Four ways into the ecosystem.</h2>
          </div>
          <p className="body-m text-ink-mute max-w-[46ch]">
            The architecture gives customers a clear path without collapsing research materials, consumer products, and human-led programs into one confusing offer.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CATEGORY_CARDS.map((card) => (
            <Link key={card.href} href={card.href} className="card block hover:border-[color:var(--ink)] transition-colors" data-testid={`card-category-${card.title.replace(/[^a-z]+/gi, "-").toLowerCase()}`}>
              <p className="mono-cap text-pulse mb-3">{card.kicker}</p>
              <h3 className="h3 mb-3">{card.title}</h3>
              <p className="body-s text-ink-2">{card.body}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-5">The xenios standard</p>
        <h2 className="display-s max-w-[22ch]">A product should earn its place.</h2>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          {STANDARDS.map(({ icon: Icon, title, body }) => (
            <div className="card" key={title}>
              <Icon size={22} aria-hidden="true" className="text-pulse" />
              <h3 className="h3 mt-5 mb-3">{title}</h3>
              <p className="body-s text-ink-2">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Link href="/research/quality" className="btn btn-secondary">Explore quality standards</Link>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="container-x section-y rule-top">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
            <div>
              <p className="mono-cap text-ink-mute mb-5">Featured</p>
              <h2 className="display-s max-w-[20ch]">Start with the core platform.</h2>
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

      <section className="container-x section-y rule-top">
        <div className="card bg-paper-2 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center" style={{ padding: "clamp(28px, 5vw, 56px)" }}>
          <div>
            <p className="mono-cap text-ink-mute mb-4">A broader offer</p>
            <h2 className="display-s max-w-[18ch]">Research is one part of the relationship.</h2>
          </div>
          <div>
            <p className="body-l text-ink-2">
              Pair a premium storefront with real programming, education, customer support, and repeatable routines. Keep every offer independent, clear, and worth purchasing on its own.
            </p>
            <ul className="mt-6 space-y-2">
              {[
                "Quantum can be requested as a standalone research product.",
                "Supplements can be purchased independently or as part of a consumer routine.",
                "Programs remain human-led and separate from research materials.",
                "Research and consumer carts check out separately.",
              ].map((item) => (
                <li key={item} className="body-s text-ink-2 flex gap-3">
                  <span aria-hidden="true" className="bg-orange-fire shrink-0 mt-2" style={{ width: 6, height: 6, borderRadius: 9999 }} />
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/research/build-a-system" className="btn btn-primary mt-8">Build a system</Link>
          </div>
        </div>
      </section>
    </>
  );
}

import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import EcosystemMarquee from "@/components/EcosystemMarquee";
import { PAGES, ECOSYSTEM_CATEGORIES, ALL_ECOSYSTEM_NAMES } from "@/lib/content";

export default function Ecosystem() {
  return (
    <PageShell>
      <SeoHead title={PAGES.ecosystem.title} description={PAGES.ecosystem.description} canonical="/ecosystem" />
      <section className="grad grad-02-tide section-y" data-testid="section-ecosystem-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">ECOSYSTEM</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "24ch" }}>
            Designed to connect to every dot.
          </h1>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">
            {ALL_ECOSYSTEM_NAMES.length}+ brands across {ECOSYSTEM_CATEGORIES.length} categories of the proactive health stack. Below is the design intent.
          </p>
        </div>
      </section>

      <section className="bg-paper-2 section-y rule-y">
        <EcosystemMarquee rows={2} />
      </section>

      <section className="bg-paper section-y" data-testid="section-ecosystem-categories">
        <div className="container-x space-y-10">
          {ECOSYSTEM_CATEGORIES.map((c, i) => (
            <article key={i} className="rule-bottom pb-8" data-testid={`category-${i}`}>
              <p className="mono-cap text-pulse mb-3">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="h1 text-ink">{c.name}</h2>
              <div className="mt-5 flex flex-wrap gap-2">
                {c.brands.map((b) => (
                  <span key={b} className="chip" data-testid={`brand-${b.replace(/\s+/g, "-")}`}>{b}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-paper section-y">
        <div className="container-x">
          <p className="body-s text-ink-mute max-w-3xl" data-testid="text-ecosystem-disclaimer">
            Brand names listed above are property of their respective owners. xenios is not affiliated with any of the named platforms. Mention indicates design intent and target compatibility, not commercial partnership or endorsement. Integration availability varies by region, regulation, and third-party API access.
          </p>
        </div>
      </section>
    </PageShell>
  );
}
